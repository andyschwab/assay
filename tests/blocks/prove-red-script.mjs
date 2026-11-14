// ── red proofs are mechanical: the mutation list's script fails what proves nothing (#321) ──
// tests/prove-red.mjs breaks each core invariant in the source and requires its named check to go
// red with the mutation and green without it. This block holds the script itself, over a planted
// tree (a scratch copy of this one, with a planted rule and planted checks), never this tree:
//   (a) an entry whose check goes red with its mutation, for its own reason, and green without
//       it, holds;
//   (b) an entry whose check stays green with the mutation applied fails the script;
//   (c) an entry whose `from` occurs twice, or nowhere, fails the script, and its check never runs;
//   (d) an entry whose check goes red, but on no failure line its `red` matches, fails the script;
//   (e) the verdict is one line naming every entry that did not hold, and a list with none fails;
//   (f) a finished run, and a run killed mid-entry (SIGKILL, and SIGTERM), leave the tree it proves unchanged: the
//       mutation is applied in a scratch copy, never in the tree; SIGTERM also removes the copy;
//   (g) the list itself: every entry names a check that is a block, and the first set of #321
//       is on it;
//   (h) the landing rule: CLAUDE.md and CONTRIBUTING.md say an assertion holding a core invariant
//       lands with its entry, and keep the "confirmed red" line for the rest; tests/README.md
//       states the known cost (an entry is pinned to code text: re-pinning it is a reviewed diff,
//       never a regression).
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { ENTRIES, proveRed, scratchCopy } from '../prove-red.mjs';

export const label = 'prove-red-script';

const RULE = 'export const holds = true;\n';
const block = (name, body) => `import { negFailures } from '../harness.mjs';\nexport const label = '${name}';\nexport async function run() {\n${body}\n}\n`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run() {
  const fail = (m) => negFailures.push('prove-red-script: ' + m);
  const root = scratchCopy(ROOT, 'assay-prove-red-planted-');
  const marker = join(tmpdir(), `assay-prove-red-marker-${process.pid}`);
  try {
    // the planted tree: a rule, the check that holds it, a check that holds nothing, and a slow check
    mkdirSync(join(root, 'planted'), { recursive: true });
    writeFileSync(join(root, 'planted', 'rule.mjs'), RULE);
    writeFileSync(join(root, 'planted', 'twice.mjs'), 'export const a = 1;\nexport const b = 1; // a = 1;\n');
    writeFileSync(join(root, 'tests', 'blocks', 'planted-holds.mjs'), block('planted-holds',
      "  const { holds } = await import('../../planted/rule.mjs');\n  if (holds !== true) negFailures.push('planted-holds: the planted rule no longer holds');"));
    writeFileSync(join(root, 'tests', 'blocks', 'planted-green.mjs'), block('planted-green', '  // holds nothing: it never fails'));
    writeFileSync(join(root, 'tests', 'blocks', 'planted-slow.mjs'), block('planted-slow',
      `  const { writeFileSync } = await import('node:fs');\n  writeFileSync(${JSON.stringify(marker)}, String(process.pid));\n  await new Promise((r) => setTimeout(r, 20000));`));
    const entry = (over) => ({ rule: 'the planted rule holds', file: 'planted/rule.mjs', from: 'holds = true', to: 'holds = false', check: 'planted-holds', red: /the planted rule no longer holds/, ...over });

    // (a)–(e)
    const cases = [
      ['holds', entry({}), null],
      ['green', entry({ rule: 'a check that holds nothing', check: 'planted-green' }), /planted-green stays green with the rule broken/],
      ['twice', entry({ rule: 'from occurs twice', file: 'planted/twice.mjs', from: 'a = 1;' }), /from occurs 2 times in planted\/twice\.mjs/],
      ['nowhere', entry({ rule: 'from occurs nowhere', from: 'holds = maybe' }), /from occurs nowhere in planted\/rule\.mjs/],
      ['reason', entry({ rule: 'red for another reason', red: /some other failure/ }), /went red with the mutation, but not for its own reason/],
    ];
    const { results, ok, line } = await proveRed(cases.map((c) => c[1]), { root, jobs: 3 });
    cases.forEach(([name, , why], i) => {
      const r = results[i];
      if (!why && !r.ok) fail(`(a) an entry whose check is red with its mutation and green without it holds (got ${r.why})`);
      if (why && (r.ok || !why.test(r.why || ''))) fail(`(${name === 'green' ? 'b' : name === 'reason' ? 'd' : 'c'}) the planted entry "${name}" must fail the script, matching ${why} (got ${r.ok ? 'it held' : r.why})`);
    });
    if (ok) fail('(e) a list with an entry that did not hold must fail the script');
    if (!/^✗ assay prove-red: 4 of 5 entries did not hold: /.test(line) || line.includes('\n') || ['green', 'twice', 'nowhere', 'another reason'].some((w) => !line.includes(w))) fail(`(e) the verdict is one line naming every entry that did not hold (got ${line})`);
    const alone = await proveRed([entry({})], { root, jobs: 1 });
    if (!alone.ok || !/^✓ assay prove-red: all 1 entries hold/.test(alone.line)) fail(`(e) a list whose every entry holds passes on one ✓ line (got ${alone.line})`);
    const none = await proveRed([], { root });
    if (none.ok || !/^✗ assay prove-red: the list holds no entry/.test(none.line)) fail(`(e) an empty list proves nothing and fails (got ${none.line})`);

    // (f) a finished run leaves the tree it proves as it was; then, killed mid-entry, whatever signal
    // stops it, the tree is unchanged too
    if (readFileSync(join(root, 'planted', 'rule.mjs'), 'utf8') !== RULE) { fail('(f) a finished run left a mutation in the tree it proves'); writeFileSync(join(root, 'planted', 'rule.mjs'), RULE); }
    const drive = join(root, 'planted', 'drive.mjs');
    writeFileSync(drive, `import { proveRed } from '../tests/prove-red.mjs';\nawait proveRed([{ rule: 'slow', file: 'planted/rule.mjs', from: 'holds = true', to: 'holds = false', check: 'planted-slow', red: /x/ }], { root: ${JSON.stringify(root)} });\n`);
    const status = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
    const before = status();
    for (const sig of ['SIGKILL', 'SIGTERM']) {
      rmSync(marker, { force: true });
      const copiesBefore = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('assay-prove-red-') && !n.startsWith('assay-prove-red-planted-') && !n.startsWith('assay-prove-red-marker-')));
      const child = spawn(process.execPath, [drive], { cwd: root, stdio: 'ignore' });
      const exited = new Promise((r) => child.on('close', r));
      for (let i = 0; i < 300 && !existsSync(marker); i++) await sleep(100);   // the check is running, the mutation applied
      if (!existsSync(marker)) { fail(`(f) the planted slow check never started (${sig})`); child.kill('SIGKILL'); await exited; continue; }
      child.kill(sig);
      await exited;
      try { process.kill(Number(readFileSync(marker, 'utf8')), 'SIGKILL'); } catch { /* already gone */ }
      if (readFileSync(join(root, 'planted', 'rule.mjs'), 'utf8') !== RULE) fail(`(f) a run stopped by ${sig} mid-entry left the mutation in the tree it proves`);
      if (status() !== before) fail(`(f) a run stopped by ${sig} mid-entry changed the tree it proves (git status before:\n${before}after:\n${status()})`);
      if (sig === 'SIGTERM') {
        const left = readdirSync(tmpdir()).filter((n) => n.startsWith('assay-prove-red-') && !n.startsWith('assay-prove-red-planted-') && !n.startsWith('assay-prove-red-marker-') && !copiesBefore.has(n));
        if (left.length) fail(`(f) a run stopped by SIGTERM removes its scratch copy (left ${left.join(', ')})`);
      }
    }
    for (const n of readdirSync(tmpdir()).filter((x) => x.startsWith('assay-prove-red-'))) {   // what SIGKILL could not clean, this block's own only
      const p = join(tmpdir(), n);
      try { if (existsSync(join(p, 'planted', 'drive.mjs'))) rmSync(p, { recursive: true, force: true }); } catch { /* another run's */ }
    }

    // (g) the list
    const blocks = new Set(readdirSync(join(HERE, 'blocks')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)));
    for (const e of ENTRIES) if (!blocks.has(e.check)) fail(`(g) the entry "${e.rule}" names ${e.check}, which is no block`);
    for (const [what, re] of [['not measured never reads met', /not measured never reads met/], ['an unmapped category halts the projection', /unmapped category halts/],
      ['no confidence value without its rule', /no confidence value without its rule/], ['a known misfire never reads met', /known misfire never reads met/],
      ['the core names no scanner', /core names no scanner/], ['validate refuses a claim without file:line', /without file:line/],
      ["the sequence key's halt clause", /halt clause/], ['a threshold of 0 is refused', /threshold of 0 is refused/],
      ['a judgment never lowers consequence (#319)', /judgment never lowers consequence/]])
      if (!ENTRIES.some((e) => re.test(e.rule))) fail(`(g) the list must hold an entry for ${what} (#321)`);

    // (h) the landing rule, and the known cost
    const flat = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\s+/g, ' ');
    for (const f of ['CLAUDE.md', 'CONTRIBUTING.md']) {
      const t = flat(f);
      if (!/core invariant lands with its entry in `tests\/prove-red\.mjs`/.test(t)) fail(`(h) ${f} must say an assertion holding a core invariant lands with its entry in tests/prove-red.mjs`);
      if (!/confirmed red/.test(t)) fail(`(h) ${f} keeps the "confirmed red" line for assertions the list does not cover`);
    }
    const readme = flat('tests/README.md');
    if (!/## Red proofs/.test(readme) || !/pinned to code text/.test(readme) || !/reviewed diff[^.]*never a regression/.test(readme)) fail('(h) tests/README.md must state the known cost: an entry is pinned to code text, and re-pinning it is a reviewed diff, never a regression');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
}
