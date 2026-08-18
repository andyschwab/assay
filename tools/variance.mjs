#!/usr/bin/env node
// variance.mjs — calibration-mode repeatability measurement.
//
// Given N blind sweeps of the SAME target, measure how repeatable the base observation is.
// It clusters findings across sweeps into "facts" and reports what every sweep caught (the
// stable core), what only some caught (the variance — the residual inference-dependence),
// and the union (the coverage ceiling a single run leaves on the table).
//
// A "fact" = a connected component under: two findings (from DIFFERENT sweeps) are the same
// fact iff they share a dimension AND at least one IDENTITY TOKEN. An identity token is the
// specific thing the finding is about: a full evidence PATH (not just its basename), or an
// explicit item key — an effect `channel`, a `label`, or a `slug`. subject_type is NOT part
// of identity: it is a descriptor a run chooses, and a whole census can flip it
// (cal5 tagged its gates census `contract`, cal6 tagged it `control`) — keying on it read
// identical facts as 0% agreement. Matching on the full path (not basename) is what keeps two
// enumerated items apart when they share a filename (every skill cites a file named SKILL.md).
// The union-find is many-to-one by construction, so a folded finding that shares a path with
// two granular findings joins all three rather than manufacturing variance. Deliberately
// conservative otherwise: a fact recorded against genuinely different evidence with no shared
// item key shows up honestly as variance, not a false match. History: before 2026-08-05 the
// key was (dimension, subject_type, evidence BASENAME); the census-augmented cal5/cal6 pair
// proved that key blind to its own best result (35% where the facts agreed at 73%).
//
// TWO measures, because a run has two layers that can drift independently:
//
//   1. FACT PRESENCE (computeVariance) — did every sweep record a fact about this thing?
//      Identity is (dimension + a shared identity token). subject_type and the effect
//      descriptors are deliberately NOT part of it: they are judgments a run makes about
//      a fact, and keying on them reads identical facts as disagreement.
//
//   2. DESCRIPTOR AGREEMENT (descriptorAgreement) — given that both sweeps recorded the
//      same effect channel, did they JUDGE it the same way? This is the measure that
//      matters most, because it is the layer every shipped number is computed from:
//      maturity coverage (gate_type/fail_mode/telemetry), the halt inventory flags
//      (reversibility/external/gate_type), the chain ranking (blast_scope/preconditions)
//      and the gate. Measure 1 can read high while measure 2 reads low — two sweeps
//      agreeing on WHAT exists and disagreeing on what it MEANS — and then the verdict is
//      not repeatable even though the base looks like it is. Measured on the Henry
//      cross-run pair (both canon-pinned, so channel identity was solved): 26 shared
//      channels, descriptors identical on 8 (31%).
//
// The DIRECTION of divergence separates the two explanations. If every divergence moves
// the same way, that is consistent with the TARGET having changed between runs. If they
// move both ways at once, that is the signature of JUDGMENT drift, and a cross-run
// coverage delta computed over them is not a trend. `bothWays` computes it.
//
// Zero-dep. Usage: node tools/variance.mjs <run-dir> <run-dir> [<run-dir> ...]

import { basename } from 'node:path';
// The shared fail-closed loader: a sweep file this reader cannot parse HALTS the
// measurement instead of being skipped — a silently dropped file would be
// mis-read as variance, corrupting the very number this tool exists to produce.
import { loadFindings } from './project.mjs';
import { isMain } from './doctrine.mjs';

// identity tokens: the specific thing a finding is about — full evidence PATH (not basename)
// plus any explicit item key (effect channel, label, slug). subject_type is NOT included.
export const idTokens = (f) => {
  const t = new Set();
  for (const e of (Array.isArray(f.evidence) ? f.evidence : [])) t.add('p:' + String(e).split(':')[0]);
  const chan = (f.effect && f.effect.channel) || f.channel;
  if (chan) t.add('c:' + String(chan).toLowerCase().trim());
  if (f.label) t.add('l:' + String(f.label).toLowerCase().replace(/\s+/g, ' ').trim());
  if (f.slug) t.add('s:' + String(f.slug).toLowerCase().trim());
  return t;
};

// A finding's clustering bucket. repo-eval findings carry `dimension`; scanner and
// instrument rows carry `source` + `native_category` and NO dimension (SCHEMA §2a), so
// they group by source instead of collapsing into one undefined bucket (which also crashed
// the sort). Keeping them separate per source is the honest read: two sources are never the
// same fact, and an instrument's rows are deterministic by construction rather than a
// measure of analyst repeatability.
export const groupKey = (f) => f.dimension || (f.source ? `source:${f.source}` : 'ungrouped');

// computeVariance(runDirs) → structured repeatability result (pure; no I/O beyond loadFindings).
// A fact = a connected component under: same dimension + a shared identity token, matched only
// ACROSS sweeps. Deterministic; used by the CLI and pinned by tests/regression.mjs.
export function computeVariance(runDirs) {
  return varianceFromSweeps(runDirs.map((d) => loadFindings(d)), runDirs.map((d) => basename(d)));
}

// The pure half — sweeps is an array of FINDINGS ARRAYS, so the measure is testable
// without fixtures (same split as descriptorAgreement below).
export function varianceFromSweeps(sweeps, names) {
  const N = sweeps.length;
  const nodes = [];
  sweeps.forEach((findings, ri) => { for (const f of findings || []) nodes.push({ run: ri, dim: groupKey(f), subj: f.subject_type || '-', ev: idTokens(f), obs: (f.observation || '').trim().replace(/\s+/g, ' ').slice(0, 90) }); });

  const parent = nodes.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.run === b.run) continue;                 // only match ACROSS sweeps — never collapse distinct within-run findings
    if (a.dim !== b.dim) continue;                 // dimension is part of identity; subject_type is NOT (it drifts)
    for (const e of a.ev) if (b.ev.has(e)) { union(i, j); break; }
  }

  const facts = new Map();
  nodes.forEach((n, i) => { const r = find(i); if (!facts.has(r)) facts.set(r, { dim: n.dim, subj: n.subj, runs: new Set(), sample: n.obs }); const fct = facts.get(r); fct.runs.add(n.run); if (n.run === 0) fct.sample = n.obs; });

  const factList = [...facts.values()];
  const union_ = factList.length;
  const core = factList.filter((f) => f.runs.size === N).length;
  const byDimension = {};
  for (const d of [...new Set(factList.map((f) => f.dim))].sort()) {
    const fs = factList.filter((f) => f.dim === d);
    const c = fs.filter((f) => f.runs.size === N).length;
    byDimension[d] = { core: c, union: fs.length, pct: Math.round(100 * c / fs.length) };
  }
  return {
    sweeps: sweeps.map((_, i) => ({ name: (names && names[i]) || `sweep-${i}`, findings: nodes.filter((n) => n.run === i).length })),
    N, union: union_, core, pct: union_ ? Math.round(100 * core / union_) : 0,
    byDimension,
    variant: factList.filter((f) => f.runs.size < N).sort((a, b) => a.runs.size - b.runs.size || String(a.dim).localeCompare(String(b.dim))),
  };
}

// ── measure 2: descriptor agreement ──────────────────────────────────────────
// The effect facet fields the views compute from. `external` is included: it is a
// descriptor a run judges (does this leave the trust boundary), and it feeds the halt flag.
export const DESCRIPTOR_FIELDS = ['reversibility', 'external', 'gate_type', 'fail_mode', 'telemetry', 'blast_scope'];

// Safety ordering per field, low = riskier. Used ONLY to give a divergence a direction;
// it never scores anything. gate_type's order follows maturity.mjs's REAL_GATES split
// (none/disclosure-only do not hold) with the halts ranked above the bounds. A field with
// no defensible total order (none here today) would be left out and counted `unordered`.
const RANK = {
  reversibility: { irreversible: 0, 'reversible-with-window': 1, reversible: 2 },
  external: { true: 0, false: 1 },
  gate_type: { none: 0, 'disclosure-only': 1, 'rate-throttle': 2, 'scope-bound': 2, 'staged-reversible': 3, 'external-halt': 3, 'deterministic-halt': 4 },
  fail_mode: { open: 0, closed: 1 },
  telemetry: { none: 0, unstructured: 1, 'structured-event': 2, audited: 3 },
  blast_scope: { 'cross-tenant': 0, fleet: 1, tenant: 2, user: 3 },
};

const norm = (v) => (v === undefined || v === null ? null : String(v).trim().toLowerCase());

// descriptorAgreement(sweeps) — sweeps is an array of FINDINGS ARRAYS (pure; no I/O), so
// it is testable without fixtures. Each sweep contributes at most one descriptor tuple per
// effect channel (the first; a run recording a channel twice is a granularity choice that
// measure 1 already covers).
export function descriptorAgreement(sweeps) {
  const perSweep = sweeps.map((findings) => {
    const byChannel = new Map();
    for (const f of findings || []) {
      if (!f || f.subject_type !== 'effect' || !f.effect) continue;
      const ch = norm(f.effect.channel);
      if (!ch || byChannel.has(ch)) continue;
      byChannel.set(ch, Object.fromEntries(DESCRIPTOR_FIELDS.map((k) => [k, norm(f.effect[k])])));
    }
    return byChannel;
  });

  const allChannels = new Set(perSweep.flatMap((m) => [...m.keys()]));
  const shared = [...allChannels].filter((ch) => perSweep.filter((m) => m.has(ch)).length >= 2).sort();
  const unshared = [...allChannels].filter((ch) => !shared.includes(ch)).sort();

  const byField = Object.fromEntries(DESCRIPTOR_FIELDS.map((k) => [k, { agree: 0, of: 0, pct: 0 }]));
  const divergences = [];
  let allAgree = 0;
  const directions = { safer: 0, riskier: 0, unordered: 0 };

  for (const ch of shared) {
    const present = perSweep.map((m, i) => [i, m.get(ch)]).filter(([, t]) => t);
    const fieldsDiffering = [];
    for (const k of DESCRIPTOR_FIELDS) {
      const vals = present.map(([, t]) => t[k]);
      // fail_mode is NOT APPLICABLE where a sweep recorded gate_type: none — the schema
      // only requires it when a gate exists. Counting it there double-counts a single
      // gate_type disagreement as two, deflating the fail_mode column for a difference
      // it did not independently observe. Skip the field entirely for that channel.
      if (k === 'fail_mode' && present.some(([, t]) => t.gate_type === 'none')) continue;
      byField[k].of += 1;
      if (vals.every((v) => v === vals[0])) { byField[k].agree += 1; continue; }
      fieldsDiffering.push({ field: k, values: present.map(([i, t]) => ({ sweep: i, value: t[k] })) });
      // direction, first sweep -> last sweep that carries the channel
      const a = RANK[k] ? RANK[k][vals[0]] : undefined;
      const b = RANK[k] ? RANK[k][vals[vals.length - 1]] : undefined;
      if (a === undefined || b === undefined || a === b) directions.unordered += 1;
      else if (b > a) directions.safer += 1;
      else directions.riskier += 1;
    }
    if (!fieldsDiffering.length) allAgree += 1;
    else divergences.push({ channel: ch, fields: fieldsDiffering, sweeps: present.map(([i]) => i) });
  }
  for (const k of DESCRIPTOR_FIELDS) byField[k].pct = byField[k].of ? Math.round(100 * byField[k].agree / byField[k].of) : 0;

  return {
    N: sweeps.length,
    channels: { total: allChannels.size, shared: shared.length, unshared: unshared.length, unsharedList: unshared },
    byField,
    allFields: { agree: allAgree, of: shared.length, pct: shared.length ? Math.round(100 * allAgree / shared.length) : 0 },
    divergences,
    directions,
    // both directions at once = judgment drift, not target movement. Needs a divergence
    // in each direction; an all-one-way set is consistent with the target having changed.
    bothWays: directions.safer > 0 && directions.riskier > 0,
  };
}

// runDir wrapper — loads then delegates.
export function computeDescriptorAgreement(runDirs) {
  return descriptorAgreement(runDirs.map((d) => loadFindings(d)));
}

function reportDescriptors(d) {
  console.log(`  descriptor agreement (the layer every shipped number is computed from):`);
  console.log(`    effect channels shared by 2+ sweeps: ${d.channels.shared} of ${d.channels.total}` +
    (d.channels.unshared ? `  (${d.channels.unshared} seen by only one sweep: ${d.channels.unsharedList.join(', ')})` : ''));
  if (!d.channels.shared) { console.log(`    no shared channel — nothing to compare.\n`); return; }
  console.log(`    all ${DESCRIPTOR_FIELDS.length} descriptors identical: ${d.allFields.agree}/${d.allFields.of}  (${d.allFields.pct}%)`);
  for (const k of DESCRIPTOR_FIELDS)
    console.log(`      ${k.padEnd(15)} ${String(d.byField[k].agree).padStart(3)}/${String(d.byField[k].of).padStart(3)}  ${String(d.byField[k].pct + '%').padStart(5)}`);
  if (d.divergences.length) {
    console.log(`\n    divergent channels:`);
    for (const v of d.divergences)
      console.log(`      ${v.channel.padEnd(26)} ${v.fields.map((f) => `${f.field}: ${f.values.map((x) => x.value).join(' vs ')}`).join(' · ')}`);
    console.log(`\n    direction: ${d.directions.safer} safer · ${d.directions.riskier} riskier · ${d.directions.unordered} unordered`);
    console.log(d.bothWays
      ? `    ⚠ divergences move in BOTH directions — the signature of judgment drift, not target change.\n` +
        `      A cross-run coverage delta computed over these descriptors is not a trend.`
      : `    divergences move one way — consistent with the target having changed between sweeps.`);
  }
  console.log('');
}

function report(r) {
  console.log(`\nassay variance — ${r.N} sweeps:`);
  r.sweeps.forEach((s, i) => console.log(`  sweep ${i}: ${s.name} (${s.findings} findings)`));
  console.log(`\n  facts (union):        ${r.union}`);
  console.log(`  caught by all ${r.N}:      ${r.core}  (${r.pct}% — the repeatable core)`);
  console.log(`  caught by some only:  ${r.union - r.core}  (${r.union ? Math.round(100 * (r.union - r.core) / r.union) : 0}% — the variance)`);
  console.log(`\n  by dimension (repeatable core / union facts = %):`);
  for (const [d, v] of Object.entries(r.byDimension))
    console.log(`    ${d.padEnd(22)} ${String(v.core).padStart(3)}/${String(v.union).padStart(3)}  ${String(v.pct + '%').padStart(5)}`);
  console.log(`\n  variance detail (which sweeps caught each divergent fact):`);
  for (const f of r.variant) console.log(`    [${f.runs.size}/${r.N} · sweeps ${[...f.runs].sort().join(',')}] ${f.dim}/${f.subj}: ${f.sample}`);
  console.log('');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const runs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (runs.length < 2) { console.error('usage: node variance.mjs <run-dir> <run-dir> [<run-dir> ...]'); process.exit(2); }
  const r = computeVariance(runs);
  const d = computeDescriptorAgreement(runs);
  if (process.argv.includes('--json')) console.log(JSON.stringify({
    pct: r.pct, union: r.union, core: r.core, byDimension: r.byDimension,
    descriptors: { pct: d.allFields.pct, shared: d.channels.shared, byField: d.byField,
                   divergences: d.divergences, directions: d.directions, bothWays: d.bothWays },
  }, null, 2));
  else { report(r); reportDescriptors(d); }
}
