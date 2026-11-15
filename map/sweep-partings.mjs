// sweep-partings.mjs — where blind lanes over this run's tree part, read into the run's own
// measurement (#338, third slice; yardstick/README.md, "An effect's facts, legible").
//
// A sweep set (tests/sweeps/README.md) is several blind lanes over one target at one commit. Where
// they read one candidate two ways on a checklist question, a gap in one and legible in another
// (yardstick/legibility-bar.mjs factLegibility, the one classifier the row and variance read), careful
// readers of the same tree could not agree on the fact: the tree does not state it where a reader
// finds it, whatever this run's own lane answered. d-effect-facts-legible counts that parted pair as
// a gap on the candidate, beside the run's own not-determinables. The pairs are computed from the
// set's runs every time the run is measured, by the code `variance --set` reports them with
// (map/variance.mjs candidateAgreement, then gapAgreement), never a second rule and never a typed
// verdict file: a file would be one more thing to check against the set, and the set is already here.
//
// A parting counts only where it is about this run's tree:
//   • the set's `identity:` (SWEEP.yaml) is the run's `identity:` (map/SCHEMA.md §5a), compared by
//     map/target-identity.mjs identityKey, the rule by which two runs are one target;
//   • the set's `target_commit` is the commit the run measured: the `reviewed.head` every lane that
//     ran records (record --head), one commit, a shorter sha read as git reads it, a prefix of the
//     full one of at least 7 hex digits;
//   • a candidate is matched by its member string exactly as enumerate writes it, and only one the
//     run holds in scope is read; a parting on any other is named in the note, never invented.
// A set over this run's target at another commit is read by a second, stricter path, the carry rule
// (#338, fourth slice; yardstick/README.md, "An effect's facts, legible"): a parted pair stands at the
// run's commit B only when the candidate's member is listed in B's enumeration exactly as enumerate
// writes it, and every file the parting rests on, the candidate's cited file in each sweep's list and
// in the run's, and each file any sweep's answer on that question cites as evidence, is byte-identical
// at the set's commit A and at B: the same object id, read from the target's own git (`--target`) by
// `git cat-file`, the paths resolved under the set's identity path. Anything less is not carried, and
// the record names which file moved. Without git to read both commits (no --target checkout, one that
// is not a git checkout, a shallow history, A or B absent from it) the set reads for nothing, and the
// record says why (no_carry). The carried pairs keep the object ids compared, so a later measurement
// without the checkout reads the same from the record, and one with it refuses ids that differ.
// Any other set is read for nothing on the row, and the run record says so with the reason. A set
// that cannot be read (no SWEEP.yaml, a malformed one, a run that does not load) throws: compile stops
// naming why, never skips it. The run record names each set the row read or did not, with the digest
// of what was read (setDigest), so every later measurement of the run reads the same set or refuses.
// Nothing here names a scanner or a target (CLAUDE.md rules 6 and 7), and nothing is summed.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, isAbsolute, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from '../lib/yaml-min.mjs';
import { loadSweepSet, computeCandidateAgreement, gapAgreement } from './variance.mjs';
import { identityProblems, identityKey, identityString } from './target-identity.mjs';
import { CHECKLIST_KEYS } from './effect-answers.mjs';
import { loadChannelFiles } from './effect-triage.mjs';
import { spawnSync } from 'node:child_process';
import { posix } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROW = 'd-effect-facts-legible';

// A set inside assay's own tree is recorded by its path from assay's root (a committed set reads the
// same on every checkout); any other by its absolute path, as an operator's lens file is.
const recordedDir = (dir) => {
  const abs = resolve(dir).replace(/[\\/]+$/, '');
  const rel = relative(ROOT, abs);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(sep).join('/') : abs;
};
const absDir = (rec) => (isAbsolute(rec) ? rec : join(ROOT, rec));
const setName = (dir) => basename(String(dir).replace(/[\\/]+$/, ''));

// The digest of what the reading rests on: SWEEP.yaml and every file under each sweep's map/, by
// path from the set, in order. A set whose digest has moved since the run record named it is refused.
export function setDigest(dir, sweeps) {
  const h = createHash('sha256');
  const add = (rel) => { h.update(rel); h.update('\0'); h.update(readFileSync(join(dir, rel))); h.update('\0'); };
  add('SWEEP.yaml');
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const r = `${rel}/${name}`;
      if (statSync(join(dir, r)).isDirectory()) walk(r); else add(r);
    }
  };
  for (const s of sweeps) if (existsSync(join(dir, s, 'map'))) walk(`${s}/map`);
  return h.digest('hex');
}

// The commit the run measured: the reviewed.head of every row that ran and records one, when they
// name one commit. { commit } or { problem }.
function runCommit(manifest) {
  const rows = manifest && manifest.scanners && typeof manifest.scanners === 'object' ? Object.entries(manifest.scanners) : [];
  const heads = rows.filter(([, r]) => r && r.status === 'ran' && r.reviewed && r.reviewed.head).map(([id, r]) => ({ id, head: String(r.reviewed.head).toLowerCase() }));
  if (!heads.length) return { problem: 'the run states no commit it measured: no row that ran records reviewed.head (node assay.mjs record <run> <lane> ran --head <sha>)' };
  const longest = heads.reduce((a, b) => (b.head.length > a.head.length ? b : a)).head;
  const off = heads.filter((x) => !longest.startsWith(x.head));
  if (off.length) return { problem: `the run's rows record different heads (${heads.map((x) => `${x.id} ${x.head}`).join(', ')}), so it names no one commit it measured` };
  return { commit: longest };
}
const sameCommit = (a, b) => {
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(x) || !/^[0-9a-f]{7,40}$/.test(y)) return false;
  return x.length <= y.length ? y.startsWith(x) : x.startsWith(y);
};

// Whether the set is about this run's tree: { read: true } or { read: false, reason }.
function matchOf(meta, manifest) {
  const runId = manifest && manifest.identity;
  if (!runId || identityProblems(runId).length) return { read: false, reason: 'the run states no identity: (map/SCHEMA.md §5a), so no set can be matched to its target' };
  if (meta.identity === undefined) return { read: false, reason: 'the set states no identity: (tests/sweeps/README.md), so it cannot be matched to the run\'s target' };
  if (identityKey(meta.identity) !== identityKey(runId)) return { read: false, reason: `another target: the set swept ${identityString(meta.identity)}, the run measured ${identityString(runId)}` };
  const rc = runCommit(manifest);
  if (rc.problem) return { read: false, reason: rc.problem };
  if (!sameCommit(meta.target_commit, rc.commit)) return { read: false, reason: `another commit: the set swept ${meta.target_commit}, the run measured ${rc.commit}`, carry: { from: String(meta.target_commit).toLowerCase(), to: rc.commit } };
  return { read: true };
}


// ── the carry rule: a set at another commit of this run's target ──────────────────────────────────
// What a parted pair rests on: the files, as the sweeps cite them (relative to the target's root).
// The candidate's cited file in every sweep's list and in the run's own, and each file any sweep's
// answer on that question cites as evidence (a `commit:` citation names no file and is not one).
const fileOf = (e) => String(e).replace(/:\d+(?:-\d+)?$/, '');
function restsOn(sweepFiles, runFiles, candidate, question) {
  const paths = new Set();
  for (const f of runFiles.files.get(candidate) || []) paths.add(f);
  for (const s of sweepFiles) {
    for (const f of s.files.get(candidate) || []) paths.add(f);
    for (const x of Array.isArray(s.triage) ? s.triage : []) {
      if (!x || x.candidate !== candidate || !x.answers || typeof x.answers !== 'object') continue;
      const a = x.answers[question];
      for (const e of a && Array.isArray(a.evidence) ? a.evidence : []) if (!/^commit:/.test(String(e))) paths.add(fileOf(e));
    }
  }
  return [...paths].filter(Boolean).sort();
}

// The target's own git, read at --target: { top, prefix } or { problem }, the problem one of the
// distinct reasons no carry is read. A is the set's commit, B the run's.
function gitOf(target, identity, from, to) {
  if (!target) return { problem: 'no --target checkout: the run cannot read the set\'s commit and its own to compare the files a parting rests on (compile --sweep-set <dir> --target <checkout with history>)' };
  const g = (args, input) => spawnSync('git', ['-C', target, ...args], { encoding: 'utf8', input });
  const top = g(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { problem: `the --target checkout ${target} is not a git checkout: no history to read either commit from` };
  if (g(['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true') return { problem: `the --target checkout's history is shallow: the files a parting rests on are not read across a cut history (fetch full history)` };
  for (const [what, c] of [['the set\'s commit', from], ['the run\'s commit', to]]) {
    if (g(['cat-file', '-e', `${c}^{commit}`]).status !== 0) return { problem: `${what} ${c} is not in the --target checkout's history` };
  }
  const path = identity && identity.path && identity.path !== '.' ? identity.path : '';
  return { top: top.stdout.trim(), prefix: path, g };
}

// The object id of each path at one commit, by `git cat-file --batch-check`: path → id, or null where
// the commit holds no such path (or one outside the target).
function objectIds(git, commit, paths) {
  const out = new Map(), asked = [];
  for (const p of paths) {
    const full = posix.normalize(git.prefix ? `${git.prefix}/${p}` : p);
    if (posix.isAbsolute(p) || full.startsWith('..') || (git.prefix && !full.startsWith(`${git.prefix}/`))) { out.set(p, null); continue; }
    asked.push([p, full]);
  }
  if (asked.length) {
    const r = spawnSync('git', ['-C', git.top, 'cat-file', '--batch-check=%(objectname)'], { encoding: 'utf8', input: asked.map(([, f]) => `${commit}:${f}`).join('\n') + '\n' });
    if (r.status !== 0) throw new Error(`git cat-file failed in ${git.top}: ${r.stderr}`);
    const lines = r.stdout.split('\n');
    asked.forEach(([p], i) => out.set(p, /^[0-9a-f]{40,64}$/.test(lines[i] || '') ? lines[i] : null));
  }
  return out;
}

// Per parted pair: carried, with the object ids compared, or not carried, naming what moved.
// files: { sweeps: [loadChannelFiles of each sweep], run: loadChannelFiles of the run }.
function carryPairs(partings, files, git, from, to) {
  const carried = [], notCarried = [];
  const all = [...new Set(partings.flatMap((p) => restsOn(files.sweeps, files.run, p.candidate, p.question)))];
  const atA = git ? objectIds(git, from, all) : null, atB = git ? objectIds(git, to, all) : null;
  for (const p of partings) {
    const paths = restsOn(files.sweeps, files.run, p.candidate, p.question);
    const unlisted = !listedAt(files.run, p.candidate);
    const moved = paths.filter((x) => !atA.get(x) || atA.get(x) !== atB.get(x));
    if (unlisted || moved.length || !paths.length) notCarried.push({ candidate: p.candidate, question: p.question, moved, ...(unlisted ? { unlisted: true } : {}), ...(!paths.length ? { no_file: true } : {}) });
    else carried.push({ candidate: p.candidate, question: p.question, blobs: paths.map((x) => ({ path: x, blob: atA.get(x) })) });
  }
  return { carried, not_carried: notCarried };
}
const short = (c) => String(c).slice(0, 7);
// whether the run's own enumeration lists the candidate, its member string exactly as enumerate writes it
const listedAt = (run, candidate) => (run.candidates || []).includes(candidate);
const pairKey = (x) => `${x.candidate}\u0000${x.question}`;

// The parted pairs of one set: each { candidate, question, reads } where its sweeps' gap-or-legible
// readings differ, over every checklist question (the row keeps only the ones its bar lists).
function partingsOf(dir) {
  const set = loadSweepSet(dir);
  const c = computeCandidateAgreement(set.runDirs);
  return { set, partings: gapAgreement(c, CHECKLIST_KEYS).divergences };
}

/**
 * @typedef {{ dir: string, set: string, sha256: string, read: boolean, reason?: string, no_carry?: string,
 *   carried?: { candidate: string, question: string, blobs: { path: string, blob: string }[] }[],
 *   not_carried?: { candidate: string, question: string, moved: string[], unlisted?: boolean, no_file?: boolean }[],
 *   partings: any[] }} SetReading
 */
/**
 * Read one set for one run: what the run record holds of it, and the parted pairs the row reads.
 * Throws when the set cannot be read (fail loud). A set over the run's target at another commit is
 * read by the carry rule: with opts.target, the target's own git decides each pair; without it, a
 * record that already carries the pairs (opts.record) is read as it stands, its paths checked again.
 * @param {string} dir @param {any} manifest the run's map/scanners.yaml, parsed
 * @param {{ runDir?: string, target?: string|null, record?: any }} [opts]
 * @returns {SetReading}
 */
export function readSetForRun(dir, manifest, opts = {}) {
  const abs = resolve(dir);
  let set, partings;
  try { ({ set, partings } = partingsOf(abs)); }
  catch (e) { throw new Error(`sweep set ${dir} cannot be read: ${e.message}`); }
  if (set.meta.identity !== undefined) {
    const probs = identityProblems(set.meta.identity);
    if (probs.length) throw new Error(`sweep set ${dir} cannot be read: SWEEP.yaml ${probs.join('; ')}`);
  }
  const head = { dir: recordedDir(abs), set: setName(abs), sha256: setDigest(abs, set.meta.sweeps) };
  const { carry, ...m } = matchOf(set.meta, manifest);
  if (!carry) return { ...head, ...m, partings: m.read ? partings : [] };
  // another commit of this target: the carry rule
  if (!opts.runDir) throw new Error(`sweep set ${dir}: the carry rule reads the run's own list, and no run directory was given`);
  const files = { sweeps: set.runDirs.map((d) => loadChannelFiles(d)), run: loadChannelFiles(opts.runDir) };
  const rec = opts.record;
  // no checkout, and the record read nothing for want of git: it reads for nothing still
  if (!opts.target && rec && rec.read === false && typeof rec.no_carry === 'string') return { ...head, ...m, no_carry: rec.no_carry, partings: [] };
  if (!opts.target && rec && rec.read === true && Array.isArray(rec.carried)) {
    // no checkout: the record's ids are read as they stand; what they are ids of is checked again
    const paths = (x) => restsOn(files.sweeps, files.run, x.candidate, x.question);
    const keys = new Set(partings.map(pairKey));
    const recKeys = [...rec.carried, ...(rec.not_carried || [])].map(pairKey);
    if (recKeys.length !== keys.size || recKeys.some((k) => !keys.has(k))) throw new Error(`sweep set ${head.dir}: the run record's carried and not_carried pairs are not the set's partings: name it again with compile --sweep-set <dir> --target <checkout>`);
    for (const x of rec.carried) {
      const want = paths(x), got = (x.blobs || []).map((b) => b.path), listed = listedAt(files.run, x.candidate);
      if (!listed || JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`sweep set ${head.dir}: the run record carries "${x.candidate}" ${x.question} on ${got.join(', ') || 'no file'}, and the files it rests on are now ${listed ? want.join(', ') : 'none: the candidate is not listed'}: name it again with compile --sweep-set <dir> --target <checkout>`);
    }
    const by = new Map(partings.map((p) => [pairKey(p), p]));
    return { ...head, read: true, carried: rec.carried, not_carried: rec.not_carried || [], partings: rec.carried.map((x) => ({ ...by.get(pairKey(x)), carried: { from: short(carry.from), to: short(carry.to) } })) };
  }
  const git = gitOf(opts.target, set.meta.identity, carry.from, carry.to);
  if (git.problem) return { ...head, ...m, no_carry: git.problem, partings: [] };
  const { carried, not_carried } = carryPairs(partings, files, git, carry.from, carry.to);
  const by = new Map(partings.map((p) => [pairKey(p), p]));
  return { ...head, read: true, carried, not_carried, partings: carried.map((x) => ({ ...by.get(pairKey(x)), carried: { from: short(carry.from), to: short(carry.to) } })) };
}

const SHA = /^[0-9a-f]{40,64}$/;
// The first place a recorded carry and a fresh one differ, in words, or null when they are the same.
function carryDiff(rec, got) {
  const say = (c) => `"${c.candidate}" ${c.question}`;
  const lists = (y) => [...(y.carried || []).map((c) => ({ ...c, k: 'carried' })), ...(y.not_carried || []).map((c) => ({ ...c, k: 'not carried' }))];
  const a = lists(rec), b = new Map(lists(got).map((c) => [pairKey(c), c]));
  for (const c of a) {
    const o = b.get(pairKey(c));
    if (!o) return `the record names ${say(c)}, which the set no longer parts on`;
    if (o.k !== c.k) return `the record has ${say(c)} ${c.k}, the checkout reads it ${o.k}`;
    for (const blob of c.blobs || []) {
      const ob = (o.blobs || []).find((z) => z.path === blob.path);
      if (!ob || ob.blob !== blob.blob) return `${say(c)} rests on ${blob.path}, recorded as object ${blob.blob}, which the checkout reads as ${ob ? ob.blob : 'no file'}`;
    }
    if (JSON.stringify(c.blobs || null) !== JSON.stringify(o.blobs || null) || JSON.stringify(c.moved || null) !== JSON.stringify(o.moved || null) || !!c.unlisted !== !!o.unlisted || !!c.no_file !== !!o.no_file) return `${say(c)} rests on other files than the record names (recorded ${JSON.stringify(c.blobs || c.moved)}, the checkout reads ${JSON.stringify(o.blobs || o.moved)})`;
    b.delete(pairKey(c));
  }
  for (const c of b.values()) return `the checkout reads ${say(c)} ${c.k}, which the record does not name`;
  return null;
}
/** Every problem with the run record's sweep_sets: entry. @param {any} rec @returns {string[]} */
export function sweepSetsRecordProblems(rec) {
  const shape = '{ dir, sha256, read, reason?, no_carry?, carried?, not_carried? }';
  if (!Array.isArray(rec)) return [`sweep_sets must be a list of ${shape}`];
  const e = [];
  rec.forEach((x, i) => {
    const at = `sweep_sets[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { e.push(`${at}: must be ${shape}`); return; }
    for (const k of Object.keys(x)) if (!['dir', 'sha256', 'read', 'reason', 'no_carry', 'carried', 'not_carried'].includes(k)) e.push(`${at}: unknown key "${k}" (dir, sha256, read, reason, no_carry, carried, not_carried)`);
    if (typeof x.dir !== 'string' || !x.dir.trim()) e.push(`${at}: dir must name the sweep set`);
    if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256)) e.push(`${at}: sha256 must be the set's 64-hex digest`);
    if (typeof x.read !== 'boolean') e.push(`${at}: read must be true or false`);
    if (x.read === false && !(typeof x.reason === 'string' && x.reason.trim())) e.push(`${at}: a set not read says why (reason)`);
    if (x.read === true && x.reason !== undefined) e.push(`${at}: a set read carries no reason`);
    if (x.no_carry !== undefined && (x.read !== false || typeof x.no_carry !== 'string' || !x.no_carry.trim())) e.push(`${at}: no_carry says why a set at another commit was not read, on a set not read`);
    const carry = x.carried !== undefined || x.not_carried !== undefined;
    if (carry && (x.read !== true || !Array.isArray(x.carried) || !Array.isArray(x.not_carried))) e.push(`${at}: a set read at another commit carries both carried: and not_carried: lists`);
    if (carry && Array.isArray(x.carried)) x.carried.forEach((c, j) => {
      if (!c || typeof c.candidate !== 'string' || !CHECKLIST_KEYS.includes(c.question)) e.push(`${at}.carried[${j}]: { candidate, question, blobs } with a checklist question`);
      else if (!Array.isArray(c.blobs) || !c.blobs.length || c.blobs.some((b) => !b || typeof b.path !== 'string' || !b.path || typeof b.blob !== 'string' || !SHA.test(b.blob))) e.push(`${at}.carried[${j}]: blobs must list each file the parting rests on, { path, blob }, blob its git object id`);
    });
    if (carry && Array.isArray(x.not_carried)) x.not_carried.forEach((c, j) => {
      if (!c || typeof c.candidate !== 'string' || !CHECKLIST_KEYS.includes(c.question)) e.push(`${at}.not_carried[${j}]: { candidate, question, moved } with a checklist question`);
      else if (!Array.isArray(c.moved) || c.moved.some((m) => typeof m !== 'string' || !m)) e.push(`${at}.not_carried[${j}]: moved must list the files that moved`);
      else if (!c.moved.length && c.unlisted !== true && c.no_file !== true) e.push(`${at}.not_carried[${j}]: a pair not carried names a file that moved, or says the candidate is unlisted (unlisted: true) or rests on no file (no_file: true)`);
    });
  });
  return e;
}

/**
 * The sets the run record names, each read again: its digest must be the recorded one, and its
 * reading for the run the recorded one, or it throws naming what moved (name it again with compile
 * --sweep-set). [] when the record names none. A set carried from another commit is read from the
 * record without a checkout; with one (opts.target), the target's own git decides again, and object
 * ids that differ from the record's are refused.
 * @param {any} manifest @param {{ runDir?: string, target?: string|null }} [opts]
 */
export function sweepSetsOfRun(manifest, opts = {}) {
  const rec = manifest && manifest.sweep_sets;
  if (rec === undefined || rec === null) return [];
  const probs = sweepSetsRecordProblems(rec);
  if (probs.length) throw new Error(`map/scanners.yaml sweep_sets: ${probs.join('; ')}`);
  return rec.map((x) => {
    const got = readSetForRun(absDir(x.dir), manifest, { ...opts, record: x });
    if (got.sha256 !== x.sha256) throw new Error(`sweep set ${x.dir} changed since the run record named it (sha256 ${got.sha256}, recorded ${x.sha256}): name it again with compile --sweep-set`);
    if (got.read !== x.read || (got.reason || null) !== (x.reason || null) || (got.no_carry || null) !== (x.no_carry || null)) throw new Error(`sweep set ${x.dir}: the run record says ${x.read ? 'read' : `not read (${x.no_carry || x.reason})`}, and it now reads ${got.read ? 'read' : `not read (${got.no_carry || got.reason})`}: name it again with compile --sweep-set`);
    const d = carryDiff(x, got);
    if (d) throw new Error(`sweep set ${x.dir}: the run record's carry does not hold against the --target checkout: ${d}: name it again with compile --sweep-set`);
    return got;
  });
}

// setSweepSets — the sets compile --sweep-set named for the run: a top-level sweep_sets: list written
// just above scanners:, replacing any the record already carries, spliced as setConsequencePolicy
// splices (map/record.mjs): every other line is carried through byte-for-byte.
export function setSweepSets(text, entries) {
  const hadTrailingNL = text.endsWith('\n');
  const lines = (hadTrailingNL ? text.slice(0, -1) : text).split('\n');
  const at = lines.findIndex((l) => /^sweep_sets:/.test(l));
  if (at > -1) {
    let end = at + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
    lines.splice(at, end - at);
  }
  const sIdx = lines.findIndex((l) => /^scanners:\s*$/.test(l));
  if (sIdx === -1) throw new Error('no top-level "scanners:" map in this file (fail-closed — is it a run manifest?)');
  const block = ['sweep_sets:'];
  for (const x of entries) {
    block.push(`  - dir: ${q(x.dir)}`, `    sha256: ${q(x.sha256)}`, `    read: ${x.read}`);
    if (!x.read) block.push(`    reason: ${q(x.reason)}`);
    if (x.no_carry) block.push(`    no_carry: ${q(x.no_carry)}`);
    if (Array.isArray(x.carried)) {
      block.push(x.carried.length ? '    carried:' : '    carried: []');
      for (const c of x.carried) {
        block.push(`      - candidate: ${q(c.candidate)}`, `        question: ${c.question}`, '        blobs:');
        for (const b of c.blobs) block.push(`          - { path: ${q(b.path)}, blob: ${q(b.blob)} }`);
      }
      block.push(x.not_carried.length ? '    not_carried:' : '    not_carried: []');
      for (const c of x.not_carried) {
        block.push(`      - candidate: ${q(c.candidate)}`, `        question: ${c.question}`, `        moved: [${c.moved.map(q).join(', ')}]`);
        if (c.unlisted) block.push('        unlisted: true');
        if (c.no_file) block.push('        no_file: true');
      }
    }
  }
  lines.splice(sIdx, 0, ...block);
  return lines.join('\n') + (hadTrailingNL ? '\n' : '');
}
