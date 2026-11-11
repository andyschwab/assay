// enumerate-populations.mjs — the populations map/enumerate.mjs lists, in its print order: the
// one list of their names. enumerate.mjs prints and writes them in this order, the effect triage
// takes three of them (map/effect-triage.mjs CANDIDATE_POPULATIONS), and a census row may name
// others as its candidates (yardstick/requirements.yaml decide.candidates, map/census-triage.mjs).
export const ENUMERATE_POPULATIONS = ['channelCandidates', 'routeHandlers', 'secrets', 'secretConstants', 'changeGates', 'modelCalls', 'socketMounts', 'containerClasses', 'effectSites', 'egressControls', 'contracts', 'reportPaths'];
