// population.mjs — which requirement takes a finding (#261, M3 of #257; yardstick/README.md,
// "The four deciding kinds").
//
// A facet or census row's `check:` names its population and the one question asked of each
// member, in one form: "Population: every <term> <scope>; excluded: <what>. Question: <q>?",
// then, optionally, how the row reads. <term> is one of the yardstick's closed `members:`
// vocabulary (requirements.yaml), and no two rows name the same one, so a finding a reader
// places on a term lands on one requirement. The binding lives here, on the yardstick side
// (#257 Q1): a finding carries no requirement id.
//
// requirementTaking(finding, { member }) is the one reading of "which requirement takes this
// finding". It is driven by what the yardstick declares, in this order, and every route that
// answers is a candidate, so a finding two rows would take reads ambiguous, never one of them:
//   1. an instrument row takes its deciders' rows: the scanner (`source`) and a native category
//      its binding decides the row on, or a fact category its evidence conditions read
//      (decidersOf, the same resolution measureRun uses);
//   2. an effect or capability finding is taken by its own facets: the term whose `record:` is
//      halt-class-effect (isHaltClass), effect, or capability;
//   3. a finding a reader places on a term (`member`, the census or context list it is listed
//      in) is taken by the row whose population names that term. A claim row that carries a
//      context list (#262, M4) names a population in the same form: it takes the findings placed
//      on its term as context, shown beside its status and never deciding it.
// None of them: the finding is taken by no requirement (`requirement: null`), what #264 (D1)
// reads as a finding that binds no requirement.
import { isHaltClass } from '../map/doctrine.mjs';
import { loadAdapters } from '../map/project.mjs';
import { loadYardstick, decidersOf } from './measure.mjs';

const SUBJECT_TYPES = ['effect', 'control', 'artifact', 'contract', 'process', 'capability'];
const RECORDS = ['halt-class-effect', 'effect', 'capability'];
// the form a facet or census row's check takes; the question holds exactly one question mark,
// and nothing after it asks another
const FORM = /^Population: every (.+?); excluded: (.+?)\. Question: ([^?]+\?)(?: ([^?]*))?$/s;

/** The parts of a check in the form, the term its population opens on, or null when it is not
 * in the form or names no term of the vocabulary.
 * @param {string} check @param {string[]} terms */
export function parseCheck(check, terms) {
  const m = FORM.exec(String(check ?? ''));
  if (!m) return null;
  const [, population, excluded, question, rest = ''] = m;
  // the longest term the population opens on, ending at a word boundary ("halt-class effect's
  // record" before "halt-class effect", "effect gate" before "effect")
  const term = [...terms].sort((a, b) => b.length - a.length)
    .find((t) => population.startsWith(t) && (population.length === t.length || /^[\s,;(]/.test(population.slice(t.length))));
  if (!term) return null;
  return { term, population, excluded, question, rest };
}

// How a row's verdict over one member is decided (#293), named in the check after its question,
// on every census row and every claim row with a context list: "Met when <the bar>" where the
// threshold or fields make it deterministic, "Judged, weighing <what>" where it is a judgment per
// member, "The owner decides, weighing <what>" where only the owner can. Exactly one of the three.
/** @type {[string, RegExp][]} */
const BARS = [['deterministic', /(?:^|\. |: )Met when[ ,]/g], ['judged', /(?:^|\. |: )Judged, weighing /g], ['owner', /(?:^|\. |: )The owner decides, weighing /g]];
/** How the check says its verdict is decided ('deterministic' | 'judged' | 'owner'), or null when
 * it names none of the three, or more than one.
 * @param {string} rest  what follows the check's question (parseCheck(...).rest) */
export function barOf(rest) {
  const found = BARS.flatMap(([kind, re]) => [...String(rest ?? '').matchAll(re)].map(() => kind));
  return found.length === 1 ? found[0] : null;
}

// the rows whose check names a population: every facet and census row, and a claim row that
// carries a context list (#262): the run places findings on its term as context
const namesPopulation = (d) => ['facet', 'census'].includes(d?.decide?.kind) || (d?.decide?.kind === 'claim' && d.decide.context !== undefined);

/** Every error in the vocabulary and the rows' populations: an empty list when each facet and
 * census row's check, and each claim row's with a context list, is in the form, names a term,
 * and no two rows name one.
 * @param {any} reg */
export function validatePopulations(reg) {
  const errors = [];
  const members = Array.isArray(reg?.members) ? reg.members : null;
  if (!members || !members.length) return ['yardstick: no members: vocabulary (the terms a population names)'];
  const seen = new Set(), records = new Map();
  for (const [i, m] of members.entries()) {
    const at = `yardstick: members[${i}]`;
    if (!m || typeof m.term !== 'string' || !m.term) { errors.push(`${at}: term required`); continue; }
    if (seen.has(m.term)) errors.push(`${at}: duplicate term "${m.term}"`); seen.add(m.term);
    if (!Array.isArray(m.subject_types) || m.subject_types.some((t) => !SUBJECT_TYPES.includes(t))) errors.push(`${at} (${m.term}): subject_types must be a list of ${SUBJECT_TYPES.join('|')}`);
    if (!m.means) errors.push(`${at} (${m.term}): means required (what a member is)`);
    if (m.record !== undefined) {
      if (!RECORDS.includes(m.record)) errors.push(`${at} (${m.term}): record must be one of ${RECORDS.join('|')}`);
      else if (records.has(m.record)) errors.push(`${at} (${m.term}): record ${m.record} is already ${records.get(m.record)}'s`);
      else records.set(m.record, m.term);
    }
  }
  for (const r of RECORDS) if (!records.has(r)) errors.push(`yardstick: members: no term takes the ${r} record`);
  const owner = new Map();
  for (const d of reg.requirements || []) {
    if (!namesPopulation(d)) continue;
    const p = parseCheck(d.check, [...seen]);
    if (!p) { errors.push(`yardstick: ${d.id}: a ${d.decide.kind} row's check reads "Population: every <term> <scope>; excluded: <what>. Question: <one question>?", <term> one of members: (got "${String(d.check).slice(0, 80)}")`); continue; }
    if (d.decide.kind !== 'facet' && !barOf(p.rest)) errors.push(`yardstick: ${d.id}: a ${d.decide.kind} row's check names how its verdict is decided after its question, exactly one of "Met when <the bar>", "Judged, weighing <what>" or "The owner decides, weighing <what>" (#293)`);
    if (owner.has(p.term)) errors.push(`yardstick: ${d.id}: its population names "${p.term}", already ${owner.get(p.term)}'s: a member would land on two requirements`);
    else owner.set(p.term, d.id);
  }
  return errors;
}

// the term each row's population names, read off its check
function owners(reg) {
  const terms = (reg.members || []).map((m) => m.term);
  const out = new Map();
  for (const d of reg.requirements || []) {
    if (!namesPopulation(d)) continue;
    const p = parseCheck(d.check, terms);
    if (p) out.set(p.term, [...(out.get(p.term) || []), d.id]);
  }
  return out;
}
const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map(String);

// census name → the term its census row's population names (null when its check names none):
// the term the check of the census row whose `decide.measures` names the census opens on
export function censusTerms(reg) {
  const terms = (reg.members || []).map((m) => m.term);
  const out = new Map();
  for (const d of reg.requirements || []) {
    if (d?.decide?.kind !== 'census') continue;
    const p = parseCheck(d.check, terms);
    for (const name of d.decide.measures || []) out.set(String(name), p ? p.term : null);
  }
  return out;
}
// context list name → the term its claim row's population names (#262)
export function contextTerms(reg) {
  const terms = (reg.members || []).map((m) => m.term);
  const out = new Map();
  for (const d of reg.requirements || []) {
    if (d?.decide?.kind !== 'claim' || !Array.isArray(d.decide.context)) continue;
    const p = parseCheck(d.check, terms);
    for (const name of d.decide.context) out.set(String(name), p ? p.term : null);
  }
  return out;
}

/**
 * Why a finding cannot be placed on a term, or null when it can: the term is not in the
 * vocabulary, the finding's subject type is not one the term admits, or its own facets place it
 * on another term. requirementTaking throws exactly this; validate reports it on every census and
 * context-list member (#304), so the compile is never the first to find it.
 * @param {any} finding @param {string} term @param {any} [reg]
 * @returns {string|null}
 */
export function placementError(finding, term, reg = loadYardstick()) {
  const vocab = new Map((reg.members || []).map((m) => [m.term, m]));
  const record = recordOf(finding);
  if (record) {
    const byRecord = [...vocab.values()].find((m) => m.record === record);
    if (!byRecord) return `yardstick: no members: term takes the ${record} record`;
    if (term !== byRecord.term) return `${finding.id}: placed on "${term}", but its own facets place it on "${byRecord.term}"`;
  }
  const m = vocab.get(term);
  if (!m) return `${finding?.id}: "${term}" is not a term of the yardstick's members: vocabulary`;
  if (finding?.subject_type && !m.subject_types.includes(finding.subject_type)) return `${finding.id}: a ${finding.subject_type} finding is not a "${term}" (the term admits ${m.subject_types.join(', ') || 'no subject type'})`;
  return null;
}
// the record an effect or capability finding's own facets give it, or null
const recordOf = (finding) => (finding?.subject_type === 'effect' && finding.effect ? (isHaltClass(finding.effect) ? 'halt-class-effect' : 'effect')
  : finding?.subject_type === 'capability' && finding.capabilities ? 'capability' : null);

/**
 * Which requirement takes a finding. Throws on a member the vocabulary does not name, on a
 * member whose subject types the finding's does not fit, and on a member that contradicts the
 * term an effect or capability finding's own facets give.
 * @param {any} finding  a finding of a run (map/SCHEMA.md §1), or an instrument row
 * @param {{ member?: string|null, reg?: any, adapters?: any }} [opts]
 *   member: the term a reader (or the census the finding is listed in) places it on
 * @returns {{ requirement: string|null, candidates: string[], member: string|null }}
 */
export function requirementTaking(finding, { member = null, reg = loadYardstick(), adapters = loadAdapters() } = {}) {
  const vocab = new Map((reg.members || []).map((m) => [m.term, m]));
  const own = owners(reg);
  const candidates = new Set();
  // 1. an instrument row takes its deciders' rows
  if (finding?.source) for (const d of reg.requirements) for (const spec of decidersOf(d, adapters)) {
    if (spec.scanner !== finding.source) continue;
    const cats = [...asList(spec.category), ...asList(spec.not_applicable_when), ...asList(spec.not_measured_when)];
    if (cats.includes(String(finding.native_category))) candidates.add(d.id);
  }
  // 2. an effect or capability finding is taken by its own facets
  const record = recordOf(finding);
  let term = member;
  if (record) {
    const byRecord = [...vocab.values()].find((m) => m.record === record);
    if (!byRecord) throw new Error(`yardstick: no members: term takes the ${record} record`);
    term = member || byRecord.term;
  }
  // 3. the row whose population names the term
  if (term) {
    const why = placementError(finding, term, reg);
    if (why) throw new Error(why);
    for (const id of own.get(term) || []) candidates.add(id);
  }
  const list = [...candidates];
  return { requirement: list.length === 1 ? list[0] : null, candidates: list, member: term };
}
