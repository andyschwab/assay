// ── a reviewer's release-trust finding is not filed under dependencies (#306, part 2) ──
// The reviewer's area K spans two properties: how the code is built and what from
// (build-supply-chain), and how a change reaches production (release-path-trust). Its adapter
// names both, the reviewer names one on each K finding, and the adapter binds
// d-dependencies-pinned to build-supply-chain alone (map/placement.mjs). Release trust has no
// row yet (one target has shown it; promotion needs two, #265), so it is listed untaken under its
// property. Pinned, over the invented report tests/instruments/deep-code-review-properties.yaml:
//   1. the supply-chain K finding counts on d-dependencies-pinned, the release-trust one does not;
//   2. requirementTaking places the release-trust finding on no requirement, and its property is
//      release-path-trust;
//   3. the adapter's K binding names its property, and a binding to a split category that names
//      none is refused when the yardstick loads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureRun, loadYardstick } from '../../yardstick/measure.mjs';
import { requirementTaking } from '../../yardstick/population.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'reviewer-release-trust-not-dependencies';

export async function run() {
  const fail = (m) => negFailures.push('reviewer-release-trust-not-dependencies: ' + m);
  const reg = loadYardstick();
  const adapters = adaptersOnce();
  const rows = convert('deep-code-review', readFileSync(join(HERE, 'instruments', 'deep-code-review-properties.yaml'), 'utf8'), null);
  const byNative = new Map(rows.map((r) => [r.native_id, r]));
  const release = byNative.get('R1'), supply = byNative.get('R2');
  if (!release || !supply) { fail('the fixture report must carry R1 (release trust) and R2 (supply chain)'); return; }
  const manifest = [{ scanner: 'deep-code-review', status: 'ran' }, { scanner: 'zizmor', status: 'skipped', reason: 'not run over this fixture' }];
  const coverage = { 'deep-code-review': rows.coverage };
  const pinned = measureRun({ findings: [release, supply], manifest, inputs: null, coverage, adapters }, reg).find((r) => r.id === 'd-dependencies-pinned');

  // (1) the row reads the supply-chain finding, never the release-trust one
  if (!(pinned?.findings || []).includes(supply.id)) fail(`(1) the supply-chain K finding ${supply.id} counts on d-dependencies-pinned (got ${pinned?.status}: ${(pinned?.findings || []).join(', ') || 'no findings'})`);
  if ((pinned?.findings || []).includes(release.id)) fail(`(1) the release-trust K finding ${release.id} is not filed under d-dependencies-pinned (got ${(pinned?.findings || []).join(', ')}: ${pinned?.note})`);
  const alone = measureRun({ findings: [release], manifest, inputs: null, coverage, adapters }, reg).find((r) => r.id === 'd-dependencies-pinned');
  if ((alone?.findings || []).includes(release.id) || /gap row/.test(alone?.note || '')) fail(`(1) a release-trust finding alone decides nothing on d-dependencies-pinned (got ${alone?.status}: ${alone?.note})`);

  // (2) no requirement takes release trust; it is placed on its property
  const t = requirementTaking(release, { reg, adapters });
  if (t.candidates.length) fail(`(2) no requirement takes the release-trust finding (got ${t.candidates.join(', ')})`);
  const s = requirementTaking(supply, { reg, adapters });
  if (s.requirement !== 'd-dependencies-pinned') fail(`(2) d-dependencies-pinned takes the supply-chain finding (got ${s.candidates.join(', ') || 'none'})`);

  // (3) the binding names its property; one that does not is refused
  const k = (adapters['deep-code-review'].decides || []).find((b) => b.requirement === 'd-dependencies-pinned');
  if (k?.property !== 'build-supply-chain') fail(`(3) the reviewer's d-dependencies-pinned binding names build-supply-chain (got ${k?.property})`);
  // the placement module is read lazily: before #306 it does not exist, and (1) and (2) still run
  const placement = await import('../../map/placement.mjs').catch(() => null);
  if (!placement) { fail('(3) map/placement.mjs holds the reviewer\'s property mapping to account'); return; }
  const loose = { ...adapters['deep-code-review'], decides: adapters['deep-code-review'].decides.map((b) => (b.requirement === 'd-dependencies-pinned' ? { requirement: b.requirement, category: b.category } : b)) };
  const errs = placement.validatePlacement(loose, reg.requirements.map((d) => d.id));
  if (!errs.some((e) => /category K spans several properties/.test(e))) fail(`(3) a binding to K that names no property is refused (got ${errs.join(' | ') || 'no error'})`);
}
