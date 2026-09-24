#!/usr/bin/env node
// regression.mjs — the assay tool regression harness (public).
//
// Pins the load-bearing computed behavior of the engine so a change to a tool cannot
// silently move a result. It does NOT snapshot full output (that churns on wording); it
// pins: the negative fixtures the validator MUST reject, the fail-closed unit invariants
// (yaml-min throws on unparseable input; projection halts on an unmapped category), the
// engine-pipeline invariants (roster honesty, the explicit-axis rail, the
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, adoptedAdapters, registryAxes, dispositions, scannerLine, notRunPhrase, loadScannerCoverage, axisCoverage, coveragePhrase } from '../map/project.mjs';
import { isHalt } from '../map/doctrine.mjs';
import { buildSupervision } from '../map/supervision.mjs';
import { computeVariance } from '../map/variance.mjs';
import { decideProjected } from '../map/decisions.mjs';
import { convert, coverageYaml, nextStart } from '../map/ingest.mjs';
import { score } from '../map/score.mjs';
import { buildGrades } from '../views/improve/maturity.mjs';
import { descriptorAgreement, varianceFromSweeps, groupKey } from '../map/variance.mjs';
import { loadYardstick, validateYardstick, measureRun, summarize, KINDS, loadContradictions, loadRunPacket } from '../yardstick/measure.mjs';
import { validatePacket, loadPacket, secretShape, emailShape, decideAccountsClaim, decideBusFactorClaim, decideGenericClaim } from '../yardstick/packet.mjs';
import { packetManifestPath } from '../lib/run-layout.mjs';
import { buildWhatWeFound, render, MARKER, NOTHING_YET } from '../owner/ask-owner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');            // repo root
const GOLDEN = join(HERE, 'golden.json');
const bless = process.argv.includes('--bless');

// Copy every findings file (map/findings/*.yaml) from a public fixture into a
// scratch run dir — the shared setup every synthetic-run test below needs.
function copyFixtureFindings(fixtureName, destRunDir) {
  const src = join(HERE, 'fixtures', fixtureName, 'map', 'findings');
  const dst = join(destRunDir, 'map', 'findings');
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dst, f));
}
function copyFixtureScanners(fixtureName, destRunDir) {
  mkdirSync(join(destRunDir, 'map'), { recursive: true });
  copyFileSync(join(HERE, 'fixtures', fixtureName, 'map', 'scanners.yaml'), join(destRunDir, 'map', 'scanners.yaml'));
}

// NEGATIVE fixtures: deliberately-malformed eval dirs that validate MUST reject. Pinning
// only green-over-valid-bases is false-green — a validator weakened to accept everything
// moves no positive invariant. Each targets one check; if that check is disabled, the
// fixture flips green and this harness goes red.
const NEGATIVE = [
  ['bad-dimension', 'filename-dimension disagreement'],
  ['bad-aggregate', 'hand-inflated maturity aggregate'],
  ['bad-standing-watch', 'non-boolean standing_watch on an exposure'],
  // the run manifest (SCHEMA §5a): an integration that did not run must be RECORDED as
  // such, with a reason — never inferred absent. Found by a run that shipped a full
  // package with a queued code scanner never invoked and nothing recording the omission.
  ['no-manifest', 'no map/scanners.yaml — an adopted scanner with no recorded disposition'],
  ['manifest-skip-no-reason', 'a scanner skipped with no reason (indistinguishable from an omission)'],
  ['manifest-ran-no-rows', 'a scanner recorded as ran with no rows and no explicit empty file'],
  ['manifest-rows-not-ran', 'rows present from a scanner the manifest records as skipped'],
  ['coverage-incomplete', 'a scanner coverage sidecar missing rows for domains the adapter lists'],
  // the yardstick measurement (yardstick/README.md): a status the base does not recompute is drift, and a
  // claim-only row reading met is the exact laundering the two-file rule exists to prevent
  ['descriptors-drift', 'a yardstick.yaml whose statuses the base does not recompute (a claim row reads met)'],
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
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'negative', dir)], { stdio: 'pipe' }); }
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
// flag must be the SAME rule (map/doctrine.mjs). Before consolidation they were
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

// ── engine-pipeline invariants: roster honesty + explicit-axis rail + decision overlay ─
{
  const fail = (m) => negFailures.push('engine-pipeline: ' + m);
  const adapters = loadAdapters();
  const explicit = projectMulti([
    { id: 'F-902', dimension: 'unprompted', axis: 'code-security', polarity: 'gap', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', subject_type: 'process' },
  ], adapters);
  if (explicit.projected.find((p) => p.f.id === 'F-902')?.axis !== 'code-security') fail('an explicit finding axis must be honored as-is');
  const contributed = contributedBySources(adapters, ['repo-eval']);
  if (contributed.has('code-correctness')) fail('repo-eval must not contribute the code axes (they arrive with a code scanner)');
  if (!contributed.has('delegation') || !contributed.has('multiplayer')) fail('repo-eval must contribute its seven dimension axes');
  const roster = rosterFor(adapters, ['repo-eval'], explicit.projected);
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
// a field run (2026-08-18).
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
// all-integrations run (2026-08-18: repo-eval + deep-code-review + gitleaks +
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
  // id width: a real history scan returns more rows than three digits hold (807 on the first
  // 200k-line target). Ids are F- plus three OR MORE digits; the validator must accept F-1000
  // and still reject a two-digit id. The converter pads to three and grows past it.
  const wide = convert('gitleaks', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ RuleID: 'r', File: 'a.ts', StartLine: i + 1 }))), 1, 'F-998');
  if (wide.map((r) => r.id).join(',') !== 'F-998,F-999,F-1000,F-1001,F-1002') fail(`ids must grow past three digits (got ${wide.map((r) => r.id).join(',')})`);
  {
    const tmp = join(HERE, '.tmp-idwidth'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    copyFileSync(join(HERE, 'sidecar-fixture', 'map', 'scanners.yaml'), join(tmp, 'map', 'scanners.yaml'));
    copyFileSync(join(HERE, 'sidecar-fixture', 'map', 'findings', 'repo-eval-delegation.yaml'), join(tmp, 'map', 'findings', 'repo-eval-delegation.yaml'));
    const row = (id) => `- id: ${id}\n  source: gitleaks\n  native_id: "r@a.ts:1"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    const manifest = readFileSync(join(tmp, 'map', 'scanners.yaml'), 'utf8').replace(/gitleaks:[\s\S]*?(?=\n  \w|$)/, 'gitleaks:\n    status: ran');
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), manifest);
    const runValidate = () => { try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); return true; } catch { return false; } };
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), row('F-1000'));
    if (!runValidate()) fail('a four-digit finding id (F-1000) must validate green — the id space is not capped at 999');
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), row('F-12'));
    if (runValidate()) fail('a two-digit finding id (F-12) must still validate red');
    rmSync(tmp, { recursive: true, force: true });
  }
  // id allocation (found on a real history scan: a gitleaks block of over a thousand rows ran past the
  // deep-code-review and fresh-clone floors and the validator went red on duplicate ids)
  {
    const tmp = join(HERE, '.tmp-nextstart'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    if (nextStart(tmp, 'deep-code-review').start !== 800) fail('an empty run starts deep-code-review at its floor F-800');
    const row = (n) => `- id: F-${n}\n  source: gitleaks\n  native_id: "r@a.ts:${n}"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), Array.from({ length: 807 }, (_, i) => row(700 + i)).join(''));
    const ns = nextStart(tmp, 'deep-code-review');
    if (ns.start !== 1600 || ns.highest !== 1506) fail(`with gitleaks rows to F-1506, deep-code-review must start at F-1600 (got F-${ns.start}, highest ${ns.highest})`);
    if (nextStart(tmp, 'gitleaks').start !== 700) fail('a re-ingest of the same tool ignores its own file and lands at its floor again');
    writeFileSync(join(tmp, 'map', 'findings', 'deep-code-review.yaml'), row(1600));
    if (nextStart(tmp, 'fresh-clone').start !== 1700) fail('fresh-clone must start above both existing blocks (F-1700)');
    rmSync(tmp, { recursive: true, force: true });
  }
  // the raw archive of a gitleaks report must be location-only: the CLI once copied the raw
  // report into map/raw/ verbatim, matched values and author identity included
  {
    const tmp = join(HERE, '.tmp-glarchive'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1'], { stdio: 'pipe' });
    const archived = readFileSync(join(tmp, 'map', 'raw', 'gitleaks.json'), 'utf8');
    if (archived.includes('AKIAFAKE') || archived.includes('sk-FAKE') || /"(Secret|Match|Line|Author|Email)"/.test(archived)) fail('the archived gitleaks report must carry locations only — never Secret, Match, Line, Author or Email');
    if (!/"RuleID"/.test(archived) || !/"File"/.test(archived) || !/"StartLine"/.test(archived)) fail('the archived gitleaks report must keep rule, file and line');
    rmSync(tmp, { recursive: true, force: true });
  }
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

// ── exposures sidecar: standing_watch, not the retired stage scale ────────────
// The stage scale (gate:/blocks_stage:) is retired: a sidecar (properties +
// standing_watch only) must validate green.
{
  const fail = (m) => negFailures.push('exposures-sidecar: ' + m);
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'sidecar-fixture')], { stdio: 'pipe' }); }
  catch { fail('a sidecar (no gate:, no blocks_stage:, standing_watch labeled) must validate green'); }
}

// ── run-manifest invariants: absence is named, never implied ──────────────────
// The registry of "not measured" axes comes from ADOPTED adapters only; a retired
// adapter (adopted: false) stays projectable for frozen rows but never widens the
// roster a run must dispose of. Every renderer names a scanner that did not run
// with its recorded reason; the package refuses to compile without the manifest;
// appendices come from THIS run only (a sibling run's report is never listed).
{
  const fail = (m) => negFailures.push('run-manifest: ' + m);
  const adapters = loadAdapters();
  const adopted = Object.keys(adoptedAdapters(adapters)).sort();
  if (adopted.includes('scorecard')) fail('scorecard is retired (adopted: false) and must not be in the adopted roster');
  if (!adapters.scorecard) fail('the retired scorecard adapter must still LOAD (frozen runs carrying its rows must project)');
  // the adopted roster is pinned by name: adopting or retiring a scanner is a reviewed
  // change to this line in the same commit (fresh-clone adopted 2026-09-22;
  // dependency-scan and repo-census adopted 2026-09-24)
  if (JSON.stringify(adopted) !== JSON.stringify(['deep-code-review', 'dependency-scan', 'fresh-clone', 'gitleaks', 'repo-census', 'repo-eval'])) fail(`adopted roster must be deep-code-review, dependency-scan, fresh-clone, gitleaks, repo-census, repo-eval (got ${adopted.join(', ')})`);
  const reg = registryAxes(adapters);
  if (!reg.includes('code-security') || !reg.includes('multiplayer') || reg.length !== 9) fail(`registry must be the 9 axes the adopted scanners contribute — an instrument adds none (got ${reg.length}: ${reg.join(', ')})`);
  const m = { engine: 'x', scanners: { 'repo-eval': { status: 'ran' }, 'deep-code-review': { status: 'skipped', reason: 'out of scope' }, gitleaks: { status: 'failed', reason: 'binary missing' }, 'fresh-clone': { status: 'skipped', reason: 'no scratch clone here' }, 'dependency-scan': { status: 'skipped', reason: 'no registry reach here' }, 'repo-census': { status: 'skipped', reason: 'no filesystem access here' } } };
  const d = dispositions(m, adapters);
  if (d.ran.join() !== 'repo-eval' || d.skipped[0]?.reason !== 'out of scope' || d.failed[0]?.id !== 'gitleaks' || d.missing.length) fail('dispositions must group ran / skipped / failed with reasons and report nothing missing');
  const line = scannerLine(m, ['repo-eval'], adapters);
  if (!line.includes('skipped: deep-code-review (out of scope)') || !line.includes('failed: gitleaks (binary missing)') || !line.includes('fresh-clone (no scratch clone here)')) fail(`the scanners line must name skipped and failed scanners with their reasons (got "${line}")`);
  if (!scannerLine(null, ['repo-eval'], adapters).includes('no run manifest')) fail('a missing manifest must be named on the scanners line, never silently omitted');
  if (dispositions({ scanners: { 'repo-eval': { status: 'ran' } } }, adapters).missing.join() !== 'deep-code-review,dependency-scan,fresh-clone,gitleaks,repo-census') fail('adopted scanners without a row must be reported missing');
  if (!notRunPhrase(m, 'deep-code-review').startsWith('skipped this run: out of scope')) fail('notRunPhrase must carry the recorded reason');
  // the walk prints the reason on the not-measured register
  const walk = execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'axes.mjs'), join(HERE, 'fixtures', 'notesbox'), '--stdout'], { stdio: 'pipe' }).toString();
  if (!walk.includes('deep-code-review (skipped this run: fixture run')) fail('the walk must print the skipped scanner and its reason on the not-measured register');
  // the package: refuses without a manifest; lists this run's appendices only, and names the skip
  const tmp = join(HERE, 'tmp-manifest');
  rmSync(tmp, { recursive: true, force: true });
  const runA = join(tmp, 'runs', 'a-2026-01-01'), runB = join(tmp, 'runs', 'b-2026-01-02');
  copyFixtureFindings('notesbox', runA);
  mkdirSync(join(runB, 'map', 'native'), { recursive: true });
  writeFileSync(join(runB, 'map', 'native', 'deep-code-review.md'), '# a sibling run\'s native report — must never be listed by run A\n');
  let refused = false;
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), runA], { stdio: 'pipe' }); } catch { refused = true; }
  if (!refused) fail('compile-package must refuse to compile a run with no manifest (the package is what gets read)');
  if (existsSync(join(runA, 'INDEX.md'))) fail('a refused package must not have written INDEX.md');
  copyFixtureScanners('notesbox', runA);
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), runA], { stdio: 'pipe' }); }
  catch (e) { fail(`compile-package must compile a run with a valid manifest (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  const index = existsSync(join(runA, 'INDEX.md')) ? readFileSync(join(runA, 'INDEX.md'), 'utf8') : '';
  if (index.includes('b-2026-01-02')) fail('INDEX must not list a sibling run\'s native report as this run\'s appendix');
  if (!index.includes('skipped: deep-code-review (fixture run')) fail('INDEX must name the skipped scanner and its reason on the scanners line');
  if (!index.includes('deep-code-review skipped this run: fixture run')) fail('INDEX not-measured line must say WHY the measuring scanner did not run');
  const start = existsSync(join(runA, 'handoff', 'START-HERE.md')) ? readFileSync(join(runA, 'handoff', 'START-HERE.md'), 'utf8') : '';
  if (!start.includes('skipped: deep-code-review (fixture run')) fail('the handoff must carry the same scanners line with the skip reason');
  rmSync(tmp, { recursive: true, force: true });
}

// ── peer-scanner machine report (deep-code-review 1.72+) through ingest ──────────
// Completeness is the fail-loud property: every domain the adapter lists has a
// coverage row, every gap a fix, every non-scanned row a note. Rows carry the
// scanner's own labels beside the mapped ones; the coverage sidecar makes an axis
// read "partially measured" where the scanner itself said it looked partially.
{
  const fail = (m) => negFailures.push('dcr-machine-report: ' + m);
  const sample = readFileSync(join(HERE, 'instruments', 'deep-code-review-sample.yaml'), 'utf8');
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt`); };
  const rows = convert('deep-code-review', sample, null);
  if (rows.length !== 3) fail(`sample must yield 3 rows (got ${rows.length})`);
  const by = Object.fromEntries(rows.map((r) => [r.native_id, r]));
  if (by.F1?.native_category !== 'A' || by.F1?.severity !== 'Critical' || by.F1?.confidence !== 'confirmed' || by.F1?.native_confidence !== 'CONFIRMED') fail('F1 must map area A, keep Critical, confidence CONFIRMED→confirmed with the native label kept');
  if (by.F1?.prior_native_id !== 'F1' || by.F1?.prior_status !== 'still-open') fail('prior_id/prior_status must ride into the port row');
  if (by.F2?.polarity !== 'strength' || by.F2?.severity !== undefined) fail('a strength row carries no severity (never a Low)');
  if (by.F3?.confidence !== 'plausible' || by.F3?.mechanism_unproven !== true) fail('PLAUSIBLE→plausible and mechanism_unproven must be carried');
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
  const clean = convert('deep-code-review', sample.replace(/findings:[\s\S]*prior_not_rechecked/, 'findings: []\nprior_not_rechecked'), null);
  if (clean.length !== 0 || !clean.coverage) fail('full coverage + empty findings must convert to zero rows WITH the coverage block (a recorded clean run)');
  // the sidecar: written block-style, loadable, and it turns a contributed axis "partially measured"
  const tmp = join(HERE, 'tmp-dcr'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), 'engine: fixture\nscanners:\n  repo-eval:\n    status: ran\n  deep-code-review:\n    status: ran\n  gitleaks:\n    status: ran\n  fresh-clone:\n    status: skipped\n    reason: "fixture: not executed"\n  dependency-scan:\n    status: skipped\n    reason: "fixture: not executed"\n  repo-census:\n    status: skipped\n    reason: "fixture: not executed"\n');
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

// ── fresh-clone instrument (map/fresh-clone.mjs → ingest profile fresh-clone) ──
// The runner over the public fixture must record what IS: the two declared steps
// pass, the undeclared floor steps read not-declared (never passed), the planted
// README claim reads missing, and the exit is 1. The converter turns exactly those
// into gap rows and nothing else; a runner crash (exit 2) halts it; an all-passing
// document with exit 0 is a verified-clean run (zero rows); every category maps.
{
  const fail = (m) => negFailures.push('fresh-clone: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  const fx = join(HERE, 'instruments', 'fresh-clone-target');
  const tmp = join(HERE, 'tmp-fresh-clone'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'fresh-clone.json');
  // (a) the runner, in place, no install (the fixture declares no dependencies)
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '120'], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the fixture must exit 1 (a missing claim is a gap; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    const st = Object.fromEntries((doc.steps || []).map((s) => [s.name, s.status]));
    if (doc.exit !== 1 || doc.tool !== 'fresh-clone' || doc.target?.cloned !== false) fail(`document must carry tool fresh-clone, exit 1, cloned false (got ${doc.tool}/${doc.exit}/${doc.target?.cloned})`);
    if (st.test !== 'passed' || st.build !== 'passed') fail(`declared test and build must pass (got test ${st.test}, build ${st.build})`);
    if (st.lint !== 'not-declared' || st.typecheck !== 'not-declared' || st.migrate !== 'not-declared') fail(`undeclared lint/typecheck/migrate must read not-declared, never passed (got ${st.lint}/${st.typecheck}/${st.migrate})`);
    if (st.install !== 'not-declared') fail(`a package with no dependencies and no lockfile has no install to run (got ${st.install})`);
    if (doc.steps.length !== 6 || doc.steps.some((s) => !['passed', 'failed', 'not-declared', 'timed-out', 'skipped'].includes(s.status))) fail('every step must carry one of the five closed statuses');
    if (doc.steps.some((s) => s.status === 'passed' && !(s.command && Number.isInteger(s.exit_code) && Number.isInteger(s.duration_ms)))) fail('a run step must record command, exit code and duration');
    const claims = Object.fromEntries((doc.readme_claims || []).map((c) => [c.name, c]));
    if (claims.test?.status !== 'present' || claims.build?.status !== 'present') fail('claims for scripts that exist must read present');
    if (claims.deploy?.status !== 'missing' || !Number.isInteger(claims.deploy?.line)) fail('the planted `npm run deploy` claim must read missing with its README line');
    if (doc.toolchain?.family !== 'node' || doc.toolchain?.package_manager !== 'npm') fail('the toolchain must be detected as node/npm from package.json');
    // (b) convert: rows for the missing claim and the not-declared floor steps, none for the passing steps
    const rows = convert('fresh-clone', raw, 1);
    const cats = rows.map((r) => r.native_category).sort().join(',');
    if (cats !== 'lint,readme-claim,typecheck') fail(`convert must yield exactly lint, typecheck, readme-claim gap rows — no migrate row for a tree with no database (got ${cats || '(none)'})`);
    if (!Array.isArray(doc.toolchain?.database_signals) || doc.toolchain.database_signals.length) fail('the fixture carries no database signals');
    const dbDoc = { ...doc, toolchain: { ...doc.toolchain, database_signals: ['dep:@prisma/client'] } };
    if (!convert('fresh-clone', JSON.stringify(dbDoc), 1).some((r) => r.native_category === 'migrate')) fail('with a database in the tree, an undeclared migrate step is a gap');
    if (rows.some((r) => r.polarity !== 'gap' || !r.fix || !r.severity)) fail('every fresh-clone row is a gap with a severity and a fix');
    const claimRow = rows.find((r) => r.native_category === 'readme-claim');
    if (claimRow?.evidence[0] !== `README.md:${claims.deploy?.line}`) fail(`a missing claim must cite README.md:<line> (got ${claimRow?.evidence[0]})`);
    if (rows.find((r) => r.native_category === 'lint')?.evidence[0] !== 'package.json:1') fail('a step row must cite the manifest that declares the steps');
    if (rows.some((r) => r.native_category === 'test' || r.native_category === 'build')) fail('a passing step must yield no row');
    if (rows[0]?.id !== 'F-900') fail(`fresh-clone ids start at F-900 (got ${rows[0]?.id})`);
    if (JSON.stringify(rows).includes('output_tail') || JSON.stringify(rows).includes('> fresh-clone-target@')) fail('step output must never be copied into rows (it stays in the raw archive)');
    // a failed install/build/test reads High; timed-out likewise; not-declared reads Medium
    const failedDoc = { ...doc, exit: 1, steps: doc.steps.map((s) => s.name === 'build' ? { ...s, status: 'failed', exit_code: 1 } : s.name === 'test' ? { ...s, status: 'timed-out', exit_code: null, reason: 'exceeded 1s' } : s) };
    const fr = Object.fromEntries(convert('fresh-clone', JSON.stringify(failedDoc), 1).map((r) => [r.native_category, r]));
    if (fr.build?.severity !== 'High' || fr.test?.severity !== 'High' || fr.lint?.severity !== 'Medium') fail(`failed build / timed-out test read High, not-declared lint Medium (got ${fr.build?.severity}/${fr.test?.severity}/${fr.lint?.severity})`);
    if (!/exit 1/.test(fr.build?.observation || '')) fail('a failed step row carries the exit code in its observation');
    // (c) a runner crash halts; a document that disagrees with the exit code halts; truncation halts
    mustThrow('a runner crash (exit 2)', () => convert('fresh-clone', raw, 2));
    mustThrow('a document whose exit disagrees with the runner exit', () => convert('fresh-clone', raw, 0));
    mustThrow('a truncated document (no steps)', () => convert('fresh-clone', JSON.stringify({ tool: 'fresh-clone', exit: 1, readme_claims: [] }), 1));
    mustThrow('a document missing a step row', () => convert('fresh-clone', JSON.stringify({ ...doc, steps: doc.steps.filter((s) => s.name !== 'test') }), 1));
    mustThrow('an unknown step status', () => convert('fresh-clone', JSON.stringify({ ...doc, steps: doc.steps.map((s) => s.name === 'lint' ? { ...s, status: 'ok' } : s) }), 1));
    mustThrow('malformed JSON', () => convert('fresh-clone', raw.slice(0, 200), 1));
    mustThrow('a foreign report', () => convert('fresh-clone', '[]', 0));
    // (d) an all-passing synthetic document with exit 0 is a verified-clean run: zero rows
    const cleanDoc = { ...doc, exit: 0, steps: doc.steps.map((s) => ({ ...s, status: 'passed', command: s.command || `npm run ${s.name}`, exit_code: 0 })), readme_claims: doc.readme_claims.map((c) => ({ ...c, status: 'present' })) };
    if (convert('fresh-clone', JSON.stringify(cleanDoc), 0).length !== 0) fail('an all-passing document (exit 0) must convert to zero rows (the explicit empty file records the run)');
    // (e) projection: every category maps, onto existing axes, and the instrument contributes none
    const all = convert('fresh-clone', JSON.stringify({ ...failedDoc, toolchain: { ...failedDoc.toolchain, database_signals: ['dep:knex'] } }), 1);
    const proj = projectMulti(all, adaptersOnce());
    if (proj.unmapped.length) fail(`fresh-clone rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    const axisOf = (cat) => proj.projected.find((p) => p.f.native_category === cat)?.axis;
    if (axisOf('build') !== 'context-economy' || axisOf('migrate') !== 'context-economy') fail('build / migrate must land on the reproducibility-shaped axis (context-economy, where d-fresh-clone-runs lives)');
    if (axisOf('test') !== 'deterministic-gates' || axisOf('lint') !== 'deterministic-gates') fail('test / lint must land on the shared deterministic-gates axis');
    if (axisOf('readme-claim') !== 'artifact-legibility') fail('a README claim must land on artifact-legibility');
    if (contributedBySources(adaptersOnce(), ['fresh-clone']).size !== 0) fail('fresh-clone is an instrument and must contribute no axis');
    const rogue = projectMulti([{ ...rows[0], native_category: 'deploy' }], adaptersOnce());
    if (!rogue.unmapped.length) fail('an unknown fresh-clone category must halt at projection (default: FAIL)');
    // the CLI end to end: ingest writes the rows file and the raw archive, and the run validates green
    copyFixtureFindings('notesbox', tmp);
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), readFileSync(join(HERE, 'fixtures', 'notesbox', 'map', 'scanners.yaml'), 'utf8').replace(/  fresh-clone:\n    status: skipped\n    reason: "[^"]*"\n/, '  fresh-clone:\n    status: ran\n'));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', out, '--exit', '1'], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept the fixture document (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (!existsSync(join(tmp, 'map', 'findings', 'fresh-clone.yaml')) || !existsSync(join(tmp, 'map', 'raw', 'fresh-clone.json'))) fail('ingest must write map/findings/fresh-clone.yaml and archive the raw document');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested fresh-clone run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
    // a verified-clean run: the explicit empty file validates green with fresh-clone recorded as ran
    writeFileSync(join(tmp, 'clean.json'), JSON.stringify(cleanDoc));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', join(tmp, 'clean.json'), '--exit', '0'], { stdio: 'pipe' }); } catch { fail('ingest must accept a clean (exit 0) document'); }
    const cleanFile = readFileSync(join(tmp, 'map', 'findings', 'fresh-clone.yaml'), 'utf8');
    if (!/0 row\(s\)/.test(cleanFile) || /^- id:/m.test(cleanFile)) fail('a clean run writes the explicit empty rows file');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch { fail('a verified-clean fresh-clone run (empty explicit file, manifest ran) must validate green'); }
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ── dependency-scan instrument (map/dependency-scan.mjs → ingest profile dependency-scan) ─
// The converter turns a synthetic dependency-scan document into exactly: one gap row
// per advisory (category = its own severity), one lockfile-failed gap per failed
// lockfile, one lockfile-unsupported gap per not-supported (pnpm/yarn) lockfile, and
// nothing for a clean audited lockfile. A runner crash (exit 2) halts it; a document
// whose exit disagrees with the runner exit halts; a truncated document halts. Every
// category maps onto the shared code-security axis and the instrument contributes
// none. The yardstick decides d-dependencies-known-clean on the `critical`
// category alone — a run with high rows and none critical still reads met.
{
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
      { path: 'packages/bar/pnpm-lock.yaml', status: 'not-supported', manager: 'pnpm', reason: 'dependency-scan audits npm lockfiles only; pnpm lockfiles are not covered' },
    ],
    exit: 1,
  };
  const raw = JSON.stringify(doc);
  // (a) convert: one row per advisory, one per failed lockfile, one per unsupported lockfile
  const rows = convert('dependency-scan', raw, 1);
  const cats = rows.map((r) => r.native_category).sort().join(',');
  if (cats !== 'high,lockfile-failed,lockfile-unsupported') fail(`convert must yield exactly high, lockfile-failed, lockfile-unsupported gap rows (got ${cats || '(none)'})`);
  if (rows.some((r) => r.polarity !== 'gap' || !r.fix || !r.severity)) fail('every dependency-scan row is a gap with a severity and a fix');
  const by = Object.fromEntries(rows.map((r) => [r.native_category, r]));
  if (by.high?.severity !== 'High') fail(`a high advisory must map severity High (got ${by.high?.severity})`);
  if (by['lockfile-failed']?.severity !== 'Medium' || by['lockfile-unsupported']?.severity !== 'Medium') fail('a failed or unsupported lockfile reads severity Medium');
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
  if (axisOf('high') !== 'code-security' || axisOf('lockfile-failed') !== 'code-security' || axisOf('lockfile-unsupported') !== 'code-security') fail('every dependency-scan category must land on code-security');
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
  }
}

// ── fresh-clone workspaces ──────────────
// The public fixture is a real monorepo's shape: a root that is a bare npm-workspaces shell
// (workspaces: ["apps/*"], no scripts, no dependencies, no lockfile of its own) with
// apps/good (passes) and apps/bad (fails offline and deterministically — a failing
// build script standing in for the real npm-ci EUSAGE a clean workspace clone hits
// when the workspace carries its own lockfile but the root has none; see the
// fixture's package.json for why). The runner must record the root as not-declared
// across the board, run each workspace's own plan in its own directory, and read
// exit 1 from apps/bad's failure alone. The converter must turn that into per-
// workspace rows with prefixed native_ids and workspace-relative evidence, and an
// older (pre-workspaces) document with no `workspaces` key must still convert exactly as
// it always has.
{
  const fail = (m) => negFailures.push('fresh-clone-workspaces: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-monorepo');
  const tmp = join(HERE, 'tmp-fresh-clone-ws'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'fresh-clone.json');
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '60'], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the monorepo fixture must exit 1 (apps/bad's build fails; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    if (doc.exit !== 1) fail(`document exit must be 1 (got ${doc.exit})`);
    if (!Array.isArray(doc.workspaces) || doc.workspaces.length !== 2) fail(`document must carry two workspaces (got ${doc.workspaces?.length})`);
    if (doc.steps.some((s) => s.status !== 'not-declared')) fail(`the root (a bare workspaces shell) must read every step not-declared (got ${JSON.stringify(doc.steps.map((s) => s.status))})`);
    const byPath = Object.fromEntries((doc.workspaces || []).map((w) => [w.path, w]));
    const good = byPath['apps/good'], bad = byPath['apps/bad'];
    if (!good || !bad) fail(`workspaces must be apps/good and apps/bad (got ${Object.keys(byPath).join(', ')})`);
    if (good) {
      const st = Object.fromEntries(good.steps.map((s) => [s.name, s.status]));
      if (st.build !== 'passed' || st.test !== 'passed') fail(`apps/good must pass build and test (got build ${st.build}, test ${st.test})`);
    }
    if (bad) {
      const st = Object.fromEntries(bad.steps.map((s) => [s.name, s.status]));
      if (st.build !== 'failed') fail(`apps/bad must read its failure — build failed (got ${st.build})`);
    }
    // convert: rows for both workspaces, prefixed native_ids, workspace-relative evidence
    const rows = convert('fresh-clone', raw, 1);
    const wsRows = rows.filter((r) => r.native_id.startsWith('apps/'));
    if (!wsRows.length) fail('convert must emit rows for the workspaces, not only the root');
    const badBuild = rows.find((r) => r.native_id === 'apps/bad:build:failed');
    if (!badBuild) fail(`convert must emit a row native_id apps/bad:build:failed (got ${rows.map((r) => r.native_id).join(', ')})`);
    if (badBuild && (badBuild.native_category !== 'build' || badBuild.evidence[0] !== 'apps/bad/package.json:1')) fail(`the workspace build row must keep native_category build (for the adapter map) and cite apps/bad/package.json:1 (got ${badBuild.native_category} / ${badBuild.evidence[0]})`);
    if (badBuild && !/workspace apps\/bad/.test(badBuild.observation)) fail('the workspace row observation must name the workspace');
    if (rows.some((r) => r.native_id.startsWith('apps/good:') && r.native_category !== 'lint' && r.native_category !== 'typecheck')) fail('apps/good must yield gap rows only for its not-declared floor steps (lint, typecheck), never for its passing build/test');
    // every category still maps (no rogue category is introduced by the workspace prefix)
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`workspace rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    // an older document with no `workspaces` key at all still converts exactly as before
    const oldShape = { ...doc }; delete oldShape.workspaces;
    const oldRows = convert('fresh-clone', JSON.stringify(oldShape), 1);
    if (oldRows.some((r) => r.native_id.startsWith('apps/'))) fail('a document with no workspaces key must convert with no workspace rows');
    const rootOnly = rows.filter((r) => !r.native_id.startsWith('apps/'));
    if (JSON.stringify(oldRows) !== JSON.stringify(rootOnly)) fail('a document with no workspaces key must convert its root rows exactly as a document with an empty workspaces list does');
    // a workspace entry missing its steps[] halts (fail loud, never empty)
    let threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: [{ path: 'apps/bad', readme_claims: [] }] }), 1); } catch { threw = true; }
    if (!threw) fail('a workspace entry with no steps[] must halt');
    threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: [{ ...bad, steps: bad.steps.filter((s) => s.name !== 'test') }] }), 1); } catch { threw = true; }
    if (!threw) fail('a workspace entry missing a step row must halt');
    threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: 'apps/bad' }), 1); } catch { threw = true; }
    if (!threw) fail('a workspaces value that is not a list must halt');
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ── descriptor category as a list: two rows one instrument decider holds jointly ─
// A descriptor's `decide.category` may be a list of native_category values it must hold
// jointly (e.g. fresh-clone [install, build]): a finding in EITHER listed category is part
// of the population; the descriptor reads met only when EVERY listed category is met by
// the same rules a single-category row already uses.
{
  const fail = (m) => negFailures.push('yardstick-list-category: ' + m);
  const reg = loadYardstick();
  const listRequirement = { id: 'd-test-list', title: 'test', tier: 'reproducibility', topic: 'context-economy', tags: [], decide: { kind: 'instrument', scanner: 'fresh-clone', category: ['install', 'build'] }, check: 'x', sources: ['x'], status: 'draft' };
  const testReg = { ...reg, requirements: [listRequirement] };
  const ran = [{ scanner: 'fresh-clone', status: 'ran' }];
  // a gap in EITHER listed category decides the row (here: only "build" has a gap)
  const withGap = [{ id: 'F-1', source: 'fresh-clone', native_category: 'build', polarity: 'gap', observation: 'x', evidence: ['a:1'] }];
  const gapRows = measureRun({ findings: withGap, manifest: ran, inputs: null, coverage: {} }, testReg);
  if (gapRows[0]?.status !== 'unmet' || !gapRows[0].findings.includes('F-1')) fail(`a gap in either listed category must decide the row unmet (got ${gapRows[0]?.status})`);
  // no rows in either listed category, from an instrument that ran: met (nothing to report)
  const noRows = measureRun({ findings: [], manifest: ran, inputs: null, coverage: {} }, testReg);
  if (noRows[0]?.status !== 'met') fail(`no rows in either listed category from a clean instrument run must read met (got ${noRows[0]?.status})`);
  // a skipped manifest reads not-measured regardless of the category shape
  const skipped = measureRun({ findings: [], manifest: [{ scanner: 'fresh-clone', status: 'skipped', reason: 'no scratch clone here' }], inputs: null, coverage: {} }, testReg);
  if (skipped[0]?.status !== 'not-measured' || !/no scratch clone here/.test(skipped[0].note)) fail(`a skipped manifest must read not-measured with its reason, list category or not (got ${skipped[0]?.status} / ${skipped[0]?.note})`);
  // a peer scanner with a list category: met only when EVERY listed category is scanned clean
  const peerRequirement = { ...listRequirement, id: 'd-test-list-peer', decide: { kind: 'instrument', scanner: 'deep-code-review', category: ['B', 'N'] } };
  const peerRan = [{ scanner: 'deep-code-review', status: 'ran' }];
  const oneScanned = measureRun({ findings: [], manifest: peerRan, inputs: null, coverage: { 'deep-code-review': { coverage: { B: { status: 'scanned' }, N: { status: 'not-scanned', note: 'no config surface' } } } } }, { ...testReg, requirements: [peerRequirement] });
  if (oneScanned[0]?.status !== 'not-measured') fail(`a list category met in one member and not-scanned in the other must NOT read met (got ${oneScanned[0]?.status})`);
  const bothScanned = measureRun({ findings: [], manifest: peerRan, inputs: null, coverage: { 'deep-code-review': { coverage: { B: { status: 'scanned' }, N: { status: 'scanned' } } } } }, { ...testReg, requirements: [peerRequirement] });
  if (bothScanned[0]?.status !== 'met') fail(`a list category must read met once every listed category is independently scanned clean (got ${bothScanned[0]?.status})`);
  // validateYardstick: accepts a list category, rejects an empty one
  if (validateYardstick({ ...reg, requirements: [listRequirement] }).length) fail('validateYardstick must accept a non-empty list category');
  const emptyList = { ...listRequirement, decide: { kind: 'instrument', scanner: 'fresh-clone', category: [] } };
  if (!validateYardstick({ ...reg, requirements: [emptyList] }).some((e) => /category/.test(e))) fail('validateYardstick must reject an empty category list');
}

// ── repo-census instrument (map/repo-census.mjs → ingest profile repo-census) ──
// The runner over the public fixture (a tiny monorepo, root + apps/one, plus
// ops/evidence/) must record what IS:
// architecture-page passes at the root (an Architecture section naming a
// database) and gaps for apps/one (no docs there at all); agent-contract gaps at the
// root citing the planted `## Status` heading, and gaps for apps/one (absent); runbook
// gaps naming the missing restore procedure; ci-gate gaps citing the planted
// continue-on-error step; and the six owner-evidence transcript checks read one pass
// (d-backup-restore-exercised, a complete fresh transcript) and five gaps, each for a
// different planted defect: an email-shaped `by` plus `result: fail` (d-rollback-
// exercised), a `deployed_sha` that disagrees with `commit` (d-deploy-one-command), a
// date outside the freshness window (d-smoke-on-deployed), a stub body (d-monitoring-
// with-alert), and an absent file (d-cost-alerts). The converter turns every gap into
// a gap row (Medium, except ci-gate fail-open which is High) and every pass into a
// strength row; a runner crash (exit 2) halts it; every category maps; an all-pass run
// reads the ten re-kinded floor rows met, with a skipped manifest reading not-measured
// instead; the real (non-synthetic) run reads d-backup-restore-exercised met and the
// other five evidence rows unmet.
{
  const fail = (m) => negFailures.push('repo-census: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  const fx = join(HERE, 'instruments', 'repo-census-target');
  const tmp = join(HERE, 'tmp-repo-census'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'repo-census.json');
  // a fixed --as-of makes the planted staleness (d-smoke-on-deployed, dated 2026-01-01)
  // deterministic regardless of when the harness actually runs
  const AS_OF = '2026-09-24';
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), fx, '--out', out, '--default-branch', 'main', '--as-of', AS_OF], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the fixture must exit 1 (planted gaps; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    if (doc.exit !== 1 || doc.tool !== 'repo-census') fail(`document must carry tool repo-census, exit 1 (got ${doc.tool}/${doc.exit})`);
    if (!doc.monorepo?.detected || doc.monorepo.locations.join() !== 'apps/one') fail(`the fixture must be detected as a monorepo with apps/one (got ${JSON.stringify(doc.monorepo)})`);
    if (doc.evidence?.asOf !== AS_OF) fail(`the document must record the --as-of date (got ${JSON.stringify(doc.evidence)})`);
    const at = (nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc);
    const arch = at('architecture-page', '.');
    if (arch?.status !== 'pass') fail(`architecture-page must pass at root (got ${arch?.status})`);
    const archApp = at('architecture-page', 'apps/one');
    if (archApp?.status !== 'gap') fail(`architecture-page must gap for apps/one (got ${archApp?.status})`);
    const agent = at('agent-contract', '.');
    if (agent?.status !== 'gap' || !agent.evidence[0]?.includes('AGENTS.md')) fail(`agent-contract must gap at root citing AGENTS.md (got ${agent?.status}/${agent?.evidence})`);
    if (!/Status/.test(agent?.observation || '')) fail('agent-contract gap must cite the planted Status heading');
    const agentApp = at('agent-contract', 'apps/one');
    if (agentApp?.status !== 'gap') fail(`agent-contract must gap for apps/one (got ${agentApp?.status})`);
    const rb = doc.checks.find((c) => c.name === 'runbook');
    if (rb?.status !== 'gap' || !/restore/.test(rb.observation)) fail(`runbook must gap naming restore (got ${rb?.status}/${rb?.observation})`);
    const ci = doc.checks.find((c) => c.name === 'ci-gate');
    if (ci?.status !== 'gap' || !/continue-on-error/.test(ci.observation) || !ci.evidence[0]?.includes('ci.yml')) fail(`ci-gate must gap citing the continue-on-error line (got ${ci?.status}/${ci?.observation}/${ci?.evidence})`);
    // the six owner-evidence checks: one pass, five gaps, each for its own planted reason
    const ev = (id) => doc.checks.find((c) => c.name === `evidence-${id}`);
    const backupRestore = ev('d-backup-restore-exercised');
    if (backupRestore?.status !== 'pass' || !/attests, by platform-eng at commit/.test(backupRestore.observation) || !/not that the procedure actually happened/.test(backupRestore.observation))
      fail(`d-backup-restore-exercised must pass, attested by role and commit, with the truth disclaimer (got ${backupRestore?.status}/${backupRestore?.observation})`);
    const rollback = ev('d-rollback-exercised');
    if (rollback?.status !== 'gap' || !/looks like an email address/.test(rollback.observation) || !/result: fail/.test(rollback.observation))
      fail(`d-rollback-exercised must gap citing both the email-shaped by and result: fail (got ${rollback?.status}/${rollback?.observation})`);
    const deploy = ev('d-deploy-one-command');
    if (deploy?.status !== 'gap' || !/deployed_sha .* does not match commit/.test(deploy.observation))
      fail(`d-deploy-one-command must gap citing the deployed_sha/commit mismatch (got ${deploy?.status}/${deploy?.observation})`);
    const smoke = ev('d-smoke-on-deployed');
    if (smoke?.status !== 'gap' || !/stale: dated 2026-01-01/.test(smoke.observation))
      fail(`d-smoke-on-deployed must gap as stale, naming the planted date (got ${smoke?.status}/${smoke?.observation})`);
    const monitoring = ev('d-monitoring-with-alert');
    if (monitoring?.status !== 'gap' || !/stub/.test(monitoring.observation))
      fail(`d-monitoring-with-alert must gap as a stub body (got ${monitoring?.status}/${monitoring?.observation})`);
    const costAlerts = ev('d-cost-alerts');
    if (costAlerts?.status !== 'gap' || !/No evidence transcript found/.test(costAlerts.observation) || costAlerts.evidence?.[0] !== '.:1')
      fail(`d-cost-alerts must gap as absent, evidence .:1 (got ${costAlerts?.status}/${costAlerts?.observation}/${costAlerts?.evidence})`);
    // the document never carries the transcript's body — header fields (counts) only
    const docText = JSON.stringify(doc);
    if (/torn down after verification/.test(docText)) fail('the document must never carry evidence body text, only header fields and line counts');
    if (typeof backupRestore?.detail?.bodyNonEmptyLines !== 'number' || typeof backupRestore?.detail?.bodyHasFencedBlock !== 'boolean') fail('an evidence check detail must carry body line counts, not body text');
    if (doc.checks.length !== 12) fail(`the fixture must yield 12 checks (2 architecture-page + 2 agent-contract + runbook + ci-gate + 6 evidence; got ${doc.checks.length})`);
    // (b) convert: a gap row per gap check, a strength row per pass check
    const rows = convert('repo-census', raw, 1);
    if (rows.length !== 12) fail(`convert must yield 12 rows (got ${rows.length})`);
    const byNc = {}; for (const r of rows) (byNc[r.native_category] ??= []).push(r);
    if ((byNc['architecture-page'] || []).filter((r) => r.polarity === 'strength').length !== 1) fail('exactly one architecture-page strength row (root)');
    if ((byNc['architecture-page'] || []).filter((r) => r.polarity === 'gap').length !== 1) fail('exactly one architecture-page gap row (apps/one)');
    if ((byNc['agent-contract'] || []).filter((r) => r.polarity === 'gap').length !== 2) fail('two agent-contract gap rows (root + apps/one)');
    if ((byNc['runbook'] || []).length !== 1 || byNc['runbook'][0].polarity !== 'gap') fail('one runbook gap row');
    if ((byNc['ci-gate'] || []).length !== 1 || byNc['ci-gate'][0].polarity !== 'gap' || byNc['ci-gate'][0].severity !== 'High') fail(`ci-gate fail-open must read gap/High (got ${byNc['ci-gate']?.[0]?.polarity}/${byNc['ci-gate']?.[0]?.severity})`);
    // the six evidence categories: native_category is the real, colon-bearing name;
    // one strength row (the pass), five gap rows (the rest)
    const EVIDENCE_IDS = ['d-backup-restore-exercised', 'd-rollback-exercised', 'd-deploy-one-command', 'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts'];
    for (const id of EVIDENCE_IDS) {
      const nc = `evidence-${id}`;
      const want = id === 'd-backup-restore-exercised' ? 'strength' : 'gap';
      const got = byNc[nc];
      if (!got || got.length !== 1 || got[0].polarity !== want) fail(`${nc} must convert to exactly one ${want} row (got ${JSON.stringify(got)})`);
    }
    if (rows.filter((r) => r.polarity === 'gap').some((r) => r.native_category !== 'ci-gate' && r.severity !== 'Medium')) fail('every non-ci-gate gap must read Medium severity');
    if (rows.some((r) => !Array.isArray(r.evidence) || !r.evidence.length)) fail('every row needs at least one path:line');
    if (rows[0]?.id !== 'F-960') fail(`repo-census ids start at F-960 (got ${rows[0]?.id})`);
    // (c) a runner crash halts; a document that disagrees with the exit code halts; truncation halts
    mustThrow('a runner crash (exit 2)', () => convert('repo-census', raw, 2));
    mustThrow('a document whose exit disagrees with the runner exit', () => convert('repo-census', raw, 0));
    mustThrow('a truncated document (no checks)', () => convert('repo-census', JSON.stringify({ tool: 'repo-census', exit: 1, checks: [] }), 1));
    mustThrow('an unknown check name', () => convert('repo-census', JSON.stringify({ ...doc, checks: doc.checks.map((c) => c.name === 'runbook' ? { ...c, name: 'unknown-check' } : c) }), 1));
    mustThrow('an unknown status', () => convert('repo-census', JSON.stringify({ ...doc, checks: doc.checks.map((c) => c.name === 'runbook' ? { ...c, status: 'ok' } : c) }), 1));
    mustThrow('malformed JSON', () => convert('repo-census', raw.slice(0, 50), 1));
    mustThrow('a foreign report', () => convert('repo-census', '[]', 0));
    // (d) an all-passing synthetic document with exit 0 is a verified-clean-in-the-strength-
    // sense run: one strength row per check, no gap rows
    const cleanDoc = { ...doc, exit: 0, checks: doc.checks.map((c) => ({ ...c, status: 'pass', observation: `${c.name} passes`, evidence: (c.evidence && c.evidence.length) ? c.evidence : ['README.md:1'] })) };
    const cleanRows = convert('repo-census', JSON.stringify(cleanDoc), 0);
    if (cleanRows.length !== 12 || cleanRows.some((r) => r.polarity !== 'strength')) fail('an all-passing document must convert to strength rows only, one per check');
    // (e) projection: every category maps, onto existing axes, and the instrument contributes none
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`repo-census rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    const axisOf = (cat) => proj.projected.find((p) => p.f.native_category === cat)?.axis;
    if (axisOf('architecture-page') !== 'artifact-legibility' || axisOf('runbook') !== 'artifact-legibility') fail('architecture-page / runbook must land on the docs-legibility axis (artifact-legibility)');
    // the agent contract stays on the axis the yardstick homes d-agent-contract on (improvement-loop): the adapter follows the yardstick, never the reverse
    if (axisOf('agent-contract') !== 'improvement-loop') fail('agent-contract must land on improvement-loop, the axis the yardstick homes d-agent-contract on');
    if (axisOf('ci-gate') !== 'deterministic-gates') fail('ci-gate must land on the shared deterministic-gates axis');
    // the six evidence categories land on a fixed axis each (their requirements' topics have no axis)
    const EVIDENCE_AXES = {
      'd-backup-restore-exercised': 'code-security',
      'd-rollback-exercised': 'context-economy',
      'd-deploy-one-command': 'code-security',
      'd-smoke-on-deployed': 'deterministic-gates',
      'd-monitoring-with-alert': 'verification',
      'd-cost-alerts': 'artifact-legibility',
    };
    for (const [id, wantAxis] of Object.entries(EVIDENCE_AXES)) {
      const got = axisOf(`evidence-${id}`);
      if (got !== wantAxis) fail(`evidence-${id} must land on ${wantAxis} (got ${got})`);
    }
    if (contributedBySources(adaptersOnce(), ['repo-census']).size !== 0) fail('repo-census is an instrument and must contribute no axis');
    const rogue = projectMulti([{ ...rows[0], native_category: 'unknown-check' }], adaptersOnce());
    if (!rogue.unmapped.length) fail('an unknown repo-census category must halt at projection (default: FAIL)');
    // (f) the yardstick: the four pre-existing re-kinded floor rows, plus the
    // six evidence rows, read met from an all-pass run with a `ran` manifest, and
    // not-measured (with the reason) when repo-census is recorded skipped instead
    const reg = loadYardstick();
    const RC_DESCRIPTOR_IDS = ['d-architecture-page', 'd-agent-contract', 'd-runbook', 'd-ci-gate-on-default-branch', ...EVIDENCE_IDS];
    const metRows = Object.fromEntries(measureRun({ findings: cleanRows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    for (const id of RC_DESCRIPTOR_IDS) {
      if (metRows[id]?.status !== 'met') fail(`${id} must read met from an all-pass repo-census run (got ${metRows[id]?.status})`);
    }
    const skippedRows = Object.fromEntries(measureRun({ findings: cleanRows, manifest: [{ scanner: 'repo-census', status: 'skipped', reason: 'no filesystem access' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    for (const id of RC_DESCRIPTOR_IDS) {
      if (skippedRows[id]?.status !== 'not-measured' || !/no filesystem access/.test(skippedRows[id].note)) fail(`${id} must read not-measured with the recorded reason when repo-census is skipped (got ${skippedRows[id]?.status}/${skippedRows[id]?.note})`);
    }
    // the REAL (non-synthetic) run: d-backup-restore-exercised is the one evidence row
    // actually met; the other five are actually unmet (planted gaps), same `ran` manifest
    const realRows = Object.fromEntries(measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (realRows['d-backup-restore-exercised']?.status !== 'met') fail(`d-backup-restore-exercised must read met from the real fixture run (got ${realRows['d-backup-restore-exercised']?.status})`);
    for (const id of ['d-rollback-exercised', 'd-deploy-one-command', 'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts']) {
      if (realRows[id]?.status !== 'unmet') fail(`${id} must read unmet from the real fixture run (its planted gap; got ${realRows[id]?.status})`);
    }
    // the CLI end to end: ingest writes the rows file and the raw archive, and the run validates green
    copyFixtureFindings('notesbox', tmp);
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), readFileSync(join(HERE, 'fixtures', 'notesbox', 'map', 'scanners.yaml'), 'utf8').replace(/  repo-census:\n    status: skipped\n    reason: "[^"]*"\n/, '  repo-census:\n    status: ran\n'));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'repo-census', '--raw', out, '--exit', '1'], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept the fixture document (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (!existsSync(join(tmp, 'map', 'findings', 'repo-census.yaml')) || !existsSync(join(tmp, 'map', 'raw', 'repo-census.json'))) fail('ingest must write map/findings/repo-census.yaml and archive the raw document');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested repo-census run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
  }
  rmSync(tmp, { recursive: true, force: true });
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
    try { out = execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--run', run, ...extra, '--json'], { stdio: 'pipe' }).toString(); }
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
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--run', run, '--json'], { stdio: 'pipe' }); }
  catch (e) { gateExit = e.status; }
  if (gateExit !== 1) fail(`--json with coverage gaps must exit 1 (got ${gateExit})`);
  let vExit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'negative', 'bad-dimension'), '--json'], { stdio: 'pipe' }); }
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
  try { out = execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), join(HERE, 'enumerate-fixture', 'target')], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || '') + String(e.message || ''); }
  for (const need of ['tool: send_thing', 'tool: read_thing', 'mcp-toolset: analytics']) {
    if (!out.includes(need)) fail(`enumerate did not surface "${need}" — the agent tool-def detector regressed`);
  }
  if (out.includes('fixture_only_tool')) fail('enumerate surfaced a tool defined only in a test file — the test-file skip regressed');
}

// ── yardstick-register invariants: extracted rows, honest deciders ───────────
// The register must load and validate (closed vocab, every row sourced); each decider
// must read a synthetic base the way yardstick/README.md says; and the two honesty
// gates must hold: an instrument row decides only when the manifest says it ran, and a
// claim row NEVER reads met from a run. Prose is never a decider.
{
  const fail = (m) => negFailures.push('yardstick-register: ' + m);
  let reg = null;
  try { reg = loadYardstick(); } catch (e) { fail('yardstick failed to load: ' + e.message.split('\n')[0]); }
  if (reg) {
    if (validateYardstick(reg).length) fail('validateYardstick must be clean on the shipped register');
    if (!reg.requirements.some((d) => d.decide.kind === 'claim')) fail('the yardstick must carry claim rows (its instrument backlog) — a register that claims to measure everything is the presence-checklist failure');
    const bad = { ...reg, requirements: [{ ...reg.requirements[0], decide: { kind: 'prose', terms: 'x' } }] };
    if (!validateYardstick(bad).some((e) => /decide\.kind/.test(e))) fail('an unknown decide.kind (prose) must be rejected');
    const unsourced = { ...reg, requirements: [{ ...reg.requirements[0], sources: [] }] };
    if (!validateYardstick(unsourced).some((e) => /sources/.test(e))) fail('a row with no sources must be rejected (extracted, not designed)');
    const base = [
      { id: 'F-1', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', observation: 'x', evidence: ['a:1'], confidence: 'confirmed',
        effect: { channel: 'mail-send', reversibility: 'irreversible', external: true, gate_type: 'none', telemetry: 'none', blast_scope: 'tenant' } },
      { id: 'F-2', dimension: 'delegation', polarity: 'strength', subject_type: 'effect', observation: 'x', evidence: ['a:1'], confidence: 'confirmed',
        effect: { channel: 'deploy', reversibility: 'irreversible', external: true, gate_type: 'deterministic-halt', fail_mode: 'open', telemetry: 'audited', blast_scope: 'tenant' } },
      { id: 'F-3', dimension: 'delegation', polarity: 'gap', subject_type: 'capability', observation: 'x', evidence: ['a:1'], confidence: 'confirmed',
        capabilities: { untrusted_input: true, private_data: true, external_effect: true }, reaches: ['F-1'] },
      { id: 'F-9', dimension: 'unprompted', polarity: 'gap', subject_type: 'control', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', source: 'gitleaks', native_category: 'secret', axis: 'code-security' },
    ];
    const inputs = { dimensions: [{ dimension: 'artifact-legibility', sampled: [{ name: 'decision-reconstruction', what: 'w', met: 3, of: 4 }] }] };
    const ran = [{ scanner: 'gitleaks', status: 'ran' }, { scanner: 'repo-eval', status: 'ran' }];
    const rows = measureRun({ findings: base, manifest: ran, inputs, coverage: {} }, reg);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    if (by['d-effects-gated']?.status !== 'unmet' || !by['d-effects-gated'].findings.includes('F-1')) fail('an unheld halt must read d-effects-gated unmet, citing it');
    if (by['d-effects-gated']?.findings.includes('F-2') === false && by['d-gates-fail-closed']?.status !== 'unmet') fail('a gate with fail_mode open must read d-gates-fail-closed unmet');
    if (by['d-effects-traced']?.status !== 'unmet') fail('a halt with telemetry none must read d-effects-traced unmet');
    if (by['d-capability-budget']?.status !== 'unmet') fail('a full trifecta reaching an unheld halt must read d-capability-budget unmet');
    if (by['d-decisions-reconstruct']?.status !== 'mixed' || by['d-decisions-reconstruct'].of !== 4) fail('a 3-of-4 census must read mixed with its denominator');
    if (by['d-secrets-out-of-history']?.status !== 'unmet') fail('a gitleaks secret row with the scanner ran must read d-secrets-out-of-history unmet');
    if (rows.filter((r) => r.kind === 'claim').some((r) => r.status !== 'not-measured')) fail('a claim requirement must never read anything but not-measured from a run');
    if (!rows.every((r) => ['met', 'unmet', 'mixed', 'not-measured'].includes(r.status))) fail('every requirement must carry exactly one closed status');
    // manifest gate: the same rows with gitleaks SKIPPED must read not-measured with the reason
    const skipped = measureRun({ findings: base, manifest: [{ scanner: 'gitleaks', status: 'skipped', reason: 'no history mirror' }], inputs, coverage: {} }, reg);
    const sk = skipped.find((r) => r.id === 'd-secrets-out-of-history');
    if (sk?.status !== 'not-measured' || !/no history mirror/.test(sk.note)) fail('an instrument recorded as skipped must read not-measured WITH the recorded reason, even when rows are present');
    // coverage gate: a peer scanner with no rows reads met only where it says it scanned the domain
    const dcrRan = [{ scanner: 'deep-code-review', status: 'ran' }];
    const covScanned = { 'deep-code-review': { scanner: 'deep-code-review', coverage: { B: { status: 'scanned' }, N: { status: 'not-scanned', note: 'no config surface' } } } };
    const pr = Object.fromEntries(measureRun({ findings: [], manifest: dcrRan, inputs: null, coverage: covScanned }, reg).map((r) => [r.id, r]));
    if (pr['d-routes-authorized']?.status !== 'met') fail('a peer scanner that scanned domain B with no gap rows must read d-routes-authorized met');
    if (pr['d-config-declared']?.status !== 'not-measured' || !/no config surface/.test(pr['d-config-declared'].note)) fail('a peer scanner domain recorded not-scanned must read not-measured with its note');
    const silent = Object.fromEntries(measureRun({ findings: [], manifest: dcrRan, inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (silent['d-routes-authorized']?.status !== 'not-measured') fail('a peer scanner that ran with no rows and NO coverage sidecar must read not-measured (silence is not clean)');
    const gl = Object.fromEntries(measureRun({ findings: [], manifest: [{ scanner: 'gitleaks', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (gl['d-secrets-out-of-history']?.status !== 'met') fail('an instrument that ran clean (exit 0, no rows) must read met');
    const s = summarize(rows);
    if (s.of !== reg.requirements.length || s.decided + s['not-measured'] !== s.of) fail('summary counts must partition the yardstick');
    if (!KINDS.includes('claim')) fail('KINDS must include claim');
  }
}

// ── yardstick topic invariants: every row needs one, from the allowed roster ──
// A requirement's `topic:` is required and closed to the axis roster plus custody,
// reproducibility and operability (the tiers with no axis of their own). Missing or unknown must both fail closed.
{
  const fail = (m) => negFailures.push('yardstick-topic: ' + m);
  const reg = loadYardstick();
  const noTopic = { ...reg, requirements: reg.requirements.map((d, i) => i === 0 ? { ...d, topic: undefined } : d) };
  if (!validateYardstick(noTopic).some((e) => /topic/.test(e))) fail('a requirement with no topic must be rejected');
  const badTopic = { ...reg, requirements: reg.requirements.map((d, i) => i === 0 ? { ...d, topic: 'not-a-real-topic' } : d) };
  if (!validateYardstick(badTopic).some((e) => /topic "not-a-real-topic"/.test(e))) fail('a topic outside the allowed list must be rejected');
  if (validateYardstick(reg).length) fail('the shipped register must validate clean with every row carrying a topic');
}

// ── packet: validate-packet (owner/PACKET.md) — strict, fail-closed ───────────
// A public invented packet fixture must validate clean; each negative fixture
// must be refused, FOR ITS OWN REASON (never merely "red") — the class of check
// that class of fixture exists to pin. The CLI is exercised directly (exit code
// + message), the way NEGATIVE above pins map/validate.mjs.
{
  const fail = (m) => negFailures.push('packet: ' + m);
  const reg = loadYardstick();
  const ids = reg.requirements.map((d) => d.id);

  const { doc: validDoc } = loadPacket(join(HERE, 'fixtures', 'packet-valid'));
  if (validatePacket(validDoc, { requirementIds: ids }).length) fail('the public packet-valid fixture must validate clean');

  const PACKET_NEGATIVE = [
    ['packet-secret-shaped', /looks like a secret value/],
    ['packet-email', /looks like an email address/],
    ['packet-unknown-claim', /is not a requirement in yardstick\/requirements\.yaml/],
    ['packet-claim-no-by', /state satisfied requires by/],
    ['packet-unknown-top-key', /unknown top-level key/],
  ];
  for (const [dir, msgRe] of PACKET_NEGATIVE) {
    let stderr = '', code = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'packet.mjs'), join(HERE, 'negative', dir)], { stdio: 'pipe' }); }
    catch (e) { code = e.status; stderr = String(e.stderr || ''); }
    if (code !== 1) fail(`negative/${dir} must exit 1 (fail-closed) — got ${code}`);
    else if (!msgRe.test(stderr)) fail(`negative/${dir} must be refused for its own reason (expected ${msgRe}, got: ${stderr.trim().split('\n').slice(-1)[0]})`);
  }
  // bad YAML: one error, never a stack trace (the packet is data, parsed defensively)
  {
    let stderr = '', code = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'packet.mjs'), join(HERE, 'negative', 'packet-bad-yaml')], { stdio: 'pipe' }); }
    catch (e) { code = e.status; stderr = String(e.stderr || ''); }
    if (code !== 1) fail(`negative/packet-bad-yaml must exit 1 (got ${code})`);
    else if (!/not valid YAML/.test(stderr)) fail('negative/packet-bad-yaml must report one plain YAML error, never a raw stack trace');
    else if (/\bat\s+\S+\.mjs:\d+/.test(stderr)) fail('negative/packet-bad-yaml leaked a stack trace — a YAML the parser cannot read must be one error, not a trace');
  }

  // secret/email shape unit checks — the false-positive guards this class of
  // check depends on: a commit sha, a UUID, and a kebab-case id must all pass
  // clean, or every packet with one in it would be unusable.
  if (secretShape('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')) fail('a 40-char commit sha must not read as a secret (hex-only exemption)');
  if (secretShape('550e8400-e29b-41d4-a716-446655440000')) fail('a UUID must not read as a secret (hex-plus-dash exemption)');
  if (secretShape('d-this-requirement-does-not-exist-and-is-long')) fail('a long kebab-case id must not read as a secret (class-diversity gate)');
  if (!secretShape('sk-ThisLooksLikeARealSecretKeyValue123456')) fail('an sk-… value must read as a secret');
  if (!secretShape('AKIAABCDEFGHIJKLMNOP')) fail('an AKIA… value must read as a secret');
  if (!secretShape('https://user:hunter2@example.com/db')) fail('a URL with an embedded password must read as a secret');
  if (!emailShape('alice@example.com')) fail('an email address must be flagged as one');
  if (emailShape('platform-eng')) fail('a role/handle with no @ must not be flagged as an email address');

  // structural unit checks not covered by a fixture: unknown decide.kind never
  // reachable here, but claim-id cross-check, state enum and not-applicable/reason
  // are exercised directly (fixtures cover the CLI path; these pin the library fn).
  if (!validatePacket({ packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' }, claims: [{ id: ids[0], state: 'not-applicable' }] }, { requirementIds: ids }).some((e) => /not-applicable requires reason/.test(e)))
    fail('a not-applicable claim with no reason must be refused');
  if (validatePacket({ packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' } }, { requirementIds: ids }).length)
    fail('a minimal packet with no claims/custody must still validate clean (every field beyond answered/packet/yardstick is optional)');
  if (!validatePacket({}, { requirementIds: ids }).some((e) => /answered: required/.test(e))) fail('a packet with no answered block must be refused');
  // a placeholder in a role list would count as a person who does not exist (bus factor)
  const withPlaceholder = { packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' }, custody: { people: { build: ['founder'], deploy: ['founder'], restore: ['unknown'] } } };
  if (!validatePacket(withPlaceholder, { requirementIds: ids }).some((e) => /custody\.people\.restore: holds "unknown", which is not a role/.test(e))) fail('a placeholder in a role list must be refused');
  if (validatePacket({ ...withPlaceholder, custody: { people: { build: ['founder'], deploy: ['founder'], restore: [] } } }, { requirementIds: ids }).length) fail('an empty role list ([] when nobody can) must validate');
}

// ── packet phase 2: the yardstick reads the packet (owner/PACKET.md) ──────────
// decideAccountsClaim / decideBusFactorClaim: the two extracted claim rows, met
// / unmet / mixed / null (not decided) — the exact thresholds owner/PACKET.md
// states. decideGenericClaim + measureRun: every other claim row, `basis: owner`
// only when the packet actually spoke to it, and a contradiction recorded (never
// merged) when a packet's `satisfied` meets a run-decided `unmet` row.
{
  const fail = (m) => negFailures.push('packet-measure: ' + m);
  const reg = loadYardstick();

  // accounts: met / unmet / mixed / null(not decided)
  if (decideAccountsClaim(undefined) !== null) fail('no custody.accounts must read null (not decided by the packet)');
  if (decideAccountsClaim({ accounts: [] }) !== null) fail('an empty accounts list must read null, same as absent');
  const acctMet = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }] });
  if (acctMet?.status !== 'met') fail(`every account transferable:yes with an owner_role must read met (got ${acctMet?.status})`);
  const acctUnmet = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }, { account: 'b', transferable: 'no' }] });
  if (acctUnmet?.status !== 'unmet' || !/\bb\b/.test(acctUnmet.note)) fail(`any account transferable:no must read unmet, naming it (got ${acctUnmet?.status} / ${acctUnmet?.note})`);
  const acctMixed = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }, { account: 'b', transferable: 'unknown' }] });
  if (acctMixed?.status !== 'mixed') fail(`an account with unknown owner/transfer (and none transferable:no) must read mixed (got ${acctMixed?.status})`);

  // bus factor: met / unmet / mixed / null(not decided)
  if (decideBusFactorClaim(undefined) !== null) fail('no custody.people must read null (not decided by the packet)');
  const bfMet = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'yes' } });
  if (bfMet?.status !== 'met') fail(`build/deploy/restore each 2+ roles and restore_done:yes must read met (got ${bfMet?.status})`);
  const bfUnmetRole = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a'], restore_done: 'yes' } });
  if (bfUnmetRole?.status !== 'unmet') fail(`a single-role restore must read unmet (got ${bfUnmetRole?.status})`);
  const bfUnmetRestore = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'no' } });
  if (bfUnmetRestore?.status !== 'unmet') fail(`restore_done:no must read unmet even with 2+ roles everywhere (got ${bfUnmetRestore?.status})`);
  const bfMixed = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'unknown' } });
  if (bfMixed?.status !== 'mixed') fail(`an unknown restore_done (no unmet condition otherwise) must read mixed (got ${bfMixed?.status})`);

  // generic claim row (any id): satisfied/not-applicable -> met, open -> unmet, unknown -> not-measured (basis owner still), absent -> null
  const genId = reg.requirements.find((d) => d.decide.kind === 'claim' && d.id !== 'd-accounts-enumerated' && d.id !== 'd-bus-factor').id;
  if (decideGenericClaim(genId, { claims: [] }) !== null) fail('a claim row absent from claims: must read null (not decided)');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'satisfied', by: 'x' }] })?.status !== 'met') fail('satisfied must read met');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'not-applicable', reason: 'x' }] })?.status !== 'met') fail('not-applicable must read met');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'open' }] })?.status !== 'unmet') fail('open must read unmet');
  const unk = decideGenericClaim(genId, { claims: [{ id: genId, state: 'unknown' }] });
  if (unk?.status !== 'not-measured') fail('unknown must read not-measured (but still packet-decided — basis owner)');

  // measureRun end-to-end: basis:owner on the packet-decided rows, basis:run elsewhere,
  // and a contradiction when a packet's satisfied meets a run-decided unmet row
  const findings = [{ id: 'F-1', source: 'gitleaks', native_category: 'secret', polarity: 'gap', observation: 'x', evidence: ['a:1'] }];
  const manifest = [{ scanner: 'gitleaks', status: 'ran' }];
  const packet = {
    claims: [{ id: 'd-secrets-out-of-history', state: 'satisfied', by: 'ci scan' }, { id: genId, state: 'open' }],
    custody: { accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }] },
  };
  const rows = measureRun({ findings, manifest, inputs: null, coverage: {}, packet }, reg);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  if (by['d-secrets-out-of-history']?.status !== 'unmet') fail('a claim on a run-decided row must never change that row\'s own status');
  if (by['d-secrets-out-of-history']?.basis !== 'run') fail('a run-decided row\'s basis must stay run even when a packet also claims it');
  if (by['d-accounts-enumerated']?.basis !== 'owner' || by['d-accounts-enumerated']?.status !== 'met') fail('an extracted claim row the packet decided must read basis:owner');
  if (by[genId]?.basis !== 'owner' || by[genId]?.status !== 'unmet') fail('a generic claim row the packet decided must read basis:owner');
  const untouched = reg.requirements.find((d) => d.decide.kind === 'claim' && !packet.claims.some((c) => c.id === d.id) && d.id !== 'd-accounts-enumerated' && d.id !== 'd-bus-factor').id;
  if (by[untouched]?.basis !== 'run') fail(`a claim row the packet never speaks to must stay basis:run (${untouched})`);
  if (rows.contradictions.length !== 1 || rows.contradictions[0].id !== 'd-secrets-out-of-history' || rows.contradictions[0].run_status !== 'unmet')
    fail(`exactly one contradiction must be recorded for d-secrets-out-of-history (got ${JSON.stringify(rows.contradictions)})`);
  // no packet at all: every row basis:run, no contradictions, identical to pre-packet behavior
  const noPacket = measureRun({ findings, manifest, inputs: null, coverage: {} }, reg);
  if (noPacket.some((r) => r.basis !== 'run')) fail('with no packet, every row must read basis:run');
  if (noPacket.contradictions.length) fail('with no packet, there must be no contradictions');

  // CLI round trip: measure --packet copies the packet into the run; a re-measure
  // with no flag reuses that copy and reproduces byte-for-byte.
  const tmp = join(HERE, 'tmp-packet-measure'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  const packetDir = join(HERE, 'fixtures', 'packet-valid');
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--packet', packetDir, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --packet must succeed on the public packet-valid fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  if (!existsSync(packetManifestPath(tmp))) fail('measure --packet must copy manifest.yaml into the run at owner/manifest.yaml (lib/run-layout.mjs)');
  const yardstickFile = join(tmp, 'yardstick.yaml');
  const firstYaml = existsSync(yardstickFile) ? readFileSync(yardstickFile, 'utf8') : null;
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`a re-measure with no --packet flag must succeed, reusing the run's own copy (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const secondYaml = existsSync(yardstickFile) ? readFileSync(yardstickFile, 'utf8') : null;
  if (firstYaml == null || firstYaml !== secondYaml) fail('re-measuring with no --packet flag must reproduce yardstick.yaml byte-for-byte (the run already carries the packet)');
  const reusedPacket = loadRunPacket(tmp);
  if (!reusedPacket || reusedPacket.repository !== 'example/notesbox') fail("loadRunPacket must read the run's own copied packet with no flag");
  // packet-valid's claims are all on claim-kind rows (never a run-decided one), so
  // this combination must record no contradiction — loadContradictions reads
  // yardstick.yaml's own list, never recomputing it.
  if (loadContradictions(tmp).length) fail(`notesbox + packet-valid must record no contradictions (got ${JSON.stringify(loadContradictions(tmp))})`);
  rmSync(tmp, { recursive: true, force: true });
}

// ── ask-owner: the {{WHAT_WE_FOUND}} marker, with and without a run ───────────
{
  const fail = (m) => negFailures.push('ask-owner: ' + m);
  if (buildWhatWeFound(null) !== NOTHING_YET) fail('with no run, the block must read "Nothing yet: ask everything."');
  if (buildWhatWeFound(join(HERE, 'fixtures', 'ask-owner-run')) === NOTHING_YET) fail('the public ask-owner-run fixture carries real signal — the block must not fall back to "ask everything"');
  const found = buildWhatWeFound(join(HERE, 'fixtures', 'ask-owner-run'));
  if (!/example\/notesbox/.test(found) || !/a1b2c3d4/.test(found)) fail('the block must name the repository and commit from the run\'s own packet');
  if (!/3 of 4/.test(found)) fail('the block must name the credential census count (met of N)');
  if (!/email-send/.test(found) || /internal-write/.test(found)) fail('the block must name only EXTERNAL effect channels (email-send), never an internal one (internal-write)');
  if (!/personal data/i.test(found)) fail('the block must name a census-declared personal-data store');

  const withRun = render(join(HERE, 'fixtures', 'ask-owner-run'));
  if (withRun.includes(MARKER)) fail('render() must replace the marker, never leave it in place');
  if (!/example\/notesbox/.test(withRun)) fail('render() with a run must fold buildWhatWeFound into the template');
  const withoutRun = render(null);
  if (withoutRun.includes(MARKER) || !withoutRun.includes(NOTHING_YET)) fail('render() with no run must replace the marker with "Nothing yet: ask everything."');
}

// ── Intake, Maintain, Improve: three views of one yardstick measurement ───────
// All three read ONLY yardstick.yaml (+ the yardstick for title/check/tier,
// + the manifest for what was not seen) — never findings directly. Intake is the
// floor population, Maintain the fleet population (every row also stamped
// floor: true|false), Improve groups every requirement by topic exactly once.
{
  const fail = (m) => negFailures.push('intake-maintain-improve: ' + m);
  const tmp = join(HERE, 'tmp-views'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed on the notesbox fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'intake.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/intake.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'maintain.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/maintain.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'topics.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`views/improve/topics.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }

  for (const f of ['intake.yaml', 'maintain.yaml', 'improve.yaml']) if (!existsSync(join(tmp, 'views', f))) fail(`views/${f} must be written`);
  if (!existsSync(join(tmp, 'INTAKE.md'))) fail('INTAKE.md must be written at the run root');
  if (!existsSync(join(tmp, 'MAINTAIN.md'))) fail('MAINTAIN.md must be written at the run root');

  const reg = loadYardstick();
  const dupes = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);

  if (existsSync(join(tmp, 'views', 'intake.yaml'))) {
    const doc = parseYaml(readFileSync(join(tmp, 'views', 'intake.yaml'), 'utf8'));
    const floorIds = reg.requirements.filter((d) => (d.tags || []).includes('floor')).map((d) => d.id);
    const all = [...(doc.open || []), ...(doc.met || []), ...(doc.to_run || [])];
    const ids = all.map((r) => r.id);
    const missing = floorIds.filter((id) => !ids.includes(id));
    if (ids.length !== floorIds.length || missing.length || dupes(ids).length)
      fail(`every floor row must appear exactly once across intake.yaml's open/met/to_run (got ${ids.length} of ${floorIds.length} floor rows; missing ${missing.join(', ') || 'none'}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  let maintainDoc = null;
  if (existsSync(join(tmp, 'views', 'maintain.yaml'))) {
    maintainDoc = parseYaml(readFileSync(join(tmp, 'views', 'maintain.yaml'), 'utf8'));
    const fleetIds = reg.requirements.filter((d) => (d.tags || []).includes('fleet')).map((d) => d.id);
    const all = [...(maintainDoc.open || []), ...(maintainDoc.met || []), ...(maintainDoc.to_run || [])];
    const ids = all.map((r) => r.id);
    const missing = fleetIds.filter((id) => !ids.includes(id));
    if (ids.length !== fleetIds.length || missing.length || dupes(ids).length)
      fail(`every fleet row must appear exactly once in maintain.yaml (got ${ids.length} of ${fleetIds.length} fleet rows; missing ${missing.join(', ') || 'none'}; duplicated ${dupes(ids).join(', ') || 'none'})`);
    if (all.some((r) => typeof r.floor !== 'boolean')) fail('every maintain.yaml row must carry floor: true|false');
  }

  if (existsSync(join(tmp, 'views', 'improve.yaml'))) {
    const doc = parseYaml(readFileSync(join(tmp, 'views', 'improve.yaml'), 'utf8'));
    const ids = (doc.topics || []).flatMap((t) => (t.rows || []).map((r) => r.id));
    if (ids.length !== reg.requirements.length || dupes(ids).length)
      fail(`every requirement must appear exactly once in improve.yaml (got ${ids.length} of ${reg.requirements.length}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  // decided_by: "owner" for every claim row (claim always reads not-measured, so
  // it always lands in to_run) — check both Intake and Maintain's to_run lists.
  const claimIds = new Set(reg.requirements.filter((d) => d.decide.kind === 'claim').map((d) => d.id));
  const intakeDoc = existsSync(join(tmp, 'views', 'intake.yaml')) ? parseYaml(readFileSync(join(tmp, 'views', 'intake.yaml'), 'utf8')) : null;
  const toRunClaims = [...((intakeDoc && intakeDoc.to_run) || []), ...((maintainDoc && maintainDoc.to_run) || [])].filter((r) => claimIds.has(r.id));
  if (!toRunClaims.length) fail('expected at least one claim row in to_run to check decided_by against');
  else {
    const bad = toRunClaims.filter((r) => r.decided_by !== 'owner');
    if (bad.length) fail(`decided_by must be "owner" for every claim row (got ${bad.map((r) => `${r.id}:${r.decided_by}`).join(', ')})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ── SCORED fixtures (the recall floor) ────────────────────────────────────────
const current = { _score: {} };
for (const [key, dir] of SCORED) {
  try {
    const answers = parseYaml(readFileSync(join(dir, 'ANSWERS.yaml'), 'utf8'));
    const findings = loadFindings(dir);
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
  console.log(`✓ assay regression: ${NEGATIVE.length} negative fixtures + fail-closed/engine/instrument unit invariants + ${SCORED.length} scored fixtures, all hold (validate, projection, roster-honesty, run-manifest, dcr-machine-report, decision-overlay, instrument-port, fresh-clone, dependency-scan, fresh-clone-workspaces, yardstick-list-category, repo-census, enumerate-gate, enumerate-tooldef, yardstick-register, yardstick-topic, intake-maintain-improve, fixture-recall).`);
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
