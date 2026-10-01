// ── the harness is one file per block, and the runner composes the gate line (#87) ──
// tests/regression.mjs once held every block in one file, each appending its name to a
// hand-edited label line at the tail, so two changes that each added a block conflicted
// there, and one wrong resolution could drop a name from the line while its block still
// ran. Each block is now tests/blocks/<label>.mjs; the runner discovers them in filename
// order and prints the labels of the blocks that ran. Probed on scratch block directories.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'block-runner';

export async function run() {
  const fail = (m) => negFailures.push('block-runner: ' + m);
  const H = await import('../harness.mjs').catch((e) => { fail(`tests/harness.mjs must exist and export the runner's discovery (${e.message.split('\n')[0]})`); return null; });
  const runner = readFileSync(join(HERE, 'regression.mjs'), 'utf8');
  if (/const fail = \(m\) =>|^\{$/m.test(runner)) fail('tests/regression.mjs must hold no block: every block is its own file under tests/blocks/');
  if (/all hold \(/.test(runner)) fail('tests/regression.mjs must not write the gate line by hand: it is composed from the blocks that ran');
  if (H) {
    const real = await H.loadBlocks(join(HERE, 'blocks'));
    if (real.errors.length) fail(`every committed block must load: ${real.errors.join(' | ')}`);
    if (real.blocks.length < 2) fail(`tests/blocks/ must carry the harness's blocks (found ${real.blocks.length})`);
    const probe = globalThis.__assayBlockProbe = [];
    const blk = (label, extra = '', body = '') => `export const label = '${label}';\n${extra}\nexport async function run() { globalThis.__assayBlockProbe.push('${label}'); ${body} }\n`;
    const dir = (files) => {
      const d = mkdtempSync(join(tmpdir(), 'assay-blocks-'));
      for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body);
      return d;
    };
    const scratch = [];
    const good = dir({ 'b.mjs': blk('b'), 'a.mjs': blk('a', "export const after = '*';"), 'c.mjs': blk('c', "export const gate = ['c-one', 'c-two'];"), 'd.mjs': blk('d', '', "throw new Error('planted');"), 'e.mjs': blk('e', 'export const gate = [];'), 'notes.txt': 'not a block\n' });
    scratch.push(good);
    const g = await H.loadBlocks(good);
    if (g.errors.length) fail(`well-formed blocks must load (got ${g.errors.join(' | ')})`);
    const order = g.blocks.map((b) => b.label).join(',');
    if (order !== 'b,c,d,e,a') fail(`blocks run in filename order, one that says after '*' after every other (got ${order})`);
    const failures = [];
    const ran = await H.runBlocks(g.blocks, failures);
    if (probe.join(',') !== 'b,c,d,e,a') fail(`every discovered block runs, in that order (ran ${probe.join(',')})`);
    if (!failures.some((f) => /^d: .*planted/.test(f))) fail(`a block that throws is a failure under its own label, never a silent skip (got ${JSON.stringify(failures)})`);
    const labels = H.gateLabels(ran).join(',');
    if (labels !== 'b,c-one,c-two,a') fail(`the gate line names each block that ran by its gate labels, and never one that threw (got ${labels})`);
    const line = H.gateLine({ negative: 2, scored: 1, labels: ['p', 'q'] });
    if (!/^✓ assay regression: 2 negative fixtures \+ .+ \+ 1 scored fixtures, all hold \(p, q\)\.$/.test(line)) fail(`the gate line is composed from the counts and labels it is given (got ${line})`);
    // a new block is a new file: nothing existing is edited, and its label reaches the line
    writeFileSync(join(good, 'f.mjs'), blk('f'));
    const more = await H.loadBlocks(good);
    if (!H.gateLabels(more.blocks).includes('f')) fail('a block added as a new file must be discovered and named on the gate line with no other edit');
    // the runner refuses what it cannot run honestly
    for (const [what, files, why] of [
      ['an empty blocks directory', {}, /no block/],
      ['a label that is not its filename', { 'x.mjs': blk('y') }, /x\.mjs.*"y"/],
      ['a block with no run function', { 'norun.mjs': "export const label = 'norun';\n" }, /norun\.mjs.*run/],
      ['a gate label two blocks claim', { 'b.mjs': blk('b'), 'dup.mjs': blk('dup', "export const gate = ['b'];") }, /gate label "b"/],
      ['an after naming no block', { 'late.mjs': blk('late', "export const after = ['nosuch'];") }, /late\.mjs.*nosuch/],
      ['a block that does not parse', { 'broken.mjs': 'export const label = ;\n' }, /broken\.mjs/],
    ]) {
      const d = dir(files); scratch.push(d);
      const r = await H.loadBlocks(d);
      if (!r.errors.some((e) => why.test(e))) fail(`the runner must refuse ${what} (got ${JSON.stringify(r.errors)})`);
    }
    for (const d of scratch) rmSync(d, { recursive: true, force: true });
    delete globalThis.__assayBlockProbe;
  }
}
