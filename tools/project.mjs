#!/usr/bin/env node
// project.mjs — the axis projector (integration/scanner-contract.md).
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
// Usage:  node tools/project.mjs <run-dir> [--base <dir>]... [--adapter <id>]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';
import { isMain } from './doctrine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..'); // repo root

// ── axis titles live in display.mjs (AXIS_META, the one label home);
//    re-exported here so projection consumers keep a single import site ───────
import { axisTitle } from './display.mjs';
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

// ── legacy translation (grandfathered, like the frozen id bands) ─────────────
// Findings forward-migrated under the retired five-domain model carry `domain:`
// / `also_domains:`; they translate mechanically and are never rewritten in the
// frozen fixtures. New findings carry `axis:` / `also_axes:`.
export const LEGACY_DOMAIN_AXIS = {
  'workspace-legibility': 'artifact-legibility',
  'code-correctness': 'code-correctness',
  'code-security': 'code-security',
  'product-ai-safety': 'delegation',
  'product-ai-quality': 'verification',
};
const toAxis = (v) => LEGACY_DOMAIN_AXIS[v] ?? v;
const explicitAxis = (f) => f.axis ?? (f.domain ? toAxis(f.domain) : undefined);
const explicitAlso = (f) => {
  const raw = Array.isArray(f.also_axes) ? f.also_axes
    : Array.isArray(f.also_domains) ? f.also_domains.map(toAxis) : [];
  return raw;
};

// ── loaders ─────────────────────────────────────────────────────────────────
// THE findings loader — every tool loads through this one function so the
// semantics cannot drift (before consolidation there were five copies, one of
// which skipped unparseable files and mis-read the loss as variance). Rules:
//   • per-pass files first (what validate reads), else the merged findings.yaml
//     — reading per-pass avoids a stale merged file silently winning;
//   • FAIL CLOSED on an unparseable file (parseYaml throws; never caught here);
//   • a missing directory reads as an empty base (callers decide whether empty
//     is an error — most exit loudly on zero findings).
// The one deliberate non-consumer is validate.mjs, which re-implements the walk
// because it needs per-file error attribution (which file broke, at which key).
export function loadFindings(dir) {
  const ev = existsSync(join(dir, 'eval')) ? join(dir, 'eval') : dir;
  if (!existsSync(ev)) return []; // clean empty rather than an ENOENT stack
  const files = readdirSync(ev).filter((f) => /^findings-\d\d-.*\.yaml$/.test(f)).sort();
  if (files.length) {
    let all = [];
    for (const f of files) {
      const p = parseYaml(readFileSync(join(ev, f), 'utf8'));
      if (Array.isArray(p)) all = all.concat(p);
    }
    return all;
  }
  if (existsSync(join(ev, 'findings.yaml'))) {
    const p = parseYaml(readFileSync(join(ev, 'findings.yaml'), 'utf8'));
    return Array.isArray(p) ? p : [];
  }
  return [];
}

export function loadAdapter(id) {
  const p = join(ROOT, 'integration', 'adapters', id + '.yaml');
  if (!existsSync(p)) { console.error(`no adapter: ${p}`); process.exit(2); }
  const a = parseYaml(readFileSync(p, 'utf8'));
  if (!a || !a.map) { console.error(`adapter ${id} has no map`); process.exit(2); }
  return a;
}

export function loadAdapters() {
  const dir = join(ROOT, 'integration', 'adapters');
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const a = parseYaml(readFileSync(join(dir, f), 'utf8'));
    if (a && a.scanner && a.map) out[a.scanner] = a;
  }
  return out;
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
// merge into `also`. A finding carrying an explicit `axis` (or a grandfathered
// `domain`) is honored as-is — a scanner that classified it itself.
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
  if (!arg) { console.error('usage: node tools/project.mjs <run-dir> [--base <dir>]... [--adapter <id>]'); process.exit(2); }
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
