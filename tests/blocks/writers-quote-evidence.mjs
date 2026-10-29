// ── every writer quotes an evidence list, so assay reads back what it wrote (#191) ──
// A path may hold a bracket (a dynamic route segment, app/[id]/page.tsx). Written
// unquoted in a flow list it reads as a nested list, and the strict reader refuses the
// file assay itself wrote.
//   (a) Since over a run citing a bracketed path writes a since.yaml that reads back,
//       the path intact;
//   (b) no writer outside the tests emits an `evidence: [` list without quoting each
//       element.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'writers-quote-evidence';

const PATH = 'app/items/[id]/page.tsx:3';

export async function run() {
  const fail = (m) => negFailures.push('writers-quote-evidence: ' + m);
  // (a)
  const tmp = join(HERE, 'tmp-writers-quote'); rmSync(tmp, { recursive: true, force: true });
  const prev = join(tmp, 'prev'), cur = join(tmp, 'cur');
  cpSync(join(HERE, 'fixtures', 'notesbox'), prev, { recursive: true });
  cpSync(join(HERE, 'fixtures', 'notesbox'), cur, { recursive: true });
  const cli = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
  try {
    const f = join(cur, 'map', 'findings', 'deep-code-review.yaml');
    const lines = readFileSync(f, 'utf8').split('\n');
    const i = lines.findIndex((l) => /^\s+evidence: \[/.test(l));
    lines[i] = lines[i].replace(/evidence: \[.*\]/, `evidence: ["${PATH}"]`);
    writeFileSync(f, lines.join('\n'));
    for (const d of [prev, cur]) cli('yardstick/measure.mjs', [d, '--write']);
    const s = cli('views/since.mjs', [cur, '--previous', prev]);
    if (s.status !== 0) fail(`(a) Since compiles (got ${s.status}: ${s.stderr.split('\n')[0]})`);
    else {
      const text = readFileSync(join(cur, 'views', 'since.yaml'), 'utf8');
      try { parseYaml(text); } catch (e) { fail(`(a) since.yaml reads back under the strict reader (got ${e.message.slice(0, 120)})`); }
      if (!text.includes(`"${PATH}"`)) fail('(a) the bracketed path is written quoted, intact');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  // (b)
  const src = execFileSync('git', ['-C', ROOT, 'ls-files', '*.mjs'], { encoding: 'utf8' }).split('\n').filter((p) => p && !p.startsWith('tests/'));
  for (const p of src) {
    readFileSync(join(ROOT, p), 'utf8').split('\n').forEach((l, n) => {
      if (/evidence: \[\$\{/.test(l) && !/\.map\(/.test(l)) fail(`(b) ${p}:${n + 1} writes an evidence list without quoting each element`);
    });
  }
}
