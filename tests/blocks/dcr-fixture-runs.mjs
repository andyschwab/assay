// ── deep-code-review's real machine reports over the public fixtures (#16) ──────
// The stored runs tests/fixtures/notesbox (FULL over targets/flawed-webapp) and
// tests/fixtures/fixtures-root (FULL over the fixtures repository root) each carry a
// real deep-code-review machine report, ingested with `node assay.mjs ingest --tool
// deep-code-review`, never hand-written. What holds:
//   • the run record says deep-code-review ran; the raw report and the coverage
//     sidecar are archived, the sidecar with a row for every adapter domain;
//   • the header names the public target and the adapter's verified_against release,
//     and the report carries no local path;
//   • the stored rows are the converter's own output over the archived report;
//   • scored on the scanner's rows alone, the dcr items recover on their axis:
//     P-02, P-03, P-04 over flawed-webapp and R-02 at the root. P-07 (effects vs
//     reports) is pinned as it reads today: the scanner files the swallowed backup
//     push in domain F, which the adapter routes to code-correctness, while the sheet
//     homes the item on verification only. The run still recovers P-07 through the
//     built-in method; the homing question is recorded in HISTORY.md, not papered over.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings, loadManifest, loadScannerCoverage, projectMulti } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'dcr-fixture-runs';

const RUNS = [
  { key: 'notesbox', target: 'flawed-webapp', recovered: ['P-02', 'P-03', 'P-04'], misHomed: { 'P-07': { native: 'F7', axis: 'code-correctness' } } },
  { key: 'fixtures-root', target: 'assay-fixtures', recovered: ['R-02'], misHomed: {} },
];

export async function run() {
  const fail = (m) => negFailures.push('dcr-fixture-runs: ' + m);
  const adapter = adaptersOnce()['deep-code-review'] || {};
  for (const r of RUNS) {
    const dir = join(HERE, 'fixtures', r.key);
    const at = (m) => fail(`${r.key}: ${m}`);
    const rawFile = join(dir, 'map', 'raw', 'deep-code-review.yaml');
    if (!existsSync(rawFile)) { at('the archived machine report map/raw/deep-code-review.yaml must exist'); continue; }
    let raw, rep, findings, manifest, coverage, answers;
    try {
      raw = readFileSync(rawFile, 'utf8');
      rep = parseYaml(raw);
      findings = loadFindings(dir);
      manifest = loadManifest(dir);
      coverage = loadScannerCoverage(dir)['deep-code-review'];
      answers = parseYaml(readFileSync(join(dir, 'ANSWERS.yaml'), 'utf8'));
    } catch (e) { at(`the stored run must load (${e.message.split('\n')[0]})`); continue; }

    // (a) the run record and the archives
    const row = manifest?.scanners?.['deep-code-review'];
    if (row?.status !== 'ran') at(`the run record must say deep-code-review ran (got ${row?.status})`);
    if (!coverage) at('the coverage sidecar map/coverage/deep-code-review.yaml must exist');
    const missing = (adapter.coverage_domains || []).filter((d) => !coverage?.coverage?.[d]?.status);
    if (missing.length) at(`the coverage sidecar must carry a row for every adapter domain (missing ${missing.join(', ')})`);

    // (b) the header: public target, the release the adapter was verified against, no local path
    if (rep?.review?.scope !== 'FULL') at(`the review must be FULL scope (got ${rep?.review?.scope})`);
    if (rep?.review?.target !== r.target) at(`review.target must be the public name ${r.target} (got ${rep?.review?.target})`);
    if (String(rep?.review?.skill_version) !== String(adapter.verified_against)) at(`review.skill_version must be the adapter's verified_against ${adapter.verified_against} (got ${rep?.review?.skill_version})`);
    if (/(^|[\s"'(])(\/home\/|\/Users\/|\/tmp\/|\/root\/|[A-Za-z]:\\)/m.test(raw)) at('the archived report must carry no local path');

    // (c) the stored rows are the converter's own output over the archived report
    const sig = (rows) => rows.filter((x) => x.source === 'deep-code-review').map((x) => `${x.id}/${x.native_id}/${x.native_category}/${x.polarity}/${x.severity || '-'}@${x.evidence.join(',')}`).join(' | ');
    const stored = sig(findings);
    if (!stored) at('the run must carry deep-code-review rows');
    let reconverted = '';
    try { reconverted = sig(convert('deep-code-review', raw, null, String(findings.find((x) => x.source === 'deep-code-review')?.id || 'F-800'))); }
    catch (e) { at(`the archived report must convert (${e.message.split('\n')[0]})`); }
    if (reconverted !== stored) at('re-converting the archived report must give the stored rows');

    // (d) scored on the scanner's rows alone
    const own = findings.filter((x) => x.source === 'deep-code-review');
    const s = score(own, adaptersOnce(), answers, { scanners: { 'deep-code-review': { status: 'ran' } } });
    const by = Object.fromEntries(s.results.map((x) => [x.id, x]));
    for (const id of r.recovered) if (by[id]?.status !== 'recovered') at(`${id} must read recovered from deep-code-review's rows alone (got ${by[id]?.status}${by[id]?.foundAxis ? ' on ' + by[id].foundAxis : ''})`);
    const projected = projectMulti(own, adaptersOnce()).projected;
    for (const [id, want] of Object.entries(r.misHomed)) {
      if (by[id]?.status !== 'mis-homed') at(`${id} reads mis-homed from deep-code-review's rows alone (got ${by[id]?.status})`);
      const axis = projected.find((p) => p.f.native_id === want.native)?.axis;
      if (axis !== want.axis) at(`deep-code-review's ${want.native} (the ${id} defect) lands on ${want.axis} (got ${axis})`);
    }
    const dcrItems = s.results.filter((x) => x.expectMethods.includes('dcr')).map((x) => x.id).sort();
    const pinned = [...r.recovered, ...Object.keys(r.misHomed)].sort();
    if (dcrItems.join() !== pinned.join()) at(`the sheet's dcr items must be the pinned ones (sheet ${dcrItems.join(', ')}; pinned ${pinned.join(', ')})`);
  }
}
