// ── every census and context-carrying claim row names the bar that decides it (#293, part of #257) ──
// Two independent readers placed eight rows apart (#289): one read the verdict as deterministic
// once a threshold or field list is fixed, the other as judgment because the row stated none. So
// each census row's check, and each claim row's that carries a context list, says after its
// question how its verdict over one member is decided: "Met when <the bar>", "Judged, weighing
// <what>" or "The owner decides, weighing <what>", exactly one (yardstick/population.mjs barOf,
// read by validatePopulations). Pinned:
//   (a) the yardstick holds it on every such row, and each of the eight rows #293 names reads the
//       decision #293 made for it;
//   (b) a row with its bar stripped, or naming two, is refused by name;
//   (c) a facet row needs none: its rule is computed (map/doctrine.mjs, yardstick/measure.mjs).
import { negFailures } from '../harness.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { parseCheck, validatePopulations, barOf } from '../../yardstick/population.mjs';

export const label = 'checks-name-their-bar';

// #293's eight rows and the decision each took (yardstick/README.md, "A check names its bar")
const DECIDED = {
  'd-modules-standalone': 'deterministic',
  'd-model-call-telemetry': 'deterministic',
  'd-agent-consumable-surface': 'deterministic',
  'd-guards-bite': 'deterministic',
  'd-change-carries-verification': 'deterministic',
  'd-ai-feature-evals': 'deterministic',
  'd-decisions-reconstruct': 'judged',
  'd-one-home-per-fact': 'judged',
};

export async function run() {
  const fail = (m) => negFailures.push('checks-name-their-bar: ' + m);
  const reg = loadYardstick();
  const terms = reg.members.map((m) => m.term);
  const needs = (d) => d.decide?.kind === 'census' || (d.decide?.kind === 'claim' && d.decide.context !== undefined);

  // (a) the yardstick as it stands
  for (const e of validatePopulations(reg)) if (/names how its verdict is decided/.test(e)) fail(e);
  const rows = reg.requirements.filter(needs);
  if (rows.length < 10) fail(`expected the census and context-carrying claim rows, found ${rows.length}`);
  for (const d of rows) {
    const p = parseCheck(d.check, terms);
    if (!p) { fail(`${d.id}: its check is not in the population form`); continue; }
    if (!barOf(p.rest)) fail(`${d.id}: its check names no bar after its question ("${p.rest}")`);
  }
  for (const [id, want] of Object.entries(DECIDED)) {
    const d = reg.requirements.find((r) => r.id === id);
    const got = d && barOf(parseCheck(d.check, terms)?.rest);
    if (got !== want) fail(`${id}: #293 decided it ${want}; its check reads ${got || 'no bar'}`);
  }
  const open = reg.requirements.find((r) => r.id === 'd-decisions-reconstruct')?.decide?.open;
  if (!/choosing the members is itself a judgment/.test(String(open))) fail('d-decisions-reconstruct: its decide.open says why its population is a judgment');
  const ohpf = reg.requirements.find((r) => r.id === 'd-one-home-per-fact');
  if (!/Its population is a judgment/.test(String(ohpf?.check))) fail('d-one-home-per-fact: its check says why its population is a judgment');

  // (b) a stripped bar, and a doubled one, are refused by name
  const target = rows.find((d) => d.id === 'd-modules-standalone') || rows[0];
  const p = parseCheck(target.check, terms);
  const variant = (rest) => ({ ...reg, requirements: reg.requirements.map((d) => d === target ? { ...d, check: `Population: every ${p.population}; excluded: ${p.excluded}. Question: ${p.question}${rest ? ` ${rest}` : ''}` } : d) });
  const named = (errs) => errs.some((e) => e.includes(target.id) && /names how its verdict is decided/.test(e));
  if (!named(validatePopulations(variant('')))) fail(`${target.id} with its bar stripped must be refused by name`);
  if (!named(validatePopulations(variant('A member missing any one is a gap')))) fail(`${target.id} with no bar sentence must be refused`);
  if (!named(validatePopulations(variant('Met when it has a test. Judged, weighing its doc')))) fail(`${target.id} naming two bars must be refused`);
  if (named(validatePopulations(variant('Judged, weighing its doc')))) fail(`${target.id} with one bar must read`);

  // (c) a facet row needs no bar
  const facet = reg.requirements.find((d) => d.decide?.kind === 'facet' && parseCheck(d.check, terms));
  if (facet && validatePopulations(reg).some((e) => e.includes(facet.id))) fail(`${facet.id}: a facet row needs no bar`);
}
