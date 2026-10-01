#!/usr/bin/env node
// ratchet.mjs — once a steward accepts a repository's measurement, a later run
// can never quietly slide backward on it. Compares a committed BASELINE (a small
// reviewed snapshot of what was met/mixed at acceptance) against a run's current
// yardstick.yaml with yardstick/compare.mjs's pure core, and fails loud the
// moment a held requirement gets worse or drops off the measured scale
// (CLAUDE.md rule 3: fail loud, never empty).
//
// A baseline is written FROM a run (`--write-baseline`), reviewed by a human, and
// committed by them — this command never writes to git and never commits
// anything. The baseline format (below) is documented HERE, its one home;
// yardstick/README.md links here rather than restating it.
//
// Usage:
//   node assay.mjs ratchet <run-dir> [--baseline <baseline.yaml> | --baseline-ref <git-ref> --repo <dir>]
//                                     [--write-baseline <file>] [--by <role>] [--commit <sha>]
//
//   --baseline        compare the run against this committed baseline (the gate),
//                      read from a file on disk.
//   --baseline-ref     compare against packet/baseline.yaml as it reads at this git
//                      ref, in the repository named by --repo — `git show
//                      <ref>:packet/baseline.yaml`, never a file the run's own
//                      working tree could have edited. This is what a pull
//                      request is graded against: the accepted baseline on the
//                      DEFAULT branch, never the copy the pull request itself
//                      carries (routine/README.md "The baseline: accepted by a
//                      named steward" — a change that edited the file it is
//                      graded against would otherwise switch its own gate off).
//   --repo             the git repository --baseline-ref reads from; required
//                      with --baseline-ref.
//                      Omitting both --baseline and --baseline-ref skips the gate
//                      entirely — the only supported way to produce a FIRST
//                      baseline is --write-baseline with no baseline to hold
//                      against yet.
//   --write-baseline  write (or overwrite) a baseline file from the run's CURRENT
//                      measurement — every requirement, its status and basis —
//                      dated today under the given --by role (default "steward")
//                      and --commit (default: the head repo-census recorded for the run, else "").
//                      The command only writes the file; committing it is the
//                      steward's own reviewed act (routine/README.md).
//
// Exit codes:
//   0   nothing held regressed or dropped off the scale, and no contradiction
//       (or no --baseline/--baseline-ref given and no contradiction)
//   1   a met/mixed baseline requirement is now worse or no-longer-measured, a
//       baseline requirement is absent from the current measurement entirely, OR
//       the current measurement carries any contradiction (a repository's own
//       packet claimed satisfied; this run found the mechanism absent) — a
//       contradiction is ALWAYS a failure under stewardship; there is no
//       --allow-contradictions escape hatch (yardstick/README.md)
//   2   a missing or unreadable input (the run's yardstick.yaml, the baseline
//       file when --baseline names one, or the git ref/repo when --baseline-ref
//       names one) — NEVER 0 on a bad input
//
// A baseline row recorded unmet or not-measured never fails the ratchet — there
// is nothing there to hold.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { parseYaml } from '../lib/yaml-min.mjs';
import { yardstickPath, rawPath } from '../lib/run-layout.mjs';
import { isMain } from '../map/doctrine.mjs';
import { loadYardstick, STATUSES, loadContradictions } from './measure.mjs';
import { compare } from './compare.mjs';

export const BASIS = ['run', 'owner'];

// ── baseline: load + validate (fail closed) ─────────────────────────────────
export function validateBaseline(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['baseline: not a YAML map'];
  if (doc.baseline == null) errors.push('baseline: missing "baseline" (format version)');
  if (doc.yardstick == null) errors.push('baseline: missing "yardstick" (the requirements.yaml version these claims speak to)');
  if (!doc.accepted || !doc.accepted.date) errors.push('baseline: accepted.date required');
  if (!doc.accepted || !doc.accepted.by) errors.push('baseline: accepted.by required (a role, e.g. steward)');
  if (!Array.isArray(doc.requirements)) errors.push('baseline: requirements must be a list');
  else {
    const seen = new Set();
    for (const r of doc.requirements) {
      const at = `baseline: ${r && r.id ? r.id : '(no id)'}`;
      if (!r || !r.id) { errors.push(`${at}: id required`); continue; }
      if (seen.has(r.id)) errors.push(`${at}: duplicate id`); seen.add(r.id);
      if (!STATUSES.includes(r.status)) errors.push(`${at}: status must be one of ${STATUSES.join('|')}`);
      if (r.basis != null && !BASIS.includes(r.basis)) errors.push(`${at}: basis must be run|owner`);
    }
  }
  return errors;
}
export function loadBaseline(file) {
  const doc = parseYaml(readFileSync(file, 'utf8'));
  const errors = validateBaseline(doc);
  if (errors.length) throw new Error(errors.join('\n'));
  return doc;
}

// ── reading a baseline from a git ref, never the working tree ───────────────
// `catGitFile(repoDir, ref, path)` is `git show <ref>:<path>` in that repository —
// the CONTENT git holds for `path` at `ref`, independent of whatever the current
// working tree carries. Returns { ok: true, content } or { ok: false, error }; it
// never throws, so a caller can tell "not present at that ref" (routine/run.mjs's
// own "no baseline yet" case) apart from every other kind of failure.
export function catGitFile(repoDir, ref, path) {
  const r = spawnSync('git', ['-C', repoDir, 'show', `${ref}:${path}`], { encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, error: String(r.stderr || r.stdout || '').trim() || `git show ${ref}:${path} failed` };
  return { ok: true, content: r.stdout };
}
// loadBaselineFromRef — the --baseline-ref gate's own loader: the SAME
// fail-closed validation as loadBaseline, over content read from a git ref
// instead of the working tree.
export function loadBaselineFromRef(repoDir, ref, path = 'packet/baseline.yaml') {
  const got = catGitFile(repoDir, ref, path);
  if (!got.ok) throw new Error(`cannot read ${path} at ${ref} in ${repoDir} (${got.error})`);
  const doc = parseYaml(got.content);
  const errors = validateBaseline(doc);
  if (errors.length) throw new Error(errors.join('\n'));
  return doc;
}

// ── the run's own measurement, read as a { version, requirements } document ──
export function loadYardstickDoc(dir) {
  const p = yardstickPath(dir);
  const doc = parseYaml(readFileSync(p, 'utf8'));
  if (!Array.isArray(doc.requirements)) throw new Error(`${p}: no requirements list — run measure --write first`);
  return { version: doc.version, requirements: doc.requirements };
}

// ── the pure gate over an already-loaded baseline + current doc ────────────
// Returns { failures: [line...], held, improved: [{id,title,before,after}],
// changed: [{id,title,before,after}] }. `titleOf` maps an id to its register
// title (a plain fallback to the id when the requirement no longer exists in
// the register at all — a yardstick-only row).
//
// not-applicable is decided only from the map (yardstick/measure.mjs), never a
// failure either direction: a requirement that stops applying was not held and
// then broken, it simply no longer applies (met -> not-applicable reports, it
// never fails); and a baseline row that WAS not-applicable never reaches the
// held-status check below (it is not met/mixed), so it can never fail regardless
// of what it becomes now. Both directions land in `changed` — a real transition,
// surfaced, not silently folded into "held" or "regressed".
export function evaluateRatchet(baselineDoc, currentDoc, titleOf) {
  const previous = { version: baselineDoc.yardstick, requirements: baselineDoc.requirements };
  const { rows } = compare(previous, currentDoc);
  const failures = [];
  let held = 0;
  const improved = [];
  const changed = [];
  for (const r of rows) {
    if (r.classification === 'yardstick-only') {
      if (r.side === 'previous') {
        // a requirement the baseline held is not decided by this run's yardstick AT ALL
        // (retired, renamed, or a baseline from a different requirements.yaml) — always
        // a failure: a claim that can no longer even be checked is not "holding".
        failures.push(`${r.id} — ${titleOf(r.id)}: ${r.previous.status} → absent from this run's yardstick (no longer a requirement this run decides)`);
      }
      continue; // side === 'current': a requirement ADDED since the baseline — nothing to hold yet
    }
    if (r.current.status === 'not-applicable' && r.previous.status !== 'not-applicable') {
      changed.push({ id: r.id, title: titleOf(r.id), before: r.previous.status, after: r.current.status });
      continue;
    }
    if (r.previous.status === 'not-applicable' && r.current.status !== 'not-applicable') {
      changed.push({ id: r.id, title: titleOf(r.id), before: r.previous.status, after: r.current.status });
      continue;
    }
    const heldStatus = r.previous.status === 'met' || r.previous.status === 'mixed';
    if (r.classification === 'improved') improved.push({ id: r.id, title: titleOf(r.id), before: r.previous.status, after: r.current.status });
    if (heldStatus) {
      if (r.classification === 'regressed' || r.classification === 'no-longer-measured') {
        const findings = r.current.findings.length ? ` (${r.current.findings.join(', ')})` : '';
        failures.push(`${r.id} — ${titleOf(r.id)}: ${r.previous.status} → ${r.current.status}${findings}`);
      } else if (r.classification === 'unchanged') held++;
      // 'improved' held-status rows are reported as improved, not held (they moved, not stayed).
    }
  }
  return { failures, held, improved, changed };
}

// ── writing a baseline FROM a run's current measurement ─────────────────────
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
export function toBaselineYaml({ yardstickVersion, date, by, commit, requirements }) {
  const L = [
    '# baseline.yaml — the reviewed snapshot a steward accepted (yardstick/ratchet.mjs). Written by',
    '# `ratchet --write-baseline`; committing it is the steward\'s own reviewed act, never automatic.',
    'baseline: 1',
    `yardstick: ${yardstickVersion}`,
    'accepted:',
    `  date: ${date}`,
    `  by: ${by}`,
    `commit: ${q(commit || '')}`,
    'requirements:',
  ];
  for (const r of requirements) L.push(`  - id: ${r.id}`, `    status: ${r.status}`, `    basis: ${r.basis || 'run'}`);
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const flagIdx = new Set();
  ['--baseline', '--baseline-ref', '--repo', '--write-baseline', '--by', '--commit'].forEach((f) => { const i = args.indexOf(f); if (i > -1) { flagIdx.add(i); flagIdx.add(i + 1); } });
  const dir = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  if (!dir) { console.error('usage: node assay.mjs ratchet <run-dir> [--baseline <baseline.yaml> | --baseline-ref <git-ref> --repo <dir>] [--write-baseline <file>] [--by <role>] [--commit <sha>]'); process.exit(2); }

  let currentDoc;
  try { currentDoc = loadYardstickDoc(dir); }
  catch (e) { console.error(`✗ ratchet: cannot read ${dir}'s yardstick.yaml (${e.message})`); process.exit(2); }

  let reg;
  try { reg = loadYardstick(); }
  catch (e) { console.error(`✗ ratchet: cannot load the yardstick register (${e.message})`); process.exit(2); }
  const titleById = new Map(reg.requirements.map((d) => [d.id, d.title]));
  const titleOf = (id) => titleById.get(id) || id;

  const baselineFile = flag('--baseline');
  const baselineRef = flag('--baseline-ref');
  const repoFlag = flag('--repo');
  if (baselineFile && baselineRef) { console.error('✗ ratchet: --baseline and --baseline-ref are mutually exclusive'); process.exit(2); }
  if (baselineRef && !repoFlag) { console.error('✗ ratchet: --baseline-ref requires --repo <dir>'); process.exit(2); }
  let exitCode = 0;
  if (baselineFile || baselineRef) {
    let baselineDoc;
    if (baselineFile) {
      if (!existsSync(baselineFile)) { console.error(`✗ ratchet: no such baseline file: ${baselineFile}`); process.exit(2); }
      try { baselineDoc = loadBaseline(baselineFile); }
      catch (e) { console.error(`✗ ratchet: ${baselineFile} is not a valid baseline (fails closed):\n${e.message}`); process.exit(2); }
    } else {
      try { baselineDoc = loadBaselineFromRef(repoFlag, baselineRef); }
      catch (e) { console.error(`✗ ratchet: ${baselineRef}:packet/baseline.yaml in ${repoFlag} is not a valid baseline (fails closed):\n${e.message}`); process.exit(2); }
    }
    const { failures, held, improved, changed } = evaluateRatchet(baselineDoc, currentDoc, titleOf);
    if (failures.length) {
      console.error(`✗ ratchet: ${failures.length} requirement(s) the baseline held are now worse:\n`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      exitCode = 1;
    } else {
      console.log(`✓ ratchet held: held ${held}, improved ${improved.length}, changed (not-applicable) ${changed.length}`);
      for (const r of improved) console.log(`  ↑ ${r.id} — ${r.title}: ${r.before} → ${r.after}`);
      // to/from not-applicable is never a failure — decided only from the map — but it IS a
      // change, so it is reported here rather than folded silently into "held".
      for (const r of changed) console.log(`  · ${r.id} — ${r.title}: ${r.before} → ${r.after} (reported, not a failure)`);
      if (improved.length && baselineFile) console.log(`\nLock these in: node assay.mjs ratchet ${dir} --write-baseline ${baselineFile}`);
    }
  } else {
    console.log('· no --baseline given — nothing to hold against (the gate is skipped)');
  }

  // Contradictions: checked ALWAYS, independent of any baseline — a repository's
  // own packet claiming satisfied against a run-decided unmet row is a failure
  // under stewardship every time, never something an --allow flag can wave
  // through (yardstick/README.md, CLAUDE.md rule 2: no claim without evidence).
  const contradictions = loadContradictions(dir);
  if (contradictions.length) {
    console.error(`\n✗ ratchet: ${contradictions.length} contradiction(s) — a repository's own packet claimed satisfied; this run found otherwise:\n`);
    for (const c of contradictions) {
      const findings = (c.findings || []).length ? ` (${c.findings.join(', ')})` : '';
      console.error(`  ✗ ${c.id} — ${titleOf(c.id)}: the owner's packet claimed satisfied; this run found ${c.run_status}${findings}`);
    }
    exitCode = 1;
  }

  const writeTo = flag('--write-baseline');
  if (writeTo) {
    const by = flag('--by') || 'steward';
    // the commit the run measured (repo-census records the checkout's head), unless named
    let runHead = '';
    try { runHead = (JSON.parse(readFileSync(rawPath(dir, 'repo-census.json'), 'utf8')).target || {}).head || ''; } catch { /* no census in this run */ }
    const commit = flag('--commit') || runHead;
    const date = new Date().toISOString().slice(0, 10);
    const requirements = currentDoc.requirements.map((r) => ({ id: r.id, status: r.status, basis: r.basis || 'run' }));
    mkdirSync(dirname(writeTo) || '.', { recursive: true });
    writeFileSync(writeTo, toBaselineYaml({ yardstickVersion: currentDoc.version, date, by, commit, requirements }));
    console.log(`wrote ${writeTo} (${requirements.length} requirements, accepted by ${by} on ${date}) — review it, then commit it yourself.`);
  }

  process.exit(exitCode);
}
