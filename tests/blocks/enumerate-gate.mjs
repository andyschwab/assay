// ── enumerate coverage-gate invariants (self-reference skip + declared-harness exclude) ─
// The gate must flag uncovered PRODUCT surface, and must NOT flag (a) the run's own
// artifacts when the run lives with its target (runs/**, SCHEMA §5), nor (b) a dir the
// analyst declares a harness via --exclude. Exclusion is opt-in, never a default.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-gate';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-gate: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'target');
  const run = join(fx, 'runs', 'r-2026-01-01');
  const gapsFor = (extra) => {
    // gaps present ⇒ non-zero exit even in --json mode (the exit IS the verdict);
    // the payload is still on stdout either way.
    let out;
    try { out = execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--run', run, ...extra, '--json'], { stdio: 'pipe' }).toString(); }
    catch (e) { out = String(e.stdout || ''); }
    return JSON.parse(out).coverageGaps.map((g) => g.file);
  };
  const plain = gapsFor([]);
  if (!plain.includes('deploy/prod.yaml')) fail('a gateable, uncovered product-surface member must be a coverage gap');
  if (plain.some((f) => f && /(^|\/)runs\//.test(f))) fail('a member inside a run that lives with its target (runs/**) must be recall-only, never a gate gap (self-reference)');
  if (!plain.includes('harness/bench.yaml')) fail('without --exclude, a member in a non-excluded dir must still be a gap (exclusion is opt-in, not default)');
  const excluded = gapsFor(['--exclude', 'harness']);
  if (!excluded.includes('deploy/prod.yaml')) fail('--exclude must not drop product surface outside the excluded dir');
  if (excluded.includes('harness/bench.yaml')) fail('--exclude <dir> must drop a declared-harness member from the gate');
  // exit-code honesty: --json must exit non-zero when gaps exist (a CI wiring
  // that checks only the exit code must never read green over uncovered surface)
  let gateExit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--run', run, '--json'], { stdio: 'pipe' }); }
  catch (e) { gateExit = e.status; }
  if (gateExit !== 1) fail(`--json with coverage gaps must exit 1 (got ${gateExit})`);
  let vExit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'negative', 'bad-dimension'), '--json'], { stdio: 'pipe' }); }
  catch (e) { vExit = e.status; }
  if (vExit !== 1) fail(`validate --json over a red base must exit 1 (got ${vExit})`);

  // (#53, F-1211) a target that is not a directory, or that yields no files, is not a
  // tree with no gaps: walk() returned [] on a readdir error, so a typo read green
  for (const [what, t] of [['a nonexistent target', join(HERE, 'tmp-no-such-target')], ['a file as the target', join(fx, 'agent.mjs')]]) {
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), t, '--run', run, '--json'], { encoding: 'utf8' });
    if (r.status !== 2) fail(`enumerate over ${what} must exit 2 (got ${r.status}: ${String(r.stdout).slice(0, 80)})`);
  }
  // a citation covers a member by exact path or by a directory on a segment boundary —
  // never by string prefix (`d:1` cleared deploy/prod.yaml) and never by `.` or `./`
  // (repo-census's `.:1` cleared every member under a dot-directory)
  const tmp = join(HERE, 'tmp-enumerate-cover'); rmSync(tmp, { recursive: true, force: true });
  cpSync(fx, join(tmp, 'target'), { recursive: true });
  mkdirSync(join(tmp, 'target', '.ci'), { recursive: true });
  copyFileSync(join(fx, 'deploy', 'prod.yaml'), join(tmp, 'target', '.ci', 'prod.yaml'));
  const tRun = join(tmp, 'target', 'runs', 'r-2026-01-01');
  const gapsCiting = (evidence) => {
    writeFileSync(join(tRun, 'map', 'findings', 'y.yaml'), `- id: F-002\n  source: repo-census\n  evidence: ${evidence}\n`);
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), join(tmp, 'target'), '--run', tRun, '--json'], { encoding: 'utf8' });
    try { return JSON.parse(r.stdout).coverageGaps.map((g) => g.file); } catch { return [`unparseable output (exit ${r.status}): ${String(r.stderr).slice(0, 120)}`]; }
  };
  const dot = gapsCiting('[.:1]');
  if (!dot.includes('.ci/prod.yaml') || !dot.includes('deploy/prod.yaml')) fail(`a ".:1" citation must cover nothing (gaps: ${dot.join(', ')})`);
  if (!gapsCiting('[./:1]').includes('.ci/prod.yaml')) fail('a "./:1" citation must cover nothing');
  if (!gapsCiting('[d:1]').includes('deploy/prod.yaml')) fail('a citation "d" must not cover deploy/prod.yaml by string prefix');
  if (gapsCiting('[deploy:1]').includes('deploy/prod.yaml')) fail('a citation of the directory "deploy" must cover deploy/prod.yaml');
  if (gapsCiting('[./deploy/prod.yaml:3]').includes('deploy/prod.yaml')) fail('a "./"-prefixed citation of the exact file must cover it');
  if (gapsCiting('["deploy/prod.yaml:3", ".ci/prod.yaml:1"]').length !== 1) fail('quoted flow-list citations (as ingest writes them) must each cover their file');
  rmSync(tmp, { recursive: true, force: true });
}
