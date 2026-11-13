// ── the reviewer's K and M findings are placed by property, by their markers when they name none (#316) ──
// Reviews drawn before the lane asked for `property:` carry none, so every K finding read
// unplaced and every M finding (observability, bound to no row since #311) read untaken, and the
// sequence ranked them after every tiered gap. The adapter now names, per property of a split
// category, a closed list of markers matched whole in the reviewer's own tag and title
// (map/placement.mjs, map/scanners/CONTRACT.md); K's release half has its row
// (d-release-path-trusted, a halt at High), and M is split over the three operability rows,
// bound gaps only. Pinned:
//   1. K: release markers place on release-path-trust, supply-chain markers on build-supply-chain;
//      markers of both, or of none, leave it unplaced with the reason; a named property wins;
//      the observation is never read;
//   2. M: alerting, health and scheduled-job markers place on the three properties, none leaves
//      it unplaced;
//   3. requirementTaking: the release finding is d-release-path-trusted's, the alerting finding
//      d-routing-proportionate's;
//   4. the adapter's markers are closed: a marker naming two properties, one on a property not in
//      the list, and markers on an unsplit category are refused;
//   5. gaps only: an M gap makes the census-met routing row a gap; with no M gap, or with the
//      reviewer skipped, the row reads what the census reads, never held not measured;
//   6. halt_at is a severity of the scale, on a run-decided row, and d-release-path-trusted
//      carries High.
import { negFailures, adaptersOnce } from '../harness.mjs';
import { measureRun, loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { requirementTaking } from '../../yardstick/population.mjs';
import { propertyOf, validatePlacement } from '../../map/placement.mjs';

export const label = 'reviewer-markers-place-k-and-m';

const row = (id, cat, title, tag, extra = {}) => ({ id, source: 'deep-code-review', native_id: id, native_category: cat, polarity: 'gap', severity: 'High', confidence: 'confirmed',
  title, ...(tag ? { native_tag: tag } : {}), observation: 'production deploy alert health cron lockfile', evidence: ['server.mjs:1'], fix: 'x', ...extra });

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const adapters = adaptersOnce();
  const reg = loadYardstick();
  const place = (f) => propertyOf(f, adapters);

  // (1) K
  const kCases = [
    [row('F-1', 'K', 'A promoter\'s tag runs the production apply before the production reviewer', 'release · deploy'), 'release-path-trust'],
    [row('F-2', 'K', 'A promoter\'s tag gets the production identities', null), 'release-path-trust'],
    [row('F-3', 'K', 'The base image floats on a mutable tag', 'supply chain'), 'build-supply-chain'],
    [row('F-4', 'K', 'Third-party actions are pinned by tag, not by commit', null), 'build-supply-chain'],
    [row('F-5', 'K', 'The deploy image floats', null), null],
    [row('F-6', 'K', 'The build does not pin its runtime', 'build'), null],
    [row('F-7', 'K', 'The deploy image floats', null, { native_property: 'build-supply-chain' }), 'build-supply-chain'],
  ];
  for (const [f, want] of kCases) {
    const got = place(f);
    if (got.property !== want) fail(`(1) "${f.title}" (tag ${f.native_tag ?? 'none'}) must be placed on ${want ?? 'no property'} (got ${JSON.stringify(got)})`);
  }
  if (!/markers of build-supply-chain and release-path-trust/.test(place(kCases[4][0]).unplaced || '')) fail(`(1) markers of both properties leave it unplaced, saying so (got ${place(kCases[4][0]).unplaced})`);
  if (!/named none on the finding, and its tag and title carry no marker of one/.test(place(kCases[5][0]).unplaced || '')) fail(`(1) no marker leaves it unplaced, saying so (got ${place(kCases[5][0]).unplaced})`);

  // (2) M
  for (const [f, want] of [
    [row('F-11', 'M', 'Production has no alert policy at all', 'alerting'), 'signal-routing'],
    [row('F-12', 'M', 'No health check reports whether the sync still runs', null), 'health-reporting'],
    [row('F-13', 'M', 'The nightly cron can stop without anyone noticing', null), 'declared-expectations'],
    [row('F-14', 'M', 'Logs are unstructured', 'logging'), null],
  ]) { const got = place(f); if (got.property !== want) fail(`(2) "${f.title}" must be placed on ${want ?? 'no property'} (got ${JSON.stringify(got)})`); }

  // (3) which requirement takes them
  const take = (f) => requirementTaking(f, { reg, adapters }).requirement;
  if (take(kCases[0][0]) !== 'd-release-path-trusted') fail(`(3) the release-trust finding is d-release-path-trusted's (got ${take(kCases[0][0])})`);
  if (take(kCases[2][0]) !== 'd-dependencies-pinned') fail(`(3) the pinning finding is d-dependencies-pinned's (got ${take(kCases[2][0])})`);
  if (take(row('F-11', 'M', 'Production has no alert policy at all', 'alerting')) !== 'd-routing-proportionate') fail('(3) the alerting finding is d-routing-proportionate\'s');

  // (4) closed markers
  const dcr = adapters['deep-code-review'];
  const ids = reg.requirements.map((d) => d.id);
  if (validatePlacement(dcr, ids).length) fail(`(4) the shipped adapter's mapping is valid (got ${validatePlacement(dcr, ids).join(' | ')})`);
  const withK = (markers, extra = {}) => ({ ...dcr, map: { ...dcr.map, K: { ...dcr.map.K, markers }, ...extra } });
  const refused = (a, re, what) => { const e = validatePlacement(a, ids); if (!e.some((x) => re.test(x))) fail(`(4) ${what} must be refused (got ${e.join(' | ') || 'no error'})`); };
  refused(withK({ 'build-supply-chain': ['image'], 'release-path-trust': ['image'] }), /marker "image" names both/, 'a marker naming two properties');
  refused(withK({ 'tenant-isolation': ['tenant'] }), /markers names "tenant-isolation", not one of its properties/, 'a marker on a property not in the list');
  refused(withK(dcr.map.K.markers, { A: { ...dcr.map.A, markers: { 'program-logic': ['logic'] } } }), /markers are a split category's/, 'markers on an unsplit category');

  // (5) gaps only: the census decides the routing row; the reviewer's M gap is a gap there too
  const census = { id: 'F-20', source: 'repo-census', native_id: 'routing-policy@root', native_category: 'routing-policy', polarity: 'strength', observation: 'policy', evidence: ['ops/routing.yaml:1'] };
  const alerting = row('F-21', 'M', 'Production has no alert policy at all', 'alerting', { severity: 'Medium' });
  const cov = { 'deep-code-review': Object.fromEntries('ABCDEFGHIJKLMNOPQRSTW'.split('').map((l) => [l, { status: 'scanned' }])) };
  const routing = (findings, dcrStatus) => measureRun({ findings, manifest: [{ scanner: 'repo-census', status: 'ran' }, { scanner: 'deep-code-review', status: dcrStatus, ...(dcrStatus === 'skipped' ? { reason: 'not run' } : {}) }], inputs: null, coverage: cov, adapters }, reg).find((r) => r.id === 'd-routing-proportionate');
  const withGap = routing([census, alerting], 'ran');
  if (!['mixed', 'unmet'].includes(withGap?.status) || !(withGap.findings || []).includes('F-21')) fail(`(5) a reviewer's alerting gap is a gap on the routing row (got ${withGap?.status}: ${withGap?.note})`);
  for (const [fs, st, what] of [[[census], 'ran', 'a reviewer that placed no gap there'], [[census], 'skipped', 'a reviewer that did not run']]) {
    const r = routing(fs, st);
    if (r?.status !== 'met') fail(`(5) beside ${what}, the routing row reads what the census reads, met (got ${r?.status}: ${r?.note})`);
  }

  // (6) halt_at
  if (reg.requirements.find((d) => d.id === 'd-release-path-trusted')?.halt_at !== 'High') fail('(6) d-release-path-trusted carries halt_at: High');
  const bad = (halt_at, kind) => validateYardstick({ ...reg, requirements: reg.requirements.map((d) => (d.id === 'd-runbook' ? { ...d, halt_at, ...(kind ? { decide: { kind } } : {}) } : d)) });
  if (!bad('Severe').some((e) => /d-runbook: halt_at must be one of Blocker/.test(e))) fail('(6) a halt_at off the severity scale is refused');
  if (!bad('High', 'claim').some((e) => /halt_at is a run-decided row's/.test(e))) fail('(6) a halt_at on a claim row is refused');
}
