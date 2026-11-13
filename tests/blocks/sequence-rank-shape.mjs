// ── the sequence key's edges and the rank field's shape (#306) ──
// views/improve/sequence.mjs orders the handoff by halt, tier and severity. Pinned here, over
// synthetic items and a hand-built measurement:
//   (a) not measured is not urgent: a gap every row listing it reads not measured ranks
//       unrated, after a measured Low of the same tier, however severe its own label;
//   (b) a gap no requirement takes ranks by its severity alone: right after the last tiered
//       gap at least as severe, and ahead of every tiered gap when none is as severe;
//   (c) an item's place is its worst member's: a group holding one safety High sits with the
//       safety Highs, whatever else it holds;
//   (d) checkSequence admits a rank only in its shape, and its tier and severity lists are the
//       yardstick's tiers (requirements.yaml) and the severity scale (map/doctrine.mjs).
import { negFailures } from '../harness.mjs';
import { buildSequence } from '../../views/improve/sequence.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { SEVERITY_ORDER } from '../../map/doctrine.mjs';
import { checkSequence, SEQUENCE_TIERS, SEQUENCE_SEVERITIES, SEQUENCE_SCHEMA } from '../../lib/run-data.mjs';

export const label = 'sequence-rank-shape';

const gap = (id, severity, extra = {}) => ({ f: { id, source: 'x', polarity: 'gap', severity, fix: `fix ${id}`, observation: id, evidence: [`${id}.mjs:1`], ...extra }, source: 'x', axis: 'code-security', state: 'open', also: [] });
const order = (seq) => seq.map((s) => s.ps.map((p) => p.f.id).join('+')).join(' ');

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const yardstick = loadYardstick();
  const seqOf = (decided, measurement) => buildSequence({ decided, adapters: { x: { scanner: 'x' } }, roadmap: [], measurement, yardstick }).seq;

  // (a) F-1 High on a verification row that read not measured; F-2 Low on a verification row decided
  {
    const seq = seqOf([gap('F-1', 'High'), gap('F-2', 'Low')], [
      { id: 'd-tests-execute-core', status: 'not-measured', findings: ['F-1'] },
      { id: 'd-lint-typecheck-gate', status: 'unmet', findings: ['F-2'] },
    ]);
    if (order(seq) !== 'F-2 F-1') fail(`a gap only a not-measured row lists must rank unrated, after a measured Low of its tier (got ${order(seq)})`);
    const r = seq.find((s) => s.ps[0].f.id === 'F-1')?.rank;
    if (!r || r.severity !== 'unrated' || r.tier !== 'verification') fail(`a not-measured gap's rank reads its tier and unrated (got ${JSON.stringify(r)})`);
  }
  // (b) tiered: S-High (safety), V-High (verification), S-Low (safety); untiered U-High, U-Med, U-Blocker
  {
    const seq = seqOf([gap('F-10', 'High'), gap('F-11', 'High'), gap('F-12', 'Low'), gap('F-20', 'High'), gap('F-21', 'Medium'), gap('F-22', 'Blocker')], [
      { id: 'd-routes-authorized', status: 'unmet', findings: ['F-10', 'F-12'] },
      { id: 'd-tests-execute-core', status: 'unmet', findings: ['F-11'] },
    ]);
    // F-22 is untiered and no tiered gap is a Blocker, so it leads; then the tiered gaps in
    // tier order, F-10 (safety High), F-12 (safety Low), F-11 (verification High); F-20 right
    // after the last tiered High (F-11); F-21 after the last tiered gap at least Medium (F-11)
    const want = 'F-22 F-10 F-12 F-11 F-20 F-21';
    if (order(seq) !== want) fail(`a gap no requirement takes must sit right after the last tiered gap at least as severe (want ${want}, got ${order(seq)})`);
    const r = seq.find((s) => s.ps[0].f.id === 'F-20')?.rank;
    if (!r || r.tier !== null || r.severity !== 'High') fail(`an untaken gap's rank reads tier null and its severity (got ${JSON.stringify(r)})`);
  }
  // (c) a grouped item takes its worst member's place
  {
    const grouped = { ...gap('F-31', 'Low'), f: { ...gap('F-31', 'Low').f, fix: 'one fix' } };
    const head = { ...gap('F-30', 'High'), f: { ...gap('F-30', 'High').f, fix: 'one fix' } };
    const seq = seqOf([grouped, gap('F-32', 'Medium'), head], [
      { id: 'd-routes-authorized', status: 'unmet', findings: ['F-30', 'F-32'] },
      { id: 'd-architecture-page', status: 'unmet', findings: ['F-31'] },
    ]);
    if (order(seq) !== 'F-31+F-30 F-32' && order(seq) !== 'F-30+F-31 F-32') fail(`a group holding a safety High sits with the safety Highs, ahead of a safety Medium (got ${order(seq)})`);
  }
  // (d) the rank's shape, and its lists' homes
  if (JSON.stringify(SEQUENCE_TIERS) !== JSON.stringify(yardstick.tiers)) fail(`lib/run-data.mjs SEQUENCE_TIERS must be requirements.yaml's tiers, in order (got ${SEQUENCE_TIERS.join(', ')} against ${yardstick.tiers.join(', ')})`);
  if (JSON.stringify(SEQUENCE_SEVERITIES) !== JSON.stringify([...SEVERITY_ORDER, 'unrated'])) fail(`lib/run-data.mjs SEQUENCE_SEVERITIES must be map/doctrine.mjs's scale and unrated (got ${SEQUENCE_SEVERITIES.join(', ')})`);
  const item = (rank) => ({ schema: SEQUENCE_SCHEMA, run: 'r', pending: [], sequence: [{ n: 1, kind: 'remedy', voice: 'scanner-verbatim', source: 'x', title: 't', findings: ['F-1'], plan: null, rank }] });
  if (checkSequence(item({ halt: false, tier: 'safety', severity: 'High' })).length) fail('checkSequence must admit a whole rank');
  if (checkSequence(item({ halt: true, tier: null, severity: 'unrated' })).length) fail('checkSequence must admit a rank with no tier');
  for (const bad of [{ halt: 'no', tier: 'safety', severity: 'High' }, { halt: false, tier: 'urgent', severity: 'High' }, { halt: false, tier: 'safety', severity: 'high' }, null])
    if (!checkSequence(item(bad)).some((e) => /rank must be/.test(e))) fail(`checkSequence must refuse the rank ${JSON.stringify(bad)}`);
}
