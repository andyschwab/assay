// sweep-method.mjs — re-measure before re-run (#324): whether a sweep set's stored runs can be
// re-measured under the current engine, or which of its passes must be re-run.
//
// A sweep set is pinned to `method_commit`, the engine whose method its lanes ran under
// (tests/sweeps/README.md). What variance computes from the stored runs (the four figures, the
// yardstick's rows, the triage closures) is the measure; what a pass records is the method. A
// change that moves only the measure is applied by re-measuring the stored runs, with no session
// (#312 re-measured every committed set that way). A sweep is re-run only when the text a pass
// records under moved. That text, and nothing else, is:
//   - map/METHOD.md's pass sections: "Ground rules", "Pass 0 — …", the "Passes 1–7" introduction
//     up to "Pass 1", and each "Pass <n> — …" (each section from its heading to the next heading
//     of its level or above, map/passes.mjs);
//   - the map/SCHEMA.md sections map/passes.yaml names (each pass's `schema:`), by number;
//   - map/passes.yaml, read as data: each pass's entry (its decides, context, discovery and
//     schema), so a comment that moves changes no pass.
// The rule names which passes moved: the ground rules, Pass 0 and the introduction are every
// pass's, a pass's own section and its map entry are that pass's, and a SCHEMA.md section is
// the passes whose `schema:` names it. A pass whose text did not move records what it recorded,
// so its stored output stands.
//
// methodMoves is the pure half (two snapshots of the three files → the verdict); checkMethod
// reads the snapshots from git: the set's method_commit and HEAD. A method_commit the clone does
// not hold is never guessed at: checkMethod throws, naming it.
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePasses, sectionByTitle, sectionByNumber, passesIntro } from './passes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PASS_RECORDING = { method: 'map/METHOD.md', schema: 'map/SCHEMA.md', passes: 'map/passes.yaml' };

const passesOf = (text) => { try { return text === null ? null : parsePasses(text); } catch { return null; } };
const entry = (p) => JSON.stringify({ id: p.id, pass: p.pass, dimension: p.dimension, decides: p.decides, context: p.context, discovery: p.discovery, schema: p.schema });

/** Two snapshots of the pass-recording files, { method, schema, passes } texts (null where the
 * file is absent), at the set's method commit and now → { verdict: 're-measure' | 're-run',
 * moved: [{ file, section, passes }], rerun: [pass ids] }.
 * @param {{ method: string|null, schema: string|null, passes: string|null }} then
 * @param {{ method: string, schema: string, passes: string }} now */
export function methodMoves(then, now) {
  const nowPasses = passesOf(now.passes);
  if (!nowPasses) throw new Error(`${PASS_RECORDING.passes} at HEAD has no passes: list`);
  const all = nowPasses.map((p) => String(p.id));
  const moved = [];
  const move = (file, section, passes) => moved.push({ file, section, passes });

  // map/passes.yaml, as data
  const thenPasses = passesOf(then.passes);
  if (!thenPasses) move(PASS_RECORDING.passes, then.passes === null ? 'the file (absent at the method commit)' : 'the file (no passes: list at the method commit)', all);
  else {
    const before = new Map(thenPasses.map((p) => [String(p.id), entry(p)]));
    if (thenPasses.length !== nowPasses.length || nowPasses.some((p) => !before.has(String(p.id)))) move(PASS_RECORDING.passes, 'the pass list', all);
    else for (const p of nowPasses) if (before.get(String(p.id)) !== entry(p)) move(PASS_RECORDING.passes, `pass ${p.id}`, [String(p.id)]);
  }

  // map/METHOD.md's pass sections
  const sec = (text, f) => (text === null ? null : f(text));
  const methodPieces = [
    ['Ground rules', (t) => sectionByTitle(t, 'Ground rules'), all],
    ['Pass 0', (t) => sectionByTitle(t, 'Pass 0 — '), all],
    ['Passes 1–7 (introduction)', (t) => passesIntro(t), all],
    ...nowPasses.map((p) => [`Pass ${p.pass}`, (t) => sectionByTitle(t, `Pass ${p.pass} — `), [String(p.id)]]),
  ];
  for (const [name, f, passes] of methodPieces) {
    const a = sec(then.method, f), b = sec(now.method, f);
    if (b === null) throw new Error(`${PASS_RECORDING.method} at HEAD has no section ${name}`);
    if (a !== b) move(PASS_RECORDING.method, a === null ? `${name} (absent at the method commit)` : name, passes);
  }

  // the map/SCHEMA.md sections map/passes.yaml names
  const numbers = [...new Set(nowPasses.flatMap((p) => p.schema))];
  for (const n of numbers) {
    const a = sec(then.schema, (t) => sectionByNumber(t, n)), b = sec(now.schema, (t) => sectionByNumber(t, n));
    if (b === null) throw new Error(`${PASS_RECORDING.schema} at HEAD has no section §${n}`);
    if (a !== b) move(PASS_RECORDING.schema, a === null ? `§${n} (absent at the method commit)` : `§${n}`, nowPasses.filter((p) => p.schema.includes(n)).map((p) => String(p.id)));
  }

  const rerun = all.filter((id) => moved.some((m) => m.passes.includes(id)));
  return { verdict: moved.length ? 're-run' : 're-measure', moved, rerun };
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const show = (root, ref, path) => { try { return git(root, ['show', `${ref}:${path}`]); } catch { return null; } };

/** The set's method commit against HEAD, in the git tree at root (the engine's own by default) →
 * methodMoves' result with { method_commit, head, others }: others counts the files that moved
 * outside the pass-recording ones. Throws when the commit is not in the clone's history.
 * @param {string} methodCommit @param {{ root?: string }} [opts] */
export function checkMethod(methodCommit, { root = ROOT } = {}) {
  let commit;
  try { commit = git(root, ['rev-parse', '--verify', '--quiet', `${methodCommit}^{commit}`]).trim(); } catch { commit = ''; }
  if (!commit) throw new Error(`method_commit ${methodCommit} is not in this clone's history, so what moved since cannot be read: fetch it (git fetch --unshallow, or fetch that commit) and check again`);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const now = { method: show(root, 'HEAD', PASS_RECORDING.method), schema: show(root, 'HEAD', PASS_RECORDING.schema), passes: show(root, 'HEAD', PASS_RECORDING.passes) };
  for (const [k, v] of Object.entries(now)) if (v === null) throw new Error(`${PASS_RECORDING[k]} is not at HEAD`);
  const then = { method: show(root, commit, PASS_RECORDING.method), schema: show(root, commit, PASS_RECORDING.schema), passes: show(root, commit, PASS_RECORDING.passes) };
  const r = methodMoves(then, /** @type {any} */ (now));
  const changed = git(root, ['diff', '--name-only', commit, 'HEAD']).split('\n').filter(Boolean);
  const others = changed.filter((f) => !Object.values(PASS_RECORDING).includes(f)).length;
  return { ...r, method_commit: commit, head, others };
}

/** The verdict as the variance command prints it. @param {ReturnType<typeof checkMethod>} r */
export function methodLines(r) {
  const at = `${r.method_commit.slice(0, 7)} → HEAD ${r.head.slice(0, 7)}`;
  if (r.verdict === 're-measure') return [
    `re-measure (${at}): nothing a pass records moved (map/METHOD.md's pass sections, the map/SCHEMA.md sections map/passes.yaml names, map/passes.yaml's passes); ${r.others} other file(s) moved, which change the measure, not the runs.`,
    '  The stored runs stand: measure them under the current engine (node assay.mjs variance --set <set>), with no session.',
  ];
  return [
    `re-run (${at}): what a pass records moved, so the runs it recorded no longer stand for this method.`,
    ...r.moved.map((m) => `  moved: ${m.file} ${m.section} (passes: ${m.passes.join(', ')})`),
    `  passes whose recorded text moved: ${r.rerun.join(', ')}.`,
  ];
}
