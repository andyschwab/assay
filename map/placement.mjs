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
// A row of any other source carries its own `property:` (map/SCHEMA.md §1), read as it is.

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
    return { property: null, unplaced: `${finding.source} category ${cat} spans ${entry.properties.join(', ')}, and the reviewer named ${named ? `"${named}", not one of them` : 'none'} on the finding` };
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
    }
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
