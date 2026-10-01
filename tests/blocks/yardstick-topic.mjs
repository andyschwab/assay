// ── yardstick topic invariants: every row needs one, from the allowed roster ──
// A requirement's `topic:` is required and closed to the axis roster plus custody,
// reproducibility and operability (the tiers with no axis of their own). Missing or unknown must both fail closed.
import { loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'yardstick-topic';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-topic: ' + m);
  const reg = loadYardstick();
  const noTopic = { ...reg, requirements: reg.requirements.map((d, i) => i === 0 ? { ...d, topic: undefined } : d) };
  if (!validateYardstick(noTopic).some((e) => /topic/.test(e))) fail('a requirement with no topic must be rejected');
  const badTopic = { ...reg, requirements: reg.requirements.map((d, i) => i === 0 ? { ...d, topic: 'not-a-real-topic' } : d) };
  if (!validateYardstick(badTopic).some((e) => /topic "not-a-real-topic"/.test(e))) fail('a topic outside the allowed list must be rejected');
  if (validateYardstick(reg).length) fail('the shipped register must validate clean with every row carrying a topic');
}
