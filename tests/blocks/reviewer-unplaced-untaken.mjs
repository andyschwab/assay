// ── a reviewer finding its adapter cannot place is untaken, with the reason (#306, part 2) ──
// The adapter's mapping from the reviewer's native category to a property is closed
// (map/placement.mjs): a category names one property, or the closed list the reviewer chooses
// from. A finding it cannot place is never assigned to the nearest row. Pinned:
//   1. a K finding that names no property is taken by no requirement, and its reason says K spans
//      two properties and the reviewer named none;
//   2. beside it, d-dependencies-pinned reads not measured, never met: the unplaced finding may be
//      its gap;
//   3. a reviewer whose adapter names no property for a category: its finding is unplaced with
//      that reason, and taken by no requirement;
//   4. compiled, the candidates view lists the unplaced finding in unnamed with its reason, and
//      never on a row.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { requirementTaking } from '../../yardstick/population.mjs';
import { candidatesDataPath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'reviewer-unplaced-untaken';

export async function run() {
  const fail = (m) => negFailures.push('reviewer-unplaced-untaken: ' + m);
  const reg = loadYardstick();
  const adapters = adaptersOnce();
  const report = join(HERE, 'instruments', 'deep-code-review-properties.yaml');
  const rows = convert('deep-code-review', readFileSync(report, 'utf8'), null);
  const unnamed = rows.find((r) => r.native_id === 'R5');
  if (!unnamed) { fail('the fixture report must carry R5, a K finding that names no property'); return; }
  const placement = await import('../../map/placement.mjs').catch(() => null);

  // (1) taken by no requirement, with the reason
  const t = requirementTaking(unnamed, { reg, adapters });
  if (t.candidates.length) fail(`(1) a K finding that names no property is taken by no requirement (got ${t.candidates.join(', ')})`);
  const why = placement?.propertyOf(unnamed, adapters);
  if (!why || why.property !== null || !/category K spans build-supply-chain, release-path-trust, and the reviewer named none/.test(why.unplaced || '')) fail(`(1) its reason names K's two properties and that the reviewer named none (got ${JSON.stringify(why)})`);

  // (2) never met beside an unplaced finding
  const manifest = [{ scanner: 'deep-code-review', status: 'ran' }, { scanner: 'zizmor', status: 'ran' }];
  const pinned = measureRun({ findings: [unnamed], manifest, inputs: null, coverage: { 'deep-code-review': rows.coverage }, adapters }, reg).find((r) => r.id === 'd-dependencies-pinned');
  if (pinned?.status !== 'not-measured' || !/placed on no property/.test(pinned?.note || '')) fail(`(2) d-dependencies-pinned reads not measured beside an unplaced K finding, saying why (got ${pinned?.status}: ${pinned?.note})`);

  // (3) a category its adapter names no property for
  const bare = { ...adapters['deep-code-review'], scanner: 'bare-review', map: { K: { axis: 'code-security' } }, decides: [] };
  const other = { ...adapters, 'bare-review': bare };
  const f = { ...unnamed, source: 'bare-review' };
  const w = placement?.propertyOf(f, other);
  if (!w || w.property !== null || !/names no property for category K/.test(w.unplaced || '')) fail(`(3) a category the adapter names no property for is unplaced, with that reason (got ${JSON.stringify(w)})`);
  if (requirementTaking(f, { reg, adapters: other }).candidates.length) fail('(3) and no requirement takes it');

  // (4) compiled: listed unnamed with its reason, never on a row
  const tmp = mkdtempSync(join(tmpdir(), 'assay-unplaced-'));
  try {
    const runDir = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), runDir, { recursive: true });
    rmSync(join(runDir, 'ANSWERS.yaml'), { force: true });
    const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
    const i = assay('ingest', runDir, '--tool', 'deep-code-review', '--raw', report, '--exit', '0');
    if (i.status !== 0) { fail(`(4) the fixture report ingests (exit ${i.status}): ${(i.stderr || i.stdout).split('\n').slice(0, 3).join(' | ')}`); return; }
    const c = assay('compile', runDir);
    if (c.status !== 0) { fail(`(4) compile succeeds (exit ${c.status}): ${(c.stdout + c.stderr).split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 3).join(' | ')}`); return; }
    const stored = parseYaml(readFileSync(join(runDir, 'map', 'findings', 'deep-code-review.yaml'), 'utf8')).find((r) => r.native_id === 'R5');
    const d = parseYaml(readFileSync(candidatesDataPath(runDir), 'utf8'));
    if (!(d.unnamed || []).includes(stored?.id)) fail(`(4) the unplaced K finding ${stored?.id} is listed unnamed (got unnamed: ${(d.unnamed || []).join(', ')})`);
    const u = (d.unplaced || []).find((x) => x.finding === stored?.id);
    if (!u || !/named none/.test(u.reason || '')) fail(`(4) the candidates view carries its reason (got ${JSON.stringify(d.unplaced)})`);
    const y = parseYaml(readFileSync(join(runDir, 'yardstick.yaml'), 'utf8'));
    const on = (y.requirements || []).filter((r) => (r.findings || []).includes(stored?.id)).map((r) => r.id);
    if (on.length) fail(`(4) the unplaced finding is on no row (got ${on.join(', ')})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
