#!/usr/bin/env node
// assay findings validator — the format contract, enforced.
// Usage:  node assay.mjs validate <run-dir> [--target <target-repo>] [--canon <name>]
//   <run-dir> is a run root (…/runs/<slug>-<date>/) — findings live under its map/findings/.
// Exits non-zero on any violation. Zero-dependency: a minimal YAML reader tuned
// to SCHEMA.md's constrained subset that FAILS CLOSED — an input it cannot parse
// is an error, not a pass — a checker that silently accepts unparseable input hides the very thing it exists to catch.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { isHalt } from './doctrine.mjs';
import {
  findingsDir, coverageDir, scannersPath, yardstickPath as runYardstickPath,
  prosePath as runProsePath, securityGatePath, maturityGradesPath, censusesPath,
  leveragePath, maturityPath as runMaturityPath, securityPath, improvePagePath,
  nativeReportPath, isRepoEvalPassFile, REPO_EVAL_PASS_PREFIX, decisionsPath,
  chainsDataPath, handoffSequencePath, backlogPath, backlogAuthoredPath,
} from '../lib/run-layout.mjs';
import { checkChains, checkSequence, checkBacklog, checkAuthoredBacklog } from '../lib/run-data.mjs';
import { DECISION_ACTIONS, DECISION_KEYS } from './decisions.mjs';
import { emailShape, looksLikePersonName } from '../yardstick/packet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // map/

// ── controlled vocabularies (SCHEMA.md §2) ──────────────────────────────────
const DIMENSIONS = new Set(['artifact-legibility','context-economy','deterministic-gates','verification','delegation','improvement-loop','multiplayer','unprompted']);
const POLARITY = new Set(['strength','gap','fact']);
const SUBJECT = new Set(['effect','control','artifact','contract','process','capability']);
const CONFIDENCE = new Set(['confirmed','plausible','unverified']);
const REVERSIBILITY = new Set(['reversible','reversible-with-window','irreversible']);
const GATE_TYPE = new Set(['deterministic-halt','staged-reversible','scope-bound','rate-throttle','disclosure-only','external-halt','initiated-by-person','none']);
const TELEMETRY = new Set(['none','unstructured','structured-event','audited']);
const BLAST = new Set(['user','tenant','fleet','cross-tenant']);
const FAIL_MODE = new Set(['open','closed','unterminated']);
const VERIFIED_PRIVILEGE = new Set(['bound','elevated']);
const PRECONDITIONS = new Set(['prompt-injection','stolen-credential','malicious-dependency','network-position','insider','zero-day','physical']);
// overlay layer (SCHEMA.md §2a) — a finding may carry an explicit `axis`;
// absent is valid (the adapter projects it). The valid set is DERIVED from the
// adapters — axes are scanner-contributed, so the vocab is open by design:
// every axis any adapter contributes or maps to. See map/scanners/CONTRACT.md.
const { loadAdapters, projectMulti, REPO_EVAL_PASSES } = await import('./project.mjs');
const AXES = new Set();
let ADAPTERS = {};
try {
  ADAPTERS = loadAdapters();
  for (const a of Object.values(ADAPTERS)) {
    for (const x of (a.contributes || [])) AXES.add(x);
    for (const row of Object.values(a.map || {})) if (row && row.axis) AXES.add(row.axis);
  }
} catch { /* adapters unreadable — the projection gate below reports it */ }
const isInstrument = (src) => ADAPTERS[src]?.role === 'instrument';
const WHO = new Set(['stranger-pre-auth','authorized-real-user','only-at-scale-or-adversarial']);
const LIKELIHOOD = new Set(['high','moderate','low']);

// ── filename ↔ dimension mapping ────────────────────────────────────────────
// Ids are F-### unique within a run, carrying NO dimension meaning (decoupled 2026-08-05):
// the `dimension` field + filename↔dimension agreement is the source of truth for a finding's
// dimension. No per-dimension id bands, no fixed budget, no ceiling. See SCHEMA §3.
const FILE_DIM = Object.fromEntries(Object.entries(REPO_EVAL_PASSES).map(([p, d]) => [`repo-eval-${p}.yaml`, d]));

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warnings = [];   // non-fatal: surfaced but do not fail the build (legacy roadmap `questions:`, stale dispositions, …)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
// every evidence entry is a path:line string (SCHEMA §1): `:12` alone cites no file, and a
// bare path or a map cites no line (no claim without evidence)
const CITE = /^(.*):(\d+)(?:-(\d+))?$/;
function emptyCites(f, at) {
  if (!Array.isArray(f.evidence)) return;
  for (const ev of f.evidence) {
    const m = typeof ev === 'string' ? ev.trim().match(CITE) : null;
    if (m && !m[1]) err(at, `evidence "${ev}" cites no path`);
    else if (!m) err(at, `evidence ${JSON.stringify(ev)} is not a path:line citation`);
  }
}

// ── load findings ───────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg) { console.error('usage: node assay.mjs validate <run-dir> [--target <target-repo>] [--canon <name>]'); process.exit(2); }
// Optional: verify every evidence path resolves to a real file in the TARGET repo.
// Off by default so the validator stays portable (a run may be checked without the
// target present); when --target is given it fails closed on a cited path that does
// not exist — the "agent cited a plausible path it never opened" class (e.g. a
// container mount alias instead of the repo path) — and on a cited line the file does
// not have. Pass it wherever the target is present: `assay start`, the routine, and
// `compile --target` all do.
const tIdx = process.argv.indexOf('--target');
const target = tIdx > -1 ? process.argv[tIdx + 1] : null;
const runDir = arg;
const evalDir = findingsDir(runDir);   // map/findings/ — every reader/writer uses this one path
if (!existsSync(evalDir)) { console.error(`no such dir: ${evalDir}`); process.exit(2); }

const allById = new Map();       // id -> {finding, file}
const passFiles = readdirSync(evalDir).filter((f) => f.endsWith('.yaml')).sort();

function checkFinding(f, fileLabel, expectDim) {
  const id = f.id;
  const at = `${fileLabel}:${id || '??'}`;
  if (!id || !/^F-\d{3,}$/.test(String(id))) { err(at, `bad or missing id (want F-###: three or more digits — an instrument can return more rows than three digits hold)`); return; }
  if (allById.has(id)) err(at, `duplicate id (also in ${allById.get(id).file})`);
  else allById.set(id, { f, file: fileLabel });
  // External-scanner findings (overlay, SCHEMA §2a): a finding from another
  // evaluator carries `source` + `native_category` and is validated under the
  // PORT (map/scanners/CONTRACT.md §1), not the native repo-eval schema —
  // no `dimension`/`subject_type`. Its axis is derived by its adapter at
  // projection, so it need not carry one here; if it does, the vocab is checked.
  const external = f.source && f.source !== 'repo-eval';
  if (external) {
    for (const k of ['source','native_category','observation','evidence','polarity']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') err(at, `missing required key (external finding): ${k}`);
    }
    if (f.polarity && !POLARITY.has(f.polarity)) err(at, `bad polarity "${f.polarity}"`);
    if (f.evidence !== undefined && (!Array.isArray(f.evidence) || f.evidence.length === 0)) err(at, `evidence must be a non-empty list`);
    emptyCites(f, at);
    if (f.axis !== undefined && !AXES.has(f.axis)) err(at, `bad axis "${f.axis}"`);
    // fix is required on a PEER scanner's gaps (drives the handoff); an INSTRUMENT's
    // gap may omit it — it then lands owner-defined pending, listed loudly, never dropped.
    if (f.polarity === 'gap' && (f.fix === undefined || f.fix === '') && !isInstrument(f.source))
      err(at, `external gap finding needs a fix (drives the handoff; instrument-role sources are exempt)`);
    return;
  }
  for (const k of ['dimension','polarity','subject_type','observation','evidence','confidence']) {
    if (f[k] === undefined || f[k] === null || f[k] === '') err(at, `missing required key: ${k}`);
  }
  if (f.dimension && !DIMENSIONS.has(f.dimension)) err(at, `bad dimension "${f.dimension}"`);
  if (f.polarity && !POLARITY.has(f.polarity)) err(at, `bad polarity "${f.polarity}"`);
  if (f.subject_type && !SUBJECT.has(f.subject_type)) err(at, `bad subject_type "${f.subject_type}"`);
  if (f.confidence && !CONFIDENCE.has(f.confidence)) err(at, `bad confidence "${f.confidence}"`);
  if (f.evidence !== undefined && (!Array.isArray(f.evidence) || f.evidence.length === 0)) err(at, `evidence must be a non-empty list`);
  emptyCites(f, at);
  // overlay layer (optional; validated only when present — SCHEMA.md §2a)
  if (f.axis !== undefined && !AXES.has(f.axis)) err(at, `bad axis "${f.axis}"`);
  // (no id-band check — ids are unique F-### with no dimension meaning; the field is the truth)
  // filename ↔ dimension (unprompted permitted anywhere)
  if (expectDim && f.dimension && f.dimension !== 'unprompted' && f.dimension !== expectDim)
    err(at, `dimension "${f.dimension}" in ${fileLabel} (expected ${expectDim} or unprompted)`);
  // conditional facets
  if (f.subject_type === 'effect') {
    const e = f.effect;
    if (!e || typeof e !== 'object' || Array.isArray(e)) err(at, `subject_type:effect requires an effect facet`);
    else {
      for (const k of ['channel','reversibility','external','gate_type','telemetry','blast_scope'])
        if (e[k] === undefined || e[k] === null || e[k] === '') err(at, `effect.${k} missing`);
      if (e.reversibility && !REVERSIBILITY.has(e.reversibility)) err(at, `bad effect.reversibility "${e.reversibility}"`);
      if (e.gate_type && !GATE_TYPE.has(e.gate_type)) err(at, `bad effect.gate_type "${e.gate_type}"`);
      if (e.telemetry && !TELEMETRY.has(e.telemetry)) err(at, `bad effect.telemetry "${e.telemetry}"`);
      if (e.blast_scope && !BLAST.has(e.blast_scope)) err(at, `bad effect.blast_scope "${e.blast_scope}"`);
      if (typeof e.external !== 'boolean') err(at, `effect.external must be boolean`);
      if (e.gate_type && e.gate_type !== 'none') {
        if (e.fail_mode === undefined) err(at, `effect.fail_mode required when gate_type != none`);
        else if (!FAIL_MODE.has(e.fail_mode)) err(at, `bad effect.fail_mode "${e.fail_mode}"`);
      }
      // the identity a gate check ran under (optional; SCHEMA.md §1): a check run with more
      // privilege than the gate binds proves nothing about the gate, so it cannot be confirmed
      if (e.verified_as !== undefined) {
        const v = e.verified_as;
        if (!v || typeof v !== 'object' || Array.isArray(v)) err(at, `effect.verified_as must be a mapping`);
        else {
          if (e.gate_type === 'none') err(at, `verified_as on an effect whose gate_type is none (there is no gate to verify)`);
          for (const k of ['principal','privilege']) if (v[k] === undefined || v[k] === null || v[k] === '') err(at, `effect.verified_as.${k} missing`);
          if (v.privilege && !VERIFIED_PRIVILEGE.has(v.privilege)) err(at, `bad effect.verified_as.privilege "${v.privilege}"`);
          if (v.privilege === 'elevated' && f.confidence === 'confirmed')
            err(at, `verified_as.privilege elevated (the check ran with more privilege than the gate binds) needs confidence plausible, not confirmed`);
        }
      }
      // fail-closed discovery: an unheld halt is a chain sink, and its difficulty is
      // chain-critical, so its preconditions must be determined, never left to default.
      // The unheld-halt rule is map/doctrine.mjs's isHalt, never restated here.
      if (isHalt(e) && (!Array.isArray(f.preconditions) || !f.preconditions.length))
        err(at, `unheld-halt effect must state preconditions (chain difficulty is chain-critical; do not leave it to default)`);
    }
  }
  if (f.subject_type === 'capability') {
    const c = f.capabilities;
    if (!c || typeof c !== 'object' || Array.isArray(c)) err(at, `subject_type:capability requires a capabilities block`);
    else for (const k of ['untrusted_input','private_data','external_effect'])
      if (typeof c[k] !== 'boolean') err(at, `capabilities.${k} must be boolean`);
  }
  // precondition vocab
  if (Array.isArray(f.preconditions)) for (const pc of f.preconditions)
    if (!PRECONDITIONS.has(pc)) err(at, `bad precondition "${pc}"`);
}

// parse + check each pass file
for (const file of passFiles) {
  const label = file;
  let docs;
  try { docs = parseYaml(readFileSync(join(evalDir, file), 'utf8')); }
  catch (e) { err(label, `YAML parse failed (fail-closed): ${e.message}`); continue; }
  // A comments-only / empty file parses to null — an EMPTY findings set, valid. An
  // instrument's verified-clean run writes exactly this (0 findings, recorded
  // explicitly), and it must validate green, not error (fail-loud: the honest
  // "we ran it and found nothing" is not a malformed base). A non-null non-array
  // (e.g. a top-level map) is still a real structural error.
  if (docs == null) docs = [];
  if (!Array.isArray(docs)) { err(label, `expected a top-level list of findings`); continue; }
  const expectDim = FILE_DIM[file] || null;
  for (const f of docs) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) { err(label, `list item is not a finding mapping`); continue; }
    checkFinding(f, label, expectDim);
  }
}

// ── the run manifest (SCHEMA.md §5a) — fail-closed on absence ────────────────
// Every ADOPTED scanner gets a disposition for this run: ran | skipped <reason>
// | failed <reason>. Without it, an integration that simply was not invoked is
// indistinguishable from one that ran clean, and the package reads as coverage
// that never happened. The inverse holds too: rows from a scanner the manifest
// says did not run are not evidence.
{
  const { loadManifest, adoptedAdapters, MANIFEST_FILE, MANIFEST_STATUS } = await import('./project.mjs');
  const mPath = scannersPath(runDir);
  const sourcesSeen = new Set([...allById.values()].map((v) => v.f.source || 'repo-eval'));
  if (!existsSync(mPath)) {
    err(MANIFEST_FILE, `missing — every run records each adopted scanner's disposition (ran | skipped + reason | failed + reason); a scanner that can be omitted without a recorded decision reads as coverage. Start the run: node assay.mjs start --out ${runDir} <target> (or see the template: map/templates/scanners.yaml).`);
  } else {
    let m = null, parsed = false;
    try { m = loadManifest(runDir); parsed = true; }
    catch (e) { err(MANIFEST_FILE, `YAML parse failed (fail-closed): ${e.message}`); }
    if (parsed) {
      if (!m || typeof m !== 'object' || Array.isArray(m) || !m.scanners || typeof m.scanners !== 'object' || Array.isArray(m.scanners)) {
        err(MANIFEST_FILE, `needs a top-level scanners: map (one row per adopted scanner)`);
      } else {
        if (!m.engine) warn(MANIFEST_FILE, `no engine: SHA recorded — a determinism claim cannot separate method drift from engine drift without it`);
        const adopted = adoptedAdapters(ADAPTERS);
        for (const id of Object.keys(adopted)) if (!m.scanners[id]) err(`${MANIFEST_FILE}:${id}`, `adopted scanner has no disposition — record ran, skipped (with the reason), or failed (with the error)`);
        for (const [id, row] of Object.entries(m.scanners)) {
          const at = `${MANIFEST_FILE}:${id}`;
          if (!ADAPTERS[id]) { err(at, `unknown scanner — no adapter map/scanners/adapters/${id}.yaml`); continue; }
          if (!row || typeof row !== 'object' || Array.isArray(row)) { err(at, `disposition must be a map carrying status:`); continue; }
          if (!MANIFEST_STATUS.includes(row.status)) { err(at, `bad status "${row.status}" (ran | skipped | failed)`); continue; }
          if (row.status !== 'ran' && !(typeof row.reason === 'string' && row.reason.trim()))
            err(at, `${row.status} needs a reason — a skip without one is indistinguishable from an omission`);
          if (row.model !== undefined && !(typeof row.model === 'string' && row.model.trim()))
            err(at, `model must be the model id the scanner ran on (a string), or absent`);
          const spendOk = (v) => v === undefined || (typeof v === 'string' && v.trim()) || (Number.isInteger(v) && v >= 0);
          if (!spendOk(row.spend)) err(at, `spend must be what the scanner's inference spent (a string with its unit, or a whole number), or absent`);
          if (!spendOk(row.duration)) err(at, `duration must be how long the scanner ran (a string with its unit, or a whole number of seconds), or absent`);
          if (row.passes !== undefined) {
            if (id !== 'repo-eval') err(at, `passes: is the built-in scanner's per-pass record; ${id} has no passes`);
            else if (!row.passes || typeof row.passes !== 'object' || Array.isArray(row.passes)) err(at, `passes: must be a map of pass → { model, spend }`);
            else for (const [p, v] of Object.entries(row.passes)) {
              if (!REPO_EVAL_PASSES[p]) { err(`${at}:${p}`, `unknown pass — the built-in scanner's passes are ${Object.keys(REPO_EVAL_PASSES).join(', ')}`); continue; }
              if (!v || typeof v !== 'object' || Array.isArray(v) || (v.model === undefined && v.spend === undefined)) { err(`${at}:${p}`, `a pass record carries model:, spend:, or both`); continue; }
              if (v.model !== undefined && !(typeof v.model === 'string' && v.model.trim())) err(`${at}:${p}`, `model must be the model id the pass ran on (a string), or absent`);
              if (!spendOk(v.spend)) err(`${at}:${p}`, `spend must be what the pass's inference spent (a string with its unit, or a whole number), or absent`);
            }
          }
          if (row.status === 'ran') {
            if (row.model === undefined && ADAPTERS[id].role !== 'instrument') {
              // repo-eval may record its model per pass instead: warn for the passes with none
              const passes = row.passes && typeof row.passes === 'object' ? row.passes : {};
              const bare = id === 'repo-eval' ? passFiles.filter(isRepoEvalPassFile).map((f) => f.slice(REPO_EVAL_PASS_PREFIX.length, -'.yaml'.length)).filter((p) => !(passes[p] && passes[p].model)) : [];
              if (id !== 'repo-eval' || !Object.keys(passes).length)
                warn(at, `no model: recorded for a judgment scanner — a repeat cannot separate model drift from method drift`);
              else if (bare.length)
                warn(at, `no model: recorded for pass(es) ${bare.join(', ')} of a judgment scanner — a repeat cannot separate model drift from method drift`);
            }
            const explicitFile = passFiles.includes(`${id}.yaml`);
            if (!sourcesSeen.has(id) && !explicitFile)
              err(at, `status ran, but the base carries no rows from ${id} and no map/findings/${id}.yaml (a verified-clean run writes an explicit empty file — fail loud, never empty); if it did not run, record that: node assay.mjs record ${runDir} ${id} skipped --reason "<why>"`);
            if (ADAPTERS[id].role !== 'instrument' && id !== 'repo-eval' && !existsSync(nativeReportPath(runDir, id)))
              warn(at, `peer scanner ran but the run carries no native report map/native/${id}.md — its port rows are the only record; the package lists no appendix for it`);
          } else if (sourcesSeen.has(id)) {
            err(at, `status ${row.status}, but the base carries rows from ${id} — rows from a scanner recorded as not run are not evidence; if it ran, record it: node assay.mjs record ${runDir} ${id} ran`);
          }
        }
        for (const src of sourcesSeen) if (!m.scanners[src]) err(`${MANIFEST_FILE}:${src}`, `the base carries rows from ${src} but the manifest records no disposition for it`);
        // coverage sidecars (map/coverage/<scanner>.yaml): a scanner's own per-domain
        // account. Complete against the adapter's coverage_domains, and only for a
        // scanner the manifest records as ran — a partial account of a run that did
        // not happen is not evidence either.
        const covDir = coverageDir(runDir);
        for (const f of existsSync(covDir) ? readdirSync(covDir).filter((x) => x.endsWith('.yaml')) : []) {
          const id = f.replace(/\.yaml$/, '');
          const at = `map/coverage/${f}`;
          if (!ADAPTERS[id]) { err(at, `coverage sidecar for unknown scanner ${id} (no adapter)`); continue; }
          let doc = null;
          try { doc = parseYaml(readFileSync(join(covDir, f), 'utf8')); } catch (e) { err(at, `YAML parse failed (fail-closed): ${e.message}`); continue; }
          if (!doc || doc.scanner !== id || !doc.coverage || typeof doc.coverage !== 'object') { err(at, `needs scanner: ${id} and a coverage: map`); continue; }
          const row = m.scanners[id];
          if (!row || row.status !== 'ran') err(at, `coverage recorded for ${id} but the manifest does not record it as ran`);
          const want = ADAPTERS[id].coverage_domains || [];
          const missing = want.filter((l) => !doc.coverage[l] || typeof doc.coverage[l] !== 'object');
          if (missing.length) err(at, `coverage incomplete: no row for domain(s) ${missing.join(', ')} (absence of a row is not clean)`);
          for (const [l, r] of Object.entries(doc.coverage)) {
            if (!['scanned', 'partial', 'not-scanned', 'not-applicable'].includes(r && r.status)) err(`${at}:${l}`, `bad status "${r && r.status}"`);
            else if (r.status !== 'scanned' && !(r.note && String(r.note).trim())) err(`${at}:${l}`, `${r.status} needs a note`);
          }
        }
      }
    }
  }
}

// optional: evidence against the target repo (fail-closed on a cited path that does not
// exist, and on a cited line past the end of the file it names). A path that resolves
// and a line inside the file is what --target can check; it cannot check that the line
// says what the observation claims.
const evidencePathErrors = [];   // structured, for --json / map/backlog.mjs
if (target) {
  if (!existsSync(target)) { err('--target', `target repo not found: ${target}`); }
  else for (const [id, { f, file }] of allById) {
    if (!Array.isArray(f.evidence)) continue;
    for (const ev of f.evidence) {
      const m = typeof ev === 'string' ? ev.trim().match(CITE) : null;
      if (!m || !m[1]) continue;   // not path:line is already a schema error (emptyCites)
      const p = m[1], end = Number(m[3] || m[2]);
      // an instrument's repo-level claim cites its archived raw report (run-relative
      // map/raw/…), which lives in the run, not the target — skip, don't fail.
      if (isInstrument(f.source) && p.startsWith('map/')) continue;
      if (!existsSync(join(target, p))) { err(`${file}:${id}`, `evidence path not found in target: ${p}`); evidencePathErrors.push({ finding: id, file, path: p }); continue; }
      if (!statSync(join(target, p)).isFile()) continue;   // a directory (a repo-level `./:1`) has no lines to count
      const txt = readFileSync(join(target, p), 'utf8');
      const lines = txt === '' ? 0 : txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0);
      if (end > lines) { err(`${file}:${id}`, `evidence line ${m[3] ? `${m[2]}-${m[3]}` : m[2]} is past the end of ${p} (${lines} lines)`); evidencePathErrors.push({ finding: id, file, path: p, line: end }); }
    }
  }
}

// cross-reference link resolution among findings
for (const [id, { f, file }] of allById) {
  for (const linkKey of ['reaches','explained_by','escapes']) {
    const v = f[linkKey];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v)) { err(`${file}:${id}`, `${linkKey} must be a list`); continue; }
    for (const ref of v) if (!allById.has(ref)) err(`${file}:${id}`, `${linkKey} → unknown finding ${ref}`);
  }
}

// the owner's triage overlay (owner/decisions.yaml, map/decisions.mjs): optional, but
// when present it moves gaps off the open count, so it is validated, never trusted —
// a map-shaped file once read as no decisions, an unknown action as open, an accept
// with no reason as waived, and `by` took an email address the packet refuses.
const decPath = decisionsPath(runDir);
if (existsSync(decPath)) {
  const label = 'owner/decisions.yaml';
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  let decs;
  try { decs = parseYaml(readFileSync(decPath, 'utf8')); } catch (e) { err(label, `YAML parse failed (fail-closed): ${e.message}`); decs = undefined; }
  if (decs !== undefined && !Array.isArray(decs)) err(label, `expected a top-level list of decisions, one item per decided finding (map/decisions.mjs)`);
  else if (decs) {
    const seen = new Set();
    decs.forEach((x, i) => {
      const at = `${label}[${i}]`;
      if (!x || typeof x !== 'object' || Array.isArray(x)) { err(at, `a decision must be a map (finding, action, reason, by, at)`); return; }
      for (const k of Object.keys(x)) if (!DECISION_KEYS.includes(k)) err(at, `unknown key "${k}" (${DECISION_KEYS.join(', ')})`);
      if (!x.finding) err(at, `missing finding`);
      else if (!allById.has(x.finding)) err(at, `finding ${x.finding} is not in this run`);
      else if (seen.has(x.finding)) err(at, `a second decision for ${x.finding} (one item per decided finding)`);
      seen.add(x.finding);
      if (!DECISION_ACTIONS.includes(x.action)) err(at, `bad action "${x.action}" (${DECISION_ACTIONS.join(' | ')})`);
      if ((x.action === 'accept' || x.action === 'snooze') && !(typeof x.reason === 'string' && x.reason.trim())) err(at, `${x.action} needs a reason — a waiver with no why cannot be reviewed`);
      if (x.snooze_until != null && x.action !== 'snooze') err(at, `snooze_until is for a snooze only`);
      if (x.snooze_until != null && !ISO_DATE.test(String(x.snooze_until))) err(at, `snooze_until must be a YYYY-MM-DD date (got "${x.snooze_until}")`);
      if (x.at != null && !ISO_DATE.test(String(x.at))) err(at, `at must be a YYYY-MM-DD date (got "${x.at}")`);
      if (!(typeof x.by === 'string' && x.by.trim())) err(at, `missing by — who decided, as a role or a handle`);
      else if (emailShape(x.by) || looksLikePersonName(x.by)) err(at, `by must be a role or a handle (platform-eng, @handle), never an email address or a person's name`);
    });
  }
}

// fail-closed PROJECTION gate (coverage integrity, CI-enforced — not render-only):
// every finding must project onto an axis through its scanner's adapter, or be an
// explicitly-classified `unprompted` finding. An unmapped native category halts here,
// so a base carrying a finding no axis can hold cannot pass validation and slip into
// a report as a silent drop. A gap parked `unprompted` with no axis is also refused.
try {
  const all = [...allById.values()].map((v) => v.f);
  const { unmapped, needsAxis } = projectMulti(all, loadAdapters());
  for (const u of unmapped) err(`projection:${u.id}`, `native category "${u.cat}" has no adapter row (fail-closed — add a mapping or an explicit axis)`);
  for (const n of needsAxis) {
    const pol = n.f && n.f.polarity;
    if (pol === 'gap') err(`projection:${n.id}`, `unprompted GAP has no axis — an unresolved gap must not be parkable (assign an axis)`);
  }
} catch (e) { err('projection', `projection gate failed to run: ${e.message.split('\n')[0]}`); }

// citation-integrity: every F-### mentioned in a view / synthesis / report resolves
function citationsIn(path) {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, 'utf8');
  const refs = new Set(txt.match(/F-\d{3,}/g) || []);
  for (const r of refs) if (!allById.has(r)) err(basename(path), `cites unknown finding ${r}`);
}
for (const p of [leveragePath(runDir), runMaturityPath(runDir), securityPath(runDir)]) citationsIn(p);
citationsIn(improvePagePath(runDir));

// security gate sidecar (views/improve/security-gate.yaml)
const gatePath = securityGatePath(runDir);
const gateLabel = 'views/improve/security-gate.yaml';
if (existsSync(gatePath)) {
  let gate;
  try { gate = parseYaml(readFileSync(gatePath, 'utf8')); }
  catch (e) { err(gateLabel, `YAML parse failed (fail-closed): ${e.message}`); gate = null; }
  if (gate) {
    const ex = gate.exposures;
    if (!Array.isArray(ex)) err(gateLabel, `exposures must be a list`);
    else for (const e of ex) {
      const at = `${gateLabel}:${e && e.name || '??'}`;
      if (!e || typeof e !== 'object') { err(gateLabel, `exposure is not a mapping`); continue; }
      if (!e.name) err(at, `exposure missing name`);
      if (!e.title) err(at, `exposure missing title (the human display name the report renders)`);
      if (e.standing_watch !== undefined && typeof e.standing_watch !== 'boolean') err(at, `standing_watch must be boolean`);
      if (e.who !== undefined && !WHO.has(e.who)) err(at, `bad who "${e.who}"`);
      if (e.likelihood !== undefined && !LIKELIHOOD.has(e.likelihood)) err(at, `bad likelihood "${e.likelihood}"`);
      if (!Array.isArray(e.findings) || e.findings.length === 0) err(at, `findings must be a non-empty list`);
      else for (const r of e.findings) if (!allById.has(r)) err(at, `findings → unknown finding ${r}`);
    }
  }
}

// solution coverage (fail-closed): every UNSUPERVISED kind — an unguarded halt — must trace
// to a roadmap fix (by findings or covers_channels) OR carry an explicit disposition (a logged
// reason it is not fixed). No silent gap. This is the remediation-side analogue of the
// fail-closed-discovery rule above (every unheld-halt effect must state preconditions): there,
// no gap is discovered without its difficulty; here, no gap is left without a plan or a reason.
// Gated on views/improve/prose.yaml (the roadmap source): a base-only run has no Pass-8 layer to check.
const prosePath = runProsePath(runDir);
if (existsSync(prosePath)) {
  let prose;
  try { prose = parseYaml(readFileSync(prosePath, 'utf8')); }
  catch (e) { err('views/improve/prose.yaml', `YAML parse failed (fail-closed): ${e.message}`); prose = null; }
  if (prose && Array.isArray(prose.roadmap)) {
    // roadmap decision structure (SCHEMA.md prose block): an unknown is a variable with a stated
    // default. Fail-closed on the new fields; the legacy `questions:` list stays accepted, with a warning.
    const nonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
    prose.roadmap.forEach((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const at = 'views/improve/prose.yaml:roadmap';
      const slug = r.slug || `item-${i + 1}`;
      if (!/^[a-z0-9-]+$/.test(String(slug)))   // the same rule as views/improve/sequence.mjs SLUG_RE
        err(at, `roadmap item ${JSON.stringify(String(slug))}: slug must match ^[a-z0-9-]+$ (it names the plan file; a path segment would write outside handoff/)`);
      if (r.assumptions !== undefined) {
        if (!Array.isArray(r.assumptions) || r.assumptions.some((a) => !nonEmptyStr(a))) err(at, `roadmap item "${slug}": assumptions must be a list of non-empty strings`);
      }
      if (r.question !== undefined) {
        const q = r.question;
        if (!q || typeof q !== 'object' || Array.isArray(q)) err(at, `roadmap item "${slug}": question must be an object {text, recommended, blocking?}`);
        else {
          if (!nonEmptyStr(q.text)) err(at, `roadmap item "${slug}": question.text must be a non-empty string`);
          if (!nonEmptyStr(q.recommended)) err(at, `roadmap item "${slug}": question.recommended must be a non-empty string (the answer we proceed with)`);
          if (q.blocking !== undefined && typeof q.blocking !== 'boolean') err(at, `roadmap item "${slug}": question.blocking must be boolean`);
        }
      }
      if (Array.isArray(r.options)) {
        const recs = r.options.filter((o) => o && typeof o === 'object' && o.recommended !== undefined);
        for (const o of recs) if (typeof o.recommended !== 'boolean') err(at, `roadmap item "${slug}": option "${o.name}" recommended must be boolean`);
        if (recs.filter((o) => o.recommended === true).length > 1) err(at, `roadmap item "${slug}": at most one option may be recommended: true`);
      }
      if (r.questions !== undefined) {
        const n = Array.isArray(r.questions) ? r.questions.length : 0;
        const newShape = (Array.isArray(r.assumptions) && r.assumptions.length) || r.question !== undefined || (Array.isArray(r.options) && r.options.some((o) => o && o.recommended === true));
        const ignored = newShape ? ' (the plan prompt ignores `questions:` once assumptions, question or a recommended option is present)' : '';
        warn(at, `roadmap item "${slug}" uses questions:${n > 1 ? ` with ${n} entries` : ''} — prefer assumptions plus at most one question with a recommended answer${ignored}`);
      }
    });
    const { buildSupervision } = await import('./supervision.mjs');
    const sup = buildSupervision([...allById.values()].map((v) => v.f), prose.roadmap, prose.channel_notes || {});
    const DISPO_REASON = new Set(['accepted', 'deferred', 'out-of-scope']);
    const dispo = new Map();
    for (const d of (Array.isArray(prose.dispositions) ? prose.dispositions : [])) {
      if (!d || !d.channel) { err('views/improve/prose.yaml:dispositions', `disposition missing channel`); continue; }
      if (!DISPO_REASON.has(d.reason)) err('views/improve/prose.yaml:dispositions', `disposition "${d.channel}" bad reason "${d.reason}" (accepted|deferred|out-of-scope)`);
      if (!d.note) err('views/improve/prose.yaml:dispositions', `disposition "${d.channel}" needs a note (the reason it is not fixed)`);
      dispo.set(d.channel, d);
    }
    for (const k of sup.kinds) {
      if (!k.fixes.length && !dispo.has(k.channel))
        err('views/improve/prose.yaml', `unsupervised kind "${k.channel}" has no fix (a roadmap item's findings or covers_channels) and no disposition — every gap must trace to a remediation or a logged reason (solution-coverage, fail-closed)`);
    }
    const unsup = new Set(sup.kinds.map((k) => k.channel));
    for (const ch of dispo.keys()) if (!unsup.has(ch)) warn('views/improve/prose.yaml:dispositions', `disposition for "${ch}" but it is not an unsupervised kind (stale — the gap it excused is closed or gone)`);
  }
}

// ── canon check (SCHEMA.md §8) — advisory drift against the declared enumeration contract.
// Opt-in: the run names its canon in the prose (`canon: <name>`), or a map-only lane passes
// `--canon <name>` (the flag wins over the prose). A named-but-missing canon is an ERROR (a
// declared contract must be present), and so is a census population with no membership rule
// or an unknown subject_type (two runs would enumerate different members); a present canon
// surfaces effect-channel drift as non-fatal WARNINGS — a run may lead or lag its canon, and
// closing the drift is a canon-maintenance decision (a reviewed diff), never a per-run gate.
const cIdx = process.argv.indexOf('--canon');
let canonName = cIdx > -1 ? process.argv[cIdx + 1] : null;
if (!canonName && existsSync(prosePath)) {
  try { canonName = (parseYaml(readFileSync(prosePath, 'utf8')) || {}).canon || null; } catch { /* reported above */ }
}
if (cIdx > -1 && !canonName) err('--canon', 'names no canon (usage: --canon <name>)');
if (canonName) {
  // Resolution order (SCHEMA.md §8): (1) the run's instance entry — runs live at
  // <entry>/runs/<run>/ with the target's canon at <entry>/canon/<name>.yaml
  // (custody layout, reorganization 2026-08-11); (2) canon/ next to this tool
  // (portable layout — repo-eval copied into a target repo).
  const candidates = [
    join(arg, '..', '..', 'canon', `${canonName}.yaml`),
    join(HERE, 'canon', `${canonName}.yaml`),
  ];
  const canonPath = candidates.find((p) => existsSync(p));
  const at = `canon/${canonName}.yaml`;
  if (!canonPath) {
    err(cIdx > -1 ? '--canon' : 'views/improve/prose.yaml', `canon: "${canonName}" names canon/${canonName}.yaml, which exists neither in the run's instance entry nor beside the tool (fail-closed — a declared contract must be present)`);
  } else {
    let canon = null;
    try { canon = parseYaml(readFileSync(canonPath, 'utf8')); }
    catch (e) { err(at, `YAML parse failed (fail-closed; a canon is written in block style): ${e.message}`); }
    if (canon) {
      const pops = canon.census_populations;
      if (pops !== undefined && (!pops || typeof pops !== 'object' || Array.isArray(pops))) err(at, `census_populations must be a map of population name → {subject_type, rule}`);
      else for (const [name, p] of Object.entries(pops || {})) {
        if (!p || typeof p !== 'object' || Array.isArray(p)) { err(at, `census population "${name}" must be a map with subject_type and rule`); continue; }
        if (!SUBJECT.has(p.subject_type)) err(at, `census population "${name}" has subject_type "${p.subject_type}" (want one of ${[...SUBJECT].join(' | ')})`);
        if (typeof p.rule !== 'string' || !p.rule.trim()) err(at, `census population "${name}" states no membership rule (rule: which members count, what is excluded) — two runs would enumerate different populations`);
      }
      const canonCh = new Set((Array.isArray(canon.effect_channels) ? canon.effect_channels : []).map((c) => c && c.slug).filter(Boolean));
      const runCh = new Set([...allById.values()].map((v) => v.f).filter((f) => f.subject_type === 'effect' && f.effect && f.effect.channel).map((f) => f.effect.channel));
      for (const ch of runCh) if (!canonCh.has(ch)) warn(at, `run effect channel "${ch}" is not in the canon (drift — add it to the canon, or fix the finding's channel)`);
      for (const ch of canonCh) if (!runCh.has(ch)) warn(at, `canon channel "${ch}" has no effect finding in this run (declared population member not assessed)`);
    }
  }
}

// maturity grades tail (optional): coverage schema (SCHEMA.md §6b) + drift check.
// The file is GENERATED (views/improve/maturity.mjs --write); the counted numbers are
// recomputed here from the base and any mismatch is an error — the maturity
// view's own "enforced" property, applied to itself.
const gradesPath = maturityGradesPath(runDir);
const gradesLabel = 'views/improve/maturity-grades.yaml';
if (existsSync(gradesPath)) {
  let grades;
  try { grades = parseYaml(readFileSync(gradesPath, 'utf8')); }
  catch (e) { err(gradesLabel, `YAML parse failed (fail-closed): ${e.message}`); grades = null; }
  if (grades && grades.schema !== 'coverage') {
    err(gradesLabel, `maturity grades must carry schema: coverage — regenerate: node assay.mjs maturity <run> --write`);
  } else if (grades) {
    if (!Array.isArray(grades.dimensions)) err(gradesLabel, `dimensions must be a list`);
    else {
      const { computeCoverage } = await import('../views/improve/maturity.mjs');
      const recomputed = computeCoverage([...allById.values()].map((v) => v.f));
      const reByDim = Object.fromEntries(recomputed.dimensions.map((d) => [d.dimension, d]));
      // sampled rows are re-derived from their authored source, map/censuses.yaml, the way
      // counted rows are re-derived from the base: a sampled number hand-edited in the
      // generated file (and the aggregate re-pooled to match) must not validate.
      let censusDims = {};
      if (existsSync(censusesPath(runDir))) {
        try {
          const cz = parseYaml(readFileSync(censusesPath(runDir), 'utf8'));
          censusDims = Object.fromEntries(((cz && cz.dimensions) || []).filter((x) => x && x.dimension).map((x) => [x.dimension, x]));
        } catch (e) { err('map/censuses.yaml', `YAML parse failed (fail-closed): ${e.message}`); }
      }
      const sampledDrift = (at, dim, row) => {
        if (!row.name) { err(at, `sampled coverage must name its measure (the census row it comes from)`); return; }
        const src = ((censusDims[dim] && censusDims[dim].sampled) || []).find((x) => x && x.name === row.name);
        if (!src) { err(at, `sampled measure "${row.name}" has no census in map/censuses.yaml — a sampled number with no authored source cannot be checked`); return; }
        if (src.met !== row.met || src.of !== row.of) err(at, `sampled drift: file says ${row.met}/${row.of}, map/censuses.yaml records ${src.met}/${src.of} — regenerate with maturity.mjs --write`);
        else if (String(src.method || '') !== String(row.method || '')) err(at, `sampled drift: method differs from map/censuses.yaml — regenerate with maturity.mjs --write`);
      };
      for (const d of grades.dimensions) {
        const at = `${gradesLabel}:${d && d.dimension || '??'}`;
        if (!d || !DIMENSIONS.has(d.dimension)) { err(at, `bad or missing dimension`); continue; }
        const c = d.coverage;
        if (!c && !d.not_measured) err(at, `needs coverage or not_measured`);
        if (c) {
          if (!['counted', 'sampled'].includes(c.kind)) err(at, `coverage.kind must be counted|sampled`);
          if (typeof c.met !== 'number' || typeof c.of !== 'number' || c.of < 1) err(at, `coverage needs numeric met/of`);
          else if (c.pct !== Math.round((c.met / c.of) * 100)) err(at, `coverage.pct ${c.pct} does not equal met/of`);
          if (c.kind === 'sampled' && !c.method) err(at, `sampled coverage must state its method`);
          if (c.kind === 'sampled') sampledDrift(at, d.dimension, { name: c.measure, met: c.met, of: c.of, method: c.method });
          if (c.kind === 'counted') {
            const re = reByDim[d.dimension] && reByDim[d.dimension].measures.find((mm) => mm.name === c.measure);
            if (!re) err(at, `counted measure "${c.measure}" is not one this base computes`);
            else if (re.met !== c.met || re.of !== c.of) err(at, `counted drift: file says ${c.met}/${c.of}, base computes ${re.met}/${re.of} — regenerate with maturity.mjs --write`);
          }
        }
        for (const sr of (Array.isArray(d.secondary) ? d.secondary : [])) if (sr && sr.kind === 'sampled') sampledDrift(`${at}:${sr.name}`, d.dimension, sr);
        if (!d.depth) err(at, `needs an authored depth sentence (map/censuses.yaml)`);
        for (const k of ['enforced', 'generative']) {
          const f = d[k];
          if (f !== false && !(f && f.claim === true && f.why)) err(at, `${k} must be false or an earned claim with a why`);
          if (f && f.claim === true && (!Array.isArray(f.evidence) || !f.evidence.length)) err(at, `${k} claimed without evidence ids`);
        }
      }
      // aggregate drift (the headline number): the pooled aggregate MUST be a faithful
      // function of the file's own measured per-dimension rows — the counted rows are
      // drift-checked against the base above, the sampled rows carry a stated method, so
      // re-deriving the aggregate from them closes the hand-inflated-headline hole
      // (a real baseline once had a hand-editable aggregate diverge from its rows while every row validated).
      if (grades.aggregate) {
        const measured = grades.dimensions.filter((d) => d && d.coverage &&
          typeof d.coverage.met === 'number' && typeof d.coverage.of === 'number' && d.coverage.of >= 1);
        const met = measured.reduce((a, d) => a + d.coverage.met, 0);
        const of = measured.reduce((a, d) => a + d.coverage.of, 0);
        const pctExp = of ? Math.round((met / of) * 100) : 0;
        const a = grades.aggregate;
        if (a.met !== met || a.of !== of)
          err(`${gradesLabel}:aggregate`, `aggregate ${a.met}/${a.of} does not pool the measured rows (${met}/${of}) — regenerate: node assay.mjs maturity <eval-dir> --write`);
        else if (a.pct !== pctExp)
          err(`${gradesLabel}:aggregate`, `aggregate.pct ${a.pct} does not equal met/of (${pctExp})`);
        if (typeof a.over === 'number' && a.over !== measured.length)
          err(`${gradesLabel}:aggregate`, `aggregate.over ${a.over} does not equal the measured-row count (${measured.length})`);
      }
    }
  }
}

// ── the run's data files (lib/run-data.mjs): read back, fail-closed ─────────
// Each is optional (written by a later step), and each that is present must hold its
// schema; the chains and the sequence must name only ids this base carries.
{
  const baseIds = new Set(allById.keys());
  const dataFiles = [
    { path: chainsDataPath(runDir), label: 'views/improve/chains.json', kind: 'json', check: (d) => checkChains(d, baseIds) },
    { path: handoffSequencePath(runDir), label: 'handoff/sequence.json', kind: 'json', check: (d) => checkSequence(d, baseIds) },
    { path: backlogPath(runDir), label: 'map/backlog.yaml', kind: 'yaml', check: checkBacklog },
    { path: backlogAuthoredPath(runDir), label: 'map/backlog-authored.yaml', kind: 'yaml', check: checkAuthoredBacklog },
  ];
  for (const { path, label, kind, check } of dataFiles) {
    if (!existsSync(path)) continue;
    let doc;
    try { const src = readFileSync(path, 'utf8'); doc = kind === 'json' ? JSON.parse(src) : parseYaml(src); }
    catch (e) { err(label, `${kind.toUpperCase()} parse failed (fail-closed): ${e.message}`); continue; }
    for (const m of check(doc)) err(label, m);
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const total = allById.size;
// the yardstick's measurement tail (optional): yardstick.yaml + drift check. The
// file is GENERATED (yardstick/measure.mjs --write, run by views/compile.mjs);
// every status is recomputed here from the base, the manifest, the censuses and
// the scanner coverage, and any mismatch is an error — a stale read would let a
// claim outlive the fact it rode on.
const yardstickResultPath = runYardstickPath(runDir);
const yardstickLabel = 'yardstick.yaml';
if (existsSync(yardstickResultPath)) {
  let view;
  try { view = parseYaml(readFileSync(yardstickResultPath, 'utf8')); }
  catch (e) { err(yardstickLabel, `YAML parse failed (fail-closed): ${e.message}`); view = null; }
  if (view && view.schema !== 'yardstick') err(yardstickLabel, `schema must be yardstick — regenerate: node assay.mjs measure <run-dir> --write`);
  else if (view) {
    const { projectRun } = await import('../yardstick/measure.mjs');
    let re = null;
    try { re = projectRun(runDir); } catch (e) { err(yardstickLabel, `could not recompute the measurement: ${e.message}`); }
    if (re) {
      const reById = Object.fromEntries(re.map((r) => [r.id, r]));
      const rows = Array.isArray(view.requirements) ? view.requirements : [];
      if (rows.length !== re.length) err(yardstickLabel, `carries ${rows.length} requirements, the yardstick has ${re.length} — regenerate`);
      // the id SET, not only the count: a duplicated row keeps the count only by dropping
      // another, and with the count equal a dropped row is the tell
      const ids = new Set(rows.map((r) => r && r.id));
      for (const x of re) if (!ids.has(x.id)) err(yardstickLabel, `carries no row for ${x.id} — regenerate: node assay.mjs measure <run-dir> --write`);
      for (const r of rows) {
        const at = `${yardstickLabel}:${r && r.id || '??'}`;
        const x = r && reById[r.id];
        if (!x) { err(at, `not a requirement in the yardstick`); continue; }
        if (r.status !== x.status) err(at, `requirement drift: file says ${r.status}, the map computes ${x.status} — regenerate: node assay.mjs measure <run-dir> --write`);
        if (r.how !== x.how) err(at, `mechanism drift: file says ${r.how}, the yardstick decides by ${x.how}`);
        if ((r.basis || 'run') !== (x.basis || 'run')) err(at, `basis drift: file says ${r.basis || 'run'}, the map computes ${x.basis || 'run'} (owner/PACKET.md) — regenerate: node assay.mjs measure <run-dir> --write`);
      }
      // contradictions (owner/PACKET.md "Claims and a run, compared"): a packet claim of
      // satisfied against a run-decided unmet row — recomputed the same way, same drift rule.
      const fileContras = Array.isArray(view.contradictions) ? view.contradictions : [];
      const reContras = re.contradictions || [];
      if (JSON.stringify(fileContras) !== JSON.stringify(reContras))
        err(yardstickLabel, `contradictions drift: the file's contradictions: list does not match what the map recomputes — regenerate: node assay.mjs measure <run-dir> --write`);
    }
  }
}

if (process.argv.includes('--json')) {   // machine-readable for map/backlog.mjs
  console.log(JSON.stringify({ ok: errors.length === 0, total, errors, warnings, evidencePathErrors }, null, 2));
  // exit reflects the verdict even in JSON mode — a CI wiring that checks only the
  // exit code must never read green over a red base. Callers that want the payload
  // on failure read stdout from the non-zero exit (map/backlog.mjs does).
  process.exit(errors.length ? 1 : 0);
}
if (errors.length) {
  console.error(`✗ assay validate: ${errors.length} violation(s) across ${total} findings in ${evalDir}\n`);
  for (const e of errors) console.error('  • ' + e);
  process.exit(1);
}
if (warnings.length) {   // non-fatal — printed, exit stays 0 (green)
  console.log(`⚠ assay validate: ${warnings.length} warning(s) (non-fatal):`);
  for (const w of warnings) console.log('  • ' + w);
}
console.log(`✓ assay validate: ${total} findings, ${passFiles.length} pass files — schema, ids, filename↔dimension, links, citations, and the run manifest all clean.`);
