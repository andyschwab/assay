// quadrants.mjs — where a fix-sequence item sits, consequence against confidence (#319, slice 3).
//
// Every item records two dimensions, each by its own stated rule: its CONFIDENCE (how much assay
// knows, map/confidence.mjs) and its CONSEQUENCE (what is at stake, map/consequence.mjs). This
// module places the item in one of four quadrants by the two recorded values ALONE, through the
// rules below, stated once. It never re-derives a dimension, never reads a severity label, a
// scanner's name or the item's kind, and never sums, multiplies or weights the two scales into a
// number: a rule names the values it takes, and the first rule that fires decides.
//
// An item whose consequence is `unvalued` (no rule of the consequence policy reads a fact the run
// holds of it) has NO quadrant: the quadrant would be a guess at what is at stake. It is listed
// apart, as not valued, with the reason its consequence carries. That holds before any rule: a
// rule that reads confidence alone (a known misfire, a step that could not run) still needs the
// item's stake to be known to place it, and placing an unvalued item would put a stake on it that
// no fact gave.
//
// The quadrants (views/README.md, "Where an item sits"):
//   act-now       a high stake, confirmed;
//   verify-first  a high stake assay does not yet know, or a step that could not run: measure first;
//   hygiene       a low stake, confirmed;
//   park          a low stake assay does not yet know, or a rule its adapter says does not apply here.
import { CONFIDENCE } from '../../map/confidence.mjs';
import { CONSEQUENCE, UNVALUED } from '../../map/consequence.mjs';

export const QUADRANTS = ['act-now', 'verify-first', 'hygiene', 'park'];
// what an item with no quadrant is listed as (its consequence is unvalued)
export const NOT_VALUED = 'not-valued';
export const QUADRANT_WORDS = { 'act-now': 'act now', 'verify-first': 'verify first', hygiene: 'hygiene', park: 'park', [NOT_VALUED]: 'not valued' };

const HIGH = ['severe', 'significant'];
const LOW = ['contained', 'cosmetic'];

// THE RULES, tried in order; the first whose `confidence` and `consequence` both list the item's
// values decides. Each lists the values it takes, never a range or a threshold over a number.
export const QUADRANT_RULES = [
  { name: 'known-misfire-parks', quadrant: 'park', confidence: ['known-misfire'], consequence: CONSEQUENCE,
    says: 'the adapter says this rule does not apply in this context; whatever is at stake, the finding stays visible and is parked' },
  { name: 'not-measured-verifies-first', quadrant: 'verify-first', confidence: ['not-measured'], consequence: CONSEQUENCE,
    says: 'the step could not run, so nothing was measured; whatever is at stake, the next act is to measure' },
  { name: 'high-stake-confirmed', quadrant: 'act-now', confidence: ['confirmed'], consequence: HIGH,
    says: 'severe or significant, and confirmed' },
  { name: 'high-stake-unconfirmed', quadrant: 'verify-first', confidence: ['judged', 'absent-evidence'], consequence: HIGH,
    says: 'severe or significant, and judged or resting on an absent evidence file: confirm it before acting' },
  { name: 'low-stake-confirmed', quadrant: 'hygiene', confidence: ['confirmed'], consequence: LOW,
    says: 'contained or cosmetic, and confirmed' },
  { name: 'low-stake-unconfirmed', quadrant: 'park', confidence: ['judged', 'absent-evidence'], consequence: LOW,
    says: 'contained or cosmetic, and judged or resting on an absent evidence file' },
];
const RULE_BY_NAME = new Map(QUADRANT_RULES.map((r) => [r.name, r]));
export const quadrantRule = (name) => RULE_BY_NAME.get(name) || null;

// The quadrant of one item: { value, rule } from its recorded confidence and consequence values,
// or null when its consequence is unvalued (listed apart as not valued). A pair no rule takes, or
// a value outside its scale, throws: no quadrant without its rule, never a default.
export function quadrantOf(confidence, consequence) {
  const conf = confidence && confidence.value;
  const cons = consequence && consequence.value;
  if (!CONFIDENCE.includes(conf)) throw new Error(`no quadrant: confidence ${JSON.stringify(conf)} is not a value of its scale (${CONFIDENCE.join(', ')})`);
  if (cons === UNVALUED) return null;
  if (!CONSEQUENCE.includes(cons)) throw new Error(`no quadrant: consequence ${JSON.stringify(cons)} is not a value of its scale (${CONSEQUENCE.join(', ')}) nor ${UNVALUED}`);
  const r = QUADRANT_RULES.find((x) => x.confidence.includes(conf) && x.consequence.includes(cons));
  if (!r) throw new Error(`no quadrant rule takes confidence ${conf} with consequence ${cons}`);
  return { value: r.quadrant, rule: r.name };
}

// How many of an item's gaps hold each value, in the scale's order (`order`), the values no gap
// holds left out: { confirmed: 22, 'known-misfire': 1 }. A count, never a weight.
export function mixOf(values, order) {
  const n = new Map();
  for (const v of values) n.set(v, (n.get(v) || 0) + 1);
  const out = {};
  for (const v of order) if (n.has(v)) out[v] = n.get(v);
  for (const v of n.keys()) if (!order.includes(v)) throw new Error(`mix: ${JSON.stringify(v)} is not a value of the scale (${order.join(', ')})`);
  return out;
}
export const CONFIDENCE_MIX_ORDER = CONFIDENCE;
export const CONSEQUENCE_MIX_ORDER = [...CONSEQUENCE, UNVALUED];

// The mix in words, only when it holds more than one value ("22 confirmed, 1 known misfire"), else ''.
export function mixPhrase(mix) {
  const ks = Object.keys(mix || {});
  if (ks.length < 2) return '';
  return ks.map((k) => `${mix[k]} ${k === UNVALUED ? 'not valued' : k.replace(/-/g, ' ')}`).join(', ');
}
