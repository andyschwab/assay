// ── routine --base-ref: a pull request is graded against the BASE branch's own
// packet/baseline.yaml, never the working tree it carries (routine/README.md) ──
// A real git repository: commit 1 carries a complete RUNBOOK.md (d-runbook reads
// met); a steward accepts that as the baseline (commit 2). The "pull request" then
// (uncommitted, on top of commit 2) deletes RUNBOOK.md AND loosens the working
// tree's own packet/baseline.yaml to no longer expect it met — if the routine read
// that working-tree copy, the loosened baseline would hide the regression; reading
// the base ref's copy instead must still catch it.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { catGitFile } from '../../yardstick/ratchet.mjs';
import { routinePath } from '../../lib/run-layout.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'routine-pr-baseline';

export async function run() {
  const fail = (m) => negFailures.push('routine-pr-baseline: ' + m);
  const tmp = join(HERE, 'tmp-routine-pr'); rmSync(tmp, { recursive: true, force: true });
  const repoDir = join(tmp, 'repo');
  mkdirSync(repoDir, { recursive: true });
  const git = (gitArgs) => spawnSync('git', gitArgs, { cwd: repoDir, encoding: 'utf8' });

  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({ name: 'pr-baseline-target', version: '0.0.0', private: true, scripts: { test: "node -e \"process.exit(0)\"", build: "node -e \"console.log('built')\"" } }, null, 2) + '\n');
  writeFileSync(join(repoDir, 'README.md'), '# pr-baseline-target\n\nA regression-only fixture; not a real package.\n');
  writeFileSync(join(repoDir, 'RUNBOOK.md'), [
    '# Runbook', '',
    '## Restart', 'Steps to restart the service.', '',
    '## Roll back', 'Steps to roll back a deploy.', '',
    '## Rotate a credential', 'Steps to rotate an API key or secret.', '',
    '## Restore from backup', 'Steps to restore data from backup.', '',
  ].join('\n'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['add', '-A']);
  let gc = git(['commit', '-q', '-m', 'initial']);
  if (gc.status !== 0) fail(`test setup: initial commit must succeed (${gc.stderr})`);

  const runDir1 = join(tmp, 'run1');
  let result1;
  try { result1 = runRoutine({ repoDir, outDir: runDir1 }, () => {}); }
  catch (e) { fail(`test setup: the first runRoutine (to seed a baseline) must not throw (${e.message})`); }
  const yardstick1 = existsSync(join(runDir1, 'yardstick.yaml')) ? parseYaml(readFileSync(join(runDir1, 'yardstick.yaml'), 'utf8')) : null;
  const runbookRow1 = yardstick1 && (yardstick1.requirements || []).find((r) => r.id === 'd-runbook');
  if (!runbookRow1 || runbookRow1.status !== 'met') fail(`test setup: d-runbook must read met with a complete RUNBOOK.md in place (got ${JSON.stringify(runbookRow1)})`);

  // routine.yaml, before any baseline exists: gate: skipped, and the checkout's
  // own commit recorded — this repo IS its own git root, unlike the offline
  // fixture above, so this pins that gitHead(repoDir) reads it (never a parent
  // repo's HEAD by git's own upward discovery, and never omitted).
  const headCommit1 = git(['rev-parse', 'HEAD']).stdout.trim();
  const routineFile1 = routinePath(runDir1);
  if (!existsSync(routineFile1)) fail('the seeding run must write routine.yaml before any baseline exists');
  else {
    const rec1 = parseYaml(readFileSync(routineFile1, 'utf8'));
    if (rec1.gate !== 'skipped') fail(`before a baseline is committed, routine.yaml must read gate: skipped (got ${JSON.stringify(rec1.gate)})`);
    if (rec1.commit !== headCommit1) fail(`routine.yaml must record the checkout's own HEAD sha (got ${JSON.stringify(rec1.commit)}, want ${headCommit1})`);
    if ('repository' in rec1) fail(`repository must be omitted when this fixture repo has no remote (got ${JSON.stringify(rec1.repository)})`);
  }

  mkdirSync(join(repoDir, 'packet'), { recursive: true });
  const baselineFile = join(repoDir, 'packet', 'baseline.yaml');
  let wb;
  try { wb = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runDir1, '--write-baseline', baselineFile, '--by', 'steward'], { stdio: 'pipe' }); }
  catch (e) { fail(`test setup: --write-baseline must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  git(['add', 'packet/baseline.yaml']);
  gc = git(['commit', '-q', '-m', 'a steward accepts the baseline']);
  if (gc.status !== 0) fail(`test setup: the baseline-acceptance commit must succeed (${gc.stderr})`);
  const baseCommit = git(['rev-parse', 'HEAD']).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) fail('test setup: could not resolve the base commit');

  // #48 (F-1205): a base ref that does not resolve (mistyped, never fetched) is a gate that
  // could not run — exit 1 with the reason — never "no baseline yet" and a green skip.
  {
    const runDirBadRef = join(tmp, 'run-bad-ref');
    const logsBad = [];
    let r;
    try { r = runRoutine({ repoDir, outDir: runDirBadRef, baseRef: 'origin/mian' }, (l) => logsBad.push(l)); }
    catch (e) { fail(`runRoutine with an unresolvable --base-ref must not throw (${e.message})`); }
    if (r && (r.ok || r.exitCode !== 1)) fail(`an unresolvable --base-ref must exit 1, never pass (got ok=${r.ok} exit=${r.exitCode}):\n${logsBad.join('\n')}`);
    const rec = existsSync(routinePath(runDirBadRef)) ? parseYaml(readFileSync(routinePath(runDirBadRef), 'utf8')) : null;
    if (!rec) fail('an unresolvable --base-ref must still write routine.yaml');
    else {
      if (rec.gate !== 'not-run') fail(`an unresolvable --base-ref must read gate: not-run, never skipped (got ${JSON.stringify(rec.gate)})`);
      if (!Array.isArray(rec.failures) || !rec.failures.some((f) => /origin\/mian/.test(f))) fail(`the reason must name the base ref that did not resolve (got ${JSON.stringify(rec.failures)})`);
    }
    if (logsBad.some((l) => /edits the accepted baseline/.test(l))) fail('an unresolvable --base-ref must not claim the change edits the accepted baseline');
    // a ref that resolves but carries no packet/baseline.yaml yet is the one skip
    const runDirNoBaseline = join(tmp, 'run-no-baseline-at-ref');
    let r2;
    try { r2 = runRoutine({ repoDir, outDir: runDirNoBaseline, baseRef: headCommit1 }, () => {}); }
    catch (e) { fail(`runRoutine with a --base-ref that has no baseline must not throw (${e.message})`); }
    const rec2 = existsSync(routinePath(runDirNoBaseline)) ? parseYaml(readFileSync(routinePath(runDirNoBaseline), 'utf8')) : null;
    if (r2 && (!r2.ok || r2.exitCode !== 0 || rec2?.gate !== 'skipped')) fail(`a resolvable --base-ref with no packet/baseline.yaml must skip the gate, exit 0 (got ok=${r2.ok} exit=${r2.exitCode} gate=${rec2?.gate})`);
  }

  if (result1 && baseCommit) {
    // the pull request: delete the runbook, and loosen the WORKING TREE's own copy
    // of the baseline so it no longer expects d-runbook met — a routine that reads
    // this copy (instead of the base ref's) would see nothing to hold.
    rmSync(join(repoDir, 'RUNBOOK.md'));
    const acceptedBaseline = readFileSync(baselineFile, 'utf8');
    const loosened = acceptedBaseline.replace(/(- id: d-runbook\n\s*status: )met/, '$1unmet');
    if (loosened === acceptedBaseline) fail('test setup: could not find d-runbook in the written baseline to loosen — the test would be vacuous');
    writeFileSync(baselineFile, loosened);

    const runDir2 = join(tmp, 'run2');
    const logs2 = [];
    let result2;
    try { result2 = runRoutine({ repoDir, outDir: runDir2, baseRef: baseCommit }, (l) => logs2.push(l)); }
    catch (e) { fail(`runRoutine with --base-ref must not throw (${e.message})`); }
    if (result2) {
      if (result2.ok || result2.exitCode !== 1) fail(`a pull request that regresses d-runbook must fail the routine even though its OWN working-tree baseline was loosened (got ok=${result2.ok} exit=${result2.exitCode}):\n${logs2.join('\n')}`);
      const joined = logs2.join('\n');
      if (!/edits the accepted baseline/.test(joined)) fail(`the routine must name the baseline edit plainly when the working tree's packet\/baseline.yaml differs from the base ref's (got:\n${joined})`);
      if (!/d-runbook/.test(joined)) fail(`the ratchet failure must name d-runbook (got:\n${joined})`);
      if (!/met\s*→\s*unmet/.test(joined)) fail(`the ratchet failure must show the before → after (got:\n${joined})`);

      const routineFile2 = routinePath(runDir2);
      if (!existsSync(routineFile2)) fail('a failed --base-ref run must still write routine.yaml');
      else {
        const rec2 = parseYaml(readFileSync(routineFile2, 'utf8'));
        if (rec2.gate !== 'failed') fail(`a regressed pull request's routine.yaml must read gate: failed (got ${JSON.stringify(rec2.gate)})`);
        if (rec2.exit !== 1) fail(`failed must record exit: 1 (got ${JSON.stringify(rec2.exit)})`);
        if (rec2.baseline?.source !== 'ref' || rec2.baseline?.where !== baseCommit) fail(`failed must record baseline.source: ref and the base commit (got ${JSON.stringify(rec2.baseline)})`);
        if (!Array.isArray(rec2.failures) || !rec2.failures.some((f) => /d-runbook/.test(f) && /met\s*→\s*unmet/.test(f))) fail(`routine.yaml's failures must carry the ratchet's own d-runbook line, verbatim (got ${JSON.stringify(rec2.failures)})`);
      }
    }

    // the base ref's own copy — never the working tree's loosened one — is what
    // decided the gate: reading it back directly must still show d-runbook met.
    const baseCopy = catGitFile(repoDir, baseCommit, 'packet/baseline.yaml');
    if (!baseCopy.ok || !/- id: d-runbook\n\s*status: met/.test(baseCopy.content)) fail('the base ref\'s own packet/baseline.yaml must still read d-runbook: met, untouched by the working-tree edit');

    // a schedule / workflow_dispatch run (no --base-ref) reads the working tree's
    // own copy, unchanged from before this feature — the loosened baseline here
    // would hold (exit 0), proving the two paths are genuinely different.
    const runDir3 = join(tmp, 'run3');
    let result3;
    try { result3 = runRoutine({ repoDir, outDir: runDir3 }, () => {}); }
    catch (e) { fail(`runRoutine with no --base-ref must not throw (${e.message})`); }
    if (result3 && (!result3.ok || result3.exitCode !== 0)) fail(`with no --base-ref, the routine must read the working tree's own (loosened) baseline and hold (got ok=${result3.ok} exit=${result3.exitCode})`);
    if (result3) {
      const routineFile3 = routinePath(runDir3);
      if (!existsSync(routineFile3)) fail('a held, no-base-ref run must still write routine.yaml');
      else {
        const rec3 = parseYaml(readFileSync(routineFile3, 'utf8'));
        if (rec3.gate !== 'held') fail(`the held, no-base-ref run's routine.yaml must read gate: held (got ${JSON.stringify(rec3.gate)})`);
        if (!Array.isArray(rec3.failures) || rec3.failures.length !== 0) fail(`held must carry no failures (got ${JSON.stringify(rec3.failures)})`);
        if (rec3.baseline?.source !== 'file') fail(`with no --base-ref, routine.yaml must record baseline.source: file (got ${JSON.stringify(rec3.baseline)})`);
      }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}
