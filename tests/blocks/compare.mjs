// ── compare(): the classification table, incl. no-longer-measured + yardstick-only ──
// Pure, no fixtures needed. Pins the ordering rule (met > mixed > unmet, not-measured
// off-scale) so a status leaving the measured scale can never silently read as
// "improved" or "unchanged" — a loss of information is not progress (yardstick/README.md).
import { compare, classify } from '../../yardstick/compare.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'compare';

export async function run() {
  const fail = (m) => negFailures.push('compare: ' + m);
  const TABLE = [
    ['unmet', 'unmet', 'unchanged'], ['unmet', 'mixed', 'improved'], ['unmet', 'met', 'improved'],
    ['mixed', 'unmet', 'regressed'], ['mixed', 'mixed', 'unchanged'], ['mixed', 'met', 'improved'],
    ['met', 'unmet', 'regressed'], ['met', 'mixed', 'regressed'], ['met', 'met', 'unchanged'],
    ['not-measured', 'not-measured', 'unchanged'],
    ['not-measured', 'unmet', 'newly-measured'], ['not-measured', 'mixed', 'newly-measured'], ['not-measured', 'met', 'newly-measured'],
    ['unmet', 'not-measured', 'no-longer-measured'], ['mixed', 'not-measured', 'no-longer-measured'], ['met', 'not-measured', 'no-longer-measured'],
  ];
  for (const [p, c, want] of TABLE) {
    const got = classify(p, c);
    if (got !== want) fail(`classify(${p} -> ${c}) = "${got}", want "${want}"`);
  }
  let threw = false; try { classify('met', 'bogus'); } catch { threw = true; }
  if (!threw) fail('classify must throw on a status outside the closed vocabulary (fail loud)');

  const prevDoc = { version: 0, requirements: [{ id: 'd-a', status: 'met', basis: 'run' }, { id: 'd-b', status: 'unmet', basis: 'run' }] };
  const currDoc = { version: 1, requirements: [{ id: 'd-a', status: 'unmet', basis: 'run', findings: ['F-1'] }, { id: 'd-c', status: 'met', basis: 'owner' }] };
  const result = compare(prevDoc, currDoc);
  if (!result.versionChanged || result.previousVersion !== 0 || result.currentVersion !== 1) fail('a yardstick version difference must be reported, never hidden');
  const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
  if (byId['d-a'].classification !== 'regressed' || byId['d-a'].current.findings.join() !== 'F-1') fail('d-a (met -> unmet) must classify regressed and carry the current row\'s findings');
  if (byId['d-b'].classification !== 'yardstick-only' || byId['d-b'].side !== 'previous') fail('d-b (dropped from the current yardstick) must read yardstick-only/previous');
  if (byId['d-c'].classification !== 'yardstick-only' || byId['d-c'].side !== 'current' || byId['d-c'].current.basis !== 'owner') fail('d-c (new to the yardstick) must read yardstick-only/current and carry its basis');
  if (Object.keys(byId).length !== 3) fail(`compare must emit exactly one row per id across both sides (got ${Object.keys(byId).join(', ')})`);
}
