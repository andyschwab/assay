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
// records (tests/blocks/routine.mjs pins this byte-for-byte).
//
// Usage: node assay.mjs start --out <run> [<target>] [--allow-exec]
//   <target> given  — runs repo-census, dependency-scan (from scratch copies of
//                      each lockfile, never the target's own configuration),
//                      structure-scan (jscpd and knip installed into its own
//                      scratch; knip only under --allow-exec, since it imports
//                      the target's own tool configs), and gitleaks when its
//                      binary is on PATH; and fresh-clone
//                      (from a scratch clone of the target's committed head,
//                      never in place: the routine's CI checkout is the only
//                      in-place caller) ONLY under --allow-exec, because it
//                      runs the target's own install, lifecycle scripts and
//                      tests on this machine — without the flag it is recorded
//                      skipped with that reason (#47), and over a target that is
//                      not a git repository's top level (an exported tree) it is
//                      recorded skipped with that reason (#88); every OTHER adopted scanner (every adapter under
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
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';
import { loadAdapters, adoptedAdapters } from './project.mjs';
import { scannersPath, findingsDir } from '../lib/run-layout.mjs';
import { q } from '../lib/yaml-min.mjs';

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
// The raw report is written inside a private mkdtemp directory, removed afterward —
// never at a guessable name in the shared temp directory, where a planted file or
// symlink would receive it.
const rawScratch = (tool) => { const dir = mkdtempSync(join(tmpdir(), `assay-start-${tool}-`)); return { dir, file: join(dir, `${tool}.json`) }; };
export function runAssayInstrument({ tool, cmd, cliArgs, okExits, outDir, log, target = null }) {
  const { dir: rawDir, file: rawFile } = rawScratch(tool);
  log(`· ${tool} …`);
  const r = assay([cmd, ...cliArgs, '--out', rawFile]);
  const row = ingestInstrumentRaw({ tool, exit: r.status, output: r.stderr || r.stdout, rawFile, okExits, outDir, log, target });
  try { rmSync(rawDir, { recursive: true, force: true }); } catch {}   // the private raw-report directory (#49), removed by the caller: ingestInstrumentRaw also serves the handoff (#48)
  return row;
}
// The second half of runAssayInstrument: given an instrument's exit and the raw
// report it wrote, ingest it or record it failed. The routine's gate step calls it
// directly on the report its target step handed forward (routine/README.md).
// target: the run's target root, for ingest's scope check (#35); a handoff passes none,
// its report drawn in another job whose checkout path need not match this one
function ingestInstrumentRaw({ tool, exit, output, rawFile, okExits, outDir, log, target = null }) {
  if (exit == null || !okExits.includes(exit)) {
    const reason = `${tool} exited ${exit == null ? '(no exit code — process error)' : exit}: ${String(output || '').trim().split('\n').slice(-3).join(' | ') || 'no output'}`;
    log(`  ✗ ${tool} failed: ${reason}`);
    return { status: 'failed', reason };
  }
  const ing = assay(['ingest', outDir, '--tool', tool, '--raw', rawFile, '--exit', String(exit), ...(target ? ['--target', target] : [])]);
  if (/^⚠ /m.test(String(ing.stderr || ''))) for (const l of String(ing.stderr).split('\n').filter((x) => x.startsWith('⚠ '))) log(`  ${l}`);
  if (ing.status !== 0) {
    const reason = `${tool} ran (exit ${exit}) but its report failed to ingest: ${String(ing.stderr || ing.stdout || '').trim().split('\n').slice(-3).join(' | ')}`;
    log(`  ✗ ${reason}`);
    return { status: 'failed', reason };
  }
  log(`  ✓ ${tool} ran (exit ${exit})`);
  for (const line of toolNotRunLines(tool, rawFile)) log(line);
  return { status: 'ran' };
}
// An instrument that drives tools of its own records each one under `tools.<name>`
// ({ status, reason }); one it records skipped or failed gets its own console line
// with the reason's first sentence (#129), so a person reading `start` learns that
// pass did not happen without opening the run record. Generic over the record's
// shape: any instrument with a `tools` record gets the same line. The raw report
// already ingested, so one that cannot be read here simply adds no line.
function toolNotRunLines(tool, rawFile) {
  let tools;
  try { tools = JSON.parse(readFileSync(rawFile, 'utf8')).tools; } catch { return []; }
  if (!tools || typeof tools !== 'object') return [];
  return Object.entries(tools)
    .filter(([, t]) => t && (t.status === 'skipped' || t.status === 'failed'))
    .map(([name, t]) => `  · ${tool}: ${name} ${t.status} — ${String(t.reason || 'no reason recorded').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0]}`);
}

// gitleaks is an external binary, not part of assay's own CLI — run it directly
// when present; when it is not, skip it with the CALLER's own absent-reason
// (CONTRACT.md §3a: an adopted instrument may be absent from an environment,
// and its absence must be RECORDED, never silently read as clean).
// Git mode reads the history of whatever repository CONTAINS --source, so the
// target must be its repository's top level: a subdirectory of a larger
// checkout is refused with a reason (checked before the binary, so the record
// is the same on every machine), and a directory in no repository is scanned in
// directory mode. gitleaks runs from inside the target with --source . so every
// File it reports is relative to the target (#51).
const GITLEAKS_NOT_TOP_LEVEL = "gitleaks not run: the target is not its git repository's top level, so a git-mode scan would read the enclosing repository's history — scan the repository's own checkout, or a copy outside any repository";
export function runGitleaks(repoDir, outDir, log, absentReason) {
  const top = spawnSync('git', ['-C', repoDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  const inRepo = top.status === 0;
  if (inRepo && realpathSync(String(top.stdout).trim()) !== realpathSync(repoDir)) {
    log('· gitleaks — target is not its repository\'s top level, skipped');
    return { status: 'skipped', reason: GITLEAKS_NOT_TOP_LEVEL };
  }
  if (!which('gitleaks')) {
    log('· gitleaks — binary not found on PATH, skipped');
    return { status: 'skipped', reason: absentReason };
  }
  const { dir: rawDir, file: rawFile } = rawScratch('gitleaks');
  log(`· gitleaks (${inRepo ? 'git history' : 'directory, no repository'}) …`);
  const r = spawnSync('gitleaks', ['detect', '--source', '.', ...(inRepo ? [] : ['--no-git']), '--report-format', 'json', '--report-path', rawFile, '--redact'], { cwd: repoDir, encoding: 'utf8' });
  const exit = r.status;
  if (exit == null || (exit !== 0 && exit !== 1)) {
    const reason = `gitleaks exited ${exit == null ? '(no exit code — process error)' : exit}: ${String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ') || 'no output'}`;
    log(`  ✗ gitleaks failed: ${reason}`);
    try { rmSync(rawDir, { recursive: true, force: true }); } catch {}
    return { status: 'failed', reason };
  }
  const ing = assay(['ingest', outDir, '--tool', 'gitleaks', '--raw', rawFile, '--exit', String(exit)]);
  try { rmSync(rawDir, { recursive: true, force: true }); } catch {}
  if (ing.status !== 0) {
    const reason = `gitleaks ran (exit ${exit}) but its report failed to ingest: ${String(ing.stderr || ing.stdout || '').trim().split('\n').slice(-3).join(' | ')}`;
    log(`  ✗ ${reason}`);
    return { status: 'failed', reason };
  }
  log(`  ✓ gitleaks ran (exit ${exit})`);
  return { status: 'ran' };
}

// header: the caller's own leading comment line — routine/run.mjs passes its
// original text verbatim so its output stays byte-identical to before the move.
// target: the run's target root (#35), which ingest places each instrument's own root against
export function toScannersYaml(engine, rows, header = '# scanners.yaml — GENERATED by map/start.mjs. The run\'s own record (SCHEMA.md §5a).', target = null) {
  const L = [header, `engine: ${engine}`, ...(target ? [`target: ${q(target)}`] : []), 'scanners:'];
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
// fresh-clone, dependency-scan, gitleaks-if-present, structure-scan) against
// repoDir/outDir, and records the two judgment scanners skipped with the caller's
// own pendingReason. Returns the seven scanner rows (not yet written to disk — the
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
//   freshCloneSkipReason  — when set, fresh-clone is not run and is recorded
//                           skipped with this reason: `assay start` without
//                           --allow-exec. The routine never sets it.
//   structureScanNoExec   — pass `--no-exec` to structure-scan: knip, which imports
//                           the target's own tool configuration files, is then
//                           recorded skipped with that reason (jscpd and the tree
//                           pass still run). `assay start` without --allow-exec
//                           sets it.
//   handoff               — a directory another step wrote with
//                           writeTargetHandoff: fresh-clone and structure-scan are
//                           not run here, their handed-forward reports are
//                           ingested instead (the routine's gate job, which never
//                           executes the target; knip ran in the target job,
//                           after fresh-clone's install — #128).
export function drawOfflineMap({ repoDir, outDir, pendingReason, gitleaksAbsentReason, freshCloneNoClone = false, freshCloneSkipReason = null, handoff = null, structureScanNoExec = false } = /** @type {any} */ ({}), log = /** @type {(msg: string) => void} */ (() => {})) {
  const reasonFor = typeof pendingReason === 'function' ? pendingReason : () => pendingReason;
  const rows = {};
  for (const id of JUDGMENT_SCANNERS) rows[id] = { status: 'skipped', reason: reasonFor(id) };
  rows['repo-census'] = runAssayInstrument({ tool: 'repo-census', cmd: 'repo-census', cliArgs: [repoDir], okExits: [0, 1], outDir, log, target: repoDir });
  const fcArgs = freshCloneNoClone ? [repoDir, '--no-clone'] : [repoDir];
  if (freshCloneSkipReason) { log(`· fresh-clone — not run: ${freshCloneSkipReason}`); rows['fresh-clone'] = { status: 'skipped', reason: freshCloneSkipReason }; }
  else if (handoff) rows['fresh-clone'] = ingestHandoff('fresh-clone', handoff, outDir, log);
  else rows['fresh-clone'] = runAssayInstrument({ tool: 'fresh-clone', cmd: 'fresh-clone', cliArgs: fcArgs, okExits: [0, 1], outDir, log, target: repoDir });
  rows['dependency-scan'] = runAssayInstrument({ tool: 'dependency-scan', cmd: 'dependency-scan', cliArgs: [repoDir], okExits: [0, 1], outDir, log, target: repoDir });
  rows['gitleaks'] = runGitleaks(repoDir, outDir, log, gitleaksAbsentReason);
  if (handoff) rows['structure-scan'] = ingestHandoff('structure-scan', handoff, outDir, log);
  else rows['structure-scan'] = runAssayInstrument({ tool: 'structure-scan', cmd: 'structure-scan', cliArgs: structureScanNoExec ? [repoDir, '--no-exec'] : [repoDir], okExits: [0, 1], outDir, log });
  return rows;
}

// ── the target's instruments handed from one step to another ────────────────
// The routine runs the target's own code in one job and gates in another
// (routine/README.md "Two jobs"). The first runs fresh-clone in place, then
// structure-scan with knip enabled over the dependencies that install left
// (#118, #128), and writes, into a handoff directory, each one's raw report and a
// status file ({ exit, output }); the second ingests them. The handoff is the
// target job's output, read as data: ingest validates each report like any other,
// and a missing or unreadable one records that instrument failed with the
// reason — never run here, never clean.
const HANDED_OFF = { 'fresh-clone': ['--no-clone'], 'structure-scan': [] };   // in this order: knip reads fresh-clone's install
const HANDOFF_OK_EXITS = [0, 1];
const handoffReport = (tool) => `${tool}.json`;
const handoffStatus = (tool) => `${tool}.status.json`;
export function writeTargetHandoff({ repoDir, handoffDir }, log = /** @type {(msg: string) => void} */ (() => {})) {
  mkdirSync(handoffDir, { recursive: true });
  const exits = {};
  for (const [tool, extra] of Object.entries(HANDED_OFF)) {
    log(`· ${tool} (in place; its report is handed to the gate) …`);
    const r = assay([tool, repoDir, ...extra, '--out', join(handoffDir, handoffReport(tool))]);
    const output = String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join('\n');
    writeFileSync(join(handoffDir, handoffStatus(tool)), JSON.stringify({ tool, exit: r.status, output }) + '\n');
    log(`  ${r.status != null && HANDOFF_OK_EXITS.includes(r.status) ? '✓' : '✗'} ${tool} exited ${r.status == null ? '(no exit code — process error)' : r.status}`);
    exits[tool] = r.status;
  }
  return { exits };
}
function ingestHandoff(tool, handoffDir, outDir, log) {
  log(`· ${tool} — from the target step's handoff (${handoffStatus(tool)}) …`);
  let status;
  try { status = JSON.parse(readFileSync(join(handoffDir, handoffStatus(tool)), 'utf8')); }
  catch (e) {
    const reason = `the target step handed no readable ${tool} result forward (${e.message.split('\n')[0]})`;
    log(`  ✗ ${tool} failed: ${reason}`);
    return { status: 'failed', reason };
  }
  const exit = Number.isInteger(status && status.exit) ? status.exit : null;
  return ingestInstrumentRaw({ tool, exit, output: status && status.output, rawFile: join(handoffDir, handoffReport(tool)), okExits: HANDOFF_OK_EXITS, outDir, log });
}

// the reason a `start` run gives for a judgment scanner it never runs, naming
// the command that records it once its report is ingested or reviewed. The run's
// own path stays out of it: the reason is printed in every view that names what
// was not measured, and a local path describes the machine, not the run.
const pendingReasonFor = (_outArg) => (id) =>
  `not yet run: a steward session runs it; ingesting its report records it ran (${id}: node assay.mjs record <run> ${id} ran)`;
const GITLEAKS_ABSENT_HERE = 'gitleaks binary not on PATH where this run was drawn';
const NO_TARGET_REASON = 'not yet run: ingesting its report records it ran';
const NO_EXEC_REASON = "not run: fresh-clone runs the target's own install, lifecycle scripts and tests on this machine; re-run start with --allow-exec in a disposable container or VM, or ingest a fresh-clone report drawn there";
// fresh-clone clones the target's committed head, so under --allow-exec a target
// that is not its own repository's top level (an exported tree, or a subdirectory
// of another checkout — `git clone` refuses both) is recorded skipped with this
// reason before anything runs, never failed with git's own clone error (#88).
const NOT_A_REPO_REASON = "not run: target is not a git repository; fresh-clone needs one (it clones the target's committed head) — run start against the repository's own checkout, or ingest a fresh-clone report drawn from one";
function isRepoTopLevel(dir) {
  const top = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return top.status === 0 && realpathSync(String(top.stdout).trim()) === realpathSync(dir);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) runCli();

function runCli() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outArg = outIdx > -1 ? args[outIdx + 1] : null;
  const flagIdx = new Set(outIdx > -1 ? [outIdx, outIdx + 1] : []);
  const target = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  if (!outArg) {
    console.error('usage: node assay.mjs start --out <run> [<target>] [--allow-exec]');
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
    const freshCloneSkipReason = !args.includes('--allow-exec') ? NO_EXEC_REASON : isRepoTopLevel(repoDir) ? null : NOT_A_REPO_REASON;
    rows = drawOfflineMap({ repoDir, outDir, pendingReason: pendingReasonFor(outArg), gitleaksAbsentReason: GITLEAKS_ABSENT_HERE, freshCloneSkipReason, structureScanNoExec: !args.includes('--allow-exec') }, log);
  }
  // Every OTHER adopted scanner (today: none beyond the seven drawOfflineMap
  // already covers; a future adapter falls here automatically) is recorded
  // skipped — never silently coverage-by-omission.
  for (const id of Object.keys(adopted)) {
    if (!rows[id]) rows[id] = { status: 'skipped', reason: target ? pendingReasonFor(outArg)(id) : NO_TARGET_REASON };
  }

  writeFileSync(mPath, toScannersYaml(engineCommit(), rows, undefined, target ? resolve(target) : null));

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
