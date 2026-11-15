// ── an effect whose facts no careful reader can determine from the tree is a legibility gap of the
// target, read only on questions that clear a stated cross-target bar (#338; yardstick/README.md,
// "An effect's facts, legible"; yardstick/measure.mjs byLegibility) ──
// The practice-review lane answers a closed checklist for every in-scope effect (#315). A
// not-determinable answer was read only as noise about assay; it is also a fact about the target: the
// tree does not state the effect's fact anywhere a reader finds it. d-effect-facts-legible reads it,
// in the legibility tier, on the questions yardstick/legibility-bar.yaml lets it read. Every case runs
// in process over a bar file this block states, so the paths are exercised without real sweep data:
//   (a) a candidate whose reversibility is stated, answered no with its evidence, reads met on that
//       question, and one whose question a signal on the list answers reads legible by the signal,
//       even beside a not-determinable answer;
//   (b) its twin, answered not-determinable, reads a gap, citing the candidate's file:line and naming
//       the question, listing the effect finding it maps to: beside a legible candidate the row reads
//       mixed, 1 of 2, and with every candidate a gap it reads unmet. Re-pinned when the row came to
//       read its population (#338, second slice; yardstick/README.md, "An effect's facts, legible"):
//       it read unmet on any gap, so one opaque effect among many read the same as none legible;
//   (c) a question absent from the bar is never read: a not-determinable answer on it moves nothing;
//   (d) with no qualifying question the row reads not measured, saying why, never met;
//   (e) a run without answers (a version 1 triage), with no triage, or with no list, reads not
//       measured with its reason;
//   (f) the consequence rule: a gap on a significant effect (irreversible) reads significant, never
//       cosmetic; a gap on a reversible internal effect reads contained by legibility-gap-on-effect,
//       not cosmetic by its tier; a legibility gap on no effect still reads cosmetic; and swapping the
//       severity label moves nothing, since no rule reads a label and the row names no halt_at;
//   (g) renaming every scanner, adapter and run-record row alike, changes no reading of the row.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { loadBar } from '../../yardstick/legibility-bar.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { consequenceIndex, consequenceOf } from '../../map/consequence.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'effect-facts-legible';

const ROW = 'd-effect-facts-legible';
const A = 'http write (js) @ src/sync.mjs';
const B = 'deploy/publish (workflow) @ .github/workflows/deploy.yml';
const OUT = 'route: GET /status';

// a bar that reads two questions, stated here: the figures are this block's, not a sweep's.
// Re-pinned when the bar gained its per-target figures (#338, second slice): a bar file without
// per_target and per_target_drops is refused, so the bar stated here carries them.
const BAR = (questions) => `schema: assay.legibility-bar
version: 1
bar: 75
bar_reason: "stated by the test"
targets_at_least: 2
targets_reason: "stated by the test"
sets:
  - { set: set-one, target: "target one", reason: "stated by the test" }
  - { set: set-two, target: "target two", reason: "stated by the test" }
questions:${questions.length ? '\n' + questions.map((q) => `  - question: ${q}\n    agreement: 90\n    agree: 9\n    of: 10\n    targets: ["target one", "target two"]\n    sets: [set-one, set-two]\n    per_target:\n      - { target: "target one", agreement: 100, agree: 5, of: 5 }\n      - { target: "target two", agreement: 80, agree: 4, of: 5 }\n    reason: "stated by the test"`).join('\n') : ' []'}
below_bar: []
per_target_drops: []
${questions.length ? '' : 'none_qualify: "the test states no qualifying question"\n'}`;

const yes = (e) => ({ answer: 'yes', evidence: [e] });
const no = (e) => ({ answer: 'no', evidence: [e] });
const nd = { answer: 'not-determinable' };
// every question answered with evidence: nothing outside received it, the prior state kept, no window
const STATED = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, no('src/sync.mjs:3')]));
const with_ = (over) => ({ ...STATED, ...over });

const effect = (id, over = {}) => ({ id, dimension: 'delegation', polarity: 'gap', subject_type: 'effect', severity: 'Medium', confidence: 'confirmed', observation: 'writes', evidence: ['src/sync.mjs:3'],
  effect: { channel: id.toLowerCase(), reversibility: 'reversible', external: false, gate_type: 'none', telemetry: 'structured-event', blast_scope: 'user', ...over } });

export async function run() {
  const fail = (m) => negFailures.push('effect-facts-legible: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-facts-legible-'));
  try {
    const barOf = (qs) => { const f = join(tmp, `bar-${qs.join('-') || 'none'}.yaml`); writeFileSync(f, BAR(qs)); return loadBar(f); };
    const two = barOf(['received_or_gone', 'refuses_unless']);
    const onlyRefuses = barOf(['refuses_unless']);
    const none = barOf([]);
    const reg = loadYardstick();
    const adapters = loadAdapters();
    // the lanes that decide a facet row, read off the adapters (the core names none of them): recorded ran
    const lanes = Object.entries(adapters).filter(([, a]) => a.lane && a.adopted !== false && !a.retired && (a.lane_decides || []).includes('facet')).map(([id]) => id);
    const manifest = { scanners: lanes.map((scanner) => ({ scanner, status: 'ran' })) };
    const findings = [effect('F-101'), effect('F-102')];
    const channels = (answersA, answersB, { version = 2, signalsB = [] } = {}) => ({
      candidates: [A, B, OUT], errors: [], version,
      triage: [
        { candidate: A, finding: 'F-101', clause: 'client-call-runtime', ...(version === 2 ? { answers: answersA } : {}) },
        { candidate: B, finding: 'F-102', clause: 'workflow-write', ...(version === 2 ? { answers: answersB } : {}) },
        { candidate: OUT, out_of_scope: 'reads only', clause: 'route-reads-only' },
      ],
      signals: new Map(signalsB.length ? [[B, signalsB]] : []),
      cites: new Map([[A, ['src/sync.mjs:3', 'src/sync.mjs:9']], [B, ['.github/workflows/deploy.yml:14']], [OUT, ['server.mjs:2']]]),
    });
    const read = (ch, bar, extra = {}) => measureRun({ findings, manifest, inputs: null, coverage: {}, adapters, channels: ch, legibilityBar: bar, ...extra }, reg).find((r) => r.id === ROW);
    const sigB = [{ question: 'refuses_unless', supports: 'yes', held_by: 'outside', what: 'the environment', evidence: ['.github/workflows/deploy.yml:10'], marker: 'workflow.job_keys.environment' }];

    // the row is in the legibility tier, a facet row, its fix naming no system
    const d = reg.requirements.find((x) => x.id === ROW);
    if (!d) { fail(`${ROW} is not in the yardstick`); return; }
    if (d.tier !== 'legibility' || d.decide.kind !== 'facet' || d.decide.rule !== 'facts-legible') fail(`${ROW} is a legibility facet row decided by facts-legible (got ${d.tier}, ${d.decide.kind} ${d.decide.rule})`);
    if (!/state the fact where a reader or a machine finds it: a declared operation, a schema, config, or a comment at the effect/.test(d.owner.fix)) fail(`${ROW}'s fix says "state the fact where a reader or a machine finds it: a declared operation, a schema, config, or a comment at the effect" (got ${d.owner.fix})`);

    // (a) stated, and carried by a signal
    let r = read(channels(with_({ refuses_unless: yes('src/sync.mjs:2') }), with_({ refuses_unless: nd }), { signalsB: sigB }), two);
    if (r.status !== 'met') fail(`(a) a candidate whose reversibility is answered with evidence, and one whose refuses_unless a signal carries, read met (got ${r.status}: ${r.note})`);
    if (!/received_or_gone 2 of 2 legible/.test(r.note) || !/refuses_unless 2 of 2 legible \(1 by a signal\)/.test(r.note)) fail(`(a) the note gives, per qualifying question, how many candidates are legible and how many by a signal (got ${r.note})`);
    if (r.met !== 2 || r.of !== 2) fail(`(a) met 2 of 2 in-scope candidates (the out-of-scope route is no member; got ${r.met} of ${r.of})`);

    // (b) the twin: not determinable from the tree
    r = read(channels(with_({ received_or_gone: nd }), with_({}), {}), two);
    if (r.status !== 'mixed' || r.met !== 1 || r.of !== 2) fail(`(b) a candidate whose reversibility no reader could determine, beside one whose facts are stated, reads mixed 1 of 2 (got ${r.status} ${r.met} of ${r.of}: ${r.note})`);
    if (!r.note.includes(`"${A}" (src/sync.mjs:3 +1) received_or_gone not determinable`)) fail(`(b) the gap cites the candidate at its file:line and names the question (got ${r.note})`);
    if (!Array.isArray(r.gaps) || r.gaps.length !== 1 || r.gaps[0].candidate !== A || r.gaps[0].question !== 'received_or_gone') fail(`(b) the row carries the one gap, its candidate and question (got ${JSON.stringify(r.gaps)})`);
    if (JSON.stringify(r.findings) !== JSON.stringify(['F-101'])) fail(`(b) the row lists the effect finding the gap's candidate maps to, never the legible one's (got ${JSON.stringify(r.findings)})`);
    const both = read(channels(with_({ received_or_gone: nd }), with_({ refuses_unless: nd }), {}), two);
    if (both.status !== 'unmet' || both.met !== 0 || both.of !== 2) fail(`(b) with every in-scope candidate a gap the row reads unmet, 0 of 2 (got ${both.status} ${both.met} of ${both.of}: ${both.note})`);
    // a signal makes the question legible whatever the lane answered
    r = read(channels(with_({}), with_({ refuses_unless: nd }), { signalsB: sigB }), two);
    if (r.status !== 'met') fail(`(b) a not-determinable answer on a question a signal carries is legible by construction (got ${r.status}: ${r.note})`);

    // (c) a question absent from the bar moves nothing
    r = read(channels(with_({ received_or_gone: nd, window: nd, declared_scope: nd }), with_({})), onlyRefuses);
    if (r.status !== 'met') fail(`(c) not-determinable answers on questions the bar does not list are never read (got ${r.status}: ${r.note})`);
    if (/received_or_gone|window|declared_scope/.test(r.note)) fail(`(c) the note names only the qualifying questions (got ${r.note})`);

    // (d) no qualifying question
    r = read(channels(with_({ received_or_gone: nd }), with_({})), none);
    if (r.status !== 'not-measured' || !/no checklist question has cleared the cross-target bar/.test(r.note)) fail(`(d) with no qualifying question the row reads not measured, saying "no checklist question has cleared the cross-target bar" (got ${r.status}: ${r.note})`);
    r = read(channels(with_({}), with_({})), none);
    if (r.status === 'met') fail(`(d) with no qualifying question a fully answered run never reads met (got ${r.status})`);

    // (e) a run without answers
    r = read(channels(null, null, { version: 1 }), two);
    if (r.status !== 'not-measured' || !/carries no answers to the checklist/.test(r.note)) fail(`(e) a version 1 triage reads not measured, saying it carries no answers (got ${r.status}: ${r.note})`);
    r = read({ ...channels(null, null), triage: null }, two);
    if (r.status !== 'not-measured' || !/wrote no triage/.test(r.note)) fail(`(e) a run with no triage reads not measured, naming the lane (got ${r.status}: ${r.note})`);
    r = read({ candidates: null, triage: null, errors: [] }, two);
    if (r.status !== 'not-measured' || !/effect population not closed/.test(r.note)) fail(`(e) a run with no candidate list reads not measured (got ${r.status}: ${r.note})`);

    // (f) the consequence rule
    const valued = (fs, ids) => {
      const measurement = [{ id: ROW, status: 'unmet', findings: ids }];
      const idx = consequenceIndex({ decided: fs.map((f) => ({ f, source: 'practice-review' })), measurement, yardstick: reg });
      return Object.fromEntries(fs.map((f) => [f.id, consequenceOf({ f, source: 'practice-review' }, idx)]));
    };
    const sig = effect('F-201', { reversibility: 'irreversible', gate_type: 'deterministic-halt', fail_mode: 'closed' }), rev = effect('F-202'), doc = { id: 'F-203', dimension: 'artifact-legibility', polarity: 'gap', subject_type: 'artifact', severity: 'Medium', confidence: 'confirmed', observation: 'a page', evidence: ['README.md:1'] };
    let c = valued([sig, rev, doc], ['F-201', 'F-202', 'F-203']);
    if (c['F-201'].value !== 'significant') fail(`(f) a legibility gap on an irreversible effect reads significant by its own facts, never cosmetic (got ${c['F-201'].value} by ${c['F-201'].rule})`);
    if (c['F-202'].value !== 'contained' || c['F-202'].rule !== 'legibility-gap-on-effect') fail(`(f) a legibility gap on a reversible internal effect reads contained by legibility-gap-on-effect, not cosmetic by its tier (got ${c['F-202'].value} by ${c['F-202'].rule})`);
    if (c['F-203'].value !== 'cosmetic' || c['F-203'].rule !== 'legibility-row') fail(`(f) a legibility gap on no effect still reads cosmetic by legibility-row (got ${c['F-203'].value} by ${c['F-203'].rule})`);
    const swapped = valued([sig, rev, doc].map((f) => ({ ...f, severity: f.severity === 'Medium' ? 'Blocker' : 'Medium' })), ['F-201', 'F-202', 'F-203']);
    for (const id of ['F-201', 'F-202', 'F-203']) if (swapped[id].value !== c[id].value || swapped[id].rule !== c[id].rule) fail(`(f) swapping ${id}'s severity label moves nothing (the row names no halt_at): ${c[id].value} by ${c[id].rule} became ${swapped[id].value} by ${swapped[id].rule}`);
    if (d.halt_at !== undefined) fail(`(f) ${ROW} names no halt_at, so a label moves nothing on it`);

    // (g) renaming every scanner changes no reading
    const rename = (s) => `renamed-${s.split('').reverse().join('')}`;
    const renamedAdapters = Object.fromEntries(Object.entries(adapters).map(([id, a]) => [rename(id), { ...a, scanner: rename(id) }]));
    const renamedManifest = { scanners: manifest.scanners.map((x) => ({ ...x, scanner: rename(x.scanner) })) };
    for (const [label_, ch] of [['met', channels(with_({}), with_({}))], ['a gap', channels(with_({ received_or_gone: nd }), with_({}))], ['no triage', { ...channels(null, null), triage: null }]]) {
      const before = read(ch, two), after = read(ch, two, { adapters: renamedAdapters, manifest: renamedManifest });
      const strip = (x) => JSON.stringify({ status: x.status, findings: x.findings, gaps: x.gaps, note: x.note.split(lanes[0] || '\u0000').join('<lane>').split(rename(lanes[0] || '')).join('<lane>') });
      if (strip(before) !== strip(after)) fail(`(g) renaming every scanner changes no reading of the row (${label_}): ${strip(before)} became ${strip(after)}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
