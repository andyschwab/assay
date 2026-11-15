// ── a sweep set's partings carry forward to a later run of the same target where every file they rest
// on is unchanged (#338, fourth slice; map/sweep-partings.mjs, the carry rule; yardstick/README.md, "An
// effect's facts, legible") ──
// A sweep is expensive and a routine runs at every commit, so a set at commit A is read by a run at
// commit B of the same target by a second, stricter path: a parted pair stands at B only when its
// candidate is listed in B's enumeration exactly as enumerate writes it, and every file the parting
// rests on (the candidate's cited file, and each file any sweep's answer on that question cites) is
// byte-identical at A and B, read from the target's own git by object id. Never a guess.
// Held over a small public-shaped target built here as a git repository (the files the public
// flawed-webapp set cites, under its identity path), and runs and sets built from that set:
//   (a) A to B, every cited file unchanged: the parting carries; the gap names the set, "carried from
//       <A> to <B>, evidence unchanged" and each sweep's reading; the note counts it as carried; the
//       run record keeps the object ids compared;
//   (b) the candidate's cited file changed between A and B: not carried, the record names the file;
//   (c) only a file an answer cites as evidence changed: not carried, the record names that file;
//   (d) the candidate is no longer listed at B: not carried;
//   (e) no --target, a --target that is not a git checkout, a shallow history, commit A absent: not
//       read, each with its own no_carry reason, the row exactly as without the set;
//   (f) a later compile without the checkout reads the same from the record; a record whose object ids
//       disagree with the checkout is refused;
//   (g) a set at the run's own commit, compiled with a checkout, reads exactly as #346 reads it;
//   (h) renaming every scanner, adapter and run-record row alike, changes no reading.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { loadAdapters, loadFindings, loadManifest } from '../../map/project.mjs';
import { loadChannelFiles } from '../../map/effect-triage.mjs';
import { readSetForRun } from '../../map/sweep-partings.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'legibility-carried-forward';

const ROW = 'd-effect-facts-legible';
const SRC = join(HERE, 'sweeps', 'flawed-webapp-2026-11-15');
const REPO = 'https://github.com/andyschwab/assay-fixtures';
const PATH = 'targets/flawed-webapp';
const SYNC = 'route: POST /sync';
const LANE_OF_RECORD = Object.entries(loadAdapters()).find(([, a]) => a.lane && a.adopted !== false && !a.retired && (a.lane_decides || []).includes('facet'))[0];
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

// every target path the committed set cites (path:line), so validate --target finds each inside its file
function citedPaths() {
  const out = new Set();
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else for (const m of readFileSync(p, 'utf8').matchAll(/([A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z]+):\d+/g)) if (!m[1].startsWith('map/')) out.add(m[1]); } };
  walk(SRC);
  return [...out].sort();
}
const body = (p, mark = '') => Array.from({ length: 200 }, (_, i) => `// ${p} line ${i + 1}${mark}`).join('\n') + '\n';

// a run: one committed sweep, stating its target and the commit its lane reviewed
function makeRun(dir, sweep, head) {
  cpSync(join(SRC, sweep), dir, { recursive: true });
  const p = join(dir, 'map', 'scanners.yaml');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^scanners:$/m, `identity:\n  repository: "${REPO}"\n  path: "${PATH}"\nscanners:`));
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'record', dir, LANE_OF_RECORD, 'ran', '--head', head], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`record --head failed: ${r.stderr}`);
}
function makeSet(dir, sweeps, commit) {
  mkdirSync(dir, { recursive: true });
  sweeps.forEach((s, i) => cpSync(typeof s === 'string' ? join(SRC, s) : s.dir, join(dir, `sweep-${i + 1}`), { recursive: true }));
  writeFileSync(join(dir, 'SWEEP.yaml'), `target: "built from the public flawed-webapp set"\nidentity:\n  repository: "${REPO}"\n  path: "${PATH}"\ntarget_commit: "${commit}"\nmethod_commit: "fixture"\ndate: "2026-11-15"\nblind: true\nthreshold:\n  fact_presence: 1\n  candidate_agreement: 1\n  descriptor_agreement: 1\n  requirement_agreement: 1\nsweeps: [${sweeps.map((_, i) => `sweep-${i + 1}`).join(', ')}]\n`);
}
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
  const fail = (m) => negFailures.push('legibility-carried-forward: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-legibility-carry-'));
  const compile = (dir, { sets = [], target = null } = {}) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', dir, ...sets.flatMap((s) => ['--sweep-set', s]), ...(target ? ['--target', target] : [])], { encoding: 'utf8' });
  const yard = (dir) => readFileSync(join(dir, 'yardstick.yaml'), 'utf8');
  const rowOf = (dir) => (parseYaml(yard(dir)).requirements || []).find((r) => r.id === ROW);
  const recordOf = (dir) => loadManifest(dir).sweep_sets;
  const compiled = (dir, opts = {}) => { const c = compile(dir, opts); if (c.status !== 0) { fail(`compile ${JSON.stringify(opts)} succeeds (exit ${c.status}): ${(c.stderr + c.stdout).split('\n').filter((l) => /✗|•/.test(l)).join(' | ').slice(0, 600)}`); return null; } return rowOf(dir); };
  try {
    // ── the target: A, then B (only a file nothing cites moves), C (the candidate's cited file moves),
    // D (only a file an answer on the question cites moves) ──
    const repo = join(tmp, 'target-repo'), root = join(repo, PATH);
    for (const p of citedPaths()) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), body(p)); }
    writeFileSync(join(root, 'NOTES.txt'), 'nothing cites this file\n');
    git(tmp, 'init', '-q', repo);
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'A');
    const A = git(repo, 'rev-parse', 'HEAD');
    writeFileSync(join(root, 'NOTES.txt'), 'nothing cites this file, edited\n');
    git(repo, 'commit', '-q', '-am', 'B'); const B = git(repo, 'rev-parse', 'HEAD');
    writeFileSync(join(root, 'server.mjs'), body('server.mjs', ' (moved)'));
    git(repo, 'commit', '-q', '-am', 'C'); const C = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', B);
    writeFileSync(join(root, 'lib/auth.mjs'), body('lib/auth.mjs', ' (moved)'));
    git(repo, 'commit', '-q', '-am', 'D'); const D = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', B);
    const T = root;   // --target: the target's own root, a subdirectory of its repository
    const blobAt = (c, p) => git(repo, 'rev-parse', `${c}:${PATH}/${p}`);

    // the parted set at A: sweep-2 as it is, and a copy whose lane could not determine POST /sync's person_act
    const opaque = join(tmp, 'sweep-2-opaque');
    cpSync(join(SRC, 'sweep-2'), opaque, { recursive: true });
    answerIn(opaque, SYNC, 'person_act', 'no', 'not-determinable');
    const setA = join(tmp, 'set-carried');
    makeSet(setA, ['sweep-2', { dir: opaque }], A);
    // the files the parting rests on: the candidate's cited file, and each file an answer on person_act cites
    const triage2 = parseYaml(readFileSync(join(SRC, 'sweep-2', 'map', 'effect-triage.yaml'), 'utf8')).triage.find((x) => x.candidate === SYNC);
    const evid = (triage2.answers.person_act.evidence || []).map((e) => String(e).replace(/:\d+(?:-\d+)?$/, ''));
    const RESTS = [...new Set(['server.mjs', ...evid])].sort();
    if (!evid.includes('lib/auth.mjs')) fail(`the set's answer on ${SYNC}'s person_act cites lib/auth.mjs as evidence (the committed set moved; got ${JSON.stringify(evid)})`);
    if (loadChannelFiles(join(SRC, 'sweep-2')).files.get(SYNC)?.join() !== 'server.mjs') fail(`${SYNC} is cited at server.mjs alone in the set's list (the committed set moved)`);

    // (a) A to B, nothing the parting rests on moved: carried
    const runB = join(tmp, 'run-b');
    makeRun(runB, 'sweep-2', B);
    const plain = compiled(runB);
    if (plain && (plain.status !== 'met' || plain.met !== 7)) fail(`(a) without a set the run reads met 7 of 7 (got ${plain.status} ${plain.met} of ${plain.of})`);
    const plainB = yard(runB);
    const ra = compiled(runB, { sets: [setA], target: T });
    if (ra) {
      if (ra.status !== 'mixed' || ra.met !== 6 || ra.of !== 7) fail(`(a) a parting at A whose files are unchanged at B carries: mixed 6 of 7 (got ${ra.status} ${ra.met} of ${ra.of})`);
      const cite = `"${SYNC}" (server.mjs:47) person_act read two ways: the blind lanes of sweep set set-carried part on it (legible / gap), carried from ${A.slice(0, 7)} to ${B.slice(0, 7)}, evidence unchanged`;
      if (!String(ra.note).includes(cite)) fail(`(a) the carried gap names the set, the carry and each sweep's reading (want ${JSON.stringify(cite)} in ${JSON.stringify(ra.note)})`);
      if (!String(ra.note).includes('1 gap(s) (0 from this run\'s own answers, 0 from a parting in a sweep set, 1 carried from a parting in a sweep set at another commit, 0 from both)')) fail(`(a) the note counts the gap as carried (got ${JSON.stringify(ra.note)})`);
      if (JSON.stringify(ra.sweep_sets) !== JSON.stringify(['set-carried'])) fail(`(a) the row names the set its gap rests on (got ${JSON.stringify(ra.sweep_sets)})`);
    }
    const recA = recordOf(runB);
    const wantBlobs = RESTS.map((p) => ({ path: p, blob: blobAt(A, p) }));
    if (!Array.isArray(recA) || recA.length !== 1 || recA[0].read !== true || recA[0].reason !== undefined || !Array.isArray(recA[0].carried) || recA[0].carried.length !== 1 || recA[0].carried[0].candidate !== SYNC || recA[0].carried[0].question !== 'person_act' || JSON.stringify(recA[0].carried[0].blobs) !== JSON.stringify(wantBlobs) || JSON.stringify(recA[0].not_carried) !== '[]') fail(`(a) the run record keeps the carried pair with the object ids compared, ${JSON.stringify(wantBlobs)} (got ${JSON.stringify(recA)})`);
    if (wantBlobs.some((b) => b.blob !== blobAt(B, b.path))) fail('(a) the fixture holds every file the parting rests on unchanged from A to B');
    const carriedB = existsSync(join(runB, 'yardstick.yaml')) ? yard(runB) : '';

    // (f) a later compile without the checkout reads the same from the record; a record whose ids
    // disagree with the checkout is refused
    compiled(runB);
    if (yard(runB) !== carriedB) fail('(f) a later compile without the checkout reads the same measurement from the record');
    compiled(runB, { target: T });
    if (yard(runB) !== carriedB) fail('(f) a later compile with the checkout reads the same measurement');
    const scP = join(runB, 'map', 'scanners.yaml'), scText = readFileSync(scP, 'utf8');
    const realBlob = blobAt(A, 'server.mjs'), fakeBlob = realBlob.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    writeFileSync(scP, scText.replace(`blob: "${realBlob}"`, `blob: "${fakeBlob}"`));
    const tampered = compile(runB, { target: T });
    if (tampered.status === 0 || !(tampered.stderr + tampered.stdout).includes(`"${SYNC}" person_act rests on server.mjs, recorded as object ${fakeBlob}, which the checkout reads as ${realBlob}`)) fail(`(f) a record whose object ids disagree with the checkout is refused, naming the file (got exit ${tampered.status}: ${(tampered.stderr + tampered.stdout).split('\n').filter((l) => /•|✗/.test(l)).join(' | ').slice(0, 400)})`);
    writeFileSync(scP, scText);

    // (b) the candidate's cited file moved (A to C), (c) only an answer's evidence file moved (A to D)
    for (const [tag, head, moved] of [['(b)', C, 'server.mjs'], ['(c)', D, 'lib/auth.mjs']]) {
      const dir = join(tmp, `run-moved-${tag[1]}`);
      makeRun(dir, 'sweep-2', head);
      compiled(dir);
      const before = yard(dir);
      const c = compile(dir, { sets: [setA], target: T });
      if (c.status !== 0) { fail(`${tag} compile succeeds (exit ${c.status}): ${c.stderr.slice(0, 300)}`); continue; }
      if (yard(dir) !== before) fail(`${tag} with ${moved} moved the parting is not carried: the row reads exactly as without the set`);
      const rec = recordOf(dir);
      const want = JSON.stringify([{ candidate: SYNC, question: 'person_act', moved: [moved] }]);
      if (!Array.isArray(rec) || rec[0].read !== true || JSON.stringify(rec[0].carried) !== '[]' || JSON.stringify(rec[0].not_carried) !== want) fail(`${tag} the record names the file that moved, ${want} (got ${JSON.stringify(rec)})`);
      if (!c.stdout.includes(`"${SYNC}" person_act: ${moved} moved`)) fail(`${tag} compile names the file that moved`);
    }

    // (d) the candidate is no longer listed at B: renamed in the run's list and triage alike
    const runU = join(tmp, 'run-u');
    makeRun(runU, 'sweep-2', B);
    for (const f of ['map/raw/enumerate.json', 'map/effect-triage.yaml']) { const p = join(runU, f); writeFileSync(p, readFileSync(p, 'utf8').split(`"${SYNC}"`).join('"route: POST /sync-renamed"')); }
    compiled(runU);
    const beforeU = yard(runU);
    const cu = compile(runU, { sets: [setA], target: T });
    if (cu.status !== 0) fail(`(d) compile succeeds (exit ${cu.status}): ${cu.stderr.slice(0, 300)}`);
    else {
      if (yard(runU) !== beforeU) fail('(d) a candidate no longer listed at B is not carried: the row reads exactly as without the set');
      const rec = recordOf(runU);
      if (!Array.isArray(rec) || JSON.stringify(rec[0].carried) !== '[]' || rec[0].not_carried.length !== 1 || rec[0].not_carried[0].unlisted !== true || rec[0].not_carried[0].candidate !== SYNC) fail(`(d) the record says the pair is not carried, its candidate unlisted (got ${JSON.stringify(rec)})`);
    }

    // (e) no git, no carry: each cause its own reason, the row exactly as without the set
    const plainDir = join(tmp, 'not-a-checkout');
    cpSync(root, plainDir, { recursive: true });
    const shallow = join(tmp, 'shallow');
    git(tmp, 'clone', '-q', '--depth', '1', '--no-local', `file://${repo}`, shallow);
    for (const c of [A, B]) git(shallow, 'fetch', '-q', '--depth', '1', 'origin', c);   // both commits present: the history is still cut
    const setGone = join(tmp, 'set-gone');
    const GONE = 'b'.repeat(40);
    makeSet(setGone, ['sweep-2', { dir: opaque }], GONE);
    const whyNot = [
      ['no --target', setA, null, /^no --target checkout: /],
      ['a --target that is not a git checkout', setA, plainDir, /^the --target checkout \S+ is not a git checkout: /],
      ['a shallow history', setA, join(shallow, PATH), /^the --target checkout's history is shallow: /],
      ['commit A absent', setGone, T, new RegExp(`^the set's commit ${GONE} is not in the --target checkout's history$`)],
    ];
    const seen = new Set();
    for (const [what, set, target, why] of whyNot) {
      const c = compile(runB, { sets: [set], target });
      if (c.status !== 0) { fail(`(e) ${what}: compile succeeds (exit ${c.status}): ${(c.stderr + c.stdout).split('\n').filter((l) => /•|✗/.test(l)).join(' | ').slice(0, 300)}`); continue; }
      if (yard(runB) !== plainB) fail(`(e) ${what}: the set reads for nothing, the row exactly as without it`);
      const rec = recordOf(runB);
      const commitA = set === setGone ? GONE : A;
      if (!Array.isArray(rec) || rec[0].read !== false || rec[0].reason !== `another commit: the set swept ${commitA}, the run measured ${B}` || !why.test(String(rec[0].no_carry)) || rec[0].carried !== undefined) fail(`(e) ${what}: the record says not read, and why (got ${JSON.stringify(rec)})`);
      else seen.add(String(rec[0].no_carry).split(':')[0]);
      if (!c.stdout.includes(`; not carried: ${rec && rec[0] && rec[0].no_carry}`)) fail(`(e) ${what}: compile says why the set is not carried`);
    }
    if (seen.size !== whyNot.length) fail(`(e) each cause reads its own reason (got ${JSON.stringify([...seen])})`);

    // (g) a set at the run's own commit, with a checkout: read as #346 reads it, never by the carry rule
    const setB = join(tmp, 'set-same');
    makeSet(setB, ['sweep-2', { dir: opaque }], B);
    const runG = join(tmp, 'run-g');
    makeRun(runG, 'sweep-2', B);
    const g1 = compiled(runG, { sets: [setB] }), y1 = existsSync(join(runG, 'yardstick.yaml')) ? yard(runG) : '';
    const g2 = compiled(runG, { sets: [setB], target: T });
    if (g1 && g2 && yard(runG) !== y1) fail('(g) a set at the run\'s own commit reads the same with or without a checkout');
    const recG = recordOf(runG);
    if (!Array.isArray(recG) || recG[0].read !== true || 'carried' in recG[0] || 'no_carry' in recG[0]) fail(`(g) the exact-commit path records no carry (got ${JSON.stringify(recG)})`);
    if (g2 && (g2.status !== 'mixed' || !String(g2.note).includes('(0 from this run\'s own answers, 1 from a parting in a sweep set, 0 from both)') || /carried/.test(String(g2.note)))) fail(`(g) the exact-commit gap reads as #346 reads it, never as carried (got ${JSON.stringify(g2.note)})`);

    // (h) renaming every scanner changes no reading
    const m = loadManifest(runB);
    const rename = (s) => `renamed-${s.split('').reverse().join('')}`;
    const adapters = loadAdapters();
    const rA = Object.fromEntries(Object.entries(adapters).map(([id, x]) => [rename(id), { ...x, scanner: rename(id) }]));
    const rM = { ...m, scanners: Object.fromEntries(Object.entries(m.scanners).map(([id, x]) => [rename(id), x])) };
    const read = (man, ad) => {
      const sets = [readSetForRun(setA, man, { runDir: runB, target: T })];
      return { set: sets[0], row: measureRun({ findings: loadFindings(runB), manifest: man, inputs: null, coverage: {}, adapters: ad, channels: loadChannelFiles(runB), sweepSets: sets }, loadYardstick()).find((r) => r.id === ROW) };
    };
    const before = read(m, adapters), after = read(rM, rA);
    const strip = (x) => JSON.stringify({ carried: x.set.carried, status: x.row.status, met: x.row.met, of: x.row.of, findings: x.row.findings, sweep_sets: x.row.sweep_sets, note: x.row.note });
    if (!after.set.carried || after.set.carried.length !== 1) fail(`(h) with every scanner renamed the pair still carries (got ${JSON.stringify(after.set.carried || after.set.no_carry || after.set.reason)})`);
    if (strip(before) !== strip(after)) fail(`(h) renaming every scanner changes no reading: ${strip(before)} became ${strip(after)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
