// ── instrument-roster: a scanner's worth is a report, and a candidate has a procedure (#150) ──
// map/roster.mjs joins, per adopted, retired and candidate scanner, what the core
// already knows: the requirements it alone decides and so what would read
// not-measured if it were retired (static, from yardstick/requirements.yaml and the
// adapters), the known answers only it recovers and the facts it corroborates with
// another scanner (over fixture runs, through score and #151's scanner-free
// fingerprint), its cost off the run record (`duration:` and `spend:`), and the
// harness block that holds its fail-loud halts (the adapter's `fails_loud:`).
// map/scanners/INTAKE.md is the procedure; the invented quill-review
// (tests/instruments/quill-review/) goes through it end to end as the candidate.
// The adopted roster's counts over the committed fixture runs are pinned under
// `roster` in tests/golden.json.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAdapters, loadFindings, loadManifest, projectMulti } from '../../map/project.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { corroboratedFacts } from '../../yardstick/compare.mjs';
import { HERE, ROOT, current, negFailures } from '../harness.mjs';

export const label = 'instrument-roster';

const FIXTURE_RUNS = ['notesbox', 'cleanlib', 'fixtures-root'];
const CANDIDATE = 'quill-review';

export async function run() {
  const fail = (m) => negFailures.push('instrument-roster: ' + m);
  const R = await import('../../map/roster.mjs').catch((e) => { fail(`map/roster.mjs must exist and export the roster (${e.message.split('\n')[0]})`); return null; });
  const reg = loadYardstick();
  const adapters = loadAdapters();
  const fixtureDir = (n) => join(HERE, 'fixtures', n);

  // ── the procedure is written down, in the vocabulary the adapters use ──
  const intakePath = join(ROOT, 'map', 'scanners', 'INTAKE.md');
  if (!existsSync(intakePath)) fail('map/scanners/INTAKE.md must state the procedure a candidate scanner goes through');
  else {
    const doc = readFileSync(intakePath, 'utf8');
    for (const [what, re] of [
      ['the adapter fields the core reads (role, ingest, method)', /`role:`[\s\S]*`ingest:`[\s\S]*`method:`/],
      ['the fail-loud block an adapter names', /`fails_loud:`/],
      ['the roster command', /node assay\.mjs roster/],
      ['the cost the run record carries', /`duration:`[\s\S]*`spend:`|`spend:`[\s\S]*`duration:`/],
      ['the known-answer sheets (instruments: and requirements:)', /`instruments:`[\s\S]*`requirements:`/],
      ['the offline rule for an adopted instrument', /offline/i],
      ['what retirement leaves (not measured)', /not[- ]measured/],
    ]) if (!re.test(doc)) fail(`INTAKE.md must name ${what}`);
  }
  if (!R) return;

  // ── static: what each scanner alone decides, read off the yardstick ──
  const stat = R.roster(adapters, reg, []);
  const byId = Object.fromEntries(stat.map((r) => [r.scanner, r]));
  const ids = Object.keys(adapters).sort();
  if (stat.map((r) => r.scanner).join(',') !== ids.join(',')) fail(`the roster must carry one row per adapter, sorted (got ${stat.map((r) => r.scanner).join(',')})`);
  for (const id of ids) {
    const want = reg.requirements.filter((d) => d.decide?.kind === 'instrument' && d.decide.scanner === id).map((d) => d.id).sort();
    const row = byId[id];
    if (!row) continue;
    if (JSON.stringify(row.decides_alone) !== JSON.stringify(want)) fail(`${id}: decides_alone must be the instrument rows naming it as decide.scanner (want ${want.join(',') || 'none'}, got ${(row.decides_alone || []).join(',') || 'none'})`);
    const a = adapters[id];
    const want_status = a.retired ? 'retired' : a.adopted === false ? 'candidate' : 'adopted';
    if (row.status !== want_status) fail(`${id}: status must read ${want_status} (got ${row.status})`);
    if (row.role !== a.role) fail(`${id}: role must be the adapter's (got ${row.role})`);
    const axes = new Set([...(a.contributes || []), ...Object.values(a.map || {}).flatMap((m) => [m?.axis, ...(m?.also_axes || [])]).filter(Boolean)]);
    if (JSON.stringify([...row.feeds].sort()) !== JSON.stringify([...axes].sort())) fail(`${id}: feeds must be every axis its adapter maps to or contributes (got ${row.feeds.join(',')})`);
    if (row.unique_recoveries !== null || row.corroborated !== null || row.cost !== null) fail(`${id}: with no run given, the run-derived fields read not measured (null), never zero`);
    if (row.status === 'adopted' && !row.fails_loud) fail(`${id}: an adopted scanner's adapter must name the harness block that holds its fail-loud halts (fails_loud:)`);
    if (row.fails_loud && !existsSync(join(HERE, 'blocks', row.fails_loud + '.mjs'))) fail(`${id}: fails_loud names ${row.fails_loud}, which is no harness block`);
  }
  if (!stat.some((r) => r.decides_alone.length)) fail('some adopted scanner must decide a requirement alone');

  // not_measured_if_retired is a prediction: retire each scanner from a real run and the
  // rows that leave the measured scale are exactly the ones it named
  {
    const dir = fixtureDir('notesbox');
    const findings = loadFindings(dir), manifest = loadManifest(dir), inputs = null;   // censuses decide no instrument row
    const coverage = {};
    const decided = (rows) => new Set(rows.filter((r) => r.status !== 'not-measured').map((r) => r.id));
    const before = decided(measureRun({ findings, manifest, inputs, coverage }, reg));
    for (const id of Object.keys(manifest.scanners)) {
      if (manifest.scanners[id].status !== 'ran' || !byId[id]) continue;
      const retired = { ...manifest, scanners: { ...manifest.scanners, [id]: { status: 'skipped', reason: 'retired (roster probe)' } } };
      const after = decided(measureRun({ findings: findings.filter((f) => (f.source || 'repo-eval') !== id), manifest: retired, inputs, coverage }, reg));
      const lost = [...before].filter((x) => !after.has(x)).sort();
      const predicted = byId[id].not_measured_if_retired.filter((x) => before.has(x)).sort();
      const instrumentLost = lost.filter((x) => reg.requirements.find((d) => d.id === x)?.decide.kind === 'instrument');
      if (JSON.stringify(instrumentLost) !== JSON.stringify(predicted)) fail(`retiring ${id} over notesbox must lose exactly the instrument rows the roster predicts (predicted ${predicted.join(',') || 'none'}, lost ${instrumentLost.join(',') || 'none'})`);
    }
  }

  // ── over the fixture runs: unique recoveries, corroboration, cost ──
  let runs = [];
  try { runs = FIXTURE_RUNS.map((n) => R.loadRosterRun(fixtureDir(n))); }
  catch (e) { fail(`the committed fixture runs must load for the roster (${e.message})`); return; }
  const full = R.roster(adapters, reg, runs);
  const fullBy = Object.fromEntries(full.map((r) => [r.scanner, r]));
  const notesFacts = corroboratedFacts(projectMulti(loadFindings(fixtureDir('notesbox')), adapters).projected);
  for (const row of full) {
    if (!Array.isArray(row.unique_recoveries) || typeof row.corroborated !== 'number') { fail(`${row.scanner}: over runs, unique_recoveries is a list and corroborated a count`); continue; }
    const inNotes = notesFacts.filter((f) => f.sources.includes(row.scanner)).length;
    if (row.corroborated < inNotes) fail(`${row.scanner}: corroborated must count every fact it shares with another scanner (notesbox alone has ${inNotes}, got ${row.corroborated})`);
  }
  if (!full.some((r) => r.unique_recoveries.length)) fail('over the fixture runs some scanner must recover an answer nothing else does');
  for (const row of full) for (const u of row.unique_recoveries) if (!/^[^/]+\/\S+$/.test(u)) fail(`${row.scanner}: a unique recovery names its run and answer id (<run>/<id>), got ${u}`);
  if (fullBy['repo-eval'] && fullBy['repo-eval'].cost?.spend?.length) fail('no committed fixture run records spend, so cost must read empty lists there');

  // the CLI prints the report; a run with no record halts, never an empty roster
  {
    const out = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'roster', ...FIXTURE_RUNS.map(fixtureDir)], { encoding: 'utf8' });
    if (out.status !== 0) fail(`assay roster over the fixture runs must exit 0 (got ${out.status}: ${(out.stderr || '').split('\n')[0]})`);
    for (const id of ids) if (!new RegExp(`^  - scanner: ${id}$`, 'm').test(out.stdout || '')) fail(`assay roster must print a row for ${id}`);
    if (!/^\s+not_measured_if_retired:/m.test(out.stdout || '') || !/^\s+unique_recoveries:/m.test(out.stdout || '')) fail('assay roster must print the report fields');
    const stat0 = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'roster'], { encoding: 'utf8' });
    if (stat0.status !== 0 || !/not measured/.test(stat0.stdout || '')) fail(`assay roster with no run prints the static roster and reads the run fields not measured (got ${stat0.status})`);
    const bare = join(HERE, '.tmp-roster-bare'); rmSync(bare, { recursive: true, force: true }); mkdirSync(join(bare, 'map', 'findings'), { recursive: true });
    const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'roster', bare], { encoding: 'utf8' });
    rmSync(bare, { recursive: true, force: true });
    if (r.status === 0) fail('assay roster over a run with no run record (map/scanners.yaml) must halt');
  }

  // ── duration: on the run record ──
  {
    const tmp = join(HERE, '.tmp-roster-cost'); rmSync(tmp, { recursive: true, force: true });
    cpSync(fixtureDir('cleanlib'), tmp, { recursive: true });
    const mPath = join(tmp, 'map', 'scanners.yaml');
    const rec = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'record', tmp, ...args], { encoding: 'utf8' });
    const r1 = rec(['gitleaks', 'ran', '--duration', '4s']);
    if (r1.status !== 0) fail(`record must take --duration (got ${r1.status}: ${(r1.stderr || '').split('\n')[0]})`);
    if (!/^\s+duration: "4s"$/m.test(readFileSync(mPath, 'utf8'))) fail('record --duration must write duration: on the row');
    rec(['gitleaks', 'ran', '--spend', '0']);
    if (!/^\s+duration: "4s"$/m.test(readFileSync(mPath, 'utf8'))) fail('a later record on the row must keep its duration:');
    const v = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    if (v.status !== 0) fail(`a run record carrying duration: must validate (${(v.stdout + v.stderr).split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 2).join(' | ')})`);
    const cost = R.roster(adapters, reg, [R.loadRosterRun(tmp)]).find((x) => x.scanner === 'gitleaks')?.cost;
    if (JSON.stringify(cost?.duration) !== JSON.stringify([`${tmp.split('/').pop()}: 4s`])) fail(`the roster's cost must read duration off the run record (got ${JSON.stringify(cost)})`);
    writeFileSync(mPath, readFileSync(mPath, 'utf8').replace(/^(\s+)duration: "4s"$/m, '$1duration: ""'));
    const bad = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    if (bad.status === 0 || !/duration/.test(bad.stdout + bad.stderr)) fail('an empty duration: must fail validation');
    rmSync(tmp, { recursive: true, force: true });
  }

  // ── the candidate through the procedure, end to end ──
  {
    const adapterPath = join(ROOT, 'map', 'scanners', 'adapters', `${CANDIDATE}.yaml`);
    const tmp = join(HERE, '.tmp-roster-candidate');
    if (existsSync(adapterPath)) { fail(`${adapterPath} already exists; this block owns that name while it runs`); return; }
    try {
      writeFileSync(adapterPath, readFileSync(join(HERE, 'instruments', CANDIDATE, 'adapter.yaml'), 'utf8'));
      rmSync(tmp, { recursive: true, force: true });
      cpSync(fixtureDir('notesbox'), tmp, { recursive: true });
      const raw = join(HERE, 'instruments', CANDIDATE, 'notesbox-report.yaml');
      try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', CANDIDATE, '--raw', raw], { stdio: 'pipe' }); }
      catch (e) { fail(`the candidate's report must ingest through its adapter alone (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
      const v = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
      if (v.status !== 0) fail(`the run carrying the candidate must validate (${(v.stdout + v.stderr).split('\n').filter((l) => /✗/.test(l)).slice(0, 2).join(' | ')})`);
      const withCand = R.roster(loadAdapters(), reg, [R.loadRosterRun(tmp)]);
      const cand = withCand.find((r) => r.scanner === CANDIDATE);
      if (!cand) fail('the roster must report the candidate');
      else {
        if (cand.status !== 'candidate') fail(`an adapter with adopted: false and no retired: reads candidate (got ${cand.status})`);
        if (cand.decides_alone.length || cand.not_measured_if_retired.length) fail('the candidate decides no requirement, so retiring it loses none');
        if (cand.corroborated !== 2) fail(`both of the candidate's findings corroborate a fact another scanner recorded on notesbox (want 2, got ${cand.corroborated})`);
        if (cand.unique_recoveries.length) fail(`every answer the candidate hits on notesbox, another scanner recovers too (got ${cand.unique_recoveries.join(',')})`);
        if (cand.fails_loud !== 'second-reviewer-adapter') fail(`the candidate's fails_loud names the block holding its halts (got ${cand.fails_loud})`);
      }
      const notes = full.map((r) => [r.scanner, r.decides_alone.length, r.unique_recoveries.filter((u) => u.startsWith('notesbox/')).join(',')].join(':'));
      const notesWith = withCand.filter((r) => r.scanner !== CANDIDATE).map((r) => [r.scanner, r.decides_alone.length, r.unique_recoveries.map((u) => u.replace(/^[^/]+/, 'notesbox')).join(',')].join(':'));
      if (JSON.stringify(notes) !== JSON.stringify(notesWith)) fail(`a candidate that recovers nothing alone moves no adopted scanner's unique recoveries (before ${notes.join(' ')}, after ${notesWith.join(' ')})`);
    } finally {
      rmSync(adapterPath, { force: true });
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // ── the pin: the roster's counts over the committed fixture runs ──
  current._score.roster = Object.fromEntries(full.map((r) => [r.scanner, { status: r.status, decides_alone: r.decides_alone.length, unique_recoveries: r.unique_recoveries, corroborated: r.corroborated, fails_loud: r.fails_loud }]));
  if (!readdirSync(join(ROOT, 'map', 'scanners', 'adapters')).every((f) => f !== `${CANDIDATE}.yaml`)) fail('the candidate adapter must be gone after the block');
}
