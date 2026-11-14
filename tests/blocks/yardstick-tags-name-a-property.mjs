// ── yardstick-tags-name-a-property: a tag names what is true of a requirement (#339) ──
// CLAUDE.md rule 7: the core names no consumer. A yardstick tag that says who reads a row
// (as `fleet` did: what one operator's routines read) is a consumer named in the register.
// So every tag in requirements.yaml's `tags:` states, in `tag_properties:`, the property of
// the requirement it names, and validateYardstick refuses one that does not. Pinned:
//   (a) the live register: every tag states a property, none names a reader, and
//       tag_properties names no tag outside `tags:`;
//   (b) a tag with no property is refused, naming the tag;
//   (c) a tag whose property names a view or a reader is refused, naming the word;
//   (d) a property for a tag the yardstick does not carry is refused;
//   (e) a register with no tag_properties at all is refused.
import { loadYardstick, validateYardstick, TAG_READER_WORDS } from '../../yardstick/measure.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'yardstick-tags-name-a-property';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-tags-name-a-property: ' + m);
  let reg;
  try { reg = loadYardstick(); } catch (e) { fail(`the register must load: ${e.message.split('\n').slice(0, 3).join(' | ')}`); return; }

  // (a)
  const props = reg.tag_properties || {};
  if (!(reg.tags || []).length) fail('the yardstick must carry a tag vocabulary for this block to mean anything');
  for (const t of reg.tags || []) {
    if (typeof props[t] !== 'string' || !props[t].trim()) fail(`(a) tag "${t}" states the property of the requirement it names (tag_properties.${t})`);
    else if (TAG_READER_WORDS.test(props[t])) fail(`(a) tag "${t}"'s property names who reads the row ("${props[t]}")`);
  }
  for (const t of Object.keys(props)) if (!(reg.tags || []).includes(t)) fail(`(a) tag_properties names "${t}", which is not in tags`);
  if (!/harm/.test(String(props.floor || ''))) fail(`(a) floor names the harm property (got "${props.floor}")`);

  const errs = (r) => validateYardstick(r);
  // (b) a tag with no property
  const noProp = errs({ ...reg, tags: [...reg.tags, 'fleet'] });
  if (!noProp.some((e) => /tag "fleet" names no property of the requirement/.test(e))) fail(`(b) a tag with no property must be refused, naming it (got ${JSON.stringify(noProp)})`);
  const blank = errs({ ...reg, tag_properties: { ...props, floor: '  ' } });
  if (!blank.some((e) => /tag "floor" names no property/.test(e))) fail('(b) a blank property must be refused');
  // (c) a property that names a reader
  for (const [word, text] of [['reads', 'what the pricing page reads first'], ['Maintain', 'the rows Maintain lists'], ['operator', "an operator's pricing input"]]) {
    const e = errs({ ...reg, tags: [...reg.tags, 'fleet'], tag_properties: { ...props, fleet: text } });
    if (!e.some((x) => new RegExp(`tag "fleet" names who reads the row \\("${word}"\\)`).test(x))) fail(`(c) a property naming a reader ("${word}") must be refused (got ${JSON.stringify(e)})`);
  }
  // (d) a property for a tag not carried
  const stray = errs({ ...reg, tag_properties: { ...props, fleet: 'its gap can be fixed by a script' } });
  if (!stray.some((e) => /tag_properties names "fleet", which is not in the yardstick's tags/.test(e))) fail('(d) a property for a tag the yardstick does not carry must be refused');
  // (e) no tag_properties
  const { tag_properties: _gone, ...bare } = reg;
  if (!errs(bare).some((e) => /tag_properties must map every tag/.test(e))) fail('(e) a register with no tag_properties must be refused');
}
