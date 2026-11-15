// ── the lane prompt points at the checklist's definitions and restates none of them (#337, #325;
// map/SCHEMA.md §6e, "The answers") ──
// A definition said twice is two homes, which drift: the practice-review lane prompt sends the
// delegation pass to §6e, "The answers", and the pass reads the definitions there. So the rendered
// prompt (map/lane.mjs laneSeed, the text a lane is given) shares no run of SHINGLE words with any
// definition or example in "The answers", words compared lower-cased with punctuation and code
// marks dropped; and it still points the delegation pass at §6e, "The answers". The definitions are
// read from SCHEMA.md as tests/blocks/checklist-answers-defined.mjs parses them, so a new or
// reworded definition is held here as soon as it is written.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { answerDefinitions } from './checklist-answers-defined.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-prompt-restates-no-answer';

const SHINGLE = 7;
const words = (t) => t.toLowerCase().replace(/[^a-z0-9_\-\s]+/g, ' ').split(/\s+/).filter(Boolean);

export async function run() {
  const fail = (m) => negFailures.push('lane-prompt-restates-no-answer: ' + m);
  const defs = answerDefinitions(readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8'));
  if (!defs || !Object.keys(defs).length) { fail('map/SCHEMA.md §6e, "The answers", holds no definition to compare the prompt against'); return; }
  const prompt = laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' }).prompt;
  const flat = ` ${words(prompt).join(' ')} `;

  for (const [key, d] of Object.entries(defs)) {
    for (const [where, text] of [...Object.entries(d.parts).map(([p, t]) => [`*${p}:*`, t]), ...Object.entries(d.examples).map(([v, t]) => [`example of ${v}`, t])]) {
      const w = words(text);
      for (let i = 0; i + SHINGLE <= w.length; i++) {
        const run = w.slice(i, i + SHINGLE).join(' ');
        if (flat.includes(` ${run} `)) { fail(`the practice-review lane prompt restates ${key}'s ${where} ("${run}"): the prompt points at map/SCHEMA.md §6e, "The answers", and never says a definition a second time`); break; }
      }
    }
  }
  if (!prompt.replace(/\s+/g, ' ').includes('the checklist (SCHEMA.md §6e, "The answers")')) fail('the practice-review lane prompt no longer points the delegation pass at the checklist in SCHEMA.md §6e, "The answers"');
}
