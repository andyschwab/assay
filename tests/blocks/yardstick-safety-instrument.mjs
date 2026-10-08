// ── a safety-tier instrument row: one gap reads unmet, whatever strengths sit beside it (#141)
// The instrument decider reads `mixed` when a category has gap rows and at least one
// strength row, because elsewhere a strength genuinely offsets a gap. A safety-tier
// requirement's check is a cleanliness claim (the domain is clean), so a strength row
// cannot make it partly met: one gap reads `unmet`. Any other tier keeps `mixed`.
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'yardstick-safety-instrument';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-safety-instrument: ' + m);
  const reg = loadYardstick();
  const base = { title: 'test', topic: 'code-security', tags: [], decide: { kind: 'instrument', scanner: 'deep-code-review', category: 'B' }, check: 'x', sources: ['x'], status: 'draft', owner: { risk: 'x', fix: 'x' } };
  const safety = { ...base, id: 'd-test-safety', tier: 'safety' };
  const other = reg.tiers.find((t) => t !== 'safety');
  const notSafety = { ...base, id: 'd-test-other', tier: other };
  const run = {
    findings: [
      { id: 'F-1', source: 'deep-code-review', native_category: 'B', polarity: 'gap', observation: 'x', evidence: ['a:1'] },
      { id: 'F-2', source: 'deep-code-review', native_category: 'B', polarity: 'strength', observation: 'x', evidence: ['b:1'] },
    ],
    manifest: [{ scanner: 'deep-code-review', status: 'ran' }], inputs: null, coverage: {},
  };
  const rows = measureRun(run, { ...reg, requirements: [safety, notSafety] });
  const s = rows.find((r) => r.id === 'd-test-safety'), o = rows.find((r) => r.id === 'd-test-other');
  if (s?.status !== 'unmet' || !s.findings.includes('F-1')) fail(`a safety-tier instrument row with a gap beside a strength must read unmet, citing the gap (got ${s?.status})`);
  if (o?.status !== 'mixed') fail(`a ${other}-tier instrument row with a gap beside a strength must still read mixed (got ${o?.status})`);
}
