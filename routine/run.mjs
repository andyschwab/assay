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
// Usage: node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>]
//                              [--base-ref <git-ref>] [--since <prev-run-dir>]
//   --baseline   ratchet the compiled run against this file. Omitted, the driver
//                looks for <repo-dir>/packet/baseline.yaml and uses it if present;
//                with neither, the gate is skipped and a warning is printed —
//                never silence (routine/README.md). Ignored when --base-ref is
//                given (a pull request is never graded against its own working
//                tree's copy — see --base-ref below).
//   --base-ref   this run is measuring a PULL REQUEST against this base git ref
//                (e.g. `origin/main`) in <repo-dir> — the workflow template
//                passes this on `pull_request`, after fetching the base branch.
//                With it, the baseline comes from the base ref's own
//                packet/baseline.yaml (`git show <ref>:packet/baseline.yaml`),
//                NEVER the working tree: the change under review could
//                otherwise edit the very file its own gate holds against
//                (routine/README.md "The baseline: accepted by a named
//                steward"). When the working tree's packet/baseline.yaml
//                differs from the base ref's copy, that is printed plainly —
//                a steward accepts a new baseline in its own reviewed change,
//                never silently through the pull request it would gate. With
//                no --base-ref (schedule / workflow_dispatch), the baseline is
//                read from the working tree, exactly as before.
//   --since      fold a previous run's SINCE view into the compile (views/README.md).
//                No default: the workflow decides which prior run, if any, it has.
// A repository's own packet/manifest.yaml (owner/PACKET.md), when present at
// <repo-dir>/packet/manifest.yaml, is folded into the measurement automatically.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isMain } from '../map/doctrine.mjs';
import { catGitFile } from '../yardstick/ratchet.mjs';
import { gitHead, gitRemote } from '../map/repo-census.mjs';
import { loadContradictions } from '../yardstick/measure.mjs';
import { routinePath } from '../lib/run-layout.mjs';

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

// GITHUB_EVENT_NAME is what Actions sets for the trigger that fired the workflow
// (schedule | push | pull_request | workflow_dispatch, …) — a steward's own
// terminal run sets none of that, so it reads 'local' (routine/README.md).
function triggerName() {
  const ev = String(process.env.GITHUB_EVENT_NAME || '').trim();
  return ev || 'local';
}

// The ratchet subprocess's own stderr already carries evaluateRatchet's failure
// lines verbatim (ratchet.mjs prints each with a "  ✗ " prefix, one per baseline
// requirement or contradiction) — scraping them keeps routine.yaml's `failures`
// exactly what a human reading the CI log would have seen, without re-loading
// the baseline and re-running evaluateRatchet a second time over the same
// inputs. The one line excluded is ratchet's own summary ("✗ ratchet: N
// requirement(s)/contradiction(s) …"), which is a count, not a failure line.
export function ratchetFailureLines(stderr) {
  return String(stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('✗ ') && !l.startsWith('✗ ratchet:'))
    .map((l) => l.slice(2));
}

// routine.yaml — the run's own record of what the routine did and whether its
// gate held (routine/README.md), so a fleet collector reading only the uploaded
// run artifact knows the outcome without the CI logs.
export function toRoutineYaml(rec) {
  const L = [
    '# routine.yaml — written by routine/run.mjs; the run\'s own record of what the routine did.',
    'routine: 1',
    `date: ${q(rec.date)}`,
  ];
  if (rec.repository) L.push(`repository: ${q(rec.repository)}`);
  L.push(`commit: ${q(rec.commit || '')}`);
  L.push(`engine: ${q(rec.engine || '')}`);
  L.push(`trigger: ${q(rec.trigger)}`);
  L.push('baseline:', `  source: ${rec.baseline.source}`);
  if (rec.baseline.where) L.push(`  where: ${q(rec.baseline.where)}`);
  L.push(`gate: ${rec.gate}`);
  if (rec.failures.length) { L.push('failures:'); for (const f of rec.failures) L.push(`  - ${q(f)}`); }
  else L.push('failures: []');
  L.push(`contradictions: ${rec.contradictions}`);
  L.push(`exit: ${rec.exit}`);
  return L.join('\n') + '\n';
}

// runRoutine — the pure sequencing (spawns child processes; no process.exit of its
// own), so it is both the CLI's body and the thing tests/regression.mjs calls
// directly. Returns { ok, exitCode, log: [lines] }.
export function runRoutine({ repoDir, outDir, baseline, since, packet, baseRef } = {}, log = () => {}) {
  const lines = [];
  const say = (s) => { lines.push(s); log(s); };
  repoDir = resolve(repoDir);
  outDir = resolve(outDir);
  mkdirSync(join(outDir, 'map'), { recursive: true });

  const startDate = new Date().toISOString();
  const engine = engineCommit();
  const commit = gitHead(repoDir);
  const repository = gitRemote(repoDir);
  const trigger = triggerName();

  // finish() writes routine.yaml as the LAST step before every return — including
  // the failure and skip paths — so a run artifact always says what happened,
  // never only a job that exited green or red in CI (the goal this record exists
  // for). baselineInfo defaults to "none" for the paths that never got far enough
  // to resolve one (validate/compile failing before the baseline is even looked at).
  function finish({ ok, exitCode, gate, baselineInfo = { source: 'none' }, failures = [] }) {
    let contradictions = 0;
    try { contradictions = loadContradictions(outDir).length; } catch { /* no readable yardstick.yaml yet */ }
    const record = { date: startDate, repository, commit, engine, trigger, baseline: baselineInfo, gate, failures, contradictions, exit: exitCode };
    try { writeFileSync(routinePath(outDir), toRoutineYaml(record)); }
    catch (e) { say(`⚠ could not write routine.yaml: ${e.message}`); }
    return { ok, exitCode, log: lines };
  }

  // Everything from here down is wrapped so that if the routine dies unexpectedly
  // — before it ever reaches a compiled measurement to gate on — routine.yaml
  // still gets written, with gate: not-run and the reason, rather than the run
  // directory carrying no record at all of what happened.
  try {
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
    const reason = `validate failed:\n${val.stdout}${val.stderr}`;
    say(`✗ ${reason}`);
    return finish({ ok: false, exitCode: 1, gate: 'not-run', failures: [reason] });
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
    const reason = `compile failed:\n${comp.stderr}`;
    say(`✗ ${reason}`);
    return finish({ ok: false, exitCode: 1, gate: 'not-run', failures: [reason] });
  }

  // A pull request (a --base-ref was given) is graded against the BASE REF's own
  // packet/baseline.yaml, never the working tree's copy — the change under
  // review could otherwise edit the very file its own gate holds against
  // (routine/README.md "The baseline: accepted by a named steward"). The
  // git-tracked path is always packet/baseline.yaml, relative to the repo root,
  // regardless of a --packet override (a packet kept elsewhere is not what git
  // show reads at a ref).
  if (baseRef) {
    const BASELINE_REL_PATH = 'packet/baseline.yaml';
    const workingFile = join(repoDir, BASELINE_REL_PATH);
    const workingContent = existsSync(workingFile) ? readFileSync(workingFile, 'utf8') : null;
    const baseGot = catGitFile(repoDir, baseRef, BASELINE_REL_PATH);
    const baseContent = baseGot.ok ? baseGot.content : null;
    if (workingContent !== baseContent) {
      say('⚠ this change edits the accepted baseline; the gate holds against the default branch\'s copy;');
      say('  a steward accepts a new baseline in its own reviewed change.');
    }
    if (!baseGot.ok) {
      say(`⚠ no packet/baseline.yaml at ${baseRef} yet — the ratchet gate is skipped. A steward accepts the first`);
      say('  run and commits one (routine/README.md) to turn this warning into a real no-regression gate.');
      return finish({ ok: true, exitCode: 0, gate: 'skipped', baselineInfo: { source: 'none' } });
    }
    say(`· ratchet --baseline-ref ${baseRef} --repo ${repoDir} …`);
    const rat = assay(['ratchet', outDir, '--baseline-ref', baseRef, '--repo', repoDir]);
    say(rat.stdout || '');
    const baselineInfo = { source: 'ref', where: baseRef };
    if (rat.status !== 0) {
      say(rat.stderr || '');
      say('✗ ratchet failed — a held requirement regressed or dropped off the measured scale.');
      return finish({ ok: false, exitCode: 1, gate: 'failed', baselineInfo, failures: ratchetFailureLines(rat.stderr) });
    }
    return finish({ ok: true, exitCode: 0, gate: 'held', baselineInfo });
  }

  const baselineFile = baseline || (existsSync(join(packetDir, 'baseline.yaml')) ? join(packetDir, 'baseline.yaml') : null);
  if (!baselineFile) {
    say('⚠ no packet/baseline.yaml committed yet — the ratchet gate is skipped. A steward accepts the first');
    say('  run and commits one (routine/README.md) to turn this warning into a real no-regression gate.');
    return finish({ ok: true, exitCode: 0, gate: 'skipped', baselineInfo: { source: 'none' } });
  }
  say(`· ratchet --baseline ${baselineFile} …`);
  const resolvedBaseline = resolve(baselineFile);
  const rat = assay(['ratchet', outDir, '--baseline', resolvedBaseline]);
  say(rat.stdout || '');
  // recorded relative to the repository when it lives inside it: an absolute path would only
  // describe the machine the routine ran on (a CI runner's workspace), not the repository
  const relBaseline = relative(repoDir, resolvedBaseline);
  const baselineInfo = { source: 'file', where: relBaseline && !relBaseline.startsWith('..') && !isAbsolute(relBaseline) ? relBaseline.split(sep).join('/') : resolvedBaseline };
  if (rat.status !== 0) {
    say(rat.stderr || '');
    say('✗ ratchet failed — a held requirement regressed or dropped off the measured scale.');
    return finish({ ok: false, exitCode: 1, gate: 'failed', baselineInfo, failures: ratchetFailureLines(rat.stderr) });
  }
  return finish({ ok: true, exitCode: 0, gate: 'held', baselineInfo });
  } catch (e) {
    const reason = `routine crashed before compiling a measurement: ${e && e.stack ? e.stack : String(e)}`;
    say(`✗ ${reason}`);
    return finish({ ok: false, exitCode: 1, gate: 'not-run', failures: [reason] });
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const flagIdx = new Set();
  ['--out', '--baseline', '--base-ref', '--since', '--packet'].forEach((f) => { const i = args.indexOf(f); if (i > -1) { flagIdx.add(i); flagIdx.add(i + 1); } });
  const repoDir = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  const outDir = flag('--out');
  if (!repoDir || !outDir) {
    console.error('usage: node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>] [--base-ref <git-ref>] [--since <prev-run-dir>] [--packet <dir>]');
    process.exit(2);
  }
  const { ok, exitCode } = runRoutine({ repoDir, outDir, baseline: flag('--baseline'), baseRef: flag('--base-ref'), since: flag('--since'), packet: flag('--packet') }, (l) => console.log(l));
  process.exit(ok ? 0 : exitCode);
}
