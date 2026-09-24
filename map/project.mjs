#!/usr/bin/env node
// project.mjs — the axis projector (map/scanners/CONTRACT.md).
//
// Projects a findings base onto the flat AXIS ROSTER through per-scanner
// adapters. Axes are property-named and SHARED: every scanner — the native
// seven-dimension method included — contributes axes through its adapter's
// `contributes:` list, and any scanner may FEED an axis it does not contribute
// (two scanners measuring one property corroborate on one axis; provenance
// stays on the finding via `source`, never on the chapter). Each finding is
// routed by ITS OWN scanner's adapter, keyed by its native category
// (native_category for external scanners, dimension for repo-eval). A finding
// may carry `also_axes` (compound cross-links) or an explicit `axis`.
// FAIL-CLOSED: an unmapped native category halts. Read-only; never modifies
// the base.
//
// Usage:  node map/project.mjs <run-dir> [--base <dir>]... [--adapter <id>]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { isMain } from './doctrine.mjs';
import { findingsDir, scannersPath, coverageDir } from '../lib/run-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // map/

// ── axis titles live in lib/display.mjs (AXIS_META, the one label home);
//    re-exported here so projection consumers keep a single import site ───────
import { axisTitle } from '../lib/display.mjs';
export { axisTitle };
// canonical ordering: the seven native dimension axes in pass order, then the
// known contributed axes; axes outside this list append sorted (deterministic).
export const AXIS_ORDER = [
  'artifact-legibility', 'context-economy', 'deterministic-gates', 'verification',
  'delegation', 'improvement-loop', 'multiplayer',
  'code-correctness', 'code-security',
];
export function orderAxes(axes) {
  const set = new Set(axes);
  return [...AXIS_ORDER.filter((a) => set.has(a)), ...[...set].filter((a) => !AXIS_ORDER.includes(a)).sort()];
}

// A finding's explicit classification: `axis:` (primary) and `also_axes:`
// (compound cross-links). Every finding carries these directly — a scanner
// that classified itself, never inferred from a retired vocabulary.
const explicitAxis = (f) => f.axis;
const explicitAlso = (f) => Array.isArray(f.also_axes) ? f.also_axes : [];

// ── loaders ─────────────────────────────────────────────────────────────────
// THE findings loader — every tool loads through this one function so the
// semantics cannot drift (before consolidation there were five copies, one of
// which skipped unparseable files and mis-read the loss as variance). Rules:
//   • every file under map/findings/ — one per scanner, or one per repo-eval
//     pass — read and concatenated; no merged-file fallback;
//   • FAIL CLOSED on an unparseable file (parseYaml throws; never caught here);
//   • a missing directory reads as an empty base (callers decide whether empty
//     is an error — most exit loudly on zero findings).
// The one deliberate non-consumer is validate.mjs, which re-implements the walk
// because it needs per-file error attribution (which file broke, at which key).
export function loadFindings(dir) {
  const fd = findingsDir(dir);
  if (!existsSync(fd)) return []; // clean empty rather than an ENOENT stack
  const files = readdirSync(fd).filter((f) => f.endsWith('.yaml')).sort();
  let all = [];
  for (const f of files) {
    const p = parseYaml(readFileSync(join(fd, f), 'utf8'));
    if (Array.isArray(p)) all = all.concat(p);
  }
  return all;
}

export function loadAdapter(id) {
  const p = join(HERE, 'scanners', 'adapters', id + '.yaml');
  if (!existsSync(p)) { console.error(`no adapter: ${p}`); process.exit(2); }
  const a = parseYaml(readFileSync(p, 'utf8'));
  if (!a || !a.map) { console.error(`adapter ${id} has no map`); process.exit(2); }
  return a;
}

export function loadAdapters() {
  const dir = join(HERE, 'scanners', 'adapters');
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const a = parseYaml(readFileSync(join(dir, f), 'utf8'));
    if (a && a.scanner && a.map) out[a.scanner] = a;
  }
  return out;
}

// ── the adopted roster + the run manifest ────────────────────────────────────
// An adapter may carry `adopted: false` (with a `retired:` note): the scanner
// stays projectable — frozen runs that carry its rows still compile — but it
// leaves the roster every run must dispose of, and it no longer widens the
// "not measured" registry. Retirement is a recorded decision, never a deletion.
export function adoptedAdapters(adapters) {
  const out = {};
  for (const [id, a] of Object.entries(adapters)) if (a.adopted !== false) out[id] = a;
  return out;
}

// The honesty baseline for "not measured this run": every axis an ADOPTED
// scanner contributes. A run that lacks one of them is not measured there.
export function registryAxes(adapters) {
  return orderAxes([...contributedBySources(adapters, Object.keys(adoptedAdapters(adapters)))]);
}

// The run manifest — map/scanners.yaml — records each adopted scanner's
// disposition for THIS run: ran | skipped (reason) | failed (reason). Validated
// fail-closed by validate.mjs (SCHEMA.md §5a); read here by every renderer so an
// integration that did not run is NAMED with its reason, never implied absent.
// A scanner that can be omitted without a recorded decision reads as coverage.
export const MANIFEST_FILE = 'map/scanners.yaml';
export const MANIFEST_STATUS = ['ran', 'skipped', 'failed'];

export function loadManifest(dir) {
  const p = scannersPath(dir);
  if (!existsSync(p)) return null;
  return parseYaml(readFileSync(p, 'utf8'));   // fail closed: an unparseable manifest throws
}

// Group the manifest's rows: { ran: [id], skipped: [{id, reason}], failed: [{id, reason}],
// missing: [id] } — `missing` is every adopted scanner without a row (validate
// rejects it; renderers name it rather than trust it).
export function dispositions(manifest, adapters) {
  const rows = (manifest && manifest.scanners && typeof manifest.scanners === 'object') ? manifest.scanners : {};
  const out = { ran: [], skipped: [], failed: [], missing: [] };
  for (const id of Object.keys(adoptedAdapters(adapters)).sort()) {
    const r = rows[id];
    if (!r || typeof r !== 'object') { out.missing.push(id); continue; }
    if (r.status === 'ran') out.ran.push(id);
    else if (r.status === 'skipped') out.skipped.push({ id, reason: String(r.reason || '').trim() || 'no reason recorded' });
    else if (r.status === 'failed') out.failed.push({ id, reason: String(r.reason || '').trim() || 'no reason recorded' });
    else out.missing.push(id);
  }
  return out;
}

// One line for every renderer's "Scanners:" slot: the present sources, then the
// skipped and failed adopted scanners with their reasons. Absence is spelled out.
export function scannerLine(manifest, sources, adapters) {
  const d = dispositions(manifest, adapters);
  const parts = [sources.join(', ') || '(none)'];
  if (d.skipped.length) parts.push(`skipped: ${d.skipped.map((s) => `${s.id} (${s.reason})`).join('; ')}`);
  if (d.failed.length) parts.push(`failed: ${d.failed.map((s) => `${s.id} (${s.reason})`).join('; ')}`);
  if (!manifest) parts.push('no run manifest (map/scanners.yaml missing — dispositions unknown)');
  else if (d.missing.length) parts.push(`no disposition recorded: ${d.missing.join(', ')}`);
  return parts.join(' · ');
}

// Why a given scanner has no rows this run, in words: "skipped this run: <reason>".
export function notRunPhrase(manifest, id) {
  const r = manifest && manifest.scanners && manifest.scanners[id];
  if (r && r.status === 'skipped') return `skipped this run: ${String(r.reason || '').trim() || 'no reason recorded'}`;
  if (r && r.status === 'failed') return `failed this run: ${String(r.reason || '').trim() || 'no reason recorded'}`;
  if (r && r.status === 'ran') return 'recorded as ran, but the base carries none of its rows';
  return manifest ? 'no disposition recorded in the run manifest' : 'no run manifest (map/scanners.yaml)';
}

// ── scanner coverage sidecars — map/coverage/<scanner>.yaml ───────────────────
// A peer scanner that reports per-domain coverage (deep-code-review 1.72+'s
// machine report) has it archived by ingest.mjs as a sidecar in the scanner's
// own domain letters. Renderers read it so an axis the scanner contributes is
// "measured" only where every mapped domain was scanned — a partial or skipped
// domain makes the axis PARTIALLY measured, said in words, never a silent full.
export function loadScannerCoverage(dir) {
  const cd = coverageDir(dir);
  const out = {};
  if (!existsSync(cd)) return out;
  for (const f of readdirSync(cd).filter((x) => x.endsWith('.yaml'))) {
    const doc = parseYaml(readFileSync(join(cd, f), 'utf8'));   // fail closed
    if (doc && doc.scanner) out[doc.scanner] = doc;
  }
  return out;
}

// For one axis: per contributing scanner with a sidecar, the mapped domains
// grouped by status. `null` when no contributing scanner reported coverage.
export function axisCoverage(adapters, scannerCoverage, axis) {
  const out = [];
  for (const [id, ad] of Object.entries(adapters)) {
    if (!(ad.contributes || []).includes(axis)) continue;
    const sc = scannerCoverage[id];
    if (!sc || !sc.coverage) continue;
    const letters = Object.entries(ad.map || {}).filter(([, r]) => r && r.axis === axis).map(([l]) => l).sort();
    const g = { scanner: id, scanned: [], partial: [], notScanned: [], notApplicable: [], unknown: [] };
    for (const l of letters) {
      const row = sc.coverage[l];
      const st = row && row.status;
      const note = row && row.note ? String(row.note).trim() : '';
      if (st === 'scanned') g.scanned.push(l);
      else if (st === 'partial') g.partial.push({ l, note });
      else if (st === 'not-scanned') g.notScanned.push({ l, note });
      else if (st === 'not-applicable') g.notApplicable.push({ l, note });
      else g.unknown.push(l);
    }
    g.full = !g.partial.length && !g.notScanned.length && !g.unknown.length;
    out.push(g);
  }
  return out.length ? out : null;
}

// One phrase for a renderer: "" when fully measured, else the honest qualifier.
export function coveragePhrase(groups) {
  if (!groups) return '';
  const parts = [];
  for (const g of groups) {
    if (g.full) continue;
    const bits = [];
    for (const x of g.partial) bits.push(`${x.l} partial${x.note ? ` (${x.note})` : ''}`);
    for (const x of g.notScanned) bits.push(`${x.l} not scanned${x.note ? ` (${x.note})` : ''}`);
    for (const l of g.unknown) bits.push(`${l} no coverage row`);
    parts.push(`${g.scanner} covered this axis partially: ${bits.join('; ')}`);
  }
  return parts.join(' · ');
}

// Which axes each present scanner CONTRIBUTES (its own measure exists there).
// An axis in no present scanner's `contributes:` is "not measured" — a finding
// fed into it still renders (never a silent drop), flagged method-not-run.
export function contributedBySources(adapters, sources) {
  const contributed = new Set();
  for (const s of sources) for (const a of (adapters[s]?.contributes || [])) contributed.add(a);
  return contributed;
}

// The run's roster: contributed axes ∪ axes actually fed, in canonical order.
export function rosterFor(adapters, sources, projected) {
  const axes = new Set(contributedBySources(adapters, sources));
  for (const p of projected) { axes.add(p.axis); for (const a of p.also) axes.add(a); }
  return orderAxes([...axes]);
}

// ── projection ───────────────────────────────────────────────────────────────
// Returns { projected, unmapped, needsAxis }. A projected entry is
// { f, axis (primary), also (string[]), source }. `also_axes` on the finding
// merge into `also`. A finding carrying an explicit `axis` is honored as-is —
// a scanner that classified it itself.
export function projectMulti(findings, adapters) {
  const unmapped = [], needsAxis = [], projected = [];
  for (const f of findings) {
    const src = f.source || 'repo-eval';
    const alsoFromFinding = explicitAlso(f);
    const ex = explicitAxis(f);
    if (ex) {
      projected.push({ f, axis: ex, also: alsoFromFinding.filter((a) => a !== ex), source: src });
      continue;
    }
    const adapter = adapters[src];
    if (!adapter) { unmapped.push({ id: f.id, cat: `(no adapter for source "${src}")` }); continue; }
    const cat = f.native_category ?? f.dimension;
    const m = adapter.map[cat];
    if (!m) { unmapped.push({ id: f.id, cat: `${src}:${cat}` }); continue; }
    if (m.needs_finding_axis) { needsAxis.push({ id: f.id, cat, f }); continue; }
    if (!m.axis) { unmapped.push({ id: f.id, cat: `${src}:${cat} (adapter row has no axis)` }); continue; }
    const also = [...new Set(alsoFromFinding)].filter((a) => a !== m.axis);
    projected.push({ f, axis: m.axis, also, source: src });
  }
  return { projected, unmapped, needsAxis };
}

// Single-adapter projection (pure single-scanner base; used by the regression harness).
export function projectFindings(findings, adapter) {
  return projectMulti(findings, { [adapter.scanner || 'repo-eval']: adapter });
}

// ── CLI (runs only when invoked directly) ────────────────────────────────────
if (isMain(import.meta.url)) runCli();

function runCli() {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node map/project.mjs <run-dir> [--base <dir>]... [--adapter <id>]'); process.exit(2); }
  const bases = [];
  for (let i = 3; i < process.argv.length; i++) if (process.argv[i] === '--base') bases.push(process.argv[++i]);
  const aIdx = process.argv.indexOf('--adapter');
  let findings = loadFindings(arg);
  for (const b of bases) findings = findings.concat(loadFindings(b));
  if (!findings.length) { console.error(`no findings under ${arg}`); process.exit(2); }
  const adapters = aIdx > -1 ? { [process.argv[aIdx + 1]]: loadAdapter(process.argv[aIdx + 1]) } : loadAdapters();
  const { projected, unmapped, needsAxis } = projectMulti(findings, adapters);
  if (unmapped.length) {
    console.error(`\nPROJECTION HALTED (fail-closed) — ${unmapped.length} finding(s) with a native category`);
    console.error(`that has no adapter row. Add a mapping row:`);
    for (const u of unmapped) console.error(`  - ${u.id}: ${u.cat}`);
    process.exit(1);
  }
  const sources = [...new Set(projected.map((p) => p.source))].sort();
  const contributed = contributedBySources(adapters, sources);
  const roster = rosterFor(adapters, sources, projected);
  const by = Object.fromEntries(roster.map((a) => [a, []]));
  for (const p of projected) { by[p.axis].push(p); for (const a of p.also) if (by[a]) by[a].push({ ...p, cross: true }); }
  console.log(`\n# Axis projection — ${arg}`);
  console.log(`# scanners: ${sources.join(', ')} · ${projected.length} findings` +
    (needsAxis.length ? ` · ${needsAxis.length} unclassified` : ''));
  for (const a of roster) {
    const arr = by[a];
    const t = (pol) => arr.filter((p) => p.f.polarity === pol && !p.cross).length;
    console.log(`\n## ${axisTitle(a)}${contributed.has(a) ? '' : '  (fed only — no present scanner measures this axis)'}`);
    console.log(`   ${arr.filter((p) => !p.cross).length} primary (+${arr.filter((p) => p.cross).length} cross-listed)  ·  ` +
      `strengths ${t('strength')} · gaps ${t('gap')} · facts ${t('fact')}`);
  }
  if (needsAxis.length) { console.log(`\n# unclassified (needs a per-finding axis):`); for (const n of needsAxis) console.log(`  - ${n.id}`); }
  console.log('');
}
