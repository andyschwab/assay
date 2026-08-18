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
import { decideProjected } from '../tools/decisions.mjs';
import { convert } from '../tools/ingest.mjs';
import { score } from '../tools/score.mjs';
import { buildGrades } from '../tools/maturity.mjs';

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
  console.log(`✓ assay regression: ${NEGATIVE.length} negative fixtures + fail-closed/engine/instrument unit invariants + ${SCORED.length} scored fixtures, all hold (validate, projection, roster-honesty, decision-overlay, instrument-port, fixture-recall).`);
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
