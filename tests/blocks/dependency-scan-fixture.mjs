// ── dependency-scan over a fixture that gives it something to find (#17) ─────
// The stored run tests/fixtures/lockfiles is dependency-scan's real output over the
// assay-fixtures `targets/lockfiles` target (its files wait in
// tests/fixtures/pending-assay-fixtures/ until the fixtures repository carries them).
// Two planted lockfiles, two kinds of answer:
//   • legacy/package-lock.json is truncated JSON: npm refuses it before it reaches the
//     registry (ENOLOCK), so it reads failed on any runner, network or not — the
//     deterministic answer, always in scope: one lockfile-failed gap and one
//     lockfile-not-audited fact.
//   • app/package-lock.json pins minimist 1.2.5: npm's advisory feed reports
//     GHSA-xvch-5gv4-984h, critical — the advisory answer, whose drift the sheet
//     documents (ANSWERS.yaml says how to re-check it).
// The stored run is scored against its frozen sheet: every answer recovered on the
// code-security axis, nothing missed or mis-homed. It is not pinned in
// tests/golden.json (the notesbox and cleanlib runs, which are, stay as they were).
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings, loadManifest, projectMulti } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { run as runDependencyScan } from '../../map/dependency-scan.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'dependency-scan-fixture';

const RUN = join(HERE, 'fixtures', 'lockfiles');
const PENDING = join(HERE, 'fixtures', 'pending-assay-fixtures', 'targets', 'lockfiles');

export async function run() {
  const fail = (m) => negFailures.push('dependency-scan-fixture: ' + m);
  let answers, findings, manifest, raw;
  try {
    answers = parseYaml(readFileSync(join(RUN, 'ANSWERS.yaml'), 'utf8'));
    findings = loadFindings(RUN);
    manifest = loadManifest(RUN);
    raw = readFileSync(join(RUN, 'map', 'raw', 'dependency-scan.json'), 'utf8');
  } catch (e) { fail(`the stored lockfiles run must load (${e.message.split('\n')[0]})`); return; }

  // (a) the archived report: one lockfile failed for npm's own offline reason, one audited with the advisory
  const rep = JSON.parse(raw);
  const lf = Object.fromEntries((rep.lockfiles || []).map((l) => [l.path, l]));
  const legacy = lf['legacy/package-lock.json'] || {};
  if (legacy.status !== 'failed' || !/ENOLOCK/.test(legacy.reason || '')) fail(`the truncated lockfile must read failed with npm's ENOLOCK (got ${legacy.status}/${legacy.reason})`);
  const root = lf['app/package-lock.json'] || {};
  if (root.status !== 'audited' || !(root.advisories || []).some((a) => a.id === 'GHSA-xvch-5gv4-984h' && a.package === 'minimist' && a.severity === 'critical' && a.installed === '1.2.5')) fail(`app/package-lock.json must audit with minimist 1.2.5's critical GHSA-xvch-5gv4-984h (got ${root.status}/${JSON.stringify(root.advisories || []).slice(0, 160)})`);
  if (rep.exit !== 1) fail(`a run with an advisory and a failed lockfile exits 1 (got ${rep.exit})`);

  // (b) the stored rows are the converter's own output over that report, never hand-written
  const sig = (rows) => rows.filter((r) => r.source === 'dependency-scan').map((r) => `${r.native_category}/${r.polarity}@${r.evidence[0]}`).sort().join(', ');
  const want = 'critical/gap@app/package-lock.json:1, lockfile-failed/gap@legacy/package-lock.json:1, lockfile-not-audited/fact@legacy/package-lock.json:1';
  if (sig(findings) !== want) fail(`the stored rows must be ${want} (got ${sig(findings) || '(none)'})`);
  if (sig(convert('dependency-scan', raw, rep.exit)) !== sig(findings)) fail('re-converting the archived report must give the stored rows');

  // (c) every row lands on code-security, and the frozen-run category lockfile-unsupported still maps there
  const proj = projectMulti(findings, adaptersOnce());
  if (proj.unmapped.length) fail(`every stored row must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  const offAxis = proj.projected.filter((p) => p.axis !== 'code-security').map((p) => `${p.f.native_category}→${p.axis}`);
  if (offAxis.length) fail(`every dependency-scan row lands on code-security (got ${offAxis.join(', ')})`);
  const frozen = projectMulti([{ ...findings[0], native_category: 'lockfile-unsupported', polarity: 'gap' }], adaptersOnce());
  if (frozen.projected[0]?.axis !== 'code-security') fail('a frozen run\'s lockfile-unsupported row still lands on code-security');

  // (d) scored against the frozen sheet: each answer recovered, on its axis
  const r = score(findings, adaptersOnce(), answers, manifest);
  const checks = (answers.instruments || []).map((i) => i.check).sort().join(',');
  if (checks !== 'critical,lockfile-failed,lockfile-not-audited') fail(`the sheet answers critical, lockfile-failed and lockfile-not-audited (got ${checks || '(none)'})`);
  const notRecovered = r.results.filter((x) => x.status !== 'recovered').map((x) => `${x.id} ${x.status}`);
  if (notRecovered.length || r.total_in_scope !== 5) fail(`every answer must read recovered, five in scope (got ${notRecovered.join(', ') || 'none unrecovered'}; ${r.total_in_scope} in scope)`);

  // (e) the yardstick: the critical advisory decides d-dependencies-known-clean unmet
  const d = measureRun({ findings, manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, loadYardstick()).find((x) => x.id === 'd-dependencies-known-clean');
  if (d?.status !== 'unmet') fail(`the stored run reads d-dependencies-known-clean unmet (got ${d?.status})`);

  // (f) the frozen sheet is the sheet the fixtures repository is to carry
  try {
    if (readFileSync(join(PENDING, 'ANSWERS.yaml'), 'utf8') !== readFileSync(join(RUN, 'ANSWERS.yaml'), 'utf8')) fail('tests/fixtures/lockfiles/ANSWERS.yaml must be a frozen copy of the pending target\'s sheet');
  } catch (e) { fail(`the pending target's sheet must exist (${e.message.split('\n')[0]})`); }

  // (g) end to end, offline: the pending truncated lockfile reads failed (ENOLOCK) on this runner too.
  // Files are stored as <name>.pending so this repository's own dependency graph never parses them.
  const tmp = join(HERE, 'tmp-dep-fixture'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(PENDING, 'legacy', f + '.pending'), join(tmp, f));
    writeFileSync(join(tmp, '.npmrc'), 'registry=http://127.0.0.1:9/\n');   // the scratch copy never reads it; npm refuses before the network either way
    const doc = runDependencyScan({ target: tmp, timeout: 60, log: () => {} });
    const l = doc.lockfiles[0] || {};
    if (doc.lockfiles.length !== 1 || l.status !== 'failed' || !/ENOLOCK/.test(l.reason || '') || doc.exit !== 1) fail(`the truncated lockfile reads failed with ENOLOCK when scanned (got ${l.status}/${l.reason}/${doc.exit})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
