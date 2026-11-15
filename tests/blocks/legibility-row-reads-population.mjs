// ── d-effect-facts-legible reads its population, not the count of runs that said a gap: met when every
// in-scope candidate is legible, mixed with met of N when some are, unmet when none is (#338, second
// slice; yardstick/README.md, "An effect's facts, legible"; yardstick/measure.mjs byLegibility) ──
// A run's lane answers the checklist for each in-scope effect candidate. The row read unmet on any gap,
// so one opaque effect among 25 read the same as 25: one lane's single not-determinable flipped the
// whole row, and the row parted across blind runs that agreed on every other effect. It now reads the
// in-scope candidates the way a census row reads its members. Held, in process, over a bar stated here:
//   (a) 24 of 25 candidates legible and one a gap reads mixed, met 24 of 25, listing the gap's effect
//       finding and only it, its note citing the one gap;
//   (b) none legible, every candidate a gap, reads unmet, met 0 of 25;
//   (c) all legible reads met, met 25 of 25, citing every effect finding;
//   (d) the per-question counts stay in the note in every case.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { loadBar } from '../../yardstick/legibility-bar.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'legibility-row-reads-population';

const ROW = 'd-effect-facts-legible';
const N = 25;
const BAR = `schema: assay.legibility-bar
version: 1
bar: 75
bar_reason: "stated by the test"
targets_at_least: 2
targets_reason: "stated by the test"
sets:
  - { set: set-one, target: "target one", reason: "stated by the test" }
  - { set: set-two, target: "target two", reason: "stated by the test" }
questions:
${['person_act', 'received_or_gone'].map((q) => `  - question: ${q}
    agreement: 90
    agree: 9
    of: 10
    targets: ["target one", "target two"]
    sets: [set-one, set-two]
    per_target:
      - { target: "target one", agreement: 100, agree: 5, of: 5 }
      - { target: "target two", agreement: 80, agree: 4, of: 5 }
    reason: "stated by the test"`).join('\n')}
below_bar: []
per_target_drops: []
`;

const no = (e) => ({ answer: 'no', evidence: [e] });
const nd = { answer: 'not-determinable' };
const pad = (i) => String(i).padStart(2, '0');
const cand = (i) => `http write (js) @ src/w${pad(i)}.mjs`;
const fid = (i) => `F-3${pad(i)}`;
const stated = (i) => Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, no(`src/w${pad(i)}.mjs:3`)]));
const effect = (i) => ({ id: fid(i), dimension: 'delegation', polarity: 'gap', subject_type: 'effect', severity: 'Medium', confidence: 'confirmed', observation: 'writes', evidence: [`src/w${pad(i)}.mjs:3`],
  effect: { channel: `w${pad(i)}`, reversibility: 'reversible', external: false, gate_type: 'none', telemetry: 'structured-event', blast_scope: 'user' } });

export async function run() {
  const fail = (m) => negFailures.push('legibility-row-reads-population: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-legibility-population-'));
  try {
    const barFile = join(tmp, 'bar.yaml');
    writeFileSync(barFile, BAR);
    const bar = loadBar(barFile);
    const reg = loadYardstick();
    const adapters = loadAdapters();
    const lanes = Object.entries(adapters).filter(([, a]) => a.lane && a.adopted !== false && !a.retired && (a.lane_decides || []).includes('facet')).map(([id]) => id);
    const manifest = { scanners: lanes.map((scanner) => ({ scanner, status: 'ran' })) };
    const ids = Array.from({ length: N }, (_, i) => i + 1);
    const findings = ids.map(effect);
    // gapped: the candidates whose received_or_gone no reader could determine
    const read = (gapped) => {
      const channels = {
        candidates: ids.map(cand), errors: [], version: 2,
        triage: ids.map((i) => ({ candidate: cand(i), finding: fid(i), clause: 'client-call-runtime', answers: { ...stated(i), ...(gapped.has(i) ? { received_or_gone: nd } : {}) } })),
        signals: new Map(), cites: new Map(ids.map((i) => [cand(i), [`src/w${pad(i)}.mjs:3`]])),
      };
      return measureRun({ findings, manifest, inputs: null, coverage: {}, adapters, channels, legibilityBar: bar }, reg).find((r) => r.id === ROW);
    };

    // (a) one gap among 25
    let r = read(new Set([7]));
    if (r.status !== 'mixed' || r.met !== 24 || r.of !== 25) fail(`(a) 24 of 25 candidates legible and one a gap reads mixed 24 of 25, never unmet (got ${r.status} ${r.met} of ${r.of}: ${r.note})`);
    if (JSON.stringify(r.findings) !== JSON.stringify([fid(7)])) fail(`(a) the mixed row lists the gap's effect finding and only it (got ${JSON.stringify(r.findings)})`);
    if (!r.note.includes(`"${cand(7)}" (src/w07.mjs:3) received_or_gone not determinable`)) fail(`(a) the note cites the one gap at its file:line, naming the question (got ${r.note})`);
    if (!/received_or_gone 24 of 25 legible/.test(r.note) || !/person_act 25 of 25 legible/.test(r.note)) fail(`(d) the note keeps its per-question counts (got ${r.note})`);

    // (b) none legible
    r = read(new Set(ids));
    if (r.status !== 'unmet' || r.met !== 0 || r.of !== 25) fail(`(b) with no candidate legible the row reads unmet, 0 of 25 (got ${r.status} ${r.met} of ${r.of}: ${r.note})`);
    if (!/received_or_gone 0 of 25 legible/.test(r.note)) fail(`(d) the note keeps its per-question counts when none is legible (got ${r.note})`);

    // (c) all legible
    r = read(new Set());
    if (r.status !== 'met' || r.met !== 25 || r.of !== 25) fail(`(c) with every candidate legible the row reads met, 25 of 25 (got ${r.status} ${r.met} of ${r.of}: ${r.note})`);
    if (JSON.stringify(r.findings) !== JSON.stringify(ids.map(fid))) fail(`(c) the met row cites every in-scope candidate's effect finding (got ${JSON.stringify(r.findings)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
