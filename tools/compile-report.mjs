#!/usr/bin/env node
// assay maintainer-report compiler.
// Usage: node tools/compile-report.mjs <run-dir>
// Assembles <run-dir>/MAINTAINER-REPORT.md from:
//   templates/maintainer-report.md            (fixed structure + markers)
//   <run-dir>/eval/findings.yaml               (computed tables)
//   <run-dir>/eval/view-security-gate.yaml     (the security exposures)
//   <run-dir>/eval/report-prose.yaml           (authored narrative)
// Tables are computed; prose is authored. Deterministic + re-runnable (a findings
// fix + recompile never clobbers prose). Run validate.mjs first.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';
import { DIM_LABEL, WHO_LABEL, channelLabel } from './display.mjs';
import { buildCapabilities, capabilityCounts, tracePhrase } from './capabilities.mjs';
import { buildChains } from './chains.mjs';
import { buildGlossary } from './glossary.mjs';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, orderAxes, axisTitle } from './project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, '..', 'templates', 'maintainer-report.md');

const arg = process.argv[2];
if (!arg) { console.error('usage: node compile-report.mjs <run-dir>'); process.exit(2); }
const runDir = arg.replace(/\/eval\/?$/, '');
const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
const need = (p) => { if (!existsSync(p)) { console.error(`missing required input: ${p}`); process.exit(2); } return p; };

const findings = loadFindings(evalDir);   // the shared per-pass-first, fail-closed loader
if (!findings.length) { console.error(`no findings under ${evalDir}`); process.exit(2); }
const gate = parseYaml(readFileSync(need(join(evalDir, 'view-security-gate.yaml')), 'utf8'));
const prose = parseYaml(readFileSync(need(join(evalDir, 'report-prose.yaml')), 'utf8'));
// Templates carry OKF frontmatter so they pass `npm run check` as bundle files;
// strip it before splicing so it never lands in the report body.
const stripFm = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, '');
const template = stripFm(readFileSync(need(TEMPLATE), 'utf8'));
const PART = join(HERE, '..', 'templates');
const glossaryDefs = parseYaml(readFileSync(need(join(PART, 'glossary.yaml')), 'utf8'));
const conceptsMd = stripFm(readFileSync(need(join(PART, 'concepts.md')), 'utf8')).trim();
const methodMd = stripFm(readFileSync(need(join(PART, 'method.md')), 'utf8')).trim();
const maturityGuideMd = stripFm(readFileSync(need(join(PART, 'maturity-guide.md')), 'utf8')).trim();
const app = String(prose.target_short || (prose.target || '').split(',')[0] || 'the app').trim();
// run-level confidentiality (prose key or flag) — marks frontmatter + colophon
const CONFIDENTIAL = process.argv.includes('--confidential') || prose.confidential === true;
const gradesPath = join(evalDir, 'view-maturity-grades.yaml');
const grades = existsSync(gradesPath) ? parseYaml(readFileSync(gradesPath, 'utf8')) : null;

const byId = new Map(findings.map((f) => [f.id, f]));
const cell = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const NUMWORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = (n) => NUMWORD[n] || String(n);
const capFirst = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const DIM_ORDER = ['artifact-legibility','context-economy','deterministic-gates','verification','delegation','improvement-loop','multiplayer','unprompted'];

// ── computed: snapshot stats (a stat strip + one small note) ────────────────
function snapshotStats() {
  const pol = { strength: 0, gap: 0, fact: 0 };
  const dim = {};
  let effects = 0, caps = 0;
  for (const f of findings) {
    pol[f.polarity] = (pol[f.polarity] || 0) + 1;
    dim[f.dimension] = (dim[f.dimension] || 0) + 1;
    if (f.subject_type === 'effect') effects++;
    if (f.subject_type === 'capability') caps++;
  }
  const dimStr = DIM_ORDER.filter((d) => dim[d]).map((d) => `${DIM_LABEL[d].toLowerCase()} ${dim[d]}`).join(' · ');
  return '| Findings | Strengths | Gaps | Facts | Effect channels | Capability findings |\n|---|---|---|---|---|---|\n' +
    `| ${findings.length} | ${pol.strength} | ${pol.gap} | ${pol.fact} | ${effects} | ${caps} |\n\n` +
    `By dimension: ${dimStr}.`;
}

// ── computed: security risks (illuminated, most-likely first — no go/no-go) ────────
// The security exposures presented as decisions, not a deployment verdict: each is a
// risk to fix, accept, or investigate. No "safe to run at level X" — the engine issues
// no go/no-go; this is repo-eval's native risk read.
function securityRisks() {
  const ex = gate.exposures || [];
  const rank = { high: 0, moderate: 1, low: 2 };
  const active = ex.filter((e) => e.blocks_stage !== 'none' && e.blocks_stage !== 'clear')
    .sort((a, b) => (rank[a.likelihood] ?? 3) - (rank[b.likelihood] ?? 3));
  const watch = ex.filter((e) => e.blocks_stage === 'none' || e.blocks_stage === 'clear');
  const out = [];
  if (!active.length && !watch.length) return '_No security exposures identified in this review._';
  if (active.length) {
    out.push('The security review\'s exposures, most likely first. Each is a decision, not a verdict — ' +
             'fix it, accept the risk, or investigate.\n');
    for (const e of active) {
      const ids = (e.findings || []).map((id) => byId.has(id) ? id : `${id}⚠`).join(', ');
      out.push(`### ${cell(e.title || e.name)} (${ids})\n`);
      out.push(`_${cell(e.what)}_` +
        (e.who ? `  \n· who: ${WHO_LABEL[e.who] || e.who} · likelihood: ${e.likelihood || 'n/a'}` : '') +
        `  \n· **fix:** ${cell(e.fix)}\n`);
    }
  }
  if (watch.length) {
    out.push(`### Standing watch (lower priority)\n`);
    for (const e of watch)
      out.push(`- **${cell(e.title || e.name)}** (${(e.findings || []).join(', ')}) — _${cell(e.what)}_  \n  · **watch:** ${cell(e.fix)}`);
    out.push('');
  }
  // dispositions (§6c): unsupervised kinds deliberately not gated, with the reason. Surfaced so
  // "the rest is here" is honest — nothing is silently unaddressed. Validator enforces coverage.
  const dispo = Array.isArray(prose.dispositions) ? prose.dispositions : [];
  if (dispo.length) {
    out.push(`### Accepted or deferred\n`);
    out.push(`These actions can act without a stop and are left that way on purpose. Each has a recorded reason, so no gap is dropped silently:\n`);
    for (const d of dispo)
      out.push(`- **${cell(channelLabel(d.channel, prose.channel_notes || {}))}** (_${cell(d.reason)}_) — ${cell(d.note)}`);
    out.push('');
  }
  return out.join('\n');
}

// ── computed: attack chains (the lead risk section) ─────────────────────────
const EFFORT_MD = { 0: 'trivial to trigger', 1: 'easy to trigger', 2: 'moderate effort', 3: 'hard to trigger' };
function chains() {
  const { live, held, contained, unresolved } = buildChains(findings, prose.channel_notes || {});
  const out = [];
  if (live.length) {
    out.push('Each item is a path an attacker could ride, from where they get in to what they reach. The order is computed from the evidence: widest reach first, then easiest to pull off. A path is listed here only if it reaches an action with no working stop.\n');
    for (const c of live) {
      const also = c.sinks.slice(1);
      out.push(`### ${cell(c.entry.label)} → ${cell(c.headline.label)}${c.tentative ? ' _(possible)_' : ''}\n`);
      out.push(`- **Reach:** ${cell(c.blastWord)} · **Effort:** ${EFFORT_MD[c.difficultyRank] || c.difficulty} (starts with ${cell(c.difficultyWhy)})`);
      if (also.length) out.push(`- **Also reaches:** ${also.map((s) => cell(s.label) + (s.confWord ? ` (${s.confWord})` : '')).join(', ')}`);
      out.push(`- **Cut it by:** fixing ${c.cuts.length ? c.cuts.map((x) => cell(x.label)).join('; ') : 'adding a stop before the action'} (${(c.cuts.map((x) => x.id).join(', ')) || 'no control found'})`);
      if (c.tentative && c.weak) out.push(`- **Not certain:** this path rests on ${c.weak}, which is ${c.confWord}`);
      out.push('');
    }
  } else {
    out.push('**The report did not identify a live attack chain** — a path from outside input to an action with no working stop. The paths below were reached, and the review found something limiting each one.\n');
  }
  if (held.length) {
    out.push('**Paths the review reached but did not find open:**\n');
    for (const h of held) out.push(`- ${cell(h.entry.label)} → ${h.holds.map((x) => cell(x.label) + ` (the review found ${x.by}${x.confWord ? `; ${x.confWord}` : ''})`).join(' · ')}`);
    out.push('');
  }
  if (contained.length) out.push(`**No action found:** ${contained.map((c) => cell(c.label)).join(', ')} — ${contained.length > 1 ? 'each takes in outside text; the review found no action either can take' : 'takes in outside text; the review found no action it can take'}.\n`);
  if (unresolved.length) out.push(`_${unresolved.length} value${unresolved.length > 1 ? 's' : ''} the review could not determine; listed with the questions below._`);
  return out.join('\n');
}
// chain-critical values the eval could not determine — folded into the questions section
function chainUnknowns() {
  const { unresolved } = buildChains(findings, prose.channel_notes || {});
  return unresolved.map((u) => `- Could not determine: **${cell(u.label)}** — ${cell(u.why)}.`);
}

// ── computed: maturity, area by area (measured coverage; ES carries the preview) ─
function maturity() {
  if (!grades || !Array.isArray(grades.dimensions)) return '_Maturity coverage not available._';
  const out = [
    'Each area is measured as coverage: of the things the review enumerated, how many meet ' +
    'that area\'s bar. The percentage is the finding; the denominator is always shown, and it ' +
    'counts what the review enumerated, not the whole system. Alongside each number is depth: ' +
    'how good the best instance is. Depth can be high while coverage is low; that reads as ' +
    '"the team knows how, and the work is doing it everywhere."\n',
  ];
  for (const d of grades.dimensions) {
    const name = DIM_LABEL[d.dimension] || d.dimension;
    if (d.coverage) {
      const c = d.coverage;
      out.push(`- **${name} — ${c.pct}%** (${c.met} of ${c.of} ${cell(c.what)}${c.kind === 'sampled' ? `; sampled: ${cell(c.method)}` : ''}). ${cell(d.depth)}`);
    } else {
      out.push(`- **${name} — not yet measured** (${cell(d.not_measured)}). ${cell(d.depth)}`);
    }
  }
  const a = grades.aggregate;
  if (a && a.of) out.push(`\nAcross the ${numWord(a.over)} measured areas together: **${a.pct}%** (${a.met} of ${a.of}). This pooled number moves whenever a new area gains a measure; the per-area numbers above are the stable truth.`);
  const anyEarned = grades.dimensions.some((d) => (d.enforced && d.enforced.claim) || (d.generative && d.generative.claim));
  if (!anyEarned) out.push('\nTwo further properties can be earned per area, with evidence: **enforced** (the coverage is itself machine-checked, so a regression is caught automatically) and **generative** (the system extends its own coverage by default, with AI in the loop). Neither is earned anywhere yet. That is expected; these are the frontier.');
  return out.join('\n');
}

// ── computed: scanner-contributed areas + the not-measured honesty line ──────
// Areas are property-named and SHARED: a scanner measuring a property the native
// passes also measure lands in the same area, recorded separately (independent
// convergence on one claim, never two chapters). Only counts render here — the
// per-finding detail, with file paths, lives in the walk and the handoff.
function scannerAxes() {
  const adapters = loadAdapters();
  const { projected } = projectMulti(findings, adapters);
  const external = projected.filter((p) => p.source !== 'repo-eval');
  const present = [...new Set(projected.map((p) => p.source))].sort();
  const contributed = contributedBySources(adapters, present);
  const registry = orderAxes([...contributedBySources(adapters, Object.keys(adapters))]);
  const notMeasured = registry.filter((a) => !contributed.has(a));
  const plain = (a) => capFirst((axisTitle(a).split(' — ')[0] || a).toLowerCase());
  const out = [];
  if (external.length) {
    const byAxis = new Map();
    for (const p of external) { if (!byAxis.has(p.axis)) byAxis.set(p.axis, []); byAxis.get(p.axis).push(p); }
    out.push('The areas above are measured by this review\'s own passes. The scanners below add ' +
      'their own read. Where a scanner measures the same property as a pass above, its findings ' +
      'land in that same area, recorded separately, because two independent methods agreeing is ' +
      'the strongest signal a review can produce.\n');
    for (const a of orderAxes([...byAxis.keys()])) {
      const arr = byAxis.get(a);
      const open = arr.filter((p) => p.f.polarity === 'gap');
      const held = arr.filter((p) => p.f.polarity === 'strength');
      const sevs = ['Blocker', 'Critical', 'High', 'Medium', 'Low', 'Nit']
        .map((s) => [s, open.filter((p) => p.f.severity === s).length]).filter(([, n]) => n);
      const srcs = [...new Set(arr.map((p) => p.source))].join(', ');
      out.push(`- **${plain(a)}** (${srcs}) — ${open.length} open${sevs.length ? ` (${sevs.map(([s, n]) => `${n} ${s}`).join(', ')})` : ''} · ${held.length} held. Detail with file paths is in the handoff package.`);
    }
  }
  if (notMeasured.length) {
    out.push(`${external.length ? '\n' : ''}Not measured in this review: ${notMeasured.map((a) => `**${plain(a).toLowerCase()}**`).join(', ')}. ` +
      `The scanner${notMeasured.length > 1 ? 's' : ''} that measure${notMeasured.length > 1 ? '' : 's'} ${notMeasured.length > 1 ? 'them' : 'it'} did not run. ` +
      `No findings there means no one looked, not that it is healthy.`);
  }
  return out.join('\n');
}

// ── computed: "What the app can do" (human capability section) ──────────────────
// The effect inventory grouped and rendered for a reader (mechanism from channel_notes).
// The full machine detail (facets + evidence paths) lives in the walk (view-axes.md).
function capabilities() {
  const groups = buildCapabilities(findings, prose.channel_notes || {});
  const c = capabilityCounts(groups);
  const out = [
    `${app} can take ${numWord(c.kinds)} kinds of action, grouped below by how far they reach. ` +
    `**${capFirst(numWord(c.unguarded))} of them** are irreversible or reach outside the company and run unsupervised today ` +
    `(marked ⚑). These are the ones a person should watch. Full detail with file paths is in the handoff package.\n`,
  ];
  for (const grp of groups) {
    const gc = c.byGroup[grp.group] || { kinds: 0, unguarded: 0 };
    const meta = gc.unguarded ? `${gc.kinds} actions, ${gc.unguarded} unsupervised` : `${gc.kinds} actions, all supervised`;
    out.push(`### ${grp.groupLabel} (${meta})\n`);
    for (const ch of grp.channels) {
      const flag = ch.halt ? '⚑ ' : '';
      out.push(`- ${flag}**${cell(ch.label)}.** ${cell(ch.what)} _(${tracePhrase(ch.telemetry)})_`);
    }
    out.push('');
  }
  return out.join('\n');
}

// ── computed: Glossary (core + concepts only for the PDF; full set in handoff) ─
function glossary() {
  return buildGlossary(findings, glossaryDefs, { only: ['core', 'concepts'] });
}

// ── computed: the handoff-package appendix (what's in handoff/ and how to use it) ─
function handoffGuide() {
  return [
    'This report has a companion **handoff package**: the engine\'s `handoff/` folder of',
    'Markdown files meant to be fed to an AI coding session, not read on paper. If you plan to',
    'act on this report with Claude or a similar tool, start there.\n',
    '**`START-HERE.md`** — what the package contains and the order to work through it,',
    'sequenced worst-first.\n',
    '**`REMEDIATION.md`** — every actionable gap with a scanner-supplied fix, grouped by axis',
    'and severity, quoted verbatim, each with a proof step to confirm the fix.\n',
    `**\`plan/\`** — one session prompt per Critical/High item. Paste one into a Claude session`,
    `in the ${app} repo. Each prompt confirms the finding, has you choose how to fix it, then`,
    'implements against the evidence and stops at a verifiable finish.',
  ].join('\n');
}

function colophon() {
  return 'Generated by assay, an evidence-based repository-evaluation engine. A neutral ' +
    'evidence base is compiled into leverage, maturity, and security views. Severity and ' +
    'priority are computed from the evidence, not asserted, and the report issues no ' +
    'deploy/no-deploy verdict — it presents properties and risks and leaves the decision to ' +
    'the owner. The full evaluation artifacts accompany this report.' +
    (CONFIDENTIAL ? ' Confidential.' : '');
}

// ── authored prose ──────────────────────────────────────────────────────────
// exec_summary is a five-part map (scale/strength/watch/maturity/gate); the PDF pairs each
// with a visual, the Markdown just lays them out as paragraphs. Falls back to list/string.
const EXEC_ORDER = ['scale', 'strength', 'watch', 'maturity', 'gate'];
function execSummaryMd() {
  const e = prose.exec_summary;
  if (Array.isArray(e)) return e.map((p) => String(p).trim()).join('\n\n');
  if (e && typeof e === 'object') return EXEC_ORDER.map((k) => e[k]).filter(Boolean).map((p) => String(p).trim()).join('\n\n');
  return String(e || '_[missing exec_summary]_').trim();
}
function proseList(items, render) {
  if (!Array.isArray(items)) return '_[missing prose]_';
  return items.map(render).join('\n\n');
}
const strengths = () => proseList(prose.strengths, (s) => `**${cell(s.title)}.** ${String(s.body).trim()}`);
const roadmap = () => proseList(prose.roadmap, (r, i) => `${i + 1}. **${cell(r.title)}.** ${String(r.body).trim()}`);
function keyQuestions() {
  const authored = Array.isArray(prose.key_questions) ? prose.key_questions.map((q) => `- ${String(q).trim()}`) : [];
  const unknowns = chainUnknowns();
  if (unknowns.length) authored.push('', '**Values the review could not determine (they could hide or change a risk path):**', ...unknowns);
  return authored.length ? authored.join('\n') : '_[missing prose]_';
}

// ── assemble ────────────────────────────────────────────────────────────────
const runId = basename(runDir);
const dateM = runId.match(/(\d{4}-\d{2}-\d{2})/);
const date = (prose.date) || (dateM ? dateM[1] : '');

const repl = {
  '{{TARGET}}': cell(prose.target || runId),
  '{{APP}}': app,
  '{{MAINTAINER}}': cell(prose.maintainer || 'the repository maintainers'),
  '{{DATE}}': date,
  '{{RUN_ID}}': runId,
  '{{PROSE:exec_summary}}': execSummaryMd(),
  '{{PROSE:strengths}}': strengths(),
  '{{PROSE:roadmap_intro}}': String(prose.roadmap_intro || '').trim(),
  '{{PROSE:roadmap}}': roadmap(),
  '{{PROSE:key_questions}}': keyQuestions(),
  '{{COMPILE:concepts}}': conceptsMd,
  '{{COMPILE:glossary}}': glossary(),
  '{{COMPILE:maturity_guide}}': maturityGuideMd,
  '{{COMPILE:method}}': methodMd,
  '{{COMPILE:colophon}}': colophon(),
  '{{COMPILE:snapshot_stats}}': snapshotStats(),
  '{{COMPILE:chains}}': chains(),
  '{{COMPILE:maturity}}': maturity(),
  '{{COMPILE:scanner_axes}}': scannerAxes(),
  '{{COMPILE:security_risks}}': securityRisks(),
  '{{COMPILE:capabilities}}': capabilities(),
  '{{COMPILE:handoff_guide}}': handoffGuide(),
};

// strip the leading template HTML comment (the how-to block), keep section comments out of output
let body = template.replace(/^<!--[\s\S]*?-->\n/, '');
body = body.replace(/<!--[\s\S]*?-->\n/g, ''); // drop the per-section SOURCE comments from the shipped report
for (const [k, v] of Object.entries(repl)) body = body.split(k).join(v);

const unfilled = body.match(/\{\{[^}]+\}\}/g);
if (unfilled) { console.error(`unfilled markers remain: ${[...new Set(unfilled)].join(', ')}`); process.exit(1); }

// Frontmatter for deployments whose tree-checkers read it. `confidential: true`
// is RUN-LEVEL, never an engine default: set `confidential: true` in
// report-prose.yaml or pass --confidential (a deployment holding client runs —
// e.g. an instances/ tree with a confidentiality floor — turns it on; a public
// or self-eval run stays unmarked). render-pdf.mjs renders from the first `## `
// heading, so this never reaches the PDF.
const fmTitle = String(prose.target || app).replace(/"/g, "'");
const frontmatter = `---\ntype: doc\n${CONFIDENTIAL ? 'confidential: true\n' : ''}title: "AI-Native Readiness Report — ${fmTitle}"\n---\n\n`;
const outPath = join(runDir, 'MAINTAINER-REPORT.md');
writeFileSync(outPath, frontmatter + body);
console.log(`✓ compiled ${outPath} (${findings.length} findings, gate=${gate.gate})`);
