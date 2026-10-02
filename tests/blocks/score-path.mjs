// ── score path identity: same-basename planted items must not collide ─────────
// Matching is by full path (suffix rule), never basename alone — the same lesson
// variance.mjs's identity tokens already encode (every skill ships a SKILL.md).
import { score } from '../../map/score.mjs';
import { negFailures, adaptersOnce } from '../harness.mjs';

export const label = 'score-path';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
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
