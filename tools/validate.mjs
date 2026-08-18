#!/usr/bin/env node
// assay findings validator — the format contract, enforced.
// Usage:  node tools/validate.mjs <run-dir>
//   <run-dir> is a run root (…/runs/<slug>-<date>/) or its eval/ subdir.
// Exits non-zero on any violation. Zero-dependency: a minimal YAML reader tuned
// to SCHEMA.md's constrained subset that FAILS CLOSED — an input it cannot parse
// is an error, not a pass — a checker that silently accepts unparseable input hides the very thing it exists to catch.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';

// ── controlled vocabularies (SCHEMA.md §2) ──────────────────────────────────
const DIMENSIONS = new Set(['artifact-legibility','context-economy','deterministic-gates','verification','delegation','improvement-loop','multiplayer','unprompted']);
const POLARITY = new Set(['strength','gap','fact']);
const SUBJECT = new Set(['effect','control','artifact','contract','process','capability']);
const CONFIDENCE = new Set(['confirmed','plausible','unverified']);
const REVERSIBILITY = new Set(['reversible','reversible-with-window','irreversible']);
const GATE_TYPE = new Set(['deterministic-halt','staged-reversible','scope-bound','rate-throttle','disclosure-only','external-halt','none']);
const TELEMETRY = new Set(['none','unstructured','structured-event','audited']);
const BLAST = new Set(['user','tenant','fleet','cross-tenant']);
const FAIL_MODE = new Set(['open','closed']);
const PRECONDITIONS = new Set(['prompt-injection','stolen-credential','malicious-dependency','network-position','insider','zero-day','physical']);
// overlay layer (SCHEMA.md §2a) — OPTIONAL, backward-compatible. A finding may
// carry an explicit `axis`; absent is valid (the adapter projects it). The valid
// set is DERIVED from the adapters — axes are scanner-contributed, so the vocab
// is open by design: every axis any adapter contributes or maps to. The retired
// five-domain names are grandfathered on frozen findings (`domain:`) and
// translate mechanically (project.mjs LEGACY_DOMAIN_AXIS); new findings never
// carry them. See integration/scanner-contract.md.
const { loadAdapters, projectMulti, LEGACY_DOMAIN_AXIS } = await import('./project.mjs');
const AXES = new Set();
let ADAPTERS = {};
try {
  ADAPTERS = loadAdapters();
  for (const a of Object.values(ADAPTERS)) {
    for (const x of (a.contributes || [])) AXES.add(x);
    for (const row of Object.values(a.map || {})) if (row && row.axis) AXES.add(row.axis);
  }
} catch { /* adapters unreadable — the projection gate below reports it */ }
const LEGACY_DOMAINS = new Set(Object.keys(LEGACY_DOMAIN_AXIS));
const isInstrument = (src) => ADAPTERS[src]?.role === 'instrument';
// gate sidecar vocab (SCHEMA.md §6)
const GATE_STAGE = new Set(['alpha','beta','prod','none','clear']);
const WHO = new Set(['stranger-pre-auth','authorized-real-user','only-at-scale-or-adversarial']);
const LIKELIHOOD = new Set(['high','moderate','low']);

// ── filename ↔ dimension mapping ────────────────────────────────────────────
// Ids are F-### unique within a run, carrying NO dimension meaning (decoupled 2026-08-05):
// the `dimension` field + filename↔dimension agreement is the source of truth for a finding's
// dimension. No per-dimension id bands, no fixed budget, no ceiling. See SCHEMA §3.
const FILE_DIM = {
  'findings-01-legibility.yaml': 'artifact-legibility',
  'findings-02-context.yaml': 'context-economy',
  'findings-03-gates.yaml': 'deterministic-gates',
  'findings-04-verification.yaml': 'verification',
  'findings-05-delegation.yaml': 'delegation',
  'findings-06-improvement.yaml': 'improvement-loop',
  'findings-07-multiplayer.yaml': 'multiplayer',
};

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warnings = [];   // non-fatal: surfaced but do not fail the build (extension point; currently unused)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ── load findings ───────────────────────────────────────────────────────────
function locateEval(runDir) {
  if (existsSync(join(runDir, 'findings.yaml'))) return runDir;
  const ev = join(runDir, 'eval');
  if (existsSync(join(ev, 'findings.yaml'))) return ev;
  // allow pointing at a dir that has per-pass files but no merged file yet
  if (existsSync(runDir) && readdirSync(runDir).some((f) => /^findings-\d\d-/.test(f))) return runDir;
  if (existsSync(ev) && readdirSync(ev).some((f) => /^findings-\d\d-/.test(f))) return ev;
  return runDir;
}

const arg = process.argv[2];
if (!arg) { console.error('usage: node validate.mjs <run-dir> [--target <target-repo>]'); process.exit(2); }
// Optional: verify every evidence path resolves to a real file in the TARGET repo.
// Off by default so the validator stays portable (a run may be checked without the
// target present); when --target is given it fails closed on a cited path that does
// not exist — the "agent cited a plausible path it never opened" class (e.g. a
// container mount alias instead of the repo path). Enable in-session; skip in CI.
const tIdx = process.argv.indexOf('--target');
const target = tIdx > -1 ? process.argv[tIdx + 1] : null;
const evalDir = locateEval(arg);
if (!existsSync(evalDir)) { console.error(`no such dir: ${evalDir}`); process.exit(2); }

const allById = new Map();       // id -> {finding, file}
const passFiles = readdirSync(evalDir).filter((f) => /^findings-\d\d-.*\.yaml$/.test(f)).sort();

function checkFinding(f, fileLabel, expectDim) {
  const id = f.id;
  const at = `${fileLabel}:${id || '??'}`;
  if (!id || !/^F-\d{3}$/.test(String(id))) { err(at, `bad or missing id (want F-###)`); return; }
  if (allById.has(id)) err(at, `duplicate id (also in ${allById.get(id).file})`);
  else allById.set(id, { f, file: fileLabel });
  // External-scanner findings (overlay, SCHEMA §2a): a finding from another
  // evaluator carries `source` + `native_category` and is validated under the
  // PORT (integration/scanner-contract.md §1), not the native repo-eval schema —
  // no `dimension`/`subject_type`. Its axis is derived by its adapter at
  // projection, so it need not carry one here; if it does, the vocab is checked.
  const external = f.source && f.source !== 'repo-eval';
  if (external) {
    for (const k of ['source','native_category','observation','evidence','polarity']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') err(at, `missing required key (external finding): ${k}`);
    }
    if (f.polarity && !POLARITY.has(f.polarity)) err(at, `bad polarity "${f.polarity}"`);
    if (f.evidence !== undefined && (!Array.isArray(f.evidence) || f.evidence.length === 0)) err(at, `evidence must be a non-empty list`);
    if (f.axis !== undefined && !AXES.has(f.axis)) err(at, `bad axis "${f.axis}"`);
    if (f.domain !== undefined && !LEGACY_DOMAINS.has(f.domain)) err(at, `bad legacy domain "${f.domain}" (new findings carry axis:)`);
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
  // overlay layer (optional; validated only when present — SCHEMA.md §2a)
  if (f.axis !== undefined && !AXES.has(f.axis)) err(at, `bad axis "${f.axis}"`);
  if (f.domain !== undefined && !LEGACY_DOMAINS.has(f.domain)) err(at, `bad legacy domain "${f.domain}" (new findings carry axis:)`);
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
      // fail-closed discovery: an unheld halt is a chain sink, and its difficulty is
      // chain-critical, so its preconditions must be determined, never left to default.
      const gateOpen = e.gate_type === 'none' || e.gate_type === 'disclosure-only' || e.fail_mode === 'open';
      const isSink = (e.reversibility === 'irreversible' || e.external === true) && gateOpen;
      if (isSink && (!Array.isArray(f.preconditions) || !f.preconditions.length))
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

// optional: evidence-path existence against the target repo (fail-closed on a
// cited path that does not exist — verifies the analyst actually opened the file)
const evidencePathErrors = [];   // structured, for --json / tools/backlog.mjs
if (target) {
  if (!existsSync(target)) { err('--target', `target repo not found: ${target}`); }
  else for (const [id, { f, file }] of allById) {
    if (!Array.isArray(f.evidence)) continue;
    for (const ev of f.evidence) {
      const p = String(ev).trim().replace(/:\d+(?:-\d+)?$/, '');   // strip :line or :a-b
      if (!p) continue;
      // an instrument's repo-level claim cites its archived raw report (run-relative
      // eval/raw/…), which lives in the run, not the target — skip, don't fail.
      if (isInstrument(f.source) && p.startsWith('eval/')) continue;
      if (!existsSync(join(target, p))) { err(`${file}:${id}`, `evidence path not found in target: ${p}`); evidencePathErrors.push({ finding: id, file, path: p }); }
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
  const refs = new Set(txt.match(/F-\d{3}/g) || []);
  for (const r of refs) if (!allById.has(r)) err(basename(path), `cites unknown finding ${r}`);
}
for (const v of ['view-leverage.md','view-maturity.md','view-security.md','AI-NATIVE-EVAL.md'])
  citationsIn(join(evalDir, v));
// maintainer report may live at run root (one level up from eval/)
const runRoot = basename(evalDir) === 'eval' ? join(evalDir, '..') : evalDir;
citationsIn(join(runRoot, 'MAINTAINER-REPORT.md'));

// security gate sidecar
const gatePath = join(evalDir, 'view-security-gate.yaml');
if (existsSync(gatePath)) {
  let gate;
  try { gate = parseYaml(readFileSync(gatePath, 'utf8')); }
  catch (e) { err('view-security-gate.yaml', `YAML parse failed (fail-closed): ${e.message}`); gate = null; }
  if (gate) {
    if (!GATE_STAGE.has(gate.gate)) err('view-security-gate.yaml', `bad gate "${gate.gate}"`);
    const ex = gate.exposures;
    if (!Array.isArray(ex)) err('view-security-gate.yaml', `exposures must be a list`);
    else for (const e of ex) {
      const at = `view-security-gate.yaml:${e && e.name || '??'}`;
      if (!e || typeof e !== 'object') { err('view-security-gate.yaml', `exposure is not a mapping`); continue; }
      if (!e.name) err(at, `exposure missing name`);
      if (!e.title) err(at, `exposure missing title (the human display name the report renders)`);
      if (!GATE_STAGE.has(e.blocks_stage)) err(at, `bad blocks_stage "${e.blocks_stage}"`);
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
// Gated on report-prose.yaml (the roadmap source): a base-only run has no Pass-8 layer to check.
const prosePath = join(evalDir, 'report-prose.yaml');
if (existsSync(prosePath)) {
  let prose;
  try { prose = parseYaml(readFileSync(prosePath, 'utf8')); }
  catch (e) { err('report-prose.yaml', `YAML parse failed (fail-closed): ${e.message}`); prose = null; }
  if (prose && Array.isArray(prose.roadmap)) {
    const { buildSupervision } = await import('./supervision.mjs');
    const sup = buildSupervision([...allById.values()].map((v) => v.f), prose.roadmap, prose.channel_notes || {});
    const DISPO_REASON = new Set(['accepted', 'deferred', 'out-of-scope']);
    const dispo = new Map();
    for (const d of (Array.isArray(prose.dispositions) ? prose.dispositions : [])) {
      if (!d || !d.channel) { err('report-prose.yaml:dispositions', `disposition missing channel`); continue; }
      if (!DISPO_REASON.has(d.reason)) err('report-prose.yaml:dispositions', `disposition "${d.channel}" bad reason "${d.reason}" (accepted|deferred|out-of-scope)`);
      if (!d.note) err('report-prose.yaml:dispositions', `disposition "${d.channel}" needs a note (the reason it is not fixed)`);
      dispo.set(d.channel, d);
    }
    for (const k of sup.kinds) {
      if (!k.fixes.length && !dispo.has(k.channel))
        err('report-prose.yaml', `unsupervised kind "${k.channel}" has no fix (a roadmap item's findings or covers_channels) and no disposition — every gap must trace to a remediation or a logged reason (solution-coverage, fail-closed)`);
    }
    const unsup = new Set(sup.kinds.map((k) => k.channel));
    for (const ch of dispo.keys()) if (!unsup.has(ch)) warn('report-prose.yaml:dispositions', `disposition for "${ch}" but it is not an unsupervised kind (stale — the gap it excused is closed or gone)`);
  }
  // ── canon check (SCHEMA.md §8) — advisory drift against the declared enumeration contract.
  // Opt-in: the run names its canon in report-prose (`canon: <name>`). A named-but-missing
  // canon is an ERROR (a declared contract must be present); a present one surfaces effect-channel
  // drift as non-fatal WARNINGS — a run may lead or lag its canon, and closing the drift is a
  // canon-maintenance decision (a reviewed diff), never a per-run gate.
  if (prose && prose.canon) {
    // Resolution order (SCHEMA.md §8): (1) the run's instance entry — runs live at
    // <entry>/runs/<run>/ with the target's canon at <entry>/canon/<name>.yaml
    // (custody layout, reorganization 2026-08-11); (2) canon/ next to this tool
    // (portable layout — repo-eval copied into a target repo).
    const candidates = [
      join(arg, '..', '..', 'canon', `${prose.canon}.yaml`),
      join(dirname(fileURLToPath(import.meta.url)), '..', 'canon', `${prose.canon}.yaml`),
    ];
    const canonPath = candidates.find((p) => existsSync(p));
    if (!canonPath) {
      err('report-prose.yaml', `canon: "${prose.canon}" names canon/${prose.canon}.yaml, which exists neither in the run's instance entry nor beside the tool (fail-closed — a declared contract must be present)`);
    } else {
      let canon = null;
      try { canon = parseYaml(readFileSync(canonPath, 'utf8')); }
      catch (e) { err(`canon/${prose.canon}.yaml`, `YAML parse failed (fail-closed): ${e.message}`); }
      if (canon) {
        const canonCh = new Set((Array.isArray(canon.effect_channels) ? canon.effect_channels : []).map((c) => c && c.slug).filter(Boolean));
        const runCh = new Set([...allById.values()].map((v) => v.f).filter((f) => f.subject_type === 'effect' && f.effect && f.effect.channel).map((f) => f.effect.channel));
        for (const ch of runCh) if (!canonCh.has(ch)) warn(`canon/${prose.canon}.yaml`, `run effect channel "${ch}" is not in the canon (drift — add it to the canon, or fix the finding's channel)`);
        for (const ch of canonCh) if (!runCh.has(ch)) warn(`canon/${prose.canon}.yaml`, `canon channel "${ch}" has no effect finding in this run (declared population member not assessed)`);
      }
    }
  }
}

// maturity grades tail (optional): coverage schema (SCHEMA.md §6b) + drift check.
// The file is GENERATED (tools/maturity.mjs --write); the counted numbers are
// recomputed here from the base and any mismatch is an error — the maturity
// view's own "enforced" property, applied to itself.
const gradesPath = join(evalDir, 'view-maturity-grades.yaml');
if (existsSync(gradesPath)) {
  let grades;
  try { grades = parseYaml(readFileSync(gradesPath, 'utf8')); }
  catch (e) { err('view-maturity-grades.yaml', `YAML parse failed (fail-closed): ${e.message}`); grades = null; }
  if (grades && grades.schema !== 'coverage') {
    err('view-maturity-grades.yaml', `pre-coverage grades schema (found ${grades.ladder ? 'ladder form' : 'no schema key'}) — regenerate: node tools/maturity.mjs <eval-dir> --write`);
  } else if (grades) {
    if (!Array.isArray(grades.dimensions)) err('view-maturity-grades.yaml', `dimensions must be a list`);
    else {
      const { computeCoverage } = await import('./maturity.mjs');
      const recomputed = computeCoverage([...allById.values()].map((v) => v.f));
      const reByDim = Object.fromEntries(recomputed.dimensions.map((d) => [d.dimension, d]));
      for (const d of grades.dimensions) {
        const at = `view-maturity-grades.yaml:${d && d.dimension || '??'}`;
        if (!d || !DIMENSIONS.has(d.dimension)) { err(at, `bad or missing dimension`); continue; }
        const c = d.coverage;
        if (!c && !d.not_measured) err(at, `needs coverage or not_measured`);
        if (c) {
          if (!['counted', 'sampled'].includes(c.kind)) err(at, `coverage.kind must be counted|sampled`);
          if (typeof c.met !== 'number' || typeof c.of !== 'number' || c.of < 1) err(at, `coverage needs numeric met/of`);
          else if (c.pct !== Math.round((c.met / c.of) * 100)) err(at, `coverage.pct ${c.pct} does not equal met/of`);
          if (c.kind === 'sampled' && !c.method) err(at, `sampled coverage must state its method`);
          if (c.kind === 'counted') {
            const re = reByDim[d.dimension] && reByDim[d.dimension].measures.find((mm) => mm.name === c.measure);
            if (!re) err(at, `counted measure "${c.measure}" is not one this base computes`);
            else if (re.met !== c.met || re.of !== c.of) err(at, `counted drift: file says ${c.met}/${c.of}, base computes ${re.met}/${re.of} — regenerate with maturity.mjs --write`);
          }
        }
        if (!d.depth) err(at, `needs an authored depth sentence (maturity-inputs.yaml)`);
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
          err('view-maturity-grades.yaml:aggregate', `aggregate ${a.met}/${a.of} does not pool the measured rows (${met}/${of}) — regenerate with maturity.mjs --write`);
        else if (a.pct !== pctExp)
          err('view-maturity-grades.yaml:aggregate', `aggregate.pct ${a.pct} does not equal met/of (${pctExp})`);
        if (typeof a.over === 'number' && a.over !== measured.length)
          err('view-maturity-grades.yaml:aggregate', `aggregate.over ${a.over} does not equal the measured-row count (${measured.length})`);
      }
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const total = allById.size;
if (process.argv.includes('--json')) {   // machine-readable for tools/backlog.mjs
  console.log(JSON.stringify({ ok: errors.length === 0, total, errors, warnings, evidencePathErrors }, null, 2));
  // exit reflects the verdict even in JSON mode — a CI wiring that checks only the
  // exit code must never read green over a red base. Callers that want the payload
  // on failure read stdout from the non-zero exit (tools/backlog.mjs does).
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
console.log(`✓ assay validate: ${total} findings, ${passFiles.length} pass files — schema, ids, filename↔dimension, links, and citations all clean.`);
