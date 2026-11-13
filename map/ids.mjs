// ids.mjs — the two finding-id ranges of a run (#304; map/SCHEMA.md §3, "Two ranges").
//
// A run's findings arrive two ways: a review lane writes its own (the built-in scanner's
// passes, authored in a scratch run that holds no instrument rows), and `assay ingest`
// allocates every other scanner's, instrument and reviewer alike. The lane cannot see the
// ids ingest gave, so the two never share a range: a lane numbers below INGEST_FLOOR, and
// ingest allocates at or above it. Neither renumbers the other, and nothing renumbers a
// stored run. validate holds the boundary both ways (map/validate.mjs).
//
// A run record that carries `ingest_ids_from:` (map/start.mjs writes it) was drawn under
// these ranges, and validate holds an ingested row below the floor there; a stored run drawn
// before them carries none, keeps its ids, and is held only on its lane side, which no run
// before them ever crossed.

export const INGEST_FLOOR = 10000;
export const LANE_RANGE = `F-001..F-${INGEST_FLOOR - 1}`;
export const INGEST_RANGE = `F-${INGEST_FLOOR} and above`;
// the run record's key: the floor the run's ingests allocated from
export const RECORD_KEY = 'ingest_ids_from';

/** The number an id carries, or null when it is not a well-formed F-### id.
 * @param {unknown} id */
export function idNumber(id) {
  const m = /^F-(\d{3,})$/.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
}

/** Whether a finding is a lane's own (the built-in scanner's: no `source`, or practice-review),
 * rather than a row ingest allocated.
 * @param {any} f */
const isLaneFinding = (f) => !f?.source || f.source === 'practice-review';

/** The range violation of one finding, or null. ingestHeld: the run record carries the
 * ranges (RECORD_KEY), so an ingested row below the floor is held as well.
 * @param {any} f @param {boolean} ingestHeld */
export function rangeError(f, ingestHeld) {
  const n = idNumber(f?.id);
  if (n === null) return null;   // a malformed id is its own error
  if (isLaneFinding(f) && n >= INGEST_FLOOR) return `a lane's finding is numbered in the ingest range (${INGEST_RANGE}); a lane numbers its findings ${LANE_RANGE}, so no ingested row can take its id`;
  if (!isLaneFinding(f) && ingestHeld && n < INGEST_FLOOR) return `an ingested ${f.source} row is numbered in the lane range (${LANE_RANGE}); ingest allocates ${INGEST_RANGE}, so no lane finding can take its id (re-ingest it: node assay.mjs ingest)`;
  return null;
}
