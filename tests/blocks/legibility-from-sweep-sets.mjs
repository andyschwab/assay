// ── where blind lanes over this run's tree part on a qualifying question, d-effect-facts-legible reads
// the candidate as a gap, whatever this run's own lane answered (#338, third slice; map/sweep-partings.mjs;
// yardstick/README.md, "An effect's facts, legible") ──
// A run's lane answers each in-scope candidate's checklist once. A sweep set is several blind lanes over
// one target at one commit; where they read a candidate two ways on a question, a gap and legible, the
// tree does not state the fact where a reader finds it. `compile --sweep-set` hands the measurement those
// pairs when the set is about the run's tree, and records every set it was given in the run record.
// Held over runs and sets built here from the public flawed-webapp set (tests/sweeps/flawed-webapp-2026-11-15):
//   (a) a run whose lane answered person_act no on "route: POST /sync", compiled with a set over the same
//       target and commit whose lanes part on it (not-determinable against no), reads that candidate a gap,
//       mixed 6 of 7, citing the candidate at its file:line and naming the set and each sweep's reading,
//       its triage untouched; with the committed set, whose lanes part on every candidate, it reads unmet;
//   (b) the same run compiled with a set over another target, or at another commit, reads exactly as
//       without the set, and the run record names the set as not read, with the reason;
//   (c) a parting yes against no (both stated) never adds a gap;
//   (d) a parting on a question below the bar never adds a gap;
//   (e) a candidate the run's own answer reads as a gap and the set parts on is one gap, both sources named;
//   (f) a set that cannot be read stops compile, naming why, and writes nothing to the run record;
//   (g) the run record carries the set's digest; a later compile without the flag reads the same, and one
//       after the set moved is refused;
//   (h) renaming every scanner, adapter and run-record row alike, changes no reading.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { loadBar } from '../../yardstick/legibility-bar.mjs';
import { loadAdapters, loadFindings, loadManifest, loadScannerCoverage } from '../../map/project.mjs';
import { loadChannelFiles } from '../../map/effect-triage.mjs';
import { computeCandidateAgreement } from '../../map/variance.mjs';
import { readSetForRun, setDigest } from '../../map/sweep-partings.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'legibility-from-sweep-sets';

const ROW = 'd-effect-facts-legible';
const SRC = join(HERE, 'sweeps', 'flawed-webapp-2026-11-15');
const SET_NAME = 'flawed-webapp-2026-11-15';
const REPO = 'https://github.com/andyschwab/assay-fixtures';
const PATH = 'targets/flawed-webapp';
const COMMIT = '7f7c89d823153c702c207b1f36c6c2ce26217ceb';
const SYNC = 'route: POST /sync';
const LANE_OF_RECORD = Object.entries(loadAdapters()).find(([, a]) => a.lane && a.adopted !== false && !a.retired && (a.lane_decides || []).includes('facet'))[0];

// a run: one committed sweep, stating its target and the commit its lane reviewed
function makeRun(dir, sweep) {
  cpSync(join(SRC, sweep), dir, { recursive: true });
  const p = join(dir, 'map', 'scanners.yaml');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^scanners:$/m, `identity:\n  repository: "${REPO}"\n  path: "${PATH}"\nscanners:`));
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'record', dir, LANE_OF_RECORD, 'ran', '--head', COMMIT], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`record --head failed: ${r.stderr}`);
}
// a set: named sweeps (or copies), its SWEEP.yaml stating identity and commit
function makeSet(dir, sweeps, { repo = REPO, path = PATH, commit = COMMIT } = {}) {
  mkdirSync(dir, { recursive: true });
  sweeps.forEach((s, i) => cpSync(typeof s === 'string' ? join(SRC, s) : s.dir, join(dir, `sweep-${i + 1}`), { recursive: true }));
  writeFileSync(join(dir, 'SWEEP.yaml'), `target: "built from the public flawed-webapp set"\nidentity:\n  repository: "${repo}"\n  path: "${path}"\ntarget_commit: "${commit}"\nmethod_commit: "fixture"\ndate: "2026-11-15"\nblind: true\nthreshold:\n  fact_presence: 1\n  candidate_agreement: 1\n  descriptor_agreement: 1\n  requirement_agreement: 1\nsweeps: [${sweeps.map((_, i) => `sweep-${i + 1}`).join(', ')}]\n`);
}
// one candidate's answer on one question, rewritten in a copy of a sweep
function answerIn(sweepDir, candidate, question, from, to) {
  const p = join(sweepDir, 'map', 'effect-triage.yaml');
  const text = readFileSync(p, 'utf8');
  const at = text.indexOf(`candidate: "${candidate}"`), next = text.indexOf('  - candidate:', at + 1);
  const block = text.slice(at, next < 0 ? undefined : next);
  const was = `      ${question}:\n        answer: ${from}`;
  if (block.split(was).length !== 2) throw new Error(`${candidate}'s ${question} is answered ${from} once (the committed set moved)`);
  writeFileSync(p, text.slice(0, at) + block.replace(was, `      ${question}:\n        answer: ${to}`) + (next < 0 ? '' : text.slice(next)));
}

export async function run() {
  const fail = (m) => negFailures.push('legibility-from-sweep-sets: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-legibility-sets-'));
  const compile = (dir, ...sets) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', dir, ...sets.flatMap((s) => ['--sweep-set', s])], { encoding: 'utf8' });
  const rowOf = (dir) => (parseYaml(readFileSync(join(dir, 'yardstick.yaml'), 'utf8')).requirements || []).find((r) => r.id === ROW);
  const recordOf = (dir) => loadManifest(dir).sweep_sets;
  const compiled = (dir, ...sets) => { const c = compile(dir, ...sets); if (c.status !== 0) { fail(`compile ${sets.length ? `--sweep-set ${sets.join(' ')}` : 'with no set'} succeeds (exit ${c.status}): ${(c.stderr + c.stdout).split('\n').filter((l) => /✗|•/.test(l)).join(' | ').slice(0, 600)}`); return null; } return rowOf(dir); };
  try {
    // the parted set: sweep-2 as it is, and a copy whose lane could not determine POST /sync's person_act
    const opaque = join(tmp, 'sweep-2-opaque');
    cpSync(join(SRC, 'sweep-2'), opaque, { recursive: true });
    answerIn(opaque, SYNC, 'person_act', 'no', 'not-determinable');
    const parted = join(tmp, 'set-parted');
    makeSet(parted, ['sweep-2', { dir: opaque }]);

    // (a) the run: sweep-2, whose lane answered person_act no on POST /sync
    const a = join(tmp, 'run-a');
    makeRun(a, 'sweep-2');
    const triageBefore = readFileSync(join(a, 'map', 'effect-triage.yaml'), 'utf8');
    if (!/candidate: "route: POST \/sync"[\s\S]*?person_act:\n        answer: no\n        evidence: \[/.test(triageBefore)) fail(`(a) the run's lane answers ${SYNC}'s person_act no with evidence (the committed sweep moved)`);
    const plain = compiled(a);
    if (plain && (plain.status !== 'met' || plain.met !== 7 || plain.of !== 7)) fail(`(a) without a set the run reads met 7 of 7 (got ${plain.status} ${plain.met} of ${plain.of})`);
    const plainFile = existsSync(join(a, 'yardstick.yaml')) ? readFileSync(join(a, 'yardstick.yaml'), 'utf8') : '';
    const ra = compiled(a, parted);
    if (ra) {
      if (ra.status !== 'mixed' || ra.met !== 6 || ra.of !== 7) fail(`(a) a parting on ${SYNC}'s person_act reads the candidate a gap: mixed 6 of 7 (got ${ra.status} ${ra.met} of ${ra.of})`);
      const cite = `"${SYNC}" (server.mjs:47) person_act read two ways: the blind lanes of sweep set set-parted part on it (legible / gap)`;
      if (!String(ra.note).includes(cite)) fail(`(a) the gap cites the candidate at its file:line, the set and each sweep's reading (want ${JSON.stringify(cite)} in ${JSON.stringify(ra.note)})`);
      if (!String(ra.note).includes('1 gap(s) (0 from this run\'s own answers, 1 from a parting in a sweep set, 0 from both)')) fail(`(a) the note counts the gap's source (got ${JSON.stringify(ra.note)})`);
      if (JSON.stringify(ra.findings) !== JSON.stringify(['F-402'])) fail(`(a) the row lists the gap's effect finding and only it (got ${JSON.stringify(ra.findings)})`);
      if (JSON.stringify(ra.sweep_sets) !== JSON.stringify(['set-parted'])) fail(`(a) the row names the set its gap rests on (got ${JSON.stringify(ra.sweep_sets)})`);
    }
    if (readFileSync(join(a, 'map', 'effect-triage.yaml'), 'utf8') !== triageBefore) fail('(a) the lane\'s triage stays as it wrote it');
    const owner = existsSync(join(a, 'OWNER.md')) ? readFileSync(join(a, 'OWNER.md'), 'utf8') : '';
    if (!/Where: `server\.mjs:47-49`[^\n]*, sweep set `set-parted`\./.test(owner)) fail('(a) OWNER.md names the set after the gap\'s places, "Where: …, sweep set `set-parted`."');
    const axes = existsSync(join(a, 'views', 'improve', 'axes.md')) ? readFileSync(join(a, 'views', 'improve', 'axes.md'), 'utf8') : '';
    if (!axes.includes(`- ${ROW} _(mixed)_ — Every effect's facts are stated where a reader or a machine finds them (evidence: sweep set \`set-parted\`)`)) fail('(a) the Improve walk names the set beside the row, "(evidence: sweep set `set-parted`)"');
    const rc = compiled(a, SRC);
    if (rc && (rc.status !== 'unmet' || rc.met !== 0 || rc.of !== 7)) fail(`(a) with the committed set, whose lanes part on every candidate, the run reads unmet 0 of 7 (got ${rc.status} ${rc.met} of ${rc.of})`);

    // (b) another target, another commit: read for nothing, the run record says why
    for (const [name, opts, why] of [['set-other-target', { repo: 'https://github.com/andyschwab/assay' , path: '.' }, /^another target: the set swept https:\/\/github\.com\/andyschwab\/assay, the run measured https:\/\/github\.com\/andyschwab\/assay-fixtures#targets\/flawed-webapp$/],
      ['set-other-commit', { commit: 'a17104d714ec76259e6d793954371885965f784a' }, /^another commit: the set swept a17104d714ec76259e6d793954371885965f784a, the run measured 7f7c89d823153c702c207b1f36c6c2ce26217ceb$/]]) {
      const dir = join(tmp, name);
      makeSet(dir, ['sweep-2', { dir: opaque }], opts);
      const c = compile(a, dir);
      if (c.status !== 0) { fail(`(b) compile --sweep-set ${name} succeeds (exit ${c.status})`); continue; }
      if (readFileSync(join(a, 'yardstick.yaml'), 'utf8') !== plainFile) fail(`(b) with ${name} the measurement reads exactly as without the set`);
      const rec = recordOf(a);
      if (!Array.isArray(rec) || rec.length !== 1 || rec[0].read !== false || !why.test(String(rec[0].reason))) fail(`(b) the run record names ${name} as not read, with the reason (got ${JSON.stringify(rec)})`);
      if (!c.stdout.includes(`sweep set ${name} not read for ${ROW}: `)) fail(`(b) compile says ${name} was not read`);
    }

    // (c) yes against no: the raw answers part, both are stated, and no gap is added
    const yes = join(tmp, 'sweep-2-yes');
    cpSync(join(SRC, 'sweep-2'), yes, { recursive: true });
    answerIn(yes, SYNC, 'person_act', 'no', 'yes');
    const yesSet = join(tmp, 'set-yes-no');
    makeSet(yesSet, ['sweep-2', { dir: yes }]);
    const raw = computeCandidateAgreement([join(yesSet, 'sweep-1'), join(yesSet, 'sweep-2')]).answers.divergences;
    if (!raw.some((d) => d.candidate === SYNC && d.answers.some((x) => x.key === 'person_act'))) fail(`(c) the set's raw answers part on ${SYNC}'s person_act (yes against no), so the case is real`);
    const rcy = compiled(a, yesSet);
    if (rcy && (rcy.status !== 'met' || rcy.met !== 7 || rcy.sweep_sets)) fail(`(c) a parting yes against no adds no gap: met 7 of 7 (got ${rcy.status} ${rcy.met} of ${rcy.of}, sweep_sets ${JSON.stringify(rcy.sweep_sets)})`);

    // (d) a question below the bar: the same parting, read against a bar that does not list person_act
    const shipped = loadBar();
    // the shipped bar's qualifying questions, person_act moved below it with a figure that does not clear it
    const entry = (x, agreement, agree) => `  - question: ${x.question}\n    agreement: ${agreement}\n    agree: ${agree}\n    of: ${x.of}\n    targets: [${x.targets.map((t) => JSON.stringify(t)).join(', ')}]\n    sets: [${x.sets.join(', ')}]\n    per_target:\n${x.per_target.map((t) => `      - { target: ${JSON.stringify(t.target)}, agreement: ${agreement === x.agreement ? t.agreement : 0}, agree: ${agreement === x.agreement ? t.agree : 0}, of: ${t.of} }`).join('\n')}\n    reason: "stated by the test"`;
    const qs = shipped.doc.questions, pa = qs.find((x) => x.question === 'person_act');
    if (!pa) fail('(d) the shipped bar lists person_act as qualifying (the bar moved)');
    else {
      const keep = qs.filter((x) => x !== pa);
      const under = (x) => x.per_target.some((t) => t.agreement < shipped.bar);
      const barFile = join(tmp, 'bar-without-person_act.yaml');
      writeFileSync(barFile, `schema: assay.legibility-bar\nversion: 1\nbar: ${shipped.bar}\nbar_reason: "stated by the test"\ntargets_at_least: ${shipped.targetsAtLeast}\ntargets_reason: "stated by the test"\nsets:\n${shipped.doc.sets.map((x) => `  - { set: ${x.set}, target: ${JSON.stringify(x.target)}, reason: "stated by the test" }`).join('\n')}\nquestions:\n${keep.map((x) => entry(x, x.agreement, x.agree)).join('\n')}\nbelow_bar:\n${entry(pa, 0, 0)}\nper_target_drops: [${keep.filter(under).map((x) => x.question).join(', ')}]\n`);
      let below = null;
      try { below = loadBar(barFile); } catch (e) { fail(`(d) the bar stated without person_act loads: ${e.message.slice(0, 300)}`); }
      if (below) {
        if (below.qualifying.includes('person_act')) fail('(d) the stated bar does not list person_act');
        const m = loadManifest(a);
        const read = (bar, sets) => measureRun({ findings: loadFindings(a), manifest: m, inputs: null, coverage: loadScannerCoverage(a), channels: loadChannelFiles(a), legibilityBar: bar, sweepSets: sets }, loadYardstick()).find((r) => r.id === ROW);
        const sets = [readSetForRun(parted, m)];
        const under = read(below, sets), over = read(shipped, sets);
        if (under.status !== 'met' || under.met !== 7) fail(`(d) a parting on a question below the bar adds no gap: met 7 of 7 (got ${under.status} ${under.met} of ${under.of})`);
        if (over.status !== 'mixed' || over.met !== 6) fail(`(d) the same parting on a qualifying question is a gap: mixed 6 of 7 (got ${over.status} ${over.met} of ${over.of})`);

        // (h) renaming every scanner changes no reading
        const rename = (s) => `renamed-${s.split('').reverse().join('')}`;
        const adapters = loadAdapters();
        const rA = Object.fromEntries(Object.entries(adapters).map(([id, x]) => [rename(id), { ...x, scanner: rename(id) }]));
        const rM = { ...m, scanners: Object.fromEntries(Object.entries(m.scanners).map(([id, x]) => [rename(id), x])) };
        const rSets = [readSetForRun(parted, rM)];
        const before = measureRun({ findings: loadFindings(a), manifest: m, inputs: null, coverage: {}, adapters, channels: loadChannelFiles(a), sweepSets: sets }, loadYardstick()).find((r) => r.id === ROW);
        const after = measureRun({ findings: loadFindings(a), manifest: rM, inputs: null, coverage: {}, adapters: rA, channels: loadChannelFiles(a), sweepSets: rSets }, loadYardstick()).find((r) => r.id === ROW);
        const strip = (x) => JSON.stringify({ status: x.status, met: x.met, of: x.of, findings: x.findings, sweep_sets: x.sweep_sets, note: x.note });
        if (rSets[0].read !== true) fail(`(h) with every scanner renamed the set is still read (got ${JSON.stringify(rSets[0].reason)})`);
        if (strip(before) !== strip(after)) fail(`(h) renaming every scanner changes no reading: ${strip(before)} became ${strip(after)}`);
      }
    }

    // (e) both sources: sweep-1 reads the parted pairs as gaps of its own; the committed set parts on them
    const e = join(tmp, 'run-e');
    makeRun(e, 'sweep-1');
    const own = compiled(e), both = compiled(e, SRC);
    if (own && both) {
      if (!String(both.note).includes('9 gap(s) (0 from this run\'s own answers, 0 from a parting in a sweep set, 9 from both)')) fail(`(e) a pair both read is one gap with both sources: 9 from both (got ${JSON.stringify(both.note.slice(0, 900))})`);
      const count = (n) => Number((String(n).match(/; (\d+) gap\(s\)/) || [])[1]);
      if (count(own.note) !== 9 || count(both.note) !== 9) fail(`(e) the gaps are counted once, with or without the set: 9 and 9 (got ${count(own.note)} and ${count(both.note)})`);
      if (!String(both.note).includes(`"${SYNC}" (server.mjs:47) person_act not determinable, and the blind lanes of sweep set ${SET_NAME} part on it (gap / legible / gap)`)) fail('(e) the gap names both sources: the run\'s not-determinable and the set\'s parting');
      if (both.status !== own.status || both.met !== own.met) fail(`(e) the row reads as its own gaps do (${own.status} ${own.met} of ${own.of}), got ${both.status} ${both.met} of ${both.of}`);
    }

    // (f) a set that cannot be read stops compile, naming why
    const f = join(tmp, 'run-f');
    makeRun(f, 'sweep-2');
    const recordBefore = readFileSync(join(f, 'map', 'scanners.yaml'), 'utf8');
    const noSweep = join(tmp, 'set-no-sweep-yaml');
    makeSet(noSweep, ['sweep-1', 'sweep-2']);
    rmSync(join(noSweep, 'SWEEP.yaml'));
    const badId = join(tmp, 'set-bad-identity');
    makeSet(badId, ['sweep-1', 'sweep-2'], { path: '../elsewhere' });
    for (const [dir, why] of [[noSweep, /✗ sweep set refused: sweep set \S+ cannot be read: no SWEEP\.yaml/], [badId, /✗ sweep set refused: sweep set \S+ cannot be read: SWEEP\.yaml identity\.path/]]) {
      const c = compile(f, dir);
      if (c.status !== 1 || !why.test(c.stderr)) fail(`(f) a set that cannot be read stops compile (exit 1), naming why (got exit ${c.status}: ${c.stderr.slice(0, 300)})`);
    }
    if (readFileSync(join(f, 'map', 'scanners.yaml'), 'utf8') !== recordBefore) fail('(f) a refused set writes nothing to the run record');

    // (g) the record's digest: a later compile without the flag reads the same; a moved set is refused
    const g = join(tmp, 'run-g');
    makeRun(g, 'sweep-2');
    const gSet = join(tmp, 'set-g');
    makeSet(gSet, ['sweep-2', { dir: opaque }]);
    const first = compiled(g, gSet);
    const rec = recordOf(g);
    if (!Array.isArray(rec) || rec.length !== 1 || rec[0].sha256 !== setDigest(gSet, ['sweep-1', 'sweep-2']) || rec[0].read !== true) fail(`(g) the run record names the set read, with its digest (got ${JSON.stringify(rec)})`);
    const firstFile = readFileSync(join(g, 'yardstick.yaml'), 'utf8');
    const again = compiled(g);
    if (first && again && readFileSync(join(g, 'yardstick.yaml'), 'utf8') !== firstFile) fail('(g) a later compile without the flag reads the same measurement');
    if (again && again.status !== 'mixed') fail(`(g) a later compile without the flag still reads the set's gap: mixed (got ${again.status})`);
    writeFileSync(join(gSet, 'SWEEP.yaml'), readFileSync(join(gSet, 'SWEEP.yaml'), 'utf8') + '# moved\n');
    const moved = compile(g);
    if (moved.status === 0 || !/changed since the run record named it/.test(moved.stderr + moved.stdout)) fail(`(g) a set whose digest moved since the record named it is refused (got exit ${moved.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
