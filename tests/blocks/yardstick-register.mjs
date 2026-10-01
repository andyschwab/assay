// ── yardstick-register invariants: extracted rows, honest deciders ───────────
// The register must load and validate (closed vocab, every row sourced); each decider
// must read a synthetic base the way yardstick/README.md says; and the two honesty
// gates must hold: an instrument row decides only when the manifest says it ran, and a
// claim row NEVER reads met from a run. Prose is never a decider.
import { loadYardstick, validateYardstick, measureRun, summarize, KINDS } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'yardstick-register';

export async function run() {
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
    if (by['d-gates-fail-closed']?.status !== 'unmet' || !by['d-gates-fail-closed'].findings.includes('F-2')) fail('a gate with fail_mode open must read d-gates-fail-closed unmet, citing it');
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
