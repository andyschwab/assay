// ── ratchet: exit 0 / 1 / 2, --write-baseline, and the failure/summary lines ──
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadBaseline, loadYardstickDoc, evaluateRatchet, catGitFile } from '../../yardstick/ratchet.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'ratchet';

export async function run() {
  const fail = (m) => negFailures.push('ratchet: ' + m);
  const tmp = join(HERE, 'tmp-ratchet'); rmSync(tmp, { recursive: true, force: true });
  const runMet = join(tmp, 'met'), runRegressed = join(tmp, 'regressed'), runUnmet = join(tmp, 'unmet');
  // runMet: notesbox with gitleaks emptied — d-secrets-out-of-history reads MET.
  copyFixtureFindings('notesbox', runMet); copyFixtureScanners('notesbox', runMet);
  writeFileSync(join(runMet, 'map', 'findings', 'gitleaks.yaml'), '[]\n');
  // runRegressed: the same base, gitleaks restored — d-secrets-out-of-history reads UNMET again.
  copyFixtureFindings('notesbox', runRegressed); copyFixtureScanners('notesbox', runRegressed);
  // runUnmet: the plain fixture, unmet from the start (nothing to hold — never fails).
  copyFixtureFindings('notesbox', runUnmet); copyFixtureScanners('notesbox', runUnmet);
  for (const r of [runMet, runRegressed, runUnmet]) {
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), r, '--write'], { stdio: 'pipe' }); }
    catch (e) { fail(`measure --write must succeed on ${r} (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  }

  const baselineFile = join(tmp, 'baseline.yaml');
  let wbOut = '';
  try { wbOut = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runMet, '--write-baseline', baselineFile, '--by', 'qa-steward', '--commit', 'abc1234def'], { stdio: 'pipe' }).toString(); }
  catch (e) { fail(`--write-baseline with no --baseline must exit 0 (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  if (!existsSync(baselineFile)) fail('--write-baseline must write the file');
  let baseline = null;
  try { baseline = loadBaseline(baselineFile); } catch (e) { fail(`the written baseline must itself validate (${e.message})`); }
  if (baseline) {
    if (baseline.baseline !== 1) fail('baseline: format version must be 1');
    if (baseline.accepted?.by !== 'qa-steward' || baseline.accepted?.date !== new Date().toISOString().slice(0, 10)) fail('baseline: accepted.by/date must come from --by and today');
    if (baseline.commit !== 'abc1234def') fail('baseline: commit must come from --commit');
    const row = (baseline.requirements || []).find((r) => r.id === 'd-secrets-out-of-history');
    const runDoc = loadYardstickDoc(runMet);
    const runRow = runDoc.requirements.find((r) => r.id === 'd-secrets-out-of-history');
    if (!row || row.status !== runRow.status || row.basis !== (runRow.basis || 'run')) fail(`--write-baseline round-trip: baseline row for d-secrets-out-of-history must match the run's own yardstick.yaml (got ${JSON.stringify(row)} vs ${JSON.stringify(runRow)})`);
    if (row.status !== 'met') fail('the fixture setup is wrong: d-secrets-out-of-history must read met in runMet (gitleaks emptied) for this test to mean anything');
  }

  // exit 0: unchanged (still met) — held counted, no failures, the summary line names it.
  {
    let out = '', status = 0;
    try { out = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runMet, '--baseline', baselineFile], { stdio: 'pipe' }).toString(); }
    catch (e) { status = e.status ?? 1; out = String(e.stdout || ''); }
    if (status !== 0) fail(`ratchet against an unchanged met baseline must exit 0 (got ${status})`);
    if (!/held \d+, improved \d+/.test(out)) fail(`exit-0 output must carry a one-line "held N, improved M" summary (got: ${out.split('\n')[0]})`);
  }

  // exit 1: d-secrets-out-of-history regresses back to unmet — the failure line names
  // the requirement, its title, before -> after, and the current finding id.
  {
    let out = '', err = '', status = 0;
    try { out = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runRegressed, '--baseline', baselineFile], { stdio: 'pipe' }).toString(); }
    catch (e) { status = e.status ?? 1; err = String(e.stderr || ''); out = String(e.stdout || ''); }
    if (status !== 1) fail(`ratchet must exit 1 when a met/mixed baseline row regresses (got ${status})`);
    const line = err || out;
    if (!line.includes('d-secrets-out-of-history')) fail('the failure line must name the requirement id');
    if (!/No secret lives in the tree/.test(line)) fail('the failure line must name the requirement title');
    if (!/met\s*→\s*unmet/.test(line)) fail('the failure line must show before → after');
    if (!line.includes('F-700')) fail('the failure line must name the current finding id(s) behind the regression');
  }

  // a baseline row recorded unmet never fails, even against a run where it stays unmet.
  {
    const wb2 = join(tmp, 'baseline-unmet.yaml');
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runUnmet, '--write-baseline', wb2], { stdio: 'pipe' }); }
    catch (e) { fail(`--write-baseline on runUnmet must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    let status = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runUnmet, '--baseline', wb2], { stdio: 'pipe' }); }
    catch (e) { status = e.status ?? 1; }
    if (status !== 0) fail(`a baseline row recorded unmet must never fail the ratchet even when nothing changed (got exit ${status})`);
  }

  // exit 2: a missing/unreadable input is never 0.
  for (const [args, what] of [
    [[runMet, '--baseline', join(tmp, 'does-not-exist.yaml')], 'a missing baseline file'],
    [[join(tmp, 'no-such-run'), '--baseline', baselineFile], 'a missing run (no yardstick.yaml)'],
  ]) {
    let status = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), ...args], { stdio: 'pipe' }); }
    catch (e) { status = e.status ?? 1; }
    if (status !== 2) fail(`ratchet must exit 2 on ${what}, never 0 (got ${status})`);
  }

  // #48 (F-1224): a gate flag with no value is a bad input (exit 2), never "no baseline".
  for (const [args, what] of [
    [[runMet, '--baseline'], '--baseline with no value'],
    [[runMet, '--baseline-ref'], '--baseline-ref with no value'],
    [[runMet, '--baseline-ref', '--repo', ROOT], '--baseline-ref followed by another flag'],
    [[runMet, '--baseline', baselineFile, '--write-baseline'], '--write-baseline with no value'],
  ]) {
    let status = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), ...args], { stdio: 'pipe' }); }
    catch (e) { status = e.status ?? 1; }
    if (status !== 2) fail(`ratchet must exit 2 on ${what}, never read it as no baseline (got ${status})`);
  }
  // #48 (F-1224): --write-baseline never accepts a run that failed its own gate.
  {
    const wbRegressed = join(tmp, 'baseline-from-regressed.yaml');
    let status = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runRegressed, '--baseline', baselineFile, '--write-baseline', wbRegressed], { stdio: 'pipe' }); }
    catch (e) { status = e.status ?? 1; }
    if (status !== 1) fail(`a regressed run with --write-baseline must still exit 1 (got ${status})`);
    if (existsSync(wbRegressed)) fail('--write-baseline must refuse to write a baseline from a run that failed the ratchet');
  }
  // #48 (F-1223): a ref that reads as a git option is refused, never handed to git show.
  {
    // git show --output=<x>:packet/baseline.yaml writes <x>:packet/baseline.yaml when its folder exists
    const planted = join(tmp, 'written-by-git-option');
    const plantedFile = `${planted}:packet/baseline.yaml`;
    if (process.platform !== 'win32') mkdirSync(`${planted}:packet`, { recursive: true });
    const got = catGitFile(ROOT, `--output=${planted}`, 'packet/baseline.yaml');
    if (got.ok) fail('catGitFile must refuse a ref beginning with "-" (got ok)');
    if (existsSync(plantedFile)) fail('catGitFile must never let a ref beginning with "-" reach git as an option (a file was written)');
  }

  // the pure core directly, for the "absent from the current measurement" case
  // (a baseline requirement id the current run's yardstick no longer decides at all).
  {
    const bDoc = { baseline: 1, yardstick: 0, accepted: { date: '2026-01-01', by: 'steward' }, requirements: [{ id: 'd-does-not-exist-anymore', status: 'met', basis: 'run' }] };
    const cDoc = { version: 0, requirements: [{ id: 'd-secrets-out-of-history', status: 'met', basis: 'run', findings: [] }] };
    const { failures } = evaluateRatchet(bDoc, cDoc, (id) => id);
    if (!failures.length || !failures[0].includes('absent from this run')) fail('a baseline requirement absent from the current measurement must always fail, regardless of its recorded status');
  }

  rmSync(tmp, { recursive: true, force: true });
}
