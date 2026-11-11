// ── each claim row's context list has one owning pass, and no discovery question duplicates a row (#262, #263, part of #257) ──
// M4 (#262) gave eight claim rows a context list (decide.context) a review fills in
// map/censuses.yaml's context:, and M5 (#263) gave each facet and census row one owning pass in
// map/passes.yaml. This block holds the context map and the yardstick in lockstep:
//   (a) every claim row with a context list has exactly one owning pass (a pass's context:), and
//       a pass's context names only such rows. Seen red with a context row left unowned, one
//       owned twice, and a census row and a claim row with no list named;
//   (b) no discovery property duplicates a context row or a census row's question: its property
//       is never a row's census, context list or id without the d-, and its question never the
//       row's. The four questions M4's rows took over are gone from the map and from METHOD.md's
//       rendered blocks: inference-spend-metered is d-model-call-telemetry's census question, and
//       the other three live on as context entries of the pass that asked them;
//   (c) a pass that fills a context list opens on SCHEMA.md §6b, the list's form, and METHOD.md's
//       block for it names each row, its list and its question under "Context, never a decision";
//   (d) the practice-review lane tells each pass subagent the context lists the map names for it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { negFailures, ROOT } from '../harness.mjs';
import { loadPasses, contextErrors, shapeErrors, sliceOf, METHOD_FILE, SCHEMA_FILE } from '../../map/passes.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';

export const label = 'context-lists-have-owners';

// the four discovery questions that duplicated a row, and where each question went (#262's rows)
export const RETIRED = {
  'inference-spend-metered': { row: 'd-model-call-telemetry', decidedBy: 'context' },
  'model-tier-rationale-recorded': { row: 'd-model-qualification', contextOf: 'context' },
  'calibration-harness': { row: 'd-calibration-harness', contextOf: 'verification' },
  'ai-involvement-disclosed': { row: 'd-ai-disclosure', contextOf: 'delegation' },
};

const clone = (v) => JSON.parse(JSON.stringify(v));

export async function run() {
  const fail = (m) => negFailures.push('context-lists-have-owners: ' + m);
  const passes = loadPasses();
  const reg = loadYardstick();
  const method = readFileSync(METHOD_FILE, 'utf8');
  const schema = readFileSync(SCHEMA_FILE, 'utf8');
  const listed = reg.requirements.filter((d) => (d.decide?.context || []).length);

  // (a) the tree, then the map made wrong
  for (const e of await contextErrors(passes, reg)) fail(`(a) ${e}`);
  if (listed.length < 8) fail(`(a) the yardstick has ${listed.length} claim rows with a context list, not #262's eight: the lockstep reads too little`);
  for (const d of listed) if (d.decide.kind !== 'claim') fail(`(a) ${d.id} carries a context list on a ${d.decide.kind} row`);
  const owner = passes.find((p) => p.context.length);
  if (!owner) fail('(a) no pass fills a context list');
  else {
    const unowned = clone(passes);
    const dropped = unowned.find((p) => p.id === owner.id).context.shift();
    if (!(await contextErrors(unowned, reg)).some((e) => e.startsWith(`${dropped} `) && /no owning pass/.test(e))) fail(`(a) a map that leaves ${dropped}'s context list unowned reads clean`);
    const twice = clone(passes);
    twice.find((p) => p.id !== owner.id).context.push(owner.context[0]);
    if (!(await contextErrors(twice, reg)).some((e) => e.startsWith(`${owner.context[0]} `) && /filled by 2 passes/.test(e))) fail(`(a) a map that fills ${owner.context[0]}'s context list twice reads clean`);
    const census = reg.requirements.find((d) => d.decide?.kind === 'census');
    const bare = reg.requirements.find((d) => d.decide?.kind === 'claim' && !(d.decide.context || []).length);
    for (const d of [census, bare]) {
      if (!d) { fail('(a) test setup: a census row and a claim row with no context list'); continue; }
      const named = clone(passes);
      named[0].context.push(d.id);
      if (!(await contextErrors(named, reg)).some((e) => e.includes(d.id) && /only claim rows that carry one/.test(e))) fail(`(a) a pass whose context names ${d.id}, a ${d.decide.kind} row with no context list, reads clean`);
    }
  }

  // (b) the retired questions, and the rule that keeps them retired
  const props = new Map(passes.flatMap((p) => p.discovery.map((q) => [q.property, p.id])));
  const blocks = [...method.matchAll(/<!-- passes:([\w-]+) -->([\s\S]*?)<!-- \/passes:\1 -->/g)].map((m) => m[2]).join('\n');
  const byId = new Map(passes.map((p) => [p.id, p]));
  for (const [prop, fate] of Object.entries(RETIRED)) {
    if (props.has(prop)) fail(`(b) ${prop} is still a discovery question of pass ${props.get(prop)}; ${fate.row} asks it`);
    if (blocks.includes(`\`${prop}\``)) fail(`(b) METHOD.md's rendered pass blocks still carry ${prop}`);
    if (fate.decidedBy && !byId.get(fate.decidedBy)?.decides.includes(fate.row)) fail(`(b) ${prop} left for ${fate.row}'s census, which pass ${fate.decidedBy} must decide`);
    if (fate.contextOf && !byId.get(fate.contextOf)?.context.includes(fate.row)) fail(`(b) ${prop} lives on as ${fate.row}'s context list, which pass ${fate.contextOf} must fill`);
  }
  const asker = passes.find((p) => p.discovery.length);
  const ctxRow = listed[0];
  const censusRow = reg.requirements.find((d) => d.decide?.kind === 'census');
  if (asker && ctxRow && censusRow) {
    const { parseCheck } = await import('../../yardstick/population.mjs');
    const terms = reg.members.map((m) => m.term);
    const cases = [
      ['named as a context list', { property: ctxRow.decide.context[0], question: 'is it new?' }, ctxRow.id],
      ['named as a census', { property: censusRow.decide.measures[0], question: 'is it new?' }, censusRow.id],
      ['named as a row id', { property: ctxRow.id.replace(/^d-/, ''), question: 'is it new?' }, ctxRow.id],
      ['asking a context row\'s question', { property: 'fresh-property', question: parseCheck(ctxRow.check, terms).question }, ctxRow.id],
      ['asking a census row\'s question', { property: 'fresh-property', question: parseCheck(censusRow.check, terms).question.toUpperCase() }, censusRow.id],
    ];
    for (const [what, q, row] of cases) {
      const m = clone(passes);
      m.find((p) => p.id === asker.id).discovery.push(q);
      if (!(await contextErrors(m, reg)).some((e) => e.includes(row) && /no discovery question/.test(e))) fail(`(b) a discovery question ${what} (${row}'s) reads clean`);
    }
  }

  // (c) the slice holds the list's form, and the block names each row
  const rows = new Map(reg.requirements.map((d) => [d.id, d]));
  for (const p of passes) {
    if (!p.context.length) continue;
    let s;
    try { s = sliceOf(p, { method, schema }); } catch (e) { fail(`(c) ${e.message}`); continue; }
    if (!s.text.includes("**A claim row's context list (#262).**")) fail(`(c) pass ${p.id} fills a context list, and its slice does not hold SCHEMA.md §6b's context-list form`);
    const block = (new RegExp(`<!-- passes:${p.id} -->([\\s\\S]*?)<!-- /passes:${p.id} -->`).exec(method) || [])[1] || '';
    if (!block.includes('- **Context, never a decision**')) fail(`(c) METHOD.md's block for pass ${p.id} has no "Context, never a decision" line`);
    for (const id of p.context) {
      const line = block.split('\n').find((l) => l.startsWith(`  - \`${id}\` (context list `));
      const list = rows.get(id)?.decide?.context?.[0];
      if (!line || !line.includes(`\`${list}\``) || !/; asks: .+\?/.test(line)) fail(`(c) METHOD.md's block for pass ${p.id} does not name ${id}, its list \`${list}\` and its question`);
    }
  }
  const verifier = passes.find((p) => p.context.length);
  if (verifier) {
    const narrow = clone(passes);
    const v = narrow.find((p) => p.id === verifier.id);
    v.schema = v.schema.filter((s) => s !== '6b');
    if (!shapeErrors(narrow, reg, schema).some((e) => e.includes(`pass ${verifier.id} fills the context list`) && /§6b/.test(e))) fail(`(c) pass ${verifier.id} fills a context list with no §6b in its slice, and reads clean`);
  }

  // (d) the lane names each pass's context lists from the map
  const lane = readFileSync(join(ROOT, 'map', 'scanners', 'adapters', 'practice-review', 'lane.md'), 'utf8').replace(/\s+/g, ' ');
  if (!/tell it the context lists `map\/passes\.yaml` names for it \(its `context:`/.test(lane)) fail('(d) the practice-review lane does not tell each pass subagent the context lists map/passes.yaml names for it');
  if (!/by the one pass whose `context:` names the row/.test(lane)) fail('(d) the practice-review lane does not say a context list is filled by the one pass whose context: names its row');
}
