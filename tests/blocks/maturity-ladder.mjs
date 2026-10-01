// ── maturity-ladder invariants: every native dimension is scorable ────────────
// A dimension the taxonomy carries but the ladder does not is worse than an
// unmeasured one: an authored census for it is silently DROPPED and the report
// renders fewer areas than the walk. Regression for the multiplayer gap found by
// a field run (2026-08-18).
import { buildGrades } from '../../views/improve/maturity.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'maturity-ladder';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
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
