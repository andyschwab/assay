// ── agreement per answer, signalled and unsignalled apart (#315 slice 3; map/variance.mjs
// candidateAgreement) ──
// A signal (map/effect-signals.mjs) is meant to pull the lanes together on the question it bears on;
// the measure shows whether it does. For each question of the checklist, the candidates every sweep
// answers are split by whether some sweep's list records a signal on that question for them:
//  1. `signalled.of` counts the candidates that carried one, and `unsignalled.of` the rest, the two
//     summing to the question's count;
//  2. agreement is counted in each part apart: a signalled candidate the lanes agree on and an
//     unsignalled one they part on read 1/1 and 0/1, beside the question's 1/2;
//  3. sweeps whose lists record no signals read every candidate unsignalled, as before.
import { candidateAgreement } from '../../map/variance.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'answer-agreement-by-signal';

const no = (ev = 'svc.mjs:4') => ({ answer: 'no', evidence: [ev] });
const NONE = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, no()]));
NONE.received_or_gone = { answer: 'yes', evidence: ['svc.mjs:4'] };
const LIMITED = { ...NONE, rate_limit: { answer: 'yes', evidence: ['svc.mjs:2'] } };
const eff = (gate_type) => ({ channel: 'x', gate_type, reversibility: 'irreversible', external: true, telemetry: 'structured-event', blast_scope: 'tenant', ...(gate_type === 'none' ? {} : { fail_mode: 'closed' }) });
const finding = (id, gate) => ({ id, dimension: 'delegation', polarity: 'gap', subject_type: 'effect', observation: 'x', evidence: ['svc.mjs:1'], confidence: 'confirmed', effect: eff(gate) });
const A = 'route: POST /notes', B = 'route: POST /feedback';
const SIGNAL = { question: 'rate_limit', supports: 'yes', evidence: ['svc.mjs:2'], marker: 'limiter: writeCap' };

export async function run() {
  const fail = (m) => negFailures.push('answer-agreement-by-signal: ' + m);
  const candidates = [A, B];
  // A carries a rate_limit signal and both lanes answer yes; B carries none and the lanes part
  const sweep = (bAnswers, signals) => ({
    findings: [finding('F-1', 'rate-throttle'), finding('F-2', bAnswers === LIMITED ? 'rate-throttle' : 'none')], candidates, signals,
    triage: [{ candidate: A, finding: 'F-1', clause: 'route-method-writes', answers: LIMITED }, { candidate: B, finding: 'F-2', clause: 'route-method-writes', answers: bAnswers }],
  });
  const withSignal = new Map([[A, [SIGNAL]]]);
  const r = candidateAgreement([sweep(LIMITED, withSignal), sweep(NONE, new Map())]);
  const rl = r.answers && r.answers.byAnswer.rate_limit;
  if (!rl || !rl.signalled || !rl.unsignalled) { fail(`each question reports signalled and unsignalled apart (got ${JSON.stringify(rl)})`); return; }
  // (1) the counts
  if (rl.signalled.of !== 1 || rl.unsignalled.of !== 1 || rl.of !== 2) fail(`(1) a candidate one sweep's list signals counts signalled, the other unsignalled (got ${JSON.stringify(rl)})`);
  // (2) agreement apart
  if (rl.agree !== 1 || rl.signalled.agree !== 1 || rl.signalled.pct !== 100 || rl.unsignalled.agree !== 0 || rl.unsignalled.pct !== 0) fail(`(2) agreement is counted per part (got ${JSON.stringify(rl)})`);
  const sa = r.answers.byAnswer.second_act;
  if (sa.signalled.of !== 0 || sa.unsignalled.of !== 2 || sa.unsignalled.agree !== 2) fail(`(2) a question no list signals reads every candidate unsignalled (got ${JSON.stringify(sa)})`);
  // (3) no signals anywhere: every candidate unsignalled
  const bare = candidateAgreement([sweep(LIMITED, undefined), sweep(NONE, undefined)]).answers.byAnswer.rate_limit;
  if (bare.signalled.of !== 0 || bare.unsignalled.of !== 2 || bare.unsignalled.agree !== 1) fail(`(3) sweeps with no signals read every candidate unsignalled (got ${JSON.stringify(bare)})`);
}
