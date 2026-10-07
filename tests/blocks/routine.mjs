// ── routine/run.mjs: the driver a stewarded repository runs, network-free parts ──
// fresh-clone-target has no dependencies and no lockfile (tests/instruments/
// fresh-clone-target/package.json), so fresh-clone's install step is
// not-declared and dependency-scan finds no lockfile to audit — this run needs
// no network at all, so every part of it must be asserted, never skipped.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { routinePath } from '../../lib/run-layout.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'routine';

export async function run() {
  const fail = (m) => negFailures.push('routine: ' + m);
  const target = join(HERE, 'instruments', 'fresh-clone-target');
  const tmp = join(HERE, 'tmp-routine'); rmSync(tmp, { recursive: true, force: true });
  const runDir = join(tmp, 'run');
  const logs = [];
  let result;
  // this run asserts trigger: local, so it runs with no GITHUB_EVENT_NAME even under CI (which sets it)
  const hadEvent0 = Object.prototype.hasOwnProperty.call(process.env, 'GITHUB_EVENT_NAME');
  const savedEvent0 = process.env.GITHUB_EVENT_NAME;
  delete process.env.GITHUB_EVENT_NAME;
  try { result = runRoutine({ repoDir: target, outDir: runDir }, (l) => logs.push(l)); }
  catch (e) { fail(`runRoutine must not throw (${e.message})`); }
  if (hadEvent0) process.env.GITHUB_EVENT_NAME = savedEvent0;
  if (result) {
    if (!result.ok || result.exitCode !== 0) fail(`runRoutine over a clean, network-free fixture with no baseline must succeed (got ok=${result.ok} exit=${result.exitCode}):\n${logs.join('\n')}`);
    const manifestPath = join(runDir, 'map', 'scanners.yaml');
    if (!existsSync(manifestPath)) fail('runRoutine must write map/scanners.yaml');
    else {
      const manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
      const rows = manifest.scanners || {};
      if (rows['repo-eval']?.status !== 'skipped' || !/not run by the routine/.test(rows['repo-eval']?.reason || '')) fail(`repo-eval must always read skipped with the fixed reason (got ${JSON.stringify(rows['repo-eval'])})`);
      if (rows['deep-code-review']?.status !== 'skipped' || !/not run by the routine/.test(rows['deep-code-review']?.reason || '')) fail(`deep-code-review must always read skipped with the fixed reason (got ${JSON.stringify(rows['deep-code-review'])})`);
      if (rows['fresh-clone']?.status !== 'ran') fail(`fresh-clone needs no network against this fixture and must read ran (got ${JSON.stringify(rows['fresh-clone'])})`);
      if (rows['dependency-scan']?.status !== 'ran') fail(`dependency-scan needs no network against this lockfile-free fixture and must read ran (got ${JSON.stringify(rows['dependency-scan'])})`);
      if (rows['repo-census']?.status !== 'ran') fail(`repo-census is a pure tree read and must read ran (got ${JSON.stringify(rows['repo-census'])})`);
      // gitleaks must NEVER be silently absent from the record (CLAUDE.md rule 3:
      // fail loud, never empty). In a checkout of the engine, fresh-clone-target is a
      // subdirectory of the engine's own repository, so the row is pinned whatever
      // is on PATH: refused with the not-a-top-level reason, never a scan of the
      // engine's history (issue #51). Only in an export with no .git at all does it
      // depend on the binary (directory mode, or skipped as absent).
      if (!rows['gitleaks'] || !['ran', 'skipped', 'failed'].includes(rows['gitleaks'].status)) fail(`gitleaks must be recorded ran, skipped or failed — never absent (got ${JSON.stringify(rows['gitleaks'])})`);
      if (rows['gitleaks'] && rows['gitleaks'].status !== 'ran' && !rows['gitleaks'].reason) fail('gitleaks skipped/failed must carry a reason');
      if (spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).status === 0
        && (rows['gitleaks']?.status !== 'skipped' || !/not its git repository's top level/.test(rows['gitleaks']?.reason || '')))
        fail(`a target inside an enclosing repository must read gitleaks skipped with the not-a-top-level reason, whatever is on PATH (got ${JSON.stringify(rows['gitleaks'])})`);
    }
    // knip (in structure-scan) loads the target's tool configs, which import its
    // dependencies: the routine runs structure-scan after fresh-clone's in-place install (#118)
    const fcAt = logs.findIndex((l) => /^· fresh-clone\b/.test(l)), ssAt = logs.findIndex((l) => /^· structure-scan\b/.test(l));
    if (fcAt < 0 || ssAt < 0 || fcAt > ssAt) fail(`the routine runs fresh-clone (its in-place install) before structure-scan, so knip reads installed dependencies (fresh-clone at line ${fcAt}, structure-scan at ${ssAt})`);
    if (!existsSync(join(runDir, 'INDEX.md'))) fail('runRoutine must compile the package (INDEX.md missing)');
    if (!logs.some((l) => /no packet\/baseline\.yaml committed yet/.test(l))) fail('with no baseline, runRoutine must print a visible warning, never silence');

    // routine.yaml — the run's own record (routine/README.md) — must exist and read
    // gate: skipped with no baseline, so a fleet collector reading only the run
    // artifact (never the CI log) still knows nothing was held against.
    const routineFile = routinePath(runDir);
    if (!existsSync(routineFile)) fail('runRoutine must write routine.yaml, even with no baseline');
    else {
      const rec = parseYaml(readFileSync(routineFile, 'utf8'));
      if (rec.gate !== 'skipped') fail(`with no baseline, routine.yaml must read gate: skipped (got ${JSON.stringify(rec.gate)})`);
      if (!Array.isArray(rec.failures) || rec.failures.length !== 0) fail(`skipped must carry no failures (got ${JSON.stringify(rec.failures)})`);
      if (rec.baseline?.source !== 'none') fail(`skipped must record baseline.source: none (got ${JSON.stringify(rec.baseline)})`);
      if (rec.exit !== 0) fail(`skipped must record exit: 0 (got ${JSON.stringify(rec.exit)})`);
      if (rec.trigger !== 'local') fail(`with no GITHUB_EVENT_NAME set, trigger must read local (got ${JSON.stringify(rec.trigger)})`);
      if (typeof rec.contradictions !== 'number') fail(`contradictions must be a number (got ${JSON.stringify(rec.contradictions)})`);
      if (typeof rec.engine !== 'string' || !rec.engine) fail(`engine must be recorded (got ${JSON.stringify(rec.engine)})`);
    }

    // --write-baseline from this run, then a second run over the SAME fixture must
    // hold (exit 0) — nothing changed between the two.
    const baselineFile = join(tmp, 'baseline.yaml');
    let wb;
    try { wb = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runDir, '--write-baseline', baselineFile, '--by', 'steward'], { stdio: 'pipe' }); }
    catch (e) { fail(`--write-baseline over the routine's own run must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (existsSync(baselineFile)) {
      const runDir2 = join(tmp, 'run2');
      let result2;
      try { result2 = runRoutine({ repoDir: target, outDir: runDir2, baseline: baselineFile }, () => {}); }
      catch (e) { fail(`a second runRoutine with --baseline must not throw (${e.message})`); }
      if (result2 && (!result2.ok || result2.exitCode !== 0)) fail(`a second routine run over the SAME unchanged fixture must hold against its own just-written baseline (got ok=${result2.ok} exit=${result2.exitCode})`);

      const routineFile2 = routinePath(runDir2);
      if (!existsSync(routineFile2)) fail('a second, held routine run must still write routine.yaml');
      else {
        const rec2 = parseYaml(readFileSync(routineFile2, 'utf8'));
        if (rec2.gate !== 'held') fail(`a held run's routine.yaml must read gate: held (got ${JSON.stringify(rec2.gate)})`);
        if (!Array.isArray(rec2.failures) || rec2.failures.length !== 0) fail(`held must carry no failures (got ${JSON.stringify(rec2.failures)})`);
        if (rec2.baseline?.source !== 'file' || rec2.baseline?.where !== baselineFile) fail(`held must record baseline.source: file and its path (got ${JSON.stringify(rec2.baseline)})`);
        if (rec2.exit !== 0) fail(`held must record exit: 0 (got ${JSON.stringify(rec2.exit)})`);
      }
    }

    // trigger reads GITHUB_EVENT_NAME when the environment sets it (a routine fired
    // by the GitHub Actions template), independent of the gate outcome.
    const hadEvent = Object.prototype.hasOwnProperty.call(process.env, 'GITHUB_EVENT_NAME');
    const savedEvent = process.env.GITHUB_EVENT_NAME;
    process.env.GITHUB_EVENT_NAME = 'schedule';
    const runDirTrigger = join(tmp, 'run-trigger');
    try { runRoutine({ repoDir: target, outDir: runDirTrigger }, () => {}); }
    catch (e) { fail(`runRoutine with GITHUB_EVENT_NAME set must not throw (${e.message})`); }
    finally { if (hadEvent) process.env.GITHUB_EVENT_NAME = savedEvent; else delete process.env.GITHUB_EVENT_NAME; }
    const routineFileTrigger = routinePath(runDirTrigger);
    if (!existsSync(routineFileTrigger)) fail('runRoutine must write routine.yaml when GITHUB_EVENT_NAME is set');
    else {
      const recTrigger = parseYaml(readFileSync(routineFileTrigger, 'utf8'));
      if (recTrigger.trigger !== 'schedule') fail(`trigger must read GITHUB_EVENT_NAME (got ${JSON.stringify(recTrigger.trigger)})`);
    }

    // an unreadable baseline: the ratchet cannot evaluate (exit 2) — that is not a regression,
    // so the record reads gate: not-run with ratchet's reason, never failed with no lines
    const badBaseline = join(tmp, 'broken-baseline.yaml');
    writeFileSync(badBaseline, 'this is: [not a baseline\n');
    const runDirBad = join(tmp, 'run-bad-baseline');
    let badResult = null;
    try { badResult = runRoutine({ repoDir: target, outDir: runDirBad, baseline: badBaseline }, () => {}); }
    catch (e) { fail(`runRoutine with an unreadable baseline must not throw (${e.message})`); }
    if (badResult && badResult.exitCode === 0) fail('an unreadable baseline must not exit 0');
    const recBad = existsSync(routinePath(runDirBad)) ? parseYaml(readFileSync(routinePath(runDirBad), 'utf8')) : null;
    if (!recBad) fail('runRoutine must write a parseable routine.yaml when the baseline is unreadable');
    else {
      if (recBad.gate !== 'not-run') fail(`an unreadable baseline must record gate: not-run, never failed (got ${JSON.stringify(recBad.gate)})`);
      if (!Array.isArray(recBad.failures) || !recBad.failures.length || !/baseline/i.test(recBad.failures[0])) fail(`not-run must carry the ratchet's reason (got ${JSON.stringify(recBad.failures)})`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}
