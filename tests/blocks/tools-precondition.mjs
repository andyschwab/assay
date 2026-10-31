// ── assay's pinned tools are a precondition of a measurement, never a skip (#198) ──
// A run that cannot field every adopted instrument does not start:
//   (a) verify reads each pinned tool ready only when it is on PATH and, asked its
//       version, exits 0 and prints the pin; absent, broken and another version are each
//       named, and a version that only starts with the pin is another version;
//   (b) the routine's gate step draws nothing when a tool is not ready: refused (#197), the
//       reason in routine.yaml, and no run record (map/scanners.yaml);
//   (c) `assay start <target>` refuses with the tools absent from PATH, exit 3, and writes
//       nothing; start with no target, which runs nothing, still starts;
//   (d) the routine template and the engine's own CI install every pinned tool with
//       `tools install`, verify them, and put them on PATH before anything runs, as a step
//       that fails the job, and carry no tool pin of their own to drift from the adapters'.
//       The step is assay's tools action (.github/actions/tools, #227), read here as the step.
import { readFileSync, existsSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyTools, toolsNotReady, pinnedTools, REFUSED_EXIT } from '../../map/tools.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { routinePath, scannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'tools-precondition';

export async function run() {
  const fail = (m) => negFailures.push('tools-precondition: ' + m);
  const tmp = join(HERE, 'tmp-tools-precondition'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    // (a)
    const tools = [
      { scanner: 'one', bin: 'onetool', version: '8.21.2' },
      { scanner: 'two', bin: 'twotool', version: '1.0.0' },
      { scanner: 'three', bin: 'threetool', version: '2.7.0' },
      { scanner: 'four', bin: 'fourtool', version: '3.4.0' },
      { scanner: 'five', bin: 'fivetool', version: '8.21.2' },
    ];
    const answers = {
      onetool: { found: true, exit: 0, output: 'onetool version 8.21.2' },
      twotool: { found: false },
      threetool: { found: true, exit: 127, output: 'error while loading shared libraries' },
      fourtool: { found: true, exit: 0, output: '3.5.1' },
      fivetool: { found: true, exit: 0, output: 'v8.21.20' },
    };
    const rows = verifyTools(tools, (t) => answers[t.bin]);
    const st = Object.fromEntries(rows.map((r) => [r.scanner, r.status]));
    const want = { one: 'ready', two: 'absent', three: 'broken', four: 'other-version', five: 'other-version' };
    for (const [k, v] of Object.entries(want)) if (st[k] !== v) fail(`(a) ${k} reads ${v} (got ${st[k]}: ${JSON.stringify(rows.find((r) => r.scanner === k))})`);
    const reason = toolsNotReady(rows);
    if (!reason || !['two', 'three', 'four', 'five'].every((s) => reason.includes(s)) || reason.includes('one (') || !/tools install/.test(reason)) fail(`(a) the refusal names every tool not ready, and only those, with the install command (got ${reason})`);
    if (toolsNotReady(verifyTools([tools[0]], (t) => answers[t.bin])) !== null) fail('(a) every tool ready reads no refusal');
    if (!pinnedTools().length) fail('(a) the adopted adapters pin tools to verify');

    // (b)
    const runDir = join(tmp, 'run');
    const target = join(HERE, 'instruments', 'fresh-clone-target');
    const res = runRoutine({ repoDir: target, outDir: runDir, toolsCheck: () => ({ reason: 'planted: twotool (absent: twotool is not on PATH)', refused: [] }) });
    if (res.ok || res.exitCode !== REFUSED_EXIT) fail(`(b) the routine is refused when a tool is not ready (got ok=${res.ok} exit=${res.exitCode})`);
    const rec = existsSync(routinePath(runDir)) ? readFileSync(routinePath(runDir), 'utf8') : '';
    if (!/^gate: refused$/m.test(rec) || !/planted: twotool/.test(rec)) fail(`(b) routine.yaml reads gate: refused with the reason (got:\n${rec})`);
    if (existsSync(scannersPath(runDir))) fail('(b) no map is drawn: no run record is written');

    // (c) PATH holds only this node, so no pinned tool resolves
    const nodeOnly = join(tmp, 'node-only'); mkdirSync(nodeOnly);
    symlinkSync(process.execPath, join(nodeOnly, 'node'));
    const env = { ...process.env, PATH: nodeOnly };
    const startRun = join(tmp, 'start-run');
    const s = spawnSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', startRun, target], { encoding: 'utf8', env });
    if (s.status !== REFUSED_EXIT || !/start refused: assay's pinned tools are not ready/.test(s.stderr) || existsSync(startRun)) fail(`(c) start refuses with the tools absent, exit 3, nothing written (got exit ${s.status}, ${existsSync(startRun) ? 'a run written' : 'nothing written'}: ${s.stderr.trim()})`);
    const bare = spawnSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', join(tmp, 'bare-run')], { encoding: 'utf8', env });
    if (bare.status !== 0) fail(`(c) start with no target runs nothing, so it still starts (got exit ${bare.status}: ${bare.stderr.trim()})`);

    // (d)
    const stepsOf = (text, job) => {
      const lines = text.split('\n');
      const at = job ? lines.findIndex((l) => new RegExp(`^\\s{2}${job}:\\s*$`).test(l)) : 0;
      const end = job ? lines.findIndex((l, i) => i > at && /^\s{2}[\w-]+:\s*$/.test(l)) : -1;
      const body = lines.slice(at, end === -1 ? lines.length : end).filter((l) => !/^\s*#/.test(l));
      const steps = [];
      for (const l of body) { if (/^\s*-\s+(name|uses|run):/.test(l)) steps.push([l]); else if (steps.length) steps[steps.length - 1].push(l); }
      return steps.map((x) => x.join('\n'));
    };
    for (const [file, job, runs] of [[join(ROOT, 'routine', 'assay-routine.yml'), 'routine', /routine\/run\.mjs/], [join(ROOT, '.github', 'workflows', 'ci.yml'), null, /^\s*-?\s*run:\s*npm test\s*$/m]]) {
      const text = readFileSync(file, 'utf8');
      const name = file.slice(ROOT.length + 1);
      const steps = stepsOf(text, job);
      // the step is assay's tools action, called at its checkout path (#227): its own step is what runs
      const install = steps.findIndex((x) => /^\s*(?:-\s+)?uses:\s*\.\/(?:[\w.-]+\/)*\.github\/actions\/tools\s*$/m.test(x));
      const runAt = steps.findIndex((x) => runs.test(x));
      if (install === -1) { fail(`(d) ${name} installs the pinned tools with assay's tools action`); continue; }
      const step = readFileSync(join(ROOT, '.github', 'actions', 'tools', 'action.yml'), 'utf8');
      if (!/tools install/.test(step)) fail(`(d) ${name}'s tools step installs the pinned tools with \`tools install\``);
      if (runAt === -1 || install > runAt) fail(`(d) ${name} installs the tools before the step that runs assay`);
      if (!/tools verify/.test(step)) fail(`(d) ${name} verifies the tools after installing them`);
      if (!/GITHUB_PATH/.test(step)) fail(`(d) ${name} puts the installed tools on PATH for the steps after it`);
      if (/continue-on-error:\s*true/.test(step + steps[install]) || /\|\|\s*(true|echo|:)/.test(step)) fail(`(d) ${name}'s tools step fails the job when it fails`);
      if (!/set -euo pipefail/.test(step)) fail(`(d) ${name}'s tools step runs under set -euo pipefail`);
      if (/_VERSION:|_SHA256:|[0-9a-f]{64}/.test(text.replace(/@[0-9a-f]{40}/g, ''))) fail(`(d) ${name} carries a tool pin of its own; the adapters' tool: blocks are the only pins`);
      if (/^\s*#\s*-\s*name:\s*Install/m.test(text)) fail(`(d) ${name} carries a commented-out install step`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
