#!/usr/bin/env node
// compile-package.mjs — assemble the full evaluation package for a run.
//
// One command → the whole deliverable, three readers, one bundle:
//   • the REPORT  (MAINTAINER-REPORT.{md,pdf}) — compile-report + render-pdf [human, the lead]
//   • the WALK    (eval/view-axes.md)          — compile-axes.mjs   [human, per-axis detail]
//   • the HANDOFF (handoff/)                   — compile-handoff.mjs [machine, actionable]
//   • the INDEX   (INDEX.md)                   — written here        [front door]
// The report is the lead human deliverable: authored narrative over computed
// structure, areas property-named and shared across scanners. It compiles only
// when the run carries its authored inputs (eval/report-prose.yaml); a raw base
// still gets the walk + handoff, and the INDEX says which lead is present.
// Scanner-native reports (deep-code-review's own) are listed as APPENDICES —
// provenance in each scanner's own voice, never merged.
//
// No safe-to-run, no single grade — each axis carries its own posture
//.
//
// Usage: node tools/compile-package.mjs <run-dir> [--no-pdf]
import { writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, registryAxes as registryAxesOf, loadManifest, dispositions, scannerLine, notRunPhrase, loadScannerCoverage, axisCoverage, coveragePhrase } from './project.mjs';
import { loadDecisions, decideProjected } from './decisions.mjs';
import { projectRun as projectDescriptorsOf, summarize as summarizeDescriptors } from './descriptors.mjs';
import { parseYaml } from './yaml-min.mjs';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/compile-package.mjs <run-dir> [--no-pdf]'); process.exit(2); }
const runDir = arg.replace(/\/eval\/?$/, '');
const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
const runId = basename(runDir);
const noPdf = process.argv.includes('--no-pdf');

function run(tool, args, optional = false) {
  const r = spawnSync('node', [join(HERE, tool), runDir, ...args], { stdio: 'inherit' });
  if (r.status !== 0 && !optional) { console.error(`✗ ${tool} failed`); process.exit(1); }
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
console.log('· validate …');                  run('validate.mjs', []);
// the register read: every package carries eval/view-descriptors.yaml (registry/README.md); the
// validator drift-checks it on the next validate, so a stale read cannot outlive its base
console.log('· register (descriptors) …');    run('descriptors.mjs', ['--write']);

// ── the compiled artifacts ───────────────────────────────────────────────────
console.log('· walk    (compile-axes) …');    run('compile-axes.mjs', confArgs);
console.log('· handoff (compile-handoff) …'); run('compile-handoff.mjs', confArgs);
let reportOk = false, pdfOk = false;
if (hasProse) {
  console.log('· report  (compile-report) …');
  reportOk = run('compile-report.mjs', confArgs);
  if (reportOk && !noPdf) {
    console.log('· report PDF (render-pdf) …');
    pdfOk = run('render-pdf.mjs', confArgs, true);
    if (!pdfOk) console.error('  (PDF skipped — markdown-it/Chromium unavailable; INDEX links the Markdown report)');
  }
} else {
  console.log('· report  — skipped (no eval/report-prose.yaml; the walk is the human read for a raw base)');
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
  for (const dir of [runDir, evalDir]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) for (const id of peers)
      if (f.toLowerCase() === `${id}.md` && !out.has(id)) out.set(id, join(dir, f));
  }
  return [...out.entries()];
}

// ── the register glance for the index ──────────────────────────────────────
const descRows = projectDescriptorsOf(runDir);
const descSum = summarizeDescriptors(descRows);
const descUnmet = descRows.filter((r) => r.status === 'unmet').map((r) => `\`${r.id}\``);
const descClaims = descRows.filter((r) => r.kind === 'claim').length;

// ── INDEX.md — the front door ────────────────────────────────────────────────
const rel = (p) => relative(runDir, p) || basename(p);
const apps = findAppendices();
const reportRow = reportOk
  ? `| [\`MAINTAINER-REPORT.${pdfOk ? 'pdf' : 'md'}\`](MAINTAINER-REPORT.${pdfOk ? 'pdf' : 'md'}) | human, the lead | The report: authored narrative over computed structure, area by area. |`
  : `| _report not compiled_ (no \`eval/report-prose.yaml\`) | human, the lead | Author the prose to compile it; the walk below is the human read meanwhile. |`;

const index = `---
type: doc
${CONFIDENTIAL ? 'confidential: true\n' : ''}title: "${runId} — evaluation package"
---

# ${runId} — evaluation package

The full deliverable, three readers, one bundle. No single verdict: one flat axis
roster, each axis its own posture. Severity is a property; the go/no-go is the
reader's.

**Scanners:** ${scannerLine(manifest, sources, adapters)} · **${projected.length} findings** · run ${runDate}${hasDecisions ? ' · owner triage applied (`eval/decisions.yaml`)' : ' · raw base (no triage)'}.

## The roster (glance)

${axisLines.join('\n')}
${notMeasured.length ? `\n_Not measured this run: ${notMeasured.map((a) => `\`${a}\``).join(', ')} — ${ownersOf(notMeasured).map((o) => `${o} ${notRunPhrase(manifest, o)}`).join('; ')}. Absence of findings is absence of looking, not health._` : ''}

## The register (glance)

${descSum.decided} of ${descSum.of} descriptors decided by this run (met ${descSum.met} · unmet ${descSum.unmet} · mixed ${descSum.mixed}); ${descSum['not-measured']} not measured, of which ${descClaims} are claim-only rows a sidecar decides, never a run.${descUnmet.length ? ` Unmet: ${descUnmet.join(', ')}.` : ''} The full read is \`eval/view-descriptors.yaml\`.

## What's in the package

| Artifact | Reader | What it is |
|---|---|---|
${reportRow}
| [\`eval/view-axes.md\`](eval/view-axes.md) | human, detail | The walk: per-axis properties, risks, seams, the not-measured register. |
| [\`eval/view-descriptors.yaml\`](eval/view-descriptors.yaml) | machine / the sidecar's counterpart | The register read: per descriptor, what this run decides and how; claim rows read not measured by construction. |
| [\`handoff/START-HERE.md\`](handoff/START-HERE.md) | machine / agent | How to act, sequenced worst-first. |
| [\`handoff/REMEDIATION.md\`](handoff/REMEDIATION.md) | machine / agent | The full spine: every actionable gap, verbatim fix, proof step. |
| [\`handoff/plan/\`](handoff/plan/) | machine / agent | One session prompt per Critical/High item (interview → fix → prove). |

## Appendices — scanner-native reports (provenance, in each scanner's own voice)

${[...apps.map(([label, p]) => `- **${label}** — [\`${rel(p)}\`](${rel(p)})`),
   ...dispo.ran.filter((id) => adapters[id].role !== 'instrument' && id !== 'repo-eval' && !apps.some(([l]) => l === id)).map((id) => `- **${id}** — ran; no native report in this run (its port rows in \`eval/\` are the record).`),
   ...dispo.skipped.map((s) => `- **${s.id}** — skipped this run: ${s.reason}.`),
   ...dispo.failed.map((s) => `- **${s.id}** — failed this run: ${s.reason}.`),
  ].join('\n') || '_None generated for this run. Run a scanner\'s native reporter to add one._'}

_The report leads; these are the raw scanner voices behind the projection — listed,
never merged (independent convergence is recorded, not collapsed)._

## Regenerate

\`\`\`
node tools/compile-package.mjs ${runDir}
\`\`\`
Deterministic and re-runnable. Drop \`eval/decisions.yaml\` to fold in owner triage
(optional; never required — the raw base always compiles).

---
_assay evaluation engine. Run \`${runId}\`.${CONFIDENTIAL ? ' Confidential.' : ''}_
`;

writeFileSync(join(runDir, 'INDEX.md'), index);
console.log(`\n✓ package assembled — INDEX.md${reportOk ? ` + MAINTAINER-REPORT.${pdfOk ? 'pdf' : 'md'}` : ''} + eval/view-axes.md + handoff/ (${apps.length} appendix source${apps.length === 1 ? '' : 's'})`);
