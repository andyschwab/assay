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
// Zero-dep. Usage: node tools/variance.mjs <run-dir> <run-dir> [<run-dir> ...]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';

export function loadFindings(dir) {
  const evalDir = existsSync(join(dir, 'eval')) ? join(dir, 'eval') : dir;
  const files = readdirSync(evalDir).filter((f) => /^findings-\d\d-.*\.yaml$/.test(f)).sort();
  let all = [];
  for (const f of files) { try { all = all.concat(parseYaml(readFileSync(join(evalDir, f), 'utf8')) || []); } catch (e) { console.error(`  (skip ${f}: ${e.message.split('\n')[0]})`); } }
  return all;
}

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

// computeVariance(runDirs) → structured repeatability result (pure; no I/O beyond loadFindings).
// A fact = a connected component under: same dimension + a shared identity token, matched only
// ACROSS sweeps. Deterministic; used by the CLI and pinned by tests/regression.mjs.
export function computeVariance(runDirs) {
  const N = runDirs.length;
  const nodes = [];
  runDirs.forEach((dir, ri) => { for (const f of loadFindings(dir)) nodes.push({ run: ri, dim: f.dimension, subj: f.subject_type, ev: idTokens(f), obs: (f.observation || '').trim().replace(/\s+/g, ' ').slice(0, 90) }); });

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
    sweeps: runDirs.map((d, i) => ({ name: basename(d), findings: nodes.filter((n) => n.run === i).length })),
    N, union: union_, core, pct: union_ ? Math.round(100 * core / union_) : 0,
    byDimension,
    variant: factList.filter((f) => f.runs.size < N).sort((a, b) => a.runs.size - b.runs.size || a.dim.localeCompare(b.dim)),
  };
}

function report(r) {
  console.log(`\nrepo-eval variance — ${r.N} sweeps:`);
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
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (runs.length < 2) { console.error('usage: node variance.mjs <run-dir> <run-dir> [<run-dir> ...]'); process.exit(2); }
  const r = computeVariance(runs);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ pct: r.pct, union: r.union, core: r.core, byDimension: r.byDimension }, null, 2));
  else report(r);
}
