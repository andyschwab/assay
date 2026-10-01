// ── map/record.mjs: set one scanner's disposition, keeping every other row
// and the file's own comments intact — a line-level edit, never a reformat ──
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setScannerRow } from '../../map/record.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'record';

export async function run() {
  const fail = (m) => negFailures.push('record: ' + m);
  const original = [
    '# a hand-written header comment — must survive untouched',
    'engine: deadbeef',
    'scanners:',
    '  repo-eval:',
    '    status: ran',
    '  gitleaks:',
    '    # a comment that belongs to the gitleaks row',
    '    status: skipped',
    "    reason: \"not yet run: ingesting its report records it ran\"",
    '  fresh-clone:',
    '    status: ran',
    '',
  ].join('\n');

  // flip gitleaks to ran: repo-eval, fresh-clone, the header, and engine: must
  // not move a single character.
  const { text: afterRan, row: rowRan } = setScannerRow(original, 'gitleaks', 'ran');
  if (!/^# a hand-written header comment — must survive untouched$/m.test(afterRan)) fail('record must not touch the file\'s header comment');
  if (!/engine: deadbeef/.test(afterRan)) fail('record must not touch engine:');
  if (!/ {2}repo-eval:\n {4}status: ran/.test(afterRan)) fail('record must leave an untouched row (repo-eval) exactly as it was');
  if (!/ {2}fresh-clone:\n {4}status: ran/.test(afterRan)) fail('record must leave the row AFTER the edited one exactly as it was');
  if (!/ {2}gitleaks:\n {4}status: ran\n/.test(afterRan)) fail(`record must rewrite the target row to the new status (got:\n${afterRan})`);
  if (/ingesting its report records it ran/.test(afterRan)) fail('switching a row to ran must drop its prior skip reason when no new --reason is given');
  if (rowRan.join('\n') !== '  gitleaks:\n    status: ran') fail(`record must return exactly the row it wrote (got ${JSON.stringify(rowRan)})`);

  // skipped again, with a new reason: the reason is the one just given, not any prior one.
  const { text: afterSkip } = setScannerRow(afterRan, 'gitleaks', 'skipped', { reason: 'binary missing here' });
  if (!/gitleaks:\n {4}status: skipped\n {4}reason: "binary missing here"/.test(afterSkip)) fail(`record must write the new skip reason (got:\n${afterSkip})`);
  if (!/repo-eval:\n {4}status: ran/.test(afterSkip) || !/fresh-clone:\n {4}status: ran/.test(afterSkip)) fail('record must still leave the other rows untouched on a second edit');

  // model: carries over across a status change unless overridden.
  const { text: withModel } = setScannerRow(original, 'repo-eval', 'ran', { model: 'model-a' });
  const { text: keptModel } = setScannerRow(withModel, 'repo-eval', 'ran', {});
  if (!/repo-eval:\n {4}status: ran\n {4}model: "model-a"/.test(keptModel)) fail(`record must keep an existing model: when --model is not given again (got:\n${keptModel})`);
  const { text: keptModelOnSkip } = setScannerRow(withModel, 'repo-eval', 'skipped', { reason: 'x' });
  if (!/model: "model-a"/.test(keptModelOnSkip)) fail('model: should still carry over into a skipped row too, unless the caller means to drop it');

  // a scanner with no row yet is APPENDED, after the last existing row.
  const { text: added } = setScannerRow(original, 'dependency-scan', 'skipped', { reason: 'no registry reach' });
  if (!/fresh-clone:\n {4}status: ran\n {2}dependency-scan:\n {4}status: skipped\n {4}reason: "no registry reach"\n$/.test(added))
    fail(`record must append a missing scanner's row after the last one (got:\n${added})`);

  // the CLI: unknown scanner and skip-without-reason both refuse (exit 2), nothing written.
  const tmp = join(HERE, 'tmp-record'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'run', 'map'), { recursive: true });
  const mPath = join(tmp, 'run', 'map', 'scanners.yaml');
  writeFileSync(mPath, original);
  const before = readFileSync(mPath, 'utf8');

  let e1 = null;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'record.mjs'), join(tmp, 'run'), 'no-such-scanner', 'ran'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { e1 = e; }
  if (!e1 || e1.status !== 2) fail(`record must refuse an unknown scanner with exit 2 (got ${e1 && e1.status})`);
  if (!e1 || !/unknown scanner/.test(String(e1.stderr))) fail(`record's unknown-scanner refusal must name the scanner (got: ${e1 && e1.stderr})`);

  let e2 = null;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'record.mjs'), join(tmp, 'run'), 'gitleaks', 'skipped'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { e2 = e; }
  if (!e2 || e2.status !== 2) fail(`record must refuse skipped with no --reason (got ${e2 && e2.status})`);
  if (!e2 || !/needs a reason/.test(String(e2.stderr))) fail(`record's no-reason refusal must say a reason is needed (got: ${e2 && e2.stderr})`);

  const e3 = spawnSync(process.execPath, [join(ROOT, 'map', 'record.mjs'), join(tmp, 'run'), 'gitleaks', 'failed'], { encoding: 'utf8' });
  if (e3.status !== 2) fail(`record must refuse failed with no --reason (got ${e3.status})`);

  if (readFileSync(mPath, 'utf8') !== before) fail('a refused record call must leave the file byte-for-byte unchanged');

  rmSync(tmp, { recursive: true, force: true });
}
