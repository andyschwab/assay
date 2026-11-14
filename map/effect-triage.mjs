// effect-triage.mjs — the effect-channel population, closed (#259; map/SCHEMA.md §6e).
//
// `assay start` writes the deterministic enumeration into the run (map/raw/enumerate.json,
// lib/run-layout.mjs enumeratePath). Its channel candidates, route handlers and effect call
// sites (CANDIDATE_POPULATIONS, #269) are the population the effect
// inventory is drawn from: the practice-review lane is given the file and records one triage
// entry per candidate in map/effect-triage.yaml — the `effect` finding that covers it, or
// out of scope with the reason. This module is the one reader of both files:
//   • validate holds the triage to its schema (triageErrors): every candidate triaged exactly
//     once, every finding id an `effect` finding of this run, every out-of-scope entry a reason;
//   • the yardstick reads the population (channelPopulation): an effect requirement reads met
//     only over a list that exists with every candidate triaged, never over a population
//     nobody enumerated (yardstick/README.md, "The effect population").
// Binding lives on the yardstick side (#257 Q1): a finding carries no requirement id, and the
// triage names findings, never requirements.
import { readFileSync, existsSync } from 'node:fs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { enumeratePath, effectTriagePath } from '../lib/run-layout.mjs';
import { entryErrors, closure } from './triage.mjs';
import { testOrFixture, constructionError, clauseError } from './effect-scope.mjs';
import { answerErrors, descriptorsFrom, gateTypeFrom, reversibilityFrom, answersLine } from './effect-answers.mjs';

const TRIAGE_SCHEMA = 'effect-triage';
const ENUMERATE_FILE = 'map/raw/enumerate.json';
const TRIAGE_FILE = 'map/effect-triage.yaml';
// the populations whose members the triage closes (#269): the agentic channels, and for a target
// with none of those (a web app) the route handlers and effect call sites, each member as
// enumerate collapses it (an effect-site member groups one file's call lines of one kind, #272).
// One entry per member.
export const CANDIDATE_POPULATIONS = ['channelCandidates', 'routeHandlers', 'effectSites'];

// The triage's versions (#315): version 1 is each entry's candidate and finding or out_of_scope;
// version 2 adds, on every entry, the scope clause that decided it (map/effect-scope.mjs), and on
// every entry that maps a candidate to a finding, its answers to the checklist that decide its
// gate_type and reversibility (map/effect-answers.mjs). A stored version 1 triage reads as it was
// written: its descriptors as the findings carry them, unanswered.
const TRIAGE_VERSIONS = [1, 2];
const CURRENT_TRIAGE_VERSION = 2;

// the run's two files, read as they are: { candidates, triage, errors, excluded, files, version }.
// candidates is null when the run carries no list; triage is null when it carries no triage file.
// excluded: member → reason, the list's candidates out of scope by construction (populations.excluded,
// absent from a list drawn before #315); ruled: whether the list carries that population, so the scope
// rule decided what it offers; files: member → the files its evidence cites; version: the triage's. A file present but unreadable is an error, and reads as absent to the measurement (never
// as an empty list).
export function loadChannelFiles(run) {
  const errors = [];
  let candidates = null, triage = null, version = null, ruled = false;
  const excluded = new Map(), files = new Map();
  const ep = enumeratePath(run);
  if (existsSync(ep)) {
    try {
      const doc = JSON.parse(readFileSync(ep, 'utf8'));
      const pops = doc && doc.schema === 'enumerate' && doc.populations;
      const lists = CANDIDATE_POPULATIONS.map((p) => pops && pops[p]);
      if (!lists.every((list) => Array.isArray(list) && list.every((c) => c && typeof c.member === 'string' && c.member))) errors.push(`${ENUMERATE_FILE}: not an enumerate --json record (schema: enumerate, populations.${CANDIDATE_POPULATIONS.join(', populations.')}: [{ member }]) — regenerate: node assay.mjs enumerate <target> --json`);
      else {
        candidates = [...new Set(lists.flat().map((c) => c.member))];
        for (const c of lists.flat()) files.set(c.member, [...(files.get(c.member) || []), ...(Array.isArray(c.evidence) ? c.evidence : []).map((e) => String(e).replace(/:\d+(?:-\d+)?$/, ''))]);
        ruled = Array.isArray(pops.excluded);
        for (const x of Array.isArray(pops.excluded) ? pops.excluded : []) if (x && typeof x.member === 'string') excluded.set(x.member, typeof x.reason === 'string' ? x.reason : 'a test or fixture file');
      }
    } catch (e) { errors.push(`${ENUMERATE_FILE}: JSON parse failed (fail-closed): ${e.message}`); }
  }
  const tp = effectTriagePath(run);
  if (existsSync(tp)) {
    let doc;
    try { doc = parseYaml(readFileSync(tp, 'utf8')); } catch (e) { errors.push(`${TRIAGE_FILE}: YAML parse failed (fail-closed): ${e.message}`); doc = undefined; }
    if (doc !== undefined) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.schema !== TRIAGE_SCHEMA) errors.push(`${TRIAGE_FILE}: needs schema: ${TRIAGE_SCHEMA} and a triage: list (map/SCHEMA.md §6e)`);
      else if (!TRIAGE_VERSIONS.includes(doc.version)) errors.push(`${TRIAGE_FILE}: version ${JSON.stringify(doc.version)} is not a triage version this engine reads (${TRIAGE_VERSIONS.join(', ')}; a new triage is version ${CURRENT_TRIAGE_VERSION})`);
      else if (!Array.isArray(doc.triage)) errors.push(`${TRIAGE_FILE}: triage: must be a list, one entry per channel candidate (an empty list is [])`);
      else { triage = doc.triage; version = doc.version; }
    }
  }
  return { candidates, triage, errors, excluded, ruled, files, version };
}

const isEffect = (f) => f && f.subject_type === 'effect' && f.effect && typeof f.effect === 'object';

// validate's check of the triage against the list and the base (map/triage.mjs holds the rules
// both closed populations share). findingsById: id → finding.
// The scope rule (map/effect-scope.mjs), as the run's own enumeration decided it (#333): a candidate it
// lists under excluded is never mapped in, at any version (entryErrors: it is not listed); a candidate
// it offers was decided in scope by the tree, which the run does not carry, so a triage made against
// it is never refused for mapping it in. The one exception is a version 2 triage against a list drawn
// before the rule (no excluded population): it is held to the rule by the paths the list cites, a
// candidate whose files are all test or fixture files never mapped in. A workflow write is never
// triaged out, at any version. At version 2 every
// entry names the clause that decided it, and the clause must hold. At version 2 every entry that maps
// a candidate in carries its answers (map/effect-answers.mjs), and a finding's gate_type and
// reversibility are what its candidates' answers give, the riskiest across them.
export function triageErrors({ candidates, triage, excluded = new Map(), ruled = false, files = new Map(), version = 1 }, findingsById) {
  if (triage === null) return [];   // no triage file: nothing to hold; the measurement reads every candidate untriaged
  if (candidates === null) return [`${TRIAGE_FILE}: triages channel candidates, and the run carries no candidate list (${ENUMERATE_FILE}, which assay start writes)`];
  const listed = new Set(candidates);
  const scope = [];
  triage.forEach((x, i) => {
    if (!x || typeof x !== 'object' || typeof x.candidate !== 'string' || !listed.has(x.candidate)) return;
    const mappedIn = x.finding !== undefined && x.finding !== null && x.finding !== '';
    if (!mappedIn && x.out_of_scope === undefined) return;   // neither: entryErrors names it
    const fs = files.get(x.candidate) || [];
    const testReason = version >= 2 && !ruled && fs.length && fs.every((f) => testOrFixture(f)) ? testOrFixture(fs[0]) : null;
    const why = constructionError({ candidate: x.candidate, mappedIn, testReason }) || (version >= 2 ? clauseError({ candidate: x.candidate, mappedIn, clause: x.clause }) : null);
    if (why) scope.push(`${TRIAGE_FILE}[${i}]: ${why}`);
  });
  if (version >= 2) scope.push(...answersErrors(triage, findingsById));
  return [...entryErrors(triage, candidates, {
    at: TRIAGE_FILE,
    keys: version >= 2 ? ['clause', 'answers'] : [],
    missingCandidate: `a member of ${ENUMERATE_FILE}'s ${CANDIDATE_POPULATIONS.join(', ')}, as it is written there`,
    notListed: (c) => excluded.has(c)
      ? `is out of scope by construction (${excluded.get(c)}): ${ENUMERATE_FILE} lists it under excluded, and it is never offered for triage`
      : `is not a channel candidate in ${ENUMERATE_FILE} (${CANDIDATE_POPULATIONS.join(', ')})`,
    exactlyOne: 'finding (the effect finding that covers it) or out_of_scope (the reason)',
    reasonHint: 'for example, read-only: writes nothing',
    findingError: (id) => {
      const f = findingsById.get(id);
      if (!f) return 'is not in this run';
      if (!isEffect(f)) return `is not an effect finding (subject_type ${f.subject_type}); a candidate is covered by the effect finding that records its channel`;
      return null;
    },
    missing: (cs) => `${TRIAGE_FILE}: ${cs.length} channel candidate(s) not triaged: ${cs.join(', ')} — record each as the effect finding that covers it, or out of scope with the reason`,
  }), ...scope];
}

// The answers at version 2: on each entry that maps a candidate in, and on no other; each holds
// (answerErrors); and each finding every one of whose candidates is answered carries the gate_type and
// reversibility those answers give, by #302's order (descriptorsFrom). A refusal names the finding,
// what it says, what the answers give, and each candidate with its answers.
function answersErrors(triage, findingsById) {
  const errors = [], byFinding = new Map();
  triage.forEach((x, i) => {
    if (!x || typeof x !== 'object' || typeof x.candidate !== 'string') return;
    const at = `${TRIAGE_FILE}[${i}]`;
    const mappedIn = x.finding !== undefined && x.finding !== null && x.finding !== '';
    if (!mappedIn) { if (x.answers !== undefined) errors.push(`${at}: "${x.candidate}" is out of scope: answers describe an in-scope effect, and an out-of-scope entry carries none`); return; }
    if (x.answers === undefined) { errors.push(`${at}: "${x.candidate}" is in scope and carries no answers: a version 2 triage answers the checklist for every candidate it maps to a finding (map/SCHEMA.md §6e, "The answers")`); return; }
    const errs = answerErrors(x.answers, `${at}: answers`);
    errors.push(...errs);
    const id = String(x.finding);
    if (!byFinding.has(id)) byFinding.set(id, []);
    byFinding.get(id).push(errs.length ? null : x);
  });
  for (const [id, entries] of byFinding) {
    const f = findingsById.get(id);
    if (!isEffect(f) || entries.includes(null)) continue;   // a finding that is no effect, or answers that do not hold, are named above
    const want = descriptorsFrom(entries.map((x) => x.answers));
    /** @type {[string, (answers: any) => string][]} */
    const fields = [['gate_type', gateTypeFrom], ['reversibility', reversibilityFrom]];
    for (const [field, of] of fields) {
      const said = f.effect[field];
      if (said === want[field]) continue;
      const each = entries.map((x) => `"${x.candidate}" (${answersLine(x.answers)}) → ${of(x.answers)}`).join('; ');
      errors.push(`${TRIAGE_FILE}: finding ${id}'s ${field} is ${said}, but its candidates' answers give ${want[field]}: ${each}`);
    }
  }
  return errors;
}

// The candidates a version 1 triage maps in, which carry no answers: read as written, unanswered.
export function unansweredOf({ triage, version }) {
  if (!Array.isArray(triage) || version !== 1) return 0;
  return triage.filter((x) => x && typeof x === 'object' && x.finding !== undefined && x.finding !== null && x.finding !== '').length;
}

// the measurement's read of the population: { listed, triaged, candidates, untriaged, covered, outOfScope, reason }.
// triaged is whether the run carries a triage at all (#275): a list nobody triaged decides nothing.
// A candidate counts triaged only by an entry that holds (an effect finding of this run, or a
// reason); anything else leaves it untriaged, so a bad entry never reads as a closed one.
// byId: id → finding, the run's findings.
export function channelPopulation({ candidates, triage, errors = [] } = /** @type {any} */ ({}), byId = new Map()) {
  if (!Array.isArray(candidates)) {
    const why = errors.length ? `the candidate list does not read (${errors[0]})` : `the run carries no channel candidate list (${ENUMERATE_FILE}, which assay start writes)`;
    return { listed: false, triaged: false, candidates: [], untriaged: [], covered: [], outOfScope: [], reason: `effect population not closed: ${why}` };
  }
  const { untriaged, judged, outOfScope } = closure(candidates, triage, (id) => isEffect(byId.get(id)));
  const covered = [...new Set(judged.values())];
  return { listed: true, triaged: Array.isArray(triage), candidates, untriaged, covered, outOfScope, reason: null };
}

// A channel's identity across runs (#298): the candidate the lane triaged to it, not the lane's own
// slug. Two lanes that spell one channel differently (`tool-install`, `tools-install`) both triage
// the same enumerated member to their finding, so a cross-run comparison of channels (map/variance.mjs)
// keys an effect finding by that member. A finding several candidates map to is keyed by the sorted
// set; a finding no candidate maps to keeps its slug. Returns Map<finding id, key>, the keys of the
// findings some candidate maps to; a run with no triage, or one that does not read, maps none.
const CANDIDATE_KEY = 'candidate: ';
export function candidateKeysOf(triage) {
  const by = new Map();
  for (const e of Array.isArray(triage) ? triage : []) {
    if (!e || typeof e.candidate !== 'string' || typeof e.finding !== 'string' || !e.finding) continue;
    if (!by.has(e.finding)) by.set(e.finding, new Set());
    by.get(e.finding).add(e.candidate);
  }
  return new Map([...by].map(([id, cs]) => [id, CANDIDATE_KEY + [...cs].sort().join(' | ')]));
}
export function channelKeys(run) {
  const { triage } = loadChannelFiles(run);
  return candidateKeysOf(triage);
}
