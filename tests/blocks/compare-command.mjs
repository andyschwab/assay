// ── compare-command: two measurements compared as data, by a command (#236) ──
// A fleet tool said what moved between two measurements of one app by importing
// yardstick/compare.mjs. Pinned: `assay compare <prev yardstick.yaml> <curr yardstick.yaml>
// --json` prints exactly what compare() returns; the text form names each move; a file that
// is not there, or a status outside the yardstick's vocabulary, exits 2, never an empty compare.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'compare-command';

const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
const doc = (version, rows) => [`version: "${version}"`, 'requirements:',
  ...rows.flatMap(([id, status]) => [`  - id: ${id}`, `    status: ${status}`, '    basis: map', '    findings: []']), ''].join('\n');

export async function run() {
  const fail = (m) => negFailures.push('compare-command: ' + m);
  const { compare } = await import('../../yardstick/compare.mjs');
  const tmp = join(HERE, 'tmp-compare-command');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const prev = join(tmp, 'prev.yaml'), curr = join(tmp, 'curr.yaml'), bad = join(tmp, 'bad.yaml');
    writeFileSync(prev, doc('1', [['r-a', 'met'], ['r-b', 'unmet'], ['r-c', 'met'], ['r-d', 'mixed']]));
    writeFileSync(curr, doc('1', [['r-a', 'unmet'], ['r-b', 'met'], ['r-c', 'not-measured'], ['r-e', 'met']]));
    writeFileSync(bad, doc('1', [['r-a', 'great']]));
    const want = compare(parseYaml(doc('1', [['r-a', 'met'], ['r-b', 'unmet'], ['r-c', 'met'], ['r-d', 'mixed']])), parseYaml(doc('1', [['r-a', 'unmet'], ['r-b', 'met'], ['r-c', 'not-measured'], ['r-e', 'met']])));
    const j = assay(['compare', prev, curr, '--json']);
    let got = null;
    if (j.status !== 0) fail(`compare --json must exit 0 (got ${j.status}: ${j.stderr.trim().split('\n')[0]})`);
    else { try { got = JSON.parse(j.stdout); } catch (e) { fail(`compare --json must print JSON (${e.message})`); } }
    if (got && JSON.stringify(got) !== JSON.stringify(want)) fail(`compare --json must print what compare() returns:\n want ${JSON.stringify(want)}\n got  ${JSON.stringify(got)}`);
    const cls = Object.fromEntries((want.rows || []).map((r) => [r.id, r.classification]));
    if (cls['r-a'] !== 'regressed' || cls['r-c'] !== 'no-longer-measured') fail(`test setup: the planted moves must classify (got ${JSON.stringify(cls)})`);
    const t = assay(['compare', prev, curr]);
    if (t.status !== 0 || !/regressed[^\n]*r-a/.test(t.stdout) || !/no-longer-measured[^\n]*r-c/.test(t.stdout)) fail(`compare (text) must name each move with its ids (got ${t.status}:\n${t.stdout})`);
    const miss = assay(['compare', prev, join(tmp, 'nope.yaml'), '--json']);
    if (miss.status !== 2 || miss.stdout.trim()) fail(`a measurement that is not there must exit 2 and print nothing (got ${miss.status})`);
    const unk = assay(['compare', prev, bad, '--json']);
    if (unk.status !== 2 || unk.stdout.trim()) fail(`a status outside the yardstick's vocabulary must exit 2 and print nothing (got ${unk.status})`);
    const usage = assay(['compare', prev]);
    if (usage.status !== 2) fail(`compare with one measurement must exit 2 (got ${usage.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
