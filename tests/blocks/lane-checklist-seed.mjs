// ── the practice-review lane's checklist mode seeds only the effect checklist (#338) ──
// A full lane costs about USD 9–27 on a real target, so d-effect-facts-legible was too dear to read
// there. `assay lane practice-review --mode checklist` seeds a session that answers only what the
// effect rows read. Pinned:
//   (a) the seed is the checklist mode's: mode checklist, its outputs exactly the terrain, the
//       triage and the delegation pass's file, its passes the delegation pass alone, and its
//       check `validate --lane practice-review ... --mode checklist`;
//   (b) it names the delegation pass's effect work, every row map/passes.yaml's checklist: decides,
//       and the nine questions of the checklist (map/effect-answers.mjs CHECKLIST_KEYS);
//   (c) it names no other row the lane decides, no context list (the row or its list's name), no
//       census, and no discovery question (the property or its text), read from map/passes.yaml
//       and the yardstick, and no pass file but the delegation pass's;
//   (d) the checklist text is rendered from map/passes.yaml (a slice naming another row renders
//       it), never written twice;
//   (e) the full mode stays the default: its outputs are every pass's file and both censuses, and
//       neither seed carries a mode marker; a mode the lane does not offer is refused;
//   (f) the slice is held to its pass and the yardstick (map/passes.mjs checklistErrors): the map as
//       committed holds; a slice that leaves out a row its pass decides from the effects alone, or
//       names a row whose rule reads more (a census), or names §6b, is refused, naming it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { loadPasses, loadChecklist, checklistText, checklistErrors } from '../../map/passes.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-checklist-seed';

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

export async function run() {
  const fail = (m) => negFailures.push('lane-checklist-seed: ' + m);
  const seed = laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run', mode: 'checklist' });
  const p = seed.prompt.replace(/\s+/g, ' ');
  const checklist = loadChecklist();
  const passes = loadPasses();
  if (!checklist) { fail('map/passes.yaml names a checklist: slice'); return; }
  const pass = passes.find((x) => x.id === checklist.pass);

  // (a)
  const want = ['map/terrain.md', 'map/effect-triage.yaml', `map/findings/practice-review-${checklist.pass}.yaml`];
  if (seed.mode !== 'checklist') fail(`(a) the seed carries its mode, checklist (got ${seed.mode})`);
  if (JSON.stringify(seed.outputs) !== JSON.stringify(want)) fail(`(a) the checklist mode publishes exactly ${want.join(', ')} (got ${seed.outputs.join(', ')})`);
  if (JSON.stringify(seed.passes) !== JSON.stringify([checklist.pass])) fail(`(a) the checklist mode runs the ${checklist.pass} pass alone (got ${seed.passes.join(', ')})`);
  if (!p.includes('validate <scratch>/run --lane practice-review --target <checkout> --mode checklist`')) fail('(a) the checklist seed checks its own run with validate --lane practice-review --mode checklist');

  // (b)
  if (!p.includes(`practice-review-${checklist.pass}.yaml`) || !/only effect findings/.test(p)) fail(`(b) the seed names the ${checklist.pass} pass's effect work: its file, holding only effect findings`);
  for (const id of checklist.decides) if (!p.includes(id)) fail(`(b) the seed names ${id}, a row the checklist decides`);
  for (const k of CHECKLIST_KEYS) if (!p.includes('`' + k + '`')) fail(`(b) the seed names the checklist's question ${k}`);
  if (!p.includes(`${CHECKLIST_KEYS.length} questions`)) fail(`(b) the seed says the checklist has ${CHECKLIST_KEYS.length} questions`);

  // (c) what no other part of the lane may leak in: every row a pass decides outside the checklist,
  // every context row and its list's name, every census, and every discovery question
  const reg = parseYaml(readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8'));
  const rows = new Map(reg.requirements.map((d) => [d.id, d]));
  const banned = [];
  for (const x of passes) {
    for (const id of x.decides) if (!checklist.decides.includes(id)) {
      banned.push([id, `${x.id}'s row`]);
      for (const c of asList(rows.get(id)?.decide?.measures)) banned.push([String(c), `${id}'s census`]);
    }
    for (const id of x.context) { banned.push([id, `${x.id}'s context row`]); for (const n of asList(rows.get(id)?.decide?.context)) banned.push([String(n), `${id}'s context list`]); }
    for (const q of x.discovery) { banned.push([q.property, `${x.id}'s discovery property`]); banned.push([q.question, `${x.id}'s discovery question`]); }
    if (x.id !== checklist.pass) banned.push([`practice-review-${x.id}.yaml`, `${x.id}'s pass file`]);
  }
  for (const [word, what] of banned) if (p.includes(word)) fail(`(c) the checklist seed names ${what}, "${word}"`);

  // (d)
  const fake = checklistText({ checklist: { ...checklist, decides: [...checklist.decides, 'd-planted-row'] }, passes, keys: CHECKLIST_KEYS });
  if (!fake.includes('d-planted-row')) fail('(d) the checklist text is rendered from map/passes.yaml: a slice naming a row renders it');
  if (!pass || !p.includes(checklistText({ checklist, passes, titles: new Map(reg.requirements.map((d) => [d.id, d.title])), keys: CHECKLIST_KEYS }).replace(/\s+/g, ' '))) fail('(d) the seed carries the text rendered from map/passes.yaml, as rendered');

  // (e)
  const full = laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' });
  if (full.mode !== 'full') fail(`(e) the full mode is the default (got ${full.mode})`);
  for (const o of ['map/censuses.yaml', 'map/census-triage.yaml', ...passes.map((x) => `map/findings/practice-review-${x.id}.yaml`)]) if (!full.outputs.includes(o)) fail(`(e) the full mode still publishes ${o}`);
  if (/--mode/.test(full.prompt)) fail('(e) the full seed names no mode in its check');
  for (const [name, s] of [['full', full], ['checklist', seed]]) if (/<!-- \/?mode:|\{\{/.test(s.prompt)) fail(`(e) the ${name} seed carries an unfilled mode marker or placeholder`);
  try { laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run', mode: 'quick' }); fail('(e) a mode the lane does not offer is refused'); }
  catch (e) { if (!/offers no mode quick \(modes: full, checklist\)/.test(e.message)) fail(`(e) a mode the lane does not offer is refused, naming the modes it offers (got: ${e.message})`); }

  // (f)
  const held = await checklistErrors(checklist, passes, reg);
  if (held.length) fail(`(f) map/passes.yaml's checklist: holds against its pass and the yardstick (got: ${held.join('; ')})`);
  const short = await checklistErrors({ ...checklist, decides: checklist.decides.filter((id) => id !== 'd-effects-traced') }, passes, reg);
  if (!short.some((e) => /decides d-effects-traced from the effect triage and the effect findings alone, and the checklist leaves it out/.test(e))) fail('(f) a slice that leaves out a row its pass decides from the effects alone is refused, naming it');
  const census = pass.decides.find((id) => rows.get(id)?.decide?.kind === 'census');
  const wide = await checklistErrors({ ...checklist, decides: [...checklist.decides, census] }, passes, reg);
  if (!wide.some((e) => e.includes(`decides ${census}, whose rule reads more than the effect triage and the effect findings`))) fail(`(f) a slice naming ${census}, a row that reads more than the effects, is refused`);
  const b6 = await checklistErrors({ ...checklist, schema: [...checklist.schema, '6b'] }, passes, reg);
  if (!b6.some((e) => /schema names §6b/.test(e))) fail('(f) a slice naming §6b, the census form, is refused');
}
