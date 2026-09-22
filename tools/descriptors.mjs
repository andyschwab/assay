#!/usr/bin/env node
// descriptors.mjs — the descriptor projection (registry/README.md).
//
// Projects a findings base onto the DESCRIPTOR REGISTER (registry/descriptors.yaml):
// for each descriptor, what the run decides — met | unmet | mixed | not-measured —
// and by which mechanism. A second projection beside the axis projection
// (project.mjs); it changes nothing the axis views compute. Read-only over the
// base. The honesty rules, in order:
//   • a descriptor is decided only by its declared mechanism (facet, census,
//     instrument); prose is never read — an observation that merely mentions a
//     topic is not a measurement (the first prototype turned "single authored
//     contract" into a met bus-factor row);
//   • an instrument row decides only if the run manifest records its scanner as
//     ran; skipped or failed reads not-measured WITH the recorded reason;
//   • a peer scanner's category with no rows reads met only where the scanner's
//     own coverage sidecar says the domain was scanned; partial or not-scanned
//     reads not-measured;
//   • a `claim` descriptor always reads not-measured from a run: only a sidecar
//     (a repo's own claims) can assert it, and the two are compared, never merged.
//
// Usage:  node tools/descriptors.mjs <run-dir> [--write] [--json]
//   --write   regenerate eval/view-descriptors.yaml (generated; never hand-edit)
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';
import { isHalt, isHaltClass, gateHolds, isMain } from './doctrine.mjs';
import { loadFindings, loadManifest, loadScannerCoverage, loadAdapters } from './project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
export const REGISTRY_FILE = join(ROOT, 'registry', 'descriptors.yaml');
export const KINDS = ['facet', 'census', 'instrument', 'claim'];
export const FACET_RULES = ['halts-gated', 'halts-traced', 'gates-fail-closed', 'trifecta', 'effects-provable'];
export const STATUSES = ['met', 'unmet', 'mixed', 'not-measured'];
const STRUCTURED = new Set(['structured-event', 'audited']);

// ── the register: load + validate (fail closed) ───────────────────────────────
export function validateRegistry(reg) {
  const errors = [];
  if (!reg || !Array.isArray(reg.descriptors)) return ['registry: no descriptors list'];
  const tiers = new Set(reg.tiers || []), tags = new Set(reg.tags || []), seen = new Set();
  for (const d of reg.descriptors) {
    const at = `registry: ${d.id ?? '(no id)'}`;
    if (!d.id || !/^d-[a-z0-9-]+$/.test(d.id)) errors.push(`${at}: id must match d-<slug>`);
    if (seen.has(d.id)) errors.push(`${at}: duplicate id`); seen.add(d.id);
    if (!d.title) errors.push(`${at}: title required`);
    if (!tiers.has(d.tier)) errors.push(`${at}: tier "${d.tier}" not in registry tiers`);
    for (const t of d.tags || []) if (!tags.has(t)) errors.push(`${at}: tag "${t}" not in registry tags`);
    if (!d.decide || !KINDS.includes(d.decide.kind)) errors.push(`${at}: decide.kind must be one of ${KINDS.join('|')}`);
    else if (d.decide.kind === 'facet' && !FACET_RULES.includes(d.decide.rule)) errors.push(`${at}: facet rule "${d.decide.rule}" unknown`);
    else if (d.decide.kind === 'census' && !(Array.isArray(d.decide.measures) && d.decide.measures.length)) errors.push(`${at}: census needs measures: [names]`);
    else if (d.decide.kind === 'instrument' && !(d.decide.scanner && d.decide.category)) errors.push(`${at}: instrument needs scanner + category`);
    if (!d.check) errors.push(`${at}: check (the proving check) required`);
    if (!Array.isArray(d.sources) || !d.sources.length) errors.push(`${at}: sources required (extracted, not designed)`);
    if (!['draft', 'stable', 'deprecated'].includes(d.status)) errors.push(`${at}: status must be draft|stable|deprecated`);
  }
  return errors;
}
export function loadRegistry(file = REGISTRY_FILE) {
  const reg = parseYaml(readFileSync(file, 'utf8'));
  const errors = validateRegistry(reg);
  if (errors.length) throw new Error(errors.join('\n'));
  return reg;
}

// ── the run's inputs beyond the base ─────────────────────────────────────────
export function loadMaturityInputs(dir) {
  const ev = existsSync(join(dir, 'eval')) ? join(dir, 'eval') : dir;
  const p = join(ev, 'maturity-inputs.yaml');
  if (!existsSync(p)) return null;
  return parseYaml(readFileSync(p, 'utf8'));
}
// manifest → { scanner: {status, reason} } across the two manifest shapes the tools accept
export function dispositionsOf(manifest) {
  const out = {};
  if (!manifest) return out;
  const rows = Array.isArray(manifest) ? manifest : Array.isArray(manifest.scanners) ? manifest.scanners
    : manifest.scanners && typeof manifest.scanners === 'object' ? Object.entries(manifest.scanners).map(([k, v]) => ({ scanner: k, ...v })) : [];
  for (const r of rows) if (r && (r.scanner || r.id)) out[r.scanner || r.id] = { status: r.status, reason: r.reason };
  return out;
}

let ADAPTERS = null;
const isInstrument = (scanner) => { ADAPTERS ??= loadAdapters(); return ADAPTERS[scanner]?.role === 'instrument'; };

// ── deciders ──────────────────────────────────────────────────────────────────
const row = (status, how, ids, note, extra = {}) => ({ status, how, findings: ids, note, ...extra });

function byFacet(d, fs) {
  const effects = fs.filter((f) => f.subject_type === 'effect' && f.effect);
  const halts = effects.filter((f) => isHaltClass(f.effect));
  const r = d.decide.rule;
  if (r === 'halts-gated' || r === 'halts-traced' || r === 'effects-provable' || r === 'gates-fail-closed') {
    if (!effects.length) return row('not-measured', 'facet', [], 'no effect findings in the base');
    let bad = [], of = halts, what = '';
    if (r === 'halts-gated') { bad = halts.filter((f) => isHalt(f.effect)); what = 'halt-class effects with no gate that holds'; }
    if (r === 'halts-traced') { bad = halts.filter((f) => f.effect.telemetry === 'none'); what = 'halt-class effects leaving no record'; }
    if (r === 'gates-fail-closed') { of = effects.filter((f) => f.effect.gate_type && f.effect.gate_type !== 'none'); bad = of.filter((f) => f.effect.fail_mode === 'open'); what = 'gated effects whose gate fails open'; }
    if (r === 'effects-provable') { of = effects; bad = effects.filter((f) => !STRUCTURED.has(f.effect.telemetry)); what = 'effects with no structured or audited record'; }
    if (!of.length) return row('not-measured', 'facet', [], `population empty (${what.split(' with')[0]})`);
    return row(bad.length ? 'unmet' : 'met', 'facet', bad.map((f) => f.id), `${bad.length} of ${of.length} ${what}${bad.length ? ': ' + bad.map((f) => f.effect.channel).filter(Boolean).join(', ') : ''}`, { met: of.length - bad.length, of: of.length });
  }
  if (r === 'trifecta') {
    const caps = fs.filter((f) => f.subject_type === 'capability' && f.capabilities);
    if (!caps.length) return row('not-measured', 'facet', [], 'no capability findings in the base (no AI surface enumerated)');
    const full = caps.filter((f) => f.capabilities.untrusted_input && f.capabilities.private_data && f.capabilities.external_effect);
    const byId = new Map(fs.map((f) => [f.id, f]));
    const bad = full.filter((f) => (f.reaches ?? []).some((id) => { const t = byId.get(id); return t?.effect && isHalt(t.effect); }));
    const status = !full.length ? 'met' : bad.length ? 'unmet' : 'mixed';
    return row(status, 'facet', full.map((f) => f.id), `${caps.length} AI surface(s); ${full.length} hold the full trifecta; ${bad.length} reach an effect with no gate that holds`, { met: caps.length - full.length, of: caps.length });
  }
  throw new Error(`facet rule ${r}`);
}

function byCensus(d, inputs) {
  const names = new Set(d.decide.measures);
  const hits = [];
  for (const dim of inputs?.dimensions || []) for (const s of dim.sampled || []) if (names.has(s.name)) hits.push({ ...s, dimension: dim.dimension });
  if (!hits.length) return row('not-measured', 'census', [], `no census named ${d.decide.measures.join(' | ')} in maturity-inputs.yaml`);
  const s = hits[0];
  const met = Number(s.met), of = Number(s.of);
  if (!(of > 0)) return row('not-measured', 'census', [], `census ${s.name} has an empty population`);
  return row(met === of ? 'met' : met === 0 ? 'unmet' : 'mixed', 'census', [], `${met} of ${of} ${s.what ?? s.name} (census ${s.name}, ${s.dimension})`, { met, of, measure: s.name });
}

function byInstrument(d, fs, disp, coverage) {
  const { scanner, category } = d.decide;
  const rows = fs.filter((f) => f.source === scanner && String(f.native_category ?? '') === String(category));
  const dp = disp[scanner];
  if (!dp) return row(rows.length ? 'unmet' : 'not-measured', 'instrument', rows.map((f) => f.id), rows.length ? `${rows.length} row(s) from ${scanner} (no manifest disposition recorded)` : `${scanner} has no disposition in the run manifest`);
  if (dp.status !== 'ran') return row('not-measured', 'instrument', [], `${scanner} ${dp.status}${dp.reason ? ': ' + dp.reason : ''}`);
  const gaps = rows.filter((f) => f.polarity === 'gap'), strengths = rows.filter((f) => f.polarity === 'strength');
  if (gaps.length) return row(strengths.length ? 'mixed' : 'unmet', 'instrument', rows.map((f) => f.id), `${gaps.length} gap row(s) from ${scanner} category ${category}${strengths.length ? ', ' + strengths.length + ' strength' : ''}`);
  // no gap rows: a deterministic INSTRUMENT that ran clean is met (its exit code is the
  // verdict); a PEER scanner is met only where its own coverage sidecar says it scanned
  // the domain — no sidecar means no account of what it looked at, which is not clean.
  const cov = coverage[scanner]?.coverage?.[category];
  if (!cov) {
    if (isInstrument(scanner)) return row('met', 'instrument', rows.map((f) => f.id), `${scanner} ran and reported no ${category} rows${rows.length ? ' (' + rows.length + ' strength row(s))' : ''}`);
    if (rows.length) return row('met', 'instrument', rows.map((f) => f.id), `${rows.length} strength row(s), no gaps, from ${scanner}`);
    return row('not-measured', 'instrument', [], coverage[scanner] ? `${scanner} reported coverage but no row for category ${category}` : `${scanner} ran but left no coverage account for category ${category} (a peer scanner's silence is not clean)`);
  }
  if (cov.status === 'scanned') return row('met', 'instrument', rows.map((f) => f.id), `${scanner} scanned category ${category}: no gaps${rows.length ? ', ' + rows.length + ' strength row(s)' : ''}`);
  return row('not-measured', 'instrument', rows.map((f) => f.id), `${scanner} category ${category} ${cov.status}${cov.note ? ': ' + cov.note : ''}`);
}

// ── the projection ────────────────────────────────────────────────────────────
export function projectDescriptors({ findings, manifest, inputs, coverage }, reg = loadRegistry()) {
  const disp = dispositionsOf(manifest);
  return reg.descriptors.map((d) => {
    let r;
    if (d.decide.kind === 'facet') r = byFacet(d, findings);
    else if (d.decide.kind === 'census') r = byCensus(d, inputs);
    else if (d.decide.kind === 'instrument') r = byInstrument(d, findings, disp, coverage || {});
    else r = row('not-measured', 'claim', [], 'claim-only: decided by the sidecar, never inferred from a run');
    return { id: d.id, title: d.title, tier: d.tier, tags: d.tags || [], axis: d.axis ?? null, kind: d.decide.kind, ...r };
  });
}
export function projectRun(runDir, reg) {
  const findings = loadFindings(runDir);
  if (!findings.length) throw new Error(`no findings under ${runDir}`);
  return projectDescriptors({ findings, manifest: loadManifest(runDir), inputs: loadMaturityInputs(runDir), coverage: loadScannerCoverage(runDir) }, reg);
}
export function summarize(rows) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) c[r.status]++;
  return { ...c, decided: rows.length - c['not-measured'], of: rows.length };
}
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
export function toYaml(rows, runName) {
  const L = [`# view-descriptors.yaml — GENERATED by tools/descriptors.mjs --write. Do not hand-edit.`,
    `# The descriptor projection of run ${runName}: per descriptor, what THIS RUN decides and how.`,
    `# A claim-only descriptor reads not-measured here by construction; the sidecar asserts it, the run never infers it.`,
    'schema: descriptors', 'registry: 0', 'summary:'];
  const s = summarize(rows);
  for (const k of [...STATUSES, 'decided', 'of']) L.push(`  ${k}: ${s[k]}`);
  L.push('descriptors:');
  for (const r of rows) {
    L.push(`  - id: ${r.id}`, `    status: ${r.status}`, `    how: ${r.how}`, `    tier: ${r.tier}`);
    if (r.of != null) L.push(`    met: ${r.met}`, `    of: ${r.of}`);
    L.push(`    findings: [${r.findings.join(', ')}]`, `    note: ${q(r.note)}`);
  }
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('usage: node tools/descriptors.mjs <run-dir> [--write] [--json]'); process.exit(2); }
  const rows = projectRun(dir);
  const s = summarize(rows);
  if (args.includes('--json')) { console.log(JSON.stringify({ summary: s, descriptors: rows }, null, 1)); }
  else {
    for (const r of rows) console.log(`${r.status.padEnd(12)} ${r.how.padEnd(10)} ${r.id.padEnd(34)} ${r.note}`);
    console.log(`\n${s.decided} of ${s.of} decided (met ${s.met} · unmet ${s.unmet} · mixed ${s.mixed}) · not measured ${s['not-measured']}`);
  }
  if (args.includes('--write')) {
    const ev = existsSync(join(dir, 'eval')) ? join(dir, 'eval') : dir;
    writeFileSync(join(ev, 'view-descriptors.yaml'), toYaml(rows, dir.split('/').filter(Boolean).pop()));
    console.error(`wrote ${join(ev, 'view-descriptors.yaml')}`);
  }
}
