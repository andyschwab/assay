// ── every census row names its candidates or says why no tool lists them (#286, M6 of #257) ──
// A census whose population the tree lists is closed by enumerate (decide.candidates); one no tool
// can list stays open, and its row says why (decide.open), so a reader of the yardstick sees which
// agreement is forced by a list and which is tracked. Pinned:
//   (a) the three closed rows and their populations; the open rows are exactly doc-freshness,
//       decision-reconstruction, modules, interfaces, lessons and ingestion points, each with its
//       reason, and the passes render each closed row's candidates for the lane;
//   (b) the yardstick refuses a census row carrying both or neither, an unknown population, one of
//       the effect triage's, one population on two rows, and either field on a row that is no census;
//   (c) secretConstants is no census's candidate list: enumerate's shape filter set each apart as a
//       constant no site reads from the environment, so a row naming it is refused.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'census-rows-say-why';

const CLOSED = { 'd-credentials-enumerated': ['secrets'], 'd-change-gates-fail-closed': ['changeGates'], 'd-model-call-telemetry': ['modelCalls'] };
const OPEN = ['d-readme-true', 'd-decisions-reconstruct', 'd-modules-standalone', 'd-agent-consumable-surface', 'd-corrections-become-mechanisms', 'd-ingested-content-is-data'];

export async function run() {
  const fail = (m) => negFailures.push('census-rows-say-why: ' + m);
  const reg = loadYardstick();
  const census = reg.requirements.filter((d) => d.decide.kind === 'census');

  // (a)
  for (const d of census) {
    if (d.id in CLOSED) {
      if (JSON.stringify(d.decide.candidates) !== JSON.stringify(CLOSED[d.id])) fail(`${d.id} reads over populations.${CLOSED[d.id].join(', ')} (got ${JSON.stringify(d.decide.candidates)})`);
      if (!/one candidate/.test(d.check) || !/map\/census-triage\.yaml/.test(d.check)) fail(`${d.id}: its check states the member unit, one candidate one member, triaged in map/census-triage.yaml`);
    } else if (OPEN.includes(d.id)) {
      if (!(typeof d.decide.open === 'string' && /^no tool lists it from the tree: /.test(d.decide.open))) fail(`${d.id}: an open census says on the row why no tool lists it ("no tool lists it from the tree: <why>"; got ${JSON.stringify(d.decide.open)})`);
    } else fail(`${d.id}: a census row this block does not know; say whether a tool lists its population`);
  }
  for (const id of [...Object.keys(CLOSED), ...OPEN]) if (!census.some((d) => d.id === id)) fail(`${id} is a census row`);
  const method = readFileSync(join(ROOT, 'map', 'METHOD.md'), 'utf8');
  for (const [id, pops] of Object.entries(CLOSED)) {
    const line = method.split('\n').find((l) => l.includes(`\`${id}\``) && l.includes('population every'));
    if (!line || !pops.every((p) => line.includes(`\`populations.${p}\``)) || !line.includes('map/census-triage.yaml')) fail(`${id}: its pass's rendered block names its candidates and the triage file (got ${line ?? 'no line'})`);
  }

  // (b)
  const swap = (id, decide) => ({ ...reg, requirements: reg.requirements.map((d) => (d.id === id ? { ...d, decide: { ...d.decide, ...decide } } : d)) });
  const refused = (r, re, what) => { if (!validateYardstick(r).some((e) => re.test(e))) fail(`the yardstick must refuse ${what} (${re})`); };
  if (validateYardstick(reg).length) fail(`the shipped yardstick validates (${validateYardstick(reg).join(' | ')})`);
  refused(swap('d-readme-true', { candidates: ['changeGates'] }), /d-readme-true: a census row names .* exactly one/, 'a census row carrying both candidates and open');
  const neither = { ...reg, requirements: reg.requirements.map((d) => (d.id === 'd-readme-true' ? { ...d, decide: { kind: 'census', measures: d.decide.measures } } : d)) };
  refused(neither, /d-readme-true: a census row names .* exactly one/, 'a census row carrying neither');
  refused(swap('d-model-call-telemetry', { candidates: ['notAPopulation'] }), /names "notAPopulation", not an enumerate population/, 'an unknown population');
  refused(swap('d-model-call-telemetry', { candidates: ['routeHandlers'] }), /names "routeHandlers", not an enumerate population a census may close/, 'a population the effect triage closes');
  refused(swap('d-model-call-telemetry', { candidates: ['secrets'] }), /names "secrets", already d-credentials-enumerated's/, 'one population on two rows');
  refused(swap('d-model-call-telemetry', { candidates: [] }), /decide\.candidates must be a non-empty list/, 'an empty candidate list');
  refused(swap('d-readme-true', { open: ' ' }), /decide\.open must be a sentence/, 'an empty open reason');
  refused(swap('d-effects-gated', { open: 'x' }), /d-effects-gated: decide\.candidates and decide\.open are a census row's/, 'open on a facet row');

  // (c)
  refused(swap('d-credentials-enumerated', { candidates: ['secrets', 'secretConstants'] }), /decide\.candidates names "secretConstants"/, 'a census row naming secretConstants as candidates');
}
