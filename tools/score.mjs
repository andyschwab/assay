#!/usr/bin/env node
// score.mjs — grade an evaluation run against a fixture's known-answer sheet.
//
// The extraction-readiness instrument: a fixture target carries an ANSWERS.yaml
// of PLANTED items (defects + strengths, each with an evidence path and the axis
// it should land on). A run's projected findings are matched against it, so the
// engine's recall (planted items recovered) and a control target's false-positive
// rate are measurable, not asserted.
//
// Matching is mechanical and honest about what it can compute:
//   • primary key = evidence FILE path (basename-insensitive to the target root).
//   • axis is the tie-break: a path match on the RIGHT axis (or an also_axes) is a
//     recovery; a path match on the WRONG axis is reported as MIS-HOMED, not a
//     clean recovery (the projection put a real finding in the wrong area).
//   • detectable_by gates scope: a planted item is only counted for/against recall
//     if at least one of its expected method classes actually ran (repo-eval →
//     eval-pass, gitleaks → gitleaks, scorecard → scorecard, deep-code-review → dcr).
//     An item no present method could find is reported as OUT-OF-SCOPE, never a miss.
//
// A control target (planted: []) is scored inversely: any run gap at or above its
// `max_gaps_above.severity` that matches no planted item is a FALSE POSITIVE.
//
// Usage:
//   node tools/score.mjs <run-dir> --answers <ANSWERS.yaml> [--json]
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { isMain, sevRank } from './doctrine.mjs';
import { parseYaml } from './yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti } from './project.mjs';

const SOURCE_METHOD = { 'repo-eval': 'eval-pass', 'gitleaks': 'gitleaks', 'scorecard': 'scorecard', 'deep-code-review': 'dcr' };

// path key: the file portion (before any :line), basename-compared so a run done
// relative to the target root and a sheet written relative to the target agree.
const fileKey = (p) => basename(String(p).trim().replace(/:\d+(?:-\d+)?$/, ''));
const lineOf = (p) => { const m = String(p).match(/:(\d+)/); return m ? Number(m[1]) : null; };

export function score(findings, adapters, answers) {
  const { projected } = projectMulti(findings, adapters);
  const runMethods = new Set(projected.map((p) => SOURCE_METHOD[p.source] || p.source));

  // index run findings by evidence file
  const byFile = new Map();
  for (const p of projected) {
    for (const ev of (p.f.evidence || [])) {
      const k = fileKey(ev);
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push({ p, line: lineOf(ev) });
    }
  }

  const items = [...(answers.planted || []), ...(answers.strengths || [])];
  const results = [];
  for (const it of items) {
    const expectMethods = Array.isArray(it.detectable_by) ? it.detectable_by : [];
    const inScope = !expectMethods.length || expectMethods.some((m) => runMethods.has(m));
    const wantAxes = new Set([it.axis, ...(Array.isArray(it.also_axes) ? it.also_axes : [])].filter(Boolean));
    const fk = fileKey(it.evidence || '');
    const hits = byFile.get(fk) || [];
    const axisHit = hits.find((h) => wantAxes.has(h.p.axis));
    const anyHit = hits[0];
    let status;
    if (!inScope) status = 'out-of-scope';
    else if (axisHit) status = 'recovered';
    else if (anyHit) status = 'mis-homed';
    else status = 'missed';
    results.push({ id: it.id, polarity: it.polarity, axis: it.axis, evidence: it.evidence,
      status, foundAxis: axisHit ? axisHit.p.axis : anyHit ? anyHit.p.axis : null,
      foundId: axisHit ? axisHit.p.f.id : anyHit ? anyHit.p.f.id : null, expectMethods });
  }

  // false positives (control targets): run gaps matching no planted evidence, at or
  // above the tolerance severity. Uses the planted evidence file set as "expected".
  const plantedFiles = new Set(items.map((it) => fileKey(it.evidence || '')));
  const floor = answers.max_gaps_above ? sevRank(answers.max_gaps_above.severity) : null;
  const falsePositives = [];
  if (floor !== null) {
    for (const p of projected) {
      if (p.f.polarity !== 'gap') continue;
      if (sevRank(p.f.severity) > floor) continue;               // below the tolerance line
      const onPlanted = (p.f.evidence || []).some((ev) => plantedFiles.has(fileKey(ev)));
      if (!onPlanted) falsePositives.push({ id: p.f.id, axis: p.axis, severity: p.f.severity || 'unrated', source: p.source, evidence: (p.f.evidence || [])[0] });
    }
  }

  const inScopeItems = results.filter((r) => r.status !== 'out-of-scope');
  const recovered = inScopeItems.filter((r) => r.status === 'recovered');
  return {
    target: answers.target,
    methods: [...runMethods].sort(),
    total_in_scope: inScopeItems.length,
    recovered: recovered.length,
    recall: inScopeItems.length ? Math.round((recovered.length / inScopeItems.length) * 100) : null,
    results, falsePositives,
    isControl: (answers.planted || []).length === 0,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  const aIdx = process.argv.indexOf('--answers');
  const answersPath = aIdx > -1 ? process.argv[aIdx + 1] : null;
  if (!runDir || !answersPath) { console.error('usage: node tools/score.mjs <run-dir> --answers <ANSWERS.yaml> [--json]'); process.exit(2); }
  if (!existsSync(answersPath)) { console.error(`no answers sheet: ${answersPath}`); process.exit(2); }
  const answers = parseYaml(readFileSync(answersPath, 'utf8'));
  const findings = loadFindings(runDir);
  if (!findings.length) { console.error(`no findings under ${runDir}`); process.exit(2); }
  const r = score(findings, loadAdapters(), answers);

  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

  const mark = { recovered: '✓', 'mis-homed': '~', missed: '✗', 'out-of-scope': '·' };
  console.log(`\n# Score — ${r.target}  (methods: ${r.methods.join(', ')})\n`);
  for (const res of r.results) {
    const extra = res.status === 'mis-homed' ? ` (found on ${res.foundAxis}, expected ${res.axis} — ${res.foundId})`
      : res.status === 'recovered' ? ` → ${res.foundId} [${res.foundAxis}]`
      : res.status === 'out-of-scope' ? ` (needs ${res.expectMethods.join('/')}, none ran)` : '';
    console.log(`  ${mark[res.status]} ${res.id} (${res.polarity}, ${res.axis}) ${res.evidence}${extra}`);
  }
  console.log(`\n  Recall (in-scope): ${r.recovered}/${r.total_in_scope}` + (r.recall !== null ? ` = ${r.recall}%` : ''));
  if (r.isControl) {
    console.log(`  Control target — false positives at/above tolerance: ${r.falsePositives.length}`);
    for (const fp of r.falsePositives) console.log(`    ✗ ${fp.id} (${fp.severity}, ${fp.axis}, ${fp.source}) ${fp.evidence}`);
  } else if (r.falsePositives.length) {
    console.log(`  Findings off the planted set at/above tolerance: ${r.falsePositives.length} (not necessarily wrong — the sheet is the floor, not the ceiling)`);
  }
  const misHomed = r.results.filter((x) => x.status === 'mis-homed').length;
  const missed = r.results.filter((x) => x.status === 'missed').length;
  process.exit(missed || misHomed || (r.isControl && r.falsePositives.length) ? 1 : 0);
}
