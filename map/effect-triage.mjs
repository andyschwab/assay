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

const TRIAGE_SCHEMA = 'effect-triage';
const ENUMERATE_FILE = 'map/raw/enumerate.json';
const TRIAGE_FILE = 'map/effect-triage.yaml';
// the populations whose members the triage closes (#269): the agentic channels, and for a target
// with none of those (a web app) the route handlers and effect call sites, each member as
// enumerate collapses it (an effect-site member groups one file's call lines of one kind, #272).
// One entry per member.
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

const isEffect = (f) => f && f.subject_type === 'effect' && f.effect && typeof f.effect === 'object';

// validate's check of the triage against the list and the base (map/triage.mjs holds the rules
// both closed populations share). findingsById: id → finding.
export function triageErrors({ candidates, triage }, findingsById) {
  if (triage === null) return [];   // no triage file: nothing to hold; the measurement reads every candidate untriaged
  if (candidates === null) return [`${TRIAGE_FILE}: triages channel candidates, and the run carries no candidate list (${ENUMERATE_FILE}, which assay start writes)`];
  return entryErrors(triage, candidates, {
    at: TRIAGE_FILE,
    missingCandidate: `a member of ${ENUMERATE_FILE}'s ${CANDIDATE_POPULATIONS.join(', ')}, as it is written there`,
    notListed: () => `is not a channel candidate in ${ENUMERATE_FILE} (${CANDIDATE_POPULATIONS.join(', ')})`,
    exactlyOne: 'finding (the effect finding that covers it) or out_of_scope (the reason)',
    reasonHint: 'for example, read-only: writes nothing',
    findingError: (id) => {
      const f = findingsById.get(id);
      if (!f) return 'is not in this run';
      if (!isEffect(f)) return `is not an effect finding (subject_type ${f.subject_type}); a candidate is covered by the effect finding that records its channel`;
      return null;
    },
    missing: (cs) => `${TRIAGE_FILE}: ${cs.length} channel candidate(s) not triaged: ${cs.join(', ')} — record each as the effect finding that covers it, or out of scope with the reason`,
  });
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
