// ── second-reviewer-adapter: a reviewer joins as an adapter alone (#147) ───────
// The second provenance for the adapter contract: an invented reviewer (quill-review,
// no real tool) is dropped into the adapters directory as one file, and its
// two-finding machine report ingests, projects and scores with no core change. What
// the core needs (role, ingest format and accepted tool value, id floor, scoring
// method) is read off that file. The file is removed again whatever happens.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../../map/ingest.mjs';
import { projectMulti, loadAdapters, loadScannerCoverage } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { judgmentScanners } from '../../map/start.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'second-reviewer-adapter';

const ID = 'quill-review';
const ADAPTER = `# Adapter: ${ID} — an INVENTED reviewer, test data only (tests/blocks/second-reviewer-adapter.mjs)
scanner: ${ID}
targets_taxonomy: 3
role: judgment
method: quill
ingest:
  format: machine-report
  tool: ${ID}
  start_id: 880
min_version: "2.0.0"
coverage_domains: [K1, K2]
contributes: []
map:
  K1:
    axis: code-correctness
  K2:
    axis: code-security
default: FAIL
`;
const REPORT = `review:
  tool: ${ID}
  skill_version: "2.3.0"
ground_truth:
  commit: "0000000"
coverage:
  K1:
    status: scanned
  K2:
    status: partial
    note: "server routes only"
findings:
  - id: Q1
    area: K1
    polarity: gap
    severity: High
    observation: The retry loop never stops when the queue returns an error.
    evidence: ["src/queue.js:12"]
    fix: Bound the retries and surface the last error.
  - id: Q2
    area: K2
    polarity: strength
    observation: Every route checks the caller before it reads data.
    evidence: ["src/routes.js:4"]
prior_not_rechecked: []
`;

export async function run() {
  const fail = (m) => negFailures.push('second-reviewer-adapter: ' + m);
  const adapterPath = join(ROOT, 'map', 'scanners', 'adapters', `${ID}.yaml`);
  const tmp = join(HERE, 'tmp-second-reviewer');
  if (existsSync(adapterPath)) { fail(`${adapterPath} already exists; this block owns that name`); return; }
  try {
    writeFileSync(adapterPath, ADAPTER);
    const adapters = loadAdapters();

    // ingest: the format and the accepted tool value come from the adapter
    let rows = [];
    try { rows = convert(ID, REPORT, null); } catch (e) { fail(`a machine report from ${ID} must ingest through its adapter alone (${e.message})`); }
    if (rows.length !== 2) fail(`the two-finding report must yield 2 rows (got ${rows.length})`);
    if (rows.some((r) => r.source !== ID)) fail(`rows must carry source ${ID} (got ${rows.map((r) => r.source).join(', ')})`);
    if (rows[0]?.id !== 'F-880') fail(`ids must start at the adapter's ingest.start_id, F-880 (got ${rows[0]?.id})`);
    if (rows.coverage?.scanner !== ID) fail(`the coverage block must name ${ID} (got ${rows.coverage?.scanner})`);
    let threw = false;
    try { convert(ID, REPORT.replace(`  tool: ${ID}\n`, '  tool: another-reviewer\n'), null); } catch { threw = true; }
    if (!threw) fail('a report whose review.tool is not the adapter\'s ingest.tool must halt');
    threw = false;
    try { convert(ID, REPORT.replace('skill_version: "2.3.0"', 'skill_version: "1.9.0"'), null); } catch { threw = true; }
    if (!threw) fail('a report older than the adapter\'s min_version must halt');

    // project: the adapter's map routes its domains
    const proj = projectMulti(rows, adapters);
    if (proj.unmapped.length) fail(`all rows must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    const axisOf = (n) => proj.projected.find((p) => p.f.native_id === n)?.axis;
    if (axisOf('Q1') !== 'code-correctness' || axisOf('Q2') !== 'code-security') fail(`K1 → code-correctness and K2 → code-security (got ${axisOf('Q1')}, ${axisOf('Q2')})`);

    // score: the adapter's method key is the one a known-answer sheet's detectable_by names
    const answers = { planted: [{ id: 'P1', polarity: 'gap', axis: 'code-correctness', evidence: 'src/queue.js:12', detectable_by: ['quill'] }] };
    const s = score(rows, adapters, answers, { scanners: { [ID]: { status: 'ran' } } });
    const p1 = (s.results || []).find((r) => r.id === 'P1');
    if (p1?.status !== 'recovered') fail(`a planted item detectable_by the adapter's method must read recovered (got ${p1?.status})`);

    // start: the judgment roster is read off the adapters
    if (!judgmentScanners(adapters).includes(ID)) fail(`start's judgment scanners must include ${ID} (got ${judgmentScanners(adapters).join(', ')})`);

    // the CLI: the raw archive, the rows file and the coverage sidecar are named by the scanner id
    rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const raw = join(tmp, 'report.yaml'); writeFileSync(raw, REPORT);
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', ID, '--raw', raw], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept ${ID}'s report without --exit (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    for (const f of [`findings/${ID}.yaml`, `coverage/${ID}.yaml`, `raw/${ID}.yaml`]) if (!existsSync(join(tmp, 'map', f))) fail(`ingest must write map/${f}`);
    if (existsSync(join(tmp, 'map', 'coverage'))) {
      const cov = loadScannerCoverage(tmp);
      if (cov[ID]?.coverage?.K2?.status !== 'partial') fail('the coverage sidecar must round-trip through the shared loader');
    }
    if (existsSync(join(tmp, 'map', 'findings', `${ID}.yaml`)) && !readFileSync(join(tmp, 'map', 'findings', `${ID}.yaml`), 'utf8').includes(`source: ${ID}`)) fail(`the rows file must carry source: ${ID}`);
  } finally {
    rmSync(adapterPath, { force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
}
