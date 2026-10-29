// ── zizmor through its adapter: the sarif format over the runner's envelope (#180) ──
// The adapter's fail-loud block (map/scanners/INTAKE.md). Over a recorded run against the
// public fixtures root (tests/instruments/zizmor/): every result lands one gap row, keyed
// by its audit, cited at the file and line, banded from the audit's own severity; a run
// that found nothing to read is one no-input fact. Halts: a raw that is not the runner's
// envelope, from another scanner, or whose exit disagrees; a report that is not SARIF, has
// no runs, is from another tool, or has no results list; a result with no rule or no
// location; an exit outside the success set; and an audit the adapter does not map.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';
import { projectRun } from '../../yardstick/measure.mjs';
import { loadFindings, loadManifest } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'zizmor-instrument';

export async function run() {
  const fail = (m) => negFailures.push('zizmor-instrument: ' + m);
  const raw = readFileSync(join(HERE, 'instruments', 'zizmor', 'fixtures-root.envelope.json'), 'utf8');
  const env = JSON.parse(raw);
  const sarif = JSON.parse(env.report);
  const withReport = (mut) => JSON.stringify({ ...env, report: JSON.stringify(mut(structuredClone(sarif))) });
  const mustThrow = (what, text, exit, re) => {
    try { convert('zizmor', text, exit, null); fail(`${what} must halt`); }
    catch (e) { if (re && !re.test(e.message)) fail(`${what} must halt for its own reason (got: ${e.message})`); }
  };

  const rows = convert('zizmor', raw, 0, null);
  const cats = rows.map((r) => r.native_category).sort();
  if (rows.length !== 9 || cats.filter((c) => c === 'unpinned-uses').length !== 4 || cats.filter((c) => c === 'excessive-permissions').length !== 3 || cats.filter((c) => c === 'artipacked').length !== 2) fail(`the recorded run yields 4 unpinned-uses, 3 excessive-permissions and 2 artipacked rows (got ${cats.join(', ')})`);
  const pin = rows.find((r) => r.native_category === 'unpinned-uses');
  if (pin?.evidence?.[0] !== '.github/workflows/ci.yml:14' || pin.polarity !== 'gap' || 'severity' in pin) fail(`a row cites the file and line, is a gap and asserts no severity (got ${JSON.stringify(pin)})`);
  if (!/full 40-character commit SHA/.test(pin?.fix || '')) fail('a mapped audit carries the adapter\'s fix');
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`every recorded audit maps (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.native_category === 'unpinned-uses')?.f.severity !== 'High') fail('unpinned-uses reaches the views banded High, from the audit\'s own severity');
  if (proj.projected.find((p) => p.f.native_category === 'artipacked')?.f.severity !== 'Medium') fail('artipacked reaches the views banded Medium');

  const none = convert('zizmor', JSON.stringify({ envelope: 1, scanner: 'zizmor', exit: 0, no_input: true, report: null, stderr: [] }), 0, null);
  if (none.length !== 1 || none[0].native_category !== 'no-input' || none[0].polarity !== 'fact') fail('a run with nothing to read is one no-input fact');
  const clean = convert('zizmor', withReport((d) => { d.runs[0].results = []; return d; }), 0, null);
  if (clean.length !== 0) fail('an empty results list is a recorded clean run');

  mustThrow('a raw that is the bare SARIF', env.report, 0, /not the runner's envelope/);
  mustThrow('an envelope from another scanner', JSON.stringify({ ...env, scanner: 'other' }), 0, /envelope is from "other"/);
  mustThrow('an envelope whose exit disagrees', raw, 3, /exited 3, outside its success set/);
  mustThrow('an exit the envelope does not record', JSON.stringify({ ...env, exit: 1 }), 0, /records exit 1, not the 0 given/);
  mustThrow('a report that is not JSON', JSON.stringify({ ...env, report: env.report.slice(0, 200) }), 0, /not SARIF JSON/);
  mustThrow('a SARIF with no runs', withReport((d) => { d.runs = []; return d; }), 0, /has no runs/);
  mustThrow('a SARIF from another tool', withReport((d) => { d.runs[0].tool.driver.name = 'other'; return d; }), 0, /is from "other"/);
  mustThrow('a run with no results list', withReport((d) => { delete d.runs[0].results; return d; }), 0, /no results list/);
  mustThrow('a result with no rule', withReport((d) => { delete d.runs[0].results[0].ruleId; return d; }), 0, /no ruleId/);
  mustThrow('a result with no location', withReport((d) => { d.runs[0].results[0].locations = []; return d; }), 0, /no file and line/);
  const novel = convert('zizmor', withReport((d) => { d.runs[0].results[0].ruleId = 'zizmor/a-new-audit'; return d; }), 0, null);
  if (!projectMulti(novel, adaptersOnce()).unmapped.some((u) => u.cat === 'zizmor:a-new-audit')) fail('an audit the adapter does not map halts the projection (default: FAIL)');

  // over the stored fixture runs (map/scanners/INTAKE.md steps 3-5): what it recovers, and
  // the requirement it decides, read as the yardstick reads it
  const fx = (n) => join(HERE, 'fixtures', n);
  const recovered = (n, src) => { const s = score(loadFindings(fx(n)).filter((f) => !src || f.source === src), adaptersOnce(), parseYaml(readFileSync(join(fx(n), 'ANSWERS.yaml'), 'utf8')), loadManifest(fx(n))); return s.results.filter((x) => x.status === 'recovered').map((x) => x.id).sort(); };
  const req = (n, id) => projectRun(fx(n)).find((r) => r.id === id);
  const z = recovered('fixtures-root', 'zizmor');
  for (const id of ['R-02', 'R-I10', 'R-I11', 'R-I12']) if (!z.includes(id)) fail(`zizmor's rows alone recover ${id} at the fixtures root (got ${z.join(', ')})`);
  const pinned = req('fixtures-root', 'd-dependencies-pinned');
  if (pinned?.status !== 'unmet' || !/deep-code-review: /.test(pinned.note) || !/zizmor: /.test(pinned.note)) fail(`d-dependencies-pinned reads unmet at the fixtures root, decided by the reviewer and zizmor together (got ${pinned?.status}: ${pinned?.note})`);
  const nb = req('notesbox', 'd-dependencies-pinned');
  // at a target zizmor is not run over, the reviewer's K gap still decides the row, and the
  // note names zizmor's skip with its reason
  if (nb?.status !== 'unmet' || !/zizmor: zizmor skipped: repo-scoped/.test(nb.note || '')) fail(`at notesbox the reviewer's gap decides d-dependencies-pinned and zizmor's skip is named (got ${nb?.status}: ${nb?.note})`);
}
