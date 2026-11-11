#!/usr/bin/env node
// tally.mjs — candidate properties tallied across runs (#265, D2+D3 of #257).
//
// Each run's candidates are read through D1's one function (views/improve/candidates.mjs
// buildCandidates over yardstick/untaken.mjs), so a measured run counts whether or not compile
// has written its candidates.yaml. For each property the tally names the independent targets
// that carry it (the runs of one target count once: a target is the run's own `identity:`,
// map/SCHEMA.md §5a), its findings and the first run it appeared in. A property seen on two or
// more independent targets is proposed; one seen on one target is held (#257 Q2). Proposing
// edits nothing: a row reaches yardstick/requirements.yaml only as a reviewed change naming
// its sources. Findings that name no property are counted as unnamed, never as one property.
//
// Saturation (D3): the runs in date order, each with the number of properties it adds that no
// earlier run carried. The date is one the run records (its `drawn:`, else the latest
// `reviewed.date` on a row), never the file system's.
//
// A run that states no target, or no date, or has not been measured, is refused, naming what
// is missing; nothing is tallied until every run can be counted.
//
// Usage: node assay.mjs candidates <run> <run> … [--json]
//          [--target <run>=<repository>[#<path>]] [--date <run>=YYYY-MM-DD]
//   --target  states the target of a stored run drawn before the run record carried identity:
//   --date    states the day of a stored run that records none
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadManifest } from '../../map/project.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { identityProblems, identityString, identityKey, parseIdentity } from '../../map/target-identity.mjs';
import { scannersPath } from '../../lib/run-layout.mjs';
import { buildCandidates } from './candidates.mjs';
import { isMain } from '../../map/doctrine.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROPOSE_AT = 2;   // independent targets a property needs to be proposed (#257 Q2)

// The day a run records: its `drawn:`, else the latest `reviewed.date` among its rows; null when none.
function runDate(manifest) {
  if (manifest && manifest.drawn != null && DATE_RE.test(String(manifest.drawn))) return String(manifest.drawn);
  const days = Object.values((manifest && manifest.scanners) || {})
    .map((r) => r && r.reviewed && r.reviewed.date != null ? String(r.reviewed.date) : null)
    .filter((d) => d && DATE_RE.test(d)).sort();
  return days.length ? days[days.length - 1] : null;
}

// Read one run for the tally: { run, target, key, date, candidates } or { run, refused: [why] }.
//   stated: { target?: "<repository>[#<path>]", date?: "YYYY-MM-DD" } from the command line
function readRun(runArg, stated = {}, reg = loadYardstick()) {
  const dir = resolve(runArg);
  const refused = [];
  if (!existsSync(scannersPath(dir))) return { run: runArg, refused: [`no map/scanners.yaml: not a run`] };
  let m;
  try { m = loadManifest(dir); } catch (e) { return { run: runArg, refused: [`map/scanners.yaml does not parse: ${/** @type {Error} */ (e).message}`] }; }

  let identity = m && m.identity !== undefined ? m.identity : null;
  if (stated.target !== undefined) {
    const given = parseIdentity(stated.target);
    if (identity && !identityProblems(identity).length && identityKey(identity) !== identityKey(given)) refused.push(`--target says ${stated.target}, and the run states identity ${identityString(identity)}: the run's own record stands; drop the --target`);
    else identity = given;
  }
  if (!identity) refused.push('states no target: map/scanners.yaml carries no identity: (repository, path; map/SCHEMA.md §5a). A run drawn before the field states it with --target <run>=<repository>[#<path>]; a directory name is never read as one');
  else for (const p of identityProblems(identity)) refused.push(p);

  let date = runDate(m);
  if (stated.date !== undefined) {
    if (!DATE_RE.test(stated.date)) refused.push(`--date ${stated.date} is not YYYY-MM-DD`);
    else if (date && m.drawn != null && date !== stated.date) refused.push(`--date says ${stated.date}, and the run records drawn: ${date}: the run's own record stands; drop the --date`);
    else date = stated.date;
  }
  if (!date) refused.push('records no date: map/scanners.yaml carries no drawn: and no row a reviewed.date; state it with --date <run>=YYYY-MM-DD (never the file system\'s)');

  const candidates = buildCandidates(dir, reg);
  if (!candidates) refused.push(`has no yardstick.yaml: measure it first (node assay.mjs measure ${runArg} --write)`);

  if (refused.length) return { run: runArg, refused };
  return { run: runArg, target: identityString(identity), key: identityKey(identity), date, candidates };
}

// The tally over runs already read (readRun, none refused):
// { runs: [{ run, target, date, added }], properties: [{ property, status, targets, findings, first }], unnamed }
//   runs        in date order (ties keep the order given); target as the target's first run states it, so
//               one target reads one way however its runs spell the remote; added: properties no earlier run carried
//   properties  proposed first, then by targets, then by name; targets the identities, in first-seen order;
//               findings the number of candidate findings naming it; first the run it first appeared in
//   unnamed     the number of candidate findings naming no property, over every run
function tally(read) {
  const runs = read.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i)).map((x) => x.r);
  const props = new Map();
  const named = new Map();   // target key → the identity as its first run in date order states it
  let unnamed = 0;
  const series = [];
  for (const r of runs) {
    if (!named.has(r.key)) named.set(r.key, r.target);
    const target = named.get(r.key);
    let added = 0;
    unnamed += r.candidates.unnamed.length;
    for (const p of r.candidates.properties) {
      let t = props.get(p.property);
      if (!t) { t = { property: p.property, targets: new Map(), findings: 0, first: r.run }; props.set(p.property, t); added++; }
      if (!t.targets.has(r.key)) t.targets.set(r.key, target);
      t.findings += p.findings.length;
    }
    series.push({ run: r.run, target, date: r.date, added });
  }
  const properties = [...props.values()].map((t) => ({
    property: t.property, status: t.targets.size >= PROPOSE_AT ? 'proposed' : 'held',
    targets: [...t.targets.values()], findings: t.findings, first: t.first,
  })).sort((a, b) => (a.status === b.status ? 0 : a.status === 'proposed' ? -1 : 1) || b.targets.length - a.targets.length || (a.property < b.property ? -1 : a.property > b.property ? 1 : 0));
  return { runs: series, properties, unnamed };
}

function render(doc) {
  const targets = new Set(doc.runs.map((r) => r.target));
  const proposed = doc.properties.filter((p) => p.status === 'proposed');
  const held = doc.properties.filter((p) => p.status === 'held');
  const L = [`Candidate properties across ${doc.runs.length} run${doc.runs.length === 1 ? '' : 's'} of ${targets.size} independent target${targets.size === 1 ? '' : 's'} (runs of one target count once).`, ''];
  L.push('Saturation: the properties each run adds that no earlier run carried, in date order.');
  for (const r of doc.runs) L.push(`  ${r.date}  +${r.added}  ${r.run}  (${r.target})`);
  L.push('', `Proposed: ${proposed.length}, each seen on ${PROPOSE_AT} or more independent targets.`);
  const row = (p) => {
    L.push(`  ${p.property}: ${p.targets.length} target${p.targets.length === 1 ? '' : 's'}, ${p.findings} finding${p.findings === 1 ? '' : 's'}, first in ${p.first}`);
    for (const t of p.targets) L.push(`      ${t}`);
  };
  proposed.forEach(row);
  L.push('', `Held: ${held.length}, each seen on one target so far.`);
  held.forEach(row);
  L.push('', `Unnamed: ${doc.unnamed} candidate finding${doc.unnamed === 1 ? '' : 's'} name${doc.unnamed === 1 ? 's' : ''} no property; counted here, never as one property.`);
  L.push('', 'Proposing edits nothing. A proposed property becomes a requirement only by a reviewed change to yardstick/requirements.yaml that names its sources (these runs and their findings), as every row does.');
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const usage = 'usage: node assay.mjs candidates <run> <run> … [--json] [--target <run>=<repository>[#<path>]] [--date <run>=YYYY-MM-DD]';
  const runArgs = [];
  const stated = new Map();   // resolved run dir → { target?, date? }
  const state = (flag, value, field) => {
    const eq = value == null ? -1 : value.indexOf('=');
    if (eq < 1) { console.error(`✗ ${flag} takes <run>=<value> (got ${JSON.stringify(value ?? '')})\n${usage}`); process.exit(2); }
    const k = resolve(value.slice(0, eq));
    stated.set(k, { ...(stated.get(k) || {}), [field]: value.slice(eq + 1) });
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') continue;
    if (a === '--target') { state(a, args[++i], 'target'); continue; }
    if (a === '--date') { state(a, args[++i], 'date'); continue; }
    if (a.startsWith('--')) { console.error(`✗ unknown flag ${a}\n${usage}`); process.exit(2); }
    runArgs.push(a);
  }
  if (!runArgs.length) { console.error(usage); process.exit(2); }
  const dirs = new Set(runArgs.map((r) => resolve(r)));
  for (const k of stated.keys()) if (!dirs.has(k)) { console.error(`✗ --target/--date names ${k}, which is not one of the runs given\n${usage}`); process.exit(2); }
  if (dirs.size !== runArgs.length) { console.error('✗ a run is given twice: each run counts once'); process.exit(2); }

  const reg = loadYardstick();
  const read = runArgs.map((r) => readRun(r, stated.get(resolve(r)) || {}, reg));
  const refused = read.filter((r) => r.refused);
  if (refused.length) {
    console.error(`✗ candidates refused: ${refused.length} of ${read.length} run${read.length === 1 ? '' : 's'} cannot be counted, so nothing is tallied`);
    for (const r of refused) for (const why of r.refused) console.error(`  • ${r.run}: ${why}`);
    process.exit(1);
  }
  const doc = tally(read);
  if (args.includes('--json')) process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  else process.stdout.write(render(doc));
}
