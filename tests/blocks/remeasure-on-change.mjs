// ── a measured run is measured again when ingest or record changes it (#184) ──
// The loop the docs give is draw, compile, ingest what comes back, compile again. The
// second compile validates first, and validate reads a stored measurement that differs
// from the map as drift. So ingest and record re-measure a run that carries a
// yardstick.yaml; a run never measured stays unmeasured; a hand edit is still drift.
//   (a) record flips a decider to skipped: the stored row follows, no drift;
//   (b) ingest adds a scanner's rows: the stored measurement follows, no drift;
//   (c) a run with no yardstick.yaml gains none from record;
//   (d) a hand edit of yardstick.yaml still fails validate as drift.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { projectRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'remeasure-on-change';

export async function run() {
  const fail = (m) => negFailures.push('remeasure-on-change: ' + m);
  const tmp = join(HERE, 'tmp-remeasure'); rmSync(tmp, { recursive: true, force: true });
  const runDir = join(tmp, 'notesbox');
  cpSync(join(HERE, 'fixtures', 'notesbox'), runDir, { recursive: true });
  const cli = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
  const stored = () => Object.fromEntries(parseYaml(readFileSync(join(runDir, 'yardstick.yaml'), 'utf8')).requirements.map((r) => [r.id, r.status]));
  const drift = () => { const now = stored(); return projectRun(runDir).filter((r) => now[r.id] !== r.status).map((r) => `${r.id}: file ${now[r.id]}, map ${r.status}`); };
  const validateDrift = () => { const v = cli('map/validate.mjs', [runDir]); return (v.stdout + v.stderr).split('\n').filter((l) => /requirement drift/.test(l)); };
  try {
    execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), runDir, '--write'], { encoding: 'utf8', stdio: 'pipe' });
    const before = stored()['d-dependencies-known-clean'];
    // (a)
    const r = cli('map/record.mjs', [runDir, 'dependency-scan', 'skipped', '--reason', 'test: decided not to run']);
    if (r.status !== 0) fail(`(a) record exits 0 (got ${r.status}: ${r.stderr})`);
    const after = stored()['d-dependencies-known-clean'];
    if (before === after || after !== 'not-measured') fail(`(a) record re-measures: d-dependencies-known-clean follows its decider to not-measured (stored ${before} → ${after})`);
    const da = drift(); if (da.length) fail(`(a) no drift after record: ${da.join('; ')}`);
    if (validateDrift().length) fail(`(a) validate reads no drift after record (got ${validateDrift().join('; ')})`);
    // (b)
    const i = cli('map/ingest.mjs', [runDir, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1', '--model', 'test-model']);
    if (i.status !== 0) fail(`(b) ingest exits 0 (got ${i.status}: ${i.stderr})`);
    if (!/measured again/.test(i.stdout)) fail('(b) ingest says it measured the run again');
    const db = drift(); if (db.length) fail(`(b) no drift after ingest: ${db.join('; ')}`);
    // (d)
    const y = join(runDir, 'yardstick.yaml');
    const text = readFileSync(y, 'utf8');
    writeFileSync(y, text.replace(/(- id: d-dependencies-known-clean\n\s+status: )[a-z-]+/, '$1met'));
    if (!validateDrift().some((l) => /d-dependencies-known-clean/.test(l))) fail('(d) a hand edit of yardstick.yaml still reads as drift in validate');
    // (c)
    rmSync(y);
    cli('map/record.mjs', [runDir, 'dependency-scan', 'ran']);
    if (existsSync(y)) fail('(c) a run never measured gains no yardstick.yaml from record');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
