// ── two code-maintainability rows a structure-scan run decides (#110) ─────────
// d-no-drifting-duplicates (structure-scan `duplicate`) and d-no-dead-code
// (structure-scan `unused` and `stale-artifact`) are instrument rows on the
// code-maintainability topic, floor and fleet. Pinned on synthetic rows shaped like
// map/ingest.mjs's structure-scan profile:
//   (a) the register carries both, as instrument rows of structure-scan, with
//       owner.risk / owner.fix; d-one-home-per-fact stays a claim and its check names
//       the row that now carries its code half;
//   (b) a gap reads unmet, citing it; a clean run reads met; a tool not run reads
//       not-measured with its own reason (never met); no package.json reads
//       d-no-dead-code not-applicable; a stale artifact joins d-no-dead-code's
//       population and governs over a knip that did not run; structure-scan absent
//       from the run record reads not-measured;
//   (d) knip's unused files, exports, types and members decide d-no-dead-code only
//       when the target configures knip (#121); unconfigured they stay rows flagged
//       detail.unconfigured, and an unused dependency decides it either way;
//   (c) Owner renders each row's risk and fix, and Intake lists each with its check.
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../../map/ingest.mjs';
import * as SS from '../../map/structure-scan.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'yardstick-maintainability';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-maintainability: ' + m);
  const reg = loadYardstick();
  const byId = Object.fromEntries(reg.requirements.map((d) => [d.id, d]));
  const want = { 'd-no-drifting-duplicates': ['duplicate'], 'd-no-dead-code': ['unused', 'stale-artifact'] };
  // (a) the rows themselves
  for (const [id, cats] of Object.entries(want)) {
    const d = byId[id];
    if (!d) { fail(`the register must carry ${id}`); continue; }
    const got = (Array.isArray(d.decide.category) ? d.decide.category : [d.decide.category]).map(String);
    if (d.decide.kind !== 'instrument' || d.decide.scanner !== 'structure-scan' || got.join(',') !== cats.join(','))
      fail(`${id} must be decided by structure-scan category ${cats.join(' + ')} (got ${d.decide.kind} ${d.decide.scanner} ${got.join(',')})`);
    if (d.tier !== 'legibility' || d.topic !== 'code-maintainability') fail(`${id} must be tier legibility, topic code-maintainability (got ${d.tier}, ${d.topic})`);
    if (!['floor', 'fleet'].every((t) => (d.tags || []).includes(t))) fail(`${id} must be tagged floor and fleet (got ${(d.tags || []).join(',')})`);
    if (!String(d.owner?.risk || '').trim() || !String(d.owner?.fix || '').trim()) fail(`${id} must carry owner.risk and owner.fix`);
  }
  if (!/50 tokens/.test(String(byId['d-no-drifting-duplicates']?.check || ''))) fail('d-no-drifting-duplicates states its own clone threshold (50 tokens) in check');
  const home = byId['d-one-home-per-fact'];
  if (home?.decide.kind !== 'claim' || !/d-no-drifting-duplicates/.test(String(home?.check || ''))) fail('d-one-home-per-fact stays a claim and its check names d-no-drifting-duplicates as its code half');
  if (!byId['d-no-drifting-duplicates'] || !byId['d-no-dead-code']) return;

  // (b) the four readings, from rows shaped like the structure-scan ingest profile
  const ran = [{ scanner: 'structure-scan', status: 'ran' }];
  const r = (id, cat, polarity, observation = 'x') => ({ id, source: 'structure-scan', native_category: cat, polarity, observation, evidence: ['a.js:1'], axis: 'code-maintainability' });
  const measure = (findings, manifest = ran) => Object.fromEntries(measureRun({ findings, manifest, inputs: null, coverage: {} }, reg).map((x) => [x.id, x]));
  const expect = (m, id, status, why, re) => {
    if (m[id]?.status !== status) fail(`${why}: ${id} must read ${status} (got ${m[id]?.status}: ${m[id]?.note})`);
    else if (re && !re.test(String(m[id].note || ''))) fail(`${why}: ${id}'s note must carry ${re} (got ${m[id].note})`);
  };
  const gaps = measure([r('F-1', 'duplicate', 'gap'), r('F-2', 'unused', 'gap')]);
  expect(gaps, 'd-no-drifting-duplicates', 'unmet', 'a clone pair');
  expect(gaps, 'd-no-dead-code', 'unmet', 'an unused export');
  if (!gaps['d-no-drifting-duplicates']?.findings.includes('F-1') || !gaps['d-no-dead-code']?.findings.includes('F-2')) fail('an unmet row cites the gap that unmet it');
  const clean = measure([]);
  expect(clean, 'd-no-drifting-duplicates', 'met', 'a clean structure-scan run');
  expect(clean, 'd-no-dead-code', 'met', 'a clean structure-scan run');
  const notRun = measure([r('F-3', 'duplicate-not-run', 'fact', 'jscpd failed: exit 3.'), r('F-4', 'unused-not-run', 'fact', 'knip skipped: no exec permission.')]);
  expect(notRun, 'd-no-drifting-duplicates', 'not-measured', 'jscpd not run', /jscpd failed/);
  expect(notRun, 'd-no-dead-code', 'not-measured', 'knip not run', /knip skipped/);
  const noPkg = measure([r('F-5', 'unused-not-applicable', 'fact', 'No package.json at the root.')]);
  expect(noPkg, 'd-no-dead-code', 'not-applicable', 'no package.json', /No package\.json/);
  expect(noPkg, 'd-no-drifting-duplicates', 'met', 'no package.json but jscpd ran clean');
  const staleBesideSkip = measure([r('F-6', 'stale-artifact', 'gap'), r('F-4', 'unused-not-run', 'fact', 'knip skipped.')]);
  expect(staleBesideSkip, 'd-no-dead-code', 'unmet', 'a stale artifact beside a knip not run');
  if (!staleBesideSkip['d-no-dead-code']?.findings.includes('F-6')) fail('a stale artifact joins d-no-dead-code\'s population');
  const absent = measure([], []);
  expect(absent, 'd-no-drifting-duplicates', 'not-measured', 'structure-scan absent from the run record');
  expect(absent, 'd-no-dead-code', 'not-measured', 'structure-scan absent from the run record');

  // (d) knip's unused exports and files are evidence only where the target names its entry
  // points (#121): a notesbox-style target whose cli.mjs dispatches commands/*.mjs by path
  // and carries no knip configuration keeps those rows (flagged detail.unconfigured) but
  // reads d-no-dead-code met on them alone; the same target with a knip.json reads unmet;
  // an unused dependency reads unmet either way
  const ssDoc = (config, unused) => JSON.stringify({ tool: 'structure-scan', version: SS.VERSION, exit: 1, history: 'none', churn: {}, duplicates: [], stale: [],
    tools: { jscpd: { status: 'ran', version: SS.TOOLS.jscpd }, knip: { status: 'ran', version: SS.TOOLS.knip, exit_code: 1, ...(config === undefined ? {} : { config }) } }, unused });
  const dispatched = [{ kind: 'files', file: 'commands/export.mjs', line: 1, name: 'commands/export.mjs' }, { kind: 'exports', file: 'commands/export.mjs', line: 4, name: 'exportNotes' }, { kind: 'types', file: 'lib/note.ts', line: 2, name: 'Note' }];
  const dep = { kind: 'dependencies', file: 'package.json', line: 7, name: 'left-pad' };
  const readDoc = (config, unused) => { try { return convert('structure-scan', ssDoc(config, unused), 1); } catch (e) { fail(`ingest must read a structure-scan document whose knip config is ${JSON.stringify(config)} (${e.message})`); return []; } };
  const bare = readDoc(null, dispatched);
  const flags = bare.filter((x) => x.native_category === 'unused').map((x) => x.detail?.unconfigured === true);
  if (flags.length !== 3 || !flags.every(Boolean)) fail(`with no knip configuration every unused file, export and type row stays a row, flagged detail.unconfigured (got ${JSON.stringify(bare.map((x) => x.detail))})`);
  const bareM = measure(bare);
  expect(bareM, 'd-no-dead-code', 'met', 'unused exports and files of a path-dispatched target with no knip configuration', /unconfigured/);
  const configured = readDoc('knip.json', dispatched);
  if (configured.some((x) => 'unconfigured' in (x.detail || {}))) fail('with a knip configuration no unused row is flagged unconfigured');
  expect(measure(configured), 'd-no-dead-code', 'unmet', 'the same unused exports and files with a knip.json');
  for (const config of [null, 'knip.json']) {
    const withDep = readDoc(config, [...dispatched, dep]);
    if (withDep.find((x) => x.detail?.kind === 'dependencies')?.detail?.unconfigured) fail('an unused dependency is never flagged unconfigured');
    const m = measure(withDep);
    expect(m, 'd-no-dead-code', 'unmet', `an unused dependency (knip config ${config})`);
    if (config === null && JSON.stringify(m['d-no-dead-code']?.findings) !== JSON.stringify(withDep.filter((x) => x.detail?.kind === 'dependencies').map((x) => x.id))) fail(`with no knip configuration d-no-dead-code cites the unused dependency alone (got ${m['d-no-dead-code']?.findings})`);
  }
  let threw = false; try { convert('structure-scan', ssDoc(undefined, dispatched), 1); } catch { threw = true; }
  if (!threw) fail('a report listing unused items whose knip record does not say whether the target configured knip must halt ingest, never guess');
  if (!/knip configuration/.test(String(byId['d-no-dead-code'].check))) fail('d-no-dead-code\'s check states that unused exports and files decide it only under a knip configuration');
  // the instrument reads the configuration from the target's tree, the files knip itself reads
  const cfgDir = join(HERE, 'tmp-yardstick-knip-config'); rmSync(cfgDir, { recursive: true, force: true }); mkdirSync(cfgDir, { recursive: true });
  writeFileSync(join(cfgDir, 'package.json'), JSON.stringify({ name: 'notesbox' }));
  if (SS.knipConfig(cfgDir) !== null) fail(`a package.json with no knip key and no knip file reads no configuration (got ${SS.knipConfig(cfgDir)})`);
  writeFileSync(join(cfgDir, 'package.json'), JSON.stringify({ name: 'notesbox', knip: { entry: ['commands/*.mjs'] } }));
  if (SS.knipConfig(cfgDir) !== 'package.json') fail(`a knip key in package.json reads as the configuration (got ${SS.knipConfig(cfgDir)})`);
  writeFileSync(join(cfgDir, 'package.json'), JSON.stringify({ name: 'notesbox' })); writeFileSync(join(cfgDir, 'knip.ts'), 'export default {};\n');
  if (SS.knipConfig(cfgDir) !== 'knip.ts') fail(`a knip.ts reads as the configuration (got ${SS.knipConfig(cfgDir)})`);
  rmSync(cfgDir, { recursive: true, force: true });

  // (c) the notesbox fixture records structure-scan skipped: measured and compiled, both
  // rows read not-measured with that reason; Owner carries each row's risk and fix and
  // renders them when the row is open; Intake lists each under To run with its check
  const tmp = join(HERE, 'tmp-yardstick-maintainability'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try {
    execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' });
    execFileSync(process.execPath, [join(ROOT, 'views', 'intake.mjs'), tmp], { stdio: 'pipe' });
  } catch (e) { fail(`measure --write and intake must succeed on the notesbox fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const ownerView = await import('../../views/owner.mjs');
  const built = ownerView.buildOwner(tmp);
  const intakePage = existsSync(join(tmp, 'INTAKE.md')) ? readFileSync(join(tmp, 'INTAKE.md'), 'utf8') : '';
  const toRun = intakePage.split('## To run')[1]?.split('\n## ')[0] || '';
  for (const id of Object.keys(want)) {
    const o = built?.floor.not_measured.find((x) => x.id === id);
    if (!o || !/structure-scan skipped/.test(String(o.reason))) fail(`Owner must read ${id} could-not-tell with the run record's reason (got ${o ? o.reason : 'no row'})`);
    else if (o.risk !== byId[id].owner.risk || o.fix !== byId[id].owner.fix) fail(`Owner must carry ${id}'s risk and fix from the register`);
    const line = toRun.split('\n').find((l) => l.includes(`**${id}**`)) || '';
    if (!line.includes(`Proving check: ${byId[id].check}`)) fail(`INTAKE.md must list ${id} under To run with its proving check (got: ${line || 'no line'})`);
  }
  if (built) {
    const open = Object.keys(want).map((id) => ({ ...built.floor.not_measured.find((x) => x.id === id), status: 'unmet' })).filter((x) => x.id);
    const empty = { open: [], not_measured: [], met: [], not_applicable: [] };
    const page = ownerView.renderMd('run', { floor: { ...empty, open }, beyond_floor: empty, not_looked_at: [] }, { name: 'app', date: '2026-10-05' });
    for (const id of Object.keys(want)) if (!page.includes(`What could happen: ${byId[id].owner.risk}`) || !page.includes(`What to do: ${byId[id].owner.fix}`)) fail(`OWNER.md must render ${id}'s risk and fix when it is open`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
