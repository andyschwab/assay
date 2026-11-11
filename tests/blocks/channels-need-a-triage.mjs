// ── a candidate list no lane triaged decides nothing (#275) ──
// `assay start` writes map/raw/enumerate.json into every run, and a run whose review lane did not
// run (a routine run, a lane skipped) carries no map/effect-triage.yaml. d-effect-channels-enumerated
// is a safety row: reading it unmet there would record a gap in the target that no review found.
// Pinned, in process, over a two-candidate list:
//   (a) no triage, the deciding lane with no disposition: not measured, the note naming the lane;
//   (b) no triage, the deciding lane ran: not measured, the note naming the lane and the missing file;
//   (c) a triage that exists and leaves candidates out still reads unmet, naming them;
//   (d) the four effect rows read not measured in (a) and (b), as before.
import { measureRun } from '../../yardstick/measure.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'channels-need-a-triage';

const ROW = 'd-effect-channels-enumerated';
const EFFECT_ROWS = ['d-effects-gated', 'd-effects-traced', 'd-effects-provable', 'd-gates-fail-closed'];

export async function run() {
  const fail = (m) => negFailures.push('channels-need-a-triage: ' + m);
  const adapters = loadAdapters();
  const lanes = Object.entries(adapters).filter(([, a]) => a && a.lane && a.adopted !== false && !a.retired && (a.lane_decides || []).includes('facet')).map(([id]) => id);
  if (!lanes.length) { fail('test setup: a lane decides facet rows'); return; }
  const measure = (manifest, triage) => Object.fromEntries(measureRun({ findings: [], manifest, inputs: null, coverage: {}, channels: { candidates: ['tool: a', 'tool: b'], triage, errors: [] } }).map((r) => [r.id, r]));
  const names = (note) => lanes.every((l) => String(note).includes(l));

  // (a)
  const a = measure(null, null);
  if (a[ROW]?.status !== 'not-measured' || !names(a[ROW].note) || !/lane not run/.test(a[ROW].note)) fail(`(a) no triage and no lane run reads not measured, naming the lane (got ${a[ROW]?.status}: ${a[ROW]?.note})`);

  // (b)
  const b = measure({ scanners: Object.fromEntries(lanes.map((l) => [l, { status: 'ran' }])) }, null);
  if (b[ROW]?.status !== 'not-measured' || !names(b[ROW].note) || !/wrote no triage \(map\/effect-triage\.yaml\)/.test(b[ROW].note)) fail(`(b) no triage from a lane that ran reads not measured, naming the lane and the file (got ${b[ROW]?.status}: ${b[ROW]?.note})`);

  // (c)
  const c = measure(null, [{ candidate: 'tool: a', out_of_scope: 'read-only: writes nothing' }]);
  if (c[ROW]?.status !== 'unmet' || !/untriaged: tool: b/.test(c[ROW].note)) fail(`(c) a triage that leaves a candidate out reads unmet, naming it (got ${c[ROW]?.status}: ${c[ROW]?.note})`);

  // (d)
  for (const [k, m] of [['a', a], ['b', b]]) for (const id of EFFECT_ROWS) if (m[id]?.status !== 'not-measured') fail(`(d) ${id} reads not measured with no triage (${k}; got ${m[id]?.status})`);
}
