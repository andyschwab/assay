// ── score scope + instrument answers ──────────────────────────────────────────
// "Ran" comes from the run record: an instrument that ran clean and missed a
// planted item reads MISSED, never out of scope (fail loud, never empty). An
// instrument answer (`check:`) matches by method + check name + polarity, and a
// control's run gap it accounts for is a known answer, not a false positive; an
// instrument gap no answer names still is one.
import { score } from '../../map/score.mjs';
import { negFailures, adaptersOnce } from '../harness.mjs';

export const label = 'score-scope';

export async function run() {
  const fail = (m) => negFailures.push('score-scope: ' + m);
  const secret = { target: 't', planted: [{ id: 'P-1', polarity: 'gap', axis: 'code-security', evidence: 'config/k.mjs:3', detectable_by: ['gitleaks'] }] };
  const ranClean = { scanners: { gitleaks: { status: 'ran' } } };
  if (score([], adaptersOnce(), secret, ranClean).results[0].status !== 'missed') fail('an instrument recorded as ran with no rows must read missed, not out of scope');
  if (score([], adaptersOnce(), secret, { scanners: { gitleaks: { status: 'skipped', reason: 'x' } } }).results[0].status !== 'out-of-scope') fail('an instrument recorded as skipped must leave its items out of scope');
  const row = (id, cat, pol, sev) => ({ id, source: 'repo-census', native_id: `${cat}@root`, native_category: cat, polarity: pol, ...(sev ? { severity: sev } : {}), observation: 'x', evidence: ['./:1'], ...(pol === 'gap' ? { fix: 'y' } : {}) });
  const control = { target: 'c', planted: [], max_gaps_above: { severity: 'Low', count: 0 }, instruments: [
    { id: 'I-1', polarity: 'gap', axis: 'artifact-legibility', check: 'runbook', detectable_by: ['repo-census'] },
    { id: 'I-2', polarity: 'strength', axis: 'deterministic-gates', check: 'ci-gate', detectable_by: ['repo-census'] },
  ] };
  const rc = { scanners: { 'repo-census': { status: 'ran' } } };
  const r = score([row('F-1', 'runbook', 'gap', 'Medium'), row('F-2', 'ci-gate', 'gap', 'Medium'), row('F-3', 'agent-contract', 'gap', 'Medium')], adaptersOnce(), control, rc);
  const by = Object.fromEntries(r.results.map((x) => [x.id, x.status]));
  if (by['I-1'] !== 'recovered') fail(`a census gap on the answered check must recover (I-1 got ${by['I-1']})`);
  if (by['I-2'] !== 'missed') fail(`a census gap where a pass was expected must read missed — polarity is part of the answer (I-2 got ${by['I-2']})`);
  if (!r.isControl) fail('instrument answers must not turn a control (planted: []) into a planted target');
  if (r.falsePositives.map((x) => x.id).sort().join() !== 'F-2,F-3') fail(`on a control, only instrument gaps no answer accounts for are false positives (got ${r.falsePositives.map((x) => x.id).join()})`);
}
