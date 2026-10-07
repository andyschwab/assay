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
//     eval-pass, deep-code-review → dcr, an instrument → its own id). "Ran" is read
//     from the run record (map/scanners.yaml) when there is one, so an instrument
//     that ran clean and missed an item reads MISSED, not out of scope; without a
//     record, a method ran if it left rows. An item no method that ran could find is
//     reported as OUT-OF-SCOPE, never a miss.
//   • an item with a `check:` is an INSTRUMENT answer (a sheet's `instruments:`
//     list, or a repo-level check): it has no single file to point at (a missing
//     runbook is an absence), so it matches a row by method + native category (the
//     instrument's check name) + polarity, and the axis tie-break applies as above.
//     Instrument answers are standing facts, not planted defects: a sheet with
//     `planted: []` stays a control whatever its `instruments:` list says.
//
// A control target (planted: []) is scored inversely: any run gap at or above its
// `max_gaps_above.severity` that matches no known answer (a planted or strength
// evidence path, or an instrument answer) is a FALSE POSITIVE.
//
// A sheet may also carry a `requirements:` list (#18): the status the yardstick's
// measurement of a run over the target should read, per requirement id, with its
// reason (yardstick/README.md, "Known answers"). gradeRequirements grades the run's
// measurement against it: agree, disagree, or out of scope (the deciding scanner did
// not run, or no census of that name did, and the row reads not-measured). Every
// claim-kind row is graded as well, expected not-measured from a run alone.
//
// Usage:
//   node assay.mjs score <run-dir> --answers <ANSWERS.yaml> [--json]
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { isMain, sevRank } from './doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti, loadManifest } from './project.mjs';
import { STATUSES, loadYardstick, projectRun } from '../yardstick/measure.mjs';

const SOURCE_METHOD = { 'repo-eval': 'eval-pass', 'deep-code-review': 'dcr' };   // anything else: its own id
const methodOf = (source) => SOURCE_METHOD[source] || source;

// path matching: the file portion (before any :line), compared by FULL PATH with
// a suffix rule so a run recorded relative to the target root and a sheet written
// relative to the target still agree. Basename-only matching was the first cut,
// and it repeats a mistake variance.mjs already paid for: two planted items in
// same-named files (every skill ships a SKILL.md) collide into one key. The
// basename is kept only as a cheap index bucket; the suffix match decides.
const stripLine = (p) => String(p).trim().replace(/:\d+(?:-\d+)?$/, '');
const fileKey = (p) => basename(stripLine(p));
const samePath = (a, b) => !!a && !!b && (a === b || a.endsWith('/' + b) || b.endsWith('/' + a));
const lineOf = (p) => { const m = String(p).match(/:(\d+)/); return m ? Number(m[1]) : null; };

export function score(findings, adapters, answers, manifest = null) {
  const { projected } = projectMulti(findings, adapters);
  const runMethods = new Set(projected.map((p) => methodOf(p.source)));
  const recorded = manifest && manifest.scanners && typeof manifest.scanners === 'object' ? manifest.scanners : {};
  for (const [id, r] of Object.entries(recorded)) if (r && r.status === 'ran') runMethods.add(methodOf(id));

  // index run findings by evidence file
  const byFile = new Map();
  for (const p of projected) {
    for (const ev of (p.f.evidence || [])) {
      const k = fileKey(ev);
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push({ p, line: lineOf(ev), path: stripLine(ev) });
    }
  }

  const items = [...(answers.planted || []), ...(answers.strengths || []), ...(answers.instruments || [])];
  const results = [];
  const answeredIds = new Set();   // run rows an instrument answer accounts for
  for (const it of items) {
    const expectMethods = Array.isArray(it.detectable_by) ? it.detectable_by : [];
    const inScope = !expectMethods.length || expectMethods.some((m) => runMethods.has(m));
    const wantAxes = new Set([it.axis, ...(Array.isArray(it.also_axes) ? it.also_axes : [])].filter(Boolean));
    const wantPath = stripLine(it.evidence || '');
    const hits = it.check
      ? projected.filter((p) => String(p.f.native_category) === String(it.check) && p.f.polarity === it.polarity && expectMethods.includes(methodOf(p.source))).map((p) => ({ p }))
      : (byFile.get(fileKey(it.evidence || '')) || []).filter((h) => samePath(h.path, wantPath));
    if (it.check) for (const h of hits) answeredIds.add(h.p.f.id);
    const axisHit = hits.find((h) => wantAxes.has(h.p.axis));
    const anyHit = hits[0];
    let status;
    if (!inScope) status = 'out-of-scope';
    else if (axisHit) status = 'recovered';
    else if (anyHit) status = 'mis-homed';
    else status = 'missed';
    results.push({ id: it.id, polarity: it.polarity, axis: it.axis, evidence: it.evidence || (it.check ? `${expectMethods.join('/')}:${it.check}` : undefined),
      status, foundAxis: axisHit ? axisHit.p.axis : anyHit ? anyHit.p.axis : null,
      foundId: axisHit ? axisHit.p.f.id : anyHit ? anyHit.p.f.id : null, expectMethods });
  }

  // false positives (control targets): run gaps matching no planted evidence, at or
  // above the tolerance severity. Uses the planted evidence file set as "expected".
  const plantedPaths = items.map((it) => stripLine(it.evidence || '')).filter(Boolean);
  const floor = answers.max_gaps_above ? sevRank(answers.max_gaps_above.severity) : null;
  const falsePositives = [];
  if (floor !== null) {
    for (const p of projected) {
      if (p.f.polarity !== 'gap') continue;
      if (sevRank(p.f.severity) > floor) continue;               // below the tolerance line
      if (answeredIds.has(p.f.id)) continue;                     // a known instrument answer, not a manufactured one
      const onPlanted = (p.f.evidence || []).some((ev) => plantedPaths.some((a) => samePath(stripLine(ev), a)));
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

// Grade a run's measurement (measureRun's rows) against a sheet's `requirements:`
// list. A sheet the contract refuses (an unknown id or status, an id answered twice,
// no reason, a claim row answered anything but not-measured) throws: it is never
// graded. A non-claim requirement the sheet does not answer is not graded (the sheet
// is the floor, not the ceiling); every claim row is, expected not-measured.
export function gradeRequirements(rows, answers, reg, manifest = null) {
  const list = answers.requirements;
  if (!Array.isArray(list)) throw new Error('the sheet carries no requirements: list');
  const byId = new Map(reg.requirements.map((d) => [d.id, d]));
  const expected = new Map();
  for (const a of list) {
    const at = `requirements: ${a && a.id}`;
    if (!a || !byId.has(a.id)) throw new Error(`${at}: names no requirement in the yardstick`);
    if (expected.has(a.id)) throw new Error(`${at}: answered twice`);
    if (!STATUSES.includes(a.status)) throw new Error(`${at}: status "${a.status}" is not one of ${STATUSES.join(' | ')}`);
    if (typeof a.reason !== 'string' || !a.reason.trim()) throw new Error(`${at}: a reason is required`);
    if (byId.get(a.id).decide.kind === 'claim' && a.status !== 'not-measured') throw new Error(`${at}: a claim row reads not-measured from a run alone, never ${a.status}`);
    expected.set(a.id, a.status);
  }
  for (const d of reg.requirements) if (d.decide.kind === 'claim' && !expected.has(d.id)) expected.set(d.id, 'not-measured');
  const recorded = manifest && manifest.scanners && typeof manifest.scanners === 'object' ? manifest.scanners : {};
  const results = [];
  for (const [id, want] of expected) {
    const d = byId.get(id);
    const r = rows.find((x) => x.id === id);
    const actual = r ? r.status : null;
    // the deciding method did not run: the row reads not-measured, which grades nothing
    const notRun = d.decide.kind === 'instrument' ? !(recorded[d.decide.scanner] && recorded[d.decide.scanner].status === 'ran')
      : d.decide.kind === 'census' ? !(r && r.measure) : false;
    const grade = actual === want ? 'agree' : notRun && actual === 'not-measured' ? 'out-of-scope' : 'disagree';
    results.push({ id, kind: d.decide.kind, expected: want, actual, grade, note: r ? r.note : 'not measured at all' });
  }
  const count = (g) => results.filter((x) => x.grade === g).length;
  return { results, agree: count('agree'), disagree: count('disagree'), out_of_scope: count('out-of-scope') };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  const aIdx = process.argv.indexOf('--answers');
  const answersPath = aIdx > -1 ? process.argv[aIdx + 1] : null;
  if (!runDir || !answersPath) { console.error('usage: node assay.mjs score <run-dir> --answers <ANSWERS.yaml> [--json]'); process.exit(2); }
  if (!existsSync(answersPath)) { console.error(`no answers sheet: ${answersPath}`); process.exit(2); }
  const answers = parseYaml(readFileSync(answersPath, 'utf8'));
  const findings = loadFindings(runDir);
  if (!findings.length) { console.error(`no findings under ${runDir}`); process.exit(2); }
  const r = score(findings, loadAdapters(), answers, loadManifest(runDir));
  if (answers.requirements) {
    const reg = loadYardstick();
    r.requirements = gradeRequirements(projectRun(runDir, reg), answers, reg, loadManifest(runDir));
  }

  // the verdict, the same in both modes: a miss, a mis-homing or a control false positive
  // fails. The requirement grade is reported beside it, never folded in: its
  // disagreements are pinned by the harness (tests/golden.json), as recall is.
  const verdict = r.results.some((x) => x.status === 'missed' || x.status === 'mis-homed') || (r.isControl && r.falsePositives.length) ? 1 : 0;
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(verdict); }

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
  if (r.requirements) {
    const g = r.requirements, gm = { agree: '✓', disagree: '✗', 'out-of-scope': '·' };
    console.log(`\n# Requirements — expected vs measured\n`);
    for (const x of g.results) console.log(`  ${gm[x.grade]} ${x.id} (${x.kind}) expected ${x.expected}, measured ${x.actual}` + (x.grade === 'agree' ? '' : ` — ${x.note}`));
    console.log(`\n  Agree ${g.agree}, disagree ${g.disagree}, out of scope ${g.out_of_scope} (of ${g.results.length} graded)`);
  }
  process.exit(verdict);
}
