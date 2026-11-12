// ── effect sites are read where code runs (#272) ──
// With effect-site members keyed per file, every file that only quotes a call became its own triage
// entry: on assay at main the list grew from 6 members to 59, 47 of them committed sweep artifacts
// (terrain.md, raw/enumerate.json, effect-triage.yaml). A doc restates a call and makes none, and a
// test or a run's own artifact is not the product's effect surface, so neither is read for effect
// sites; the files that make the calls still are.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-effect-sites-read-where-code-runs';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-effect-sites-read-where-code-runs: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'effects');
  const doc = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--json'], { encoding: 'utf8' }));
  const members = doc.populations.effectSites.map((m) => m.member);
  for (const file of ['docs/mail.md', 'tests/sync.test.mjs', 'runs/r-1/map/terrain.md', 'runs/r-1/map/effect-triage.yaml']) {
    const hits = members.filter((m) => m.endsWith(` @ ${file}`));
    if (hits.length) fail(`${file} is a doc, a test or a run artifact, not an effect site: enumerate listed ${hits.join(', ')}`);
  }
  for (const need of ['http write (js) @ lib/sync.mjs', 'git push @ lib/sync.mjs']) {
    if (!members.includes(need)) fail(`the file that makes the call is still read: "${need}" missing (got ${members.join(', ') || 'none'})`);
  }
}
