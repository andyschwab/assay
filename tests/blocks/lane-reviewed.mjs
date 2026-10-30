// ── a row a lane decides says when it was reviewed, and reads "lane not run" until then (#201) ──
// A review lane runs on demand, not with every routine run, so a consumer needs to say "reviewed on <date>"
// and decide when a lane is due. Pinned:
//   (a) `record <run> <scanner> ran --head <sha> --reviewed <date>` records what a lane reviewed; a later
//       record keeps it; a malformed head or date, or either on a row that did not run, is refused;
//   (b) a facet or census row whose lane has not run reads not measured, its note naming the lane not run
//       and the run record's reason;
//   (c) every row a lane that ran decides carries reviewed (which lane, its head, its day): the facet and
//       census rows of the lane that names their kind, an instrument row of each judgment decider; a row only
//       instruments decide carries none;
//   (d) yardstick.yaml writes it, and validate reads a stored reviewed: that the run record does not
//       produce as drift; validate refuses reviewed: on a row that did not run.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setScannerRow } from '../../map/record.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { loadYardstick, measureRun, decidersOf } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-reviewed';

const BASE = 'engine: block\nscanners:\n  practice-review:\n    status: ran\n  zizmor:\n    status: skipped\n    reason: "no workflows"\n';

export async function run() {
  const fail = (m) => negFailures.push('lane-reviewed: ' + m);
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  // (a)
  const once = setScannerRow(BASE, 'practice-review', 'ran', { head: 'abc1234', reviewedOn: '2026-10-30' }).text;
  if (!/practice-review:\n {4}status: ran\n {4}reviewed:\n {6}head: "abc1234"\n {6}date: "2026-10-30"/.test(once)) fail(`(a) record writes what the lane reviewed (got ${JSON.stringify(once)})`);
  const again = setScannerRow(once, 'practice-review', 'ran', { model: 'a-model' }).text;
  if (!/head: "abc1234"/.test(again) || !/date: "2026-10-30"/.test(again)) fail('(a) a later record of the row keeps what it reviewed');
  if (!throws(() => setScannerRow(BASE, 'practice-review', 'ran', { head: 'not-a-sha' }))) fail('(a) a head that is not a sha is refused');
  if (!throws(() => setScannerRow(BASE, 'practice-review', 'ran', { reviewedOn: '30/10/2026' }))) fail('(a) a day that is not YYYY-MM-DD is refused');
  if (!throws(() => setScannerRow(BASE, 'zizmor', 'skipped', { reason: 'x', head: 'abc1234' }))) fail('(a) what a lane reviewed is refused on a row that did not run');

  // (b), (c)
  const reg = loadYardstick();
  const adapters = loadAdapters();
  const census = reg.requirements.find((d) => d.decide.kind === 'census');
  const facet = reg.requirements.find((d) => d.decide.kind === 'facet');
  const byReviewer = reg.requirements.find((d) => decidersOf(d, adapters, null).some((x) => x.scanner === 'deep-code-review'));
  const byInstruments = reg.requirements.find((d) => d.decide.kind === 'instrument' && decidersOf(d, adapters, null).length && decidersOf(d, adapters, null).every((x) => adapters[x.scanner]?.role === 'instrument'));
  if (!census || !facet || !byReviewer || !byInstruments) { fail('test setup: the yardstick has a census row, a facet row, a row the reviewer decides and one only instruments decide'); return; }
  const measure = (manifest) => Object.fromEntries(measureRun({ findings: [], manifest, inputs: {}, coverage: {} }, reg).map((r) => [r.id, r]));
  const notRun = measure([{ scanner: 'practice-review', status: 'skipped', reason: 'a steward session runs it' }]);
  for (const d of [census, facet]) {
    const r = notRun[d.id];
    if (r.status !== 'not-measured' || r.note !== 'practice-review lane not run: a steward session runs it') fail(`(b) ${d.id} reads not measured, naming the lane not run and its reason (got ${r.status}: ${r.note})`);
  }
  const reviewed = measure([
    { scanner: 'practice-review', status: 'ran', reviewed: { head: 'abc1234', date: '2026-10-30' } },
    { scanner: 'deep-code-review', status: 'ran', reviewed: { head: 'def5678', date: '2026-10-29' } },
  ]);
  const want = (by, head, date) => JSON.stringify([{ by, head, date }]);
  for (const d of [census, facet]) if (JSON.stringify(reviewed[d.id].reviewed) !== want('practice-review', 'abc1234', '2026-10-30')) fail(`(c) ${d.id} carries the practice-review lane's review (got ${JSON.stringify(reviewed[d.id].reviewed)})`);
  if (!(reviewed[byReviewer.id].reviewed || []).some((v) => v.by === 'deep-code-review' && v.head === 'def5678')) fail(`(c) ${byReviewer.id} carries the reviewer's review (got ${JSON.stringify(reviewed[byReviewer.id].reviewed)})`);
  if (reviewed[byInstruments.id].reviewed) fail(`(c) ${byInstruments.id}, decided by instruments alone, carries no review (got ${JSON.stringify(reviewed[byInstruments.id].reviewed)})`);

  // (d)
  const scratch = mkdtempSync(join(tmpdir(), 'assay-lane-reviewed-'));
  try {
    const dir = join(scratch, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), dir, { recursive: true });
    const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
    const rec = assay(['record', dir, 'practice-review', 'ran', '--head', 'abc1234', '--reviewed', '2026-10-30']);
    if (rec.status !== 0) fail(`(d) record --head --reviewed succeeds on a run (got ${rec.status}: ${rec.stderr.trim()})`);
    execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), dir, '--write'], { stdio: 'pipe' });
    const ys = readFileSync(join(dir, 'yardstick.yaml'), 'utf8');
    if (!new RegExp(`- id: ${census.id}[\\s\\S]*?reviewed:\\n {6}- by: practice-review\\n {8}head: "abc1234"\\n {8}date: "2026-10-30"`).test(ys)) fail(`(d) yardstick.yaml writes ${census.id}'s review`);
    const ok = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir], { encoding: 'utf8' });
    if (ok.status !== 0) fail(`(d) the run validates with its reviews (got ${ok.status}: ${ok.stderr.split('\n').filter((l) => /•/.test(l)).slice(0, 2).join(' | ')})`);
    writeFileSync(join(dir, 'yardstick.yaml'), ys.replace('head: "abc1234"', 'head: "1111111"'));
    const drift = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir], { encoding: 'utf8' });
    if (drift.status === 0 || !/reviewed drift/.test(drift.stderr)) fail('(d) a stored review the run record does not produce reads as drift');
    const sk = readFileSync(join(dir, 'map', 'scanners.yaml'), 'utf8').replace(/(\n {2}practice-review:\n {4}status: )ran/, '$1skipped\n    reason: "planted"');
    writeFileSync(join(dir, 'map', 'scanners.yaml'), sk);
    const bad = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir], { encoding: 'utf8' });
    if (!/reviewed: records what a lane that ran reviewed/.test(bad.stderr)) fail('(d) validate refuses reviewed: on a row that did not run');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
