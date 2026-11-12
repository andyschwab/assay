// ── an absence is not a census member (#298) ──
// The flawed-webapp confirmation sweep at v0.10.0 (tests/sweeps/flawed-webapp-2026-11-12b) parted on
// two census rows because one lane listed "this target has no gate" and an unwired test file as
// change-gate members, and read a test's header as a recorded lesson; under the outside-the-list rule
// (#291) such a member holds the row down. The rule is text, not a validate check (map/SCHEMA.md §6b
// says why: no field tells an absence from a gap on a real member), so this pins the text where a
// lane reads it: the census contract in SCHEMA.md §6b and §6f, and the practice-review seed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'absence-is-no-member';

export async function run() {
  const fail = (m) => negFailures.push('absence-is-no-member: ' + m);
  const flat = (t) => t.replace(/\s+/g, ' ');
  const schema = flat(readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8'));
  const section = (head, next) => { const a = schema.indexOf(head), b = schema.indexOf(next, a + 1); return a < 0 ? '' : schema.slice(a, b < 0 ? undefined : b); };
  const s6b = section('### 6b.', '### 6c.');
  const s6f = section('### 6f.', '## 7.');
  if (!/An absence is not a member/.test(s6b) || !/never listed in `members:`, and never triaged as a candidate/.test(s6b)) fail('SCHEMA.md §6b states that an absence is not a census member: outside the census, never in members:, never triaged');
  if (!/A census member is one thing that exists/.test(s6b) || !/its evidence cites that thing/.test(s6b)) fail('SCHEMA.md §6b states that a census member is one thing that exists, its evidence citing it');
  if (!/has no validate check/.test(s6b)) fail('SCHEMA.md §6b says why the absence rule has no validate check');
  if (!/An absence is never such a member/.test(s6f)) fail('SCHEMA.md §6f states that an absence is never a member outside the list');
  const p = flat(laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' }).prompt);
  if (!/An absence is not a member: a census member is one thing that exists, its evidence citing that thing/.test(p)) fail('the practice-review seed tells the lane that a census member is one thing that exists, and an absence is none');
  if (!/never listed in `members:` and never triaged as a candidate/.test(p)) fail('the practice-review seed tells the lane an absence is never listed in members: nor triaged');
}
