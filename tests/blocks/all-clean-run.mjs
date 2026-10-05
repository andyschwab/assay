// ── an all-clean run compiles (measure/compile must never crash on zero findings) ──
// Every instrument ran, every pass file is the explicit empty list, and a run
// manifest records it — this is a real, valid measurement (CLAUDE.md rule 3: a
// clean run with an explicit run record is a valid measurement), not the truly
// empty "no findings, no manifest" case measure.mjs still refuses.
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from '../../map/project.mjs';
import { loadYardstick, measureRun, projectRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'all-clean-run';

export async function run() {
  const fail = (m) => negFailures.push('all-clean-run: ' + m);
  const tmp = join(HERE, 'tmp-all-clean'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), [
    'engine: test', 'scanners:', '  repo-eval:', '    status: ran',
    '  deep-code-review:', '    status: skipped', '    reason: "not run for this test"',
    '  gitleaks:', '    status: ran', '  fresh-clone:', '    status: ran',
    '  dependency-scan:', '    status: ran',
    '  repo-census:', '    status: skipped', '    reason: "not run for this test"',
    '  structure-scan:', '    status: skipped', '    reason: "not run for this test"', '',
  ].join('\n'));
  for (const f of ['repo-eval', 'gitleaks', 'fresh-clone', 'dependency-scan']) writeFileSync(join(tmp, 'map', 'findings', `${f}.yaml`), '[]\n');
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`an all-clean run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
  // measure.mjs: zero findings + a manifest must measure, never throw "no findings"
  let rows = null;
  try { rows = measureRun({ findings: [], manifest: loadManifest(tmp), inputs: null, coverage: {} }, loadYardstick()); }
  catch (e) { fail(`measureRun over zero findings with a manifest must not throw (${e.message})`); }
  if (rows) {
    if (rows.find((r) => r.id === 'd-secrets-out-of-history')?.status !== 'met') fail('an instrument that ran clean with zero findings must still read met');
    if (rows.find((r) => r.id === 'd-accounts-enumerated')?.status !== 'not-measured') fail('a claim row must still read not-measured (zero findings changes nothing about claim rows)');
  }
  // the CLI path: `measure --write` and `compile` must not crash on this run either
  try { execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'measure', tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed over an all-clean run (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`compile must succeed over an all-clean run (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  if (!existsSync(join(tmp, 'INDEX.md')) || !existsSync(join(tmp, 'INTAKE.md')) || !existsSync(join(tmp, 'MAINTAIN.md'))) fail('compile must write INDEX/INTAKE/MAINTAIN even for an all-clean run');
  // the truly empty case (no findings AND no manifest) must still refuse — this
  // guard is narrowed, not removed
  let threw = false;
  try { projectRun(join(HERE, 'tmp-does-not-exist')); } catch { threw = true; }
  if (!threw) fail('projectRun over a run with neither findings nor a manifest must still throw');
  rmSync(tmp, { recursive: true, force: true });
}
