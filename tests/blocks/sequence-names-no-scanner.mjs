// ── the fix sequence's order is independent of scanner names (#306, CLAUDE.md rule 7) ──
// The key that orders the handoff's sequence (views/improve/sequence.mjs) reads what a finding
// is: its halt, its requirement's tier, its severity, and for a tie the item's lowest finding
// id. Renaming every scanner, with its adapter, leaves the order exactly as it was:
//   (a) over the rank fixture (tests/blocks/sequence-by-what-a-finding-is.mjs), projected and
//       measured as the handoff does, every source and adapter renamed;
//   (b) over two items tied on the whole key, from two scanners whose names sort the other way
//       once renamed: the tie still goes to the lower finding id.
// Re-pinned by #319 (slice 3): the order handed on is a named lens over the quadrants, and this key
// is the default lens's tie-break inside a quadrant, so (a) and (b) read the key's order
// (buildSequence's keyOrder); (a) also holds the lens's order, sequence.json's, unmoved.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, negFailures } from '../harness.mjs';
import { buildSequence } from '../../views/improve/sequence.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { writeRankFixture } from './sequence-by-what-a-finding-is.mjs';

export const label = 'sequence-names-no-scanner';
export const after = ['sequence-by-what-a-finding-is'];

const order = (seq) => seq.map((s) => s.ps.map((p) => p.f.id).sort().join('+')).join(' ');
// every scanner gets a new name; the adapter moves with it, so its declared handoff unit holds
const renamed = (decided, adapters, name) => ({
  decided: decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } })),
  adapters: Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k) }])),
});

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const yardstick = loadYardstick();

  // (a) the fixture run, renamed
  const tmp = join(HERE, 'tmp-sequence-names-no-scanner');
  writeRankFixture(tmp);
  const adapters = loadAdapters();
  const { projected } = projectMulti(loadFindings(tmp), adapters);
  const decided = decideProjected(projected, loadDecisions(tmp), '');
  const measurement = projectRun(tmp, yardstick);
  const before = order(buildSequence({ decided, adapters, roadmap: [], measurement, yardstick }).keyOrder);
  const beforeLens = order(buildSequence({ decided, adapters, roadmap: [], measurement, yardstick }).seq);
  for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`]) {
    const r = renamed(decided, adapters, name);
    const got = order(buildSequence({ decided: r.decided, adapters: r.adapters, roadmap: [], measurement, yardstick }).keyOrder);
    if (got !== before) fail(`renaming the scanners must not move the sequence (was ${before}, renamed ${got})`);
    const gotLens = order(buildSequence({ decided: r.decided, adapters: r.adapters, roadmap: [], measurement, yardstick }).seq);
    if (gotLens !== beforeLens) fail(`renaming the scanners must not move the lens's order (was ${beforeLens}, renamed ${gotLens})`);
  }
  if (!/^F-053 F-1003 /.test(before)) fail(`the fixture must still sequence the halt then the safety High first (got ${before})`);
  rmSync(tmp, { recursive: true, force: true });

  // (b) a tie on the whole key goes to the lower finding id, whatever the scanners are called
  const gap = (id, source) => ({ f: { id, source, polarity: 'gap', severity: 'High', fix: `fix ${id}`, observation: id, evidence: ['a.mjs:1'] }, source, axis: 'code-security', state: 'open', also: [] });
  const tied = [gap('F-2', 'beta'), gap('F-1', 'alpha')];
  const tieMeasure = [{ id: 'd-routes-authorized', status: 'unmet', findings: ['F-1', 'F-2'] }];
  // re-pinned with #319: an adapter states the kind of evidence its source produces, or no
  // confidence rule fires and the sequence halts (map/confidence.mjs); both stand-ins declare one
  const tieAdapters = { alpha: { scanner: 'alpha', confidence: { evidence: 'deterministic' } }, beta: { scanner: 'beta', confidence: { evidence: 'deterministic' } } };
  const t1 = order(buildSequence({ decided: tied, adapters: tieAdapters, roadmap: [], measurement: tieMeasure, yardstick }).keyOrder);
  const r = renamed(tied, tieAdapters, (s) => (s === 'alpha' ? 'zulu' : 'able'));
  const t2 = order(buildSequence({ decided: r.decided, adapters: r.adapters, roadmap: [], measurement: tieMeasure, yardstick }).keyOrder);
  if (t1 !== 'F-1 F-2' || t2 !== 'F-1 F-2') fail(`a tie must go to the lower finding id, never to a scanner's name (got ${t1}, renamed ${t2})`);
}
