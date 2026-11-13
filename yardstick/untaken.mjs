// untaken.mjs — the findings no requirement takes (#264, D1 of #257).
//
// The run's discovery candidates: the findings no requirement takes. "Which requirement takes
// this finding" has one reading in the engine, the yardstick's own (yardstick/population.mjs
// requirementTaking, #261), and this module only applies it to a run: a finding is taken when
// requirementTaking names a requirement or candidates for it. Its routes, in its order:
//   1. an instrument row takes its deciders' rows (scanner and native category);
//   2. an effect or capability finding is taken by its own facets, whether or not a row cites it
//      (an unmet effect row cites only its failing effects, the trifecta row only the full ones);
//   3. a finding listed in a census's `members:` is taken by the row whose population names that
//      census's term: the term the check of the census row whose `decide.measures` names the
//      census opens on. A census no row measures gives its members no term: no requirement
//      takes them. A finding listed in a context list (`context:`, #262) is taken by the claim
//      row whose `decide.context` names the list, as context: it is bound to a requirement, so
//      it is no discovery candidate.
// The two routes this module read before M3 landed are covered by these and dropped: a finding
// a row of the measurement cites is an instrument's row, an effect or capability finding, or a
// census member (routes 1-3), and an effect-triage covering finding is an effect finding
// (route 2). A finding's `property:` names what it observes and plays no part here (#257 Q1).
// requirementTaking throws on a census member its own facets or subject type contradict: that
// fails loud (CLAUDE.md rule 3), never reads as untaken.
import { loadAdapters } from '../map/project.mjs';
import { loadYardstick } from './measure.mjs';
import { requirementTaking, censusTerms, contextTerms } from './population.mjs';

// { findings, censuses, reg, adapters } → the findings no requirement takes, in input order.
//   findings       the run's findings (map/project.mjs loadFindings)
//   censuses       map/censuses.yaml as parsed (`dimensions[].sampled[]`: name, members), or null
//   reg, adapters  the yardstick and the adapters (loaded when omitted)
export function untakenFindings({ findings = [], censuses = null, reg = loadYardstick(), adapters = loadAdapters() }) {
  const termOf = censusTerms(reg);
  const memberOf = new Map();
  for (const dim of (censuses && censuses.dimensions) || []) for (const s of (dim && dim.sampled) || []) {
    for (const id of Array.isArray(s && s.members) ? s.members : []) if (id != null && id !== '') memberOf.set(String(id), termOf.get(String(s.name)) ?? null);
  }
  const ctxTermOf = contextTerms(reg);
  for (const c of (censuses && Array.isArray(censuses.context) ? censuses.context : [])) {
    for (const id of Array.isArray(c && c.members) ? c.members : []) if (id != null && id !== '' && !memberOf.has(String(id))) memberOf.set(String(id), ctxTermOf.get(String(c.name)) ?? null);
  }
  return findings.filter((f) => f && !requirementTaking(f, { member: memberOf.get(String(f.id)) ?? null, reg, adapters }).candidates.length);
}
