// census-triage.mjs — a census whose population a tool can list, closed (#286, M6 of #257; map/SCHEMA.md §6f).
//
// M1 closed the effects: the lane triages every candidate enumerate lists, and the effect rows
// read over that fixed list (map/effect-triage.mjs). A census row does the same when its
// population is one the tree lists deterministically: the row names enumerate's population(s)
// as its candidates (yardstick/requirements.yaml `decide.candidates`), the practice-review lane
// records one entry per candidate in map/census-triage.yaml, the sibling of map/effect-triage.yaml
// under the same contract (map/triage.mjs), and:
//   • validate holds it (censusTriageErrors): every candidate triaged exactly once, to a member of
//     that census (map/censuses.yaml `members:`) or out of scope with the reason, and no member
//     judging two candidates: one candidate, one member, so every sweep judges the same members;
//   • the yardstick reads it (censusClosure, then yardstick/measure.mjs closedCensus): such a row
//     reads met only when every candidate is triaged and every in-list member is a strength; a
//     member outside the list can hold the row down (a gap) but never reads it met (a strength),
//     and is named; an untriaged candidate turns met into mixed, naming it; with no list the row
//     reads not measured, naming why (yardstick/README.md, "A census a tool can list").
// A census row whose population no tool can list states why on the row (`decide.open`) and reads
// its members as before. The triage names findings, never requirements (#257 Q1).
import { readFileSync, existsSync } from 'node:fs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { enumeratePath, censusTriagePath } from '../lib/run-layout.mjs';
import { entryErrors, closure } from './triage.mjs';

const TRIAGE_SCHEMA = 'census-triage';
const ENUMERATE_FILE = 'map/raw/enumerate.json';
const TRIAGE_FILE = 'map/census-triage.yaml';
const SECTION_KEYS = ['census', 'triage'];

// the census rows closed over a listed population: [{ id, measures, populations }]
function closedRows(reg) {
  return (reg?.requirements || []).filter((d) => d?.decide?.kind === 'census' && Array.isArray(d.decide.candidates))
    .map((d) => ({ id: d.id, measures: d.decide.measures, populations: d.decide.candidates }));
}

// the run's two files, read as they are: { populations, triage, errors }. populations is the
// enumerate record's populations map, null when the run carries no list; triage is the
// censuses: list, null when the run carries no triage file. A file present but unreadable is an
// error, and reads as absent to the measurement (never as an empty list).
export function loadCensusTriage(run) {
  const errors = [];
  let populations = null, triage = null;
  const ep = enumeratePath(run);
  if (existsSync(ep)) {
    try {
      const doc = JSON.parse(readFileSync(ep, 'utf8'));
      if (doc && doc.schema === 'enumerate' && doc.populations && typeof doc.populations === 'object') populations = doc.populations;
      else errors.push(`${ENUMERATE_FILE}: not an enumerate --json record (schema: enumerate, populations:) — regenerate: node assay.mjs enumerate <target> --json`);
    } catch (e) { errors.push(`${ENUMERATE_FILE}: JSON parse failed (fail-closed): ${e.message}`); }
  }
  const tp = censusTriagePath(run);
  if (existsSync(tp)) {
    let doc;
    try { doc = parseYaml(readFileSync(tp, 'utf8')); } catch (e) { errors.push(`${TRIAGE_FILE}: YAML parse failed (fail-closed): ${e.message}`); doc = undefined; }
    if (doc !== undefined) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.schema !== TRIAGE_SCHEMA) errors.push(`${TRIAGE_FILE}: needs schema: ${TRIAGE_SCHEMA} and a censuses: list (map/SCHEMA.md §6f)`);
      else if (!Array.isArray(doc.censuses)) errors.push(`${TRIAGE_FILE}: censuses: must be a list, one entry per census a row closes (census, triage)`);
      else triage = doc.censuses;
    }
  }
  return { populations, triage, errors };
}

// a row's candidates as enumerate listed them: { listed, candidates, reason }. Not listed when the
// run carries no list, the list does not read, or it lacks one of the row's populations (an
// enumeration older than the population).
function candidatesOf(row, populations, errors = []) {
  if (!populations) {
    const why = errors.length ? `the candidate list does not read (${errors[0]})` : `the run carries no candidate list (${ENUMERATE_FILE}, which assay start writes)`;
    return { listed: false, candidates: [], reason: why };
  }
  const lists = row.populations.map((p) => populations[p]);
  const absent = row.populations.filter((p, i) => !(Array.isArray(lists[i]) && lists[i].every((c) => c && typeof c.member === 'string' && c.member)));
  if (absent.length) return { listed: false, candidates: [], reason: `${ENUMERATE_FILE} lists no ${absent.map((p) => `populations.${p}`).join(', ')} (an enumeration that predates it, or one that does not read): regenerate it with node assay.mjs enumerate <target> --json` };
  return { listed: true, candidates: [...new Set(lists.flat().map((c) => c.member))], reason: null };
}

// the members map/censuses.yaml lists under a census name, or null when it records no such census
function membersOf(censuses, name) {
  for (const dim of Array.isArray(censuses?.dimensions) ? censuses.dimensions : []) for (const s of Array.isArray(dim?.sampled) ? dim.sampled : [])
    if (s && s.name === name) return Array.isArray(s.members) ? s.members.map(String) : [];
  return null;
}

// the section of the triage that closes a row: the one whose census is one of its measures
const sectionOf = (row, triage) => (Array.isArray(triage) ? triage : []).find((s) => s && typeof s === 'object' && row.measures.includes(s.census)) || null;

// validate's check of the triage against the list, the censuses and the base.
// censuses: map/censuses.yaml as parsed (or null); findingsById: id → finding.
export function censusTriageErrors({ populations, triage, errors: loadErrors = [] }, reg, censuses, findingsById) {
  const errors = [];
  if (triage === null) return errors;   // no triage file: nothing to hold; the measurement reads every candidate untriaged
  const rows = closedRows(reg);
  const closes = new Map(rows.flatMap((r) => r.measures.map((m) => [m, r])));
  const byRow = new Map();
  triage.forEach((s, i) => {
    const at = `${TRIAGE_FILE}:censuses[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`${at}: an entry is a map (census, triage)`); return; }
    for (const k of Object.keys(s)) if (!SECTION_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}" (${SECTION_KEYS.join(', ')})`);
    const row = closes.get(s.census);
    if (!row) { errors.push(`${at}: census "${s.census}" is not a census a row closes over a listed population (${[...closes.keys()].join(', ')}; yardstick/requirements.yaml decide.candidates)`); return; }
    if (byRow.has(row.id)) { errors.push(`${at}: ${row.id}'s census is triaged twice (also ${byRow.get(row.id)}): one triage per census`); return; }
    byRow.set(row.id, at);
    if (!Array.isArray(s.triage)) { errors.push(`${at}: triage: must be a list, one entry per candidate (an empty list is [])`); return; }
    const list = candidatesOf(row, populations, loadErrors);
    if (!list.listed) { errors.push(`${at}: triages ${row.id}'s candidates, and ${list.reason}`); return; }
    const members = membersOf(censuses, s.census);
    const pops = row.populations.map((p) => `populations.${p}`).join(', ');
    errors.push(...entryErrors(s.triage, list.candidates, {
      at: `${at}.triage`,
      missingCandidate: `a member of ${ENUMERATE_FILE}'s ${pops}, as it is written there`,
      notListed: () => `is not a candidate of census ${s.census} in ${ENUMERATE_FILE} (${pops})`,
      exactlyOne: `finding (the member of census ${s.census} that judges it) or out_of_scope (the reason)`,
      reasonHint: 'for example, an inert string planted in a test fixture',
      findingError: (id) => {
        if (!findingsById.has(id)) return 'is not in this run';
        if (members === null) return `is not a member of census ${s.census}: map/censuses.yaml records no census ${s.census}`;
        if (!members.includes(id)) return `is not a member of census ${s.census} (its members: in map/censuses.yaml); a candidate is judged by the member that records it`;
        return null;
      },
      oneEach: true,
      missing: (cs) => `${at}.triage: ${cs.length} candidate(s) of census ${s.census} not triaged: ${cs.join(', ')} — record each as the census member that judges it, or out of scope with the reason`,
    }));
  });
  // a triage file closes every listed population it can: a closed row with candidates and no section
  for (const row of rows) {
    if (byRow.has(row.id)) continue;
    const list = candidatesOf(row, populations, loadErrors);
    if (list.listed && list.candidates.length) errors.push(`${TRIAGE_FILE}: ${list.candidates.length} candidate(s) of ${row.id}'s census (${row.measures[0]}) not triaged: ${list.candidates.join(', ')} — add a census: ${row.measures[0]} entry triaging each`);
  }
  return errors;
}

/**
 * The measurement's read of a closed row's population.
 * @returns {{ listed: boolean, reason: string|null, candidates: string[], untriaged: string[],
 *   outOfScope: string[], judged: Map<string, string>, census: string|null }}
 */
export function censusClosure(d, { populations = null, triage = null, errors = [] } = /** @type {any} */ ({}), censuses = null, findingsById = new Map()) {
  const row = { id: d.id, measures: d.decide.measures, populations: d.decide.candidates };
  const list = candidatesOf(row, populations, errors);
  if (!list.listed) return { listed: false, reason: list.reason, candidates: [], untriaged: [], outOfScope: [], judged: new Map(), census: null };
  const s = sectionOf(row, triage);
  const members = s ? membersOf(censuses, s.census) : null;
  const holds = (id) => findingsById.has(id) && !!members && members.includes(id);
  const { untriaged, judged, outOfScope } = closure(list.candidates, s && Array.isArray(s.triage) ? s.triage : [], holds);
  return { listed: true, reason: null, candidates: list.candidates, untriaged, outOfScope, judged, census: s ? s.census : null };
}
