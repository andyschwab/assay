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
// Usage:
//   node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard> --raw <file> --exit <code> [--start F-7xx]
// Writes <run-dir>/eval/findings-9N-<tool>.yaml and archives the raw report to
// <run-dir>/eval/raw/<tool>.json. Library: convert(tool, rawText, exitCode, startId).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './doctrine.mjs';

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
};

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
  const code = Number(exitCode);
  if (!Number.isInteger(code)) throw new Error(`--exit must be the tool's actual exit code (fail-loud: a run without one cannot be trusted)`);
  if (!p.okExits.includes(code)) throw new Error(`${tool} exited ${code}, outside its success set [${p.okExits.join(', ')}] — a tool error must never read as "0 findings"`);
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
  const out = [
    `# ${PROFILES[tool].file} — instrument rows ingested by tools/ingest.mjs.`,
    `# Instrument: ${tool} · exit code ${exitCode} (verified in its success set) · ${rows.length} row(s).`,
  ];
  if (skipped && skipped.length) out.push(`# Skipped as N/A by the tool (score -1), logged so the absence is visible: ${skipped.join(', ')}.`);
  out.push(`# Raw report archived at eval/raw/${tool}.json. Regenerate with ingest.mjs; never hand-edit.`, '');
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
  }
  return out.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args[0];
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const tool = opt('--tool'), rawPath = opt('--raw'), exit = opt('--exit'), start = opt('--start'), stripPrefix = opt('--strip-prefix');
  if (!runDir || !tool || !rawPath || exit === null) {
    console.error('usage: node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>]');
    process.exit(2);
  }
  const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
  const rawText = readFileSync(rawPath, 'utf8');
  let rows;
  try { rows = convert(tool, rawText, exit, start, { stripPrefix }); }
  catch (e) { console.error(`✗ ingest halted: ${e.message}`); process.exit(1); }
  mkdirSync(join(evalDir, 'raw'), { recursive: true });
  copyFileSync(rawPath, join(evalDir, 'raw', `${tool}.json`));
  const dst = join(evalDir, PROFILES[tool].file);
  writeFileSync(dst, toYaml(rows, tool, exit, rows.skipped));
  console.log(`✓ ingested ${rows.length} ${tool} row(s) → ${dst}${rows.skipped && rows.skipped.length ? ` (${rows.skipped.length} N/A check(s) logged in header)` : ''}${rows.length === 0 ? ' — verified-clean run (success exit, empty report), recorded explicitly' : ''}`);
}
