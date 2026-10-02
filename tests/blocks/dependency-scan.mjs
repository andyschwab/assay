// ── dependency-scan instrument (map/dependency-scan.mjs → ingest profile dependency-scan) ─
// The converter turns a synthetic dependency-scan document into exactly: one gap row
// per advisory (category = its own severity), one lockfile-failed gap per failed
// lockfile, one lockfile-not-audited FACT per lockfile nothing audited (failed, or
// not-run because its package manager is unavailable — the instrument's limit, never
// a gap against the target), and nothing for a clean audited lockfile. A runner crash (exit 2) halts it; a document
// whose exit disagrees with the runner exit halts; a truncated document halts. Every
// category maps onto the shared code-security axis and the instrument contributes
// none. The yardstick decides d-dependencies-known-clean on the `critical`
// category alone — a run with high rows and none critical still reads met.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti, contributedBySources } from '../../map/project.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { parsePnpmAudit, parseYarnClassicAudit, run as runDependencyScan } from '../../map/dependency-scan.mjs';
import { HERE, negFailures, viewSev, convert, adaptersOnce } from '../harness.mjs';

export const label = 'dependency-scan';

export async function run() {
  const fail = (m) => negFailures.push('dependency-scan: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  const doc = {
    tool: 'dependency-scan', version: '0.1.0', started_at: 't1', finished_at: 't2',
    target: { path: 'x' }, timeout_seconds: 300,
    lockfiles: [
      {
        path: 'package-lock.json', status: 'audited', method: 'in-place', npm_exit_code: 1,
        counts: { critical: 0, high: 1, moderate: 0, low: 0, info: 0 }, dependencies_audited: 42,
        advisories: [{ id: 'GHSA-aaaa-bbbb-cccc', package: 'left-pad', installed: '1.0.0', range: '<1.0.1', severity: 'high', fix_available: true, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
      },
      { path: 'packages/foo/package-lock.json', status: 'failed', method: 'scratch-copy', npm_exit_code: null, reason: 'npm audit did not produce parseable JSON (registry unreachable, or npm printed a non-JSON error)' },
      { path: 'packages/bar/pnpm-lock.yaml', status: 'not-run', manager: 'pnpm', reason: 'pnpm is not available on the runner; run `pnpm audit` where it is, or re-run dependency-scan there' },
    ],
    exit: 1,
  };
  const raw = JSON.stringify(doc);
  // (a) convert: one gap per advisory, one gap per failed lockfile, one fact per unaudited lockfile
  const rows = convert('dependency-scan', raw, 1);
  const cats = rows.map((r) => r.native_category).sort().join(',');
  if (cats !== 'high,lockfile-failed,lockfile-not-audited,lockfile-not-audited') fail(`convert must yield high + lockfile-failed gaps and a lockfile-not-audited fact for each of the failed and not-run lockfiles (got ${cats || '(none)'})`);
  if (rows.filter((r) => r.polarity === 'gap').some((r) => !r.fix || r.severity || !viewSev(r))) fail('every dependency-scan gap carries a fix and no severity; the view bands it');
  if (rows.filter((r) => r.native_category === 'lockfile-not-audited').some((r) => r.polarity !== 'fact' || r.severity || r.fix)) fail('a lockfile-not-audited row is a fact: no severity, no fix');
  if (rows.some((r) => r.polarity === 'gap' && r.evidence[0] === 'packages/bar/pnpm-lock.yaml:1')) fail('a lockfile the instrument could not run on (its package manager unavailable) is the instrument\'s limit, never a gap against the target');
  if (!/pnpm is not available/.test(rows.find((r) => r.evidence[0] === 'packages/bar/pnpm-lock.yaml:1')?.observation || '')) fail('the not-run fact must carry the instrument\'s reason');
  const by = Object.fromEntries(rows.filter((r) => r.polarity === 'gap').map((r) => [r.native_category, r]));
  if (viewSev(by.high) !== 'High') fail(`a high advisory must read High in the view (got ${viewSev(by.high)})`);
  if (viewSev(by['lockfile-failed']) !== 'Medium') fail('a failed lockfile reads Medium in the view');
  const legacy = convert('dependency-scan', JSON.stringify({ ...doc, lockfiles: [{ path: 'yarn.lock', status: 'not-supported', manager: 'yarn', reason: 'old document' }] }), 1);
  if (legacy.map((r) => `${r.native_category}/${r.polarity}`).join() !== 'lockfile-not-audited/fact') fail(`a document from before 0.2.0 (status not-supported) converts to the not-audited fact, not a gap (got ${legacy.map((r) => r.native_category + '/' + r.polarity).join()})`);
  if (by.high?.evidence[0] !== 'package-lock.json:1') fail(`an advisory row must cite its lockfile at :1 (got ${by.high?.evidence[0]})`);
  if (by['lockfile-failed']?.evidence[0] !== 'packages/foo/package-lock.json:1') fail('a failed-lockfile row must cite its own lockfile path');
  if (!/left-pad/.test(by.high?.fix || '') || !/GHSA-aaaa-bbbb-cccc/.test(by.high?.observation || '')) fail('an advisory row must name the package (fix) and the advisory id (observation)');
  if (rows[0]?.id !== 'F-950') fail(`dependency-scan ids start at F-950 (got ${rows[0]?.id})`);
  // (b) a runner crash halts; an exit/document mismatch halts; truncation halts
  mustThrow('a runner crash (exit 2)', () => convert('dependency-scan', raw, 2));
  mustThrow('a document whose exit disagrees with the runner exit', () => convert('dependency-scan', raw, 0));
  mustThrow('a truncated document (no lockfiles)', () => convert('dependency-scan', JSON.stringify({ tool: 'dependency-scan', exit: 1 }), 1));
  mustThrow('a foreign report', () => convert('dependency-scan', '[]', 0));
  mustThrow('a lockfile row with no status', () => convert('dependency-scan', JSON.stringify({ ...doc, lockfiles: doc.lockfiles.map((l) => l.path === 'package-lock.json' ? { ...l, status: undefined } : l) }), 1));
  mustThrow('an advisory with no severity', () => convert('dependency-scan', JSON.stringify({ ...doc, lockfiles: doc.lockfiles.map((l) => l.path === 'package-lock.json' ? { ...l, advisories: [{ ...l.advisories[0], severity: undefined }] } : l) }), 1));
  // (c) a clean document (exit 0, no advisories, every lockfile audited) is a verified-clean run
  const cleanDoc = { ...doc, exit: 0, lockfiles: [{ path: 'package-lock.json', status: 'audited', method: 'in-place', npm_exit_code: 0, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }, dependencies_audited: 42, advisories: [] }] };
  if (convert('dependency-scan', JSON.stringify(cleanDoc), 0).length !== 0) fail('an all-clean document (exit 0) must convert to zero rows (the explicit empty file records the run)');
  // (d) projection: every category maps, onto the shared code-security axis, and the instrument contributes none
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`dependency-scan rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  const axisOf = (cat) => proj.projected.find((p) => p.f.native_category === cat)?.axis;
  if (axisOf('high') !== 'code-security' || axisOf('lockfile-failed') !== 'code-security' || axisOf('lockfile-not-audited') !== 'code-security') fail('every dependency-scan category must land on code-security');
  if (contributedBySources(adaptersOnce(), ['dependency-scan']).size !== 0) fail('dependency-scan is an instrument and must contribute no axis');
  const rogue = projectMulti([{ ...rows[0], native_category: 'severe' }], adaptersOnce());
  if (!rogue.unmapped.length) fail('an unknown dependency-scan category must halt at projection (default: FAIL)');
  // (e) yardstick: d-dependencies-known-clean decides on the `critical` category alone
  let reg = null;
  try { reg = loadYardstick(); } catch (e) { fail('yardstick failed to load: ' + e.message.split('\n')[0]); }
  if (reg) {
    const ranHigh = measureRun({
      findings: [{ id: 'F-1', source: 'dependency-scan', native_category: 'high', polarity: 'gap' }],
      manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (ranHigh?.status !== 'met') fail(`zero critical rows (even with a high row present) must read d-dependencies-known-clean met (got ${ranHigh?.status})`);
    const ranCritical = measureRun({
      findings: [{ id: 'F-1', source: 'dependency-scan', native_category: 'critical', polarity: 'gap' }],
      manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (ranCritical?.status !== 'unmet') fail(`a critical row must read d-dependencies-known-clean unmet (got ${ranCritical?.status})`);
    const skipped = measureRun({
      findings: [], manifest: [{ scanner: 'dependency-scan', status: 'skipped', reason: 'no registry reach' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (skipped?.status !== 'not-measured' || !/no registry reach/.test(skipped.note || '')) fail(`a skipped manifest must read not-measured with the recorded reason (got ${skipped?.status}/${skipped?.note})`);
    // an unaudited lockfile is not a clean one: before the fact existed, a run whose only
    // lockfile went unaudited (pnpm not on the runner, or npm audit erroring) read MET
    const dRow = (findings) => measureRun({ findings, manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    const notRunOnly = convert('dependency-scan', JSON.stringify({ ...doc, lockfiles: [doc.lockfiles[2]] }), 1);
    const nr = dRow(notRunOnly);
    if (nr?.status !== 'not-measured' || !/pnpm is not available/.test(nr.note || '')) fail(`a run whose only lockfile was not audited must read not-measured, never met (got ${nr?.status}/${nr?.note})`);
    const failedOnly = dRow(convert('dependency-scan', JSON.stringify({ ...doc, lockfiles: [doc.lockfiles[1]] }), 1));
    if (failedOnly?.status !== 'not-measured') fail(`a run whose only lockfile failed its audit must read not-measured, never met (got ${failedOnly?.status})`);
    const withCritical = dRow([...notRunOnly, { id: 'F-9', source: 'dependency-scan', native_category: 'critical', polarity: 'gap' }]);
    if (withCritical?.status !== 'unmet') fail(`a real critical advisory elsewhere governs over an unaudited lockfile (got ${withCritical?.status})`);
  }
  // (g) pnpm / yarn classic audits, parsed from real reports (tests/instruments/*-audit-sample.*):
  // the same six advisories through both, the critical one kept; anything that is not an
  // audit (another exit code, no report, an error line, no summary) is a failure, never clean
  const pnpmOut = readFileSync(join(HERE, 'instruments', 'pnpm-audit-sample.json'), 'utf8');
  const yarnOut = readFileSync(join(HERE, 'instruments', 'yarn-audit-sample.ndjson'), 'utf8');
  const pp = parsePnpmAudit(pnpmOut, 1), yp = parseYarnClassicAudit(yarnOut, 28);
  const sig = (r) => (r.advisories || []).map((a) => `${a.id}@${a.package}:${a.severity}`).sort().join(',');
  if (!pp.ok || pp.advisories.length !== 6 || pp.counts.critical !== 1 || !pp.advisories.some((a) => a.id === 'GHSA-xvch-5gv4-984h' && a.package === 'minimist' && a.severity === 'critical' && a.installed === '1.2.5')) fail(`pnpm audit: six advisories, minimist's critical GHSA-xvch-5gv4-984h at 1.2.5 among them (got ${JSON.stringify(pp).slice(0, 200)})`);
  if (!yp.ok || sig(yp) !== sig(pp)) fail('yarn classic audit of the same dependencies must yield the same advisories as pnpm');
  if (parsePnpmAudit(pnpmOut, 2).ok) fail('pnpm audit exiting 2 is not an audit');
  if (parsePnpmAudit('ERR_PNPM_AUDIT_BAD_RESPONSE', 1).ok) fail('a non-JSON pnpm audit is not an audit');
  if (parseYarnClassicAudit(yarnOut.split('\n').filter((l) => !l.includes('auditSummary')).join('\n'), 28).ok) fail('a yarn audit with no auditSummary is not an audit');
  if (parseYarnClassicAudit('{"type":"error","data":"registry unreachable"}\n', 1).ok) fail('a yarn audit error line is not an audit');
  if (parseYarnClassicAudit(yarnOut, 32).ok) fail('a yarn exit outside the 0-31 severity bitmask is not an audit');
  // (h) end to end: a pnpm lockfile audited through the offline pnpm shim; with no pnpm on
  // the runner the same lockfile reads not-run with the reason (never failed, never clean)
  const tmpP = join(HERE, 'tmp-dep-pnpm'); rmSync(tmpP, { recursive: true, force: true }); mkdirSync(tmpP, { recursive: true });
  writeFileSync(join(tmpP, 'package.json'), JSON.stringify({ name: 'p', dependencies: { lodash: '4.17.20', minimist: '1.2.5' } }));
  writeFileSync(join(tmpP, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = `${join(HERE, 'instruments', 'shims')}:${savedPath}`;
    const withPnpm = runDependencyScan({ target: tmpP, timeout: 30, log: () => {} });
    const lf = withPnpm.lockfiles[0] || {};
    if (lf.status !== 'audited' || lf.manager !== 'pnpm' || (lf.advisories || []).length !== 6 || withPnpm.exit !== 1) fail(`a pnpm lockfile with pnpm on the runner is audited (got ${lf.status}/${lf.manager}/${(lf.advisories || []).length}/${withPnpm.exit})`);
    process.env.PATH = join(tmpP, 'no-such-bin');
    const noPnpm = runDependencyScan({ target: tmpP, timeout: 30, log: () => {} });
    const nlf = noPnpm.lockfiles[0] || {};
    if (nlf.status !== 'not-run' || !/pnpm is not available/.test(nlf.reason || '') || noPnpm.exit !== 1) fail(`with no pnpm on the runner the lockfile reads not-run with the reason, and the run is not clean (got ${nlf.status}/${nlf.reason}/${noPnpm.exit})`);
  } finally { process.env.PATH = savedPath; }
  rmSync(tmpP, { recursive: true, force: true });
  // (f) manifests / noManifest: a manifest with dependencies and no lockfile covering
  // it is a FACT (not a gap) — zero lockfiles audited is never clean, but it is a
  // different claim than a known advisory. Decides d-dependencies-known-clean
  // not-measured; zero manifests anywhere decides not-applicable.
  const noLockDoc = { tool: 'dependency-scan', version: '0.1.0', started_at: 't1', finished_at: 't2', target: { path: 'x' }, timeout_seconds: 300, lockfiles: [], manifests: [{ path: 'package.json', status: 'no-lockfile' }], noManifest: false, exit: 1 };
  const noLockRows = convert('dependency-scan', JSON.stringify(noLockDoc), 1);
  const noLockFact = noLockRows.find((r) => r.native_category === 'no-lockfile');
  if (noLockFact?.polarity !== 'fact' || !/no lockfile/.test(noLockFact?.observation || '')) fail(`a manifest with no lockfile must convert to a FACT row naming "no lockfile" (got ${JSON.stringify(noLockFact)})`);
  if (noLockFact?.severity || noLockFact?.fix) fail('the no-lockfile fact row carries neither severity nor fix (it is not a gap)');
  const noManifestDoc = { ...noLockDoc, manifests: [], noManifest: true, exit: 0 };
  const noManifestRows = convert('dependency-scan', JSON.stringify(noManifestDoc), 0);
  const noManifestFact = noManifestRows.find((r) => r.native_category === 'no-manifest');
  if (noManifestFact?.polarity !== 'fact') fail(`noManifest: true must convert to a no-manifest FACT row (got ${JSON.stringify(noManifestFact)})`);
  mustThrow('a manifest row with a bad status', () => convert('dependency-scan', JSON.stringify({ ...noLockDoc, manifests: [{ path: 'x', status: 'bogus' }] }), 1));
  if (reg) {
    const nmRow = measureRun({ findings: noLockRows, manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (nmRow?.status !== 'not-measured' || !/no lockfile/.test(nmRow.note || '')) fail(`a manifest with no lockfile must read d-dependencies-known-clean not-measured (got ${nmRow?.status}/${nmRow?.note})`);
    const naRow = measureRun({ findings: noManifestRows, manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (naRow?.status !== 'not-applicable') fail(`zero manifests anywhere must read d-dependencies-known-clean not-applicable (got ${naRow?.status})`);
    // a real critical advisory always governs over either fact
    const bothRow = measureRun({ findings: [...noLockRows, { id: 'F-9', source: 'dependency-scan', native_category: 'critical', polarity: 'gap' }], manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (bothRow?.status !== 'unmet') fail(`a real critical advisory must govern over the no-lockfile fact (got ${bothRow?.status})`);
  }
  const projNl = projectMulti(noManifestRows.concat(noLockRows), adaptersOnce());
  if (projNl.unmapped.length) fail(`no-lockfile / no-manifest rows must map (unmapped: ${projNl.unmapped.map((u) => u.cat).join(', ')})`);
}
