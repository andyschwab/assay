// ── corroboration: one fact found by two scanners counts once, as corroborated (#151) ──
// yardstick/compare.mjs's factFingerprint is the scanner-free key beside fingerprintFinding:
// the projected axis, the effect channel or else the evidence files, polarity and the effect
// descriptors, never the scanner. Since keeps the scanner-keyed one (a fact's custody stays
// with its scanner); the corroboration count is pinned on notesbox, where the code reviewer
// and the native passes (and the secret instrument) overlap on known facts.
import { join } from 'node:path';
import { fingerprintFinding, factFingerprint, corroboratedFacts } from '../../yardstick/compare.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { HERE, current, negFailures } from '../harness.mjs';

export const label = 'corroboration';

export async function run() {
  const fail = (m) => negFailures.push('corroboration: ' + m);
  const a = { id: 'F-1', source: 'scanner-a', native_category: 'X', polarity: 'gap', evidence: ['lib/x.mjs:3', 'lib/x.mjs:9'] };
  const b = { id: 'F-2', source: 'scanner-b', native_category: 'Y', polarity: 'gap', evidence: ['lib/x.mjs:40'] };
  if (factFingerprint(a, 'code-security') !== factFingerprint(b, 'code-security')) fail('two scanners on one axis, polarity and file must share the scanner-free fingerprint');
  if (fingerprintFinding(a) === fingerprintFinding(b)) fail('the scanner-keyed fingerprint (Since) must still tell the two scanners apart');
  if (factFingerprint(a, 'code-security') === factFingerprint(a, 'delegation')) fail('the axis is part of the fact');
  if (factFingerprint(a, 'code-security') === factFingerprint({ ...b, polarity: 'strength' }, 'code-security')) fail('polarity is part of the fact');
  const eff = (channel, reversibility) => ({ subject_type: 'effect', polarity: 'gap', evidence: ['lib/x.mjs:1'], effect: { channel, reversibility } });
  if (factFingerprint(eff('mail', 'irreversible'), 'delegation') === factFingerprint(eff('backup', 'irreversible'), 'delegation')) fail('an effect is identified by its channel, not only its file');
  if (factFingerprint(eff('mail', 'irreversible'), 'delegation') === factFingerprint(eff('mail', 'reversible'), 'delegation')) fail('the descriptor set is part of the fact');
  if (corroboratedFacts([{ f: a, axis: 'code-security', source: 'scanner-a' }, { f: { ...a, id: 'F-3' }, axis: 'code-security', source: 'scanner-a' }]).length) fail('two rows of one scanner are not corroboration');

  try {
    const { projected, unmapped, needsAxis } = projectMulti(loadFindings(join(HERE, 'fixtures', 'notesbox')), loadAdapters());
    if (unmapped.length || needsAxis.length) throw new Error(`notesbox projection incomplete: ${unmapped.length} unmapped, ${needsAxis.length} unclassified`);
    const facts = corroboratedFacts(projected);
    current._score['notesbox/corroboration'] = { corroborated: facts.length, facts: facts.map((x) => `${x.fingerprint} <- ${x.findings.join(',')}`) };
  } catch (e) { current._score['notesbox/corroboration'] = { error: e.message.split('\n')[0] }; }
}
