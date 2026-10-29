// ── osv-scanner through its adapter: the osv-results format over the envelope (#179) ──
// The adapter's fail-loud block (map/scanners/INTAKE.md). Over a recorded run against the
// public fixtures root (tests/instruments/osv-scanner/): each source scanned is a
// source-audited fact, each advisory group a gap banded from its CVSS score, and the
// lockfile it found but could not read (reported only on stderr) a source-failed gap and a
// source-not-audited fact, never silence. Exit 128 (no package source) is one no-input
// fact. Halts: a report that is not JSON or has no results list, a source with no path, an
// advisory with no package or id, an exit outside the success set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';
import { projectRun } from '../../yardstick/measure.mjs';
import { loadFindings, loadManifest } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'osv-scanner-instrument';

export async function run() {
  const fail = (m) => negFailures.push('osv-scanner-instrument: ' + m);
  const raw = readFileSync(join(HERE, 'instruments', 'osv-scanner', 'fixtures-root.envelope.json'), 'utf8');
  const env = JSON.parse(raw);
  const report = JSON.parse(env.report);
  const withReport = (mut) => JSON.stringify({ ...env, report: JSON.stringify(mut(structuredClone(report))) });
  const mustThrow = (what, text, exit, re) => {
    try { convert('osv-scanner', text, exit, null); fail(`${what} must halt`); }
    catch (e) { if (re && !re.test(e.message)) fail(`${what} must halt for its own reason (got: ${e.message})`); }
  };

  const rows = convert('osv-scanner', raw, 1, null);
  const by = (cat) => rows.filter((r) => r.native_category === cat);
  if (by('source-audited').length !== 1 || by('source-audited')[0].evidence[0] !== 'targets/lockfiles/app/package-lock.json:1') fail(`the scanned lockfile is one source-audited fact (got ${JSON.stringify(by('source-audited'))})`);
  const adv = by('critical');
  if (adv.length !== 1 || !/^GHSA-xvch-5gv4-984h@minimist@targets\/lockfiles\/app\/package-lock\.json$/.test(adv[0].native_id) || adv[0].polarity !== 'gap' || !adv[0].fix) fail(`the minimist advisory is one critical gap with a fix (got ${JSON.stringify(adv)})`);
  if (by('source-failed').length !== 1 || by('source-not-audited')[0]?.evidence[0] !== 'targets/lockfiles/legacy/package-lock.json:1') fail('the truncated lockfile, reported only on stderr, is a source-failed gap and a source-not-audited fact');
  if (rows.some((r) => 'severity' in r)) fail('an instrument row asserts no severity');
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`every row maps (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.native_category === 'critical')?.f.severity !== 'Critical') fail('a critical advisory reaches the views banded Critical');
  const scored = convert('osv-scanner', withReport((d) => { d.results[0].packages[0].groups[0].max_severity = '5.3'; return d; }), 1, null);
  if (!scored.some((r) => r.native_category === 'moderate')) fail('an advisory scored 5.3 is moderate');
  const unscored = convert('osv-scanner', withReport((d) => { d.results[0].packages[0].groups[0].max_severity = ''; return d; }), 1, null);
  if (!unscored.some((r) => r.native_category === 'unrated')) fail('an advisory with no score is unrated, never dropped');

  const none = convert('osv-scanner', JSON.stringify({ ...env, exit: 128, report: 'No package sources found' }), 128, null);
  if (none.length !== 1 || none[0].native_category !== 'no-input') fail('exit 128 (no package source in the tree) is one no-input fact');

  mustThrow('an exit outside the success set', JSON.stringify({ ...env, exit: 127 }), 127, /outside its success set/);
  mustThrow('a report that is not JSON', JSON.stringify({ ...env, report: env.report.slice(0, 100) }), 1, /not OSV results JSON/);
  mustThrow('a report with no results list', withReport((d) => { delete d.results; return d; }), 1, /no results list/);
  mustThrow('a source with no path', withReport((d) => { delete d.results[0].source.path; return d; }), 1, /no source path/);
  mustThrow('an advisory group with no id', withReport((d) => { d.results[0].packages[0].groups[0].ids = []; return d; }), 1, /no package or id/);

  // over the stored fixture runs (map/scanners/INTAKE.md steps 3-5): what it recovers, and
  // the requirement it decides, read as the yardstick reads it
  const fx = (n) => join(HERE, 'fixtures', n);
  const recovered = (n, src) => { const s = score(loadFindings(fx(n)).filter((f) => !src || f.source === src), adaptersOnce(), parseYaml(readFileSync(join(fx(n), 'ANSWERS.yaml'), 'utf8')), loadManifest(fx(n))); return s.results.filter((x) => x.status === 'recovered').map((x) => x.id).sort(); };
  const req = (n, id) => projectRun(fx(n)).find((r) => r.id === id);
  const o = recovered('lockfiles', 'osv-scanner');
  for (const id of ['P-01', 'P-02', 'P-03', 'I-04', 'I-05', 'I-06']) if (!o.includes(id)) fail(`osv-scanner's rows alone recover ${id} over the lockfiles target (got ${o.join(', ')})`);
  if (recovered('lockfiles', 'dependency-scan').includes('P-03')) fail('the pip pin (P-03) is one dependency-scan never reads');
  const known = req('lockfiles', 'd-dependencies-known-clean');
  if (known?.status !== 'unmet' || !/dependency-scan: /.test(known.note) || !/osv-scanner: /.test(known.note)) fail(`d-dependencies-known-clean reads unmet over the lockfiles target, from both auditors (got ${known?.status}: ${known?.note})`);
  // the pip pin alone: dependency-scan finds no package.json and steps aside; osv-scanner decides
  const pipOnly = (await import('../../yardstick/measure.mjs')).measureRun({ findings: loadFindings(fx('lockfiles')).filter((f) => f.source === 'osv-scanner' && /python\//.test(f.evidence[0])).concat([{ id: 'F-1', source: 'dependency-scan', native_id: 'no-manifest@root', native_category: 'no-manifest', polarity: 'fact', observation: 'no package.json', evidence: ['./:1'] }]), manifest: loadManifest(fx('lockfiles')), inputs: null, coverage: {} }).find((r) => r.id === 'd-dependencies-known-clean');
  if (pipOnly?.status !== 'unmet') fail(`a tree with only a vulnerable pip pin reads unmet, not not-applicable (got ${pipOnly?.status}: ${pipOnly?.note})`);
  const nbKnown = req('notesbox', 'd-dependencies-known-clean');
  if (nbKnown?.status !== 'met' || /osv-scanner/.test(nbKnown.note || '')) fail(`over a target with no package source, osv-scanner steps aside and dependency-scan's reading stands (got ${nbKnown?.status}: ${nbKnown?.note})`);
}
