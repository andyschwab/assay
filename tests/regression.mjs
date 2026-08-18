#!/usr/bin/env node
// regression.mjs — the assay tool regression harness (public).
//
// Pins the load-bearing computed behavior of the engine so a change to a tool cannot
// silently move a result. It does NOT snapshot full output (that churns on wording); it
// pins: the negative fixtures the validator MUST reject, the fail-closed unit invariants
// (yaml-min throws on unparseable input; projection halts on an unmapped category), the
// engine-pipeline invariants (roster honesty, the legacy-domain translation rail, the
// non-blocking decision overlay), the instrument-port invariants (fail-loud intake, a
// secret is never copied, score bands, unknown-check halt), and — the headline — the
// engine's RECALL against the public known-answer fixtures. A deliberate change is a
// reviewed `--bless` of golden.json in the same commit; a negative/unit assertion is
// never re-blessed (a failure there is always a real regression).
//
// Zero extra deps: imports the tools' own library functions and shells out to validate.mjs.
//
// Usage:
//   node tests/regression.mjs            # assert against golden.json (exit 1 on any drift)
//   node tests/regression.mjs --bless    # rewrite golden.json from current state (reviewed!)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../tools/yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes } from '../tools/project.mjs';
import { isHalt } from '../tools/doctrine.mjs';
import { buildSupervision } from '../tools/supervision.mjs';
import { computeVariance } from '../tools/variance.mjs';
import { decideProjected } from '../tools/decisions.mjs';
import { convert } from '../tools/ingest.mjs';
import { score } from '../tools/score.mjs';
import { buildGrades } from '../tools/maturity.mjs';
import { descriptorAgreement, varianceFromSweeps, groupKey } from '../tools/variance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');            // repo root
const GOLDEN = join(HERE, 'golden.json');
const bless = process.argv.includes('--bless');

// NEGATIVE fixtures: deliberately-malformed eval dirs that validate MUST reject. Pinning
// only green-over-valid-bases is false-green — a validator weakened to accept everything
// moves no positive invariant. Each targets one check; if that check is disabled, the
// fixture flips green and this harness goes red.
const NEGATIVE = [
  ['bad-dimension', 'filename-dimension disagreement'],
  ['bad-aggregate', 'hand-inflated maturity aggregate'],
];

// SCORED public-fixture runs: grade the engine against the known-answer sheets so recall
// and the control's false-positive count are pinned. A projection change that mis-homes a
// finding drops recall and this goes red. Answer sheets live beside each run.
const SCORED = [
  ['notesbox', join(HERE, 'fixtures', 'notesbox')],
  ['cleanlib', join(HERE, 'fixtures', 'cleanlib')],
];

const negFailures = [];

// ── negative fixtures: each MUST validate RED ─────────────────────────────────
for (const [dir, what] of NEGATIVE) {
  let red = false;
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), join(HERE, 'negative', dir)], { stdio: 'pipe' }); }
  catch { red = true; }
  if (!red) negFailures.push(`negative/${dir} validated GREEN but must be RED (${what}) — the validator stopped catching this class`);
}

// ── fail-closed unit invariants ───────────────────────────────────────────────
{
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) negFailures.push(`yaml-min accepted ${label} — must throw (fail-closed reader)`); };
  mustThrow('an inline flow map {}', () => parseYaml('a: {b: 1}'));
  mustThrow('an anchor &x', () => parseYaml('a: &x 1'));
  const { unmapped } = projectMulti(
    [{ id: 'F-999', source: 'deep-code-review', native_category: 'ZZ', polarity: 'gap', observation: 'x', evidence: ['a:1'], fix: 'y' }],
    loadAdapters());
  if (!unmapped.length) negFailures.push('projectMulti did not flag an unmapped native category — fail-closed projection broken');
  // the SHARED loader must fail closed on an unparseable findings file — a
  // skipped file silently shrinks the base, and in variance the loss would be
  // mis-read as variance (the fail-open seam the consolidation removed).
  mustThrow('an unparseable findings file (shared loader)', () => loadFindings(join(HERE, 'negative', 'bad-yaml-load')));
  mustThrow('an unparseable sweep (variance must halt, not skip)', () => computeVariance([join(HERE, 'negative', 'bad-yaml-load'), join(HERE, 'negative', 'bad-yaml-load')]));
}

// ── doctrine lockstep: one gate rule everywhere ───────────────────────────────
// The maturity halts-gated numerator, the supervision split, and the unheld-halt
// flag must be the SAME rule (tools/doctrine.mjs). Before consolidation they were
// restated in four files; this pins that they can never silently diverge again.
{
  const fail = (m) => negFailures.push('doctrine-lockstep: ' + m);
  const eff = (id, o) => ({ id, dimension: 'delegation', subject_type: 'effect', polarity: 'fact',
    observation: 'x', evidence: ['a.py:1'], confidence: 'confirmed',
    effect: { channel: 'ch-' + id, reversibility: 'irreversible', external: true, gate_type: 'none',
              telemetry: 'none', blast_scope: 'tenant', ...o } });
  const base = [
    eff('F-1', {}),                                                        // unheld halt
    eff('F-2', { gate_type: 'deterministic-halt', fail_mode: 'closed' }),  // held
    eff('F-3', { gate_type: 'deterministic-halt', fail_mode: 'open' }),    // fails open → unheld
    eff('F-4', { gate_type: 'disclosure-only' }),                          // disclosure is no stop → unheld
    eff('F-5', { reversibility: 'reversible', external: false, gate_type: 'none' }), // not halt-class
  ];
  const sup = buildSupervision(base, []);
  if (sup.total !== 4) fail(`halt population must be 4 (got ${sup.total})`);
  if (sup.supervised !== 1 || sup.unsupervised !== 3) fail(`supervised split must be 1/3 (got ${sup.supervised}/${sup.unsupervised})`);
  const gates = buildGrades(base, null).dimensions.find((d) => d.dimension === 'deterministic-gates');
  if (gates.coverage.met !== sup.supervised || gates.coverage.of !== sup.total)
    fail(`maturity halts-gated (${gates.coverage.met}/${gates.coverage.of}) must equal the supervision split (${sup.supervised}/${sup.total}) — one gate rule`);
  const flagged = base.filter((f) => isHalt(f.effect)).map((f) => f.id);
  if (flagged.join(',') !== 'F-1,F-3,F-4') fail(`unheld-halt flags must be F-1,F-3,F-4 (got ${flagged.join(',')})`);
}

// ── engine-pipeline invariants: roster honesty + legacy rail + decision overlay ─
{
  const fail = (m) => negFailures.push('engine-pipeline: ' + m);
  const adapters = loadAdapters();
  const legacy = projectMulti([
    { id: 'F-901', dimension: 'unprompted', domain: 'product-ai-safety', polarity: 'gap', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', subject_type: 'process' },
    { id: 'F-902', dimension: 'unprompted', axis: 'code-security', polarity: 'gap', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', subject_type: 'process' },
  ], adapters);
  if (legacy.projected.find((p) => p.f.id === 'F-901')?.axis !== 'delegation') fail('legacy domain product-ai-safety must translate to the delegation axis (grandfather rail)');
  if (legacy.projected.find((p) => p.f.id === 'F-902')?.axis !== 'code-security') fail('an explicit finding axis must be honored as-is');
  const contributed = contributedBySources(adapters, ['repo-eval']);
  if (contributed.has('code-correctness')) fail('repo-eval must not contribute the code axes (they arrive with a code scanner)');
  if (!contributed.has('delegation') || !contributed.has('multiplayer')) fail('repo-eval must contribute its seven dimension axes');
  const roster = rosterFor(adapters, ['repo-eval'], legacy.projected);
  if (!roster.includes('code-security')) fail('an axis a finding explicitly carries must still appear in the roster (never a silent drop)');
  const base = [{ f: { id: 'F-A', polarity: 'gap', severity: 'Critical' }, axis: 'code-correctness', also: [], source: 'x' }];
  const decided = decideProjected(base, [{ finding: 'F-A', action: 'accept', reason: 'known' }], null);
  if (decided[0].state !== 'accepted') fail('accepting a gap must read accepted (waived) — distinct from open and from held');
  const snz = [{ finding: 'F-A', action: 'snooze', snooze_until: '2099-01-01' }];
  if (decideProjected(base, snz, '2026-01-01')[0].state !== 'snoozed') fail('an active snooze must read snoozed');
  if (decideProjected(base, snz, '2099-06-01')[0].state !== 'open') fail('an expired snooze must revert to open');
}

// ── maturity-ladder invariants: every native dimension is scorable ────────────
// A dimension the taxonomy carries but the ladder does not is worse than an
// unmeasured one: an authored census for it is silently DROPPED and the report
// renders fewer areas than the walk. Regression for the multiplayer gap found by
// the henry-2026-08-18 run.
{
  const fail = (m) => negFailures.push('maturity-ladder: ' + m);
  const NATIVE = ['artifact-legibility', 'context-economy', 'deterministic-gates',
                  'verification', 'delegation', 'improvement-loop', 'multiplayer'];
  const empty = buildGrades([], null);
  const present = new Set(empty.dimensions.map((d) => d.dimension));
  for (const d of NATIVE) if (!present.has(d)) fail(`the ladder carries no ${d} row — an authored census for it would be silently dropped`);
  // an authored sampled census must supply the primary for a dimension with no counted measure
  const withCensus = buildGrades([], { dimensions: [{ dimension: 'multiplayer', depth: 'x',
    sampled: [{ name: 'agent-access-surface', what: 'w', met: 3, of: 4, method: 'm', primary: true }] }] });
  const mp = withCensus.dimensions.find((d) => d.dimension === 'multiplayer');
  if (!mp || !mp.coverage) fail('an authored multiplayer census must supply its coverage, not be dropped');
  else if (mp.coverage.pct !== 75 || mp.coverage.kind !== 'sampled') fail(`multiplayer census must read 75% sampled (got ${mp.coverage.pct}% ${mp.coverage.kind})`);
  // and an unmeasured dimension must read not_measured, never absent or zero
  const bare = empty.dimensions.find((d) => d.dimension === 'multiplayer');
  if (bare && (bare.coverage || !bare.not_measured)) fail('multiplayer with no census must read not_measured, never a number');
}

// ── descriptor-agreement invariants: repeatability at the layer that DRIVES output ─
// variance.mjs's fact clustering answers "did both sweeps record a fact about X"
// and deliberately drops descriptors from identity. But every shipped number —
// maturity coverage, the halt flags, the chain ranking, the gate — is computed
// from the effect descriptors. Two sweeps can agree on 100% of facts and assign
// opposite descriptors to all of them. These pin the second measure.
{
  const fail = (m) => negFailures.push('descriptor-agreement: ' + m);
  const eff = (channel, o) => ({ id: 'F-1', dimension: 'delegation', subject_type: 'effect',
    polarity: 'fact', observation: 'x', evidence: ['a.py:1'], confidence: 'confirmed',
    effect: { channel, reversibility: 'reversible', external: true, gate_type: 'scope-bound',
              fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'user', ...o } });

  // identical sweeps → total agreement
  const same = descriptorAgreement([[eff('a')], [eff('a')]]);
  if (same.channels.shared !== 1) fail(`a channel present in both sweeps must be shared (got ${same.channels.shared})`);
  if (same.allFields.pct !== 100) fail(`identical descriptors must read 100% (got ${same.allFields.pct}%)`);
  if (same.divergences.length) fail('identical descriptors must produce no divergence rows');

  // a single field differing → that field alone drops, and the row is reported
  const one = descriptorAgreement([[eff('a')], [eff('a', { telemetry: 'unstructured' })]]);
  if (one.byField.telemetry.pct !== 0) fail('a differing telemetry must read 0% on that field');
  if (one.byField.gate_type.pct !== 100) fail('an unchanged field must stay 100% when a sibling differs');
  if (one.allFields.pct !== 0) fail('all-fields agreement must drop when any field differs');
  if (one.divergences.length !== 1 || one.divergences[0].channel !== 'a') fail('the divergent channel must be named');

  // fail_mode is not applicable where gate_type is none — a single gate disagreement
  // must not be double-counted as a fail_mode disagreement too
  const naFail = descriptorAgreement([
    [eff('a', { gate_type: 'none', fail_mode: null })],
    [eff('a', { gate_type: 'scope-bound', fail_mode: 'closed' })]]);
  if (naFail.byField.fail_mode.of !== 0) fail('fail_mode must not be compared on a channel where a sweep recorded gate_type: none');
  if (naFail.byField.gate_type.pct !== 0) fail('the gate_type disagreement itself must still register');
  if (naFail.divergences.length !== 1) fail('the channel must still read divergent on the gate_type difference alone');

  // a channel only one sweep saw is NOT shared — never counted as agreement or divergence
  const partial = descriptorAgreement([[eff('a'), eff('b')], [eff('a')]]);
  if (partial.channels.shared !== 1) fail(`only channels seen by 2+ sweeps are shared (got ${partial.channels.shared})`);
  if (partial.channels.unshared !== 1) fail('a channel only one sweep saw must be reported as unshared, never silently dropped');

  // direction: the variance-vs-movement signal. All-one-way is consistent with the
  // target changing; both-ways is the signature of judgment drift.
  const oneWay = descriptorAgreement([
    [eff('a', { telemetry: 'unstructured' }), eff('b', { telemetry: 'unstructured' })],
    [eff('a', { telemetry: 'structured-event' }), eff('b', { telemetry: 'structured-event' })]]);
  if (oneWay.directions.safer === 0 || oneWay.directions.riskier !== 0) fail('two same-direction moves must read one-way, not both-ways');
  if (oneWay.bothWays) fail('a one-way divergence set must not be flagged both-ways');
  const bothWays = descriptorAgreement([
    [eff('a', { telemetry: 'unstructured' }), eff('b', { telemetry: 'structured-event' })],
    [eff('a', { telemetry: 'structured-event' }), eff('b', { telemetry: 'unstructured' })]]);
  if (!bothWays.bothWays) fail('divergences moving in both directions must be flagged both-ways (the judgment-drift signature)');
}

// ── variance must survive a mixed base (scanner + instrument rows carry no dimension) ─
// variance.mjs predates the instrument port. Scanner-sourced rows have `source` +
// `native_category` and NO `dimension` (SCHEMA §2a), so every one landed in a single
// undefined bucket and the sort crashed on localeCompare. Found by the first
// all-integrations run (henry-2026-08-18: repo-eval + deep-code-review + gitleaks +
// scorecard in one base).
{
  const fail = (m) => negFailures.push('variance-mixed-base: ' + m);
  if (groupKey({ dimension: 'delegation', source: 'repo-eval' }) !== 'delegation') fail('a repo-eval finding must group by its dimension');
  if (groupKey({ source: 'gitleaks', native_category: 'secret' }) !== 'source:gitleaks') fail('a dimension-less scanner row must group by its source, not collapse to undefined');
  const mixed = [
    [{ id: 'F-1', dimension: 'delegation', subject_type: 'control', observation: 'x', evidence: ['a.py:1'] },
     { id: 'F-700', source: 'gitleaks', native_category: 'secret', polarity: 'gap', observation: 'y', evidence: ['b.py:2'] }],
    [{ id: 'F-1', dimension: 'delegation', subject_type: 'control', observation: 'x', evidence: ['a.py:1'] }],
  ];
  let crashed = false, r = null;
  try { r = varianceFromSweeps(mixed); } catch { crashed = true; }
  if (crashed) fail('variance crashed on a base mixing dimensioned and dimension-less findings');
  else {
    if (!r.byDimension['source:gitleaks']) fail('a dimension-less scanner row must get its own bucket, never an undefined one');
    if (r.byDimension['undefined']) fail('no finding may land in an undefined bucket');
    if (r.byDimension['delegation']?.core !== 1) fail('the shared dimensioned fact must still read as repeatable core');
  }
}

// ── instrument-port invariants (fail-loud intake; never copy a secret; bands) ───
{
  const fail = (m) => negFailures.push('instrument-port: ' + m);
  const glRaw = readFileSync(join(HERE, 'instruments', 'gitleaks-sample.json'), 'utf8');
  const scRaw = readFileSync(join(HERE, 'instruments', 'scorecard-sample.json'), 'utf8');
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  mustThrow('a tool-error exit code', () => convert('gitleaks', '[]', 2));
  mustThrow('a missing exit code', () => convert('gitleaks', '[]', 'unknown'));
  mustThrow('malformed JSON', () => convert('gitleaks', 'not json {', 1));
  mustThrow('an unknown instrument name', () => convert('nonesuch', '[]', 0));
  mustThrow('a truncated leak (no File)', () => convert('gitleaks', '[{"RuleID":"x","StartLine":1}]', 1));
  if (convert('gitleaks', '[]', 0).length !== 0) fail('a verified-clean run (success exit, empty report) must convert to zero rows');
  const gl = convert('gitleaks', glRaw, 1);
  if (gl.length !== 2) fail(`gitleaks sample must yield 2 rows (got ${gl.length})`);
  if (JSON.stringify(gl).includes('AKIAFAKE') || JSON.stringify(gl).includes('sk-FAKE')) fail('a matched secret value leaked into the converted rows — the converter must never copy Secret/Match');
  const sc = convert('scorecard', scRaw, 0);
  const by = Object.fromEntries(sc.map((r) => [r.native_category, r]));
  if (by['Branch-Protection']?.polarity !== 'gap' || by['Branch-Protection']?.severity !== 'High') fail('a score-2 check must read gap/High');
  if (by['CI-Tests']?.polarity !== 'strength') fail('a score-10 check must read strength');
  if (by['Dangerous-Workflow']?.evidence[0] !== '.github/workflows/deploy.yml:12') fail('a detail path must become the evidence');
  if (!sc.skipped || !sc.skipped.includes('Fuzzing')) fail('an N/A (-1) check must be skipped AND logged, never silent');
  const proj = projectMulti([...gl, ...sc], adaptersOnce());
  if (proj.unmapped.length) fail(`instrument rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.id === gl[0].id)?.axis !== 'code-security') fail('a gitleaks secret must land on code-security');
  if (proj.projected.find((p) => p.f.native_category === 'Branch-Protection')?.axis !== 'deterministic-gates') fail('Branch-Protection must land on the shared deterministic-gates axis');
  if (contributedBySources(adaptersOnce(), ['gitleaks', 'scorecard']).size !== 0) fail('instruments must contribute no axes');
  const rogue = projectMulti(convert('scorecard', JSON.stringify({ checks: [{ name: 'Brand-New-Check', score: 5, reason: 'x' }] }), 0), adaptersOnce());
  if (!rogue.unmapped.length) fail('an unknown Scorecard check must halt at projection (default: FAIL), never route silently');
}
function adaptersOnce() { return loadAdapters(); }

// ── score path identity: same-basename planted items must not collide ─────────
// Matching is by full path (suffix rule), never basename alone — the same lesson
// variance.mjs's identity tokens already encode (every skill ships a SKILL.md).
{
  const fail = (m) => negFailures.push('score-path: ' + m);
  const answers = { target: 't', planted: [
    { id: 'P-1', polarity: 'gap', axis: 'delegation', evidence: 'a/SKILL.md:1' },
    { id: 'P-2', polarity: 'gap', axis: 'verification', evidence: 'b/SKILL.md:1' },
  ] };
  const findings = [{ id: 'F-1', dimension: 'delegation', axis: 'delegation', polarity: 'gap', observation: 'x', evidence: ['a/SKILL.md:1'], confidence: 'confirmed', subject_type: 'artifact' }];
  const r = score(findings, adaptersOnce(), answers);
  const by = Object.fromEntries(r.results.map((x) => [x.id, x.status]));
  if (by['P-1'] !== 'recovered') fail(`a full-path match must recover (P-1 got ${by['P-1']})`);
  if (by['P-2'] !== 'missed') fail(`a different file sharing only the basename must read missed, never matched (P-2 got ${by['P-2']})`);
}

// ── enumerate coverage-gate invariants (self-reference skip + declared-harness exclude) ─
// The gate must flag uncovered PRODUCT surface, and must NOT flag (a) the run's own
// artifacts when the run lives with its target (runs/**, SCHEMA §5), nor (b) a dir the
// analyst declares a harness via --exclude. Exclusion is opt-in, never a default.
{
  const fail = (m) => negFailures.push('enumerate-gate: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'target');
  const run = join(fx, 'runs', 'r-2026-01-01');
  const gapsFor = (extra) => {
    // gaps present ⇒ non-zero exit even in --json mode (the exit IS the verdict);
    // the payload is still on stdout either way.
    let out;
    try { out = execFileSync(process.execPath, [join(ROOT, 'tools', 'enumerate.mjs'), fx, '--run', run, ...extra, '--json'], { stdio: 'pipe' }).toString(); }
    catch (e) { out = String(e.stdout || ''); }
    return JSON.parse(out).coverageGaps.map((g) => g.file);
  };
  const plain = gapsFor([]);
  if (!plain.includes('deploy/prod.yaml')) fail('a gateable, uncovered product-surface member must be a coverage gap');
  if (plain.some((f) => f && /(^|\/)runs\//.test(f))) fail('a member inside a run that lives with its target (runs/**) must be recall-only, never a gate gap (self-reference)');
  if (!plain.includes('harness/bench.yaml')) fail('without --exclude, a member in a non-excluded dir must still be a gap (exclusion is opt-in, not default)');
  const excluded = gapsFor(['--exclude', 'harness']);
  if (!excluded.includes('deploy/prod.yaml')) fail('--exclude must not drop product surface outside the excluded dir');
  if (excluded.includes('harness/bench.yaml')) fail('--exclude <dir> must drop a declared-harness member from the gate');
  // exit-code honesty: --json must exit non-zero when gaps exist (a CI wiring
  // that checks only the exit code must never read green over uncovered surface)
  let gateExit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'enumerate.mjs'), fx, '--run', run, '--json'], { stdio: 'pipe' }); }
  catch (e) { gateExit = e.status; }
  if (gateExit !== 1) fail(`--json with coverage gaps must exit 1 (got ${gateExit})`);
  let vExit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), join(HERE, 'negative', 'bad-dimension'), '--json'], { stdio: 'pipe' }); }
  catch (e) { vExit = e.status; }
  if (vExit !== 1) fail(`validate --json over a red base must exit 1 (got ${vExit})`);
}

// ── enumerate agent tool-def detector: it must surface an in-code tool table
// (name + input_schema) and a remote MCP toolset as channel candidates, and must
// NOT surface a tool defined only in a test file. Shells out to the real CLI
// against the same self-contained fixture target.
{
  const fail = (m) => negFailures.push('enumerate-tooldef: ' + m);
  let out = '';
  try { out = execFileSync(process.execPath, [join(ROOT, 'tools', 'enumerate.mjs'), join(HERE, 'enumerate-fixture', 'target')], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || '') + String(e.message || ''); }
  for (const need of ['tool: send_thing', 'tool: read_thing', 'mcp-toolset: analytics']) {
    if (!out.includes(need)) fail(`enumerate did not surface "${need}" — the agent tool-def detector regressed`);
  }
  if (out.includes('fixture_only_tool')) fail('enumerate surfaced a tool defined only in a test file — the test-file skip regressed');
}

// ── SCORED fixtures (the recall floor) ────────────────────────────────────────
const current = { _score: {} };
for (const [key, dir] of SCORED) {
  try {
    const answers = parseYaml(readFileSync(join(dir, 'ANSWERS.yaml'), 'utf8'));
    const findings = loadFindings(join(dir, 'eval'));
    const r = score(findings, loadAdapters(), answers);
    const missed = r.results.filter((x) => x.status === 'missed').length;
    const misHomed = r.results.filter((x) => x.status === 'mis-homed').length;
    current._score[key] = { recall: r.recall, recovered: r.recovered, in_scope: r.total_in_scope, missed, misHomed, falsePositives: r.falsePositives.length };
  } catch (e) { current._score[key] = { error: e.message.split('\n')[0] }; }
}

// ── bless / assert ────────────────────────────────────────────────────────────
if (bless) {
  writeFileSync(GOLDEN, JSON.stringify(current, null, 2) + '\n');
  console.log('✓ blessed golden.json from current state. Review the diff before committing.');
  process.exit(0);
}
if (!existsSync(GOLDEN)) { console.error('✗ no golden.json — run `node tests/regression.mjs --bless` first, review, and commit.'); process.exit(2); }
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));

const drifts = [];
function cmp(path, g, c) {
  if (typeof g === 'object' && g && typeof c === 'object' && c) {
    for (const k of new Set([...Object.keys(g), ...Object.keys(c)])) cmp(`${path}.${k}`, g[k], c[k]);
  } else if (JSON.stringify(g) !== JSON.stringify(c)) {
    drifts.push(`${path}: golden ${JSON.stringify(g)} → now ${JSON.stringify(c)}`);
  }
}
cmp('_score', golden._score, current._score);

if (!drifts.length && !negFailures.length) {
  console.log(`✓ assay regression: ${NEGATIVE.length} negative fixtures + fail-closed/engine/instrument unit invariants + ${SCORED.length} scored fixtures, all hold (validate, projection, roster-honesty, decision-overlay, instrument-port, enumerate-gate, enumerate-tooldef, fixture-recall).`);
  process.exit(0);
}
if (negFailures.length) {
  console.error(`✗ assay regression: ${negFailures.length} unit/negative failure(s) — an invariant that must always hold was violated:\n`);
  for (const f of negFailures) console.error('  • ' + f);
  console.error('  These are never re-blessed. Restore the check the assertion targets.');
}
if (drifts.length) {
  console.error(`✗ assay regression: ${drifts.length} scored invariant(s) drifted:\n`);
  for (const d of drifts) console.error('  • ' + d);
  console.error('\n  If INTENTIONAL, re-bless (node tests/regression.mjs --bless) and commit golden.json in the same diff.');
}
process.exit(1);
