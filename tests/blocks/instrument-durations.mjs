// ── every instrument row a run assay draws carries its wall time (#159) ──
// #150 put `duration:` on the run record and the roster reads it as a scanner's cost, but only the
// adapter-run instruments wrote it; assay's own instruments and gitleaks read "not recorded" on every run.
//   (a) the routine's run (start draws the same way): every instrument row it ran or that failed carries
//       a duration of whole seconds; a skipped row carries none;
//   (b) the roster over that run prints each instrument's duration;
//   (c) the two-job handoff: the target step records each instrument's own wall time, and the gate's row
//       carries it; a handed duration of any other shape is not recorded.
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { scannersPath } from '../../lib/run-layout.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { drawOfflineMap, writeTargetHandoff } from '../../map/start.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'instrument-durations';

export async function run() {
  const fail = (m) => negFailures.push('instrument-durations: ' + m);
  const tmp = join(HERE, 'tmp-instrument-durations'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const target = join(HERE, 'instruments', 'fresh-clone-target');
  const adapters = loadAdapters();
  const isInstrument = (id) => adapters[id] && adapters[id].role === 'instrument';
  try {
    // (a)
    const runDir = join(tmp, 'run');
    runRoutine({ repoDir: target, outDir: runDir, toolsCheck: () => null });
    const rows = (parseYaml(readFileSync(scannersPath(runDir), 'utf8')) || {}).scanners || {};
    const drawn = Object.entries(rows).filter(([id]) => isInstrument(id));
    if (!drawn.some(([, r]) => r.status === 'ran')) fail('(a) the routine ran at least one instrument');
    for (const [id, r] of drawn) {
      if (r.status === 'skipped' && r.duration !== undefined) fail(`(a) ${id} was skipped and carries no duration (got ${r.duration})`);
      if (r.status !== 'skipped' && !/^\d+s$/.test(String(r.duration || ''))) fail(`(a) ${id} ${r.status} and carries its wall time in whole seconds (got ${JSON.stringify(r.duration)})`);
    }

    // (b)
    const R = await import('../../map/roster.mjs');
    const roster = R.roster(adapters, loadYardstick(), [R.loadRosterRun(runDir)]);
    for (const [id, r] of drawn) if (r.status === 'ran') {
      const cost = roster.find((x) => x.scanner === id)?.cost;
      if (!cost || !cost.duration.some((d) => d.endsWith(`: ${r.duration}`))) fail(`(b) the roster prints ${id}'s duration (got ${JSON.stringify(cost)})`);
    }

    // (c)
    const handoff = join(tmp, 'handoff');
    writeTargetHandoff({ repoDir: target, handoffDir: handoff });
    const statusFile = (tool) => join(handoff, `${tool}.status.json`);
    for (const tool of ['fresh-clone', 'structure-scan']) {
      const st = JSON.parse(readFileSync(statusFile(tool), 'utf8'));
      if (!/^\d+s$/.test(String(st.duration || ''))) fail(`(c) the target step records ${tool}'s wall time (got ${JSON.stringify(st.duration)})`);
    }
    const set = (tool, duration) => { const st = JSON.parse(readFileSync(statusFile(tool), 'utf8')); writeFileSync(statusFile(tool), JSON.stringify({ ...st, duration })); };
    set('fresh-clone', '42s'); set('structure-scan', '$(planted)');
    const gate = drawOfflineMap({ repoDir: target, outDir: join(tmp, 'gate'), pendingReason: 'x', freshCloneNoClone: true, handoff });
    if (gate['fresh-clone']?.duration !== '42s') fail(`(c) the gate's fresh-clone row carries the target step's own time (got ${JSON.stringify(gate['fresh-clone'])})`);
    if (gate['structure-scan']?.duration !== undefined) fail(`(c) a handed duration of any other shape is not recorded (got ${JSON.stringify(gate['structure-scan']?.duration)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
