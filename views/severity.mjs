// severity.mjs — the severity bands for assay's own instruments' rows, computed in
// the view layer (#53, F-1230). An instrument row in the map records only the facts
// (a check's score, a fresh-clone step's status, an advisory's own severity, a
// fail-open CI gate); CLAUDE.md rule 1: the map never asserts a severity. The
// projection (map/project.mjs projectMulti) hands every view the row with the band
// computed here, so each view reads one severity for one row.
//
// A peer scanner's own label (a reviewer's `severity`) is a property it
// reports, kept as-is (map/scanners/CONTRACT.md §2); an analyst's practice-review row
// likewise. Only the instruments below are banded here, and for them the band is
// the only severity a view reads.
//
//   fresh-clone      install / build / test failed or timed out → High · any other gap → Medium
//   dependency-scan  advisory critical → Critical · high → High · moderate → Medium ·
//                    low, info → Low · lockfile-failed → Medium
//   repo-census      ci-gate with a fail-open step (`fail_open: true`) → High · any other gap → Medium
// An external instrument's bands are its adapter's (below); one whose adapter names none
// is unrated: a committed secret, for one, is ranked by the reader.
import { loadAdapters } from '../map/project.mjs';

const ADVISORY = { critical: 'Critical', high: 'High', moderate: 'Medium', low: 'Low', info: 'Low' };
const BANDS = {
  'fresh-clone': (f) => ['install', 'build', 'test'].includes(f.native_category) && /:(failed|timed-out)$/.test(String(f.native_id ?? '')) ? 'High' : 'Medium',
  'dependency-scan': (f) => ADVISORY[f.native_category] || 'Medium',
  'repo-census': (f) => f.native_category === 'ci-gate' && f.fail_open === true ? 'High' : 'Medium',
};

// An instrument run off its adapter (map/scanners/CONTRACT.md §3a) carries its bands
// there: `bands:` maps a value to a band, read from the row's `detail.tool_severity` when
// it has one, else its native category, with `default` for any other value. A scored
// check (the check-scores format, its score native_id's tail) reads `bands.by_score`
// instead: the first `{ at_most, band }` its score falls at or under, else `default`. The
// core names no external tool (CLAUDE.md rule 7).
let ADAPTER_BANDS = null;
const adapterBand = (f) => {
  ADAPTER_BANDS ??= Object.fromEntries(Object.values(loadAdapters()).filter((a) => a.bands && typeof a.bands === 'object').map((a) => [a.scanner, a.bands]));
  const b = ADAPTER_BANDS[f.source];
  if (!b) return null;
  if (Array.isArray(b.by_score)) {
    const m = String(f.native_id ?? '').match(/:(-?\d+)$/);
    const hit = m && b.by_score.find((x) => Number(m[1]) <= Number(x.at_most));
    return (hit && hit.band) || b.default || null;
  }
  const v = f.detail?.tool_severity ?? f.native_category;
  return b[String(v)] ?? b.default ?? null;
};

// the severity a view reads for one finding: an instrument gap's computed band, else
// the row's own label (a peer scanner's or an analyst's), else none (unrated)
export function severityOf(f) {
  const band = f && f.polarity === 'gap' && BANDS[f.source];
  if (band) return band(f);
  const fromAdapter = f && f.polarity === 'gap' ? adapterBand(f) : null;
  return fromAdapter ?? (f ? f.severity : undefined);
}
