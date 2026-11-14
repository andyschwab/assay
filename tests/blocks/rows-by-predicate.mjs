// ── rows-by-predicate: a view of a population is built one way (#339) ────────
// views/rows.mjs's buildRows(run, select) is the documented way any reader of a run
// builds the rows of the requirements it watches (CONSUMERS.md, "Modules"). A consumer
// that watches its own list of requirements passes a predicate over the register's rows,
// and needs no tag on the yardstick to do it. Pinned here:
//   (a) a predicate over an id list selects exactly those rows, each once across
//       open/met/to_run/not_applicable;
//   (b) the rows come in tier order, then register order, whatever order the list gives;
//   (c) withFloor stamps floor: true|false on every row, matching the row's floor tag;
//   (d) the tag form still selects every row carrying the tag.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { buildRows } from '../../views/rows.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'rows-by-predicate';

export async function run() {
  const fail = (m) => negFailures.push('rows-by-predicate: ' + m);
  const tmp = join(HERE, 'tmp-rows-by-predicate'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed on the notesbox fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); return; }

  const reg = loadYardstick();
  const tierRank = Object.fromEntries(reg.tiers.map((t, i) => [t, i]));
  const index = new Map(reg.requirements.map((d, i) => [d.id, i]));
  // a list across tiers, floor and not, given last-tier first and against register order
  const byTier = (t) => reg.requirements.filter((d) => d.tier === t);
  const picked = [];
  for (const t of [...reg.tiers].reverse()) {
    const rows = byTier(t);
    const floorRow = rows.find((d) => (d.tags || []).includes('floor'));
    const otherRow = [...rows].reverse().find((d) => !(d.tags || []).includes('floor'));
    for (const d of [otherRow, floorRow]) if (d && !picked.includes(d.id)) picked.push(d.id);
  }
  if (picked.length < 6) { fail(`the register must give at least six rows across tiers to select (got ${picked.length})`); rmSync(tmp, { recursive: true, force: true }); return; }
  if (!picked.some((id) => (reg.requirements.find((d) => d.id === id).tags || []).includes('floor')) || !picked.some((id) => !(reg.requirements.find((d) => d.id === id).tags || []).includes('floor')))
    fail('the selected list must mix floor rows with others, or withFloor proves nothing');
  const want = [...picked].sort((a, b) => tierRank[reg.requirements[index.get(a)].tier] - tierRank[reg.requirements[index.get(b)].tier] || index.get(a) - index.get(b));

  const ids = new Set(picked);
  const built = buildRows(tmp, (d) => ids.has(d.id), { withFloor: true });
  if (!built) { fail('buildRows must build rows over a measured run'); rmSync(tmp, { recursive: true, force: true }); return; }
  // (a) exactly the listed rows, each once
  const got = built.population.map((d) => d.id);
  const all = [...built.open, ...built.met, ...built.to_run, ...built.not_applicable];
  const rowIds = all.map((r) => r.id);
  if (got.length !== picked.length || rowIds.length !== picked.length || picked.some((id) => !rowIds.includes(id)) || new Set(rowIds).size !== rowIds.length)
    fail(`a predicate over an id list selects exactly those rows, each once across open/met/to_run/not_applicable (listed ${picked.length}: ${picked.join(', ')}; population ${got.length}: ${got.join(', ')}; rows ${rowIds.join(', ')})`);
  // (b) tier order, then register order
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`the predicate's population comes in tier order, then register order (want ${want.join(', ')}; got ${got.join(', ')})`);
  for (const [name, list] of Object.entries({ open: built.open, met: built.met, to_run: built.to_run, not_applicable: built.not_applicable })) {
    const order = list.map((r) => want.indexOf(r.id));
    if (order.some((x, i) => i && x < order[i - 1])) fail(`${name} keeps the population's order (got ${list.map((r) => r.id).join(', ')})`);
  }
  // (c) withFloor on every row, matching its floor tag
  for (const r of all) {
    const floor = (reg.requirements[index.get(r.id)].tags || []).includes('floor');
    if (r.floor !== floor) fail(`withFloor stamps floor: ${floor} on ${r.id} (got ${JSON.stringify(r.floor)})`);
  }
  // (d) the tag form: every floor row, no withFloor stamp unless asked
  const floorBuilt = buildRows(tmp, 'floor');
  const floorIds = reg.requirements.filter((d) => (d.tags || []).includes('floor')).map((d) => d.id);
  if (!floorBuilt || floorBuilt.population.length !== floorIds.length || floorIds.some((id) => !floorBuilt.population.some((d) => d.id === id)))
    fail(`the tag form selects every row carrying the tag (want ${floorIds.length}, got ${floorBuilt ? floorBuilt.population.length : 'null'})`);
  if (floorBuilt && [...floorBuilt.open, ...floorBuilt.met].some((r) => 'floor' in r)) fail('a row carries floor: only when withFloor asks for it');
  rmSync(tmp, { recursive: true, force: true });
}
