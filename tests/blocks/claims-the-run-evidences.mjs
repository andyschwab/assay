// ── the owner-only rows a run already evidences: each has one disposition, with its reason (#262, M4 of #257) ──
// Ten claim rows read not measured from a run alone while a run's findings bore on every one.
// Each now carries one reviewed disposition on the row (`decide.why`, yardstick/README.md "The
// ten claim rows a run evidences"):
//   (a) census-decided, where a run can close the population by reading the tree: a census row
//       in M3's form, its term in the closed members: vocabulary, its measure names in METHOD.md's
//       census list, the practice-review lane's census instructions and SCHEMA.md's census table;
//   (b) a claim, where only the owner can attest it: the row stays kind claim, and names its
//       population in the same form plus the context list (decide.context) whose findings the
//       views show beside it, never as its decision.
// Pinned: each of the ten has its kind and a reason; each (a) row is in the form and named where
// the lane reads; each (b) row is in the form with a context list; a decide.context on a
// run-decided row, a context name that is a census's, and one shared by two rows are refused.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { parseCheck, validatePopulations } from '../../yardstick/population.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'claims-the-run-evidences';

// the disposition #262 decided for each row
export const CENSUS = { 'd-model-call-telemetry': 'model call site', 'd-ingested-content-is-data': 'ingestion point' };
export const CLAIM = {
  'd-one-home-per-fact': 'second account',
  'd-model-qualification': 'model in use',
  'd-ai-disclosure': 'outward AI output',
  'd-guards-bite': 'guard fixture',
  'd-backlog-is-issues': 'backlog record',
  'd-ai-feature-evals': 'AI feature',
  'd-calibration-harness': 'relied-on rubric',
  'd-change-carries-verification': 'change verification',
};

export async function run() {
  const fail = (m) => negFailures.push('claims-the-run-evidences: ' + m);
  const reg = loadYardstick();
  const byId = new Map(reg.requirements.map((d) => [d.id, d]));
  const terms = reg.members.map((m) => m.term);
  for (const e of validatePopulations(reg)) fail(e);
  const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
  const method = read('map', 'METHOD.md'), lane = read('map', 'scanners', 'adapters', 'practice-review', 'lane.md'), schema = read('map', 'SCHEMA.md');
  const censusList = method.slice(method.indexOf('- **Sampled censuses**'), method.indexOf('- **A census outranks'));
  const censusTable = schema.slice(schema.indexOf('**Census names.**'), schema.indexOf('**Polarity of an effect.**'));
  if (!censusList || !censusTable) fail('test setup: METHOD.md\'s census list and SCHEMA.md\'s census names table');

  for (const [id, term] of Object.entries({ ...CENSUS, ...CLAIM })) {
    const d = byId.get(id);
    if (!d) { fail(`${id}: the yardstick carries the row`); continue; }
    const kind = id in CENSUS ? 'census' : 'claim';
    if (d.decide.kind !== kind) fail(`${id}: its disposition is ${kind} (got ${d.decide.kind})`);
    if (!(typeof d.decide.why === 'string' && new RegExp(`^${kind} \\(#262\\): `).test(d.decide.why))) fail(`${id}: decide.why states its disposition, "${kind} (#262): <reason>" (got ${JSON.stringify(d.decide.why)})`);
    const p = parseCheck(d.check, terms);
    if (!p || p.term !== term) fail(`${id}: its check names its population in M3's form, on "${term}" (got ${p ? p.term : 'no population'})`);
    if (kind === 'census') {
      const names = d.decide.measures || [];
      if (!names.length) { fail(`${id}: a census row names its census`); continue; }
      if (!names.every((n) => censusTable.includes(`\`${n}\``))) fail(`${id}: SCHEMA.md's census names table lists ${names.join(', ')}`);
      if (!censusList.includes(`\`${names[0]}\``)) fail(`${id}: METHOD.md's census list names \`${names[0]}\``);
      if (!lane.includes(`\`${names[0]}\``)) fail(`${id}: the practice-review lane's census instructions name \`${names[0]}\``);
      if (d.decide.context !== undefined) fail(`${id}: a census row carries no context list`);
    } else {
      const ctx = d.decide.context || [];
      if (ctx.length !== 1) fail(`${id}: a claim row the run evidences names its one context list (got ${JSON.stringify(ctx)})`);
      else if (!censusList.includes(`\`${ctx[0]}\``) || !lane.includes(`\`${ctx[0]}\``)) fail(`${id}: METHOD.md's census list and the lane name its context list \`${ctx[0]}\``);
    }
  }

  // the context list is a claim row's alone, and a name is a census's or a context list's
  const edit = (id, decide) => ({ ...reg, requirements: reg.requirements.map((d) => (d.id === id ? { ...d, decide: { ...d.decide, ...decide } } : d)) });
  const cases = [
    ['a context list on a census row', edit('d-readme-true', { context: ['doc-context'] }), /d-readme-true: decide\.context is a claim row's/],
    ['a context list named as a census', edit('d-one-home-per-fact', { context: ['doc-freshness'] }), /context list "doc-freshness" is a census name/],
    ['a context list two rows name', edit('d-guards-bite', { context: ['second-accounts'] }), /context list "second-accounts" is already d-one-home-per-fact's|already d-guards-bite's/],
    ['an empty why', edit('d-guards-bite', { why: ' ' }), /d-guards-bite: decide\.why must be a sentence/],
  ];
  for (const [what, r, want] of cases) {
    const errs = validateYardstick(r);
    if (!errs.some((e) => want.test(e))) fail(`validateYardstick must refuse ${what} (got ${errs.join(' | ') || 'nothing'})`);
  }
  // a claim row with a context list names its population in the form
  const blurred = { ...reg, requirements: reg.requirements.map((d) => (d.id === 'd-guards-bite' ? { ...d, check: 'the self-test flips red when any one check is weakened' } : d)) };
  if (!validatePopulations(blurred).some((e) => /d-guards-bite: a claim row's check reads "Population: every/.test(e))) fail('a claim row with a context list whose check names no population must be refused');
}
