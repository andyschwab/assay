#!/usr/bin/env node
// compile.mjs — assemble the full evaluation package for a run: one map, one
// yardstick, four views.
//
// One command → the whole deliverable, four readers over one measurement:
//   • INTAKE   (views/intake.yaml + INTAKE.md)     — views/intake.mjs           [can this map be carried?]
//   • MAINTAIN (views/maintain.yaml + MAINTAIN.md) — views/maintain.mjs         [is it still healthy?]
//   • IMPROVE  (views/improve.yaml + IMPROVE.md)   — views/improve/{report,axes,handoff,topics}.mjs [what makes it better?]
//   • OWNER    (views/owner.yaml + OWNER.md)       — views/owner.mjs            [what is true of it, for the person who is not an engineer?]
//   • the INDEX (INDEX.md)                        — written here               [front door]
// Assay draws a map, measures it against a yardstick, then writes these four
// views. Improve's lead page (IMPROVE.md) compiles only when the run carries
// its authored inputs (views/improve/prose.yaml); a raw base still gets the
// walk + handoff + Intake + Maintain + Owner, and the INDEX says which lead is
// present. Scanner-native reports (deep-code-review's own) are listed as
// APPENDICES — provenance in each scanner's own voice, never merged.
// Branded/PDF output lives outside assay (Andy's decision, 2026-09-24) — this
// writes Markdown + YAML only.
//
// No safe-to-run, no single grade — each axis carries its own posture
//.
//
// Usage: node assay.mjs compile <run-dir> [--packet <dir>] [--since <prev-run-dir>] [--target <repo>]
//   --target   forwarded to the validate gate: every cited path must resolve in the
//              target, and every cited line must be inside its file (map/SCHEMA.md §7)
//   --packet   validate a repository's own packet and fold it into the measurement
//              (forwarded to yardstick/measure.mjs --write; owner/PACKET.md)
import { writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, registryAxes as registryAxesOf, loadManifest, dispositions, scannerLine, modelsLine, notRunPhrase, loadScannerCoverage, axisCoverage, coveragePhrase } from '../map/project.mjs';
import { loadDecisions, decideProjected } from '../map/decisions.mjs';
import { projectRun as measureRunOf, summarize as summarizeMeasurement } from '../yardstick/measure.mjs';
import { buildRows } from './floor-fleet.mjs';
import { buildOwner } from './owner.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { readFileSync } from 'node:fs';
import { prosePath as runProsePath, nativeDir, indexPath, sincePagePath } from '../lib/run-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const packetIdx = argv.indexOf('--packet');
const packetArgs = packetIdx > -1 ? ['--packet', argv[packetIdx + 1]] : [];
const sinceIdx = argv.indexOf('--since');
const previousRun = sinceIdx > -1 ? argv[sinceIdx + 1] : null;
const targetIdx = argv.indexOf('--target');
const targetArgs = targetIdx > -1 ? ['--target', argv[targetIdx + 1]] : [];
const reserved = new Set([packetIdx > -1 ? packetIdx + 1 : -1, sinceIdx > -1 ? sinceIdx + 1 : -1, targetIdx > -1 ? targetIdx + 1 : -1].filter((i) => i > -1));
const arg = argv.find((a, i) => !a.startsWith('--') && !reserved.has(i));
if (!arg) { console.error('usage: node assay.mjs compile <run-dir> [--packet <dir>] [--since <prev-run-dir>] [--target <repo>]'); process.exit(2); }
const runDir = arg;
const runId = basename(runDir);

function run(script, args, optional = false) {
  const r = spawnSync('node', [join(HERE, script), runDir, ...args], { stdio: 'inherit' });
  if (r.status !== 0 && !optional) { console.error(`✗ ${script} failed`); process.exit(1); }
  return r.status === 0;
}

// run-level confidentiality (prose key or flag); forwarded to every child compiler
const hasProse = existsSync(runProsePath(runDir));
let proseConfidential = false;
try { if (hasProse) { const pr = parseYaml(readFileSync(runProsePath(runDir), 'utf8')); proseConfidential = !!(pr && pr.confidential === true); } } catch { /* the report compiler reports it */ }
const CONFIDENTIAL = process.argv.includes('--confidential') || proseConfidential;
const confArgs = CONFIDENTIAL ? ['--confidential'] : [];

// ── the gate first: no package over an unvalidated base ──────────────────────
// validate.mjs is the format contract AND the run manifest (every adopted scanner's
// disposition). A package that compiles over a base with an unrecorded scanner
// reads as coverage that never happened; so the package never compiles without it.
console.log('· validate …');                  run('../map/validate.mjs', targetArgs);
// the measurement: every package carries yardstick.yaml (yardstick/README.md); the
// validator drift-checks it on the next validate, so a stale read cannot outlive its base
console.log('· measure  (yardstick) …');      run('../yardstick/measure.mjs', ['--write', ...packetArgs]);
console.log('· topics   (improve.yaml) …');   run('improve/topics.mjs', ['--write']);

// ── the four views ───────────────────────────────────────────────────────────
console.log('· walk     (improve/axes) …');   run('improve/axes.mjs', confArgs);
console.log('· handoff  (improve/handoff) …'); run('improve/handoff.mjs', confArgs);
let reportOk = false;
if (hasProse) {
  console.log('· report   (improve/report) …'); reportOk = run('improve/report.mjs', confArgs);
} else {
  console.log('· report   — skipped (no views/improve/prose.yaml; the walk is the human read for a raw base)');
}
console.log('· intake   (can it be carried?) …'); run('intake.mjs', confArgs);
console.log('· maintain (is it still healthy?) …'); run('maintain.mjs', confArgs);
console.log('· owner    (what is true of it?) …'); run('owner.mjs', confArgs);
let sinceOk = false;
if (previousRun) {
  console.log('· since    (what changed?) …'); sinceOk = run('since.mjs', ['--previous', previousRun, ...confArgs]);
} else {
  console.log('· since    — skipped (no --since <prev-run-dir> given)');
}

// ── axis summary for the index ───────────────────────────────────────────────
const findings = loadFindings(runDir);
const adapters = loadAdapters();
const { projected } = projectMulti(findings, adapters);
const sources = [...new Set(projected.map((p) => p.source))].sort();
const contributed = contributedBySources(adapters, sources);
const roster = rosterFor(adapters, sources, projected);
const registryAxes = registryAxesOf(adapters);
const notMeasured = registryAxes.filter((a) => !contributed.has(a));
const manifest = loadManifest(runDir);
const dispo = dispositions(manifest, adapters);
const scannerCov = loadScannerCoverage(runDir);
const ownersOf = (axes) => [...new Set(Object.values(adapters)
  .filter((ad) => ad.adopted !== false && (ad.contributes || []).some((x) => axes.includes(x))).map((ad) => ad.scanner))].sort();
const runDate = (runId.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
const decided = decideProjected(projected, loadDecisions(runDir), runDate);
const hasDecisions = loadDecisions(runDir).length > 0;

const axisLines = roster.map((a) => {
  const arr = decided.filter((p) => p.axis === a);
  const open = arr.filter((p) => p.state === 'open').length;
  const held = arr.filter((p) => p.state === 'strength').length;
  const waived = arr.filter((p) => p.state === 'accepted' || p.state === 'snoozed').length;
  const mb = sources.filter((s) => (adapters[s]?.contributes || []).includes(a));
  const partial = coveragePhrase(axisCoverage(adapters, scannerCov, a));
  return `- \`${a}\` — ${open} open · ${held} held${waived ? ` · ${waived} triaged out` : ''} _(${mb.length ? mb.join(', ') : 'fed only'}${partial ? `; partially measured — ${partial}` : ''})_`;
});

// ── appendices: scanner-native reports (THIS run only) ───────────────────────
// A peer scanner's own report in its own voice — provenance, listed but not merged.
// Only this run's directories are scanned: an earlier version also picked up
// sibling runs, and a repo-eval-only package once listed a five-day-old sibling
// report right beside its "code axes not measured" line. A run with no native
// report lists none; a peer scanner that ran without one is named as such.
function findAppendices() {
  const out = new Map();
  const peers = Object.values(adapters).filter((ad) => ad.role !== 'instrument' && ad.scanner !== 'repo-eval').map((ad) => ad.scanner);
  for (const dir of [nativeDir(runDir)]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) for (const id of peers)
      if (f.toLowerCase() === `${id}.md` && !out.has(id)) out.set(id, join(dir, f));
  }
  return [...out.entries()];
}

// ── the yardstick glance for the index ──────────────────────────────────────
const descRows = measureRunOf(runDir);
const descSum = summarizeMeasurement(descRows);
const descUnmet = descRows.filter((r) => r.status === 'unmet').map((r) => `\`${r.id}\``);
const descClaims = descRows.filter((r) => r.kind === 'claim' && r.status === 'not-measured').length;   // the claim rows no packet decided

// ── the four views' own counts, for the lead lines ─────────────────────────
const intakeBuilt = buildRows(runDir, 'floor');
const maintainBuilt = buildRows(runDir, 'fleet', { withFloor: true });
const ownerBuilt = buildOwner(runDir);
const viewCount = (b) => b ? `${b.open.length} open · ${b.met.length} met · ${b.to_run.length} to run` : 'not measured yet';
const ownerCount = (b) => b ? `${b.floor.open.length} open · ${b.floor.met.length} met · ${b.floor.not_measured.length} could not tell` : 'not measured yet';

// ── INDEX.md — the front door ────────────────────────────────────────────────
const rel = (p) => relative(runDir, p) || basename(p);
const apps = findAppendices();
const improveRow = reportOk
  ? `**Improve** — [\`IMPROVE.md\`](IMPROVE.md): the report, authored narrative over computed structure, area by area.`
  : `**Improve** — [\`views/improve/axes.md\`](views/improve/axes.md): the walk (no \`views/improve/prose.yaml\` — author it to compile \`IMPROVE.md\` too).`;
const sinceRow = sinceOk
  ? `\n- **Since** _(what changed?)_ — [\`SINCE.md\`](SINCE.md): compared against \`${basename(previousRun)}\`.`
  : '';

const models = modelsLine(manifest, adapters);   // per scanner and per pass (SCHEMA.md §5a)
const index = `---
type: doc
${CONFIDENTIAL ? 'confidential: true\n' : ''}title: "${runId} — evaluation package"
---

# ${runId} — evaluation package

One map, one yardstick, four views. No single verdict: one flat axis roster,
each axis its own posture; a requirement is met, unmet, mixed, or not measured
— never priced, never graded pass/fail.

**Scanners:** ${scannerLine(manifest, sources, adapters)} · **${projected.length} findings** · run ${runDate}${hasDecisions ? ' · owner triage applied (`owner/decisions.yaml`)' : ' · raw base (no triage)'}.
${models ? `\n**Models of record:** ${models}.\n` : ''}
## The four views

- **Intake** _(can this map be carried?)_ — [\`INTAKE.md\`](INTAKE.md): ${viewCount(intakeBuilt)} of the floor requirements.
- **Maintain** _(is it still healthy?)_ — [\`MAINTAIN.md\`](MAINTAIN.md): ${viewCount(maintainBuilt)} of the fleet requirements.
- ${improveRow}${sinceRow}
- **Owner** _(what is true of it, and what do I do first?)_ — [\`OWNER.md\`](OWNER.md): ${ownerCount(ownerBuilt)} of the floor requirements, in the owner's own register.

## The roster (glance)

${axisLines.join('\n')}
${notMeasured.length ? `\n_Not measured this run: ${notMeasured.map((a) => `\`${a}\``).join(', ')} — ${ownersOf(notMeasured).map((o) => `${o} ${notRunPhrase(manifest, o)}`).join('; ')}. Absence of findings is absence of looking, not health._` : ''}

## The yardstick (glance)

${descSum.decided} of ${descSum.of} requirements decided by this run (met ${descSum.met} · unmet ${descSum.unmet} · mixed ${descSum.mixed} · not applicable ${descSum['not-applicable']}); ${descSum['not-measured']} not measured, of which ${descClaims} are claim-only rows a sidecar decides, never a run.${descUnmet.length ? ` Unmet: ${descUnmet.join(', ')}.` : ''} The full measurement is \`yardstick.yaml\`.

## The data files

| Artifact | Reader | What it is |
|---|---|---|
| [\`views/intake.yaml\`](views/intake.yaml) | machine | Intake's floor rows: open, met, to run, not seen. |
| [\`views/maintain.yaml\`](views/maintain.yaml) | machine | Maintain's fleet rows: open, met, to run, not seen. |
| [\`views/owner.yaml\`](views/owner.yaml) | machine | Owner's floor and beyond-floor rows, each joined with the owner's risk/fix register, plus what was not looked at. |${sinceOk ? `\n| [\`views/since.yaml\`](views/since.yaml) | machine | What changed vs \`${basename(previousRun)}\`: regressed, improved, newly/no-longer measured, findings new/no-longer-found. |` : ''}
| [\`views/improve.yaml\`](views/improve.yaml) | machine | Every requirement on the yardstick, grouped by topic. |
| [\`yardstick.yaml\`](yardstick.yaml) | machine, and what a repository's own claims are compared against | The measurement itself: per requirement, what this run decides and how; claim rows read not measured by construction. |
| [\`views/improve/axes.md\`](views/improve/axes.md) | human, detail | The walk: per-axis properties, risks, seams, the not-measured register, requirements by topic. |
| [\`handoff/START-HERE.md\`](handoff/START-HERE.md) | machine / agent | How to act, sequenced worst-first. |
| [\`handoff/REMEDIATION.md\`](handoff/REMEDIATION.md) | machine / agent | The full spine: every actionable gap, verbatim fix, proof step. |
| [\`handoff/plan/\`](handoff/plan/) | machine / agent | One session prompt per Critical/High item (interview → fix → prove). |

## Appendices — scanner-native reports (provenance, in each scanner's own voice)

${[...apps.map(([label, p]) => `- **${label}** — [\`${rel(p)}\`](${rel(p)})`),
   ...dispo.ran.filter((id) => adapters[id].role !== 'instrument' && id !== 'repo-eval' && !apps.some(([l]) => l === id)).map((id) => `- **${id}** — ran; no native report in this run (its port rows in \`map/findings/\` are the record).`),
   ...dispo.skipped.map((s) => `- **${s.id}** — skipped this run: ${s.reason}.`),
   ...dispo.failed.map((s) => `- **${s.id}** — failed this run: ${s.reason}.`),
  ].join('\n') || '_None generated for this run. Run a scanner\'s native reporter to add one._'}

_Improve leads with the report; these are the raw scanner voices behind the projection —
listed, never merged (independent convergence is recorded, not collapsed)._

## Regenerate

\`\`\`
node assay.mjs compile ${runDir}
\`\`\`
Deterministic and re-runnable. Drop \`owner/decisions.yaml\` to fold in owner triage
(optional; never required — the raw base always compiles).

---
_assay evaluation engine. Run \`${runId}\`.${CONFIDENTIAL ? ' Confidential.' : ''}_
`;

writeFileSync(indexPath(runDir), index);
console.log(`\n✓ package assembled — INDEX.md + INTAKE.md + MAINTAIN.md + OWNER.md${reportOk ? ' + IMPROVE.md' : ''}${sinceOk ? ' + SINCE.md' : ''} + views/improve/axes.md + handoff/ (${apps.length} appendix source${apps.length === 1 ? '' : 's'})`);
