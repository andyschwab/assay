// ── not-applicable / not-measured: decided ONLY from an evidence condition the
// deciding instrument itself recorded (a `polarity: fact` row), never a packet
// claim. A row with `decide.not_applicable_when`/`not_measured_when` names a fact
// row's native_category from the SAME scanner; it fires only when the decided
// category itself carries no rows — real evidence there always governs.
import { loadYardstick, validateYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'not-applicable';

export async function run() {
  const fail = (m) => negFailures.push('not-applicable: ' + m);
  const reg = loadYardstick();
  const naReq = { id: 'd-test-na', title: 'test', tier: 'reproducibility', topic: 'reproducibility', tags: [], decide: { kind: 'instrument', scanner: 'fresh-clone', category: 'migrate', not_applicable_when: 'no-database-signal' }, check: 'x', sources: ['x'], status: 'draft', owner: { risk: 'x', fix: 'x' } };
  const ran = [{ scanner: 'fresh-clone', status: 'ran' }];
  // a fact row naming the condition, with nothing in the decided category: not-applicable
  const factOnly = [{ id: 'F-1', source: 'fresh-clone', native_category: 'no-database-signal', polarity: 'fact', observation: 'no database signal found anywhere in the tree', evidence: ['package.json:1'] }];
  const naRow = measureRun({ findings: factOnly, manifest: ran, inputs: null, coverage: {} }, { ...reg, requirements: [naReq] })[0];
  if (naRow?.status !== 'not-applicable' || !/no database signal/.test(naRow.note)) fail(`a fact row naming the condition must decide not-applicable, carrying the fact's own observation (got ${naRow?.status}/${naRow?.note})`);
  // real evidence in the decided category always wins over the condition
  const bothPresent = [...factOnly, { id: 'F-2', source: 'fresh-clone', native_category: 'migrate', polarity: 'gap', observation: 'x', evidence: ['a:1'] }];
  const overridden = measureRun({ findings: bothPresent, manifest: ran, inputs: null, coverage: {} }, { ...reg, requirements: [naReq] })[0];
  if (overridden?.status !== 'unmet') fail(`a real gap in the decided category must govern over the not_applicable_when fact, never the other way round (got ${overridden?.status})`);
  // no fact, no rows in the category: the ordinary instrument verdict (met — ran clean)
  const noFact = measureRun({ findings: [], manifest: ran, inputs: null, coverage: {} }, { ...reg, requirements: [naReq] })[0];
  if (noFact?.status !== 'met') fail(`with neither a gap nor the condition's fact, the ordinary instrument verdict must hold (got ${noFact?.status})`);
  // the scanner must have RUN this run for the condition to decide anything
  const skippedNa = measureRun({ findings: factOnly, manifest: [{ scanner: 'fresh-clone', status: 'skipped', reason: 'x' }], inputs: null, coverage: {} }, { ...reg, requirements: [naReq] })[0];
  if (skippedNa?.status !== 'not-measured') fail(`a not_applicable_when condition must never decide from a scanner that did not run this run (got ${skippedNa?.status})`);
  // not_measured_when: the same mechanism, deciding not-measured instead (dependency-scan's
  // "manifest with no lockfile: nothing to audit" case)
  const nmReq = { ...naReq, id: 'd-test-nm', decide: { kind: 'instrument', scanner: 'dependency-scan', category: 'critical', not_measured_when: 'no-lockfile' } };
  const nmFact = [{ id: 'F-3', source: 'dependency-scan', native_category: 'no-lockfile', polarity: 'fact', observation: 'package.json declares dependencies but no lockfile covers it', evidence: ['package.json:1'] }];
  const nmRow = measureRun({ findings: nmFact, manifest: [{ scanner: 'dependency-scan', status: 'ran' }], inputs: null, coverage: {} }, { ...reg, requirements: [nmReq] })[0];
  if (nmRow?.status !== 'not-measured' || !/no lockfile/.test(nmRow.note)) fail(`not_measured_when must decide not-measured with the fact's own note (got ${nmRow?.status}/${nmRow?.note})`);
  // a claim can never change what a not_applicable_when / not_measured_when row decides —
  // it is decided only from the map (measureRun never reads packet claims for non-claim rows)
  const withPacket = measureRun({ findings: factOnly, manifest: ran, inputs: null, coverage: {}, packet: { claims: [{ id: 'd-test-na', state: 'satisfied', by: 'x' }] } }, { ...reg, requirements: [naReq] })[0];
  if (withPacket?.status !== 'not-applicable' || withPacket?.basis !== 'run') fail(`a packet claim must never override a run-decided not-applicable row (got ${withPacket?.status}/${withPacket?.basis})`);
  // validateYardstick: accepts the field, rejects an empty string
  if (validateYardstick({ ...reg, requirements: [naReq] }).length) fail('validateYardstick must accept not_applicable_when');
  const badField = { ...naReq, decide: { ...naReq.decide, not_applicable_when: '' } };
  if (!validateYardstick({ ...reg, requirements: [badField] }).some((e) => /not_applicable_when/.test(e))) fail('validateYardstick must reject an empty not_applicable_when');

  // d-schema-versioned itself: a real fresh-clone run with no database signal reads
  // not-applicable; a Supabase-shaped signal with no migrate step reads unmet, never met
  const dbNone = [{ id: 'F-10', source: 'fresh-clone', native_category: 'no-database-signal', polarity: 'fact', observation: 'no database signal (file or dependency) found anywhere in the tree — the migrate step is not applicable, not merely undeclared.', evidence: ['package.json:1'] }];
  const schemaNa = measureRun({ findings: dbNone, manifest: ran, inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-schema-versioned');
  if (schemaNa?.status !== 'not-applicable') fail(`d-schema-versioned must read not-applicable with no database signal in the tree (got ${schemaNa?.status})`);
  const dbButNoMigrate = [{ id: 'F-11', source: 'fresh-clone', native_category: 'migrate', polarity: 'gap', observation: 'no migrate step declared', evidence: ['package.json:1'] }];
  const schemaUnmet = measureRun({ findings: dbButNoMigrate, manifest: ran, inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-schema-versioned');
  if (schemaUnmet?.status !== 'unmet') fail(`d-schema-versioned must read unmet (never met) when a database signal exists and migrate is not declared (got ${schemaUnmet?.status})`);
}
