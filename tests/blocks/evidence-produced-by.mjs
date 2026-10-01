// ── owner-evidence: produced_by, and the commit-existence gate (never pass by
// silence) — owner/evidence/README.md, map/repo-census.mjs, yardstick/requirements.yaml ─
// A transcript names who produced it (produced_by: ci needs run, produced_by: person
// needs by — by is already required unconditionally). Its commit must resolve in the
// checkout's history to PASS; a commit genuinely absent (a real, non-shallow history)
// is a GAP; a checkout that cannot say either way (no .git, or too shallow) reads
// NOT-MEASURED, never pass — and the requirement it decides reads not-measured too,
// through the same `-unverifiable` fact-row mechanism d-schema-versioned uses.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'evidence-produced-by';

export async function run() {
  const fail = (m) => negFailures.push('evidence-produced-by: ' + m);
  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  const BODY = '\nRan the backup restore procedure.\n\n```\n$ ./ops/restore.sh\ndone\n```\n\nVerified via row counts.\n';
  function writeTranscript(base, fm) {
    mkdirSync(join(base, 'ops', 'evidence'), { recursive: true });
    const lines = ['---'];
    for (const [k, v] of Object.entries(fm)) if (v !== undefined) lines.push(`${k}: ${v}`);
    lines.push('---');
    writeFileSync(join(base, 'ops', 'evidence', 'd-backup-restore-exercised.md'), lines.join('\n') + BODY);
  }
  const baseFm = { date: '2026-09-20', by: 'platform-eng', result: 'pass', backup: 'nightly', target: 'scratch', verified: 'row counts match' };
  const runCensus = (dir) => {
    const out = join(dir, 'rc.json');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), dir, '--out', out, '--as-of', '2026-09-28'], { stdio: 'pipe' }); } catch { /* gaps/not-measured expected */ }
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const evOf = (doc) => doc.checks.find((c) => c.name === 'evidence-d-backup-restore-exercised');

  // (a) a real, non-shallow git history: produced_by validation
  const tmp = join(HERE, 'tmp-evidence-produced-by'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: tmp, env: gitEnv });
  writeFileSync(join(tmp, 'README.md'), '# x\n');
  execFileSync('git', ['add', '-A'], { cwd: tmp, env: gitEnv });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp, env: gitEnv });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();

  writeTranscript(tmp, { descriptor: 'd-backup-restore-exercised', commit: sha, ...baseFm });
  let ev = evOf(runCensus(tmp));
  if (ev?.status !== 'gap' || !/produced_by .* is not ci\|person/.test(ev.observation || '')) fail(`no produced_by at all must gap (got ${ev?.status}/${ev?.observation})`);

  writeTranscript(tmp, { descriptor: 'd-backup-restore-exercised', produced_by: 'ci', commit: sha, ...baseFm });
  ev = evOf(runCensus(tmp));
  if (ev?.status !== 'gap' || !/produced_by: ci requires run/.test(ev.observation || '')) fail(`produced_by: ci with no run: must gap (got ${ev?.status}/${ev?.observation})`);

  writeTranscript(tmp, { descriptor: 'd-backup-restore-exercised', produced_by: 'ci', run: '"https://ci.example.test/runs/1"', commit: sha, ...baseFm });
  ev = evOf(runCensus(tmp));
  if (ev?.status !== 'pass') fail(`produced_by: ci WITH run: over a real, resolvable commit must pass (got ${ev?.status}/${ev?.observation})`);

  writeTranscript(tmp, { descriptor: 'd-backup-restore-exercised', produced_by: 'person', commit: sha, ...baseFm });
  ev = evOf(runCensus(tmp));
  if (ev?.status !== 'pass') fail(`produced_by: person (by already present) over a real, resolvable commit must pass (got ${ev?.status}/${ev?.observation})`);

  // (b) a commit that is NOT in this real, non-shallow history: a GAP, naming it
  writeTranscript(tmp, { descriptor: 'd-backup-restore-exercised', produced_by: 'person', commit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', ...baseFm });
  ev = evOf(runCensus(tmp));
  if (ev?.status !== 'gap' || !/is not in the repository's history/.test(ev.observation || '')) fail(`a commit absent from real, full history must gap, naming it (got ${ev?.status}/${ev?.observation})`);
  rmSync(tmp, { recursive: true, force: true });

  // (c) no .git at all: NOT-MEASURED, never pass, never a gap — an otherwise-complete
  // transcript whose checkout simply cannot verify the commit either way
  const tmpNoGit = join(HERE, 'tmp-evidence-no-git'); rmSync(tmpNoGit, { recursive: true, force: true }); mkdirSync(tmpNoGit, { recursive: true });
  writeTranscript(tmpNoGit, { descriptor: 'd-backup-restore-exercised', produced_by: 'person', commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', ...baseFm });
  const docNoGit = runCensus(tmpNoGit);
  const evNoGit = evOf(docNoGit);
  if (evNoGit?.status !== 'not-measured' || !/no history here to verify/.test(evNoGit.observation || '')) fail(`no .git at all must read not-measured, naming the reason (got ${evNoGit?.status}/${evNoGit?.observation})`);
  if (!docNoGit.checks.some((c) => c.status === 'gap')) fail('the fixture setup is wrong: this bare directory should still gap on unrelated checks (architecture-page etc.) for this test to distinguish not-measured from a gap');
  // through ingest + the yardstick: a FACT row in its own category, never the evidence
  // category itself, deciding the requirement not-measured, never met
  const rowsNoGit = convert('repo-census', JSON.stringify(docNoGit), docNoGit.exit);
  const factRow = rowsNoGit.find((r) => r.native_category === 'evidence-d-backup-restore-exercised-unverifiable');
  if (factRow?.polarity !== 'fact') fail(`the unverifiable commit must convert to a FACT row in its own category (got ${JSON.stringify(factRow)})`);
  if (rowsNoGit.some((r) => r.native_category === 'evidence-d-backup-restore-exercised')) fail('the evidence category itself must carry NO row when the commit could not be verified (real evidence there would govern instead)');
  const reg = loadYardstick();
  const backupReq = measureRun({ findings: rowsNoGit, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-backup-restore-exercised');
  if (backupReq?.status !== 'not-measured') fail(`d-backup-restore-exercised must read not-measured when the commit cannot be verified — NEVER met by silence (got ${backupReq?.status})`);
  const projUnver = projectMulti(rowsNoGit, adaptersOnce());
  if (projUnver.unmapped.length) fail(`the -unverifiable category must map (unmapped: ${projUnver.unmapped.map((u) => u.cat).join(', ')})`);
  rmSync(tmpNoGit, { recursive: true, force: true });

  // (d) a shallow clone: also not-measured, never a gap — a commit outside the
  // fetched depth is not proof the commit does not exist in the real history
  const shallowSrc = join(HERE, 'tmp-evidence-shallow-src'); rmSync(shallowSrc, { recursive: true, force: true }); mkdirSync(shallowSrc, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: shallowSrc, env: gitEnv });
  writeFileSync(join(shallowSrc, 'a.txt'), '1\n');
  execFileSync('git', ['add', '-A'], { cwd: shallowSrc, env: gitEnv });
  execFileSync('git', ['commit', '-q', '-m', 'first'], { cwd: shallowSrc, env: gitEnv });
  const oldSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: shallowSrc, encoding: 'utf8' }).trim();
  writeFileSync(join(shallowSrc, 'a.txt'), '2\n');
  execFileSync('git', ['add', '-A'], { cwd: shallowSrc, env: gitEnv });
  execFileSync('git', ['commit', '-q', '-m', 'second'], { cwd: shallowSrc, env: gitEnv });
  const shallowDir = join(HERE, 'tmp-evidence-shallow'); rmSync(shallowDir, { recursive: true, force: true });
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${shallowSrc}`, shallowDir], { env: gitEnv });
  writeTranscript(shallowDir, { descriptor: 'd-backup-restore-exercised', produced_by: 'person', commit: oldSha, ...baseFm });
  const evShallow = evOf(runCensus(shallowDir));
  if (evShallow?.status !== 'not-measured' || !/shallow checkout/.test(evShallow.observation || '')) fail(`a shallow checkout must read not-measured for a commit outside its depth, never a gap (got ${evShallow?.status}/${evShallow?.observation})`);
  rmSync(shallowSrc, { recursive: true, force: true });
  rmSync(shallowDir, { recursive: true, force: true });
}
