// ── doctrine lockstep: one gate rule everywhere ───────────────────────────────
// The maturity halts-gated numerator, the supervision split, and the unheld-halt
// flag must be the SAME rule (map/doctrine.mjs). Before consolidation they were
// restated in four files; this pins that they can never silently diverge again.
import { isHalt } from '../../map/doctrine.mjs';
import { buildSupervision } from '../../map/supervision.mjs';
import { buildGrades } from '../../views/improve/maturity.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'doctrine-lockstep';

export async function run() {
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
