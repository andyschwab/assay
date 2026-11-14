// ── rows-hold-the-measurement: every view of one measurement covers its rows once ──
// Moved from intake-maintain-improve when the Intake and Maintain views left the engine
// (#339). What that block held of the rows was a property of views/rows.mjs's buildRows,
// which built both views, and of Improve; it is held here on buildRows directly. What it
// held of Intake's and Maintain's own files (that INTAKE.md and MAINTAIN.md were written,
// that every Maintain row carried floor:) went with those views; withFloor is held by
// rows-by-predicate. Pinned, on the notesbox fixture:
//   (a) buildRows(run, 'floor') lists every floor row exactly once across
//       open/met/to_run/not_applicable;
//   (b) improve.yaml lists every requirement exactly once;
//   (c) every claim row a run cannot decide sits in to_run with decided_by: owner;
//   (d) a row a packet decided says so: basis: owner on the row, and basisNote's words
//       ", by the owner's word" after it, where a row the run decided carries none.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { buildRows, basisNote } from '../../views/rows.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'rows-hold-the-measurement';

export async function run() {
  const fail = (m) => negFailures.push('rows-hold-the-measurement: ' + m);
  const err = (e) => String(e.stderr || e.message).split('\n').slice(-2).join(' | ');
  const reg = loadYardstick();
  const dupes = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);
  const rowsOf = (b) => [...(b.open || []), ...(b.met || []), ...(b.to_run || []), ...(b.not_applicable || [])];

  const tmp = join(HERE, 'tmp-rows-hold'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed on the notesbox fixture (${err(e)})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'topics.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`views/improve/topics.mjs must succeed (${err(e)})`); }

  // (a)
  const floor = buildRows(tmp, 'floor');
  if (!floor) fail('buildRows(run, \'floor\') must build over a measured run');
  else {
    const floorIds = reg.requirements.filter((d) => (d.tags || []).includes('floor')).map((d) => d.id);
    const ids = rowsOf(floor).map((r) => r.id);
    const missing = floorIds.filter((id) => !ids.includes(id));
    if (ids.length !== floorIds.length || missing.length || dupes(ids).length)
      fail(`every floor row must appear exactly once across buildRows's open/met/to_run/not_applicable (got ${ids.length} of ${floorIds.length} floor rows; missing ${missing.join(', ') || 'none'}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  // (b)
  if (!existsSync(join(tmp, 'views', 'improve.yaml'))) fail('views/improve.yaml must be written');
  else {
    const doc = parseYaml(readFileSync(join(tmp, 'views', 'improve.yaml'), 'utf8'));
    const ids = (doc.topics || []).flatMap((t) => (t.rows || []).map((r) => r.id));
    if (ids.length !== reg.requirements.length || dupes(ids).length)
      fail(`every requirement must appear exactly once in improve.yaml (got ${ids.length} of ${reg.requirements.length}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  // (c) a claim always reads not-measured without a packet, so it always lands in to_run
  const every = buildRows(tmp, () => true);
  const claimIds = new Set(reg.requirements.filter((d) => d.decide.kind === 'claim').map((d) => d.id));
  const toRunClaims = (every?.to_run || []).filter((r) => claimIds.has(r.id));
  if (!toRunClaims.length) fail('expected at least one claim row in to_run to check decided_by against');
  else {
    const bad = toRunClaims.filter((r) => r.decided_by !== 'owner');
    if (bad.length) fail(`decided_by must be "owner" for every claim row (got ${bad.map((r) => `${r.id}:${r.decided_by}`).join(', ')})`);
  }
  for (const r of rowsOf(every || {})) if (r.basis === 'run' && basisNote(r) !== '') fail(`a row the run decided carries no basis note (${r.id}: "${basisNote(r)}")`);

  // (d) the public packet decides d-effect-sites-tested satisfied and d-contract-test-per-vendor
  // not-applicable: both rows say the owner decided them
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--packet', join(HERE, 'fixtures', 'packet-valid'), '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --packet must succeed (${err(e)})`); }
  const decided = buildRows(tmp, () => true);
  for (const [id, list] of [['d-effect-sites-tested', 'met'], ['d-contract-test-per-vendor', 'not_applicable']]) {
    const r = (decided?.[list] || []).find((x) => x.id === id);
    if (!r) { fail(`the packet decides ${id}, so buildRows lists it under ${list}`); continue; }
    if (r.basis !== 'owner') fail(`a row the packet decided carries basis: owner (${id} got ${r.basis})`);
    if (basisNote(r) !== ", by the owner's word") fail(`a row the packet decided says so: basisNote reads ", by the owner's word" (${id} got "${basisNote(r)}")`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
