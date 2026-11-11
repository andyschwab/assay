// ── each facet and census row's check names its population and its question (#261, M3 of #257) ──
// A row whose check names neither which members count nor what is asked of each cannot place a
// finding: two careful readers put it on different rows. The rule's home is yardstick/README.md
// ("The four deciding kinds"); the form is read by yardstick/population.mjs. Pinned:
//   (a) every facet and census row's check reads "Population: every <term> <scope>; excluded:
//       <what>. Question: <one question>?", <term> one of requirements.yaml's members:, and no
//       two rows name one term;
//   (b) the vocabulary is closed: each term once, its subject types from the schema's, and one
//       term for each of the effect, halt-class effect and capability records;
//   (c) a check with no population, no exclusion, no question, two questions, or a term outside
//       the vocabulary is refused, as is a second row naming a term already taken;
//   (d) yardstick/README.md states the rule.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { parseCheck, validatePopulations } from '../../yardstick/population.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'check-names-population';

export async function run() {
  const fail = (m) => negFailures.push('check-names-population: ' + m);
  const reg = loadYardstick();
  // (a) and (b)
  for (const e of validatePopulations(reg)) fail(e);
  const rows = reg.requirements.filter((d) => ['facet', 'census'].includes(d.decide.kind));
  if (rows.length < 13) fail(`test setup: the facet and census rows (found ${rows.length})`);
  const terms = reg.members.map((m) => m.term);
  for (const d of rows) {
    const p = parseCheck(d.check, terms);
    if (p && !/\S/.test(p.excluded)) fail(`${d.id}: the population says what is excluded`);
  }

  // (c) the form refuses what names no population or asks no one question
  const good = rows.find((d) => d.id === 'd-modules-standalone');
  for (const [what, check] of [
    ['a census named, no population', 'the module census'],
    ['no exclusion', 'Population: every module in the terrain. Question: can an agent load it alone?'],
    ['no question', 'Population: every module in the terrain; excluded: tests. Question: whether it loads alone.'],
    ['two questions', 'Population: every module in the terrain; excluded: tests. Question: does it load alone? does it run alone?'],
    ['a term outside the vocabulary', 'Population: every widget in the terrain; excluded: tests. Question: can an agent load it alone?'],
  ]) {
    if (parseCheck(check, terms)) fail(`a check with ${what} must not read in the form ("${check}")`);
    const errs = validatePopulations({ ...reg, requirements: reg.requirements.map((d) => (d === good ? { ...d, check } : d)) });
    if (!errs.some((e) => e.includes('d-modules-standalone') && /check reads "Population: every/.test(e))) fail(`validatePopulations must refuse d-modules-standalone with ${what} (got ${errs.join(' | ') || 'nothing'})`);
  }
  if (!parseCheck('Population: every module in the terrain; excluded: tests. Question: can an agent load it alone? Read off the census', terms)) fail('a check in the form, with how the row reads after its question, must read');
  const twice = validatePopulations({ ...reg, requirements: reg.requirements.map((d) => (d.id === 'd-decisions-reconstruct' ? { ...d, check: good.check } : d)) });
  if (!twice.some((e) => /already d-(modules-standalone|decisions-reconstruct)'s/.test(e))) fail(`two rows naming one term must be refused (got ${twice.join(' | ') || 'nothing'})`);
  const dupTerm = validatePopulations({ ...reg, members: [...reg.members, { ...reg.members[0] }] });
  if (!dupTerm.some((e) => /duplicate term/.test(e))) fail('a term declared twice must be refused');
  const noRecord = validatePopulations({ ...reg, members: reg.members.map(({ record, ...m }) => m) });
  if (!noRecord.some((e) => /no term takes the effect record/.test(e))) fail('a vocabulary with no term for an effect finding must be refused');

  // (d) the rule is written where the deciding kinds are
  const readme = readFileSync(join(ROOT, 'yardstick', 'README.md'), 'utf8');
  const kinds = readme.slice(readme.indexOf('## The four deciding kinds'));
  if (!/Population: every <term>/.test(kinds) || !/population\.mjs/.test(kinds)) fail('yardstick/README.md, under "The four deciding kinds", states the check form and names yardstick/population.mjs');
}
