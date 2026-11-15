// lane-mode.mjs — the mode a review lane ran in, as the run record states it (#338).
//
// A lane runs in `full` (every pass, the default) or, where its lane file offers it (`modes:` in
// its frontmatter, map/lane.mjs), in `checklist`: Pass 0 kept to the effect inventory and the
// effect slice of one pass, which answers the effect checklist and nothing else (map/passes.yaml
// `checklist:`). The run record carries the mode on the lane's row, `mode: checklist`, written by
// `assay record <run> <scanner> ran --mode checklist`; a row with no `mode:` ran in full, so every
// run drawn before the modes reads as it always did. What reads it:
//   - yardstick/measure.mjs: a row the lane decides that the checklist does not reads not measured,
//     with CHECKLIST_REASON; the checklist's own rows read as the full mode reads them;
//   - map/validate.mjs: a checklist run carries exactly the checklist's outputs, and refuses another
//     pass's file, a census, and any finding that is not an effect;
//   - views/rows.mjs: the lane is named in not_seen, with the rows it left not measured;
//   - map/variance.mjs: a set with a checklist sweep reads fact presence not measured, with
//     CHECKLIST_FACTS_REASON, and compares requirements over the rows the checklist decides.
import { loadChecklist } from './passes.mjs';

const DEFAULT_MODE = 'full';

// the reason a row the checklist does not decide reads not measured (after "the <lane> lane ran in
// checklist mode: ")
const CHECKLIST_REASON = 'it answered only the effect checklist (map/passes.yaml checklist:), so this row was not looked at; run the lane in full to decide it';
// the reason a set with a checklist sweep reads fact presence not measured
export const CHECKLIST_FACTS_REASON = 'a sweep ran in checklist mode: it records only effect findings and answers no discovery question, so the facts a full sweep records it never looked for, and counting them as missed would read as variance';

/** A run-record row's mode: its `mode:`, or full when it names none. @param {any} row */
export function modeOfRow(row) {
  return row && typeof row === 'object' && typeof row.mode === 'string' && row.mode ? row.mode : DEFAULT_MODE;
}

/** The mode each scanner of a run record ran in: { scanner: mode }, for the rows that ran.
 * @param {any} manifest */
function modesOfRun(manifest) {
  const rows = manifest && manifest.scanners && typeof manifest.scanners === 'object' && !Array.isArray(manifest.scanners) ? manifest.scanners : {};
  return Object.fromEntries(Object.entries(rows).filter(([, r]) => r && r.status === 'ran').map(([id, r]) => [id, modeOfRow(r)]));
}

/** Whether any lane of a run record ran in checklist mode. @param {any} manifest */
export const ranChecklist = (manifest) => Object.values(modesOfRun(manifest)).includes('checklist');

/** The note a row the mode left unmeasured reads (yardstick/measure.mjs), and whether a note is one:
 * the one home of its words, so a view names those rows by the measurement's own note.
 * @param {string[]} lanes */
export const checklistNote = (lanes) => `${lanes.map((id) => `the ${id} lane ran in checklist mode`).join('; ')}: ${CHECKLIST_REASON}`;
/** @param {string} scanner @param {any} row a measurement row */
const leftByChecklist = (scanner, row) => !!row && row.status === 'not-measured' && typeof row.note === 'string' && row.note.includes(`the ${scanner} lane ran in checklist mode`) && row.note.endsWith(CHECKLIST_REASON);
/** One line per lane of the run record that ran in checklist mode, naming the rows it left not
 * measured: { scanner, rows: [id] }. @param {any} manifest @param {any[]} measurement */
export function leftUnmeasured(manifest, measurement) {
  return Object.entries(modesOfRun(manifest)).filter(([, m]) => m === 'checklist')
    .map(([scanner]) => ({ scanner, rows: (measurement || []).filter((r) => leftByChecklist(scanner, r)).map((r) => r.id) }));
}

/** The words a view puts on such a lane (Owner's "What was not looked at", the INDEX line).
 * @param {{ scanner: string, rows: string[] }} x */
export const partialReason = (x) => `ran in checklist mode: it answered only the effect checklist, so ${x.rows.length} requirement(s) it decides in full read not measured${x.rows.length ? ` (${x.rows.join(', ')})` : ''}`;

let DECIDES = null;
/** The rows a checklist run decides (map/passes.yaml checklist.decides). @returns {Set<string>} */
export function checklistDecides() {
  return (DECIDES ??= new Set(loadChecklist()?.decides || []));
}
