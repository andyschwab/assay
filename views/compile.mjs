#!/usr/bin/env node
// compile.mjs — assemble the full evaluation package for a run: one map, one
// yardstick, three views.
//
// One command → the whole deliverable, three readers over one measurement:
//   • INTAKE   (eval/intake.yaml + INTAKE.md)     — views/intake.mjs           [can this map be carried?]
//   • MAINTAIN (eval/maintain.yaml + MAINTAIN.md) — views/maintain.mjs         [is it still healthy?]
//   • IMPROVE  (eval/improve.yaml + IMPROVE.md)   — views/improve/{report,axes,handoff,topics}.mjs [what makes it better?]
//   • the INDEX (INDEX.md)                        — written here               [front door]
// Assay draws a map, measures it against a yardstick, then writes these three
// views. Improve's lead page (IMPROVE.md) compiles only when the run carries
// its authored inputs (eval/report-prose.yaml); a raw base still gets the
// walk + handoff + Intake + Maintain, and the INDEX says which lead is
// present. Scanner-native reports (deep-code-review's own) are listed as
// APPENDICES — provenance in each scanner's own voice, never merged.
// Branded/PDF output lives outside assay (Andy's decision, 2026-09-24) — this
// writes Markdown + YAML only.
//
// No safe-to-run, no single grade — each axis carries its own posture
//.
//
// Usage: node assay.mjs compile <run-dir>
import { writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, registryAxes as registryAxesOf, loadManifest, dispositions, scannerLine, notRunPhrase, loadScannerCoverage, axisCoverage, coveragePhrase } from '../map/project.mjs';
import { loadDecisions, decideProjected } from '../map/decisions.mjs';
import { projectRun as projectDescriptorsOf, summarize as summarizeDescriptors } from '../yardstick/measure.mjs';
import { buildRows } from './floor-fleet.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) { console.error('usage: node assay.mjs compile <run-dir>'); process.exit(2); }
const runDir = arg.replace(/\/eval\/?$/, '');
const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
const runId = basename(runDir);

function run(script, args, optional = false) {
  const r = spawnSync('node', [join(HERE, script), runDir, ...args], { stdio: 'inherit' });
  if (r.status !== 0 && !optional) { console.error(`✗ ${script} failed`); process.exit(1); }
  return r.status === 0;
}

// run-level confidentiality (prose key or flag); forwarded to every child compiler
const hasProse = existsSync(join(evalDir, 'report-prose.yaml'));
let proseConfidential = false;
try { if (hasProse) { const pr = parseYaml(readFileSync(join(evalDir, 'report-prose.yaml'), 'utf8')); proseConfidential = !!(pr && pr.confidential === true); } } catch { /* the report compiler reports it */ }
const CONFIDENTIAL = process.argv.includes('--confidential') || proseConfidential;
const confArgs = CONFIDENTIAL ? ['--confidential'] : [];

// ── the gate first: no package over an unvalidated base ──────────────────────
// validate.mjs is the format contract AND the run manifest (every adopted scanner's
// disposition). A package that compiles over a base with an unrecorded scanner
// reads as coverage that never happened; so the package never compiles without it.
console.log('· validate …');                  run('../map/validate.mjs', []);
// the measurement: every package carries eval/yardstick.yaml (yardstick/README.md); the
// validator drift-checks it on the next validate, so a stale read cannot outlive its base
console.log('· measure  (yardstick) …');      run('../yardstick/measure.mjs', ['--write']);
console.log('· topics   (improve.yaml) …');   run('improve/topics.mjs', ['--write']);

// ── the three views ───────────────────────────────────────────────────────────
console.log('· walk     (improve/axes) …');   run('improve/axes.mjs', confArgs);
console.log('· handoff  (improve/handoff) …'); run('improve/handoff.mjs', confArgs);
let reportOk = false;
if (hasProse) {
  console.log('· report   (improve/report) …'); reportOk = run('improve/report.mjs', confArgs);
} else {
  console.log('· report   — skipped (no eval/report-prose.yaml; the walk is the human read for a raw base)');
}
console.log('· intake   (can it be carried?) …'); run('intake.mjs', []);
console.log('· maintain (is it still healthy?) …'); run('maintain.mjs', []);

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
  for (const dir of [runDir, evalDir]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) for (const id of peers)
      if (f.toLowerCase() === `${id}.md` && !out.has(id)) out.set(id, join(dir, f));
  }
  return [...out.entries()];
}

// ── the yardstick glance for the index ──────────────────────────────────────
const descRows = projectDescriptorsOf(runDir);
const descSum = summarizeDescriptors(descRows);
const descUnmet = descRows.filter((r) => r.status === 'unmet').map((r) => `\`${r.id}\``);
const descClaims = descRows.filter((r) => r.kind === 'claim').length;

// ── the three views' own counts, for the lead lines ─────────────────────────
const intakeBuilt = buildRows(runDir, 'floor');
const maintainBuilt = buildRows(runDir, 'fleet', { withFloor: true });
const viewCount = (b) => b ? `${b.open.length} open · ${b.met.length} met · ${b.to_run.length} to run` : 'not measured yet';

// ── INDEX.md — the front door ────────────────────────────────────────────────
const rel = (p) => relative(runDir, p) || basename(p);
const apps = findAppendices();
const improveRow = reportOk
  ? `**Improve** — [\`IMPROVE.md\`](IMPROVE.md): the report, authored narrative over computed structure, area by area.`
  : `**Improve** — [\`eval/improve-axes.md\`](eval/improve-axes.md): the walk (no \`eval/report-prose.yaml\` — author it to compile \`IMPROVE.md\` too).`;

const index = `---
type: doc
${CONFIDENTIAL ? 'confidential: true\n' : ''}title: "${runId} — evaluation package"
---

# ${runId} — evaluation package

One map, one yardstick, three views. No single verdict: one flat axis roster,
each axis its own posture; a requirement is met, unmet, mixed, or not measured
— never priced, never graded pass/fail.

**Scanners:** ${scannerLine(manifest, sources, adapters)} · **${projected.length} findings** · run ${runDate}${hasDecisions ? ' · owner triage applied (`eval/decisions.yaml`)' : ' · raw base (no triage)'}.

## The three views

- **Intake** _(can this map be carried?)_ — [\`INTAKE.md\`](INTAKE.md): ${viewCount(intakeBuilt)} of the floor requirements.
- **Maintain** _(is it still healthy?)_ — [\`MAINTAIN.md\`](MAINTAIN.md): ${viewCount(maintainBuilt)} of the fleet requirements.
- ${improveRow}

## The roster (glance)

${axisLines.join('\n')}
${notMeasured.length ? `\n_Not measured this run: ${notMeasured.map((a) => `\`${a}\``).join(', ')} — ${ownersOf(notMeasured).map((o) => `${o} ${notRunPhrase(manifest, o)}`).join('; ')}. Absence of findings is absence of looking, not health._` : ''}

## The yardstick (glance)

${descSum.decided} of ${descSum.of} requirements decided by this run (met ${descSum.met} · unmet ${descSum.unmet} · mixed ${descSum.mixed}); ${descSum['not-measured']} not measured, of which ${descClaims} are claim-only rows a sidecar decides, never a run.${descUnmet.length ? ` Unmet: ${descUnmet.join(', ')}.` : ''} The full measurement is \`eval/yardstick.yaml\`.

## The data files

| Artifact | Reader | What it is |
|---|---|---|
| [\`eval/intake.yaml\`](eval/intake.yaml) | machine | Intake's floor rows: open, met, to run, not seen. |
| [\`eval/maintain.yaml\`](eval/maintain.yaml) | machine | Maintain's fleet rows: open, met, to run, not seen. |
| [\`eval/improve.yaml\`](eval/improve.yaml) | machine | Every requirement on the yardstick, grouped by topic. |
| [\`eval/yardstick.yaml\`](eval/yardstick.yaml) | machine, and what a repository's own claims are compared against | The measurement itself: per requirement, what this run decides and how; claim rows read not measured by construction. |
| [\`eval/improve-axes.md\`](eval/improve-axes.md) | human, detail | The walk: per-axis properties, risks, seams, the not-measured register, requirements by topic. |
| [\`handoff/START-HERE.md\`](handoff/START-HERE.md) | machine / agent | How to act, sequenced worst-first. |
| [\`handoff/REMEDIATION.md\`](handoff/REMEDIATION.md) | machine / agent | The full spine: every actionable gap, verbatim fix, proof step. |
| [\`handoff/plan/\`](handoff/plan/) | machine / agent | One session prompt per Critical/High item (interview → fix → prove). |

## Appendices — scanner-native reports (provenance, in each scanner's own voice)

${[...apps.map(([label, p]) => `- **${label}** — [\`${rel(p)}\`](${rel(p)})`),
   ...dispo.ran.filter((id) => adapters[id].role !== 'instrument' && id !== 'repo-eval' && !apps.some(([l]) => l === id)).map((id) => `- **${id}** — ran; no native report in this run (its port rows in \`eval/\` are the record).`),
   ...dispo.skipped.map((s) => `- **${s.id}** — skipped this run: ${s.reason}.`),
   ...dispo.failed.map((s) => `- **${s.id}** — failed this run: ${s.reason}.`),
  ].join('\n') || '_None generated for this run. Run a scanner\'s native reporter to add one._'}

_Improve leads with the report; these are the raw scanner voices behind the projection —
listed, never merged (independent convergence is recorded, not collapsed)._

## Regenerate

\`\`\`
node assay.mjs compile ${runDir}
\`\`\`
Deterministic and re-runnable. Drop \`eval/decisions.yaml\` to fold in owner triage
(optional; never required — the raw base always compiles).

---
_assay evaluation engine. Run \`${runId}\`.${CONFIDENTIAL ? ' Confidential.' : ''}_
`;

writeFileSync(join(runDir, 'INDEX.md'), index);
console.log(`\n✓ package assembled — INDEX.md + INTAKE.md + MAINTAIN.md${reportOk ? ' + IMPROVE.md' : ''} + eval/improve-axes.md + handoff/ (${apps.length} appendix source${apps.length === 1 ? '' : 's'})`);
