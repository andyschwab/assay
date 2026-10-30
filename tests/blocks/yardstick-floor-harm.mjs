// ── the floor holds what prevents harm; quality that speeds work lives beyond it (#161) ──
// A row is floor when its gap can cause harm to data, to people, to money or to recovery, and it names
// which. Pinned:
//   (a) every floor row of the register names its harm from the closed harms list, and no row beyond the
//       floor names one;
//   (b) the yardstick refuses a floor row with no harm, a harm on a row beyond the floor, and a harm
//       outside the list;
//   (c) the rows #161 moved beyond the floor are not floor, and the three that had no other tag read fleet;
//   (d) yardstick/README.md states the rule and defines the field.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'yardstick-floor-harm';

const MOVED = ['d-readme-true', 'd-decisions-reconstruct', 'd-modules-standalone', 'd-architecture-page', 'd-no-drifting-duplicates', 'd-no-dead-code', 'd-lint-typecheck-gate', 'd-config-declared'];
const NOW_FLEET = ['d-decisions-reconstruct', 'd-modules-standalone', 'd-lint-typecheck-gate'];

export async function run() {
  const fail = (m) => negFailures.push('yardstick-floor-harm: ' + m);
  const reg = loadYardstick();
  const harms = new Set(reg.harms || []);
  if (JSON.stringify(reg.harms) !== JSON.stringify(['data', 'people', 'money', 'recovery'])) fail(`the harms list is data, people, money, recovery (got ${JSON.stringify(reg.harms)})`);

  // (a)
  for (const d of reg.requirements) {
    const floor = (d.tags || []).includes('floor');
    if (floor && !(Array.isArray(d.harm) && d.harm.length && d.harm.every((h) => harms.has(h)))) fail(`(a) floor row ${d.id} names the harm its gap can cause (got ${JSON.stringify(d.harm)})`);
    if (!floor && d.harm !== undefined) fail(`(a) ${d.id} is beyond the floor and names no harm (got ${JSON.stringify(d.harm)})`);
  }

  // (b)
  const base = reg.requirements.find((d) => (d.tags || []).includes('floor'));
  const one = (row) => validateYardstick({ ...reg, requirements: [row] });
  if (one(base).length) fail(`(b) a well-formed floor row validates (got ${one(base).join('; ')})`);
  const { harm: _drop, ...noHarm } = base;
  if (!one(noHarm).some((e) => /names the harm/.test(e))) fail('(b) a floor row with no harm is refused');
  if (!one({ ...base, tags: ['fleet'] }).some((e) => /beyond the floor names none/.test(e))) fail('(b) a harm on a row beyond the floor is refused');
  if (!one({ ...base, harm: ['speed'] }).some((e) => /harm "speed" not in/.test(e))) fail('(b) a harm outside the list is refused');

  // (c)
  const byId = Object.fromEntries(reg.requirements.map((d) => [d.id, d]));
  for (const id of MOVED) if (!byId[id] || (byId[id].tags || []).includes('floor')) fail(`(c) ${id} lives beyond the floor (#161)`);
  for (const id of NOW_FLEET) if (!byId[id] || !(byId[id].tags || []).includes('fleet')) fail(`(c) ${id} reads fleet, so a steward's routines read it`);

  // (d)
  const readme = readFileSync(join(ROOT, 'yardstick', 'README.md'), 'utf8').replace(/\s+/g, ' ');
  if (!/A row is `floor` when its gap can cause harm to data, to people, to money or to recovery/.test(readme) || !/\| `harm` \| on a `floor` row, and only there/.test(readme)) fail('(d) yardstick/README.md states the floor rule and defines harm');
}
