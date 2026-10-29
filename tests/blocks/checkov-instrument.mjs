// ── checkov through its adapter: the checks-report format over the envelope (#181) ──
// The adapter's fail-loud block (map/scanners/INTAKE.md). Over a recorded run against three
// invented files (tests/instruments/checkov/README.md): each failed check is a gap keyed by
// its framework and cited at the resource's first line; each file a framework read is a
// config-audited fact; a file it could not parse is a config-not-audited fact, never
// silence; an empty summary (no IaC or container file) is one no-input fact. Halts: a
// report that is not JSON, a summary counting resources with no framework report, a
// framework report without its check lists, a failed check with no id or file, an exit
// outside the success set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';
import { projectRun } from '../../yardstick/measure.mjs';
import { loadFindings, loadManifest } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'checkov-instrument';

export async function run() {
  const fail = (m) => negFailures.push('checkov-instrument: ' + m);
  const raw = readFileSync(join(HERE, 'instruments', 'checkov', 'planted-iac.envelope.json'), 'utf8');
  const env = JSON.parse(raw);
  const report = JSON.parse(env.report);
  const withReport = (mut) => JSON.stringify({ ...env, report: JSON.stringify(mut(structuredClone(report))) });
  const mustThrow = (what, text, exit, re) => {
    try { convert('checkov', text, exit, null); fail(`${what} must halt`); }
    catch (e) { if (re && !re.test(e.message)) fail(`${what} must halt for its own reason (got: ${e.message})`); }
  };

  const rows = convert('checkov', raw, 1, null);
  const by = (cat) => rows.filter((r) => r.native_category === cat);
  if (by('dockerfile').length !== 2 || by('terraform').length !== 7) fail(`the planted files fail 2 dockerfile and 7 terraform checks (got ${by('dockerfile').length} and ${by('terraform').length})`);
  if (!by('dockerfile').every((r) => r.evidence[0] === 'Dockerfile:1' && r.polarity === 'gap')) fail('a failed check cites its file and the resource\'s first line');
  if (by('config-audited').map((r) => r.evidence[0]).sort().join() !== 'Dockerfile:1,main.tf:1') fail(`each file a framework read is a config-audited fact (got ${by('config-audited').map((r) => r.evidence[0]).join()})`);
  if (by('config-not-audited').length !== 1 || by('config-not-audited')[0].evidence[0] !== 'bad.tf:1') fail('the file checkov could not parse is a config-not-audited fact');
  if (rows.some((r) => 'severity' in r)) fail('an instrument row asserts no severity');
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`every row maps (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.native_category === 'terraform')?.f.severity !== 'Medium') fail('a failed check reaches the views banded Medium (the open policy set carries no severity)');

  const empty = convert('checkov', JSON.stringify({ ...env, exit: 0, report: JSON.stringify({ passed: 0, failed: 0, skipped: 0, parsing_errors: 0, resource_count: 0, checkov_version: '3.4.0' }) }), 0, null);
  if (empty.length !== 1 || empty[0].native_category !== 'no-input') fail('an empty summary is one no-input fact');

  mustThrow('an exit outside the success set', JSON.stringify({ ...env, exit: 2 }), 2, /outside its success set/);
  mustThrow('a report that is not JSON', JSON.stringify({ ...env, report: env.report.slice(0, 100) }), 1, /not a checks report/);
  mustThrow('a summary that counts resources but carries no report', JSON.stringify({ ...env, report: JSON.stringify({ passed: 3, failed: 1, resource_count: 2 }) }), 1, /carries no framework report/);
  mustThrow('a framework report without its check lists', withReport((d) => { delete d[0].results.passed_checks; return d; }), 1, /no passed and failed check lists/);
  mustThrow('a failed check with no file', withReport((d) => { d[0].results.failed_checks[0].file_path = ''; return d; }), 1, /no id or file/);

  // over the stored fixture runs (map/scanners/INTAKE.md steps 3-5): what it recovers, and
  // the requirement it decides, read as the yardstick reads it
  const fx = (n) => join(HERE, 'fixtures', n);
  const recovered = (n, src) => { const s = score(loadFindings(fx(n)).filter((f) => !src || f.source === src), adaptersOnce(), parseYaml(readFileSync(join(fx(n), 'ANSWERS.yaml'), 'utf8')), loadManifest(fx(n))); return s.results.filter((x) => x.status === 'recovered').map((x) => x.id).sort(); };
  const req = (n, id) => projectRun(fx(n)).find((r) => r.id === id);
  const c = recovered('infra', 'checkov');
  for (const id of ['P-01', 'P-02', 'I-01', 'I-02', 'I-03']) if (!c.includes(id)) fail(`checkov's rows alone recover ${id} over the infra target (got ${c.join(', ')})`);
  const infra = req('infra', 'd-infrastructure-config-secure');
  if (infra?.status !== 'unmet') fail(`d-infrastructure-config-secure reads unmet over the infra target (got ${infra?.status}: ${infra?.note})`);
  for (const n of ['notesbox', 'cleanlib', 'lockfiles']) { const r = req(n, 'd-infrastructure-config-secure'); if (r?.status !== 'not-applicable') fail(`${n} holds no IaC or container file: d-infrastructure-config-secure reads not-applicable, never met (got ${r?.status}: ${r?.note})`); }
  const root = req('fixtures-root', 'd-infrastructure-config-secure');
  if (root?.status !== 'not-measured' || !/path-scoped/.test(root.note || '')) fail(`at the root, where it is not run, the row reads not-measured with the reason (got ${root?.status}: ${root?.note})`);
}
