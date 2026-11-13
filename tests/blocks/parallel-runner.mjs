// ── the blocks run in parallel, and the run reads as the serial one (#323) ──
// The suite ran 220 blocks one at a time in one process, about six minutes. The runner now runs
// each block in its own process, a bounded pool at once (tests/harness.mjs runBlocksParallel).
// Parallel is invisible: the same gate line, the same failures in the same order, and each
// block's output in the serial run's order. Blocks that share state run where after places them
// (the rows every block converted reach a block that runs after them), and a block that writes
// into the working tree without after or a place on the runner's closed list is refused. Probed
// on planted blocks, under an ignored tests/tmp-* directory so they import the real harness.
import { writeFileSync, mkdirSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, negFailures, current, convertedRows, loadBlocks, runBlocks, runBlocksParallel, gateLabels, gateLine } from '../harness.mjs';

export const label = 'parallel-runner';

export async function run() {
  const fail = (m) => negFailures.push('parallel-runner: ' + m);
  const base = join(HERE, `tmp-parallel-runner-${process.pid}`);
  rmSync(base, { recursive: true, force: true });
  const blk = (lbl, body, extra = '') => `import { negFailures, current, convertedRows } from '../../harness.mjs';\n` +
    `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\nexport const label = '${lbl}';\n${extra}\n` +
    `export async function run() { const fail = (m) => negFailures.push('${lbl}: ' + m); ${body} }\n`;
  const dir = (name, files) => {
    const d = join(base, name); mkdirSync(d, { recursive: true });
    for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), body);
    return d;
  };
  const timed = async (fn) => { const t = Date.now(); const r = await fn(); return { r, ms: Date.now() - t }; };
  try {
    // (a) two blocks that each sleep 1.5 s run side by side; one the closed list names runs alone
    const sleepers = (await loadBlocks(dir('sleep', {
      'sleep-a.mjs': blk('sleep-a', 'await sleep(1500);'), 'sleep-b.mjs': blk('sleep-b', 'await sleep(1500);'),
    }))).blocks;
    const par = await timed(() => runBlocksParallel(sleepers, { jobs: 2 }));
    if (par.r.failures.length || par.r.ran.length !== 2) fail(`the planted sleepers must run clean (got ${JSON.stringify(par.r.failures)})`);
    if (par.ms >= 2900) fail(`two 1.5 s blocks in a pool of two must run concurrently (took ${par.ms} ms, as long as one after the other)`);
    const alone = await timed(() => runBlocksParallel(sleepers, { jobs: 2, closed: { 'sleep-b': 'planted: runs alone' } }));
    if (alone.ms < 3000) fail(`a block on the closed list must run alone, nothing beside it (took ${alone.ms} ms)`);

    // (b) a planted failure: the parallel run's failures, gate line and score are the serial run's
    const mixed = dir('mixed', {
      'a.mjs': blk('a', "await sleep(700); console.log('out-a'); current._score['planted/a'] = { n: 1 }; convertedRows.push({ source: 'planted', n: 1 });"),
      'b.mjs': blk('b', "console.log('out-b'); fail('planted failure');"),
      'c.mjs': blk('c', "throw new Error('planted throw');"),
      'd.mjs': blk('d', "fail('ran after a');", "export const after = ['a'];"),
      'e.mjs': blk('e', "current._score['planted/e'] = { rows: convertedRows.length }; fail('ran last');", "export const after = '*';"),
      'f.mjs': blk('f', "await sleep(300); console.log('out-f'); fail('second failure');"),
    });
    const m = await loadBlocks(mixed);
    if (m.errors.length) fail(`the planted blocks must load (got ${m.errors.join(' | ')})`);
    const serialFailures = [], mark = negFailures.length, keys = new Set(Object.keys(current._score));
    const log = console.log; console.log = () => {};                     // the planted blocks' output, kept off this block's
    const held = convertedRows.splice(0);                                 // under --serial, the rows earlier blocks converted are in this process
    const serialRan = await runBlocks(m.blocks, serialFailures).finally(() => { console.log = log; convertedRows.splice(0, convertedRows.length, ...held); });
    serialFailures.unshift(...negFailures.splice(mark));                 // the planted blocks pushed into this process's list
    const serialScore = {};
    for (const k of Object.keys(current._score)) if (!keys.has(k)) { serialScore[k] = current._score[k]; delete current._score[k]; }
    // the serial runner records a throw where it happens: each block's failures, in blocks' order
    const at = (f) => m.blocks.findIndex((b) => f.startsWith(b.label + ':'));
    const serialList = serialFailures.map((f, k) => [f, k]).sort((x, y) => at(x[0]) - at(y[0]) || x[1] - y[1]).map((x) => x[0]);
    const seen = [];
    const p = await runBlocksParallel(m.blocks, { jobs: 4, onOutput: (b) => seen.push(b.label) });
    const norm = (l) => l.map((f) => f.replace(/ at .*$/, ''));
    if (JSON.stringify(norm(p.failures)) !== JSON.stringify(norm(serialList))) fail(`the parallel run's failures must be the serial run's, in its order (serial ${JSON.stringify(norm(serialList))}; parallel ${JSON.stringify(norm(p.failures))})`);
    const line = (ran) => gateLine({ negative: 1, scored: 1, labels: gateLabels(ran) });
    if (line(p.ran) !== line(serialRan)) fail(`the parallel run's gate line must be the serial run's (serial ${line(serialRan)}; parallel ${line(p.ran)})`);
    if (JSON.stringify(p.score) !== JSON.stringify(serialScore)) fail(`the parallel run's _score must be the serial run's, keys in its order (serial ${JSON.stringify(serialScore)}; parallel ${JSON.stringify(p.score)})`);
    if (p.ran.some((b) => b.label === 'c')) fail('a block that throws in its own process is not among the blocks that ran');
    // the block that runs after every other is handed the rows they converted
    if (p.score['planted/e']?.rows !== 1 || p.rows.length !== 1) fail(`a block whose after is '*' must be handed the rows the others converted (saw ${JSON.stringify(p.score['planted/e'])}, merged ${p.rows.length})`);
    // output comes back in the serial run's order, though a and f finish after b
    if (seen.join(',') !== m.blocks.map((b) => b.label).join(',')) fail(`each block's output must be printed in the serial run's order (got ${seen.join(',')})`);
    if (!/out-a/.test(p.outputs[0]) || !/out-b/.test(p.outputs[1]) || !/out-f/.test(p.outputs[4])) fail(`each block's output is collected under it (got ${JSON.stringify(p.outputs)})`);

    // (c) a block that writes into the working tree without after or the closed list is refused;
    // its scratch under an ignored path is not shared state
    const root = mkdtempSync(join(tmpdir(), 'assay-parallel-root-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'scratch/\n');
    const writers = (await loadBlocks(dir('writers', {
      'w-shared.mjs': blk('w-shared', "const fs = await import('node:fs'); fs.writeFileSync(process.env.ASSAY_BLOCK_ROOT + '/shared.txt', 'x');"),
      'w-scratch.mjs': blk('w-scratch', "const fs = await import('node:fs'); fs.mkdirSync(process.env.ASSAY_BLOCK_ROOT + '/scratch/x', { recursive: true }); fs.writeFileSync(process.env.ASSAY_BLOCK_ROOT + '/scratch/x/f', 'x');"),
    }))).blocks;
    const w = await runBlocksParallel(writers, { jobs: 2, root });
    if (!w.failures.some((f) => /^runner: w-shared wrote shared\.txt in the working tree/.test(f))) fail(`a block writing shared state without after or the closed list must be refused, naming it and the path (got ${JSON.stringify(w.failures)})`);
    if (w.failures.some((f) => /w-scratch/.test(f))) fail(`a block writing only under an ignored path must not be refused (got ${JSON.stringify(w.failures)})`);
    const wc = await runBlocksParallel(writers, { jobs: 2, root, closed: { 'w-shared': 'planted: writes the tree, runs alone' } });
    if (wc.failures.length) fail(`a writer on the closed list runs alone and is not refused (got ${JSON.stringify(wc.failures)})`);
    rmSync(root, { recursive: true, force: true });

    // (d) the closed list names blocks, each with a reason; two blocks never share a _score key; a
    // block whose process dies before reporting is a failure under its label
    const odd = (await loadBlocks(dir('odd', {
      'k1.mjs': blk('k1', "current._score['planted/k'] = 1;"), 'k2.mjs': blk('k2', "current._score['planted/k'] = 2;"),
      'dies.mjs': blk('dies', 'process.exit(3);'),
    }))).blocks;
    const o = await runBlocksParallel(odd, { jobs: 3, closed: { nosuch: 'planted', k1: '' } });
    for (const [re, what] of [[/closed list names "nosuch", which is no block/, 'a closed-list label that is no block'], [/closed list names "k1" with no reason/, 'a closed-list entry with no reason'],
      [/_score\.planted\/k is set by both k1 and k2/, 'two blocks setting one _score key'], [/^dies: .*exit 3/, 'a block whose process exits before reporting']])
      if (!o.failures.some((f) => re.test(f))) fail(`the runner must refuse ${what} (got ${JSON.stringify(o.failures)})`);
    if (o.ran.some((b) => b.label === 'dies')) fail('a block whose process died is not among the blocks that ran');

    // (e) the runner's own closed list carries a reason for every entry and names real blocks
    const runner = readFileSync(join(HERE, 'regression.mjs'), 'utf8');
    if (!/runBlocksParallel\(/.test(runner) || !/--serial/.test(runner)) fail('tests/regression.mjs must run the blocks in parallel by default, and one at a time under --serial');
  } finally { rmSync(base, { recursive: true, force: true }); }
}
