// untaken.mjs — the findings no requirement takes (#264, D1 of #257).
//
// The ONE definition of "a finding no requirement takes". The run's candidates
// (views/improve/candidates.mjs) and the harness (tests/blocks/finding-property-candidates.mjs)
// both read it here, so the two cannot disagree. A finding is taken when the measurement
// reaches it through a requirement's population:
//   • a row of the measurement (yardstick.yaml) cites it in `findings:` (an effect facet row
//     the effect findings it read, an instrument row its rows, a met row what it was met by);
//   • it is a member of a census (map/censuses.yaml `members:`, map/census.mjs);
//   • it is the finding an effect-triage entry names as covering a candidate
//     (map/effect-triage.yaml, map/effect-triage.mjs), the population d-effect-channels-enumerated reads;
//   • it is in a facet rule's population (yardstick/measure.mjs byEffects): an effect finding
//     (`subject_type: effect` with an `effect` facet), which the effect rules read, or a
//     capability finding (`subject_type: capability` with a `capabilities` facet), which the
//     trifecta rule reads. A facet row cites only part of what it read (an unmet effect row its
//     failing effects, the trifecta rule the capabilities holding all three legs), so a
//     finding the rule read and passed is cited by no row, and is taken all the same.
// Every other finding observes a property no requirement reads yet: a discovery candidate.
// The link lives in the yardstick, never on the finding (#257 Q1): a finding's `property:`
// names what it observes and plays no part here. When the yardstick states for itself which
// requirement takes a finding (#261), this function reads that instead; its signature stays.

// the facet rules' populations, by the selectors yardstick/measure.mjs byEffects uses
const inFacetPopulation = (f) => (f.subject_type === 'effect' && !!f.effect) || (f.subject_type === 'capability' && !!f.capabilities);
const ids = (xs) => (Array.isArray(xs) ? xs : []).filter((x) => x != null && x !== '').map(String);

// { findings, measurement, censuses, triage } → the findings no requirement takes, in input order.
//   findings     the run's findings (map/project.mjs loadFindings)
//   measurement  the measurement's rows (yardstick/measure.mjs loadMeasurement), each with `findings`
//   censuses     map/censuses.yaml as parsed (`dimensions[].sampled[].members`), or null
//   triage       map/effect-triage.yaml's `triage:` entries, or null
export function untakenFindings({ findings = [], measurement = [], censuses = null, triage = null }) {
  const taken = new Set();
  for (const r of measurement || []) for (const id of ids(r && r.findings)) taken.add(id);
  for (const dim of (censuses && censuses.dimensions) || []) for (const s of (dim && dim.sampled) || []) for (const id of ids(s && s.members)) taken.add(id);
  for (const t of triage || []) if (t && t.finding != null && t.finding !== '') taken.add(String(t.finding));
  return findings.filter((f) => f && !taken.has(String(f.id)) && !inFacetPopulation(f));
}
