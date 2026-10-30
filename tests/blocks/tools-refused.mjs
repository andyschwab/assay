// ── a run refused for want of assay's own tools has an outcome of its own (#197) ──
// A consumer running assay across many repositories must tell "refused: gitleaks absent" apart from a
// failed measurement or a missing run, and fix it mechanically:
//   (a) the refusal lists each tool not ready as data (scanner, bin, the pinned version expected, its
//       status), and nothing when every tool is ready;
//   (b) the routine refused exits 3, never 0, 1 or 2; routine.yaml reads gate: refused with the reason
//       in failures and the refused list, read back by assay's own YAML reader; no map is drawn;
//   (c) start refused exits 3 too;
//   (d) routine/README.md documents gate: refused, its exit and its list.
import { readFileSync, existsSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyTools, toolsRefusal, REFUSED_EXIT } from '../../map/tools.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { routinePath, scannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'tools-refused';

export async function run() {
  const fail = (m) => negFailures.push('tools-refused: ' + m);
  const tmp = join(HERE, 'tmp-tools-refused'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    // (a)
    const tools = [{ scanner: 'one', bin: 'onetool', version: '1.2.3' }, { scanner: 'two', bin: 'twotool', version: '4.5.6' }];
    const answers = { onetool: { found: true, exit: 0, output: 'onetool 1.2.3' }, twotool: { found: false } };
    const refusal = toolsRefusal(verifyTools(tools, (t) => answers[t.bin]));
    if (!refusal || JSON.stringify(refusal.refused) !== JSON.stringify([{ scanner: 'two', bin: 'twotool', version: '4.5.6', status: 'absent' }]) || !/twotool/.test(refusal.reason)) fail(`(a) the refusal lists each tool not ready as data (got ${JSON.stringify(refusal)})`);
    if (toolsRefusal(verifyTools([tools[0]], (t) => answers[t.bin])) !== null) fail('(a) every tool ready reads no refusal');
    if ([0, 1, 2].includes(REFUSED_EXIT)) fail(`(b) a refusal's exit is its own, never 0, 1 or 2 (got ${REFUSED_EXIT})`);

    // (b)
    const runDir = join(tmp, 'run');
    const target = join(HERE, 'instruments', 'fresh-clone-target');
    const res = runRoutine({ repoDir: target, outDir: runDir, toolsCheck: () => refusal });
    if (res.ok || res.exitCode !== 3) fail(`(b) the routine refused exits 3 (got ok=${res.ok} exit=${res.exitCode})`);
    const rec = existsSync(routinePath(runDir)) ? parseYaml(readFileSync(routinePath(runDir), 'utf8')) : null;
    if (!rec || rec.gate !== 'refused' || rec.exit !== 3) fail(`(b) routine.yaml reads gate: refused, exit 3 (got ${JSON.stringify(rec && { gate: rec.gate, exit: rec.exit })})`);
    else {
      if (!(rec.failures || []).some((f) => /twotool/.test(f))) fail('(b) the reason is in failures');
      if (JSON.stringify(rec.refused) !== JSON.stringify([{ scanner: 'two', bin: 'twotool', version: '4.5.6', status: 'absent' }])) fail(`(b) routine.yaml lists each tool not ready (got ${JSON.stringify(rec.refused)})`);
    }
    if (existsSync(scannersPath(runDir))) fail('(b) no map is drawn');

    // (c) PATH holds only this node, so no pinned tool resolves
    const nodeOnly = join(tmp, 'node-only'); mkdirSync(nodeOnly); symlinkSync(process.execPath, join(nodeOnly, 'node'));
    const s = spawnSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', join(tmp, 'start-run'), target], { encoding: 'utf8', env: { ...process.env, PATH: nodeOnly } });
    if (s.status !== 3) fail(`(c) start refused exits 3 (got ${s.status}: ${s.stderr.trim()})`);

    // (d)
    const readme = readFileSync(join(ROOT, 'routine', 'README.md'), 'utf8').replace(/\s+/g, ' ');
    if (!/gate: held \| failed \| skipped \| not-run \| refused/.test(readme) || !/`gate: refused` is exit 3/.test(readme) || !/refused: # only on gate: refused/.test(readme)) fail('(d) routine/README.md documents gate: refused, its exit and its list');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
