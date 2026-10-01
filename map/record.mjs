#!/usr/bin/env node
// record.mjs — set one scanner's disposition directly in <run>/map/scanners.yaml
// (the run record, SCHEMA.md §5a): a judgment scanner's own review lands as
// `record <run> repo-eval ran`, a decision not to run something as `record
// <run> <scanner> skipped --reason "<why>"`. `assay start` (map/start.mjs)
// writes the file; `ingest` and `record` are the only things that touch it
// after that, and both go through setScannerRow below, under updateRunRecord's
// lock (map/scanners.yaml.lock) — a line-level edit of
// the ONE row's own block, leaving every other row, the file's comments, and
// its `engine:` line exactly as they were. Never a reformat.
//
// Usage: node assay.mjs record <run> <scanner> <ran|skipped|failed> [--reason "<text>"] [--model <id>] [--spend "<text>"] [--pass <pass>]
//   ran      — `--reason` is allowed too (a note on how it ran); a prior
//              skip/failed reason is DROPPED unless a new one is given here.
//   skipped  — needs --reason (a skip with no reason is indistinguishable
//              from an omission — CLAUDE.md rule 3: fail loud, never empty).
//   failed   — needs --reason (the error).
//   --model  — the model id a judgment scanner ran on. An existing model: is
//              kept when this is omitted, whatever the new status.
//   --spend  — what its inference spent, with the unit ("41k tokens"); kept
//              like model:.
//   --pass   — repo-eval only: --model/--spend land on that one pass
//              (`passes: <pass>:` in the row) instead of the row. Recorded
//              passes are kept by every edit.
// Adds the row if the scanner has none yet. Refuses (exit 2, nothing
// written): no scanners.yaml (start the run first), an unknown scanner (no
// adapter), or skipped/failed with no --reason. It does NOT check that the
// scanner's rows exist in the base — `validate` does that, fail-closed, and
// names this command in its own message.
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { isMain } from './doctrine.mjs';
import { parseYaml, q } from '../lib/yaml-min.mjs';
import { loadAdapters, REPO_EVAL_PASSES } from './project.mjs';
import { scannersPath } from '../lib/run-layout.mjs';

export const STATUSES = ['ran', 'skipped', 'failed'];

const spendScalar = (v) => (Number.isInteger(v) ? String(v) : q(v));

function renderRow(id, status, reason, model, spend, passes) {
  const lines = [`  ${id}:`, `    status: ${status}`];
  if (reason) lines.push(`    reason: ${q(reason)}`);
  if (model) lines.push(`    model: ${q(model)}`);
  if (spend !== undefined && spend !== null) lines.push(`    spend: ${spendScalar(spend)}`);
  const ps = Object.entries(passes || {});
  if (ps.length) {
    lines.push('    passes:');
    for (const [p, v] of ps) {
      lines.push(`      ${p}:`);
      if (v.model) lines.push(`        model: ${q(v.model)}`);
      if (v.spend !== undefined && v.spend !== null) lines.push(`        spend: ${spendScalar(v.spend)}`);
    }
  }
  return lines;
}

// setScannerRow — the shared editor. text: the CURRENT raw scanners.yaml.
// Returns { text: <new raw text>, row: <the written row's own lines> }.
// A line-level splice: locates the top-level `scanners:` map, finds that one
// scanner's row (a `  <id>:` line through the line before the next `  <id>:`
// or the end of the map), and replaces just that span — every line before it,
// after it, and outside the scanners: map (the header comment, `engine:`) is
// carried through byte-for-byte. A row this scanner has none of yet is
// appended after the last existing row.
export function setScannerRow(text, scanner, status, { reason, model, spend, pass } = /** @type {any} */ ({})) {
  if (!STATUSES.includes(status)) throw new Error(`bad status "${status}" (${STATUSES.join(' | ')})`);
  if (pass !== undefined && scanner !== 'repo-eval') throw new Error(`--pass is the built-in scanner's per-pass record; ${scanner} has no passes`);
  if (pass !== undefined && !REPO_EVAL_PASSES[pass]) throw new Error(`unknown pass "${pass}" (${Object.keys(REPO_EVAL_PASSES).join(' | ')})`);
  if (pass !== undefined && model === undefined && spend === undefined) throw new Error(`--pass ${pass} records that pass's --model and/or --spend; neither was given`);
  const hadTrailingNL = text.endsWith('\n');
  const lines = (hadTrailingNL ? text.slice(0, -1) : text).split('\n');

  const sIdx = lines.findIndex((l) => /^scanners:\s*$/.test(l));
  if (sIdx === -1) throw new Error('no top-level "scanners:" map in this file (fail-closed — is it a run manifest? map/scanners.yaml is written by `assay start`)');
  let blockEnd = lines.length;
  for (let i = sIdx + 1; i < lines.length; i++) { if (/^[^\s#]/.test(lines[i])) { blockEnd = i; break; } }
  const rowStartRe = /^ {2}([A-Za-z0-9_.-]+):\s*$/;
  const rowStarts = [];
  for (let i = sIdx + 1; i < blockEnd; i++) { const m = lines[i].match(rowStartRe); if (m) rowStarts.push({ id: m[1], line: i }); }

  // the scanner's CURRENT parsed value (if any) drives the merge rule: `ran`
  // drops a prior reason unless a new one is given; `model` always carries
  // over unless this call overrides it. A file this minimal reader cannot
  // parse still gets a mechanical line edit (the line scan above stands on
  // its own); it just cannot inherit a prior reason/model to merge with.
  let doc = null;
  try { doc = parseYaml(text); } catch { /* see comment above */ }
  const current = (doc && doc.scanners && typeof doc.scanners === 'object' && doc.scanners[scanner] && typeof doc.scanners[scanner] === 'object') ? doc.scanners[scanner] : null;

  const finalReason = reason !== undefined ? reason : (status === 'ran' ? undefined : (current ? current.reason : undefined));
  const onRow = pass === undefined;
  const finalModel = onRow && model !== undefined ? model : (current ? current.model : undefined);
  const finalSpend = onRow && spend !== undefined ? spend : (current ? current.spend : undefined);
  const passes = { ...(current && current.passes && typeof current.passes === 'object' ? current.passes : {}) };
  if (!onRow) {
    const was = passes[pass] && typeof passes[pass] === 'object' ? passes[pass] : {};
    passes[pass] = { model: model !== undefined ? model : was.model, spend: spend !== undefined ? spend : was.spend };
  }
  const row = renderRow(scanner, status, finalReason, finalModel, finalSpend, passes);

  const at = rowStarts.find((r) => r.id === scanner);
  let out;
  if (at) {
    const i = rowStarts.indexOf(at);
    const rowEnd = i + 1 < rowStarts.length ? rowStarts[i + 1].line : blockEnd;
    out = [...lines.slice(0, at.line), ...row, ...lines.slice(rowEnd)];
  } else {
    out = [...lines.slice(0, blockEnd), ...row, ...lines.slice(blockEnd)];
  }
  let result = out.join('\n');
  if (hadTrailingNL) result += '\n';
  return { text: result, row };
}

// updateRunRecord — the run record's one read-modify-write: reads the file, applies
// edit(text) → new text, writes it back, all under a lock file beside it
// (<scanners.yaml>.lock, created exclusively), so two writers — `record`, `ingest`,
// another agent's — never interleave and lose a row (#53, F-613). A writer waits
// for a held lock up to LOCK_WAIT_MS, then fails loud naming the lock file (a
// writer that crashed holding it leaves it behind; remove it by hand), never
// writing unlocked.
export const LOCK_WAIT_MS = 30000;
export function updateRunRecord(path, edit) {
  const lock = `${path}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; }
    catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EEXIST') throw e;
      if (Date.now() > deadline) throw new Error(`${lock} has been held for ${LOCK_WAIT_MS / 1000}s — another writer is updating the run record, or one crashed holding it (remove the file if no writer is running)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    const text = edit(readFileSync(path, 'utf8'));
    writeFileSync(path, text);
    return text;
  } finally { closeSync(fd); unlinkSync(lock); }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const [runDir, scanner, status, ...rest] = process.argv.slice(2);
  const opt = (name) => { const i = rest.indexOf(name); return i > -1 ? rest[i + 1] : undefined; };
  if (!runDir || !scanner || !status) {
    console.error('usage: node assay.mjs record <run> <scanner> <ran|skipped|failed> [--reason "<text>"] [--model <id>] [--spend "<text>"] [--pass <pass>]');
    process.exit(2);
  }
  if (!STATUSES.includes(status)) {
    console.error(`✗ record: bad status "${status}" (${STATUSES.join(' | ')})`);
    process.exit(2);
  }
  const reason = opt('--reason');
  const model = opt('--model');
  const spend = opt('--spend');
  const pass = opt('--pass');
  const mPath = scannersPath(runDir);
  if (!existsSync(mPath)) {
    console.error(`✗ record: no ${mPath} — start the run first: node assay.mjs start --out ${runDir} <target>`);
    process.exit(2);
  }
  const adapters = loadAdapters();
  if (!adapters[scanner]) {
    console.error(`✗ record: unknown scanner "${scanner}" — no adapter map/scanners/adapters/${scanner}.yaml`);
    process.exit(2);
  }
  if ((status === 'skipped' || status === 'failed') && !(reason && reason.trim())) {
    console.error(`✗ record: ${status} needs a reason — pass --reason "<text>" (a skip/failure with no reason is indistinguishable from an omission)`);
    process.exit(2);
  }
  let row = /** @type {string[]} */ ([]);
  try { updateRunRecord(mPath, (text) => { const r = setScannerRow(text, scanner, status, { reason, model, spend, pass }); row = r.row; return r.text; }); }
  catch (e) { console.error(`✗ record: ${e.message}`); process.exit(2); }
  console.log(row.join('\n'));
}
