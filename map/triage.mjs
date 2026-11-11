// triage.mjs — one triage contract, read for two closed populations (#259, #286; map/SCHEMA.md §6e).
//
// A closed population is a list a tool wrote (map/raw/enumerate.json) and a triage a lane wrote:
// one entry per candidate, either the finding that judges it or out of scope with the reason. The
// effect triage (map/effect-triage.mjs) and the census triage (map/census-triage.mjs) hold their
// entries to the same rules here, so "every candidate once" has one implementation:
//   • entryErrors: validate's check of a list of entries against the candidates;
//   • closure: the measurement's read, which candidates a holding entry triages.
// What differs is passed in: which findings may judge a candidate (an effect finding of the run;
// a member of the census), and whether one finding may judge several candidates (an effect
// finding may cover several; a census member is one candidate's, so a lane cannot merge them).

const TRIAGE_KEYS = ['candidate', 'finding', 'out_of_scope'];
const reasonOf = (x) => typeof x.out_of_scope === 'string' ? x.out_of_scope.trim() : '';
const hasFinding = (x) => x.finding !== undefined && x.finding !== null && x.finding !== '';

/**
 * Every error in a triage's entries against its candidates.
 * @param {any[]} entries
 * @param {string[]} candidates
 * @param {{ at: string, notListed: (c: string) => string, missingCandidate: string,
 *   exactlyOne: string, reasonHint: string, findingError: (id: string) => string|null,
 *   oneEach?: boolean, missing: (cs: string[]) => string }} o
 *   at: the label an entry's index is appended to; findingError: why a finding id may not judge a
 *   candidate here, or null; oneEach: a finding judges at most one candidate
 */
export function entryErrors(entries, candidates, o) {
  const errors = [];
  const listed = new Set(candidates), seen = new Map(), judged = new Map();
  entries.forEach((x, i) => {
    const at = `${o.at}[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { errors.push(`${at}: an entry is a map (candidate, and finding or out_of_scope)`); return; }
    for (const k of Object.keys(x)) if (!TRIAGE_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}" (${TRIAGE_KEYS.join(', ')})`);
    const c = typeof x.candidate === 'string' ? x.candidate : null;
    if (!c) errors.push(`${at}: missing candidate (${o.missingCandidate})`);
    else if (!listed.has(c)) errors.push(`${at}: "${c}" ${o.notListed(c)}`);
    else if (seen.has(c)) errors.push(`${at}: "${c}" is triaged twice (also ${o.at}[${seen.get(c)}]): one entry per candidate`);
    if (c && !seen.has(c)) seen.set(c, i);
    const hasF = hasFinding(x), hasO = x.out_of_scope !== undefined;
    if (hasF === hasO) errors.push(`${at}: give exactly one of ${o.exactlyOne}`);
    else if (hasF) {
      const id = String(x.finding);
      const why = o.findingError(id);
      if (why) errors.push(`${at}: finding ${id} ${why}`);
      else if (o.oneEach && judged.has(id)) errors.push(`${at}: finding ${id} already judges ${o.at}[${judged.get(id)}]'s candidate: one candidate, one member, so a lane neither splits nor merges them`);
      if (!judged.has(id)) judged.set(id, i);
    } else if (!reasonOf(x)) errors.push(`${at}: out_of_scope needs the reason (${o.reasonHint})`);
  });
  const missing = candidates.filter((c) => !seen.has(c));
  if (missing.length) errors.push(o.missing(missing));
  return errors;
}

/**
 * Which candidates a holding entry triages: a candidate counts triaged only by an entry that holds
 * (a finding `holds` accepts, or a reason), so a bad entry never reads as a closed one.
 * @param {string[]} candidates @param {any} entries @param {(id: string) => boolean} holds
 * @returns {{ untriaged: string[], judged: Map<string, string>, outOfScope: string[] }}
 *   judged: candidate → the finding that judges it
 */
export function closure(candidates, entries, holds) {
  const ok = new Map();
  for (const x of Array.isArray(entries) ? entries : []) {
    if (!x || typeof x !== 'object' || typeof x.candidate !== 'string' || ok.has(x.candidate)) continue;
    if (hasFinding(x) && holds(String(x.finding))) ok.set(x.candidate, { finding: String(x.finding) });
    else if (!hasFinding(x) && reasonOf(x)) ok.set(x.candidate, { out_of_scope: reasonOf(x) });
  }
  const judged = new Map(candidates.filter((c) => ok.get(c)?.finding).map((c) => [c, ok.get(c).finding]));
  return { untriaged: candidates.filter((c) => !ok.has(c)), judged, outOfScope: candidates.filter((c) => ok.get(c)?.out_of_scope) };
}
