// ── the routine's run states its target and its day, as `start`'s does (#283, #265) ──
// map/target-identity.mjs writes `identity:` and `drawn:` for `start` and the routine alike, so a
// routine's run is counted by the cross-run tally (`node assay.mjs candidates`) with no --target
// or --date. Pinned:
//  1. a one-job routine run (a steward's own terminal, no handoff) writes identity: (the
//     checkout's origin, userinfo stripped, and `.` at its top level) and drawn:, and
//     `candidates` counts the run with neither flag;
//  2. the two-job routine: the target step hands forward the identity it read, and the gate step
//     records that one, never its own checkout's and never a local path: a gate checkout whose
//     origin is a local mirror still records the target step's identity;
//  3. the handoff is the target job's output, and the target's code ran there after the identity
//     was read, so it is read as data: a handed-forward identity that is a local path, spans two
//     lines, or names another target than the gate's own checkout names is never recorded, and
//     the gate says why.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRoutine, runTargetSteps } from '../../routine/run.mjs';
import { scannersPath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'routine-states-target';

const REMOTE = 'https://example.org/fixtures/routine-target.git';

export async function run() {
  const fail = (m) => negFailures.push('routine-states-target: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-routine-states-target-'));
  const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const checkout = (name, origin) => {
    const dir = join(tmp, name);
    cpSync(join(HERE, 'instruments', 'fresh-clone-target'), dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.org', 'commit', '-qm', 'fixture');
    if (origin) git(dir, 'remote', 'add', 'origin', origin);
    return dir;
  };
  const stated = (runDir) => (existsSync(scannersPath(runDir)) ? parseYaml(readFileSync(scannersPath(runDir), 'utf8')) : {});
  try {
    // (1) one job: the routine reads the identity of the checkout it measures
    const repo = checkout('repo', 'https://someone:planted-not-a-token@example.org/fixtures/routine-target.git');
    const one = join(tmp, 'run-one');
    const r = runRoutine({ repoDir: repo, outDir: one }, () => {});
    if (!r.ok) fail(`the one-job routine over the fixture must succeed (exit ${r.exitCode})`);
    const m = stated(one);
    if (!m.identity || m.identity.repository !== REMOTE || m.identity.path !== '.') fail(`the routine writes identity: { repository, path }, userinfo stripped (got ${JSON.stringify(m.identity)})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.drawn))) fail(`the routine writes drawn:, the day it drew the run (got ${JSON.stringify(m.drawn)})`);
    if (existsSync(scannersPath(one)) && readFileSync(scannersPath(one), 'utf8').includes(tmp)) fail('the routine\'s run record names no local path');
    const c = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'candidates', one, '--json'], { encoding: 'utf8' });
    if (c.status !== 0) fail(`candidates counts a routine run with no --target or --date (exit ${c.status}): ${(c.stderr || '').trim().split('\n').slice(0, 3).join(' | ')}`);

    // (2) two jobs: the gate records the identity the target step read
    const handoff = join(tmp, 'handoff');
    runTargetSteps({ repoDir: checkout('target-job', REMOTE), handoffDir: handoff }, () => {});
    const gateRepo = checkout('gate-job', join(tmp, 'mirror.git'));   // a gate checkout whose origin is a local mirror
    const two = join(tmp, 'run-two');
    runRoutine({ repoDir: gateRepo, outDir: two, handoff }, () => {});
    const m2 = stated(two);
    if (!m2.identity || m2.identity.repository !== REMOTE || m2.identity.path !== '.') fail(`the gate step records the identity the target step read (got ${JSON.stringify(m2.identity)})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m2.drawn))) fail(`the gate step writes drawn: (got ${JSON.stringify(m2.drawn)})`);
    if (existsSync(scannersPath(two)) && readFileSync(scannersPath(two), 'utf8').includes(tmp)) fail('the gate step\'s run record names no local path');

    // (3) a handed-forward identity is data: a local path is never recorded
    const bad = join(tmp, 'handoff-bad');
    cpSync(handoff, bad, { recursive: true });
    const idFile = ['identity.json'].map((f) => join(bad, f)).find(existsSync);
    if (!idFile) fail('the target step hands its identity forward (identity.json in the handoff)');
    else {
      writeFileSync(idFile, JSON.stringify({ repository: join(tmp, 'somewhere'), path: '.' }) + '\n');
      const three = join(tmp, 'run-three');
      const logs = [];
      runRoutine({ repoDir: gateRepo, outDir: three, handoff: bad }, (l) => logs.push(l));
      if (stated(three).identity) fail(`a handed-forward identity that is a local path is never recorded (got ${JSON.stringify(stated(three).identity)})`);
      if (!logs.some((l) => /states no identity/.test(l) && /local path/.test(l))) fail('the gate says why the run states no identity');

      // a well-formed identity spanning two lines is refused, never flattened into another one
      writeFileSync(idFile, JSON.stringify({ repository: `${REMOTE}\nengine: forged`, path: '.' }) + '\n');
      const four = join(tmp, 'run-four');
      runRoutine({ repoDir: gateRepo, outDir: four, handoff: bad }, () => {});
      if (stated(four).identity) fail(`a handed-forward identity spanning two lines is never recorded (got ${JSON.stringify(stated(four).identity)})`);

      // the target's code could rewrite the handoff: an identity naming another target than the
      // gate's own checkout is never recorded; the one that agrees is
      writeFileSync(idFile, JSON.stringify({ repository: 'https://example.org/someone-else/other.git', path: '.' }) + '\n');
      const gateOwn = checkout('gate-own', REMOTE);
      const five = join(tmp, 'run-five');
      const logs5 = [];
      runRoutine({ repoDir: gateOwn, outDir: five, handoff: bad }, (l) => logs5.push(l));
      if (stated(five).identity) fail(`a handed-forward identity naming another target than the gate's own checkout is never recorded (got ${JSON.stringify(stated(five).identity)})`);
      if (!logs5.some((l) => /states no identity/.test(l) && /gate's own checkout/.test(l))) fail('the gate says the handed-forward identity disagrees with its own checkout');
      const six = join(tmp, 'run-six');
      runRoutine({ repoDir: gateOwn, outDir: six, handoff }, () => {});
      if (stated(six).identity?.repository !== REMOTE) fail(`a handed-forward identity the gate's own checkout agrees with is recorded (got ${JSON.stringify(stated(six).identity)})`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
