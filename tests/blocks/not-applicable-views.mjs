// ── the not-applicable status: compare(), ratchet, and the views ────────────
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { classify } from '../../yardstick/compare.mjs';
import { evaluateRatchet } from '../../yardstick/ratchet.mjs';
import { viewPath as runViewPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'not-applicable-views';

export async function run() {
  const fail = (m) => negFailures.push('not-applicable-views: ' + m);
  // compare(): met -> not-applicable classifies off the ranked scale (no-longer-measured,
  // the existing label for "left the met/mixed/unmet scale") — never "improved", never
  // silently "unchanged"; the actual current status is what a caller renders.
  if (classify('met', 'not-applicable') !== 'no-longer-measured') fail(`met -> not-applicable must classify no-longer-measured (got ${classify('met', 'not-applicable')})`);
  if (classify('not-applicable', 'met') !== 'newly-measured') fail(`not-applicable -> met must classify newly-measured (got ${classify('not-applicable', 'met')})`);
  if (classify('not-applicable', 'not-applicable') !== 'unchanged') fail('not-applicable -> not-applicable must classify unchanged');
  // ratchet: met -> not-applicable is reported (changed), never a failure
  const baseline = { baseline: 1, yardstick: 0, accepted: { date: '2026-01-01', by: 'steward' }, requirements: [{ id: 'd-secrets-out-of-history', status: 'met', basis: 'run' }] };
  const currentNa = { version: 0, requirements: [{ id: 'd-secrets-out-of-history', status: 'not-applicable', basis: 'run', findings: [] }] };
  const rNa = evaluateRatchet(baseline, currentNa, (id) => id);
  if (rNa.failures.length) fail(`met -> not-applicable must never fail the ratchet (got ${JSON.stringify(rNa.failures)})`);
  if (rNa.changed.length !== 1 || rNa.changed[0].after !== 'not-applicable') fail(`met -> not-applicable must be reported in changed (got ${JSON.stringify(rNa.changed)})`);
  // a baseline row that WAS not-applicable, now anything else: reported, never a failure
  const baselineNa = { ...baseline, requirements: [{ id: 'd-secrets-out-of-history', status: 'not-applicable', basis: 'run' }] };
  const currentUnmet = { version: 0, requirements: [{ id: 'd-secrets-out-of-history', status: 'unmet', basis: 'run', findings: ['F-1'] }] };
  const rFromNa = evaluateRatchet(baselineNa, currentUnmet, (id) => id);
  if (rFromNa.failures.length) fail(`a baseline row that was not-applicable must never fail regardless of what it becomes (got ${JSON.stringify(rFromNa.failures)})`);
  // ...except an owner-decided row (#48, F-1204): the packet, not the map, can make a row
  // not-applicable, so a held owner claim moved to not-applicable is a regression, never a change.
  for (const held of ['met', 'mixed']) {
    const bOwner = { ...baseline, requirements: [{ id: 'd-contract-test-per-vendor', status: held, basis: 'owner' }] };
    const cOwnerNa = { version: 0, requirements: [{ id: 'd-contract-test-per-vendor', status: 'not-applicable', basis: 'owner', findings: [] }] };
    const rOwner = evaluateRatchet(bOwner, cOwnerNa, (id) => id);
    if (rOwner.failures.length !== 1 || !/d-contract-test-per-vendor/.test(rOwner.failures[0]) || !new RegExp(`${held}\\s*→\\s*not-applicable`).test(rOwner.failures[0])) fail(`a held owner claim (${held}) moved to not-applicable must fail the ratchet, naming before → after (got ${JSON.stringify(rOwner.failures)})`);
    if (rOwner.changed.length) fail(`a held owner claim moved to not-applicable is a failure, never only a reported change (got ${JSON.stringify(rOwner.changed)})`);
  }
  if (rFromNa.changed.length !== 1) fail(`a departure from not-applicable must be reported in changed (got ${JSON.stringify(rFromNa.changed)})`);
  // views/floor-fleet.mjs: a not-applicable row is listed separately, never counted as met
  const tmp = join(HERE, 'tmp-not-applicable'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmp); copyFixtureScanners('cleanlib', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'measure', tmp, '--write'], { stdio: 'pipe' }); } catch (e) { fail(`measure --write must succeed over the cleanlib fixture (${e.message})`); }
  // hand-edit the written yardstick.yaml: flip one met row to not-applicable, so
  // Intake/Maintain must read it as not_applicable, never as met
  const yardstickFile = join(tmp, 'yardstick.yaml');
  let ys = readFileSync(yardstickFile, 'utf8');
  const before = ys;
  ys = ys.replace(/(- id: d-secrets-out-of-history\n\s+status: )met/, '$1not-applicable');
  if (ys === before) fail('the cleanlib fixture must have decided d-secrets-out-of-history met to flip for this test to mean anything');
  writeFileSync(yardstickFile, ys);
  try { execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'intake', tmp], { stdio: 'pipe' }); } catch (e) { fail(`intake must render over a not-applicable row (${e.message})`); }
  const intakeYaml = parseYaml(readFileSync(runViewPath(tmp, 'intake'), 'utf8'));
  if (!Array.isArray(intakeYaml.not_applicable) || !intakeYaml.not_applicable.some((r) => r.id === 'd-secrets-out-of-history')) fail('Intake must list the not-applicable row under not_applicable');
  if (intakeYaml.met.some((r) => r.id === 'd-secrets-out-of-history')) fail('Intake must NEVER count a not-applicable row as met');
  const intakeMd = readFileSync(join(tmp, 'INTAKE.md'), 'utf8');
  if (!/## Not applicable/.test(intakeMd) || !/d-secrets-out-of-history/.test(intakeMd.split('## Not applicable')[1] || '')) fail('INTAKE.md must render a Not applicable section naming the row');
  rmSync(tmp, { recursive: true, force: true });
}
