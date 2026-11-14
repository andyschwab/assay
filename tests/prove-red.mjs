#!/usr/bin/env node
// prove-red.mjs — red proofs are mechanical (#321): each core invariant has a mutation that
// breaks it in the source, and its named check must go red with the mutation and green without.
//
// "Red, then green" (CLAUDE.md, "How a change lands") asks a contributor to revert the rule an
// assertion pins and see it fail. Said once in a commit message, nothing re-checks it, so an
// assertion whose rule moved or whose fixture drifted stays green and proves nothing. This list
// re-checks it on every gate. Each entry is { rule, file, from, to, check, red }:
//   rule   the invariant, in words;
//   file   the source file that holds it, relative to the tree's root;
//   from   text that occurs in that file EXACTLY once: the rule, as code;
//   to     what it becomes with the rule broken;
//   check  the one harness block (tests/blocks/<check>.mjs) that holds the invariant, run alone;
//   red    a pattern one of the check's failure lines matches with the mutation applied, so the
//          check is seen red for its own reason, never for a mutation that only broke an import.
// For each entry, in a scratch copy of the tree (never the tree itself, so a run killed mid-entry
// leaves the tree as it was):
//   1. `from` must occur exactly once (an entry pinned to code that moved is itself a failure);
//   2. with `to` in its place, the check must fail, one failure line matching `red`;
//   3. with the file restored, the check must pass.
// It ends in one verdict line naming every entry that did not hold, and exits 1 when one did not.
// Entries run in parallel, each in its own copy; an entry whose check is on the harness's closed
// list (tests/regression.mjs CLOSED) runs alone, nothing beside it.
//
// The known cost (tests/README.md, "Red proofs"): an entry is pinned to code text, so a change
// to the code it names fails its entry. Re-pinning it is a reviewed diff, never a regression.
//
// Usage:
//   node tests/prove-red.mjs              every entry; exit 1 if any did not hold
//   node tests/prove-red.mjs --jobs N     at most N entries at once (default: the harness's)
//   node tests/prove-red.mjs --only <check>[,<check>]   the entries of these checks only
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, mkdtempSync, existsSync, symlinkSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));   // tests/
export const ROOT = join(HERE, '..');

// ── the list ────────────────────────────────────────────────────────────────
// A new assertion that holds a core invariant lands with its entry here (CONTRIBUTING.md).
export const ENTRIES = [
  { rule: 'not measured never reads met: an instrument row whose scanner the run record says did not run reads not measured',
    file: 'yardstick/measure.mjs',
    from: "if (dp.status !== 'ran') return row('not-measured', 'instrument', [],",
    to: "if (dp.status !== 'ran') return row('met', 'instrument', [],",
    check: 'yardstick-register', red: /an instrument recorded as skipped must read not-measured/ },
  { rule: 'an unmapped category halts the projection',
    file: 'map/project.mjs',
    from: "if (!m) { unmapped.push({ id: f.id, cat: `${src}:${cat}` }); continue; }",
    to: 'if (!m) { continue; }',
    check: 'fail-closed', red: /did not flag an unmapped native category/ },
  { rule: 'no confidence value without its rule: when no rule fires, confidenceOf throws',
    file: 'map/confidence.mjs',
    from: 'throw new Error(`no confidence rule applies to',
    to: "return { value: 'confirmed', rule: 'deterministic-instrument' }; throw new Error(`no confidence rule applies to",
    check: 'confidence-on-every-item', red: /no evidence kind must have no confidence/ },
  { rule: 'a known misfire never reads met: a gap row decides its instrument requirement, whatever its confidence',
    file: 'yardstick/measure.mjs',
    from: "if (gaps.length) return row(strengths.length && mixable(d) ? 'mixed' : 'unmet', 'instrument',",
    to: "if (gaps.length && false) return row(strengths.length && mixable(d) ? 'mixed' : 'unmet', 'instrument',",
    check: 'confidence-on-every-item', red: /misfire's requirement never reads met/ },
  { rule: 'the core names no scanner (CLAUDE.md rule 7)',
    file: 'map/project.mjs',
    from: "const src = f.source || 'practice-review';",
    to: "const src = f.source || 'deep-code-review';",
    check: 'core-names-no-scanner', red: /map\/project\.mjs names the scanner deep-code-review/ },
  { rule: 'validate refuses a claim without file:line evidence',
    file: 'map/validate.mjs',
    from: 'const CITE = /^(.*):(\\d+)(?:-(\\d+))?$/;',
    to: 'const CITE = /^(.*?)(?::(\\d+)(?:-(\\d+))?)?$/;',
    check: 'evidence-cites-file-line', red: /validate must refuse F-001, a bare file with no line/ },
  { rule: "the sequence key's halt clause leads: an item holding a halt comes before every other",
    file: 'views/improve/sequence.mjs',
    from: 'const KEY = (g, tiers) => [g.halt ? 0 : 1, g.cls,',
    to: 'const KEY = (g, tiers) => [g.cls, g.halt ? 0 : 1,',
    check: 'sequence-by-what-a-finding-is', red: /the unheld halt must be item 1/ },
  { rule: 'a sweep threshold of 0 is refused: it passes whatever the set measures (#326)',
    file: 'map/variance.mjs',
    from: 'if (thr[k] === 0) bad(',
    to: 'if (thr[k] === -1) bad(',
    check: 'sweep-not-measured', red: /a threshold of 0 on \w+, which the set measures: loadSweepSet must refuse it/ },
  { rule: "a judgment never lowers consequence: a lane's judgment below what the facts give is refused, recorded and never applied (#319)",
    file: 'map/consequence.mjs',
    from: 'if (higher(j.value, out.value)) {',
    to: 'if (j.value !== out.value) {',
    check: 'consequence-from-facts', red: /a judgment below the facts is refused and recorded/ },
  { rule: 'a scanner that did not run is recorded with a reason (CLAUDE.md rule 3): validate refuses a skip without one',
    file: 'map/validate.mjs',
    from: "if (row.status !== 'ran' && !(typeof row.reason === 'string' && row.reason.trim()))",
    to: "if (false && row.status !== 'ran' && !(typeof row.reason === 'string' && row.reason.trim()))",
    check: 'negative-fixtures', red: /manifest-skip-no-reason/ },
  { rule: 'an unvalued item has no quadrant: a quadrant would put a stake on it no fact gave (#319, slice 3)',
    file: 'views/improve/quadrants.mjs',
    from: 'if (cons === UNVALUED) return null;',
    to: "if (cons === UNVALUED) return { value: 'park', rule: 'low-stake-unconfirmed' };",
    check: 'quadrants-and-lenses', red: /the template expansion sits in no quadrant/ },
  { rule: 'a quadrant is a function of the two recorded values alone, never a number over the two scales (#319, slice 3)',
    file: 'views/improve/quadrants.mjs',
    from: 'const r = QUADRANT_RULES.find((x) => x.confidence.includes(conf) && x.consequence.includes(cons));',
    to: 'const r = QUADRANT_RULES[Math.min(QUADRANT_RULES.length - 1, CONFIDENCE.indexOf(conf) + CONSEQUENCE.indexOf(cons))];',
    check: 'quadrants-and-lenses', red: /by the two values alone/ },
  { rule: 'nothing is hidden by grouping: an item carries how many of its gaps hold each confidence (#319, slice 3)',
    file: 'views/improve/sequence.mjs',
    from: 'if (it.confidence) it.confidence.mix = mixOf(',
    to: 'if (false) it.confidence.mix = mixOf(',
    check: 'quadrants-and-lenses', red: /keeps its worst gap's value and carries its mix/ },
  { rule: 'an unvalued finding its source labels Blocker or Critical is named at the head of the not-valued list, never counted silently (#319, slice 3)',
    file: 'views/improve/sequence.mjs',
    from: 'if (g.consequence && g.consequence.value === UNVALUED && HEAD_LABELS.includes(g.label))',
    to: 'if (g.consequence && g.consequence.value === UNVALUED && HEAD_LABELS.includes(g.label) && false)',
    check: 'quadrants-and-lenses', red: /names the unvalued Blocker at the head of the not-valued list/ },
  { rule: "the order handed on is the lens's: under risk-first, the key's order grouped by quadrant (#319, slice 3)",
    file: 'views/improve/sequence.mjs',
    from: 'const { ordered: seq, leftOut } = applyLens(keyOrder, theLens);',
    to: 'const { leftOut } = applyLens(keyOrder, theLens); const seq = [...keyOrder];',
    check: 'quadrants-and-lenses', red: /under risk-first, sequence\.json is the key's order grouped/ },
  { rule: 'a lens file changed since the run record named it is refused (#319, slice 3)',
    file: 'views/improve/lens.mjs',
    from: 'if (l.sha256 !== rec.sha256) throw',
    to: 'if (false) throw',
    check: 'quadrants-and-lenses', red: /a lens file changed since the record named it is refused/ },
  { rule: 'a lens naming a quadrant outside the closed list refuses to load (#319, slice 3)',
    file: 'views/improve/lens.mjs',
    from: 'for (const q of l.quadrants) if (!QUADRANTS.includes(q)) e.push(',
    to: 'for (const q of l.quadrants) if (false) e.push(',
    check: 'quadrants-and-lenses', red: /a lens naming an unknown quadrant refuses to load/ },
  { rule: 'validate refuses a run record whose lens file changed since it was named, or whose lens record is malformed (#319, slice 3)',
    file: 'map/validate.mjs',
    from: 'if (m.lens !== undefined) {',
    to: 'if (false) {',
    check: 'quadrants-and-lenses', red: /validate refuses a run record whose lens file changed since it was named/ },
  { rule: 'a candidate in a test or fixture file is out of scope by construction: enumerate lists it under excluded and never offers it for triage (#315)',
    file: 'map/enumerate.mjs',
    from: 'const testReason = CANDIDATE_POPS.has(pop) ? testOrFixture(path) : null;',
    to: 'const testReason = null;',
    check: 'effect-scope-closed', red: /a write in a contract test must never be offered for triage/ },
  { rule: 'a candidate in a test or fixture file is never mapped in: validate refuses a triage that maps one a list still offers (#315)',
    file: 'map/effect-scope.mjs',
    from: 'if (mappedIn && testReason) return',
    to: 'if (false) return',
    check: 'effect-scope-closed', red: /a stored list that offers the contract test, mapped in: validate must refuse it/ },
  { rule: 'a workflow write is in scope by construction: validate refuses triaging one out of scope (#315)',
    file: 'map/effect-scope.mjs',
    from: "if (!mappedIn && kindOf(candidate) === 'workflow') return",
    to: 'if (false) return',
    check: 'effect-scope-closed', red: /a workflow write triaged out of scope \(version 1\): validate must refuse it/ },
  { rule: "a lane never triages against a clause that holds: a route whose method writes is decided by route-method-writes (#315)",
    file: 'map/effect-scope.mjs',
    from: "if (method && WRITE_METHODS.has(method) && clause !== 'route-method-writes') return",
    to: 'if (false) return',
    check: 'effect-scope-closed', red: /a POST route triaged out against route-method-writes: validate must refuse it/ },
  { rule: "a finding's gate_type and reversibility are what its candidates' answers give: validate refuses a value the answers do not give (#315)",
    file: 'map/effect-triage.mjs',
    from: '      if (said === want[field]) continue;',
    to: '      continue;',
    check: 'effect-answers-decide', red: /answers giving deterministic-halt beside gate_type none must fail validate/ },
  { rule: 'an answer of yes or no carries its file:line evidence: validate refuses one with none (#315)',
    file: 'map/effect-answers.mjs',
    from: 'if (!Array.isArray(a.evidence) || !a.evidence.length) errors.push',
    to: 'if (!Array.isArray(a.evidence) || !a.evidence.length) [].push',
    check: 'effect-answers-decide', red: /a no with no evidence must be refused/ },
  { rule: "gate_type follows from the answers by #302's order: a check the repository's code holds gives deterministic-halt (#315)",
    file: 'map/effect-answers.mjs',
    from: "  if (yes(answers, 'refuses_unless') && answers.refuses_unless.held_by === 'code') return 'deterministic-halt';",
    to: '  // the code-held check, removed',
    check: 'effect-answers-decide', red: /case 1: the answers must give gate_type deterministic-halt/ },
  { rule: 'lanes are compared on their answers: a candidate every sweep answers takes gate_type and reversibility from its answers, not its finding as written (#315)',
    file: 'map/variance.mjs',
    from: 'return [i, answered ? { ...t, gate_type: gateTypeFrom(p.answers.get(c)), reversibility: reversibilityFrom(p.answers.get(c)) } : t];',
    to: 'return [i, t];',
    check: 'answer-agreement', red: /two runs whose answers agree read as agreeing/ },
];

// ── the scratch copy ────────────────────────────────────────────────────────
// A copy of `root` as git sees it: every tracked and untracked file git does not ignore (as
// harness.mjs repoFiles reads it), over a clone that shares root's history, so a check reads the
// same files, the same `git ls-files` and the same log. node_modules is linked, never copied.
export function scratchCopy(root, prefix = 'assay-prove-red-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    execFileSync('git', ['clone', '-q', '--shared', '--no-checkout', root, dir], { stdio: 'ignore' });
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\0').filter((f) => f && !f.endsWith('/'));
    for (const f of files) {
      let st; try { st = statSync(join(root, f)); } catch { continue; }   // deleted in the tree, or gone mid-copy
      if (!st.isFile()) continue;
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(root, f), join(dir, f));
    }
    execFileSync('git', ['reset', '-q'], { cwd: dir, stdio: 'ignore' });   // the index at HEAD; the files as the tree has them
    if (existsSync(join(root, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return dir;
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
}

// Run one block alone in `dir` (tests/block-child.mjs, as the parallel runner does) and return
// { failures, threw }: the block's failure lines, and what it threw or why its process ended
// without reporting.
export function runCheck(dir, check, { timeoutMs = 10 * 60_000, env = process.env } = {}) {
  return new Promise((done) => {
    const block = join(dir, 'tests', 'blocks', `${check}.mjs`);
    if (!existsSync(block)) { done({ failures: [], threw: `no block tests/blocks/${check}.mjs` }); return; }
    const out = `${dir}.${check}-${Math.random().toString(36).slice(2)}.json`;   // beside the copy, never in it: a whole-tree check reads the copy
    const child = spawn(process.execPath, [join(dir, 'tests', 'block-child.mjs'), block], {
      cwd: dir, env: { ...env, ASSAY_BLOCK_OUT: out, ASSAY_BLOCK_ROOT: dir, ASSAY_BLOCK_ROWS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    live.add(child);
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer); live.delete(child);
      let r = null;
      try { r = JSON.parse(readFileSync(out, 'utf8')); } catch { /* reported below */ }
      rmSync(out, { force: true });
      if (!r) { done({ failures: [], threw: `its process ended (${signal || `exit ${code}`}) before it reported: ${text.trim().split('\n').slice(-2).join(' ')}` }); return; }
      done({ failures: r.failures || [], threw: r.threw || null });
    });
  });
}

const occurrences = (text, s) => { let n = 0, i = -1; while ((i = text.indexOf(s, i + 1)) !== -1) n++; return n; };
const short = (s, n = 160) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// The scratch copies alive now and the checks running in them, removed and killed on an
// interrupt so a stopped run leaves nothing behind it; the tree itself is never written.
const scratches = new Set(), live = new Set();
let trapped = false;
function trap() {
  if (trapped) return; trapped = true;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => {
    for (const c of live) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
    for (const d of scratches) rmSync(d, { recursive: true, force: true });
    process.exit(130);
  });
}

// One entry → { entry, ok, why }: why names the step that did not hold.
export async function proveEntry(entry, { root = ROOT, timeoutMs, env } = {}) {
  const bad = (why) => ({ entry, ok: false, why });
  for (const k of ['rule', 'file', 'from', 'to', 'check']) if (typeof entry[k] !== 'string' || !entry[k]) return bad(`${k} must be a non-empty string`);
  if (!(entry.red instanceof RegExp)) return bad('red must be a pattern a failure line of the check matches');
  if (entry.from === entry.to) return bad('to is from: the mutation changes nothing');
  const src = join(root, entry.file);
  if (!existsSync(src)) return bad(`${entry.file} does not exist`);
  const text = readFileSync(src, 'utf8');
  const n = occurrences(text, entry.from);
  if (n !== 1) return bad(`from occurs ${n === 0 ? 'nowhere' : `${n} times`} in ${entry.file}; an entry's from occurs exactly once (re-pin it to the code as it now stands: a reviewed diff)`);
  trap();
  const dir = scratchCopy(root);
  scratches.add(dir);
  try {
    const at = join(dir, entry.file);
    writeFileSync(at, text.replace(entry.from, () => entry.to));
    const mutated = await runCheck(dir, entry.check, { timeoutMs, env });
    if (!mutated.failures.length && !mutated.threw) return bad(`${entry.check} stays green with the rule broken: it proves nothing about it`);
    if (!mutated.failures.some((f) => entry.red.test(f))) {
      const got = mutated.threw ? `it threw: ${short(mutated.threw)}` : `its failures: ${short(mutated.failures.join(' | '))}`;
      return bad(`${entry.check} went red with the mutation, but not for its own reason (no failure matches ${entry.red}; ${got})`);
    }
    writeFileSync(at, text);
    const restored = await runCheck(dir, entry.check, { timeoutMs, env });
    if (restored.failures.length || restored.threw) return bad(`${entry.check} is red without the mutation: ${short(restored.threw || restored.failures.join(' | '))}`);
    return { entry, ok: true, why: null, red: short(mutated.failures.find((f) => entry.red.test(f))) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    scratches.delete(dir);
  }
}

// Every entry, at most `jobs` at once; an entry whose check is on `closed` runs alone. Results
// come back in the list's order.
export async function proveRed(entries, { root = ROOT, jobs = defaultJobs(), closed = {}, timeoutMs, env, onResult = null } = {}) {
  const results = new Array(entries.length);
  let next = 0, running = 0, exclusive = false;
  await new Promise((finish) => {
    if (!entries.length) { finish(); return; }
    let done = 0;
    const tick = () => {
      while (next < entries.length && !exclusive && running < Math.max(1, jobs)) {
        const i = next, e = entries[i];
        const alone = typeof e?.check === 'string' && e.check in closed;
        if (alone && running > 0) return;
        next++; running++; if (alone) exclusive = true;
        proveEntry(e, { root, timeoutMs, env }).catch((err) => ({ entry: e, ok: false, why: `the script threw: ${short(err?.message || err)}` })).then((r) => {
          results[i] = r; running--; if (alone) exclusive = false; done++;
          onResult?.(r, i);
          if (done === entries.length) finish(); else tick();
        });
        if (alone) return;
      }
    };
    tick();
  });
  const failed = results.filter((r) => !r.ok);
  const line = !entries.length
    ? '✗ assay prove-red: the list holds no entry, so nothing was proved'
    : failed.length
      ? `✗ assay prove-red: ${failed.length} of ${entries.length} entries did not hold: ${failed.map((r) => `${r.entry?.check} (${short(r.entry?.rule, 70)}): ${r.why}`).join('; ')}`
      : `✓ assay prove-red: all ${entries.length} entries hold, each check red with its mutation and green without it (${entries.map((e) => e.check).join(', ')})`;
  return { results, ok: entries.length > 0 && !failed.length, line };
}

export const defaultJobs = () => {
  const n = Number(process.env.ASSAY_TEST_JOBS);
  return Number.isInteger(n) && n > 0 ? n : Math.max(1, availableParallelism());
};

const isMain = (() => { try { return resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
  const jobs = arg('--jobs') === undefined ? defaultJobs() : Number(arg('--jobs'));
  if (!Number.isInteger(jobs) || jobs < 1) { console.error('--jobs takes a whole number of entries at once, 1 or more'); process.exit(2); }
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  const entries = only ? ENTRIES.filter((e) => only.has(e.check)) : ENTRIES;
  const { CLOSED } = await import('./regression.mjs');
  const t0 = Date.now();
  const { ok, line } = await proveRed(entries, { jobs, closed: CLOSED,
    onResult: (r) => console.log(`${r.ok ? '✓' : '✗'} ${r.entry?.check}: ${r.entry?.rule}${r.ok ? `\n    red with its mutation: ${r.red}` : `\n    ${r.why}`}`) });
  console.log(`${line} [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
  process.exit(ok ? 0 : 1);
}
