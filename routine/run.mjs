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
//                The packet is read from the base ref the same way (`git show
//                <ref>:packet/manifest.yaml`, unless --packet names one): a change
//                that edits a claim is named, and measured against the base's
//                claims. A ref that does not resolve to a commit exits 1 with the
//                reason (gate: not-run); only a resolvable ref with no
//                packet/baseline.yaml skips the gate.
//   --since      fold a previous run's SINCE view into the compile (views/README.md).
//                No default: the workflow decides which prior run, if any, it has.
//   --handoff    the gate step of the two-job routine (routine/README.md "Two
//                jobs"): fresh-clone is not run here; the report the target step
//                handed forward in this directory is ingested instead.
//
//        node routine/run.mjs <repo-dir> --target-steps --handoff <dir>
//   the target step: runs fresh-clone in place (the target's own install and
//   scripts) and writes only its raw report and exit into <dir> — no validate,
//   compile or ratchet, which run in the gate step from a checkout that never
//   executed the target.
// A repository's own packet/manifest.yaml (owner/PACKET.md), when present at
// <repo-dir>/packet/manifest.yaml, is folded into the measurement automatically.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../map/doctrine.mjs';
import { catGitFile, resolveGitRef } from '../yardstick/ratchet.mjs';
import { gitHead, gitRemote } from '../map/repo-census.mjs';
import { loadContradictions } from '../yardstick/measure.mjs';
import { routinePath, scannersPath, mapDir } from '../lib/run-layout.mjs';
import { drawOfflineMap, runAssayInstrument, runGitleaks, toScannersYaml as toScannersYamlBase, engineCommit, writeFreshCloneHandoff } from '../map/start.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));       // routine/
const ASSAY_ROOT = join(HERE, '..');
const ASSAY_CLI = join(ASSAY_ROOT, 'assay.mjs');

function assay(args) {
  return spawnSync(process.execPath, [ASSAY_CLI, ...args], { encoding: 'utf8' });
}
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;   // used by toRoutineYaml below

// The instrument sequencing itself (runAssayInstrument, runGitleaks,
// drawOfflineMap) and the run-record writer (toScannersYaml) now live in
// map/start.mjs — the same code `assay start` uses for a person starting a
// run by hand. Re-exported here so nothing that imported them from this file
// breaks; the routine's own header line keeps its exact original wording so a
// routine-drawn scanners.yaml stays byte-identical to before the move.
export { runAssayInstrument, runGitleaks, engineCommit };
export function toScannersYaml(engine, rows) {
  return toScannersYamlBase(engine, rows, '# scanners.yaml — GENERATED by routine/run.mjs. The routine\'s own run record (SCHEMA.md §5a).');
}

const NOT_RUN_BY_ROUTINE = 'not run by the routine; a steward session runs them';
const GITLEAKS_ABSENT_IN_ROUTINE = 'gitleaks binary not on PATH in the routine\'s runner';

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
// A failure reason is often a whole command's output (validate, compile) or an error. The
// record keeps it to one readable line: assay's YAML reader (lib/yaml-min.mjs) takes no
// multi-line or backslash-escaped scalars, and a fleet page needs the gist, not the log
// (the full output stays in the CI log and the run's own files).
export function oneLineReason(s, max = 400) {
  const flat = String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '').replace(/\\/g, '/').replace(/\s*\r?\n\s*/g, ' · ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
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
  if (rec.failures.length) { L.push('failures:'); for (const f of rec.failures) L.push(`  - ${q(oneLineReason(f))}`); }
  else L.push('failures: []');
  L.push(`contradictions: ${rec.contradictions}`);
  L.push(`exit: ${rec.exit}`);
  return L.join('\n') + '\n';
}

// runTargetSteps — the target step of the two-job routine: the ONLY part that
// executes the repository's own code. It runs fresh-clone in place and hands its
// raw report forward; it never validates, compiles or ratchets. Exit 0 once the
// handoff is written, whatever fresh-clone found — the gate step records that.
export function runTargetSteps({ repoDir, handoffDir } = /** @type {any} */ ({}), log = /** @type {(msg: string) => void} */ (() => {})) {
  const lines = [];
  const say = (s) => { lines.push(s); log(s); };
  writeFreshCloneHandoff({ repoDir: resolve(repoDir), handoffDir: resolve(handoffDir) }, say);
  return { ok: true, exitCode: 0, log: lines };
}

// runRoutine — the pure sequencing (spawns child processes; no process.exit of its
// own), so it is both the CLI's body and the thing tests/regression.mjs calls
// directly. Returns { ok, exitCode, log: [lines] }.
export function runRoutine({ repoDir, outDir, baseline, since, packet, baseRef, handoff } = /** @type {any} */ ({}), log = /** @type {(msg: string) => void} */ (() => {})) {
  const lines = [];
  const say = (s) => { lines.push(s); log(s); };
  repoDir = resolve(repoDir);
  outDir = resolve(outDir);
  mkdirSync(mapDir(outDir), { recursive: true });

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
  function finish({ ok, exitCode, gate, baselineInfo = /** @type {{ source: string, where?: string }} */ ({ source: 'none' }), failures = [] }) {
    let contradictions = 0;
    try { contradictions = loadContradictions(outDir).length; } catch { /* no readable yardstick.yaml yet */ }
    const record = { date: startDate, repository, commit, engine, trigger, baseline: baselineInfo, gate, failures, contradictions, exit: exitCode };
    try { writeFileSync(routinePath(outDir), toRoutineYaml(record)); }
    catch (e) { say(`⚠ could not write routine.yaml: ${e.message}`); }
    return { ok, exitCode, log: lines };
  }
  // ratchet exit 2: it could not evaluate (an unreadable baseline, a missing ref) — that is
  // not a regression, so the gate reads not-run with ratchet's own reason, never failed
  function couldNotEvaluate(rat, baselineInfo) {
    say(rat.stderr || '');
    say('✗ ratchet could not evaluate the gate (above) — nothing was held against the baseline.');
    return finish({ ok: false, exitCode: 1, gate: 'not-run', baselineInfo, failures: [String(rat.stderr || 'ratchet exited 2').trim()] });
  }

  // Everything from here down is wrapped so that if the routine dies unexpectedly
  // — before it ever reaches a compiled measurement to gate on — routine.yaml
  // still gets written, with gate: not-run and the reason, rather than the run
  // directory carrying no record at all of what happened.
  try {
  // The routine's own repoDir is already a fresh CI checkout (or --base-ref's
  // working tree), so fresh-clone runs with --no-clone (in place) — exactly as
  // before this sequencing moved to map/start.mjs (drawOfflineMap's
  // freshCloneNoClone param; `assay start`, run against a person's own working
  // tree, leaves it false and lets fresh-clone clone repoDir itself instead).
  // With a handoff (the two-job template's gate step), fresh-clone already ran in
  // the target step and this step only ingests its report — it never executes the
  // target (routine/README.md "Two jobs").
  const scanners = drawOfflineMap({ repoDir, outDir, pendingReason: NOT_RUN_BY_ROUTINE, gitleaksAbsentReason: GITLEAKS_ABSENT_IN_ROUTINE, freshCloneNoClone: true, freshCloneHandoff: handoff ? resolve(handoff) : null }, say);

  writeFileSync(scannersPath(outDir), toScannersYaml(engineCommit(), scanners));

  say('· validate …');
  const val = assay(['validate', outDir, '--target', repoDir]);
  if (val.status !== 0) {
    const reason = `validate failed:\n${val.stdout}${val.stderr}`;
    say(`✗ ${reason}`);
    return finish({ ok: false, exitCode: 1, gate: 'not-run', failures: [reason] });
  }

  // A base ref must name a commit before anything is read from it: a mistyped or
  // unfetched ref, a missing git or a broken repository is a gate that could not
  // run (exit 1, the reason recorded), never "no baseline yet" (#48).
  if (baseRef) {
    const resolved = resolveGitRef(repoDir, baseRef);
    if (!resolved.ok) {
      const reason = `the base ref ${baseRef} could not be read: ${resolved.error}`;
      say(`✗ ${reason} — nothing was held against the baseline.`);
      return finish({ ok: false, exitCode: 1, gate: 'not-run', baselineInfo: { source: 'ref', where: baseRef }, failures: [reason] });
    }
  }

  // On a pull request the packet, like the baseline, is read from the base ref:
  // a change that edits its own claims would otherwise move the measurement its
  // gate holds (#48). A --packet given by name is used as given.
  let packetDir = packet || join(repoDir, 'packet');
  let basePacketTmp = null;
  if (baseRef && !packet) {
    const MANIFEST_REL_PATH = 'packet/manifest.yaml';
    const workingManifest = join(repoDir, MANIFEST_REL_PATH);
    const workingContent = existsSync(workingManifest) ? readFileSync(workingManifest, 'utf8') : null;
    const baseManifest = catGitFile(repoDir, baseRef, MANIFEST_REL_PATH);
    const baseContent = baseManifest.ok ? baseManifest.content : null;
    if (workingContent !== baseContent) {
      say(`⚠ this change edits the packet (${MANIFEST_REL_PATH}); the measurement reads ${baseRef}'s copy;`);
      say('  a steward accepts new claims in their own reviewed change.');
    }
    packetDir = basePacketTmp = mkdtempSync(join(tmpdir(), 'assay-routine-base-packet-'));
    if (baseContent !== null) writeFileSync(join(packetDir, 'manifest.yaml'), baseContent);
  }
  const hasPacket = existsSync(join(packetDir, 'manifest.yaml'));
  const compileArgs = [outDir, '--target', repoDir];
  if (hasPacket) compileArgs.push('--packet', packetDir);
  if (since) compileArgs.push('--since', resolve(since));
  say(`· compile ${hasPacket ? '(with packet) ' : ''}${since ? '(with since) ' : ''}…`);
  const comp = assay(['compile', ...compileArgs]);
  if (basePacketTmp) rmSync(basePacketTmp, { recursive: true, force: true });
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
    if (rat.status === 2) return couldNotEvaluate(rat, baselineInfo);
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
  if (rat.status === 2) return couldNotEvaluate(rat, baselineInfo);
  if (rat.status !== 0) {
    say(rat.stderr || '');
    say('✗ ratchet failed — a held requirement regressed or dropped off the measured scale.');
    return finish({ ok: false, exitCode: 1, gate: 'failed', baselineInfo, failures: ratchetFailureLines(rat.stderr) });
  }
  return finish({ ok: true, exitCode: 0, gate: 'held', baselineInfo });
  } catch (e) {
    const reason = `routine crashed before compiling a measurement: ${e && e.message ? e.message : String(e)}`;
    if (e && e.stack) say(e.stack);
    say(`✗ ${reason}`);
    return finish({ ok: false, exitCode: 1, gate: 'not-run', failures: [reason] });
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const flagIdx = new Set();
  ['--out', '--baseline', '--base-ref', '--since', '--packet', '--handoff'].forEach((f) => { const i = args.indexOf(f); if (i > -1) { flagIdx.add(i); flagIdx.add(i + 1); } });
  const repoDir = args.find((a, i) => !flagIdx.has(i) && !a.startsWith('--'));
  const outDir = flag('--out');
  const handoff = flag('--handoff');
  if (args.includes('--target-steps')) {
    if (!repoDir || !handoff) { console.error('usage: node routine/run.mjs <repo-dir> --target-steps --handoff <dir>'); process.exit(2); }
    process.exit(runTargetSteps({ repoDir, handoffDir: handoff }, (l) => console.log(l)).exitCode);
  }
  if (!repoDir || !outDir) {
    console.error('usage: node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>] [--base-ref <git-ref>] [--since <prev-run-dir>] [--packet <dir>] [--handoff <dir>]');
    process.exit(2);
  }
  const { ok, exitCode } = runRoutine({ repoDir, outDir, baseline: flag('--baseline'), baseRef: flag('--base-ref'), since: flag('--since'), packet: flag('--packet'), handoff }, (l) => console.log(l));
  process.exit(ok ? 0 : exitCode);
}
