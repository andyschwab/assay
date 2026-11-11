// ── the YAML subset has one home, and the reader is held to it (#278) ──
// map/SCHEMA.md § "What the reader reads" is the one place the subset is written: what the
// reader reads, each with an example and the value it reads as, and what it refuses, each with
// the plain form to write instead. Pinned:
//   (a) every construct the section lists as read parses to the value it shows;
//   (b) every construct it lists as refused throws, the message naming the plain form;
//   (c) the reader's header, map/METHOD.md and the practice-review lane point at the section,
//       so a writer reads the subset before a refusal teaches it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'yaml-subset';

const HEADING = 'What the reader reads';

// a markdown table's rows under a bold lead-in, each split on the pipes a cell does not escape
function table(section, lead) {
  const at = section.indexOf(lead);
  if (at < 0) return null;
  const lines = section.slice(at).split('\n').slice(1);
  const start = lines.findIndex((l) => l.startsWith('|'));
  if (start < 0) return null;
  const rows = [];
  for (const l of lines.slice(start)) {
    if (!l.startsWith('|')) break;
    rows.push(l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim()));
  }
  return rows.slice(2);   // the header row and its rule
}
const code = (cell) => { const m = cell.match(/^`(.*)`$/); return m ? m[1].replace(/\\\|/g, '|') : null; };
const example = (cell) => { const c = code(cell); return c === null ? null : c.replace(/\\n/g, '\n'); };

export async function run() {
  const fail = (m) => negFailures.push('yaml-subset: ' + m);
  const schema = readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8');
  const m = schema.match(new RegExp(`\\n## (\\d+)\\. ${HEADING}\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!m) { fail(`map/SCHEMA.md has no section "## <n>. ${HEADING}"`); return; }
  const [, num, section] = m;

  // (a)
  const read = table(section, '**What is read.**');
  if (!read || !read.length) fail('the section lists no construct as read (**What is read.** and a table)');
  for (const [construct, ex, want] of read || []) {
    const src = example(ex), json = code(want);
    if (src === null || json === null) { fail(`(a) "${construct}": the example and the value are each one code span`); continue; }
    let expected; try { expected = JSON.parse(json); } catch { fail(`(a) "${construct}": the value it reads as is not JSON: ${json}`); continue; }
    let got;
    try { got = parseYaml(src); } catch (e) { fail(`(a) "${construct}" is listed as read, but the reader refuses ${JSON.stringify(src)}: ${e.message}`); continue; }
    if (JSON.stringify(got) !== JSON.stringify(expected)) fail(`(a) "${construct}": ${JSON.stringify(src)} reads as ${JSON.stringify(got)}, the section says ${json}`);
  }

  // (b)
  const refused = table(section, '**What is refused**');
  if (!refused || !refused.length) fail('the section lists no construct as refused (**What is refused** and a table)');
  for (const [construct, ex, plain] of refused || []) {
    const src = example(ex), instead = (plain || '').replace(/\\\|/g, '|');
    if (src === null || !instead) { fail(`(b) "${construct}": an example code span and the plain form to write`); continue; }
    let threw = null;
    try { parseYaml(src); } catch (e) { threw = e; }
    if (!threw) { fail(`(b) "${construct}" is listed as refused, but the reader reads ${JSON.stringify(src)}`); continue; }
    if (!String(threw.message).includes(instead)) fail(`(b) "${construct}": the refusal must name the plain form "${instead}" (got: ${threw.message})`);
  }

  // (c)
  const pointer = `§${num}`;
  const header = readFileSync(join(ROOT, 'lib', 'yaml-min.mjs'), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 12).join(' ');
  if (!header.includes(HEADING)) fail(`lib/yaml-min.mjs's header must point at SCHEMA.md § "${HEADING}", not restate the subset`);
  for (const [file, what] of [['map/METHOD.md', 'METHOD.md'], ['map/scanners/adapters/practice-review/lane.md', 'the practice-review lane'], ['map/scanners/CONTRACT.md', 'the adapter contract']]) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    if (!text.includes(HEADING) || !text.includes(pointer)) fail(`${what} (${file}) must point at SCHEMA.md ${pointer} "${HEADING}"`);
  }
}
