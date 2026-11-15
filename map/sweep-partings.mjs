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
  if (!sameCommit(meta.target_commit, rc.commit)) return { read: false, reason: `another commit: the set swept ${meta.target_commit}, the run measured ${rc.commit}` };
  return { read: true };
}

// The parted pairs of one set: each { candidate, question, reads } where its sweeps' gap-or-legible
// readings differ, over every checklist question (the row keeps only the ones its bar lists).
function partingsOf(dir) {
  const set = loadSweepSet(dir);
  const c = computeCandidateAgreement(set.runDirs);
  return { set, partings: gapAgreement(c, CHECKLIST_KEYS).divergences };
}

/**
 * Read one set for one run: what the run record holds of it, and the parted pairs the row reads.
 * Throws when the set cannot be read (fail loud).
 * @param {string} dir @param {any} manifest the run's map/scanners.yaml, parsed
 */
export function readSetForRun(dir, manifest) {
  const abs = resolve(dir);
  let set, partings;
  try { ({ set, partings } = partingsOf(abs)); }
  catch (e) { throw new Error(`sweep set ${dir} cannot be read: ${e.message}`); }
  if (set.meta.identity !== undefined) {
    const probs = identityProblems(set.meta.identity);
    if (probs.length) throw new Error(`sweep set ${dir} cannot be read: SWEEP.yaml ${probs.join('; ')}`);
  }
  const m = matchOf(set.meta, manifest);
  return { dir: recordedDir(abs), set: setName(abs), sha256: setDigest(abs, set.meta.sweeps), ...m, partings: m.read ? partings : [] };
}

/** Every problem with the run record's sweep_sets: entry. @param {any} rec @returns {string[]} */
export function sweepSetsRecordProblems(rec) {
  if (!Array.isArray(rec)) return ['sweep_sets must be a list of { dir, sha256, read, reason? }'];
  const e = [];
  rec.forEach((x, i) => {
    const at = `sweep_sets[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { e.push(`${at}: must be { dir, sha256, read, reason? }`); return; }
    for (const k of Object.keys(x)) if (!['dir', 'sha256', 'read', 'reason'].includes(k)) e.push(`${at}: unknown key "${k}" (dir, sha256, read, reason)`);
    if (typeof x.dir !== 'string' || !x.dir.trim()) e.push(`${at}: dir must name the sweep set`);
    if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256)) e.push(`${at}: sha256 must be the set's 64-hex digest`);
    if (typeof x.read !== 'boolean') e.push(`${at}: read must be true or false`);
    if (x.read === false && !(typeof x.reason === 'string' && x.reason.trim())) e.push(`${at}: a set not read says why (reason)`);
    if (x.read === true && x.reason !== undefined) e.push(`${at}: a set read carries no reason`);
  });
  return e;
}

/**
 * The sets the run record names, each read again: its digest must be the recorded one, and its
 * reading for the run the recorded one, or it throws naming what moved (name it again with compile
 * --sweep-set). [] when the record names none.
 * @param {any} manifest
 */
export function sweepSetsOfRun(manifest) {
  const rec = manifest && manifest.sweep_sets;
  if (rec === undefined || rec === null) return [];
  const probs = sweepSetsRecordProblems(rec);
  if (probs.length) throw new Error(`map/scanners.yaml sweep_sets: ${probs.join('; ')}`);
  return rec.map((x) => {
    const got = readSetForRun(absDir(x.dir), manifest);
    if (got.sha256 !== x.sha256) throw new Error(`sweep set ${x.dir} changed since the run record named it (sha256 ${got.sha256}, recorded ${x.sha256}): name it again with compile --sweep-set`);
    if (got.read !== x.read || (got.reason || null) !== (x.reason || null)) throw new Error(`sweep set ${x.dir}: the run record says ${x.read ? 'read' : `not read (${x.reason})`}, and it now reads ${got.read ? 'read' : `not read (${got.reason})`}: name it again with compile --sweep-set`);
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
  }
  lines.splice(sIdx, 0, ...block);
  return lines.join('\n') + (hadTrailingNL ? '\n' : '');
}
