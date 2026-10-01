#!/usr/bin/env node
// start.mjs — draws the OFFLINE instruments for a run and writes the run's own
// record (map/scanners.yaml, SCHEMA.md §5a), so starting a run takes no
// guesswork: one command makes the folder, runs every instrument assay can run
// on its own, and records every other adopted scanner as not-yet-run with a
// reason — never silently absent.
//
// This is the ONE sequencing both callers share: `assay start` (a person
// starting a run in their own terminal) and routine/run.mjs (the routine a
// stewarded repository runs on its own schedule). The routine's own reasons
// (NOT_RUN_BY_ROUTINE, its gitleaks-absent line) are parameters here, not
// hard-coded, so moving this file changed nothing about what the routine
// records (tests/regression.mjs's routine block pins this byte-for-byte).
//
// Usage: node assay.mjs start --out <run> [<target>]
//   <target> given  — runs repo-census, fresh-clone (from a scratch clone of the
//                      target's committed head, never in place: the routine's
//                      CI checkout is the only in-place caller), dependency-scan,
//                      and gitleaks when its binary is on PATH; every OTHER adopted scanner (every adapter under
//                      map/scanners/adapters/ without `adopted: false`) is
//                      recorded skipped, plainly saying it has not run yet and
//                      how to record it.
//   no <target>     — nothing runs; every adopted scanner is recorded skipped,
//                      reason "not yet run: ingesting its report records it
//                      ran" — a run whose instruments run elsewhere (a child
//                      session that publishes its own documents) still starts
//                      with a valid record.
// Refuses (exit 2, nothing written) when <run>/map/scanners.yaml already
// exists — a run is never redrawn in place. Then runs `validate` (with
// `--target <target>` when one was given) and prints a short "next" block:
// what ran, what is recorded skipped and why, and the two commands that
// remain. It does not compile and does not write routine.yaml — that is the
// routine's own record, not a person's start.
//
// Library: drawOfflineMap, runAssayInstrument, runGitleaks, toScannersYaml,
// engineCommit — routine/run.mjs imports all five.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';
import { loadAdapters, adoptedAdapters } from './project.mjs';
import { scannersPath, findingsDir } from '../lib/run-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));       // map/
const ASSAY_ROOT = join(HERE, '..');
const ASSAY_CLI = join(ASSAY_ROOT, 'assay.mjs');

function assay(args) {
  return spawnSync(process.execPath, [ASSAY_CLI, ...args], { encoding: 'utf8' });
}
function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}
export function engineCommit() {
  if (process.env.ASSAY_REF) return process.env.ASSAY_REF;
  const r = spawnSync('git', ['-C', ASSAY_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : 'unknown';
}

// One instrument step, run through assay's own CLI: `node assay.mjs <cmd> <repoDir>
// --out <raw>`, then `node assay.mjs ingest <outDir> --tool <tool> --raw <raw> --exit <code>`
// when the exit is in the tool's documented success set (map/scanners/CONTRACT.md);
// anything else (a crash) is recorded FAILED, with the tool's own stderr as the
// reason — the caller keeps going, never crashing the whole run over one instrument.
export function runAssayInstrument({ tool, cmd, cliArgs, okExits, outDir, log }) {
  const rawFile = join(tmpdir(), `assay-start-${tool}-${process.pid}.json`);
  log(`· ${tool} …`);
  const r = assay([cmd, ...cliArgs, '--out', rawFile]);
  const exit = r.status;
  if (exit == null || !okExits.includes(exit)) {
    const reason = `${tool} exited ${exit == null ? '(no exit code — process error)' : exit}: ${String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ') || 'no output'}`;
    log(`  ✗ ${tool} failed: ${reason}`);
    try { rmSync(rawFile, { force: true }); } catch {}
    return { status: 'failed', reason };
  }
  const ing = assay(['ingest', outDir, '--tool', tool, '--raw', rawFile, '--exit', String(exit)]);
  try { rmSync(rawFile, { force: true }); } catch {}
  if (ing.status !== 0) {
    const reason = `${tool} ran (exit ${exit}) but its report failed to ingest: ${String(ing.stderr || ing.stdout || '').trim().split('\n').slice(-3).join(' | ')}`;
    log(`  ✗ ${reason}`);
    return { status: 'failed', reason };
  }
  log(`  ✓ ${tool} ran (exit ${exit})`);
  return { status: 'ran' };
}

// gitleaks is an external binary, not part of assay's own CLI — run it directly
// when present; when it is not, skip it with the CALLER's own absent-reason
// (CONTRACT.md §3a: an adopted instrument may be absent from an environment,
// and its absence must be RECORDED, never silently read as clean).
export function runGitleaks(repoDir, outDir, log, absentReason) {
  if (!which('gitleaks')) {
    log('· gitleaks — binary not found on PATH, skipped');
    return { status: 'skipped', reason: absentReason };
  }
  const rawFile = join(tmpdir(), `assay-start-gitleaks-${process.pid}.json`);
  log('· gitleaks …');
  const r = spawnSync('gitleaks', ['detect', '--source', repoDir, '--report-format', 'json', '--report-path', rawFile, '--redact'], { encoding: 'utf8' });
  const exit = r.status;
  if (exit == null || (exit !== 0 && exit !== 1)) {
    const reason = `gitleaks exited ${exit == null ? '(no exit code — process error)' : exit}: ${String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ') || 'no output'}`;
    log(`  ✗ gitleaks failed: ${reason}`);
    try { rmSync(rawFile, { force: true }); } catch {}
    return { status: 'failed', reason };
  }
  const ing = assay(['ingest', outDir, '--tool', 'gitleaks', '--raw', rawFile, '--exit', String(exit)]);
  try { rmSync(rawFile, { force: true }); } catch {}
  if (ing.status !== 0) {
    const reason = `gitleaks ran (exit ${exit}) but its report failed to ingest: ${String(ing.stderr || ing.stdout || '').trim().split('\n').slice(-3).join(' | ')}`;
    log(`  ✗ ${reason}`);
    return { status: 'failed', reason };
  }
  log(`  ✓ gitleaks ran (exit ${exit})`);
  return { status: 'ran' };
}

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
// header: the caller's own leading comment line — routine/run.mjs passes its
// original text verbatim so its output stays byte-identical to before the move.
export function toScannersYaml(engine, rows, header = '# scanners.yaml — GENERATED by map/start.mjs. The run\'s own record (SCHEMA.md §5a).') {
  const L = [header, `engine: ${engine}`, 'scanners:'];
  for (const [id, r] of Object.entries(rows)) {
    L.push(`  ${id}:`, `    status: ${r.status}`);
    if (r.reason) L.push(`    reason: ${q(r.reason)}`);
    if (r.model) L.push(`    model: ${q(r.model)}`);
  }
  return L.join('\n') + '\n';
}

// The two judgment-bearing (LLM-driven) scanners: this file never runs them —
// a steward session runs those (map/scanners/CONTRACT.md §3a: instrument vs
// peer scanner). Kept as an explicit pair, exactly as the routine has always
// hard-coded them, so drawOfflineMap's callers stay byte-identical.
const JUDGMENT_SCANNERS = ['repo-eval', 'deep-code-review'];

// drawOfflineMap — runs every instrument assay can run on its own (repo-census,
// fresh-clone, dependency-scan, gitleaks-if-present) against repoDir/outDir,
// and records the two judgment scanners skipped with the caller's own
// pendingReason. Returns the six scanner rows (not yet written to disk — the
// caller decides the file's full roster and writes it).
//   pendingReason(id)     — the reason text for a judgment scanner (a function
//                           of the scanner id, or a plain string used as-is).
//   gitleaksAbsentReason  — the reason text when the gitleaks binary is absent.
//   freshCloneNoClone     — pass `--no-clone` to fresh-clone (run it in place):
//                           the routine's own repoDir IS already a fresh CI
//                           checkout, so it passes true, byte-identically to
//                           before this file existed. `assay start`, run
//                           against a person's own working tree, leaves this
//                           false — a person's checkout is not a fresh
//                           checkout, and running in place would install into
//                           their working tree and measure uncommitted state;
//                           fresh-clone then clones repoDir itself (a real
//                           git ref) into a scratch directory first.
export function drawOfflineMap({ repoDir, outDir, pendingReason, gitleaksAbsentReason, freshCloneNoClone = false } = /** @type {any} */ ({}), log = /** @type {(msg: string) => void} */ (() => {})) {
  const reasonFor = typeof pendingReason === 'function' ? pendingReason : () => pendingReason;
  const rows = {};
  for (const id of JUDGMENT_SCANNERS) rows[id] = { status: 'skipped', reason: reasonFor(id) };
  rows['repo-census'] = runAssayInstrument({ tool: 'repo-census', cmd: 'repo-census', cliArgs: [repoDir], okExits: [0, 1], outDir, log });
  const fcArgs = freshCloneNoClone ? [repoDir, '--no-clone'] : [repoDir];
  rows['fresh-clone'] = runAssayInstrument({ tool: 'fresh-clone', cmd: 'fresh-clone', cliArgs: fcArgs, okExits: [0, 1], outDir, log });
  rows['dependency-scan'] = runAssayInstrument({ tool: 'dependency-scan', cmd: 'dependency-scan', cliArgs: [repoDir], okExits: [0, 1], outDir, log });
  rows['gitleaks'] = runGitleaks(repoDir, outDir, log, gitleaksAbsentReason);
  return rows;
}

// the reason a `start` run gives for a judgment scanner it never runs, naming
// the command that records it once its report is ingested or reviewed. The run's
// own path stays out of it: the reason is printed in every view that names what
// was not measured, and a local path describes the machine, not the run.
const pendingReasonFor = (_outArg) => (id) =>
  `not yet run: a steward session runs it; ingesting its report records it ran (${id}: node assay.mjs record <run> ${id} ran)`;
const GITLEAKS_ABSENT_HERE = 'gitleaks binary not on PATH where this run was drawn';
const NO_TARGET_REASON = 'not yet run: ingesting its report records it ran';

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) runCli();

function runCli() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outArg = outIdx > -1 ? args[outIdx + 1] : null;
  const flagIdx = new Set(outIdx > -1 ? [outIdx, outIdx + 1] : []);
  const target = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  if (!outArg) {
    console.error('usage: node assay.mjs start --out <run> [<target>]');
    process.exit(2);
  }
  const outDir = resolve(outArg);
  const mPath = scannersPath(outDir);
  if (existsSync(mPath)) {
    console.error(`✗ start refused: ${mPath} already exists — a run is never redrawn in place. Pick a new --out, or use \`record\`/\`ingest\` to update this one.`);
    process.exit(2);
  }

  // map/findings/ is created even when nothing runs here (no target — every
  // instrument runs elsewhere): an explicit empty directory is what lets this
  // run validate green with zero rows, same as any other verified-clean base.
  mkdirSync(findingsDir(outDir), { recursive: true });
  const log = (l) => console.log(l);
  const adapters = loadAdapters();
  const adopted = adoptedAdapters(adapters);

  let rows = {};
  if (target) {
    const repoDir = resolve(target);
    rows = drawOfflineMap({ repoDir, outDir, pendingReason: pendingReasonFor(outArg), gitleaksAbsentReason: GITLEAKS_ABSENT_HERE }, log);
  }
  // Every OTHER adopted scanner (today: none beyond the six drawOfflineMap
  // already covers; a future adapter falls here automatically) is recorded
  // skipped — never silently coverage-by-omission.
  for (const id of Object.keys(adopted)) {
    if (!rows[id]) rows[id] = { status: 'skipped', reason: target ? pendingReasonFor(outArg)(id) : NO_TARGET_REASON };
  }

  writeFileSync(mPath, toScannersYaml(engineCommit(), rows));

  const validateArgs = ['validate', outDir];
  if (target) validateArgs.push('--target', resolve(target));
  const val = assay(validateArgs);
  if (val.stdout) process.stdout.write(val.stdout);
  if (val.stderr) process.stderr.write(val.stderr);

  const ran = Object.entries(rows).filter(([, r]) => r.status === 'ran').map(([id]) => id);
  const skipped = Object.entries(rows).filter(([, r]) => r.status === 'skipped');
  const failed = Object.entries(rows).filter(([, r]) => r.status === 'failed');
  console.log('\nStarted ' + outArg + (target ? ` against ${target}` : ' (no target — instruments run elsewhere)') + '.');
  console.log(`  ran: ${ran.length ? ran.join(', ') : '(none)'}`);
  if (skipped.length) { console.log('  skipped:'); for (const [id, r] of skipped) console.log(`    - ${id}: ${r.reason}`); }
  if (failed.length) { console.log('  failed:'); for (const [id, r] of failed) console.log(`    - ${id}: ${r.reason}`); }
  console.log('\nNext:');
  console.log(`  node assay.mjs ingest ${outArg} --tool <scanner> --raw <report> --exit <code>   # ingest a report — this also records it ran`);
  console.log(`  node assay.mjs record ${outArg} <scanner> ran|skipped|failed [--reason "<text>"]   # record one directly (a judgment scanner's review, a skip decision)`);
  console.log(`  node assay.mjs compile ${outArg}                                                   # once every scanner is recorded`);

  process.exit(val.status === 0 ? 0 : 1);
}
