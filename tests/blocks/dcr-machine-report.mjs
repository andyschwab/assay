// ── peer-scanner machine report (deep-code-review 1.128+) through ingest ─────────
// Completeness is the fail-loud property: every domain the adapter lists has a
// coverage row, every gap a fix, every non-scanned row a note. Rows carry the
// scanner's own labels beside the mapped ones; the coverage sidecar makes an axis
// read "partially measured" where the scanner itself said it looked partially.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti, loadScannerCoverage, axisCoverage, coveragePhrase } from '../../map/project.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce, copyFixtureFindings } from '../harness.mjs';

export const label = 'dcr-machine-report';

export async function run() {
  const fail = (m) => negFailures.push('dcr-machine-report: ' + m);
  const sample = readFileSync(join(HERE, 'instruments', 'deep-code-review-sample.yaml'), 'utf8');
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt`); };
  const rows = convert('deep-code-review', sample, null);
  if (rows.length !== 4) fail(`sample must yield 4 rows (got ${rows.length})`);
  const by = Object.fromEntries(rows.map((r) => [r.native_id, r]));
  if (by.F1?.native_category !== 'A' || by.F1?.severity !== 'Critical' || by.F1?.confidence !== 'confirmed' || by.F1?.native_confidence !== 'CONFIRMED') fail('F1 must map area A, keep Critical, confidence CONFIRMED→confirmed with the native label kept');
  if (by.F1?.prior_native_id !== 'F1' || by.F1?.prior_status !== 'still-open') fail('prior_id/prior_status must ride into the port row');
  if (by.F2?.polarity !== 'strength' || by.F2?.severity !== undefined) fail('a strength row carries no severity (never a Low)');
  if (by.F3?.confidence !== 'plausible' || by.F3?.mechanism_unproven !== true) fail('PLAUSIBLE→plausible and mechanism_unproven must be carried');
  if (by.F4?.confidence !== 'unverified' || !/org_id NOT NULL/.test(by.F4?.resolves_with || '') || by.F4?.native_tag !== 'A01 broken access control') fail('an unverified row must carry resolves_with (the artifact that settles it) and the scanner\'s tag');
  if (!rows.coverage || rows.coverage.coverage.B?.status !== 'partial' || rows.coverage.prior_not_rechecked.join() !== 'F7') fail('the coverage block must carry the scanner\'s rows and the prior_not_rechecked list');
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`all sample rows must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.native_id === 'F2')?.axis !== 'code-security') fail('domain T (multi-tenancy) must land on code-security');
  if (proj.projected.find((p) => p.f.native_id === 'F3')?.axis !== 'code-correctness') fail('domain W (workflows/jobs) must land on code-correctness');
  const sRow = projectMulti([{ id: 'F-899', source: 'deep-code-review', native_id: 'S1', native_category: 'S', polarity: 'gap', severity: 'Low', observation: 'x', evidence: ['a:1'], fix: 'y' }], adaptersOnce());
  if (sRow.projected[0]?.axis !== 'improvement-loop') fail('domain S (branches/open-work triage) must land on improvement-loop');
  mustThrow('a flow-map report (not block YAML)', () => convert('deep-code-review', 'coverage: {A: {status: scanned}}\nfindings: []\n', null));
  mustThrow('a report with no coverage map', () => convert('deep-code-review', 'findings: []\n', null));
  mustThrow('coverage missing a domain', () => convert('deep-code-review', sample.replace(/  W:\n    status: scanned\n/, ''), null));
  mustThrow('a partial row without a note', () => convert('deep-code-review', sample.replace('    note: "mutating routes and webhook handlers only; UI routes not read"\n', ''), null));
  mustThrow('a gap row without a fix', () => convert('deep-code-review', sample.replace(/    fix: >\n      Key each batch[^\n]*\n/, ''), null));
  mustThrow('findings not a list', () => convert('deep-code-review', sample.replace(/findings:[\s\S]*prior_not_rechecked/, 'findings: nope\nprior_not_rechecked'), null));
  mustThrow('a report with no review header', () => convert('deep-code-review', sample.replace(/^review:[\s\S]*?(?=ground_truth:)/m, ''), null));
  mustThrow('a report from another tool', () => convert('deep-code-review', sample.replace('  tool: deep-code-review\n', '  tool: other-reviewer\n'), null));
  mustThrow('a report with no skill_version', () => convert('deep-code-review', sample.replace(/  skill_version: "[^"]*"\n/, ''), null));
  mustThrow('a report older than the machine-report contract', () => convert('deep-code-review', sample.replace(/skill_version: "[^"]*"/, 'skill_version: "1.127.0"'), null));
  if (convert('deep-code-review', sample.replace(/skill_version: "[^"]*"/, 'skill_version: "1.128.0"'), null).length !== 4) fail('a 1.128.0 report (the first with the contract) must convert');
  mustThrow('a strength row with a severity', () => convert('deep-code-review', sample.replace('    area: T\n    polarity: strength\n', '    area: T\n    severity: Low\n    polarity: strength\n'), null));
  mustThrow('an unverified row without resolves_with', () => convert('deep-code-review', sample.replace(/    resolves_with: [^\n]*\n/, ''), null));
  mustThrow('prior_status without prior_id', () => convert('deep-code-review', sample.replace('    prior_id: F1\n', ''), null));
  mustThrow('a prior re-verified fixed but filed as a gap', () => convert('deep-code-review', sample.replace('prior_status: still-open', 'prior_status: fixed'), null));
  const clean = convert('deep-code-review', sample.replace(/findings:[\s\S]*prior_not_rechecked/, 'findings: []\nprior_not_rechecked'), null);
  if (clean.length !== 0 || !clean.coverage) fail('full coverage + empty findings must convert to zero rows WITH the coverage block (a recorded clean run)');
  // the sidecar: written block-style, loadable, and it turns a contributed axis "partially measured"
  const tmp = join(HERE, 'tmp-dcr'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), 'engine: fixture\nscanners:\n  repo-eval:\n    status: ran\n  deep-code-review:\n    status: ran\n  gitleaks:\n    status: ran\n  fresh-clone:\n    status: ran\n  dependency-scan:\n    status: ran\n  repo-census:\n    status: skipped\n    reason: "fixture: not executed"\n');
  const raw = join(tmp, 'machine-report.yaml'); writeFileSync(raw, sample);
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'deep-code-review', '--raw', raw], { stdio: 'pipe' }); }
  catch (e) { fail(`ingest CLI must accept a machine report without --exit (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  if (!existsSync(join(tmp, 'map', 'findings', 'deep-code-review.yaml')) || !existsSync(join(tmp, 'map', 'coverage', 'deep-code-review.yaml')) || !existsSync(join(tmp, 'map', 'raw', 'deep-code-review.yaml'))) fail('ingest must write the rows file, the coverage sidecar, and the raw archive');
  const cov = loadScannerCoverage(tmp);
  if (cov['deep-code-review']?.coverage?.P?.status !== 'not-scanned') fail('the coverage sidecar must round-trip through the shared loader');
  const ac = axisCoverage(adaptersOnce(), cov, 'code-security');
  if (!ac || ac[0].full || !ac[0].partial.find((x) => x.l === 'B')) fail('code-security must read partially measured when domain B was partial');
  if (!coveragePhrase(ac).includes('B partial')) fail('the coverage phrase must name the partial domain');
  if (axisCoverage(adaptersOnce(), cov, 'delegation') !== null) fail('an axis dcr does not contribute has no dcr coverage groups (fed axes are not measured by it)');
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested machine report must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
  const walk = execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'axes.mjs'), tmp, '--stdout'], { stdio: 'pipe' }).toString();
  if (!walk.includes('Partially measured') || !walk.includes('B partial (mutating routes')) fail('the walk must say an axis is partially measured, with the scanner\'s note');
  rmSync(tmp, { recursive: true, force: true });
}
