// ── practice-review's passes feed the requirements, one owner each, each opening on its slice (#263) ──
// map/passes.yaml is the one map of the passes (map/passes.mjs reads it). Pinned:
//   (a) lockstep with yardstick/requirements.yaml: every facet- or census-decided requirement has
//       exactly one owning pass, and a pass decides nothing else. Seen red with a requirement left
//       unowned, owned twice, and a claim row named;
//   (b) the map's shape: one pass per dimension in order, each discovery question asked by one
//       pass under a property that is never a requirement id, and each pass's schema slice
//       naming the SCHEMA.md sections its outputs need (§6b for a census, §4 for a forced facet,
//       §6e for the triage);
//   (c) METHOD.md's block at the head of each pass is rendered from the map: a hand edit to one
//       reads drift, and the pass list the engine reads (PRACTICE_REVIEW_PASSES) is the map's;
//   (d) each pass subagent opens on its slice: every slice resolves, holds its own pass's section
//       and no other pass's, and is under half the two whole files; the lane names the map and
//       the slice, and never tells a session to read METHOD.md in full.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { negFailures, ROOT } from '../harness.mjs';
import { loadPasses, ownershipErrors, shapeErrors, methodDrift, sliceOf, METHOD_FILE, SCHEMA_FILE } from '../../map/passes.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { PRACTICE_REVIEW_PASSES } from '../../map/project.mjs';

export const label = 'passes-feed-requirements';

const clone = (v) => JSON.parse(JSON.stringify(v));

export async function run() {
  const fail = (m) => negFailures.push('passes-feed-requirements: ' + m);
  const passes = loadPasses();
  const reg = loadYardstick();
  const method = readFileSync(METHOD_FILE, 'utf8');
  const schema = readFileSync(SCHEMA_FILE, 'utf8');

  // (a) the tree, then the map made wrong three ways
  for (const e of ownershipErrors(passes, reg)) fail(`(a) ${e}`);
  const decided = reg.requirements.filter((d) => ['facet', 'census'].includes(d.decide?.kind));
  if (!decided.length) fail('(a) the yardstick has no facet or census row: the lockstep reads nothing');
  const owner = passes.find((p) => p.decides.length);
  if (owner) {
    const unowned = clone(passes);
    const dropped = unowned.find((p) => p.id === owner.id).decides.shift();
    if (!ownershipErrors(unowned, reg).some((e) => e.startsWith(`${dropped} `) && /no owning pass/.test(e))) fail(`(a) a map that leaves ${dropped} unowned reads clean`);
    const twice = clone(passes);
    const other = twice.find((p) => p.id !== owner.id);
    other.decides.push(owner.decides[0]);
    if (!ownershipErrors(twice, reg).some((e) => e.startsWith(`${owner.decides[0]} `) && /owned by 2 passes/.test(e))) fail(`(a) a map that owns ${owner.decides[0]} twice reads clean`);
  }
  const claim = reg.requirements.find((d) => d.decide?.kind === 'claim');
  if (claim) {
    const named = clone(passes);
    named[0].decides.push(claim.id);
    if (!ownershipErrors(named, reg).some((e) => e.includes(claim.id) && /only facet and census/.test(e))) fail(`(a) a pass that names the claim row ${claim.id} reads clean`);
  }

  // (b)
  for (const e of shapeErrors(passes, reg, schema)) fail(`(b) ${e}`);
  const withQuestion = passes.find((p) => p.discovery.length);
  if (withQuestion) {
    const asked = clone(passes);
    asked.find((p) => p.id !== withQuestion.id).discovery.push(clone(withQuestion.discovery[0]));
    if (!shapeErrors(asked, reg, schema).some((e) => /one question, one pass/.test(e))) fail('(b) a discovery question two passes ask reads clean');
  }
  const census = passes.find((p) => p.decides.some((id) => reg.requirements.find((d) => d.id === id)?.decide?.kind === 'census'));
  if (census) {
    const narrow = clone(passes);
    const p = narrow.find((x) => x.id === census.id);
    p.schema = p.schema.filter((s) => s !== '6b');
    if (!shapeErrors(narrow, reg, schema).some((e) => e.includes(`pass ${census.id}`) && /§6b/.test(e))) fail(`(b) pass ${census.id} decides a census with no §6b in its slice, and reads clean`);
  }

  // (c)
  const { drift } = await methodDrift(passes, reg, method);
  for (const d of drift) fail(`(c) ${d}`);
  const first = passes[0];
  const edited = method.replace(`<!-- /passes:${first.id} -->`, `  - \`d-hand-added\`: a line typed by hand\n<!-- /passes:${first.id} -->`);
  if (!(await methodDrift(passes, reg, edited)).drift.some((d) => d.startsWith(`${first.id}:`))) fail('(c) a hand edit to a pass block reads in step');
  const fromMap = Object.fromEntries(passes.map((p) => [p.id, p.dimension]));
  if (JSON.stringify(PRACTICE_REVIEW_PASSES) !== JSON.stringify(fromMap)) fail(`(c) the engine's pass list is not the map's (${JSON.stringify(PRACTICE_REVIEW_PASSES)})`);

  // (d)
  const whole = Buffer.byteLength(method) + Buffer.byteLength(schema);
  for (const p of passes) {
    let s;
    try { s = sliceOf(p, { method, schema }); } catch (e) { fail(`(d) ${e.message}`); continue; }
    if (!s.text.includes(`### Pass ${p.pass} — ${p.title}`)) fail(`(d) pass ${p.id}'s slice does not hold its own section`);
    for (const o of passes) if (o !== p && s.text.includes(`### Pass ${o.pass} — `)) fail(`(d) pass ${p.id}'s slice holds pass ${o.id}'s section`);
    if (!(s.bytes < whole / 2)) fail(`(d) pass ${p.id} opens on ${s.bytes} bytes, not under half the two whole files (${whole})`);
  }
  const lane = readFileSync(join(ROOT, 'map', 'scanners', 'adapters', 'practice-review', 'lane.md'), 'utf8').replace(/\s+/g, ' ');
  if (/METHOD\.md`? in full/.test(lane)) fail('(d) the practice-review lane tells a session to read METHOD.md in full');
  if (!lane.includes('`map/passes.yaml`')) fail('(d) the practice-review lane does not name map/passes.yaml, the map of the passes');
  if (!/open each on its pass's slice, never the whole of either file/.test(lane)) fail('(d) the practice-review lane does not open each pass subagent on its slice');
}
