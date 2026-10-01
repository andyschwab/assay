// ── variance must survive a mixed base (scanner + instrument rows carry no dimension) ─
// variance.mjs predates the instrument port. Scanner-sourced rows have `source` +
// `native_category` and NO `dimension` (SCHEMA §2a), so every one landed in a single
// undefined bucket and the sort crashed on localeCompare. Found by the first
// all-integrations run (2026-08-18: repo-eval + deep-code-review + gitleaks +
// scorecard in one base).
import { varianceFromSweeps, groupKey } from '../../map/variance.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'variance-mixed-base';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
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
