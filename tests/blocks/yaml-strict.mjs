// ── yaml-min reads what was written, or throws (#53, F-1214, F-1210, F-1226) ──
// A duplicate key silently kept the last value (`polarity: gap` then `polarity: strength`
// read strength); a `__proto__:` key set the object's prototype, so its fields vanished from
// Object.keys and JSON. A flow list split on every comma and lost its tail to a ` #`, so a
// path with either became the wrong citations. Every writer quotes through one q(), which
// escapes a backslash before a quote and keeps a value on one line.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, q } from '../../lib/yaml-min.mjs';
import { loadFindings } from '../../map/project.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'yaml-strict';

export async function run() {
  const fail = (m) => negFailures.push('yaml-strict: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`yaml-min accepted ${label} — must throw`); };
  mustThrow('a duplicate key (the last value silently wins)', () => parseYaml('polarity: gap\npolarity: strength\n'));
  mustThrow('a duplicate key inside a list item', () => parseYaml('- id: F-1\n  polarity: gap\n  polarity: strength\n'));
  mustThrow('a __proto__ key (it sets the prototype, and its fields vanish from Object.keys)', () => parseYaml('__proto__:\n  polarity: strength\n'));
  mustThrow('a flow list with no closing bracket (a ` #` ate its tail)', () => parseYaml('evidence: [a.md:1, notes/x #1.txt:7]\n'));
  mustThrow('a flow list with an unbalanced quote', () => parseYaml('evidence: ["a.md:1, b.md:2]\n'));
  mustThrow('a nested flow list', () => parseYaml('evidence: [a.md:1, [b.md:2]]\n'));
  const both = parseYaml('evidence: ["a,b.txt:3", "notes/x #1.txt:7", plain.md:1]\n');
  if (JSON.stringify(both?.evidence) !== JSON.stringify(['a,b.txt:3', 'notes/x #1.txt:7', 'plain.md:1'])) fail(`a quoted flow-list element keeps its comma and its " #" (got ${JSON.stringify(both?.evidence)})`);
  for (const v of ['\\\\host\\share', 'say "hi"', 'ends in \\', 'a \\" b', 'x #1']) {
    const back = parseYaml(`k: ${q(v)} # trailing comment\n`)?.k;
    if (back !== v) fail(`q() must round-trip ${JSON.stringify(v)} through parseYaml (got ${JSON.stringify(back)})`);
  }
  let ml; try { ml = parseYaml(`reason: ${q('line one\nline two\r\nline three')}\n`)?.reason; } catch (e) { ml = `threw: ${e.message}`; }
  if (ml !== 'line one line two line three') fail(`q() must keep a multi-line value on one line (got ${JSON.stringify(ml)})`);
  // the writers that quote YAML values all go through the one helper
  const copies = [];
  for (const f of ['yardstick/measure.mjs', 'yardstick/ratchet.mjs', 'views/improve/topics.mjs', 'views/improve/maturity.mjs', 'views/since.mjs', 'views/intake.mjs', 'views/owner.mjs', 'views/floor-fleet.mjs', 'routine/run.mjs', 'map/record.mjs', 'map/start.mjs', 'map/ingest.mjs']) {
    if (/const (?:q|oq) = \(s\) => `"\$\{/.test(readFileSync(join(ROOT, f), 'utf8'))) copies.push(f);
  }
  if (copies.length) fail(`a private quote helper is back (use q() from lib/yaml-min.mjs): ${copies.join(', ')}`);
  // ingest writes every evidence element quoted, so a comma or a ` #` in a path survives a re-read
  const tmp = join(HERE, 'tmp-yaml-strict'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'map'), { recursive: true });
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), 'engine: fixture\nscanners:\n  deep-code-review:\n    status: skipped\n    reason: "not yet run"\n');
  const sample = readFileSync(join(HERE, 'instruments', 'deep-code-review-sample.yaml'), 'utf8')
    .replace('      - src/lib/aggregate.ts:486\n', '      - "notes/x #1.txt:7"\n      - "a,b.txt:3"\n');
  const raw = join(tmp, 'report.yaml'); writeFileSync(raw, sample);
  try {
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'deep-code-review', '--raw', raw], { stdio: 'pipe' });
    const f1 = loadFindings(tmp).find((r) => r.native_id === 'F1');
    if (JSON.stringify(f1?.evidence) !== JSON.stringify(['notes/x #1.txt:7', 'a,b.txt:3', 'src/lib/alert.ts:35'])) fail(`ingest must write evidence that reads back as written (got ${JSON.stringify(f1?.evidence)})`);
  } catch (e) { fail(`ingest + re-read of a path with a comma and " #" must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  rmSync(tmp, { recursive: true, force: true });
}
