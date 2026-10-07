// ── routine: the change's own code runs in one step, the gate in another (#48) ──
// runTargetSteps runs fresh-clone (the only instrument that executes the target's
// own install and scripts), then structure-scan with knip enabled after that install
// (#128), and writes only their raw reports and exits to a handoff directory;
// runRoutine with `handoff` ingests those reports and never executes the target. The target's test script below leaves a marker: it must appear after the
// target step and never after the gate.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { runRoutine, runTargetSteps } from '../../routine/run.mjs';
import { scannersPath as runScannersPath, rawPath } from '../../lib/run-layout.mjs';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'routine-handoff';

export async function run() {
  const fail = (m) => negFailures.push('routine-handoff: ' + m);
  const tmp = join(HERE, 'tmp-routine-handoff'); rmSync(tmp, { recursive: true, force: true });
  const target = join(tmp, 'target');
  mkdirSync(target, { recursive: true });
  const marker = join(tmp, 'target-code-ran');
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'handoff-target', version: '0.0.0', private: true, scripts: { test: `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '/')}', 'x')"` } }, null, 2) + '\n');
  writeFileSync(join(target, 'README.md'), '# handoff-target\n\nA regression-only fixture; not a real package.\n');
  const handoff = join(tmp, 'handoff');
  let t;
  const targetLogs = [];
  try { t = runTargetSteps({ repoDir: target, handoffDir: handoff }, (l) => targetLogs.push(l)); }
  catch (e) { fail(`runTargetSteps must not throw (${e.message})`); }
  if (!existsSync(marker)) fail('test setup: the target step must run the target\'s own test script (no marker written)');
  if (t && (!t.ok || t.exitCode !== 0)) fail(`runTargetSteps must exit 0 once the report is handed forward (got ok=${t.ok} exit=${t.exitCode})`);
  if (!existsSync(join(handoff, 'fresh-clone.json'))) fail('runTargetSteps must hand fresh-clone\'s raw report forward');
  // #128: knip imports the target's tool configs, so structure-scan runs in the target step, after
  // fresh-clone's in-place install, never in the gate with --no-exec (where knip only ever read skipped)
  const fcAt = targetLogs.findIndex((l) => /^· fresh-clone\b/.test(l)), ssAt = targetLogs.findIndex((l) => /^· structure-scan\b/.test(l));
  if (fcAt < 0 || ssAt < 0 || fcAt > ssAt) fail(`the target step runs fresh-clone (its in-place install) before structure-scan (fresh-clone at log line ${fcAt}, structure-scan at ${ssAt})`);
  if (!existsSync(join(handoff, 'structure-scan.json'))) fail('runTargetSteps must hand structure-scan\'s raw report forward (#128)');
  rmSync(marker, { force: true });

  const runDir = join(tmp, 'run');
  const logs = [];
  let r;
  try { r = runRoutine({ repoDir: target, outDir: runDir, handoff }, (l) => logs.push(l)); }
  catch (e) { fail(`runRoutine with a handoff must not throw (${e.message})`); }
  if (existsSync(marker)) fail('the gate step must never execute the target\'s own code (the marker was written again)');
  if (r && (!r.ok || r.exitCode !== 0)) fail(`runRoutine with a handoff must succeed (got ok=${r.ok} exit=${r.exitCode}):\n${logs.join('\n')}`);
  const rows = existsSync(runScannersPath(runDir)) ? (parseYaml(readFileSync(runScannersPath(runDir), 'utf8')).scanners || {}) : {};
  if (rows['fresh-clone']?.status !== 'ran') fail(`fresh-clone handed forward must read ran (got ${JSON.stringify(rows['fresh-clone'])})`);
  if (rows['structure-scan']?.status !== 'ran') fail(`structure-scan handed forward must read ran (got ${JSON.stringify(rows['structure-scan'])})`);
  if (!logs.some((l) => /^· structure-scan — from the target step's handoff/.test(l))) fail('the gate step must ingest structure-scan from the handoff, never run it itself (#128)');
  const ssRaw = rawPath(runDir, 'structure-scan.json');
  const knip = existsSync(ssRaw) ? (JSON.parse(readFileSync(ssRaw, 'utf8')).tools || {}).knip : null;
  if (!knip || /--allow-exec/.test(knip.reason || '')) fail(`knip in the two-job routine must run in the target step, never read skipped for --no-exec (got ${JSON.stringify(knip)})`);

  // no handoff at all (the target step never finished): fresh-clone is recorded failed with
  // the reason, never run in place by the gate and never silently clean
  const runDirMissing = join(tmp, 'run-missing');
  try { runRoutine({ repoDir: target, outDir: runDirMissing, handoff: join(tmp, 'no-such-handoff') }, () => {}); }
  catch (e) { fail(`runRoutine with a missing handoff must not throw (${e.message})`); }
  if (existsSync(marker)) fail('a missing handoff must never make the gate run the target itself');
  const rowsMissing = existsSync(runScannersPath(runDirMissing)) ? (parseYaml(readFileSync(runScannersPath(runDirMissing), 'utf8')).scanners || {}) : {};
  if (rowsMissing['fresh-clone']?.status !== 'failed' || !/handoff|target step/i.test(rowsMissing['fresh-clone']?.reason || '')) fail(`a missing handoff must record fresh-clone failed with the reason (got ${JSON.stringify(rowsMissing['fresh-clone'])})`);
  if (rowsMissing['structure-scan']?.status !== 'failed' || !/handoff|target step/i.test(rowsMissing['structure-scan']?.reason || '')) fail(`a missing handoff must record structure-scan failed with the reason (got ${JSON.stringify(rowsMissing['structure-scan'])})`);
  rmSync(tmp, { recursive: true, force: true });
}
