// harness.mjs — what every block of the regression harness shares, and the runner's
// discovery of the blocks themselves (tests/README.md says how to add one).
//
// A block is tests/blocks/<label>.mjs. It imports what it needs from here (the shared
// failure list, the fixture helpers, the verdict) and from the engine, and exports:
//   label  its name, the same as its filename; its failures are prefixed with it
//   run    an async function holding its assertions
//   gate   (optional) the names it puts on the gate's last line; [label] by default
//   after  (optional) '*' to run after every other block, or a list of labels to run after
// The runner (tests/regression.mjs) loads every block, runs them in filename order, and
// composes the gate's last line from the labels of the blocks that ran.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAdapters } from '../map/project.mjs';
import { convert as convertRaw } from '../map/ingest.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));   // tests/
export const ROOT = join(HERE, '..');                            // repo root
export const GOLDEN = join(HERE, 'golden.json');
export const bless = process.argv.includes('--bless');

// every unit and negative failure, from every block, prefixed with the block's label
export const negFailures = [];
// the scored fixtures' grades (the fixture-recall block fills it; the verdict reads it)
export const current = { _score: {} };

// (#53, F-1230) an instrument row carries no severity; the view layer computes its band.
// Loaded dynamically so a missing module reads as failed assertions, not a crash.
export const VIEW_SEV = await import('../views/severity.mjs').catch(() => null);
export const viewSev = (r) => VIEW_SEV ? VIEW_SEV.severityOf(r) : '(no views/severity.mjs)';
// every row any block converts is kept, so the instrument-severity block can sweep them all
export const convertedRows = [];
export const convert = (...a) => { const rows = convertRaw(...a); convertedRows.push(...rows); return rows; };
export function adaptersOnce() { return loadAdapters(); }

// Copy every findings file (map/findings/*.yaml) from a public fixture into a
// scratch run dir — the shared setup every synthetic-run test needs.
export function copyFixtureFindings(fixtureName, destRunDir) {
  const src = join(HERE, 'fixtures', fixtureName, 'map', 'findings');
  const dst = join(destRunDir, 'map', 'findings');
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dst, f));
}
export function copyFixtureScanners(fixtureName, destRunDir) {
  mkdirSync(join(destRunDir, 'map'), { recursive: true });
  copyFileSync(join(HERE, 'fixtures', fixtureName, 'map', 'scanners.yaml'), join(destRunDir, 'map', 'scanners.yaml'));
}

// ── the blocks: discovery, order, run, and the gate line they compose ─────────
// The exports the runner reads off a block (tests/README.md names each one).
export const BLOCK_FIELDS = ['label', 'run', 'gate', 'after'];

// Load every tests/blocks/*.mjs in filename order and refuse what cannot run honestly: no
// block at all, a label that is not its filename, no run function, a gate label two blocks
// claim, an after naming no block, a block that does not load. Returns the blocks in run
// order and every refusal; a refusal is a failure, never a skipped block.
export async function loadBlocks(dir) {
  const errors = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort() : [];
  if (!files.length) return { blocks: [], errors: [`${dir} holds no block (*.mjs): the harness must never read an empty run as green`] };
  const loaded = [];
  for (const file of files) {
    let mod;
    try { mod = await import(pathToFileURL(join(dir, file)).href); }
    catch (e) { errors.push(`${file} did not load: ${String(e.message).split('\n')[0]}`); continue; }
    const name = file.slice(0, -'.mjs'.length);
    if (mod.label !== name) { errors.push(`${file} exports label ${JSON.stringify(mod.label)}; a block's label is its filename ("${name}")`); continue; }
    if (typeof mod.run !== 'function') { errors.push(`${file} exports no run function`); continue; }
    const gate = mod.gate === undefined ? [name] : mod.gate;
    if (!Array.isArray(gate) || gate.some((g) => typeof g !== 'string' || !g)) { errors.push(`${file} exports a gate that is not a list of labels`); continue; }
    const after = mod.after === undefined ? [] : mod.after;
    if (after !== '*' && (!Array.isArray(after) || after.some((a) => typeof a !== 'string'))) { errors.push(`${file} exports an after that is neither '*' nor a list of labels`); continue; }
    loaded.push({ file, label: name, gate, after, run: mod.run, mod });
  }
  const owner = new Map();
  for (const b of loaded) for (const g of b.gate) {
    if (owner.has(g)) errors.push(`gate label "${g}" is claimed by both ${owner.get(g)} and ${b.file}`);
    else owner.set(g, b.file);
  }
  const labels = new Set(loaded.map((b) => b.label));
  for (const b of loaded) if (Array.isArray(b.after)) for (const a of b.after) if (!labels.has(a)) errors.push(`${b.file} runs after "${a}", which is no block`);
  // filename order; a block runs once every block it names in after has run, and a block
  // whose after is '*' runs after every other block
  const blocks = [];
  const pending = loaded.filter((b) => b.after !== '*');
  while (pending.length) {
    const i = pending.findIndex((b) => b.after.every((a) => !labels.has(a) || blocks.some((x) => x.label === a)));
    if (i < 0) { errors.push(`blocks ${pending.map((b) => b.file).join(', ')} wait on each other (an after cycle)`); break; }
    blocks.push(...pending.splice(i, 1));
  }
  blocks.push(...loaded.filter((b) => b.after === '*'));
  return { blocks, errors };
}

// Run each block in order. A block that throws is a failure under its own label, and it
// is not among the blocks that ran.
export async function runBlocks(blocks, failures) {
  const ran = [];
  for (const b of blocks) {
    try { await b.run(); ran.push(b); }
    catch (e) { failures.push(`${b.label}: the block threw before it finished: ${String(e?.stack || e).split('\n').slice(0, 2).join(' ')}`); }
  }
  return ran;
}

export const gateLabels = (ran) => ran.flatMap((b) => b.gate);
export const gateLine = ({ negative, scored, labels }) =>
  `✓ assay regression: ${negative} negative fixtures + fail-closed/engine/instrument unit invariants + ${scored} scored fixtures, all hold (${labels.join(', ')}).`;

// ── bless / assert ────────────────────────────────────────────────────────────
// The verdict of one harness run. --bless rewrites golden.json only when every unit and
// negative invariant holds and every scored fixture graded; otherwise it refuses, writes
// nothing and exits 1 (a bless over red would pin the regression and read green).
export function verdict({ bless, negFailures, current, goldenPath }) {
  const out = [], err = [];
  const scoreErrors = Object.entries(current._score).filter(([, v]) => v && v.error).map(([k, v]) => `_score.${k}: scorer error: ${v.error}`);
  if (bless) {
    if (negFailures.length || scoreErrors.length) {
      err.push(`✗ refusing --bless: ${negFailures.length} unit/negative failure(s) and ${scoreErrors.length} scorer error(s); golden.json is unchanged. Fix these first — they are never re-blessed:\n`);
      for (const f of [...negFailures, ...scoreErrors]) err.push('  • ' + f);
      return { exit: 1, out, err };
    }
    writeFileSync(goldenPath, JSON.stringify(current, null, 2) + '\n');
    out.push('✓ blessed golden.json from current state. Review the diff before committing.');
    return { exit: 0, out, err };
  }
  if (!existsSync(goldenPath)) { err.push('✗ no golden.json — run `node tests/regression.mjs --bless` first, review, and commit.'); return { exit: 2, out, err }; }
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  const drifts = [];
  const cmp = (path, g, c) => {
    if (typeof g === 'object' && g && typeof c === 'object' && c) {
      for (const k of new Set([...Object.keys(g), ...Object.keys(c)])) cmp(`${path}.${k}`, g[k], c[k]);
    } else if (JSON.stringify(g) !== JSON.stringify(c)) {
      drifts.push(`${path}: golden ${JSON.stringify(g)} → now ${JSON.stringify(c)}`);
    }
  };
  cmp('_score', golden._score, current._score);
  if (!drifts.length && !negFailures.length) return { exit: 0, out, err, ok: true };
  if (negFailures.length) {
    err.push(`✗ assay regression: ${negFailures.length} unit/negative failure(s) — an invariant that must always hold was violated:\n`);
    for (const f of negFailures) err.push('  • ' + f);
    err.push('  These are never re-blessed. Restore the check the assertion targets.');
  }
  if (drifts.length) {
    err.push(`✗ assay regression: ${drifts.length} scored invariant(s) drifted:\n`);
    for (const d of drifts) err.push('  • ' + d);
    err.push('\n  If INTENTIONAL, re-bless (node tests/regression.mjs --bless) and commit golden.json in the same diff.');
  }
  return { exit: 1, out, err };
}
