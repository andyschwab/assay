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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../tools/yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, adoptedAdapters, registryAxes, dispositions, scannerLine, notRunPhrase, loadScannerCoverage, axisCoverage, coveragePhrase } from '../tools/project.mjs';
import { isHalt } from '../tools/doctrine.mjs';
import { buildSupervision } from '../tools/supervision.mjs';
import { computeVariance } from '../tools/variance.mjs';
import { decideProjected } from '../tools/decisions.mjs';
import { convert, coverageYaml, nextStart } from '../tools/ingest.mjs';
import { score } from '../tools/score.mjs';
import { buildGrades } from '../tools/maturity.mjs';
import { descriptorAgreement, varianceFromSweeps, groupKey } from '../tools/variance.mjs';
import { loadRegistry, validateRegistry, projectDescriptors, summarize, KINDS } from '../tools/descriptors.mjs';

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
  ['bad-standing-watch', 'non-boolean standing_watch on an exposure'],
  // the run manifest (SCHEMA §5a): an integration that did not run must be RECORDED as
  // such, with a reason — never inferred absent. Found by a run that shipped a full
  // package with a queued code scanner never invoked and nothing recording the omission.
  ['no-manifest', 'no eval/scanners.yaml — an adopted scanner with no recorded disposition'],
  ['manifest-skip-no-reason', 'a scanner skipped with no reason (indistinguishable from an omission)'],
  ['manifest-ran-no-rows', 'a scanner recorded as ran with no rows and no explicit empty file'],
  ['manifest-rows-not-ran', 'rows present from a scanner the manifest records as skipped'],
  ['coverage-incomplete', 'a scanner coverage sidecar missing rows for domains the adapter lists'],
  // the register read (registry/README.md): a status the base does not recompute is drift, and a
  // claim-only row reading met is the exact laundering the two-file rule exists to prevent
  ['descriptors-drift', 'a view-descriptors.yaml whose statuses the base does not recompute (a claim row reads met)'],
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
  // id width: a real history scan returns more rows than three digits hold (807 on the first
  // 200k-line target). Ids are F- plus three OR MORE digits; the validator must accept F-1000
  // and still reject a two-digit id. The converter pads to three and grows past it.
  const wide = convert('gitleaks', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ RuleID: 'r', File: 'a.ts', StartLine: i + 1 }))), 1, 'F-998');
  if (wide.map((r) => r.id).join(',') !== 'F-998,F-999,F-1000,F-1001,F-1002') fail(`ids must grow past three digits (got ${wide.map((r) => r.id).join(',')})`);
  {
    const tmp = join(HERE, '.tmp-idwidth'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'eval'), { recursive: true });
    copyFileSync(join(HERE, 'sidecar-fixture', 'eval', 'scanners.yaml'), join(tmp, 'eval', 'scanners.yaml'));
    copyFileSync(join(HERE, 'sidecar-fixture', 'eval', 'findings-05-delegation.yaml'), join(tmp, 'eval', 'findings-05-delegation.yaml'));
    const row = (id) => `- id: ${id}\n  source: gitleaks\n  native_id: "r@a.ts:1"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    const manifest = readFileSync(join(tmp, 'eval', 'scanners.yaml'), 'utf8').replace(/gitleaks:[\s\S]*?(?=\n  \w|$)/, 'gitleaks:\n    status: ran');
    writeFileSync(join(tmp, 'eval', 'scanners.yaml'), manifest);
    const runValidate = () => { try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), tmp], { stdio: 'pipe' }); return true; } catch { return false; } };
    writeFileSync(join(tmp, 'eval', 'findings-91-gitleaks.yaml'), row('F-1000'));
    if (!runValidate()) fail('a four-digit finding id (F-1000) must validate green — the id space is not capped at 999');
    writeFileSync(join(tmp, 'eval', 'findings-91-gitleaks.yaml'), row('F-12'));
    if (runValidate()) fail('a two-digit finding id (F-12) must still validate red');
    rmSync(tmp, { recursive: true, force: true });
  }
  // id allocation (found on Scout: an 807-row, then 1,167-row gitleaks block ran past the
  // deep-code-review and fresh-clone floors and the validator went red on duplicate ids)
  {
    const tmp = join(HERE, '.tmp-nextstart'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'eval'), { recursive: true });
    if (nextStart(tmp, 'deep-code-review').start !== 800) fail('an empty run starts deep-code-review at its floor F-800');
    const row = (n) => `- id: F-${n}\n  source: gitleaks\n  native_id: "r@a.ts:${n}"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    writeFileSync(join(tmp, 'eval', 'findings-91-gitleaks.yaml'), Array.from({ length: 807 }, (_, i) => row(700 + i)).join(''));
    const ns = nextStart(tmp, 'deep-code-review');
    if (ns.start !== 1600 || ns.highest !== 1506) fail(`with gitleaks rows to F-1506, deep-code-review must start at F-1600 (got F-${ns.start}, highest ${ns.highest})`);
    if (nextStart(tmp, 'gitleaks').start !== 700) fail('a re-ingest of the same tool ignores its own file and lands at its floor again');
    writeFileSync(join(tmp, 'eval', 'findings-93-deep-code-review.yaml'), row(1600));
    if (nextStart(tmp, 'fresh-clone').start !== 1700) fail('fresh-clone must start above both existing blocks (F-1700)');
    rmSync(tmp, { recursive: true, force: true });
  }
  // the raw archive of a gitleaks report must be location-only: the CLI once copied the raw
  // report into eval/raw/ verbatim, matched values and author identity included
  {
    const tmp = join(HERE, '.tmp-glarchive'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'eval'), { recursive: true });
    execFileSync(process.execPath, [join(ROOT, 'tools', 'ingest.mjs'), tmp, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1'], { stdio: 'pipe' });
    const archived = readFileSync(join(tmp, 'eval', 'raw', 'gitleaks.json'), 'utf8');
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

// ── exposures sidecar: new form green; legacy stage form grandfathered ────────
// The stage scale (gate:/blocks_stage:) is RETIRED: a new-form sidecar (properties
// + standing_watch only) must validate green, and a frozen-style legacy file must
// STILL validate (the grandfather rail, like the legacy domains). If the validator
// starts requiring the retired fields again — or stops accepting them on frozen
// runs — this goes red.
{
  const fail = (m) => negFailures.push('exposures-sidecar: ' + m);
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), join(HERE, 'sidecar-fixture')], { stdio: 'pipe' }); }
  catch { fail('a NEW-FORM sidecar (no gate:, no blocks_stage:, standing_watch labeled) must validate green'); }
  const legacyDir = join(HERE, 'sidecar-fixture-legacy');
  mkdirSync(join(legacyDir, 'eval'), { recursive: true });
  copyFileSync(join(HERE, 'sidecar-fixture', 'eval', 'findings-05-delegation.yaml'), join(legacyDir, 'eval', 'findings-05-delegation.yaml'));
  copyFileSync(join(HERE, 'sidecar-fixture', 'eval', 'scanners.yaml'), join(legacyDir, 'eval', 'scanners.yaml'));
  writeFileSync(join(legacyDir, 'eval', 'view-security-gate.yaml'),
    'gate: beta\nexposures:\n  - name: legacy-exposure\n    title: Legacy exposure\n    findings: [F-001]\n    blocks_stage: beta\n    who: authorized-real-user\n    what: legacy stake\n    likelihood: high\n    fix: >\n      Close it.\n');
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), legacyDir], { stdio: 'pipe' }); }
  catch { fail('a LEGACY sidecar (gate: + blocks_stage:) must still validate — frozen runs are grandfathered'); }
  rmSync(legacyDir, { recursive: true, force: true });
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
  // change to this line in the same commit (fresh-clone adopted 2026-09-22, #120;
  // dependency-scan adopted 2026-09-24, #121)
  if (JSON.stringify(adopted) !== JSON.stringify(['deep-code-review', 'dependency-scan', 'fresh-clone', 'gitleaks', 'repo-eval'])) fail(`adopted roster must be deep-code-review, dependency-scan, fresh-clone, gitleaks, repo-eval (got ${adopted.join(', ')})`);
  const reg = registryAxes(adapters);
  if (!reg.includes('code-security') || !reg.includes('multiplayer') || reg.length !== 9) fail(`registry must be the 9 axes the adopted scanners contribute — an instrument adds none (got ${reg.length}: ${reg.join(', ')})`);
  const m = { engine: 'x', scanners: { 'repo-eval': { status: 'ran' }, 'deep-code-review': { status: 'skipped', reason: 'out of scope' }, gitleaks: { status: 'failed', reason: 'binary missing' }, 'fresh-clone': { status: 'skipped', reason: 'no scratch clone here' }, 'dependency-scan': { status: 'skipped', reason: 'no registry reach here' } } };
  const d = dispositions(m, adapters);
  if (d.ran.join() !== 'repo-eval' || d.skipped[0]?.reason !== 'out of scope' || d.failed[0]?.id !== 'gitleaks' || d.missing.length) fail('dispositions must group ran / skipped / failed with reasons and report nothing missing');
  const line = scannerLine(m, ['repo-eval'], adapters);
  if (!line.includes('skipped: deep-code-review (out of scope)') || !line.includes('failed: gitleaks (binary missing)') || !line.includes('fresh-clone (no scratch clone here)')) fail(`the scanners line must name skipped and failed scanners with their reasons (got "${line}")`);
  if (!scannerLine(null, ['repo-eval'], adapters).includes('no run manifest')) fail('a missing manifest must be named on the scanners line, never silently omitted');
  if (dispositions({ scanners: { 'repo-eval': { status: 'ran' } } }, adapters).missing.join() !== 'deep-code-review,dependency-scan,fresh-clone,gitleaks') fail('adopted scanners without a row must be reported missing');
  if (!notRunPhrase(m, 'deep-code-review').startsWith('skipped this run: out of scope')) fail('notRunPhrase must carry the recorded reason');
  // the walk prints the reason on the not-measured register
  const walk = execFileSync(process.execPath, [join(ROOT, 'tools', 'compile-axes.mjs'), join(HERE, 'fixtures', 'notesbox'), '--stdout'], { stdio: 'pipe' }).toString();
  if (!walk.includes('deep-code-review (skipped this run: fixture run')) fail('the walk must print the skipped scanner and its reason on the not-measured register');
  // the package: refuses without a manifest; lists this run's appendices only, and names the skip
  const tmp = join(HERE, 'tmp-manifest');
  rmSync(tmp, { recursive: true, force: true });
  const runA = join(tmp, 'runs', 'a-2026-01-01'), runB = join(tmp, 'runs', 'b-2026-01-02');
  mkdirSync(join(runA, 'eval'), { recursive: true }); mkdirSync(join(runB, 'eval'), { recursive: true });
  for (const f of ['findings-01-legibility.yaml', 'findings-02-context.yaml', 'findings-04-verification.yaml', 'findings-05-delegation.yaml', 'findings-91-gitleaks.yaml'])
    copyFileSync(join(HERE, 'fixtures', 'notesbox', 'eval', f), join(runA, 'eval', f));
  writeFileSync(join(runB, 'deep-code-review.md'), '# a sibling run\'s native report — must never be listed by run A\n');
  let refused = false;
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'compile-package.mjs'), runA, '--no-pdf'], { stdio: 'pipe' }); } catch { refused = true; }
  if (!refused) fail('compile-package must refuse to compile a run with no manifest (the package is what gets read)');
  if (existsSync(join(runA, 'INDEX.md'))) fail('a refused package must not have written INDEX.md');
  copyFileSync(join(HERE, 'fixtures', 'notesbox', 'eval', 'scanners.yaml'), join(runA, 'eval', 'scanners.yaml'));
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'compile-package.mjs'), runA, '--no-pdf'], { stdio: 'pipe' }); }
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
  const tmp = join(HERE, 'tmp-dcr'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'eval'), { recursive: true });
  for (const f of ['findings-01-legibility.yaml', 'findings-02-context.yaml', 'findings-04-verification.yaml', 'findings-05-delegation.yaml', 'findings-91-gitleaks.yaml'])
    copyFileSync(join(HERE, 'fixtures', 'notesbox', 'eval', f), join(tmp, 'eval', f));
  writeFileSync(join(tmp, 'eval', 'scanners.yaml'), 'engine: fixture\nscanners:\n  repo-eval:\n    status: ran\n  deep-code-review:\n    status: ran\n  gitleaks:\n    status: ran\n  fresh-clone:\n    status: skipped\n    reason: "fixture: not executed"\n  dependency-scan:\n    status: skipped\n    reason: "fixture: not executed"\n');
  const raw = join(tmp, 'machine-report.yaml'); writeFileSync(raw, sample);
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'ingest.mjs'), tmp, '--tool', 'deep-code-review', '--raw', raw], { stdio: 'pipe' }); }
  catch (e) { fail(`ingest CLI must accept a machine report without --exit (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  if (!existsSync(join(tmp, 'eval', 'findings-93-deep-code-review.yaml')) || !existsSync(join(tmp, 'eval', 'coverage-deep-code-review.yaml')) || !existsSync(join(tmp, 'eval', 'raw', 'deep-code-review.yaml'))) fail('ingest must write the rows file, the coverage sidecar, and the raw archive');
  const cov = loadScannerCoverage(tmp);
  if (cov['deep-code-review']?.coverage?.P?.status !== 'not-scanned') fail('the coverage sidecar must round-trip through the shared loader');
  const ac = axisCoverage(adaptersOnce(), cov, 'code-security');
  if (!ac || ac[0].full || !ac[0].partial.find((x) => x.l === 'B')) fail('code-security must read partially measured when domain B was partial');
  if (!coveragePhrase(ac).includes('B partial')) fail('the coverage phrase must name the partial domain');
  if (axisCoverage(adaptersOnce(), cov, 'delegation') !== null) fail('an axis dcr does not contribute has no dcr coverage groups (fed axes are not measured by it)');
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested machine report must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
  const walk = execFileSync(process.execPath, [join(ROOT, 'tools', 'compile-axes.mjs'), tmp, '--stdout'], { stdio: 'pipe' }).toString();
  if (!walk.includes('Partially measured') || !walk.includes('B partial (mutating routes')) fail('the walk must say an axis is partially measured, with the scanner\'s note');
  rmSync(tmp, { recursive: true, force: true });
}

// ── fresh-clone instrument (tools/fresh-clone.mjs → ingest profile fresh-clone) ──
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
  try { execFileSync(process.execPath, [join(ROOT, 'tools', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '120'], { stdio: 'pipe' }); }
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
    mkdirSync(join(tmp, 'eval'), { recursive: true });
    for (const f of ['findings-01-legibility.yaml', 'findings-02-context.yaml', 'findings-04-verification.yaml', 'findings-05-delegation.yaml', 'findings-91-gitleaks.yaml'])
      copyFileSync(join(HERE, 'fixtures', 'notesbox', 'eval', f), join(tmp, 'eval', f));
    writeFileSync(join(tmp, 'eval', 'scanners.yaml'), readFileSync(join(HERE, 'fixtures', 'notesbox', 'eval', 'scanners.yaml'), 'utf8').replace(/  fresh-clone:\n    status: skipped\n    reason: "[^"]*"\n/, '  fresh-clone:\n    status: ran\n'));
    try { execFileSync(process.execPath, [join(ROOT, 'tools', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', out, '--exit', '1'], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept the fixture document (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (!existsSync(join(tmp, 'eval', 'findings-94-fresh-clone.yaml')) || !existsSync(join(tmp, 'eval', 'raw', 'fresh-clone.json'))) fail('ingest must write findings-94-fresh-clone.yaml and archive the raw document');
    try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested fresh-clone run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
    // a verified-clean run: the explicit empty file validates green with fresh-clone recorded as ran
    writeFileSync(join(tmp, 'clean.json'), JSON.stringify(cleanDoc));
    try { execFileSync(process.execPath, [join(ROOT, 'tools', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', join(tmp, 'clean.json'), '--exit', '0'], { stdio: 'pipe' }); } catch { fail('ingest must accept a clean (exit 0) document'); }
    const cleanFile = readFileSync(join(tmp, 'eval', 'findings-94-fresh-clone.yaml'), 'utf8');
    if (!/0 row\(s\)/.test(cleanFile) || /^- id:/m.test(cleanFile)) fail('a clean run writes the explicit empty rows file');
    try { execFileSync(process.execPath, [join(ROOT, 'tools', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch { fail('a verified-clean fresh-clone run (empty explicit file, manifest ran) must validate green'); }
  }
  rmSync(tmp, { recursive: true, force: true });
}

// ── dependency-scan instrument (tools/dependency-scan.mjs → ingest profile dependency-scan) ─
// The converter turns a synthetic dependency-scan document into exactly: one gap row
// per advisory (category = its own severity), one lockfile-failed gap per failed
// lockfile, one lockfile-unsupported gap per not-supported (pnpm/yarn) lockfile, and
// nothing for a clean audited lockfile. A runner crash (exit 2) halts it; a document
// whose exit disagrees with the runner exit halts; a truncated document halts. Every
// category maps onto the shared code-security axis and the instrument contributes
// none. The descriptor register decides d-dependencies-known-clean on the `critical`
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
  // (e) descriptor register: d-dependencies-known-clean decides on the `critical` category alone
  let reg = null;
  try { reg = loadRegistry(); } catch (e) { fail('registry failed to load: ' + e.message.split('\n')[0]); }
  if (reg) {
    const ranHigh = projectDescriptors({
      findings: [{ id: 'F-1', source: 'dependency-scan', native_category: 'high', polarity: 'gap' }],
      manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (ranHigh?.status !== 'met') fail(`zero critical rows (even with a high row present) must read d-dependencies-known-clean met (got ${ranHigh?.status})`);
    const ranCritical = projectDescriptors({
      findings: [{ id: 'F-1', source: 'dependency-scan', native_category: 'critical', polarity: 'gap' }],
      manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (ranCritical?.status !== 'unmet') fail(`a critical row must read d-dependencies-known-clean unmet (got ${ranCritical?.status})`);
    const skipped = projectDescriptors({
      findings: [], manifest: [{ scanner: 'dependency-scan', status: 'skipped', reason: 'no registry reach' }], inputs: null, coverage: {},
    }, reg).find((r) => r.id === 'd-dependencies-known-clean');
    if (skipped?.status !== 'not-measured' || !/no registry reach/.test(skipped.note || '')) fail(`a skipped manifest must read not-measured with the recorded reason (got ${skipped?.status}/${skipped?.note})`);
  }
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

// ── descriptor-register invariants: extracted rows, honest deciders ───────────
// The register must load and validate (closed vocab, every row sourced); each decider
// must read a synthetic base the way registry/README.md says; and the two honesty
// gates must hold: an instrument row decides only when the manifest says it ran, and a
// claim row NEVER reads met from a run. Prose is never a decider.
{
  const fail = (m) => negFailures.push('descriptor-register: ' + m);
  let reg = null;
  try { reg = loadRegistry(); } catch (e) { fail('registry failed to load: ' + e.message.split('\n')[0]); }
  if (reg) {
    if (validateRegistry(reg).length) fail('validateRegistry must be clean on the shipped register');
    if (!reg.descriptors.some((d) => d.decide.kind === 'claim')) fail('the register must carry claim rows (its instrument backlog) — a register that claims to measure everything is the presence-checklist failure');
    const bad = { ...reg, descriptors: [{ ...reg.descriptors[0], decide: { kind: 'prose', terms: 'x' } }] };
    if (!validateRegistry(bad).some((e) => /decide\.kind/.test(e))) fail('an unknown decide.kind (prose) must be rejected');
    const unsourced = { ...reg, descriptors: [{ ...reg.descriptors[0], sources: [] }] };
    if (!validateRegistry(unsourced).some((e) => /sources/.test(e))) fail('a row with no sources must be rejected (extracted, not designed)');
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
    const rows = projectDescriptors({ findings: base, manifest: ran, inputs, coverage: {} }, reg);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    if (by['d-effects-gated']?.status !== 'unmet' || !by['d-effects-gated'].findings.includes('F-1')) fail('an unheld halt must read d-effects-gated unmet, citing it');
    if (by['d-effects-gated']?.findings.includes('F-2') === false && by['d-gates-fail-closed']?.status !== 'unmet') fail('a gate with fail_mode open must read d-gates-fail-closed unmet');
    if (by['d-effects-traced']?.status !== 'unmet') fail('a halt with telemetry none must read d-effects-traced unmet');
    if (by['d-capability-budget']?.status !== 'unmet') fail('a full trifecta reaching an unheld halt must read d-capability-budget unmet');
    if (by['d-decisions-reconstruct']?.status !== 'mixed' || by['d-decisions-reconstruct'].of !== 4) fail('a 3-of-4 census must read mixed with its denominator');
    if (by['d-secrets-out-of-history']?.status !== 'unmet') fail('a gitleaks secret row with the scanner ran must read d-secrets-out-of-history unmet');
    if (rows.filter((r) => r.kind === 'claim').some((r) => r.status !== 'not-measured')) fail('a claim descriptor must never read anything but not-measured from a run');
    if (!rows.every((r) => ['met', 'unmet', 'mixed', 'not-measured'].includes(r.status))) fail('every descriptor must carry exactly one closed status');
    // manifest gate: the same rows with gitleaks SKIPPED must read not-measured with the reason
    const skipped = projectDescriptors({ findings: base, manifest: [{ scanner: 'gitleaks', status: 'skipped', reason: 'no history mirror' }], inputs, coverage: {} }, reg);
    const sk = skipped.find((r) => r.id === 'd-secrets-out-of-history');
    if (sk?.status !== 'not-measured' || !/no history mirror/.test(sk.note)) fail('an instrument recorded as skipped must read not-measured WITH the recorded reason, even when rows are present');
    // coverage gate: a peer scanner with no rows reads met only where it says it scanned the domain
    const dcrRan = [{ scanner: 'deep-code-review', status: 'ran' }];
    const covScanned = { 'deep-code-review': { scanner: 'deep-code-review', coverage: { B: { status: 'scanned' }, N: { status: 'not-scanned', note: 'no config surface' } } } };
    const pr = Object.fromEntries(projectDescriptors({ findings: [], manifest: dcrRan, inputs: null, coverage: covScanned }, reg).map((r) => [r.id, r]));
    if (pr['d-routes-authorized']?.status !== 'met') fail('a peer scanner that scanned domain B with no gap rows must read d-routes-authorized met');
    if (pr['d-config-declared']?.status !== 'not-measured' || !/no config surface/.test(pr['d-config-declared'].note)) fail('a peer scanner domain recorded not-scanned must read not-measured with its note');
    const silent = Object.fromEntries(projectDescriptors({ findings: [], manifest: dcrRan, inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (silent['d-routes-authorized']?.status !== 'not-measured') fail('a peer scanner that ran with no rows and NO coverage sidecar must read not-measured (silence is not clean)');
    const gl = Object.fromEntries(projectDescriptors({ findings: [], manifest: [{ scanner: 'gitleaks', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (gl['d-secrets-out-of-history']?.status !== 'met') fail('an instrument that ran clean (exit 0, no rows) must read met');
    const s = summarize(rows);
    if (s.of !== reg.descriptors.length || s.decided + s['not-measured'] !== s.of) fail('summary counts must partition the register');
    if (!KINDS.includes('claim')) fail('KINDS must include claim');
  }
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
  console.log(`✓ assay regression: ${NEGATIVE.length} negative fixtures + fail-closed/engine/instrument unit invariants + ${SCORED.length} scored fixtures, all hold (validate, projection, roster-honesty, run-manifest, dcr-machine-report, decision-overlay, instrument-port, fresh-clone, dependency-scan, enumerate-gate, enumerate-tooldef, descriptor-register, fixture-recall).`);
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
