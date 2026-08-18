#!/usr/bin/env node
// maturity.mjs — computed maturity coverage.
//
// The maturity grades used to be existence-scored: one strong finding could
// promote a whole dimension, because no dimension had a denominator. This tool
// replaces rung words with MEASURED COVERAGE: for each dimension, the share of
// a review-enumerated population that meets the dimension's bar. Percentages
// are primary; there is no binning and no threshold to argue about.
//
// The model per dimension (SCHEMA.md §6b):
//   coverage   a fraction with its denominator always visible — counted (from
//              base fields) or sampled (from an authored census with n and
//              method stated). Some dimensions have no measure yet; they say
//              so instead of faking a number.
//   depth      one authored, judged sentence: how good the BEST instance is.
//              Depth can be high while coverage is low ("you know how; now do
//              it everywhere") — collapsing the two was the old inflation.
//   enforced   earned flag: the coverage is itself machine-checked, so a
//              regression is caught automatically. Requires cited evidence.
//   generative earned flag: agents extend the system's own coverage by
//              default. The frontier; expected empty today.
//
// Inference proposes (findings, authored depth/census inputs); determinism
// disposes (this tool computes every number; validate.mjs recomputes and
// fails on drift). Honesty bounds: every fraction is "M of the N the review
// enumerated", never "of the system"; small denominators are printed.
//
// Usage:
//   node tools/maturity.mjs <eval-dir>          # print the computed coverage
//   node tools/maturity.mjs <eval-dir> --write  # regenerate view-maturity-grades.yaml
//                                               #   (merges authored maturity-inputs.yaml)

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from './yaml-min.mjs';

const REAL_GATES = new Set(['deterministic-halt', 'staged-reversible', 'scope-bound', 'rate-throttle', 'external-halt']);
const STRUCTURED = new Set(['structured-event', 'audited']);
const pct = (met, of) => (of ? Math.round((met / of) * 100) : null);

export function loadFindings(dir) {
  const pass = readdirSync(dir).filter((f) => /^findings-\d\d-.*\.yaml$/.test(f)).sort();
  if (pass.length) return pass.flatMap((f) => parseYaml(readFileSync(join(dir, f), 'utf8')));
  return parseYaml(readFileSync(join(dir, 'findings.yaml'), 'utf8'));
}

// The counted measures, computed from base fields alone. One primary per
// dimension (the coverage headline); the rest are context. Dimensions with no
// countable field return measures: [] and carry a not_measured reason until a
// sampled census (maturity-inputs.yaml) supplies one.
export function computeCoverage(findingsIn) {
  const findings = findingsIn.filter(Boolean);
  const effects = findings.filter((f) => f.subject_type === 'effect' && f.effect);
  const caps = findings.filter((f) => f.subject_type === 'capability' && f.capabilities);
  const halts = effects.filter((e) => e.effect.reversibility === 'irreversible' || e.effect.external === true);
  const gateHolds = (e) => REAL_GATES.has(e.effect.gate_type) && e.effect.fail_mode !== 'open';
  const legs = (c) => ['untrusted_input', 'private_data', 'external_effect'].filter((k) => c.capabilities[k] === true).length;
  const m = (name, what, met, of, primary = false) => ({ name, what, met, of, pct: pct(met, of), kind: 'counted', primary });

  // dimension order follows the report's canonical DIM_ORDER (legibility → context →
  // gates → verification → delegation → improvement), so the maturity table reads in the
  // same order as the stat strip and the handoff. Every listing in the report is consistent.
  return {
    populations: { effects: effects.length, halts: halts.length, ai_surfaces: caps.length },
    dimensions: [
      {
        dimension: 'artifact-legibility',
        measures: [],
        not_measured: 'needs a sampled census: n non-obvious decisions, how many are reconstructable from the files alone',
        note: null,
      },
      {
        dimension: 'context-economy',
        measures: [],
        not_measured: 'needs a module census: fraction loadable standalone, instruction files against their stated budget',
        note: null,
      },
      {
        dimension: 'deterministic-gates',
        measures: [
          m('halts-gated', 'irreversible or outside-reaching actions behind a hard stop that does not fail open', halts.filter(gateHolds).length, halts.length, true),
          m('effects-gated', 'all actions behind such a stop', effects.filter(gateHolds).length, effects.length),
        ],
        not_measured: null,
        note: 'Whether anything RUNS the checks before a merge is the enforced flag, not a second coverage number.',
      },
      {
        dimension: 'verification',
        measures: [
          m('provable', 'actions that can prove they happened, deterministically, from outside the AI', effects.filter((e) => STRUCTURED.has(e.effect.telemetry)).length, effects.length, true),
          m('any-trace', 'actions leaving any trace at all', effects.filter((e) => e.effect.telemetry !== 'none').length, effects.length),
        ],
        not_measured: null,
        note: 'An unstructured log is how you investigate, not how you verify; only a structured record counts as proof.',
      },
      {
        dimension: 'delegation',
        measures: [
          m('capability-budget', 'AI surfaces holding at most two of the three risky ingredients (outside input, private data, outside actions)', caps.filter((c) => legs(c) <= 2).length, caps.length, true),
          m('full-trifecta', 'AI surfaces holding all three (context; lower is better)', caps.filter((c) => legs(c) === 3).length, caps.length),
        ],
        not_measured: null,
        note: 'The credential census (secondary) measures the boundary itself: secrets the AI can never see or direct.',
      },
      {
        dimension: 'improvement-loop',
        measures: [
          m('loop-substrate', 'actions writing a structured record a feedback loop could be built on', effects.filter((e) => STRUCTURED.has(e.effect.telemetry)).length, effects.length, true),
          m('audited', 'actions whose record is audit-grade', effects.filter((e) => e.effect.telemetry === 'audited').length, effects.length),
        ],
        not_measured: null,
        note: 'The incident sample (secondary) measures whether recorded corrections stuck; the primary measures the substrate the loop can run on.',
      },
    ],
  };
}

// Merge counted coverage with the authored inputs (depth sentences, sampled
// censuses, earned flags) into the final grades object.
export function buildGrades(findings, inputs) {
  const cov = computeCoverage(findings);
  const byDim = Object.fromEntries((inputs && inputs.dimensions || []).map((d) => [d.dimension, d]));
  const dimensions = cov.dimensions.map((d) => {
    const inp = byDim[d.dimension] || {};
    let measures = d.measures;
    // A sampled census (from inputs) can supply the primary for an unmeasured
    // dimension. Sampled measures must state met/of and method.
    if (Array.isArray(inp.sampled) && inp.sampled.length) {
      const sampled = inp.sampled.map((s) => ({ name: s.name, what: s.what, met: s.met, of: s.of, pct: pct(s.met, s.of), kind: 'sampled', method: s.method, primary: !!s.primary }));
      measures = [...measures, ...sampled];
    }
    const primary = measures.find((mm) => mm.primary) || null;
    const flag = (k) => (inp[k] && inp[k].claim === true ? { claim: true, why: inp[k].why || '', evidence: inp[k].evidence || [] } : false);
    return {
      dimension: d.dimension,
      coverage: primary ? { pct: primary.pct, met: primary.met, of: primary.of, kind: primary.kind, measure: primary.name, what: primary.what, ...(primary.method ? { method: primary.method } : {}) } : null,
      not_measured: primary ? null : (d.not_measured || 'no measure available'),
      secondary: measures.filter((mm) => !mm.primary),
      depth: inp.depth ? String(inp.depth).trim() : null,
      enforced: flag('enforced'),
      generative: flag('generative'),
      note: d.note,
    };
  });
  const measured = dimensions.filter((d) => d.coverage);
  const met = measured.reduce((a, d) => a + d.coverage.met, 0);
  const of = measured.reduce((a, d) => a + d.coverage.of, 0);
  return {
    schema: 'coverage',
    populations: cov.populations,
    aggregate: { met, of, pct: pct(met, of), over: measured.length },
    dimensions,
  };
}

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Emit the constrained-YAML subset yaml-min reads back (block style only).
export function gradesToYaml(g, generatedNote) {
  const out = [];
  out.push(`# view-maturity-grades.yaml — GENERATED by tools/maturity.mjs --write. Do not hand-edit:`);
  out.push(`# validate.mjs recomputes the counted numbers from the base and fails on drift.`);
  out.push(`# ${generatedNote}`);
  out.push(`schema: coverage`);
  out.push(`populations:`);
  for (const [k, v] of Object.entries(g.populations)) out.push(`  ${k}: ${v}`);
  out.push(`aggregate:`);
  for (const [k, v] of Object.entries(g.aggregate)) out.push(`  ${k}: ${v}`);
  out.push(`dimensions:`);
  for (const d of g.dimensions) {
    out.push(`  - dimension: ${d.dimension}`);
    if (d.coverage) {
      out.push(`    coverage:`);
      out.push(`      pct: ${d.coverage.pct}`);
      out.push(`      met: ${d.coverage.met}`);
      out.push(`      of: ${d.coverage.of}`);
      out.push(`      kind: ${d.coverage.kind}`);
      out.push(`      measure: ${d.coverage.measure}`);
      out.push(`      what: ${q(d.coverage.what)}`);
      if (d.coverage.method) out.push(`      method: ${q(d.coverage.method)}`);
    } else {
      out.push(`    not_measured: ${q(d.not_measured)}`);
    }
    if (d.secondary.length) {
      out.push(`    secondary:`);
      for (const s of d.secondary) {
        out.push(`      - name: ${s.name}`);
        out.push(`        met: ${s.met}`);
        out.push(`        of: ${s.of}`);
        out.push(`        pct: ${s.pct}`);
        out.push(`        kind: ${s.kind}`);
        out.push(`        what: ${q(s.what)}`);
        if (s.method) out.push(`        method: ${q(s.method)}`);
      }
    }
    if (d.depth) out.push(`    depth: ${q(d.depth)}`);
    for (const k of ['enforced', 'generative']) {
      const f = d[k];
      if (f && f.claim) {
        out.push(`    ${k}:`);
        out.push(`      claim: true`);
        out.push(`      why: ${q(f.why)}`);
        if (f.evidence.length) out.push(`      evidence: [${f.evidence.join(', ')}]`);
      } else out.push(`    ${k}: false`);
    }
    if (d.note) out.push(`    note: ${q(d.note)}`);
  }
  out.push('');
  return out.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].endsWith('maturity.mjs');
if (isMain) {
  const evalDir = process.argv[2];
  if (!evalDir) { console.error('usage: node tools/maturity.mjs <eval-dir> [--write]'); process.exit(2); }
  const write = process.argv.includes('--write');
  const findings = loadFindings(evalDir);
  const inputsPath = join(evalDir, 'maturity-inputs.yaml');
  const inputs = existsSync(inputsPath) ? parseYaml(readFileSync(inputsPath, 'utf8')) : null;
  const grades = buildGrades(findings, inputs);

  if (write) {
    const yaml = gradesToYaml(grades, `Regenerate: node tools/maturity.mjs ${evalDir} --write`);
    writeFileSync(join(evalDir, 'view-maturity-grades.yaml'), yaml);
    console.log(`wrote ${join(evalDir, 'view-maturity-grades.yaml')} (aggregate ${grades.aggregate.pct}% over ${grades.aggregate.over} measured areas)`);
  } else {
    const g = grades;
    console.log(`Populations the review enumerated: ${g.populations.effects} effects, ${g.populations.halts} halts, ${g.populations.ai_surfaces} AI surfaces.`);
    console.log(`Aggregate over the ${g.aggregate.over} measured areas: ${g.aggregate.pct}% (${g.aggregate.met} of ${g.aggregate.of}).\n`);
    for (const d of g.dimensions) {
      console.log(d.dimension);
      if (d.coverage) console.log(`  coverage: ${d.coverage.pct}% (${d.coverage.met} of ${d.coverage.of}, ${d.coverage.kind}: ${d.coverage.measure}) — ${d.coverage.what}`);
      else console.log(`  not measured — ${d.not_measured}`);
      for (const s of d.secondary) console.log(`  · ${s.name}: ${s.met} of ${s.of}${s.pct === null ? '' : ` (${s.pct}%)`} — ${s.what}`);
      if (d.depth) console.log(`  depth: ${d.depth}`);
      console.log(`  enforced: ${d.enforced && d.enforced.claim ? 'yes — ' + d.enforced.why : 'not earned'}; generative: ${d.generative && d.generative.claim ? 'yes — ' + d.generative.why : 'not earned'}`);
      if (d.note) console.log(`  note: ${d.note}`);
      console.log('');
    }
    if (!inputs) console.log('(no maturity-inputs.yaml found — depth sentences and sampled censuses absent)');
  }
}
