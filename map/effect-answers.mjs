// effect-answers.mjs — a listed candidate's gate_type and reversibility, from its answers to a
// closed checklist (#315 slice 2; map/SCHEMA.md §6e, "The answers").
//
// Read whole, gate_type asks a lane two things at once: what mechanism stands in front of the
// effect, and whether it holds; lanes parted on it more than on any other descriptor. Here the
// lane records the mechanism as facts, one answer per question below, each with file:line
// evidence, and the value follows from the answers by #302's order (SCHEMA.md §1, "The effect
// descriptors, defined"), in one function per descriptor:
//   • gateTypeFrom: the first value whose question is answered yes, in §1's order;
//   • reversibilityFrom: irreversible unless the evidence shows nothing outside received the effect
//     and the prior state is kept, and then with a window when the undo is time-limited.
// Whether a gate holds stays the doctrine's (map/doctrine.mjs gateHolds, read from the descriptors);
// the answers are the mechanism, the value is this rule's. An answer not determinable from the
// evidence reads as the riskier one: no gate the evidence does not show, and no prior state it does
// not show kept. validate refuses a finding whose value the answers do not give, and the lanes are
// compared on the answers (map/variance.mjs).

const ANSWER_VALUES = ['yes', 'no', 'not-determinable'];
const HELD_BY = ['code', 'outside'];

// The checklist's questions, in the order the values follow from them: map/SCHEMA.md §6e, "The
// answers", states each question and the value its yes gives; this is their one list of keys.
// gate_type: refuses_unless (deterministic-halt when the code holds the check, external-halt when a
// system outside does), second_act (deterministic-halt), staged (staged-reversible), person_act
// (initiated-by-person), declared_scope (scope-bound), rate_limit (rate-throttle), disclosed
// (disclosure-only); reversibility: received_or_gone (irreversible), window (reversible-with-window).
export const CHECKLIST_KEYS = ['refuses_unless', 'second_act', 'staged', 'person_act', 'declared_scope', 'rate_limit', 'disclosed', 'received_or_gone', 'window'];

const CITE = /^(.+):(\d+)(?:-(\d+))?$/;
const said = (a) => (a && typeof a === 'object' && !Array.isArray(a) ? a.answer : undefined);
const yes = (answers, key) => said(answers && answers[key]) === 'yes';
// the riskier reading of an answer the evidence does not decide: a gate not shown is not there
// (only yes counts), and a prior state not shown kept is gone (only no counts)
const no = (answers, key) => said(answers && answers[key]) === 'no';

/** gate_type from the answers, by SCHEMA.md §1's order: the first that holds. @param {any} answers @returns {string} */
export function gateTypeFrom(answers) {
  if (yes(answers, 'refuses_unless') && answers.refuses_unless.held_by === 'code') return 'deterministic-halt';
  if (yes(answers, 'second_act')) return 'deterministic-halt';
  if (yes(answers, 'refuses_unless')) return 'external-halt';
  if (yes(answers, 'staged')) return 'staged-reversible';
  if (yes(answers, 'person_act')) return 'initiated-by-person';
  if (yes(answers, 'declared_scope')) return 'scope-bound';
  if (yes(answers, 'rate_limit')) return 'rate-throttle';
  if (yes(answers, 'disclosed')) return 'disclosure-only';
  return 'none';
}

/** reversibility from the answers, by SCHEMA.md §1's order: the first that holds. @param {any} answers @returns {string} */
export function reversibilityFrom(answers) {
  if (!no(answers, 'received_or_gone')) return 'irreversible';
  if (!no(answers, 'window')) return 'reversible-with-window';
  return 'reversible';
}

// §1's orders, riskiest last for gate_type (none) and first for reversibility (irreversible): one
// finding several candidates map to is one effect reached several ways, and by §1's paths rule its
// value is the riskiest any candidate's answers give (a gate stands only if every path passes it).
const GATE_ORDER = ['deterministic-halt', 'external-halt', 'staged-reversible', 'initiated-by-person', 'scope-bound', 'rate-throttle', 'disclosure-only', 'none'];
const REVERSIBILITY_ORDER = ['irreversible', 'reversible-with-window', 'reversible'];
/** The values a finding's candidates' answers give it: { gate_type, reversibility }. @param {any[]} answerSets */
export function descriptorsFrom(answerSets) {
  const gates = answerSets.map(gateTypeFrom), revs = answerSets.map(reversibilityFrom);
  return {
    gate_type: GATE_ORDER[Math.max(...gates.map((g) => GATE_ORDER.indexOf(g)))],
    reversibility: REVERSIBILITY_ORDER[Math.min(...revs.map((r) => REVERSIBILITY_ORDER.indexOf(r)))],
  };
}

/** One line naming a candidate's answers, for a refusal or a report. @param {any} answers */
export function answersLine(answers) {
  return CHECKLIST_KEYS.map((k) => {
    const a = answers && answers[k];
    const v = said(a) === undefined ? '?' : said(a);
    return `${k}: ${v}${k === 'refuses_unless' && v === 'yes' ? ` (held_by ${a.held_by})` : ''}`;
  }).join(', ');
}

/** What two runs' answers are compared on: the answer, and for refuses_unless yes, who holds it. @param {any} a */
export function answerValue(key, a) {
  const v = said(a);
  return key === 'refuses_unless' && v === 'yes' ? `yes (${a.held_by})` : v === undefined ? null : String(v);
}

/**
 * Every error in one candidate's answers: each question of the checklist answered once and nothing
 * else; each answer yes, no or not-determinable; a yes or a no with its evidence, every entry a
 * path:line citation; refuses_unless yes with what it checks and who holds it.
 * @param {any} answers @param {string} at @returns {string[]}
 */
export function answerErrors(answers, at) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return [`${at}: answers must be a map, one answer per question of the checklist (${CHECKLIST_KEYS.join(', ')}; map/SCHEMA.md §6e)`];
  const errors = [];
  for (const k of Object.keys(answers)) if (!CHECKLIST_KEYS.includes(k)) errors.push(`${at}.${k}: not a question of the checklist (${CHECKLIST_KEYS.join(', ')})`);
  for (const k of CHECKLIST_KEYS) {
    const a = answers[k], where = `${at}.${k}`;
    if (a === undefined) { errors.push(`${where}: not answered: every question of the checklist is answered, yes, no or not-determinable`); continue; }
    if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${where}: an answer is a map ({ answer, evidence })`); continue; }
    for (const x of Object.keys(a)) if (!['answer', 'evidence', 'what', 'held_by'].includes(x)) errors.push(`${where}: unknown key "${x}" (answer, evidence, what, held_by)`);
    if (!ANSWER_VALUES.includes(a.answer)) { errors.push(`${where}: answer ${JSON.stringify(a.answer)} is not one of ${ANSWER_VALUES.join(', ')}`); continue; }
    if (a.answer !== 'not-determinable') {
      if (!Array.isArray(a.evidence) || !a.evidence.length) errors.push(`${where}: a ${a.answer} carries its evidence, a non-empty list of path:line citations of the code or config that shows it`);
      else for (const ev of a.evidence) { const m = typeof ev === 'string' ? ev.trim().match(CITE) : null; if (!m) errors.push(`${where}: evidence ${JSON.stringify(ev)} is not a path:line citation`); }
    } else if (a.evidence !== undefined && !Array.isArray(a.evidence)) errors.push(`${where}: evidence must be a list`);
    if (k === 'refuses_unless' && a.answer === 'yes') {
      if (!(typeof a.what === 'string' && a.what.trim())) errors.push(`${where}: a yes says what the check checks (what)`);
      if (!HELD_BY.includes(a.held_by)) errors.push(`${where}: a yes says who holds the check (held_by: ${HELD_BY.join(' | ')})`);
    } else if (a.held_by !== undefined) errors.push(`${where}: held_by is said only of a refuses_unless yes`);
  }
  return errors;
}

/** The answers' evidence citations: [[question, "path:line"]]. @param {any} answers */
export function answerCitations(answers) {
  const out = [];
  for (const k of CHECKLIST_KEYS) { const a = answers && answers[k]; if (a && Array.isArray(a.evidence)) for (const ev of a.evidence) if (typeof ev === 'string') out.push([k, ev.trim()]); }
  return out;
}
