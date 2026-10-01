// ── routine: the change's own code runs in one step, the gate in another (#48) ──
// runTargetSteps runs fresh-clone (the only instrument that executes the target's
// own install and scripts) and writes only its raw report and exit to a handoff
// directory; runRoutine with `handoff` ingests that report and never executes the
// target. The target's test script below leaves a marker: it must appear after the
// target step and never after the gate.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { runRoutine, runTargetSteps } from '../../routine/run.mjs';
import { scannersPath as runScannersPath } from '../../lib/run-layout.mjs';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'routine-handoff';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

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
  try { t = runTargetSteps({ repoDir: target, handoffDir: handoff }, () => {}); }
  catch (e) { fail(`runTargetSteps must not throw (${e.message})`); }
  if (!existsSync(marker)) fail('test setup: the target step must run the target\'s own test script (no marker written)');
  if (t && (!t.ok || t.exitCode !== 0)) fail(`runTargetSteps must exit 0 once the report is handed forward (got ok=${t.ok} exit=${t.exitCode})`);
  if (!existsSync(join(handoff, 'fresh-clone.json'))) fail('runTargetSteps must hand fresh-clone\'s raw report forward');
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

  // no handoff at all (the target step never finished): fresh-clone is recorded failed with
  // the reason, never run in place by the gate and never silently clean
  const runDirMissing = join(tmp, 'run-missing');
  try { runRoutine({ repoDir: target, outDir: runDirMissing, handoff: join(tmp, 'no-such-handoff') }, () => {}); }
  catch (e) { fail(`runRoutine with a missing handoff must not throw (${e.message})`); }
  if (existsSync(marker)) fail('a missing handoff must never make the gate run the target itself');
  const rowsMissing = existsSync(runScannersPath(runDirMissing)) ? (parseYaml(readFileSync(runScannersPath(runDirMissing), 'utf8')).scanners || {}) : {};
  if (rowsMissing['fresh-clone']?.status !== 'failed' || !/handoff|target step/i.test(rowsMissing['fresh-clone']?.reason || '')) fail(`a missing handoff must record fresh-clone failed with the reason (got ${JSON.stringify(rowsMissing['fresh-clone'])})`);
  rmSync(tmp, { recursive: true, force: true });
}
