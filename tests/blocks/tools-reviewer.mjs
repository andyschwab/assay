// ── a judgment scanner's own tools are pinned like an instrument's, and stay its session's (#196) ──
// A review session drives tools assay never runs (the reviewer's analyzers), and one that
// cannot install them on its own runs without them. An adapter's `tools:` list pins them in
// the same shape as `tool:` (map/scanners/CONTRACT.md §3g):
//   (a) pinnedTools reads `tools:` with the adapter's role, never its verified_against (the
//       scanner's version is not its tools'); the reviewer's adapter pins semgrep, well-formed,
//       to run before the review, and no trivy (#201: its scanners repeat the instruments');
//   (b) install runs each `prepare` once the tool is installed, in an empty scratch
//       directory, and again when the binary is current; a prepare that fails fails the
//       install, naming it;
//   (c) verify reads a tool whose `ready` check fails unprepared, never ready;
//   (d) the gate a run assay draws is held to covers what the run executes: the
//       instruments' tools and each tool a review reads that runs before it, never a
//       session's own (#201); the routine template and CI install and verify that set (--run);
//   (e) a malformed prepare or ready is a problem of the block.
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { installTool, pinnedTools, verifyTools, runTools, toolBlockProblems } from '../../map/tools.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'tools-reviewer';

export async function run() {
  const fail = (m) => negFailures.push('tools-reviewer: ' + m);
  const tmp = join(HERE, 'tmp-tools-reviewer'); rmSync(tmp, { recursive: true, force: true });
  const src = join(tmp, 'src'), bin = join(tmp, 'bin'), marks = join(tmp, 'marks'); mkdirSync(src, { recursive: true });
  try {
    // (a)
    const adapters = {
      inst: { role: 'instrument', verified_against: '1.0.0', tool: { bin: 'insttool', version: '1.0.0', upstream: 'pypi:insttool', pypi: 'insttool' } },
      rev: { role: 'judgment', verified_against: '9.9.9', tools: [{ bin: 'revtool', version: '2.0.0', upstream: 'pypi:revtool', pypi: 'revtool' }, { bin: 'pretool', version: '3.0.0', upstream: 'pypi:pretool', pypi: 'pretool', before_review: { args: ['.'], rules: 'x' } }] },
    };
    const pinned = pinnedTools(adapters);
    const rev = pinned.find((t) => t.bin === 'revtool');
    if (!rev || rev.scanner !== 'rev' || rev.role !== 'judgment' || rev.verified !== null || toolBlockProblems(rev).length) fail(`(a) a tools: entry reads with its adapter's role and no verified_against (got ${JSON.stringify(rev)})`);
    const dcr = pinnedTools().filter((t) => t.scanner === 'deep-code-review');
    const sg = dcr.find((x) => x.bin === 'semgrep');
    if (!sg || sg.role !== 'judgment' || !sg.before_review) fail(`(a) the reviewer's adapter pins semgrep, run before its review (got ${JSON.stringify(sg)})`);
    else for (const p of toolBlockProblems(sg)) fail(`(a) semgrep: ${p}`);
    if (dcr.some((x) => x.bin === 'trivy')) fail('(a) the reviewer\'s adapter pins no trivy (#201)');

    // (b) a fake tool whose prepare writes where it ran, and fails when asked to
    writeFileSync(join(src, 'preptool'), `#!/bin/sh\nif [ "$1" = prep ]; then pwd >> ${JSON.stringify(marks)}; ls -A >> ${JSON.stringify(marks)}; exit "\${PREP_EXIT:-0}"; fi\necho preptool 1.0.0\n`);
    spawnSync('tar', ['-czf', join(tmp, 'preptool.tar.gz'), '-C', src, 'preptool']);
    const sum = createHash('sha256').update(readFileSync(join(tmp, 'preptool.tar.gz'))).digest('hex');
    const fetch = (url, dest) => writeFileSync(dest, readFileSync(join(tmp, 'preptool.tar.gz')));
    const t = { scanner: 'rev', bin: 'preptool', version: '1.0.0', upstream: 'github:example/preptool', prepare: [{ args: ['prep'] }],
      fetch: { 'linux-x64': { url: 'https://example.invalid/preptool.tar.gz', sha256: sum, member: 'preptool' } } };
    const b1 = installTool(t, bin, { platform: 'linux-x64', fetch });
    const marked = () => (existsSync(marks) ? readFileSync(marks, 'utf8').trim().split('\n') : []);
    const ran = marked();
    if (b1.status !== 'installed' || !/prepared/.test(b1.detail) || ran.length !== 1 || ran[0].startsWith(tmp)) fail(`(b) install runs prepare once, in an empty scratch directory (got ${JSON.stringify(b1)}, ran in ${JSON.stringify(ran)})`);
    const b2 = installTool(t, bin, { platform: 'linux-x64', fetch });
    if (b2.status !== 'current' || marked().length !== 2) fail(`(b) a current binary is prepared again (got ${JSON.stringify(b2)})`);
    process.env.PREP_EXIT = '4';
    let b3; try { b3 = installTool(t, bin, { platform: 'linux-x64', fetch }); } finally { delete process.env.PREP_EXIT; }
    if (b3.status !== 'failed' || !/not prepared/.test(b3.detail) || !/preptool prep exited 4/.test(b3.detail)) fail(`(b) a prepare that fails fails the install, naming it (got ${JSON.stringify(b3)})`);

    // (c)
    const withReady = { scanner: 'rev', bin: 'readytool', version: '1.0.0', ready: ['check'] };
    const answer = (exit) => () => ({ found: true, exit: 0, output: 'readytool 1.0.0', ready: { exit, output: 'no database' } });
    if (verifyTools([withReady], answer(1))[0].status !== 'unprepared') fail('(c) a failing ready check reads unprepared');
    if (verifyTools([withReady], answer(0))[0].status !== 'ready') fail('(c) a passing ready check reads ready');

    // (d)
    const gate = runTools(pinnedTools(adapters)).map((x) => x.bin).sort();
    if (JSON.stringify(gate) !== JSON.stringify(['insttool', 'pretool'])) fail(`(d) the gate covers the instruments' tools and the tools run before a review, never a session's own (got ${JSON.stringify(gate)})`);
    for (const f of [join(ROOT, 'routine', 'assay-routine.yml'), join(ROOT, '.github', 'workflows', 'ci.yml')]) {
      const yml = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
      for (const cmd of ['install', 'verify']) {
        const lines = yml.split('\n').filter((l) => new RegExp(`tools ${cmd}\\b`).test(l));
        if (!lines.length || lines.some((l) => !/--run\b/.test(l))) fail(`(d) ${f.slice(ROOT.length + 1)} runs tools ${cmd} with --run, the set a run executes`);
      }
    }

    // (e)
    if (!toolBlockProblems({ ...rev, prepare: [['fs']] }).some((p) => /prepare/.test(p))) fail('(e) a prepare entry that is not { args } is a problem');
    if (!toolBlockProblems({ ...rev, ready: 'check' }).some((p) => /ready/.test(p))) fail('(e) a ready that is not a list of args is a problem');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
