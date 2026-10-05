// ── the hotspot lens: maintainability rows ranked by churn within severity (#111) ──
// structure-scan rows carry detail.churn_90d (or the run's `history: shallow | none`)
// and no severity of their own. The views, never the map, compute the order on the
// code-maintainability axis: rated rows by severity, then churn descending, then id;
// unrated rows after them by churn, then id; a row with no churn last in its band.
// The lens never moves a severity. Pinned here:
//   (a) the ordering helper over planted rows (rated first, churn within a band, id last,
//       no churn last in its band);
//   (b) the Improve walk over tests/fixtures/churn-rank renders the higher-churn row of
//       two equal-severity rows first and names the lens; a shallow-history copy says the
//       history was not read instead of naming a ranking;
//   (c) Owner renders a code-maintainability requirement row's places in the same order,
//       with the same note, and the shallow copy says the history was not read.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { loadFindings } from '../../map/project.mjs';

export const label = 'maintainability-churn';

const LENS = 'ranked by how often the team changes the file';
const NOT_READ = /history was not read/;

export async function run() {
  const fail = (m) => negFailures.push('maintainability-churn: ' + m);
  let H, O;
  try { H = await import('../../views/hotspot.mjs'); }
  catch (e) { fail(`views/hotspot.mjs must exist and load (${e.message.split('\n')[0]})`); return; }
  try { O = await import('../../views/owner.mjs'); }
  catch (e) { fail(`views/owner.mjs must load (${e.message.split('\n')[0]})`); return; }

  // (a) the order itself
  const row = (id, severity, churn) => ({ id, polarity: 'gap', ...(severity ? { severity } : {}), detail: churn === null ? { history: 'shallow' } : { churn_90d: churn } });
  const planted = [row('F-5', null, 1), row('F-1', null, null), row('F-4', null, 12), row('F-2', 'Medium', 0), row('F-3', 'High', 2), row('F-6', 'Medium', 9), row('F-7', null, 12)];
  const order = H.hotspotOrder(planted).map((f) => f.id).join(',');
  if (order !== 'F-3,F-6,F-2,F-4,F-7,F-5,F-1') fail(`rated by severity, then churn descending, then id; unrated after by churn then id; no churn last in its band (got ${order})`);
  if (planted.map((f) => f.id).join(',') !== 'F-5,F-1,F-4,F-2,F-3,F-6,F-7') fail('hotspotOrder must return a new array, never reorder its input');
  if (H.hotspotOrder(planted).some((f) => !planted.includes(f))) fail('the lens orders the rows it is given, never rewrites one (no severity moves)');
  if (H.hotspotNote(planted.filter((f) => f.detail.churn_90d !== undefined)) !== LENS) fail(`rows that all carry churn name the lens "${LENS}" (got ${H.hotspotNote(planted.filter((f) => f.detail.churn_90d !== undefined))})`);
  if (!NOT_READ.test(H.hotspotNote(planted))) fail(`a row with no churn makes the note say the history was not read (got ${H.hotspotNote(planted)})`);

  // the fixture run, and a copy whose history is shallow (the same rows, no churn)
  const full = join(HERE, 'tmp-maintainability-churn', 'full');
  const shallow = join(HERE, 'tmp-maintainability-churn', 'shallow');
  rmSync(join(HERE, 'tmp-maintainability-churn'), { recursive: true, force: true });
  for (const d of [full, shallow]) { mkdirSync(d, { recursive: true }); cpSync(join(HERE, 'fixtures', 'churn-rank', 'map'), join(d, 'map'), { recursive: true }); }
  const ssPath = join(shallow, 'map', 'findings', 'structure-scan.yaml');
  writeFileSync(ssPath, readFileSync(ssPath, 'utf8').replace(/churn_90d: \d+/g, 'history: shallow'));

  // (b) the Improve walk
  const walk = (d) => {
    try { return execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'axes.mjs'), d, '--stdout'], { stdio: 'pipe' }).toString(); }
    catch (e) { fail(`views/improve/axes.mjs must compile ${d} (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); return ''; }
  };
  const section = (page) => { const m = page.match(/## Code maintainability[\s\S]*?(?=\n## |\n# |$)/); return m ? m[0] : ''; };
  const wFull = section(walk(full)), wShallow = section(walk(shallow));
  if (!wFull) fail('the walk must render a Code maintainability section for the fixture');
  else {
    if (!(wFull.indexOf('F-971') > -1 && wFull.indexOf('F-971') < wFull.indexOf('F-970'))) fail('the walk must list the higher-churn row (F-971, 12) before the lower-churn row of equal severity (F-970, 3)');
    if (!wFull.includes(LENS)) fail(`the walk's maintainability section must name the lens "${LENS}"`);
    if (NOT_READ.test(wFull)) fail('a run with churn on every row must not say the history was not read');
  }
  if (!NOT_READ.test(wShallow)) fail('a shallow-history run\'s maintainability section must say the history was not read');
  if (wShallow.includes(LENS)) fail('a shallow-history run must not claim a churn ranking');
  if (!(wShallow.indexOf('F-970') > -1 && wShallow.indexOf('F-970') < wShallow.indexOf('F-971'))) fail('with no churn to read, equal-severity rows fall to id order (F-970 before F-971)');

  // (c) Owner: a code-maintainability requirement row citing both findings (the yardstick
  // rows on that topic land in #110; the rendering is pinned here on a planted row)
  const ownerPage = (d) => {
    const findings = loadFindings(d);
    const req = { id: 'R-PLANTED', tier: 'legibility', topic: 'code-maintainability', title: 'Planted maintainability requirement', findings: ['F-970', 'F-971'], check: 'Re-run structure-scan.', note: 'planted' };
    const r = O.ownerRow(req, 'unmet', new Map([[req.id, { owner: { risk: 'Planted risk.', fix: 'Planted fix.' } }]]), new Map(findings.map((f) => [f.id, f])));
    const empty = { open: [], not_measured: [], met: [], not_applicable: [] };
    return { r, md: O.renderMd('churn-rank', { floor: { ...empty, open: [r] }, beyond_floor: { ...empty, open: [r] }, not_looked_at: [] }, { name: 'churn-rank', date: '2026-10-05' }) };
  };
  const oFull = ownerPage(full), oShallow = ownerPage(shallow);
  if (oFull.r.findings.join(',') !== 'F-971,F-970') fail(`Owner orders a maintainability row's findings by churn (got ${oFull.r.findings.join(',')})`);
  const busy = oFull.md.indexOf('src/busy.js:7'), quiet = oFull.md.indexOf('src/quiet.js:3');
  if (!(busy > -1 && busy < quiet)) fail('OWNER.md must cite the higher-churn file (src/busy.js) before the lower-churn one');
  if (!oFull.md.includes(LENS)) fail(`OWNER.md must name the lens "${LENS}" on a maintainability row`);
  if (!NOT_READ.test(oShallow.md)) fail('OWNER.md over a shallow-history run must say the history was not read');
  if (oShallow.md.includes(LENS)) fail('OWNER.md over a shallow-history run must not claim a churn ranking');
  rmSync(join(HERE, 'tmp-maintainability-churn'), { recursive: true, force: true });
}
