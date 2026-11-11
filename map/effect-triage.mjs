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

const TRIAGE_SCHEMA = 'effect-triage';
const TRIAGE_KEYS = ['candidate', 'finding', 'out_of_scope'];
const ENUMERATE_FILE = 'map/raw/enumerate.json';
const TRIAGE_FILE = 'map/effect-triage.yaml';
// the populations whose members the triage closes (#269): the agentic channels, and for a target
// with none of those (a web app) the route handlers and effect call sites, each member as
// enumerate collapses it (an effect-site member groups its call lines). One entry per member.
export const CANDIDATE_POPULATIONS = ['channelCandidates', 'routeHandlers', 'effectSites'];

// the run's two files, read as they are: { candidates, triage, errors }. candidates is null when
// the run carries no list; triage is null when it carries no triage file. A file present but
// unreadable is an error, and reads as absent to the measurement (never as an empty list).
export function loadChannelFiles(run) {
  const errors = [];
  let candidates = null, triage = null;
  const ep = enumeratePath(run);
  if (existsSync(ep)) {
    try {
      const doc = JSON.parse(readFileSync(ep, 'utf8'));
      const pops = doc && doc.schema === 'enumerate' && doc.populations;
      const lists = CANDIDATE_POPULATIONS.map((p) => pops && pops[p]);
      if (!lists.every((list) => Array.isArray(list) && list.every((c) => c && typeof c.member === 'string' && c.member))) errors.push(`${ENUMERATE_FILE}: not an enumerate --json record (schema: enumerate, populations.${CANDIDATE_POPULATIONS.join(', populations.')}: [{ member }]) — regenerate: node assay.mjs enumerate <target> --json`);
      else candidates = [...new Set(lists.flat().map((c) => c.member))];
    } catch (e) { errors.push(`${ENUMERATE_FILE}: JSON parse failed (fail-closed): ${e.message}`); }
  }
  const tp = effectTriagePath(run);
  if (existsSync(tp)) {
    let doc;
    try { doc = parseYaml(readFileSync(tp, 'utf8')); } catch (e) { errors.push(`${TRIAGE_FILE}: YAML parse failed (fail-closed): ${e.message}`); doc = undefined; }
    if (doc !== undefined) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.schema !== TRIAGE_SCHEMA) errors.push(`${TRIAGE_FILE}: needs schema: ${TRIAGE_SCHEMA} and a triage: list (map/SCHEMA.md §6e)`);
      else if (!Array.isArray(doc.triage)) errors.push(`${TRIAGE_FILE}: triage: must be a list, one entry per channel candidate (an empty list is [])`);
      else triage = doc.triage;
    }
  }
  return { candidates, triage, errors };
}

const reasonOf = (x) => typeof x.out_of_scope === 'string' ? x.out_of_scope.trim() : '';
const isEffect = (f) => f && f.subject_type === 'effect' && f.effect && typeof f.effect === 'object';

// validate's check of the triage against the list and the base. findingsById: id → finding.
export function triageErrors({ candidates, triage }, findingsById) {
  const errors = [];
  if (triage === null) return errors;   // no triage file: nothing to hold; the measurement reads every candidate untriaged
  if (candidates === null) { errors.push(`${TRIAGE_FILE}: triages channel candidates, and the run carries no candidate list (${ENUMERATE_FILE}, which assay start writes)`); return errors; }
  const listed = new Set(candidates), seen = new Map();
  triage.forEach((x, i) => {
    const at = `${TRIAGE_FILE}[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { errors.push(`${at}: an entry is a map (candidate, and finding or out_of_scope)`); return; }
    for (const k of Object.keys(x)) if (!TRIAGE_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}" (${TRIAGE_KEYS.join(', ')})`);
    const c = typeof x.candidate === 'string' ? x.candidate : null;
    if (!c) errors.push(`${at}: missing candidate (a member of ${ENUMERATE_FILE}'s ${CANDIDATE_POPULATIONS.join(', ')}, as it is written there)`);
    else if (!listed.has(c)) errors.push(`${at}: "${c}" is not a channel candidate in ${ENUMERATE_FILE} (${CANDIDATE_POPULATIONS.join(', ')})`);
    else if (seen.has(c)) errors.push(`${at}: "${c}" is triaged twice (also ${TRIAGE_FILE}[${seen.get(c)}]): one entry per candidate`);
    if (c && !seen.has(c)) seen.set(c, i);
    const hasF = x.finding !== undefined && x.finding !== null && x.finding !== '', hasO = x.out_of_scope !== undefined;
    if (hasF === hasO) errors.push(`${at}: give exactly one of finding (the effect finding that covers it) or out_of_scope (the reason)`);
    else if (hasF) {
      const f = findingsById.get(String(x.finding));
      if (!f) errors.push(`${at}: finding ${x.finding} is not in this run`);
      else if (!isEffect(f)) errors.push(`${at}: finding ${x.finding} is not an effect finding (subject_type ${f.subject_type}); a candidate is covered by the effect finding that records its channel`);
    } else if (!reasonOf(x)) errors.push(`${at}: out_of_scope needs the reason (for example, read-only: writes nothing)`);
  });
  const missing = candidates.filter((c) => !seen.has(c));
  if (missing.length) errors.push(`${TRIAGE_FILE}: ${missing.length} channel candidate(s) not triaged: ${missing.join(', ')} — record each as the effect finding that covers it, or out of scope with the reason`);
  return errors;
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
  const ok = new Map();
  for (const x of Array.isArray(triage) ? triage : []) {
    if (!x || typeof x !== 'object' || typeof x.candidate !== 'string' || ok.has(x.candidate)) continue;
    if (x.finding != null && x.finding !== '' && isEffect(byId.get(String(x.finding)))) ok.set(x.candidate, { finding: String(x.finding) });
    else if ((x.finding == null || x.finding === '') && reasonOf(x)) ok.set(x.candidate, { out_of_scope: reasonOf(x) });
  }
  const untriaged = candidates.filter((c) => !ok.has(c));
  const covered = [...new Set(candidates.filter((c) => ok.get(c)?.finding).map((c) => ok.get(c).finding))];
  const outOfScope = candidates.filter((c) => ok.get(c)?.out_of_scope);
  return { listed: true, triaged: Array.isArray(triage), candidates, untriaged, covered, outOfScope, reason: null };
}
