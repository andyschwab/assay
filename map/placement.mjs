// placement.mjs — the property a reviewer's row observes, read off its adapter (#306).
//
// A reviewer (an adapter whose ingest format is machine-report, map/scanners/CONTRACT.md §3)
// files each finding under its own native category. Which property that category observes is a
// field of the reviewer's adapter, never of the core (CLAUDE.md rule 7), and the mapping is
// closed: every category in the adapter's `map:` names the one property its rows observe
// (`property:`), or, where one category spans several properties, the closed list of them
// (`properties:`), from which the reviewer names one on each finding (its `property:`, ingested
// as `native_property`). Nothing is placed by nearness: a row whose category names no property,
// or a split category's row that names none of its list, is unplaced, with the reason, and a
// requirement never takes it on a guess (yardstick/population.mjs, yardstick/measure.mjs).
//
// A split category may also name, per property, a closed list of `markers:` (#316): words or
// phrases the reviewer's own labels on a finding carry (its tag, `native_tag`, and its title).
// A finding that names no property of the list is placed by them when the markers of exactly
// one property appear in those labels as whole words; markers of none, or of two, leave it
// unplaced with the reason. The reviewer's own `property:` always wins, and its observation is
// never read: the markers are the reviewer's labels, not a reading of its prose.
//
// A row of any other source carries its own `property:` (map/SCHEMA.md §1), read as it is.

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// a label or marker as whole words: lowercase, every run of other characters one space
const words = (t) => ` ${String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The properties of a split category whose markers a finding's own labels carry.
 * @param {any} finding @param {any} entry  the category's map entry */
function markedProperties(finding, entry) {
  const labels = words(`${finding?.native_tag ?? ''} ${finding?.title ?? ''}`);
  return (Array.isArray(entry?.properties) ? entry.properties : []).filter((p) =>
    (Array.isArray(entry?.markers?.[p]) ? entry.markers[p] : []).some((m) => words(m).trim() && labels.includes(words(m))));
}

/** Whether an adapter is a reviewer's: its rows are placed on a property by its map.
 * @param {any} adapter */
const placesByProperty = (adapter) => adapter?.ingest?.format === 'machine-report';

/**
 * The property a finding observes, and why it has none when its source's adapter cannot place it.
 * @param {any} finding  a finding of a run (map/SCHEMA.md §1), or a reviewer's ingested row
 * @param {Record<string, any>} adapters  the adapters (map/project.mjs loadAdapters)
 * @returns {{ property: string|null, unplaced: string|null }}
 *   unplaced: the reason a reviewer's row carries no property, or null
 */
export function propertyOf(finding, adapters) {
  const own = typeof finding?.property === 'string' && finding.property ? finding.property : null;
  const adapter = finding?.source ? adapters?.[finding.source] : null;
  if (!placesByProperty(adapter)) return { property: own, unplaced: null };
  const cat = String(finding.native_category ?? '');
  const entry = adapter.map?.[cat];
  if (!entry) return { property: null, unplaced: `${finding.source} category ${cat || '(none)'} is not in its adapter's map` };
  if (typeof entry.property === 'string' && entry.property) return { property: entry.property, unplaced: null };
  if (Array.isArray(entry.properties) && entry.properties.length) {
    const named = typeof finding.native_property === 'string' && finding.native_property ? finding.native_property : null;
    if (named && entry.properties.includes(named)) return { property: named, unplaced: null };
    const marked = named ? [] : markedProperties(finding, entry);
    if (marked.length === 1) return { property: marked[0], unplaced: null };
    const markers = entry.markers ? `, and its tag and title carry ${marked.length ? `markers of ${marked.join(' and ')}` : 'no marker of one'}` : '';
    return { property: null, unplaced: `${finding.source} category ${cat} spans ${entry.properties.join(', ')}, and the reviewer named ${named ? `"${named}", not one of them` : 'none'} on the finding${markers}` };
  }
  return { property: null, unplaced: `${finding.source}'s adapter names no property for category ${cat}` };
}

/**
 * Every error in a reviewer adapter's property mapping: an empty list when each category names
 * one kebab-case property or a closed list of at least two, none is a requirement id, no property
 * belongs to two categories, and each `decides:` binding on a split category names one of its list.
 * A reviewer adapter that names no property at all is valid: its rows read unplaced.
 * @param {any} adapter @param {string[]} requirementIds
 */
export function validatePlacement(adapter, requirementIds = []) {
  if (!placesByProperty(adapter)) return [];
  const at = `adapters/${adapter.scanner}.yaml`;
  const errors = [];
  const ids = new Set(requirementIds);
  const owner = new Map();
  const ok = (p, where) => {
    if (typeof p !== 'string' || !KEBAB.test(p)) { errors.push(`${at} ${where}: a property is kebab-case (got ${JSON.stringify(p)})`); return; }
    if (ids.has(p)) errors.push(`${at} ${where}: "${p}" is a requirement id; a property names what is observed, the yardstick binds it (map/SCHEMA.md §1)`);
    if (owner.has(p) && owner.get(p) !== where) errors.push(`${at} ${where}: "${p}" is already ${owner.get(p)}'s`);
    owner.set(p, where);
  };
  for (const [cat, e] of Object.entries(adapter.map || {})) {
    const where = `map.${cat}`;
    if (e?.property !== undefined && e?.properties !== undefined) errors.push(`${at} ${where}: names property and properties; one category observes one property, or names the closed list the reviewer chooses from`);
    if (e?.property !== undefined) ok(e.property, where);
    if (e?.properties !== undefined) {
      if (!Array.isArray(e.properties) || e.properties.length < 2) errors.push(`${at} ${where}: properties is a list of at least two (one property is property:)`);
      else for (const p of e.properties) {
        ok(p, where);
        // the reviewer chooses by what each means, which the lane states (map/lane.mjs)
        if (!(typeof e.means?.[p] === 'string' && e.means[p].trim())) errors.push(`${at} ${where}: properties names "${p}" with no means: (what it covers, which the lane states to the reviewer)`);
      }
      // markers (#316): closed, per property of the list, and no marker names two properties
      if (e.markers !== undefined) {
        if (!e.markers || typeof e.markers !== 'object' || Array.isArray(e.markers)) errors.push(`${at} ${where}: markers is a map of property to its marker words`);
        else {
          const seen = new Map();
          for (const [p, ms] of Object.entries(e.markers)) {
            if (!(e.properties || []).includes(p)) errors.push(`${at} ${where}: markers names "${p}", not one of its properties`);
            if (!Array.isArray(ms) || !ms.length || !ms.every((m) => typeof m === 'string' && words(m).trim())) { errors.push(`${at} ${where}: markers.${p} is a non-empty list of words or phrases`); continue; }
            for (const m of ms) {
              const k = words(m);
              if (seen.has(k) && seen.get(k) !== p) errors.push(`${at} ${where}: marker "${m}" names both ${seen.get(k)} and ${p}`);
              seen.set(k, p);
            }
          }
        }
      }
    } else if (e?.markers !== undefined) errors.push(`${at} ${where}: markers are a split category's (properties:)`);
  }
  for (const [i, b] of (Array.isArray(adapter.decides) ? adapter.decides : []).entries()) {
    const where = `decides[${i}] (${b?.requirement})`;
    const cats = (Array.isArray(b?.category) ? b.category : [b?.category]).map(String);
    const split = cats.filter((c) => Array.isArray(adapter.map?.[c]?.properties));
    if (b?.property === undefined) {
      if (split.length) errors.push(`${at} ${where}: category ${split.join(', ')} spans several properties; the binding names the one its requirement reads (property:)`);
      continue;
    }
    const allowed = cats.flatMap((c) => adapter.map?.[c]?.properties || (adapter.map?.[c]?.property ? [adapter.map[c].property] : []));
    if (!allowed.includes(b.property)) errors.push(`${at} ${where}: property "${b.property}" is not one category ${cats.join(', ')} observes (${allowed.join(', ') || 'none'})`);
  }
  return errors;
}

/** The categories a reviewer's adapter splits, each with its properties and what each means:
 * [{ category, properties: [{ property, means }] }], the lane's statement to the reviewer.
 * @param {any} adapter */
export function splitCategories(adapter) {
  if (!placesByProperty(adapter)) return [];
  return Object.entries(adapter.map || {}).filter(([, e]) => Array.isArray(e?.properties) && e.properties.length)
    .map(([category, e]) => ({ category, properties: e.properties.map((p) => ({ property: String(p), means: String(e.means?.[p] ?? '') })) }));
}
