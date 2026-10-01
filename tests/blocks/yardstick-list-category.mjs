// ── descriptor category as a list: two rows one instrument decider holds jointly ─
// A descriptor's `decide.category` may be a list of native_category values it must hold
// jointly (e.g. fresh-clone [install, build]): a finding in EITHER listed category is part
// of the population; the descriptor reads met only when EVERY listed category is met by
// the same rules a single-category row already uses.
import { loadYardstick, validateYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'yardstick-list-category';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-list-category: ' + m);
  const reg = loadYardstick();
  const listRequirement = { id: 'd-test-list', title: 'test', tier: 'reproducibility', topic: 'context-economy', tags: [], decide: { kind: 'instrument', scanner: 'fresh-clone', category: ['install', 'build'] }, check: 'x', sources: ['x'], status: 'draft', owner: { risk: 'x', fix: 'x' } };
  const testReg = { ...reg, requirements: [listRequirement] };
  const ran = [{ scanner: 'fresh-clone', status: 'ran' }];
  // a gap in EITHER listed category decides the row (here: only "build" has a gap)
  const withGap = [{ id: 'F-1', source: 'fresh-clone', native_category: 'build', polarity: 'gap', observation: 'x', evidence: ['a:1'] }];
  const gapRows = measureRun({ findings: withGap, manifest: ran, inputs: null, coverage: {} }, testReg);
  if (gapRows[0]?.status !== 'unmet' || !gapRows[0].findings.includes('F-1')) fail(`a gap in either listed category must decide the row unmet (got ${gapRows[0]?.status})`);
  // no rows in either listed category, from an instrument that ran: met (nothing to report)
  const noRows = measureRun({ findings: [], manifest: ran, inputs: null, coverage: {} }, testReg);
  if (noRows[0]?.status !== 'met') fail(`no rows in either listed category from a clean instrument run must read met (got ${noRows[0]?.status})`);
  // a skipped manifest reads not-measured regardless of the category shape
  const skipped = measureRun({ findings: [], manifest: [{ scanner: 'fresh-clone', status: 'skipped', reason: 'no scratch clone here' }], inputs: null, coverage: {} }, testReg);
  if (skipped[0]?.status !== 'not-measured' || !/no scratch clone here/.test(skipped[0].note)) fail(`a skipped manifest must read not-measured with its reason, list category or not (got ${skipped[0]?.status} / ${skipped[0]?.note})`);
  // a peer scanner with a list category: met only when EVERY listed category is scanned clean
  const peerRequirement = { ...listRequirement, id: 'd-test-list-peer', decide: { kind: 'instrument', scanner: 'deep-code-review', category: ['B', 'N'] } };
  const peerRan = [{ scanner: 'deep-code-review', status: 'ran' }];
  const oneScanned = measureRun({ findings: [], manifest: peerRan, inputs: null, coverage: { 'deep-code-review': { coverage: { B: { status: 'scanned' }, N: { status: 'not-scanned', note: 'no config surface' } } } } }, { ...testReg, requirements: [peerRequirement] });
  if (oneScanned[0]?.status !== 'not-measured') fail(`a list category met in one member and not-scanned in the other must NOT read met (got ${oneScanned[0]?.status})`);
  const bothScanned = measureRun({ findings: [], manifest: peerRan, inputs: null, coverage: { 'deep-code-review': { coverage: { B: { status: 'scanned' }, N: { status: 'scanned' } } } } }, { ...testReg, requirements: [peerRequirement] });
  if (bothScanned[0]?.status !== 'met') fail(`a list category must read met once every listed category is independently scanned clean (got ${bothScanned[0]?.status})`);
  // validateYardstick: accepts a list category, rejects an empty one
  if (validateYardstick({ ...reg, requirements: [listRequirement] }).length) fail('validateYardstick must accept a non-empty list category');
  const emptyList = { ...listRequirement, decide: { kind: 'instrument', scanner: 'fresh-clone', category: [] } };
  if (!validateYardstick({ ...reg, requirements: [emptyList] }).some((e) => /category/.test(e))) fail('validateYardstick must reject an empty category list');
}
