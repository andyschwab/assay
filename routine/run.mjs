#!/usr/bin/env node
// run.mjs — the routine a stewarded repository runs on its own schedule
// (routine/README.md is the contract; this is the ONE driver both the GitHub
// Actions template and a steward's own terminal call, so CI and a local run take
// the identical path).
//
// Draws the map with the instruments assay runs offline on its own — repo-census,
// fresh-clone, dependency-scan; gitleaks only when its binary is present — records
// every adopted scanner that did NOT run as skipped or failed with a reason
// (CLAUDE.md rule 3: fail loud, never empty; nothing compiles without a reason),
// validates, compiles the package (folding in the repository's own packet/
// when it carries one), then ratchets the result against a committed baseline
// when one exists. repo-eval and deep-code-review are judgment-bearing, LLM-driven
// scanners; the routine never runs them — it records them skipped, always, with the
// same reason: a steward session runs those.
//
// Zero deps beyond Node itself: every step shells out to assay's OWN CLI
// (assay.mjs), the identical, tested path a human runs from the README — this
// file only sequences them and writes the run record.
//
// Usage: node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>] [--since <prev-run-dir>]
//   --baseline   ratchet the compiled run against this file. Omitted, the driver
//                looks for <repo-dir>/packet/baseline.yaml and uses it if present;
//                with neither, the gate is skipped and a warning is printed —
//                never silence (routine/README.md).
//   --since      fold a previous run's SINCE view into the compile (views/README.md).
//                No default: the workflow decides which prior run, if any, it has.
// A repository's own packet/manifest.yaml (owner/PACKET.md), when present at
// <repo-dir>/packet/manifest.yaml, is folded into the measurement automatically.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isMain } from '../map/doctrine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));       // routine/
const ASSAY_ROOT = join(HERE, '..');
const ASSAY_CLI = join(ASSAY_ROOT, 'assay.mjs');

function assay(args) {
  return spawnSync(process.execPath, [ASSAY_CLI, ...args], { encoding: 'utf8' });
}
function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}
function engineCommit() {
  if (process.env.ASSAY_REF) return process.env.ASSAY_REF;
  const r = spawnSync('git', ['-C', ASSAY_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : 'unknown';
}

// One instrument step, run through assay's own CLI: `node assay.mjs <cmd> <repoDir>
// --out <raw>`, then `node assay.mjs ingest <outDir> --tool <tool> --raw <raw> --exit <code>`
// when the exit is in the tool's documented success set (map/scanners/CONTRACT.md);
// anything else (a crash) is recorded FAILED, with the tool's own stderr as the
// reason — the routine keeps going, never crashing the whole run over one instrument.
function runAssayInstrument({ tool, cmd, cliArgs, okExits, outDir, log }) {
  const rawFile = join(tmpdir(), `assay-routine-${tool}-${process.pid}.json`);
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
// when present; when it is not, skip it with the reason (CONTRACT.md §3a: an
// adopted instrument may be absent from an environment, and its absence must be
// RECORDED, never silently read as clean).
function runGitleaks(repoDir, outDir, log) {
  if (!which('gitleaks')) {
    log('· gitleaks — binary not found on PATH, skipped');
    return { status: 'skipped', reason: 'gitleaks binary not on PATH in the routine\'s runner' };
  }
  const rawFile = join(tmpdir(), `assay-routine-gitleaks-${process.pid}.json`);
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
export function toScannersYaml(engine, rows) {
  const L = ['# scanners.yaml — GENERATED by routine/run.mjs. The routine\'s own run record (SCHEMA.md §5a).', `engine: ${engine}`, 'scanners:'];
  for (const [id, r] of Object.entries(rows)) {
    L.push(`  ${id}:`, `    status: ${r.status}`);
    if (r.reason) L.push(`    reason: ${q(r.reason)}`);
  }
  return L.join('\n') + '\n';
}

const NOT_RUN_BY_ROUTINE = 'not run by the routine; a steward session runs them';

// runRoutine — the pure sequencing (spawns child processes; no process.exit of its
// own), so it is both the CLI's body and the thing tests/regression.mjs calls
// directly. Returns { ok, exitCode, log: [lines] }.
export function runRoutine({ repoDir, outDir, baseline, since, packet } = {}, log = () => {}) {
  const lines = [];
  const say = (s) => { lines.push(s); log(s); };
  repoDir = resolve(repoDir);
  outDir = resolve(outDir);
  mkdirSync(join(outDir, 'map'), { recursive: true });

  const scanners = {
    'repo-eval': { status: 'skipped', reason: NOT_RUN_BY_ROUTINE },
    'deep-code-review': { status: 'skipped', reason: NOT_RUN_BY_ROUTINE },
  };
  scanners['repo-census'] = runAssayInstrument({ tool: 'repo-census', cmd: 'repo-census', cliArgs: [repoDir], okExits: [0, 1], outDir, log: say });
  scanners['fresh-clone'] = runAssayInstrument({ tool: 'fresh-clone', cmd: 'fresh-clone', cliArgs: [repoDir, '--no-clone'], okExits: [0, 1], outDir, log: say });
  scanners['dependency-scan'] = runAssayInstrument({ tool: 'dependency-scan', cmd: 'dependency-scan', cliArgs: [repoDir], okExits: [0, 1], outDir, log: say });
  scanners['gitleaks'] = runGitleaks(repoDir, outDir, say);

  writeFileSync(join(outDir, 'map', 'scanners.yaml'), toScannersYaml(engineCommit(), scanners));

  say('· validate …');
  const val = assay(['validate', outDir, '--target', repoDir]);
  if (val.status !== 0) {
    say(`✗ validate failed:\n${val.stdout}${val.stderr}`);
    return { ok: false, exitCode: 1, log: lines };
  }

  const packetDir = packet || join(repoDir, 'packet');
  const hasPacket = existsSync(join(packetDir, 'manifest.yaml'));
  const compileArgs = [outDir];
  if (hasPacket) compileArgs.push('--packet', packetDir);
  if (since) compileArgs.push('--since', resolve(since));
  say(`· compile ${hasPacket ? '(with packet) ' : ''}${since ? '(with since) ' : ''}…`);
  const comp = assay(['compile', ...compileArgs]);
  say(comp.stdout || '');
  if (comp.status !== 0) {
    say(`✗ compile failed:\n${comp.stderr}`);
    return { ok: false, exitCode: 1, log: lines };
  }

  const baselineFile = baseline || (existsSync(join(packetDir, 'baseline.yaml')) ? join(packetDir, 'baseline.yaml') : null);
  if (!baselineFile) {
    say('⚠ no packet/baseline.yaml committed yet — the ratchet gate is skipped. A steward accepts the first');
    say('  run and commits one (routine/README.md) to turn this warning into a real no-regression gate.');
    return { ok: true, exitCode: 0, log: lines };
  }
  say(`· ratchet --baseline ${baselineFile} …`);
  const rat = assay(['ratchet', outDir, '--baseline', resolve(baselineFile)]);
  say(rat.stdout || '');
  if (rat.status !== 0) {
    say(rat.stderr || '');
    say('✗ ratchet failed — a held requirement regressed or dropped off the measured scale.');
    return { ok: false, exitCode: 1, log: lines };
  }
  return { ok: true, exitCode: 0, log: lines };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const flagIdx = new Set();
  ['--out', '--baseline', '--since', '--packet'].forEach((f) => { const i = args.indexOf(f); if (i > -1) { flagIdx.add(i); flagIdx.add(i + 1); } });
  const repoDir = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  const outDir = flag('--out');
  if (!repoDir || !outDir) {
    console.error('usage: node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>] [--since <prev-run-dir>] [--packet <dir>]');
    process.exit(2);
  }
  const { ok, exitCode } = runRoutine({ repoDir, outDir, baseline: flag('--baseline'), since: flag('--since'), packet: flag('--packet') }, (l) => console.log(l));
  process.exit(ok ? 0 : exitCode);
}
