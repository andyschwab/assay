// ── every checklist answer has one definition, with an example of each value it takes (#337;
// map/SCHEMA.md §6e, "The answers", map/effect-answers.mjs) ──
// Three blind lanes over one real target agreed per answer from 85% (refuses_unless) down to 15%
// (declared_scope): three careful readers parting that often read different things into the same
// words. So each question of the checklist is defined once, in §6e's "The answers", and the
// definition says what the question asks, which mechanisms count and which do not, and what
// evidence decides it and where it is cited; after it, an example of each value the answer can
// take, as a reader meets it in a tree. The questions and their values are read from the checklist
// itself (CHECKLIST_KEYS, ANSWER_VALUES, and for HELD_BY_QUESTION a yes per HELD_BY value), never
// from a second list here, so a question or a value the checklist gains is undefined until §6e
// defines it:
//  1. every question has its definition group (a line opening **`<key>`** — ), exactly once in
//     SCHEMA.md, with its four parts (*Asks:*, *Counts:*, *Does not count:*, *Evidence:*), each
//     saying enough to decide by;
//  2. each value of the question has its example (a list item opening `<value>` — , and for
//     HELD_BY_QUESTION `yes`, `held_by: <who>` — ), and no example names a value the checklist
//     does not admit;
//  3. no definition group names a question the checklist does not ask.
// The lane prompt restating a definition is tests/blocks/lane-prompt-restates-no-answer.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKLIST_KEYS, ANSWER_VALUES, HELD_BY, HELD_BY_QUESTION } from '../../map/effect-answers.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'checklist-answers-defined';

export const PARTS = ['Asks', 'Counts', 'Does not count', 'Evidence'];
const OPEN = '**The answers**', CLOSE = '**The signals**';

/**
 * §6e's "The answers", parsed: { key: { head, parts: { Asks, … }, examples: { label: text } } }.
 * A group opens on a line **`<key>`** — ; a part is a line opening *<Part>:* and runs to the next
 * part, example or blank line; an example is a list item `- \`<label>\` — <text>`, where a label is
 * a value, or for a qualified yes the value and its qualifier (`yes`, `held_by: code`).
 * @param {string} schema
 */
export function answerDefinitions(schema) {
  const a = schema.indexOf(OPEN), b = schema.indexOf(CLOSE, a);
  if (a < 0 || b < 0) return null;
  /** @type {Record<string, { head: string, parts: Record<string, string>, examples: Record<string, string> }>} */
  const out = {};
  let cur = null, part = null;
  for (const l of schema.slice(a, b).split('\n')) {
    const g = l.match(/^\*\*`([a-z_]+)`\*\* — (.*)$/);
    if (g) { cur = out[g[1]] = { head: g[2], parts: {}, examples: {} }; part = null; continue; }
    if (!cur) continue;
    if (!l.trim()) { part = null; continue; }
    const p = l.match(/^\*([A-Z][a-z ]+):\* (.*)$/);
    if (p) { part = p[1]; cur.parts[part] = p[2]; continue; }
    const e = l.match(/^- `([^`]+)`(?:, `([^`]+)`)? — (.*)$/);
    if (e) { cur.examples[e[2] ? `${e[1]}, ${e[2]}` : e[1]] = e[3]; part = null; continue; }
    if (part) cur.parts[part] += ' ' + l.trim();
  }
  return out;
}

/** The example labels the checklist requires of one question. @param {string} key */
export function labelsFor(key) {
  return ANSWER_VALUES.flatMap((v) => (key === HELD_BY_QUESTION && v === 'yes' ? HELD_BY.map((h) => `yes, held_by: ${h}`) : [v]));
}

export async function run() {
  const fail = (m) => negFailures.push('checklist-answers-defined: ' + m);
  const schema = readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8');
  const defs = answerDefinitions(schema);
  if (!defs) { fail(`map/SCHEMA.md §6e has no "${OPEN}" paragraph closed by "${CLOSE}"`); return; }
  if (!CHECKLIST_KEYS.length || !ANSWER_VALUES.length) { fail('map/effect-answers.mjs exports no checklist to read the questions and values from'); return; }

  for (const key of CHECKLIST_KEYS) {
    const d = defs[key];
    if (!d) { fail(`the checklist's question ${key} has no definition in §6e, "The answers" (a line opening **\`${key}\`** — )`); continue; }
    const homes = schema.split(`**\`${key}\`** — `).length - 1;
    if (homes !== 1) fail(`${key} is defined ${homes} times in map/SCHEMA.md: a question's definition has one place, §6e's "The answers"`);
    for (const p of PARTS) {
      if (!(p in d.parts)) fail(`${key}'s definition has no *${p}:* part (what it asks, what counts and what does not, the evidence that decides it)`);
      else if (d.parts[p].length < 40) fail(`${key}'s *${p}:* says too little to decide by: "${d.parts[p]}"`);
    }
    const want = labelsFor(key);
    for (const v of want) {
      if (!(v in d.examples)) fail(`${key} has no example of the value ${v}: every value an answer can take has one, as a reader meets it in a tree`);
      else if (d.examples[v].length < 30) fail(`${key}'s example of ${v} says too little to recognise: "${d.examples[v]}"`);
    }
    for (const v of Object.keys(d.examples)) if (!want.includes(v)) fail(`${key} gives an example of "${v}", which is not a value its answer takes (${want.join('; ')})`);
  }
  for (const key of Object.keys(defs)) if (!CHECKLIST_KEYS.includes(key)) fail(`§6e, "The answers", defines ${key}, which is not a question of the checklist (${CHECKLIST_KEYS.join(', ')})`);
}
