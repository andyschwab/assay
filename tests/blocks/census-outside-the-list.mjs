// ── a census member outside the candidate list: it can hold a closed row down, never read it met (#286) ──
// On a row with decide.candidates, a member the triage names for no listed candidate sits outside
// the list. The owner's rule is asymmetric (yardstick/README.md, "A census a tool can list"):
//   (1) a strength outside the list decides nothing: beside a complete triage of strengths the row
//       reads met over the in-list members alone (of counts them, not it);
//   (2) a gap outside the list counts as any gap does: with an empty list it reads the row unmet
//       (a hardcoded credential enumerate does not list still fails the row);
//   (3) only strengths outside the list, over an empty or all-out-of-scope list, read not measured,
//       naming why, never met;
//   (4) the note names every member outside the list, each a pointer to an enumerate gap (#292).
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'census-outside-the-list';

export async function run() {
  const fail = (m) => negFailures.push('census-outside-the-list: ' + m);
  const reg = loadYardstick();
  const f = (id, polarity) => ({ id, dimension: 'delegation', polarity, subject_type: 'control', observation: 'x', evidence: ['a.mjs:1'], confidence: 'confirmed' });
  const list = (secrets) => ({ channelCandidates: [], routeHandlers: [], effectSites: [], secrets: secrets.map((member) => ({ member, note: '', gateable: true, evidence: ['a.mjs:1'] })) });
  const read = (findings, members, secrets, triage) => measureRun({
    findings, manifest: [{ scanner: 'practice-review', status: 'ran' }], coverage: {},
    inputs: { dimensions: [{ dimension: 'delegation', sampled: [{ name: 'credential', members, method: 'every candidate, one finding each' }] }] },
    census: { populations: list(secrets), triage: [{ census: 'credential', triage }] },
  }, reg).find((x) => x.id === 'd-credentials-enumerated');
  const complete = [{ candidate: 'DEPLOY_TOKEN', finding: 'F-1' }, { candidate: 'SEARCH_API_KEY', finding: 'F-2' }];

  // (1) an outside strength beside a complete triage of strengths
  let r = read([f('F-1', 'strength'), f('F-2', 'strength'), f('F-3', 'strength')], ['F-1', 'F-2', 'F-3'], ['DEPLOY_TOKEN', 'SEARCH_API_KEY'], complete);
  if (r?.status !== 'met' || r.met !== 2 || r.of !== 2) fail(`a complete triage of strengths reads met over its 2 in-list members; the strength outside the list decides nothing (got ${r?.status} ${r?.met}/${r?.of}: ${r?.note})`);
  // (4) the note names it
  if (!/1 member\(s\) outside the candidate list: F-3/.test(r?.note || '')) fail(`the note names the member outside the list (got: ${r?.note})`);
  // an outside gap beside the same complete triage holds it down
  r = read([f('F-1', 'strength'), f('F-2', 'strength'), f('F-3', 'gap')], ['F-1', 'F-2', 'F-3'], ['DEPLOY_TOKEN', 'SEARCH_API_KEY'], complete);
  if (r?.status !== 'mixed' || r.met !== 2 || r.of !== 3 || !/outside the candidate list: F-3/.test(r.note)) fail(`a gap outside the list holds a complete triage of strengths down to mixed (the credential row is mixable), counted in of, naming it (got ${r?.status} ${r?.met}/${r?.of}: ${r?.note})`);

  // (2) an outside gap over an empty list
  r = read([f('F-3', 'gap'), f('F-4', 'gap')], ['F-3', 'F-4'], [], []);
  if (r?.status !== 'unmet' || !/2 member\(s\) outside the candidate list: F-3, F-4/.test(r.note)) fail(`gaps outside an empty list read unmet, naming them (got ${r?.status}: ${r?.note})`);

  // (3) only outside strengths, over an empty list and over an all-out-of-scope one
  r = read([f('F-3', 'strength')], ['F-3'], [], []);
  if (r?.status !== 'not-measured' || !/enumerate listed none/.test(r.note) || !/outside the candidate list: F-3/.test(r.note)) fail(`only strengths outside an empty list read not measured, naming why (got ${r?.status}: ${r?.note})`);
  r = read([f('F-3', 'strength')], ['F-3'], ['TEST_API_KEY'], [{ candidate: 'TEST_API_KEY', out_of_scope: 'an inert string planted in a test fixture' }]);
  if (r?.status !== 'not-measured' || !/1 out of scope/.test(r.note)) fail(`only strengths outside an all-out-of-scope list read not measured, naming why (got ${r?.status}: ${r?.note})`);
}
