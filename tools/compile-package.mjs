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
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes } from './project.mjs';
import { loadDecisions, decideProjected } from './decisions.mjs';
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
const registryAxes = orderAxes([...contributedBySources(adapters, Object.keys(adapters))]);
const notMeasured = registryAxes.filter((a) => !contributed.has(a));
const runDate = (runId.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
const decided = decideProjected(projected, loadDecisions(runDir), runDate);
const hasDecisions = loadDecisions(runDir).length > 0;

const axisLines = roster.map((a) => {
  const arr = decided.filter((p) => p.axis === a);
  const open = arr.filter((p) => p.state === 'open').length;
  const held = arr.filter((p) => p.state === 'strength').length;
  const waived = arr.filter((p) => p.state === 'accepted' || p.state === 'snoozed').length;
  const mb = sources.filter((s) => (adapters[s]?.contributes || []).includes(a));
  return `- \`${a}\` — ${open} open · ${held} held${waived ? ` · ${waived} triaged out` : ''} _(${mb.length ? mb.join(', ') : 'fed only'})_`;
});

// ── appendices: scanner-native reports (this run + sibling runs) ─────────────
// A scanner's own report in its own voice — provenance, listed but not merged.
function findAppendices() {
  const out = [];
  const runsDir = dirname(runDir);
  const scan = (dir) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return; // a stray file beside a run must not abort
    for (const f of readdirSync(dir)) {
      if (/^deep-code-review\.md$/i.test(f)) out.push(['deep-code-review', join(dir, f)]);
    }
  };
  scan(runDir); scan(evalDir);
  if (existsSync(runsDir)) for (const d of readdirSync(runsDir)) scan(join(runsDir, d)); // sibling runs (dir-guarded)
  const seen = new Map();
  for (const [label, p] of out) if (!seen.has(label)) seen.set(label, p);
  return [...seen.entries()];
}

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

**Scanners:** ${sources.join(', ')} · **${projected.length} findings** · run ${runDate}${hasDecisions ? ' · owner triage applied (`eval/decisions.yaml`)' : ' · raw base (no triage)'}.

## The roster (glance)

${axisLines.join('\n')}
${notMeasured.length ? `\n_Not measured this run: ${notMeasured.map((a) => `\`${a}\``).join(', ')} — the measuring scanner did not run. Absence of findings is absence of looking, not health._` : ''}

## What's in the package

| Artifact | Reader | What it is |
|---|---|---|
${reportRow}
| [\`eval/view-axes.md\`](eval/view-axes.md) | human, detail | The walk: per-axis properties, risks, seams, the not-measured register. |
| [\`handoff/START-HERE.md\`](handoff/START-HERE.md) | machine / agent | How to act, sequenced worst-first. |
| [\`handoff/REMEDIATION.md\`](handoff/REMEDIATION.md) | machine / agent | The full spine: every actionable gap, verbatim fix, proof step. |
| [\`handoff/plan/\`](handoff/plan/) | machine / agent | One session prompt per Critical/High item (interview → fix → prove). |

## Appendices — scanner-native reports (provenance, in each scanner's own voice)

${apps.length ? apps.map(([label, p]) => `- **${label}** — [\`${rel(p)}\`](${rel(p)})`).join('\n') : '_None generated for this run. Run a scanner\'s native reporter to add one._'}

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
