#!/usr/bin/env node
// roster.mjs — what each scanner is worth, joined per scanner (map/scanners/INTAKE.md).
//
// A scanner earns its place by the requirements it alone decides, the facts it
// corroborates on a shared axis, its fail-loud behaviour and its cost (CLAUDE.md
// rule 5). The raw material exists across the core; this joins it, one row per
// adapter (adopted, retired, or a candidate: `adopted: false` with no `retired:`):
//
//   decides_alone            the requirement ids whose decide.scanner is this one
//                            (yardstick/requirements.yaml): an instrument row names
//                            one scanner, so nothing else decides it
//   not_measured_if_retired  the rows that leave the measured scale if it is retired:
//                            today the same set, since no row names two scanners;
//                            kept apart so a row that comes to name a second
//                            scanner moves out of this list and stays in neither
//   feeds                    every axis its adapter maps to or contributes
//   fails_loud               the harness block (tests/blocks/<name>.mjs) holding its
//                            fail-loud halts, the adapter's `fails_loud:`
//
// and, over the runs given (each a run directory; a sheet at <run>/ANSWERS.yaml is
// graded when present):
//
//   unique_recoveries        <run>/<answer id> for each known answer the run
//                            recovers that it no longer recovers with this
//                            scanner's rows taken out (map/score.mjs, unchanged)
//   corroborated             the facts it shares with another scanner, by the
//                            scanner-free fingerprint (yardstick/compare.mjs
//                            corroboratedFacts)
//   cost                     `<run>: <value>` for each `duration:` and `spend:` the
//                            run record carries on its row (map/scanners.yaml)
//
// With no run given the three run fields are null and print "not measured": a
// roster nobody ran is never a roster of zeros. A run with no run record halts.
//
// Usage:  node assay.mjs roster [<run-dir>...]
import { readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml, q } from '../lib/yaml-min.mjs';
import { loadAdapters, loadFindings, loadManifest, projectMulti, orderAxes } from './project.mjs';
import { score } from './score.mjs';
import { loadYardstick } from '../yardstick/measure.mjs';
import { corroboratedFacts } from '../yardstick/compare.mjs';

const sourceOf = (f) => f.source || 'repo-eval';

const rosterStatus = (a) => (a.retired ? 'retired' : a.adopted === false ? 'candidate' : 'adopted');

// loadRosterRun(dir) → { name, findings, manifest, answers } — answers is null when
// the run carries no sheet. Throws on a run with no record: without one, a scanner
// that did not run is indistinguishable from one that ran clean.
export function loadRosterRun(dir) {
  const manifest = loadManifest(dir);
  if (!manifest || !manifest.scanners || typeof manifest.scanners !== 'object') throw new Error(`${dir}: no run record (map/scanners.yaml); the roster reads which scanners ran off it`);
  const sheet = join(dir, 'ANSWERS.yaml');
  return { name: basename(resolve(dir)), findings: loadFindings(dir), manifest, answers: existsSync(sheet) ? parseYaml(readFileSync(sheet, 'utf8')) : null };
}

const recoveredIds = (findings, adapters, run) => new Set(score(findings, adapters, run.answers, run.manifest).results.filter((r) => r.status === 'recovered').map((r) => r.id));

export function roster(adapters, reg, runs = []) {
  const measured = runs.length > 0;
  const facts = runs.flatMap((r) => corroboratedFacts(projectMulti(r.findings, adapters).projected));
  const full = runs.map((r) => (r.answers ? recoveredIds(r.findings, adapters, r) : null));
  return Object.keys(adapters).sort().map((id) => {
    const a = adapters[id];
    const decides = reg.requirements.filter((d) => d.decide && d.decide.kind === 'instrument' && d.decide.scanner === id).map((d) => d.id).sort();
    const axes = new Set([...(a.contributes || []), ...Object.values(a.map || {}).flatMap((m) => (m ? [m.axis, ...(m.also_axes || [])] : [])).filter(Boolean)]);
    const row = {
      scanner: id, role: a.role || null, status: rosterStatus(a),
      decides_alone: decides, not_measured_if_retired: [...decides], feeds: orderAxes([...axes]),
      fails_loud: a.fails_loud || null, unique_recoveries: null, corroborated: null, cost: null,
    };
    if (!measured) return row;
    row.unique_recoveries = runs.flatMap((r, i) => {
      if (!full[i] || !r.findings.some((f) => sourceOf(f) === id)) return [];
      const without = recoveredIds(r.findings.filter((f) => sourceOf(f) !== id), adapters, r);
      return [...full[i]].filter((x) => !without.has(x)).sort().map((x) => `${r.name}/${x}`);
    });
    row.corroborated = facts.filter((f) => f.sources.includes(id)).length;
    const recorded = (k) => runs.flatMap((r) => { const v = r.manifest.scanners[id]?.[k]; return v === undefined || v === null ? [] : [`${r.name}: ${v}`]; });
    row.cost = { duration: recorded('duration'), spend: recorded('spend') };
    return row;
  });
}

// roster.yaml — the report's shape (map/scanners/INTAKE.md)
function toRosterYaml(rows, runNames = []) {
  const list = (xs, nm) => (xs === null ? ` ${q(nm)}` : xs.length ? '\n' + xs.map((x) => `      - ${q(x)}`).join('\n') : ' []');
  const NM = 'not measured: no run given';
  const out = ['# roster.yaml — GENERATED by node assay.mjs roster (map/scanners/INTAKE.md). Never hand-edit.',
    `runs: [${runNames.map(q).join(', ')}]`, 'scanners:'];
  for (const r of rows) {
    out.push(`  - scanner: ${r.scanner}`, `    role: ${r.role ?? 'null'}`, `    status: ${r.status}`,
      `    decides_alone:${list(r.decides_alone)}`, `    not_measured_if_retired:${list(r.not_measured_if_retired)}`,
      `    feeds:${list(r.feeds)}`, `    fails_loud: ${r.fails_loud ? r.fails_loud : 'null   # no harness block named: not adoptable (INTAKE.md)'}`,
      `    unique_recoveries:${list(r.unique_recoveries, NM)}`,
      `    corroborated: ${r.corroborated === null ? q(NM) : r.corroborated}`);
    if (r.cost === null) out.push(`    cost: ${q(NM)}`);
    else out.push('    cost:', `      duration:${r.cost.duration.length ? ' [' + r.cost.duration.map(q).join(', ') + ']' : ' "not recorded"'}`, `      spend:${r.cost.spend.length ? ' [' + r.cost.spend.map(q).join(', ') + ']' : ' "not recorded"'}`);
  }
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (dirs.some((d) => d.startsWith('-'))) { console.error('usage: node assay.mjs roster [<run-dir>...]'); process.exit(2); }
  let runs;
  try { runs = dirs.map(loadRosterRun); }
  catch (e) { console.error(`✗ roster: ${e.message}`); process.exit(1); }
  process.stdout.write(toRosterYaml(roster(loadAdapters(), loadYardstick(), runs), runs.map((r) => r.name)));
}
