// ── a judgment scanner's own tools are pinned like an instrument's, and stay its session's (#196) ──
// A review session drives tools assay never runs (the reviewer's analyzers), and one that
// cannot install them on its own runs without them. An adapter's `tools:` list pins them in
// the same shape as `tool:` (map/scanners/CONTRACT.md §3g):
//   (a) pinnedTools reads `tools:` with the adapter's role, never its verified_against (the
//       scanner's version is not its tools'); the reviewer's adapter pins no trivy (#201: its
//       scanners repeat the instruments');
//   (b) the gate a run assay draws is held to covers what the run executes: the
//       instruments' tools, never a session's own (#201, #232); the routine template and CI
//       install and verify that set (--run), through assay's tools action (#227);
//   (c) a block carrying prepare or ready, retired with the one tool that needed them, is a
//       problem of the block, and no pinned tool carries either.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinnedTools, runTools, toolBlockProblems } from '../../map/tools.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'tools-reviewer';

export async function run() {
  const fail = (m) => negFailures.push('tools-reviewer: ' + m);
  // (a)
  const adapters = {
    inst: { role: 'instrument', verified_against: '1.0.0', tool: { bin: 'insttool', version: '1.0.0', upstream: 'pypi:insttool', pypi: 'insttool' } },
    rev: { role: 'judgment', verified_against: '9.9.9', tools: [{ bin: 'revtool', version: '2.0.0', upstream: 'pypi:revtool', pypi: 'revtool' }] },
  };
  const pinned = pinnedTools(adapters);
  const rev = pinned.find((t) => t.bin === 'revtool');
  if (!rev || rev.scanner !== 'rev' || rev.role !== 'judgment' || rev.verified !== null || toolBlockProblems(rev).length) fail(`(a) a tools: entry reads with its adapter's role and no verified_against (got ${JSON.stringify(rev)})`);
  const dcr = pinnedTools().filter((t) => t.scanner === 'deep-code-review');
  if (dcr.some((x) => x.bin === 'trivy')) fail('(a) the reviewer\'s adapter pins no trivy (#201)');

  // (b)
  const gate = runTools(pinnedTools(adapters)).map((x) => x.bin).sort();
  if (JSON.stringify(gate) !== JSON.stringify(['insttool'])) fail(`(b) the gate covers the instruments' tools, never a session's own (got ${JSON.stringify(gate)})`);
  for (const f of [join(ROOT, 'routine', 'assay-routine.yml'), join(ROOT, '.github', 'workflows', 'ci.yml')]) {
    // a workflow that calls assay's tools action (#227) runs the action's step: read it in its place
    const own = readFileSync(f, 'utf8');
    const action = /^\s*(?:-\s+)?uses:\s*\.\/(?:[\w.-]+\/)*\.github\/actions\/tools\s*$/m.test(own) ? readFileSync(join(ROOT, '.github', 'actions', 'tools', 'action.yml'), 'utf8') : '';
    const yml = (own + '\n' + action).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    for (const cmd of ['install', 'verify']) {
      const lines = yml.split('\n').filter((l) => new RegExp(`tools ${cmd}\\b`).test(l));
      if (!lines.length || lines.some((l) => !/--run\b/.test(l))) fail(`(b) ${f.slice(ROOT.length + 1)} runs tools ${cmd} with --run, the set a run executes`);
    }
  }

  // (c)
  for (const k of ['prepare', 'ready']) {
    if (!toolBlockProblems({ ...rev, [k]: [] }).some((p) => new RegExp(`tool\\.${k} is retired`).test(p))) fail(`(c) a block carrying ${k} is a problem of the block`);
    for (const t of pinnedTools()) if (t[k] !== undefined) fail(`(c) ${t.scanner}/${t.bin} carries the retired ${k}`);
  }
}
