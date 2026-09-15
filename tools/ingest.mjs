#!/usr/bin/env node
// ingest.mjs — the INSTRUMENT intake: converts a deterministic tool's native
// output into port rows (integration/scanner-contract.md, instrument role).
//
// An instrument is a mechanical enumerator/verifier (a secrets scanner, a repo
// hygiene checker). It never contributes an axis; its rows feed existing ones.
// Two rules make the intake trustworthy (fail loud, never empty):
//
//   1. FAIL LOUD, NEVER EMPTY. The converter requires the tool's own exit code
//      and halts on anything outside the tool's documented success set — a tool
//      that crashed must never read as "0 findings". Malformed or truncated
//      input halts. A verified-clean run (success exit, empty report) writes an
//      explicit zero-findings file recording that the instrument ran.
//   2. NEVER COPY A SECRET. The gitleaks profile builds observations from rule
//      id + location only; the matched secret value is never written anywhere.
//
// Evidence: file:line where the tool reports one; a repo-level claim (most
// Scorecard checks) cites the archived raw report (run-relative `eval/raw/…`),
// which `validate.mjs --target` knows to skip (instrument evidence lives in the
// run, not the target).
//
// A PEER SCANNER with a machine report also comes in here: deep-code-review 1.72+
// writes findings-YYYY-MM-DD.yaml (block YAML: review / ground_truth / coverage /
// findings). It has no exit code — its fail-loud property is COMPLETENESS: the
// coverage map must carry a row for every domain the adapter's coverage_domains
// lists, every gap row a fix, every non-scanned row a note; anything less halts.
// The coverage rows are archived as eval/coverage-<scanner>.yaml so the renderers
// can say "partially measured" where the scanner itself said it looked partially.
//
// Usage:
//   node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard> --raw <file> --exit <code> [--start F-7xx]
//   node tools/ingest.mjs <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx]
// Writes <run-dir>/eval/findings-9N-<tool>.yaml and archives the raw report to
// <run-dir>/eval/raw/<tool>.<json|yaml>. Library: convert(tool, rawText, exitCode, startId).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml } from './yaml-min.mjs';
import { loadAdapter } from './project.mjs';

// ── tool profiles ────────────────────────────────────────────────────────────
// okExits: the tool's documented success exits (anything else = tool error, halt).
// For gitleaks, 0 = clean and 1 = leaks found are both successful runs.
const PROFILES = {
  gitleaks: {
    file: 'findings-91-gitleaks.yaml',
    startId: 700,
    okExits: [0, 1],
    convert(raw, startId) {
      const leaks = parseJson(raw, 'gitleaks');
      if (!Array.isArray(leaks)) throw new Error('gitleaks report must be a JSON array');
      return leaks.map((l, i) => {
        for (const k of ['RuleID', 'File', 'StartLine']) {
          if (l[k] === undefined || l[k] === null || l[k] === '') throw new Error(`gitleaks leak ${i} missing ${k} (truncated report?)`);
        }
        // NEVER touch l.Secret / l.Match — the matched value must not leave the raw file.
        return {
          id: fid(startId + i),
          source: 'gitleaks',
          native_id: `${l.RuleID}@${l.File}:${l.StartLine}`,
          native_category: 'secret',
          polarity: 'gap',
          observation: `Committed secret detected by rule ${l.RuleID} (${oneLine(l.Description || 'no description')}); the value is in the repository history at the cited location.`,
          evidence: [`${l.File}:${l.StartLine}`],
          fix: `Rotate the credential now (assume it is burned), then purge it from history; suppress via .gitleaksignore only after verifying it is a false positive, with the reason recorded.`,
        };
      });
    },
  },
  scorecard: {
    file: 'findings-92-scorecard.yaml',
    startId: 750,
    okExits: [0],
    // Score bands (the instrument profile's documented normalization):
    //   >= 8 strength · 4-7 gap Medium · 0-3 gap High · -1 (N/A) skipped, logged.
    convert(raw, startId) {
      const rep = parseJson(raw, 'scorecard');
      if (!rep || !Array.isArray(rep.checks)) throw new Error('scorecard report has no checks[] (truncated report?)');
      const rows = []; const skipped = [];
      let n = 0;
      for (const c of rep.checks) {
        if (!c || !c.name || typeof c.score !== 'number') throw new Error('scorecard check missing name/score (truncated report?)');
        if (c.score < 0) { skipped.push(c.name); continue; } // N/A — logged in the file header, never silent
        const detailPath = firstPath(c.details);
        const row = {
          id: fid(startId + n++),
          source: 'scorecard',
          native_id: `${c.name}:${c.score}`,
          native_category: c.name,
          polarity: c.score >= 8 ? 'strength' : 'gap',
          observation: `Scorecard ${c.name} scored ${c.score}/10: ${oneLine(c.reason || 'no reason given')}.`,
          evidence: [detailPath || 'eval/raw/scorecard.json:1'],
        };
        if (row.polarity === 'gap') {
          row.severity = c.score <= 3 ? 'High' : 'Medium';
          row.fix = `Raise the ${c.name} score: follow the check's remediation guidance${c.documentation && c.documentation.url ? ` (${c.documentation.url})` : ''}.`;
        }
        rows.push(row);
      }
      rows.skipped = skipped;
      return rows;
    },
  },
  'deep-code-review': {
    file: 'findings-93-deep-code-review.yaml',
    raw: 'deep-code-review.yaml',
    startId: 800,
    exitless: true,      // an LLM skill's machine report: completeness, not an exit code, is the fail-loud property
    convert(raw, startId) {
      let rep;
      try { rep = parseYaml(raw); }
      catch (e) { throw new Error(`deep-code-review machine report is not block-style YAML (fail-closed): ${e.message.slice(0, 80)}`); }
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('deep-code-review machine report must be a top-level map (review / ground_truth / coverage / findings)');
      const domains = loadAdapter('deep-code-review').coverage_domains || [];
      if (!domains.length) throw new Error('adapters/deep-code-review.yaml carries no coverage_domains — cannot judge completeness (fail-closed)');
      const cov = rep.coverage;
      if (!cov || typeof cov !== 'object' || Array.isArray(cov)) throw new Error('machine report has no coverage: map — a report that does not say what it looked at is not a report');
      const missing = domains.filter((l) => !cov[l] || typeof cov[l] !== 'object');
      if (missing.length) throw new Error(`coverage incomplete: no row for domain(s) ${missing.join(', ')} — absence of a row is not clean`);
      for (const [l, row] of Object.entries(cov)) {
        if (!COVERAGE_STATUS.includes(row.status)) throw new Error(`coverage.${l}: bad status "${row.status}" (scanned | partial | not-scanned | not-applicable)`);
        if (row.status !== 'scanned' && !(row.note && String(row.note).trim())) throw new Error(`coverage.${l}: ${row.status} needs a note — a skip without one is indistinguishable from an omission`);
      }
      if (!Array.isArray(rep.findings)) throw new Error('machine report findings: must be a list (an empty list with full coverage is a recorded clean run)');
      const rows = []; let n = 0;
      for (const f of rep.findings) {
        const at = `finding ${(f && f.id) || '#' + (n + 1)}`;
        if (!f || typeof f !== 'object') throw new Error(`${at}: not a map`);
        for (const k of ['id', 'area', 'polarity', 'observation', 'evidence']) if (f[k] === undefined || f[k] === null || f[k] === '') throw new Error(`${at}: missing ${k}`);
        if (!['gap', 'strength'].includes(f.polarity)) throw new Error(`${at}: bad polarity "${f.polarity}" (gap | strength)`);
        if (!Array.isArray(f.evidence) || !f.evidence.length) throw new Error(`${at}: evidence must be a non-empty list of file:line`);
        if (f.polarity === 'gap' && !f.severity) throw new Error(`${at}: a gap row needs a severity`);
        if (f.polarity === 'gap' && !(f.fix && String(f.fix).trim())) throw new Error(`${at}: a gap row needs a fix — a gap without one cannot be acted on`);
        const row = {
          id: fid(startId + n++),
          source: 'deep-code-review',
          native_id: String(f.id),
          native_category: String(f.area),
          polarity: f.polarity,
          observation: oneLine(f.observation),
          evidence: f.evidence.map((e) => String(e)),
        };
        if (f.title) row.title = oneLine(f.title);
        if (f.severity) row.severity = String(f.severity);
        if (f.fix) row.fix = oneLine(f.fix);
        if (f.confidence) {
          const c = String(f.confidence);
          row.confidence = DCR_CONFIDENCE[c] || 'unverified';   // the port vocab; unknown labels read as unverified, never confirmed
          row.native_confidence = c;
        }
        if (f.latent === true) row.latent = true;
        if (f.mechanism_unproven === true) row.mechanism_unproven = true;
        if (f.prior_id) { row.prior_native_id = String(f.prior_id); if (f.prior_status) row.prior_status = String(f.prior_status); }
        if (Array.isArray(f.compounds) && f.compounds.length) row.compounds_native = f.compounds.map(String);
        rows.push(row);
      }
      rows.coverage = {
        scanner: 'deep-code-review',
        review: (rep.review && typeof rep.review === 'object') ? rep.review : {},
        ground_truth: (rep.ground_truth && typeof rep.ground_truth === 'object') ? rep.ground_truth : {},
        coverage: cov,
        prior_not_rechecked: Array.isArray(rep.prior_not_rechecked) ? rep.prior_not_rechecked.map(String) : [],
      };
      return rows;
    },
  },
};
const COVERAGE_STATUS = ['scanned', 'partial', 'not-scanned', 'not-applicable'];
// the scanner's confidence labels → the port's closed vocab (SCHEMA §2)
const DCR_CONFIDENCE = { CONFIRMED: 'confirmed', CORROBORATED: 'confirmed', PLAUSIBLE: 'plausible', unverified: 'unverified' };

const fid = (n) => `F-${String(n).padStart(3, '0')}`;
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
function parseJson(raw, tool) {
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`${tool} raw report is not valid JSON (fail-closed): ${e.message.slice(0, 80)}`); }
}
// pull a file:line (or bare path) out of a Scorecard details line, if one exists
function firstPath(details) {
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const m = String(d).match(/([\w./-]+\.\w+):(\d+)/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return null;
}

// ── convert (library) ────────────────────────────────────────────────────────
// opts.stripPrefix: an absolute target-root prefix to strip from tool-reported
// paths, so evidence lands target-relative (what `validate.mjs --target` checks).
export function convert(tool, rawText, exitCode, startId = null, opts = {}) {
  const p = PROFILES[tool];
  if (!p) throw new Error(`unknown instrument "${tool}" (profiles: ${Object.keys(PROFILES).join(', ')})`);
  if (!p.exitless) {
    const code = Number(exitCode);
    if (!Number.isInteger(code)) throw new Error(`--exit must be the tool's actual exit code (fail-loud: a run without one cannot be trusted)`);
    if (!p.okExits.includes(code)) throw new Error(`${tool} exited ${code}, outside its success set [${p.okExits.join(', ')}] — a tool error must never read as "0 findings"`);
  }
  const start = startId ? Number(String(startId).replace(/^F-/, '')) : p.startId;
  const rows = p.convert(rawText, start);
  if (opts.stripPrefix) {
    const pre = opts.stripPrefix.endsWith('/') ? opts.stripPrefix : opts.stripPrefix + '/';
    const strip = (s) => String(s).split(pre).join('');
    for (const r of rows) { r.evidence = r.evidence.map(strip); r.native_id = strip(r.native_id); }
  }
  return rows;
}

// ── YAML emit (the schema's constrained subset: block style, folded scalars) ─
function toYaml(rows, tool, exitCode, skipped) {
  const esc = (s) => oneLine(s);
  const q = (s) => `"${esc(s).replace(/"/g, "'")}"`;
  const p = PROFILES[tool];
  const out = p.exitless
    ? [`# ${p.file} — peer-scanner rows ingested by tools/ingest.mjs from the scanner's machine report.`,
       `# Scanner: ${tool} · ${rows.length} row(s) · coverage archived at eval/coverage-${tool}.yaml (one row per domain).`]
    : [`# ${p.file} — instrument rows ingested by tools/ingest.mjs.`,
       `# Instrument: ${tool} · exit code ${exitCode} (verified in its success set) · ${rows.length} row(s).`];
  if (skipped && skipped.length) out.push(`# Skipped as N/A by the tool (score -1), logged so the absence is visible: ${skipped.join(', ')}.`);
  out.push(`# Raw report archived at eval/raw/${p.raw || tool + '.json'}. Regenerate with ingest.mjs; never hand-edit.`, '');
  for (const r of rows) {
    out.push(`- id: ${r.id}`);
    out.push(`  source: ${r.source}`);
    out.push(`  native_id: "${esc(r.native_id).replace(/"/g, "'")}"`);
    out.push(`  native_category: "${esc(r.native_category).replace(/"/g, "'")}"`);
    out.push(`  polarity: ${r.polarity}`);
    if (r.severity) out.push(`  severity: ${r.severity}`);
    out.push(`  observation: >`, `    ${esc(r.observation)}`);
    out.push(`  evidence: [${r.evidence.join(', ')}]`);
    if (r.fix) out.push(`  fix: >`, `    ${esc(r.fix)}`);
    // peer-scanner extension fields (the port keeps the scanner's own labels beside the mapped ones)
    if (r.title) out.push(`  title: ${q(r.title)}`);
    if (r.confidence) out.push(`  confidence: ${r.confidence}`);
    if (r.native_confidence) out.push(`  native_confidence: ${r.native_confidence}`);
    if (r.latent) out.push(`  latent: true`);
    if (r.mechanism_unproven) out.push(`  mechanism_unproven: true`);
    if (r.prior_native_id) out.push(`  prior_native_id: ${q(r.prior_native_id)}`);
    if (r.prior_status) out.push(`  prior_status: ${r.prior_status}`);
    if (r.compounds_native) out.push(`  compounds_native: [${r.compounds_native.map((x) => esc(x)).join(', ')}]`);
  }
  return out.join('\n') + '\n';
}

// ── the coverage sidecar (block YAML; the scanner's own account of what it looked at) ─
export function coverageYaml(c) {
  const esc = (s) => oneLine(s).replace(/"/g, "'");
  const scalar = (v) => (typeof v === 'number' || typeof v === 'boolean') ? String(v) : (v === null || v === undefined) ? 'null' : `"${esc(v)}"`;
  const out = [
    `# coverage-${c.scanner}.yaml — the scanner's OWN coverage account, archived by tools/ingest.mjs.`,
    `# One row per domain in the scanner's taxonomy: scanned | partial | not-scanned | not-applicable.`,
    `# Renderers read it: an axis this scanner contributes is fully measured only where every`,
    `# mapped domain was scanned; otherwise the axis reads "partially measured", with the note.`,
    `scanner: ${c.scanner}`,
  ];
  const emitMap = (name, m, indent) => {
    const pad = ' '.repeat(indent);
    out.push(`${pad}${name}:`);
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) emitMap(k, v, indent + 2);
      else if (Array.isArray(v)) { out.push(`${pad}  ${k}:`); for (const x of v) out.push(`${pad}    - ${scalar(x)}`); if (!v.length) out[out.length - 1] = `${pad}  ${k}: []`; }
      else out.push(`${pad}  ${k}: ${scalar(v)}`);
    }
  };
  emitMap('review', c.review || {}, 0);
  emitMap('ground_truth', c.ground_truth || {}, 0);
  emitMap('coverage', c.coverage || {}, 0);
  out.push(`prior_not_rechecked: [${(c.prior_not_rechecked || []).map(esc).join(', ')}]`);
  return out.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args[0];
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const tool = opt('--tool'), rawPath = opt('--raw'), exit = opt('--exit'), start = opt('--start'), stripPrefix = opt('--strip-prefix');
  const exitless = tool && PROFILES[tool] && PROFILES[tool].exitless;
  if (!runDir || !tool || !rawPath || (exit === null && !exitless)) {
    console.error('usage: node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>]');
    console.error('       node tools/ingest.mjs <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx]');
    process.exit(2);
  }
  const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
  const rawText = readFileSync(rawPath, 'utf8');
  let rows;
  try { rows = convert(tool, rawText, exit, start, { stripPrefix }); }
  catch (e) { console.error(`✗ ingest halted: ${e.message}`); process.exit(1); }
  mkdirSync(join(evalDir, 'raw'), { recursive: true });
  copyFileSync(rawPath, join(evalDir, 'raw', PROFILES[tool].raw || `${tool}.json`));
  const dst = join(evalDir, PROFILES[tool].file);
  writeFileSync(dst, toYaml(rows, tool, exit, rows.skipped));
  if (rows.coverage) writeFileSync(join(evalDir, `coverage-${tool}.yaml`), coverageYaml(rows.coverage));
  console.log(`✓ ingested ${rows.length} ${tool} row(s) → ${dst}${rows.coverage ? ` + coverage-${tool}.yaml (${Object.keys(rows.coverage.coverage).length} domain rows)` : ''}${rows.skipped && rows.skipped.length ? ` (${rows.skipped.length} N/A check(s) logged in header)` : ''}${rows.length === 0 ? ` — verified-clean run (${exitless ? 'full coverage, empty findings' : 'success exit, empty report'}), recorded explicitly` : ''}`);
}
