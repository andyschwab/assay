// ── fail-closed unit invariants ───────────────────────────────────────────────
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { computeVariance } from '../../map/variance.mjs';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'fail-closed';
export const gate = ['projection'];

export async function run() {
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) negFailures.push(`yaml-min accepted ${label} — must throw (fail-closed reader)`); };
  mustThrow('an inline flow map {}', () => parseYaml('a: {b: 1}'));
  mustThrow('an anchor &x', () => parseYaml('a: &x 1'));
  const { unmapped } = projectMulti(
    [{ id: 'F-999', source: 'deep-code-review', native_category: 'ZZ', polarity: 'gap', observation: 'x', evidence: ['a:1'], fix: 'y' }],
    loadAdapters());
  if (!unmapped.length) negFailures.push('projectMulti did not flag an unmapped native category — fail-closed projection broken');
  // the SHARED loader must fail closed on an unparseable findings file — a
  // skipped file silently shrinks the base, and in variance the loss would be
  // mis-read as variance (the fail-open seam the consolidation removed).
  mustThrow('an unparseable findings file (shared loader)', () => loadFindings(join(HERE, 'negative', 'bad-yaml-load')));
  mustThrow('an unparseable sweep (variance must halt, not skip)', () => computeVariance([join(HERE, 'negative', 'bad-yaml-load'), join(HERE, 'negative', 'bad-yaml-load')]));
}
