#!/usr/bin/env node
// repo-eval maintainer report → professional PDF.
// Usage: node tools/render-pdf.mjs <run-dir> [--png] [--html]
// Pipeline: MAINTAINER-REPORT.md → markdown-it (HTML) + templates/report.css,
//   with the exec dashboard (masthead, defined-stat strip, maturity coverage bars, the
//   supervision bar), the narrative, the full maturity ladder, the capability status-rail,
//   and the coverage-gap cards built from the structured inputs → headless Chromium page.pdf().
//   An optional plain title-page cover (cover: true) carries only the title + meta.
// The Markdown stays the content source of truth; this is pure presentation.
// Framework-side finishing step: needs markdown-it + Playwright's Chromium (both resolve
// from the global node install if not local). Typography ships with the template
// (templates/fonts/, Source Serif 4 + Source Sans 3, OFL). The cover carries no running
// header/footer: it is printed on its own (page 1) and joined to the numbered body
// (pages 2+) by poppler's pdfunite; without pdfunite the whole doc prints in one pass.
// --png = verification screenshot; --html = dump the intermediate HTML.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseYaml } from './yaml-min.mjs';
import { WHO_LABEL, DIM_LABEL, GROUP_LABEL, CHANNEL_LABEL, humanizeToken } from './display.mjs';
import { buildCapabilities, capabilityCounts, tracePhrase, numWord } from './capabilities.mjs';
import { buildChains } from './chains.mjs';
import { buildSupervision } from './supervision.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, '..', 'templates', 'report.css');
const FONTS = join(HERE, '..', 'templates', 'fonts');
const HOWTO = join(HERE, '..', 'templates', 'howto.md');
function loadDep(name) {
  try { return createRequire(import.meta.url)(name); } catch {}
  for (const base of ['/opt/node22/lib/node_modules/', '/usr/lib/node_modules/', '/usr/local/lib/node_modules/'])
    try { return createRequire(base)(name); } catch {}
  throw new Error(`cannot resolve "${name}" — install it (npm i -g ${name}) to render the PDF`);
}

const arg = process.argv[2];
if (!arg) { console.error('usage: node render-pdf.mjs <run-dir> [--png] [--html]'); process.exit(2); }
const runDir = arg.replace(/\/eval\/?$/, '');
const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
const need = (p) => { if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(2); } return p; };
const read = (p) => readFileSync(p, 'utf8');

const md = read(need(join(runDir, 'MAINTAINER-REPORT.md')));
const baseCss = read(need(CSS));
const prose = parseYaml(read(need(join(evalDir, 'report-prose.yaml'))));
const gate = parseYaml(read(need(join(evalDir, 'view-security-gate.yaml'))));
// findings source of truth: per-pass files if present (what validate reads), else merged.
const passFiles = readdirSync(evalDir).filter((f) => /^findings-\d\d-.*\.yaml$/.test(f)).sort();
const findings = passFiles.length ? passFiles.flatMap((f) => parseYaml(read(join(evalDir, f)))) : parseYaml(read(need(join(evalDir, 'findings.yaml'))));
const gradesPath = join(evalDir, 'view-maturity-grades.yaml');
const grades = existsSync(gradesPath) ? parseYaml(read(gradesPath)) : null;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '').trim();
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const short = prose.target_short || String(prose.target || basename(runDir)).split(',')[0];
const coverEnabled = prose.cover === true;   // default: no cover, ES is page 1 (share-friendly)
const runDate = prose.date || (basename(runDir).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

// compact masthead for the dashboard-first page 1: the APP NAME is the big line, with
// "AI-Native Readiness Report" as the subheading and the app's own descriptor below it.
function mastheadHtml() {
  const desc = String(prose.target || '').replace(new RegExp('^' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,\\s]*', 'i'), '').trim();
  const descLine = desc ? `<div class="mh-desc">${esc(desc.charAt(0).toUpperCase() + desc.slice(1))}</div>` : '';
  return `<div class="masthead">
    <div class="mh-id"><div class="mh-kicker">AI-Native Framework · repo-eval</div>` +
    `<div class="mh-title">${esc(short)}</div>` +
    `<div class="mh-sub">AI-Native Readiness Report</div>${descLine}</div>` +
    `<div class="mh-meta">${esc(runDate)}</div></div>`;
}

// ── fonts (vendored, OFL) — absolute file:// URLs so they resolve from a temp page ──
const FONT_FILES = [
  ['Source Serif 4', 'SourceSerif4.ttf', 'normal'],
  ['Source Serif 4', 'SourceSerif4-Italic.ttf', 'italic'],
  ['Source Sans 3', 'SourceSans3.ttf', 'normal'],
  ['Source Sans 3', 'SourceSans3-Italic.ttf', 'italic'],
];
const fontCss = FONT_FILES.filter(([, f]) => existsSync(join(FONTS, f)))
  .map(([fam, f, style]) => `@font-face { font-family: "${fam}"; src: url("${pathToFileURL(join(FONTS, f))}") format("truetype"); font-weight: 100 900; font-style: ${style}; }`)
  .join('\n');
// The base CSS zeroes the first page's @page margin for a full-bleed COVER. When there is
// no cover (default), page 1 is the ES and must carry the same margins as every other page,
// so restore them for :first. (With a cover, the full-bleed :first rule stands.)
// ES one-page invariant, enforced (not hand-tuned): a hard max-height on the exec page
// (content box = 11in − 2×0.7in margins ≈ 9.6in; cap at 9.5in with overflow hidden so it
// can physically never spill to page 2), a fit wrapper the render pass zoom-scales, and a
// "+N more" note style for the backstop truncation. The fit pass (page.evaluate below)
// shrinks before it truncates, and truncates only the enumerable list (the coverage areas), noting the dropped count.
const EXEC_MAXH = process.env.EXEC_MAXH || '9.5in';   // override only for testing the fit/truncation path
const execFitCss = `\nsection.exec { max-height: ${EXEC_MAXH}; overflow: hidden; }\n.exec-fit { transform-origin: top left; }\n.es-more { font-size: 7pt; color: #8a969c; font-style: italic; margin-top: 3px; }\n`;
const css = fontCss + '\n' + baseCss + execFitCss + (coverEnabled ? '' : '\n@page :first { margin: 0.7in 0.8in; }');

// ── markdown → html (body only; title + meta line go to the cover) ───────────
const MarkdownIt = loadDep('markdown-it');
const mdit = new MarkdownIt({ html: false, linkify: false, typographer: true });
const lines = md.split('\n');
let start = 0;
for (let i = 0; i < lines.length; i++) if (/^## /.test(lines[i])) { start = i; break; }
let bodyHtml = mdit.render(lines.slice(start).join('\n'));
bodyHtml = bodyHtml
  .replace(/⚑/g, '<span class="flag">▲</span>')
  .replace(/[✅✓]/g, '<span style="color:#2f7d5a;font-weight:700">✓</span>')
  .replace(/F-(\d{3})/g, '<span class="fid">F-$1</span>')        // finding ids never line-break
  .replace(/<p>By dimension:/g, '<p class="table-note">By dimension:');

// ── security risks (illuminated; no go/no-go) ─────────────────────────────────
// The security exposures as decisions, not a deployment verdict — most likely first.
// No levels-of-use, no "safe to run at X": the report issues no go/no-go
//; this is repo-eval's native risk read.
function securityRiskCards() {
  const out = [];
  const ex = gate.exposures || [];
  const lrank = { high: 0, moderate: 1, low: 2 };
  const active = ex.filter((e) => e.blocks_stage !== 'none' && e.blocks_stage !== 'clear')
    .sort((a, b) => (lrank[a.likelihood] ?? 3) - (lrank[b.likelihood] ?? 3));
  if (active.length) {
    out.push('<p>The security review\'s exposures, most likely first. Each is a decision, not a verdict — fix it, accept the risk, or investigate.</p>');
    for (const e of active) {
      const lk = (e.likelihood || 'moderate');
      out.push(`<div class="blocker">
        <div class="blocker-head"><span class="blocker-name">${esc(e.title || e.name)}</span>
          <span><span class="blocker-ids">${esc((e.findings || []).join(', '))}</span> &nbsp;<span class="chip ${lk}">${lk} likelihood</span></span></div>
        <div class="what">${esc(cap(e.what))}.</div>
        ${e.who ? `<div class="field"><span class="label">Who</span>${esc(WHO_LABEL[e.who] || e.who)}</div>` : ''}
        <div class="field"><span class="label">Fix</span>${esc(e.fix)}</div>
      </div>`);
    }
  }
  const watch = (gate.exposures || []).filter((e) => e.blocks_stage === 'none' || e.blocks_stage === 'clear');
  if (watch.length) {
    out.push('<div class="stage-group"><div class="stage-group-head">Standing watch<span class="st-def">: lower priority</span></div>');
    for (const e of watch) out.push(`<div class="blocker" style="border-left-color:var(--pending)">
      <div class="blocker-head"><span class="blocker-name">${esc(e.title || e.name)}</span><span class="blocker-ids">${esc((e.findings || []).join(', '))}</span></div>
      <div class="what">${esc(cap(e.what))}</div><div class="field"><span class="label">Watch</span>${esc(e.fix)}</div></div>`);
    out.push('</div>');
  }
  // dispositions (§6c): unsupervised kinds deliberately not gated, with the reason — so the
  // report accounts for every gap the supervision bar counts, not just the curated blockers.
  const dispo = Array.isArray(prose.dispositions) ? prose.dispositions : [];
  if (dispo.length) {
    out.push('<div class="stage-group"><div class="stage-group-head">Accepted or deferred<span class="st-def">: unsupervised on purpose, with the reason</span></div>');
    out.push('<p class="what">These actions can act without a stop and are left that way on purpose. Each has a recorded reason, so no gap is dropped silently.</p>');
    for (const d of dispo) out.push(`<div class="blocker" style="border-left-color:var(--pending)">
      <div class="blocker-head"><span class="blocker-name">${esc(CHANNEL_LABEL[d.channel] || humanizeToken(d.channel))}</span><span class="blocker-ids">${esc(d.reason)}</span></div>
      <div class="what">${esc(d.note)}</div></div>`);
    out.push('</div>');
  }
  return out.join('\n');
}

// ── shared dot glyph ─────────────────────────────────────────────────────────
// Every data dot is one inline-SVG circle from this helper, so all dots are
// geometrically identical (CSS border-radius boxes at fractional pt sizes render
// unevenly in Chromium's print path, and a straddle border grew the box). The
// straddle ring's outer edge (r 4.3 + half the 1.4 stroke) matches the filled
// r=5 exactly. Colors mirror report.css :root.
const DOT_FILL = { on: '#235863', off: '#dde3e2', cleared: '#2f7d5a', gated: '#b26a12', pending: '#dde3e2' };
function dot(kind) {
  if (kind === 'straddle')
    return '<svg class="dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.3" fill="#eef4f4" stroke="#2f7480" stroke-width="1.4"/></svg>';
  return `<svg class="dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${DOT_FILL[kind] || DOT_FILL.off}"/></svg>`;
}

// ── maturity coverage (measured; replaces the old rung ladder) ───────────────
// covBar: a crisp inline-SVG coverage bar (rects print evenly where CSS boxes
// at fractional pt did not — same lesson as dot()).
function covBar(pctVal, wide = false) {
  const w = wide ? 92 : 64, h = 5.5;
  if (pctVal === null || pctVal === undefined)
    return `<svg class="cov" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="2.5" fill="none" stroke="#c9c4ba" stroke-width="0.7" stroke-dasharray="2.2 2"/></svg>`;
  const fill = Math.max(0, Math.min(100, pctVal)) / 100 * w;
  return `<svg class="cov" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="2.5" fill="#eceae4"/>` +
    (fill > 0 ? `<rect x="0" y="0" width="${fill.toFixed(1)}" height="${h}" rx="2.5" fill="#3d6b52"/>` : '') +
    `</svg>`;
}
const covPct = (d) => (d.coverage ? `${d.coverage.pct}%` : '—');

// compact preview for the exec summary: name · bar · percent (denominators and
// depth live in the maturity section)
function miniLadder() {
  if (!grades || !Array.isArray(grades.dimensions)) return '';
  const out = ['<div class="panel-box keep"><div class="panel-label">Measured coverage by area</div><div class="mini-ladder" data-cap="areas" data-more="the Maturity section">'];
  for (const d of grades.dimensions)
    out.push(`<div class="mini-row"><div class="mini-name">${esc(DIM_LABEL[d.dimension] || d.dimension)}</div>` +
      `${covBar(d.coverage ? d.coverage.pct : null)}<div class="mini-pct">${covPct(d)}</div></div>`);
  const a = grades.aggregate;
  out.push(`</div><div class="mini-foot">Share of each area meeting its measured bar${a && a.of ? ` (pooled: ${a.pct}%)` : ''}. — means not yet measured. Detail in the maturity section.</div></div>`);
  return out.join('\n');
}

// the full coverage table with depth sentences (the maturity section of the body)
function maturityLadder() {
  if (!grades || !Array.isArray(grades.dimensions)) return '<p class="what">Maturity coverage not available.</p>';
  const out = ['<div class="keep"><p>Each area is measured as coverage: of the things the review enumerated, how many meet that area’s bar. The percentage is the finding, and the count next to it says exactly what was measured. The sentence alongside is depth: how good the best instance is. Depth can be high while coverage is low; that reads as “the team knows how, and the work is doing it everywhere.”</p>', '<div class="maturity">'];
  for (const d of grades.dimensions) {
    const c = d.coverage;
    const track = c
      ? `${covBar(c.pct, true)}<div class="mat-grade">${c.pct}% · ${c.met} of ${c.of}</div><div class="mat-what">${esc(c.what)}${c.kind === 'sampled' ? ` (sampled — ${esc(c.method || '')})` : ''}</div>`
      : `${covBar(null, true)}<div class="mat-grade mat-nm">not yet measured</div><div class="mat-what">${esc(d.not_measured || '')}</div>`;
    out.push(`<div class="mat-row"><div class="mat-name">${esc(DIM_LABEL[d.dimension] || d.dimension)}</div>` +
      `<div class="mat-track">${track}</div>` +
      `<div class="mat-note">${esc(d.depth || '')}</div></div>`);
  }
  out.push('</div>');
  const a = grades.aggregate;
  const earned = grades.dimensions.filter((d) => (d.enforced && d.enforced.claim) || (d.generative && d.generative.claim));
  const earnedLine = earned.length
    ? earned.map((d) => `<b>${esc(DIM_LABEL[d.dimension] || d.dimension)}</b> has earned ${['enforced', 'generative'].filter((k) => d[k] && d[k].claim).join(' and ')} (${esc([d.enforced, d.generative].filter((f) => f && f.claim).map((f) => f.why).join('; '))})`).join('. ') + '.'
    : 'Neither is earned anywhere yet; these are the frontier.';
  if (a && a.of) out.push(`<p class="mat-agg">Across the ${esc(String(a.over))} measured areas together: <b>${a.pct}%</b> (${a.met} of ${a.of}). Two further properties can be earned per area, with evidence: <b>enforced</b> (the coverage is itself machine-checked, so a regression is caught automatically) and <b>generative</b> (the system extends its own coverage by default). ${earnedLine}</p>`);
  out.push('</div>');
  return out.join('\n');
}

// ── attack chains (computed lead): entry → sink flow, ranked by the graph ─────
// One row per chain: a plain flow (who is steered → what they reach), a reach badge and
// a difficulty badge, and the computed cut. Worst chain sorts first, deterministically.
const EFFORT = { 0: ['trivial to trigger', 'e-easy'], 1: ['easy to trigger', 'e-easy'], 2: ['moderate effort', 'e-mod'], 3: ['hard to trigger', 'e-hard'] };
function chainSection() {
  const { live, held, contained, unresolved } = buildChains(findings);
  const out = [];
  if (live.length) {
    out.push(`<p>Each row is a path an attacker could ride, from where they get in to what they reach. The order is computed from the evidence: widest reach first, then easiest to pull off. A path is listed here only if it reaches an action with no working stop.</p>`);
    for (const c of live) {
      const sev = c.blast === 'fleet' || c.blast === 'cross-tenant' ? 'sev-high' : 'sev-mid';
      const [effortWord, effortCls] = EFFORT[c.difficultyRank] || EFFORT[1];
      const verb = c.tentative ? 'could reach' : 'can reach';
      const poss = c.tentative ? `<span class="chain-badge poss">possible</span>` : '';
      const also = c.sinks.slice(1);
      const alsoHtml = also.length ? `<div class="chain-also">Also reaches: ${also.map((s) => esc(s.label) + (s.confWord ? ` <span class="chain-hedge">(${esc(s.confWord)})</span>` : '')).join(' · ')}</div>` : '';
      const cutText = c.cuts.length ? c.cuts.map((x) => esc(x.label)).join('; ') : 'add a stop before the action';
      const tentLine = c.tentative && c.weak ? `<div class="chain-line"><span class="chain-k">Not certain</span> this path rests on ${esc(c.weak)}, which is ${esc(c.confWord)}.</div>` : '';
      out.push(`<div class="chain ${sev}">
        <div class="chain-flow">
          <span class="chain-node entry">${esc(c.entry.label)}</span>
          <span class="chain-arrow">→</span>
          <span class="chain-node sink">${esc(c.headline.label)}</span>
          <span class="chain-badges">${poss}<span class="chain-badge reach">${esc(c.blastWord)}</span><span class="chain-badge diff ${effortCls}">${esc(effortWord)}</span></span>
        </div>
        ${alsoHtml}
        <div class="chain-line"><span class="chain-k">Starts with</span> ${esc(c.difficultyWhy)}.</div>
        <div class="chain-line"><span class="chain-k">Cut it by</span> fixing ${cutText}.</div>
        ${tentLine}
      </div>`);
    }
  } else {
    out.push(`<p><b>The report did not identify a live attack chain</b> — a path from outside input to an action with no working stop. The paths below were reached, and the review found something limiting each one.</p>`);
  }
  if (held.length) {
    out.push(`<div class="panel-label" style="margin-top:var(--s3)">Paths the review reached but did not find open</div>`);
    for (const h of held) {
      const holds = h.holds.map((x) => `${esc(x.label)} <span class="chain-hedge">(the review found ${esc(x.by)}${x.confWord ? `; ${esc(x.confWord)}` : ''})</span>`).join(' · ');
      out.push(`<div class="chain held"><div class="chain-flow"><span class="chain-node entry">${esc(h.entry.label)}</span><span class="chain-arrow">→</span><span class="chain-held-what">${holds}</span></div></div>`);
    }
  }
  if (contained.length) {
    const cPl = contained.length > 1;
    out.push(`<div class="chain-note"><b>No action found:</b> ${contained.map((c) => esc(c.label)).join(', ')} — ${cPl ? 'each takes in outside text; the review found no action either can take' : 'takes in outside text; the review found no action it can take'}.</div>`);
  }
  if (unresolved.length) {
    out.push(`<div class="chain-unknown">▲ ${unresolved.length} value${unresolved.length > 1 ? 's' : ''} the review could not determine — listed with the questions below.</div>`);
  }
  return out.join('\n');
}

// ── capability status-rail list: the "What it can do" list, made the visual ──
// One row per kind of action, grouped by reach. A red rail + ▲ marks a kind with an
// unguarded halt; a quiet rail marks a guarded one. Per-group counts head each band.
// Replaces the abstract square guard-map: labeled, scannable, no duplication.
function capabilityList() {
  const groups = buildCapabilities(findings, prose.channel_notes || {});
  const c = capabilityCounts(groups);
  const out = [`<p>${esc(short)} can take ${numWord(c.kinds)} kinds of action, grouped below by how far they reach. ` +
    `<b>${cap(numWord(c.unguarded))}</b> of them are irreversible or reach outside the company and run unsupervised today (marked <span class="flag">▲</span>). ` +
    `Full detail with file paths is in the handoff package.</p>`];
  for (const grp of groups) {
    const gc = c.byGroup[grp.group] || { kinds: 0, unguarded: 0 };
    const tag = gc.unguarded ? `<span class="cap-gcount warn">${gc.unguarded} unsupervised</span>` : '<span class="cap-gcount">all supervised</span>';
    out.push(`<div class="cap-group"><div class="cap-ghead">${esc(grp.groupLabel)}<span class="cap-gmeta"> · ${gc.kinds} action${gc.kinds > 1 ? 's' : ''} · </span>${tag}</div>`);
    for (const ch of grp.channels) {
      out.push(`<div class="cap-row ${ch.halt ? 'halt' : 'ok'}">` +
        `<div class="cap-name">${ch.halt ? '<span class="flag">▲</span> ' : ''}${esc(ch.label)}</div>` +
        `<div class="cap-what">${esc(ch.what)} <span class="cap-trace">${esc(tracePhrase(ch.telemetry))}</span></div>` +
        `</div>`);
    }
    out.push('</div>');
  }
  return out.join('\n');
}

// ── executive dashboard: each ES paragraph paired with its instant-read visual ─
// Denominator strip: the shape of what the review examined, not how much reviewing it did.
// Every number is a denominator the reader meets again elsewhere (the halts in the
// supervision bar, secrets in delegation, modules in context, incidents in improvement).
// Built from the grades populations + any census denominators; degrades to the base
// numbers when a run has no censuses. Falls back to the old review strip without grades.
function statStripHtml() {
  if (!grades || !grades.populations) {
    const pol = { strength: 0, gap: 0, fact: 0 };
    let effects = 0;
    for (const f of findings) { pol[f.polarity] = (pol[f.polarity] || 0) + 1; if (f.subject_type === 'effect') effects++; }
    const cells = [['Findings', findings.length], ['Strengths', pol.strength], ['Gaps', pol.gap], ['Facts', pol.fact], ['Things it can do', effects]];
    return '<table class="stat-strip"><thead><tr>' + cells.map(([k]) => `<th>${k}</th>`).join('') +
      '</tr></thead><tbody><tr>' + cells.map(([, v]) => `<td>${v}</td>`).join('') + '</tr></tbody></table>';
  }
  // Three defined stats — the funnel the supervision bar below sits on. Each carries a
  // one-line meaning, so a number is never a bare label. Fewer, but each says what it is.
  const p = grades.populations;
  const defs = [
    [p.effects, 'Actions', 'things it can do that change something outside itself'],
    [p.halts, 'Need oversight', 'of those, the ones that can’t be undone or reach outside the company'],
    [p.ai_surfaces, 'AI surfaces', 'places outside text can steer the AI'],
  ];
  return '<div class="stat-defs">' + defs.map(([v, k, d]) =>
    `<div class="statd"><div class="statd-num">${v}</div><div class="statd-lab">${k}</div>` +
    `<div class="statd-def">${d}</div></div>`).join('') + '</div>';
}
// The supervision instrument: of the actions that can't be undone or reach outside
// (the halts), how many have something overseeing them before they fire. Two states,
// no tiers; the unsupervised set resolves into kinds + the queued fix for each.
function supervisionBar() {
  // The ES shows the STATE (how many halts have oversight), not the worklist. The per-kind
  // gap→fix detail lives in §5 "Security risks", where there is room for context — the ES
  // only points there. It makes no completeness claim: §5 is prioritized (top risks), not
  // one row per kind, so the pointer must not imply every kind is individually addressed.
  const s = buildSupervision(findings, prose.roadmap || []);
  const bar = `<div class="supbar">` +
    (s.supervised ? `<div class="sup-seg sup-ok" style="flex:${s.supervised}"></div>` : '') +
    (s.unsupervised ? `<div class="sup-seg sup-open" style="flex:${s.unsupervised}"></div>` : '') + `</div>`;
  const legend = `<div class="sup-legend"><span class="ok">${s.supervised} supervised</span>` +
    `<span class="open">${s.unsupervised} unsupervised${s.unsupervised ? ' <span class="flag">▲</span>' : ''}</span></div>`;
  const note = s.unsupervised
    ? `<div class="sup-lead"><em>Security risks</em> sets out what to address first.</div>`
    : '<div class="sup-lead">Every one has oversight.</div>';
  return `<div class="panel-box keep"><div class="panel-label">Actions that need oversight · ${s.total}</div>` +
    `${bar}${legend}${note}${postureRows()}</div>`;
}
// Posture at a glance: aggregate verdicts that appear nowhere else on the ES page.
// Fills the right panel (height-matched to the mini-ladder) with genuine aggregates,
// none duplicating the coverage panel or the supervision bar. All computed.
function postureRows() {
  const rows = [];
  // (No "safe to run" row — the report issues no go/no-go verdict.)
  // live attack chains — computed; none-with-contained is the honest positive.
  const ch = buildChains(findings);
  const contained = (ch.contained || []).length;
  rows.push(['Live attack chains', ch.live && ch.live.length
    ? `${ch.live.length} live` : `none${contained ? ` (${contained} contained)` : ''}`]);
  // 3) secrets below the AI boundary — from the credential census (grades secondary).
  const delg = grades && grades.dimensions && grades.dimensions.find((d) => d.dimension === 'delegation');
  const cred = delg && (delg.secondary || []).find((m) => /credential/.test(m.name || ''));
  if (cred && typeof cred.met === 'number') rows.push(['Secrets below the AI line', `${cred.met} of ${cred.of}`]);
  // 4) actions leaving a durable record — structured/audited telemetry over all effects.
  const effects = findings.filter((f) => f.subject_type === 'effect' && f.effect);
  const durable = effects.filter((e) => e.effect.telemetry === 'structured-event' || e.effect.telemetry === 'audited').length;
  if (effects.length) rows.push(['Leaves a durable record', `${durable} of ${effects.length}`]);
  if (!rows.length) return '';
  const body = rows.map(([k, v]) => `<div class="posture-row"><span class="posture-k">${esc(k)}</span><span class="posture-v">${esc(v)}</span></div>`).join('');
  return `<div class="posture"><div class="panel-sublabel">Posture at a glance</div>${body}</div>`;
}
// Dashboard-first: a one-line verdict, then the instrument panel (the visuals a shared-PDF
// thumbnail leads with), then the narrative below. The whole ES is always one page — reduce
// the .exec font before letting it spill. Instruments-then-narrative reads as two clean
// blocks (not the alternating layout we rejected).
function execDashboard() {
  const e = prose.exec_summary || {};
  const inl = (t) => mdit.renderInline(String(t == null ? '' : t).trim());
  const p = (t) => t ? `<p>${inl(t)}</p>` : '';
  const chip = (cls, ic, label, t) => t ? `<div class="es-tile ${cls}"><div class="es-ic">${ic}</div>` +
    `<div class="es-body"><span class="chip-label">${label}</span> ${inl(t)}</div></div>` : '';
  // The panel (computed visuals) is the first critical content — no editorialized verdict
  // line leads the report; the authored narrative sits below the numbers.
  const panel = [
    '<div class="es-panel">',
    statStripHtml(),
    `<div class="es-duo">${miniLadder()}${supervisionBar()}</div>`,
    `<div class="es-chips">${chip('good', '✓', 'Best trait.', e.strength)}${chip('watch', '▲', 'The watch.', e.watch)}</div>`,
    '</div>',
  ].join('\n');
  if (typeof e !== 'object' || Array.isArray(e)) {           // fallback: flat list / string
    const paras = (Array.isArray(e) ? e : [e]).map(p).join('');
    return panel + paras;
  }
  const narrative = `<div class="es-narr">${[p(e.scale), p(e.maturity), p(e.gate)].join('\n')}</div>`;
  return panel + narrative;
}

// ── sectionize on <h2>; classify + replace / augment bodies ──────────────────
// "How to read this report" is orientation, not hook — it lives in Appendix A (not on the
// cover), so page 1 can lead with the dashboard.
// howto.md carries OKF frontmatter (bundle-check conformance); strip it before rendering.
const stripFm = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, '');
const howtoHtml = `<div class="howto-appendix"><h3>How to read this report</h3>${mdit.render(stripFm(read(need(HOWTO))))}</div>`;
const chunks = bodyHtml.split(/(?=<h2)/).filter((c) => c.trim());
const rebuilt = chunks.map((chunk) => {
  const hm = chunk.match(/^(<h2[^>]*>([\s\S]*?)<\/h2>)/);
  const head = hm ? hm[1] : '';
  const title = hm ? stripTags(hm[2]) : '';
  let cls = 'sec', inner = chunk;
  if (/^Appendix/i.test(title)) cls += ' appendix';
  if (/In plain terms/i.test(title)) { cls += ' plainterms'; inner = head + howtoHtml + chunk.replace(head, ''); }
  if (/Executive summary/i.test(title)) { cls += ' exec'; inner = `<div class="exec-fit">${(coverEnabled ? '' : mastheadHtml()) + execDashboard()}</div>`; }  // no heading: the masthead is the title; wrapped so the fit pass can scale it to one page
  else if (/main risks|attack could|start to finish/i.test(title)) {
    // computed chains replace the plain-markdown chains, but keep the Questions subsection
    // (folded into this section) so the risks and the open questions open together
    const qh = chunk.search(/<h3[^>]*>\s*Questions/i);
    inner = head + chainSection() + (qh >= 0 ? chunk.slice(qh) : '');
  }
  else if (/Maturity, area by area/i.test(title)) inner = head + maturityLadder();
  else if (/What .+ can do/i.test(title)) { cls += ' capabilities'; inner = head + capabilityList(); }
  else if (/Security risks/i.test(title)) inner = head + securityRiskCards();
  return `<section class="${cls}">${inner}</section>`;
}).join('\n');

// colophon: pull the trailing "Generated by …" paragraph onto a deliberate closing
// plate (its own page, centered) so it can never dangle under a variable-length appendix
const withColophon = rebuilt.replace(/<p>(Generated by the AI-Native Framework[\s\S]*?)<\/p>\s*(<\/section>)?\s*$/,
  '$2<section class="endplate"><div class="end-kicker">AI-Native Framework · repo-eval</div><p class="colophon">$1</p></section>');

// ── cover (optional; OFF by default). When on, it is a plain title page — title + meta
// only, no content — for a formal leave-behind. The ES carries every verdict and visual,
// so by default there is no cover and the dashboard is page 1 (share-friendly). ─────────
const cover = coverEnabled ? `<section class="cover">
  <div class="cover-kicker">AI-Native Framework · repo-eval</div>
  <div class="cover-title">AI-Native Readiness Report</div>
  <div class="cover-sub">${esc(prose.target || basename(runDir))}</div>
  <div class="cover-meta">
    <span><b>Prepared for</b><br>${esc(prose.maintainer || 'the repository maintainers')}</span>
    <span><b>Date</b><br>${esc(runDate)}</span>
    <span><b>Run</b><br>${esc(basename(runDir))}</span>
    <span><b>Method</b><br>${findings.length} findings · three lenses · computed gate</span>
  </div></section>` : '';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>${cover}${withColophon}</body></html>`;

if (process.argv.includes('--html')) writeFileSync(join(runDir, 'MAINTAINER-REPORT.debug.html'), html);

// ── render (cover printed headerless, joined to the numbered body) ───────────
const { chromium } = loadDep('playwright');
const foot = `<div style="font-family:'Liberation Sans',sans-serif;font-size:7pt;color:#8a969c;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
  <span>AI-Native Readiness Report · ${esc(short)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
const head = `<div style="font-family:'Liberation Sans',sans-serif;font-size:7pt;color:#b7c0c4;width:100%;padding:0 0.7in;text-align:right;">Confidential</div>`;
const pdfOpts = (path, extra = {}) => ({
  path, format: 'Letter', printBackground: true,
  displayHeaderFooter: true, headerTemplate: head, footerTemplate: foot,
  margin: { top: '0.7in', bottom: '0.7in', left: '0.8in', right: '0.8in' },
  ...extra,
});

const tmp = mkdtempSync(join(tmpdir(), 'repo-eval-pdf-'));
const browser = await chromium.launch();
const page = await browser.newPage();
const htmlPath = join(tmp, 'report.html');
writeFileSync(htmlPath, html);
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });

// ── ES one-page fit: shrink before truncating, and note the count of anything dropped ──
// The section has a hard max-height cap (CSS above) + overflow:hidden, so it cannot spill
// to page 2. This pass first zoom-scales the exec-fit wrapper down to a readable floor; if
// that is not enough, it hides trailing rows of the enumerable list (the coverage areas) and appends a "+N more (see …)" note so the count is never silently lost.
const fit = await page.evaluate(() => {
  const exec = document.querySelector('section.exec');
  const inner = exec && exec.querySelector('.exec-fit');
  if (!exec || !inner) return { ok: true };
  const over = () => exec.scrollHeight > exec.clientHeight + 1;
  let zoom = 1;
  inner.style.zoom = '1';
  while (over() && zoom > 0.85) { zoom = Math.round((zoom - 0.02) * 100) / 100; inner.style.zoom = String(zoom); }
  const truncated = [];
  if (over()) {
    for (const list of inner.querySelectorAll('[data-cap]')) {
      const noun = list.getAttribute('data-cap');
      const where = list.getAttribute('data-more') || '';
      const rows = [...list.children].filter((c) => !c.classList.contains('es-more'));
      let dropped = 0;
      while (over() && (rows.length - dropped) > 2) { rows[rows.length - 1 - dropped].style.display = 'none'; dropped++; }
      if (dropped) {
        const note = document.createElement('div');
        note.className = 'es-more';
        note.textContent = `+${dropped} more ${noun}${where ? ` (see ${where})` : ''}`;
        list.appendChild(note);
        truncated.push({ noun, dropped });
      }
      if (!over()) break;
    }
  }
  return { ok: !over(), zoom, truncated };
});
if (fit && fit.zoom && fit.zoom < 1) console.error(`  ES fit: scaled to ${Math.round(fit.zoom * 100)}% to hold one page`);
if (fit && fit.truncated && fit.truncated.length) console.error('  ES fit: truncated ' + fit.truncated.map((t) => `${t.dropped} ${t.noun}`).join(', ') + ' (noted as "+N more")');
if (fit && !fit.ok) console.error('  ⚠ ES still overflows at the fit floor — review the exec_summary content');

// No cover (default): one print, running header/footer on every page including the ES.
// With a cover: two prints of the same document — page 1 (the cover) without header/footer,
// pages 2+ with — joined by poppler's pdfunite. Numbering stays truthful either way.
const outPath = join(runDir, 'MAINTAINER-REPORT.pdf');
if (!coverEnabled) {
  await page.pdf(pdfOpts(outPath));
} else {
  const coverPdf = join(tmp, 'cover.pdf');
  const bodyPdf = join(tmp, 'body.pdf');
  await page.pdf(pdfOpts(coverPdf, { pageRanges: '1', displayHeaderFooter: false }));
  await page.pdf(pdfOpts(bodyPdf, { pageRanges: '2-' }));
  const unite = spawnSync('pdfunite', [coverPdf, bodyPdf, outPath]);
  if (unite.status !== 0 || unite.error) { console.error('  (pdfunite not found — cover carries the running header/footer)'); await page.pdf(pdfOpts(outPath)); }
}
if (process.argv.includes('--png')) { await page.setViewportSize({ width: 900, height: 1200 }); await page.screenshot({ path: join(runDir, 'MAINTAINER-REPORT.preview.png'), fullPage: true }); }
await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log(`✓ rendered ${outPath}`);
