// ── descriptor-agreement invariants: repeatability at the layer that DRIVES output ─
// variance.mjs's fact clustering answers "did both sweeps record a fact about X"
// and deliberately drops descriptors from identity. But every shipped number —
// maturity coverage, the halt flags, the chain ranking, the gate — is computed
// from the effect descriptors. Two sweeps can agree on 100% of facts and assign
// opposite descriptors to all of them. These pin the second measure.
import { descriptorAgreement } from '../../map/variance.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'descriptor-agreement';

export async function run() {
  const fail = (m) => negFailures.push('descriptor-agreement: ' + m);
  const eff = (channel, o) => ({ id: 'F-1', dimension: 'delegation', subject_type: 'effect',
    polarity: 'fact', observation: 'x', evidence: ['a.py:1'], confidence: 'confirmed',
    effect: { channel, reversibility: 'reversible', external: true, gate_type: 'scope-bound',
              fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'user', ...o } });

  // identical sweeps → total agreement
  const same = descriptorAgreement([[eff('a')], [eff('a')]]);
  if (same.channels.shared !== 1) fail(`a channel present in both sweeps must be shared (got ${same.channels.shared})`);
  if (same.allFields.pct !== 100) fail(`identical descriptors must read 100% (got ${same.allFields.pct}%)`);
  if (same.divergences.length) fail('identical descriptors must produce no divergence rows');

  // a single field differing → that field alone drops, and the row is reported
  const one = descriptorAgreement([[eff('a')], [eff('a', { telemetry: 'unstructured' })]]);
  if (one.byField.telemetry.pct !== 0) fail('a differing telemetry must read 0% on that field');
  if (one.byField.gate_type.pct !== 100) fail('an unchanged field must stay 100% when a sibling differs');
  if (one.allFields.pct !== 0) fail('all-fields agreement must drop when any field differs');
  if (one.divergences.length !== 1 || one.divergences[0].channel !== 'a') fail('the divergent channel must be named');

  // fail_mode is not applicable where gate_type is none — a single gate disagreement
  // must not be double-counted as a fail_mode disagreement too
  const naFail = descriptorAgreement([
    [eff('a', { gate_type: 'none', fail_mode: null })],
    [eff('a', { gate_type: 'scope-bound', fail_mode: 'closed' })]]);
  if (naFail.byField.fail_mode.of !== 0) fail('fail_mode must not be compared on a channel where a sweep recorded gate_type: none');
  if (naFail.byField.gate_type.pct !== 0) fail('the gate_type disagreement itself must still register');
  if (naFail.divergences.length !== 1) fail('the channel must still read divergent on the gate_type difference alone');

  // a channel only one sweep saw is NOT shared — never counted as agreement or divergence
  const partial = descriptorAgreement([[eff('a'), eff('b')], [eff('a')]]);
  if (partial.channels.shared !== 1) fail(`only channels seen by 2+ sweeps are shared (got ${partial.channels.shared})`);
  if (partial.channels.unshared !== 1) fail('a channel only one sweep saw must be reported as unshared, never silently dropped');

  // direction: the variance-vs-movement signal. All-one-way is consistent with the
  // target changing; both-ways is the signature of judgment drift.
  const oneWay = descriptorAgreement([
    [eff('a', { telemetry: 'unstructured' }), eff('b', { telemetry: 'unstructured' })],
    [eff('a', { telemetry: 'structured-event' }), eff('b', { telemetry: 'structured-event' })]]);
  if (oneWay.directions.safer === 0 || oneWay.directions.riskier !== 0) fail('two same-direction moves must read one-way, not both-ways');
  if (oneWay.bothWays) fail('a one-way divergence set must not be flagged both-ways');
  const bothWays = descriptorAgreement([
    [eff('a', { telemetry: 'unstructured' }), eff('b', { telemetry: 'structured-event' })],
    [eff('a', { telemetry: 'structured-event' }), eff('b', { telemetry: 'unstructured' })]]);
  if (!bothWays.bothWays) fail('divergences moving in both directions must be flagged both-ways (the judgment-drift signature)');
}
