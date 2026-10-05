// hotspot.mjs — the hotspot lens on the code-maintainability axis (#111, SCHEMA §6d).
// The map records how often each file changed (structure-scan's detail.churn_90d) or
// that the history could not be read (`history: shallow | none`); the views compute the
// order from it, here, once. Rated rows rank by severity, then churn descending, then
// id; unrated rows follow, by churn descending, then id; a row with no churn sorts last
// in its band. The lens orders rows within a band and never moves a severity.
import { sevRank } from '../map/doctrine.mjs';

export const HOTSPOT_AXIS = 'code-maintainability';
const HOTSPOT_LENS = 'ranked by how often the team changes the file';
const HOTSPOT_NOT_READ = 'the history was not read (a shallow or absent git history), so these rows are not ordered by change frequency';

const churnOf = (f) => (f && f.detail && Number.isInteger(f.detail.churn_90d) ? f.detail.churn_90d : -1);
const idNum = (id) => Number(String(id).replace(/^\D+/, '')) || 0;

// a new array in the lens's order; the rows themselves are untouched
export function hotspotOrder(findings) {
  return [...findings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)
    || churnOf(b) - churnOf(a)
    || idNum(a.id) - idNum(b.id) || String(a.id).localeCompare(String(b.id)));
}

// the one-line note the axis carries: the lens when every row carries churn, else
// that the history was not read (never a ranking claimed over rows it did not rank)
export function hotspotNote(findings) {
  return findings.every((f) => churnOf(f) >= 0) ? HOTSPOT_LENS : HOTSPOT_NOT_READ;
}
