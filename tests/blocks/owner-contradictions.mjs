// ── owner-contradictions: a claim the run contradicts shows on the Owner view ──
// A repository's own packet claimed a run-decided requirement satisfied; this run found
// it unmet (yardstick/README.md, owner/PACKET.md). Intake and Maintain carried the
// contradiction; when they left the engine (#339) the Owner view took it, so it stays
// visible on an assay page. Pinned here, against views/owner.mjs:
//   (a) owner.yaml's contradictions: carries it, joined to the requirement's title by
//       joinContradictions (views/rows.mjs), with the claim, the run's status and findings;
//   (b) OWNER.md names it, under its own heading, by title and id, with what the run found;
//   (c) the contradicted row is never read as met: it stays open, and the claim does not
//       overwrite the run's own status;
//   (d) a run with no contradiction writes contradictions: [] and the section reads None.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadYardstick, loadContradictions } from '../../yardstick/measure.mjs';
import { joinContradictions } from '../../views/rows.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'owner-contradictions';
const ID = 'd-secrets-out-of-history';

export async function run() {
  const fail = (m) => negFailures.push('owner-contradictions: ' + m);
  const reg = loadYardstick();
  const title = reg.requirements.find((d) => d.id === ID)?.title;
  if (!title) { fail(`the register must carry ${ID} for this block to mean anything`); return; }

  // joinContradictions: the raw list joined to the register's titles, an unknown id kept as itself
  const joined = joinContradictions([{ id: ID, claim: 'satisfied', run_status: 'unmet', findings: ['F-700'] }, { id: 'd-not-a-row', claim: 'satisfied', run_status: 'unmet', findings: [] }], reg);
  if (joined[0].title !== title || joined[0].run_status !== 'unmet' || joined[1].title !== 'd-not-a-row') fail(`joinContradictions joins a contradiction to its title, keeping the claim and the run's status (got ${JSON.stringify(joined)})`);

  const tmp = join(HERE, 'tmp-owner-contradictions'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
  const ownerOf = () => {
    try { execFileSync(process.execPath, [join(ROOT, 'views', 'owner.mjs'), tmp], { stdio: 'pipe' }); }
    catch (e) { fail(`views/owner.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    const doc = existsSync(join(tmp, 'views', 'owner.yaml')) ? parseYaml(readFileSync(join(tmp, 'views', 'owner.yaml'), 'utf8')) : null;
    const page = existsSync(join(tmp, 'OWNER.md')) ? readFileSync(join(tmp, 'OWNER.md'), 'utf8') : '';
    return { doc, page };
  };
  const section = (page) => (page.split('## Where this run disagrees with what you told us')[1] || '').split('\n## ')[0];

  // (d) first: no packet, no contradiction
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const none = ownerOf();
  if (!none.doc || !Array.isArray(none.doc.contradictions) || none.doc.contradictions.length) fail(`a run with no contradiction writes contradictions: [] (got ${JSON.stringify(none.doc && none.doc.contradictions)})`);
  if (!/_None\._/.test(section(none.page))) fail('OWNER.md reads None under "Where this run disagrees with what you told us" when nothing is contradicted');

  // a packet claiming the gitleaks-unmet row satisfied: one contradiction
  mkdirSync(join(tmp, 'owner'), { recursive: true });
  writeFileSync(join(tmp, 'owner', 'manifest.yaml'), [
    'packet: 1', 'yardstick: 0',
    'answered:', '  date: "2026-09-28"', '  by: founder', '  via: owner-prompt',
    'claims:', `  - id: ${ID}`, '    state: satisfied', '    by: "a ci scan we trust"',
  ].join('\n') + '\n');
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed with the packet (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const raw = loadContradictions(tmp);
  if (raw.length !== 1) fail(`test setup: expected exactly one contradiction (got ${JSON.stringify(raw)})`);
  const { doc, page } = ownerOf();

  // (a) the data
  const c = (doc && doc.contradictions || []).find((x) => x.id === ID);
  if (!c) fail(`owner.yaml must carry the contradiction on ${ID} (got ${JSON.stringify(doc && doc.contradictions)})`);
  else {
    if (c.title !== title) fail(`owner.yaml's contradiction is joined to its title (want "${title}", got "${c.title}")`);
    if (c.claim !== 'satisfied' || c.run_status !== 'unmet') fail(`owner.yaml's contradiction keeps the claim and the run's own status side by side (got ${JSON.stringify(c)})`);
    if (JSON.stringify(c.findings) !== JSON.stringify(raw[0]?.findings)) fail(`owner.yaml's contradiction carries the run's findings (want ${JSON.stringify(raw[0]?.findings)}, got ${JSON.stringify(c.findings)})`);
  }
  // (b) the page
  const s = section(page);
  if (!s.includes(title) || !s.includes(ID) || !/This run: unmet/.test(s)) fail(`OWNER.md names the contradiction under "Where this run disagrees with what you told us", by title and id, with what the run found (got:\n${s})`);
  // (c) never read as met: the row stays open, wherever it lives
  const groups = doc ? [doc.floor, doc.beyond_floor] : [];
  const where = groups.flatMap((g) => Object.entries(g || {}).flatMap(([k, rows]) => (rows || []).filter((r) => r.id === ID).map(() => k)));
  if (JSON.stringify(where) !== '["open"]') fail(`a contradicted row stays open, never met: the claim never overwrites the run's status (found it under ${JSON.stringify(where)})`);
  rmSync(tmp, { recursive: true, force: true });
}
