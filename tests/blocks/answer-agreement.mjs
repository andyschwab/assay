// ── lanes are compared on their answers (#315 slice 2; map/variance.mjs candidateAgreement) ──
// Where every sweep's triage records a listed candidate's answers to the checklist
// (map/effect-answers.mjs), the per-candidate figure compares that candidate's gate_type and
// reversibility as its own answers give them, not as the finding it maps to was written, and
// reports agreement per answer beside it:
//  1. two runs whose answers agree, but whose findings' descriptors were written differently (one
//     lane grouped the candidate with a riskier path into one finding, the other did not), read as
//     agreeing; with the answers taken away, the same runs read the candidate as differing;
//  2. agreement per answer: each question of the checklist counted over the candidates every sweep
//     answers, a differing answer named with each sweep's value;
//  3. a candidate some sweep did not answer (a stored version 1 triage) is compared as written and
//     counted unanswered.
import { candidateAgreement } from '../../map/variance.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'answer-agreement';

const no = (ev = 'svc.mjs:4') => ({ answer: 'no', evidence: [ev] });
const NONE = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, no()]));
NONE.received_or_gone = { answer: 'yes', evidence: ['svc.mjs:4'] };
const HALT = { ...NONE, refuses_unless: { answer: 'yes', what: 'a signed request', held_by: 'code', evidence: ['svc.mjs:2'] } };
const eff = (gate_type, reversibility = 'irreversible') => ({ channel: 'x', gate_type, reversibility, external: true, telemetry: 'structured-event', blast_scope: 'tenant', ...(gate_type === 'none' ? {} : { fail_mode: 'closed' }) });
const finding = (id, gate) => ({ id, dimension: 'delegation', polarity: gate === 'none' ? 'gap' : 'strength', subject_type: 'effect', observation: 'x', evidence: ['svc.mjs:1'], confidence: 'confirmed', effect: eff(gate) });
const C1 = 'http write (js) @ svc.mjs', C2 = 'route: POST /send';

export async function run() {
  const fail = (m) => negFailures.push('answer-agreement: ' + m);
  const candidates = [C1, C2];
  // sweep A records each candidate as its own finding; sweep B groups both into one, whose value is
  // the riskier path's (none). C1's answers are the same in both.
  const a = { findings: [finding('F-1', 'deterministic-halt'), finding('F-2', 'none')], candidates,
    triage: [{ candidate: C1, finding: 'F-1', clause: 'client-call-runtime', answers: HALT }, { candidate: C2, finding: 'F-2', clause: 'route-method-writes', answers: NONE }] };
  const b = { findings: [finding('F-9', 'none')], candidates,
    triage: [{ candidate: C1, finding: 'F-9', clause: 'client-call-runtime', answers: HALT }, { candidate: C2, finding: 'F-9', clause: 'route-method-writes', answers: NONE }] };

  // (1) answers agree, descriptors written differently: agreeing
  const r = candidateAgreement([a, b]);
  if (r.candidates.compared !== 2 || r.allFields.agree !== 2 || r.byField.gate_type.agree !== 2) fail(`(1) two runs whose answers agree read as agreeing, however their findings were written (got ${r.allFields.agree}/${r.candidates.compared}, gate_type ${r.byField.gate_type.agree}/${r.byField.gate_type.of}: ${JSON.stringify(r.divergences)})`);
  const strip = (s) => ({ ...s, triage: s.triage.map(({ answers, ...e }) => e) });
  const asWritten = candidateAgreement([strip(a), strip(b)]);
  if (asWritten.allFields.agree !== 1 || !asWritten.divergences.some((d) => d.candidate === C1 && d.fields.some((f) => f.field === 'gate_type'))) fail(`(1) with no answers the same runs read ${C1} as differing on gate_type, as written (got ${JSON.stringify(asWritten.divergences)})`);
  if (asWritten.candidates.unanswered !== 2 || r.candidates.unanswered !== 0) fail(`(3) a candidate compared without answers in every sweep is counted unanswered (got ${asWritten.candidates.unanswered} and ${r.candidates.unanswered})`);

  // (2) agreement per answer
  if (!r.answers || r.answers.compared !== 2 || CHECKLIST_KEYS.some((k) => r.answers.byAnswer[k].agree !== 2 || r.answers.byAnswer[k].of !== 2)) fail(`(2) agreement per answer counts each question over the candidates every sweep answers (got ${JSON.stringify(r.answers)})`);
  const b2 = { ...b, triage: [{ ...b.triage[0], answers: { ...HALT, refuses_unless: { answer: 'yes', what: 'an approval', held_by: 'outside', evidence: ['ci.yml:9'] } } }, b.triage[1]] };
  const d = candidateAgreement([a, b2]);
  const ru = d.answers && d.answers.byAnswer.refuses_unless;
  if (!ru || ru.agree !== 1 || ru.of !== 2 || d.answers.byAnswer.second_act.agree !== 2) fail(`(2) a differing answer is counted against its question only (got refuses_unless ${JSON.stringify(ru)})`);
  const dv = d.answers && d.answers.divergences.find((x) => x.candidate === C1);
  if (!dv || JSON.stringify(dv.answers) !== JSON.stringify([{ key: 'refuses_unless', values: ['yes (code)', 'yes (outside)'] }])) fail(`(2) a differing answer is named with each sweep's value (got ${JSON.stringify(dv)})`);
  if (!d.divergences.some((x) => x.candidate === C1 && x.fields.some((f) => f.field === 'gate_type' && f.values.map((v) => v.value).join(' vs ') === 'deterministic-halt vs external-halt'))) fail(`(2) the value the differing answers give differs too (got ${JSON.stringify(d.divergences)})`);

  // (3) one sweep answered, the other a stored version 1: compared as written, counted unanswered
  const m = candidateAgreement([a, strip(b)]);
  if (m.candidates.unanswered !== 2 || (m.answers && m.answers.compared) !== 0 || m.allFields.agree !== 1) fail(`(3) a candidate one sweep did not answer is compared as written and counted unanswered (got unanswered ${m.candidates.unanswered}, answers compared ${m.answers && m.answers.compared}, agree ${m.allFields.agree})`);
}
