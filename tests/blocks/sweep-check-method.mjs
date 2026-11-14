// ── re-measure before re-run: a sweep set says which applies, by a stated rule (#324) ──
// A sweep set is pinned to method_commit, and tests/sweeps/README.md said to re-run it when
// METHOD.md or SCHEMA.md "changes what a pass records", with nothing that read whether they had.
// `variance --set <dir> --check-method` reads it (map/sweep-method.mjs): "re-measure" when no
// pass-recording text moved since the set's method_commit, "re-run" naming each piece that moved
// and the passes it is theirs when one did; a commit the clone does not hold is exit 2.
// Proven here in a scratch git history built from this tree's own three pass-recording files.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'sweep-check-method';

export async function run() {
  const fail = (m) => negFailures.push('sweep-check-method: ' + m);
  const M = await import('../../map/sweep-method.mjs');
  const { parsePasses } = await import('../../map/passes.mjs');
  if (typeof M.checkMethod !== 'function' || typeof M.methodMoves !== 'function') { fail('map/sweep-method.mjs must export checkMethod and methodMoves'); return; }

  const repo = mkdtempSync(join(tmpdir(), 'assay-check-method-'));
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=assay-test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q');
    mkdirSync(join(repo, 'map'));
    for (const f of ['map/METHOD.md', 'map/SCHEMA.md', 'map/passes.yaml']) writeFileSync(join(repo, f), readFileSync(join(ROOT, f), 'utf8'));
    writeFileSync(join(repo, 'README.md'), 'a target\n');
    git('add', '-A'); git('commit', '-q', '-m', 'the method a set ran under');
    const pinned = git('rev-parse', 'HEAD');
    const edit = (f, from, to) => { const p = join(repo, f); const s = readFileSync(p, 'utf8'); if (!s.includes(from)) throw new Error(`${f} has no ${JSON.stringify(from)}`); writeFileSync(p, s.replace(from, to)); git('add', '-A'); git('commit', '-q', '-m', `edit ${f}`); };

    // 1. a change outside the pass-recording text: the stored runs are re-measured
    edit('README.md', 'a target', 'a target, described');
    edit('map/METHOD.md', '## Feedback hook', '## Feedback hook (a section no pass opens on)');
    edit('map/passes.yaml', '# map/passes.yaml', '# map/passes.yaml (a comment, no pass entry)');
    let r = M.checkMethod(pinned, { root: repo });
    if (r.verdict !== 're-measure') fail(`a method commit that differs only outside the pass-recording text must read re-measure (got ${r.verdict}: ${JSON.stringify(r.moved)})`);
    if (r.rerun.length) fail(`re-measure names no pass to re-run (got ${r.rerun.join(', ')})`);
    if (!M.methodLines(r).join('\n').startsWith('re-measure')) fail('the printed verdict must open with "re-measure"');

    // 2. Pass 5's section moved: re-run, naming METHOD.md, the section and the delegation pass only
    edit('map/METHOD.md', '### Pass 5 — Delegation surface', '### Pass 5 — Delegation surface\n\nA sentence the delegation pass now reads.');
    r = M.checkMethod(pinned, { root: repo });
    if (r.verdict !== 're-run') fail(`a moved pass section must read re-run (got ${r.verdict})`);
    const m5 = r.moved.find((m) => m.file === 'map/METHOD.md' && m.section === 'Pass 5');
    if (!m5) fail(`re-run must name map/METHOD.md's Pass 5 as what moved (got ${JSON.stringify(r.moved)})`);
    if (JSON.stringify(r.rerun) !== JSON.stringify(['delegation'])) fail(`a moved Pass 5 section is the delegation pass's alone (got ${r.rerun.join(', ')})`);
    const lines = M.methodLines(r).join('\n');
    if (!/^re-run/.test(lines) || !/map\/METHOD\.md Pass 5/.test(lines)) fail(`the printed verdict must open with "re-run" and name map/METHOD.md Pass 5 (got ${lines.split('\n').slice(0, 3).join(' | ')})`);

    // 3. a SCHEMA.md section a pass opens on, and a pass's map entry, each move only their passes
    const at5 = git('rev-parse', 'HEAD');
    edit('map/SCHEMA.md', '### The effect descriptors, defined', '### The effect descriptors, defined\n\nA sentence §1 now carries.');
    r = M.checkMethod(at5, { root: repo });
    const every = parsePasses(readFileSync(join(repo, 'map/passes.yaml'), 'utf8')).map((p) => String(p.id));
    if (!r.moved.some((m) => m.file === 'map/SCHEMA.md' && m.section === '§1') || JSON.stringify(r.rerun) !== JSON.stringify(every))
      fail(`a moved SCHEMA.md §1, which every pass opens on, must re-run every pass (got ${JSON.stringify(r.moved)})`);
    const at1 = git('rev-parse', 'HEAD');
    edit('map/passes.yaml', 'property: change-demonstrable', 'property: change-demonstrated');
    r = M.checkMethod(at1, { root: repo });
    if (r.verdict !== 're-run' || JSON.stringify(r.rerun) !== JSON.stringify(['verification']) || !r.moved.some((m) => m.file === 'map/passes.yaml'))
      fail(`a moved pass entry in map/passes.yaml re-runs that pass alone, naming the file (got ${r.verdict}: ${JSON.stringify(r.moved)})`);

    // 4. a commit the clone does not hold is never guessed at
    let threw = null;
    try { M.checkMethod('0123456789abcdef0123456789abcdef01234567', { root: repo }); } catch (e) { threw = e.message; }
    if (!threw || !/not in this clone's history/.test(threw)) fail(`an unknown method_commit must throw naming it (got ${threw})`);
  } catch (e) {
    fail(`the scratch history could not be built or read: ${e.message}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }

  // the command: --check-method reads the set's method_commit; HEAD reads re-measure, an unknown one exit 2
  const set = join(HERE, 'tmp-sweep-check-method');
  rmSync(set, { recursive: true, force: true });
  try {
    cpSync(join(HERE, 'sweeps', 'fixture-notesbox'), set, { recursive: true });
    const meta = readFileSync(join(set, 'SWEEP.yaml'), 'utf8');
    const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const cli = (commit, ...extra) => {
      writeFileSync(join(set, 'SWEEP.yaml'), meta.replace(/^method_commit:.*$/m, `method_commit: "${commit}"`));
      return spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'variance', '--set', set, '--check-method', ...extra], { encoding: 'utf8' });
    };
    let c = cli(head, '--json');
    let j = null; try { j = JSON.parse(c.stdout); } catch { fail(`variance --check-method --json must print JSON (exit ${c.status}: ${(c.stdout + c.stderr).slice(0, 160)})`); }
    if (c.status !== 0 || !j || j.verdict !== 're-measure') fail(`a set pinned to HEAD must read re-measure (exit ${c.status}, ${j && j.verdict})`);
    c = cli(head);
    if (!/^re-measure/m.test(c.stdout)) fail(`variance --check-method must print the verdict (got ${c.stdout.slice(0, 160)})`);
    c = cli('0123456789abcdef0123456789abcdef01234567');
    if (c.status !== 2 || !/not in this clone's history/.test(c.stderr)) fail(`an unknown method_commit must exit 2 naming it (exit ${c.status}: ${c.stderr.slice(0, 160)})`);
  } finally {
    rmSync(set, { recursive: true, force: true });
  }
}
