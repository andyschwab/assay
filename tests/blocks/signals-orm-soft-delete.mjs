// ── window read on an ORM soft delete, where the tree defines the table it targets (#315 slice 3;
// map/effect-signals.mjs softDeleteSignal, map/effect-signals.yaml soft_delete) ──
// Over tests/enumerate-fixture/signals-orm:
//  1. `db.update(notes).set({ deletedAt: … })`, `notes` imported from the schema file that defines it
//     with a deletedAt column, is window yes, at the set and at the column;
//  2. the same, the table imported through a path alias the tree defines once, reads alike;
//  3. a client's `<model>.update({ data: { deletedAt: … } })` on a model a schema file declares with
//     that field is window yes, at the data and at the field;
//  4. setting deletedAt on a table that declares no such column carries no signal: the write's target
//     is read, never assumed;
//  5. a handler that deletes outright carries no signal, and so does one that soft-deletes beside a
//     hard delete;
//  6. the table factories are data: with pgTable gone from the data file, (1) and (2) carry nothing.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'signals-orm-soft-delete';

const FIXTURE = join(HERE, 'enumerate-fixture', 'signals-orm');
function listed(root) {
  const r = spawnSync(process.execPath, [join(root, 'map', 'enumerate.mjs'), FIXTURE, '--json'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout).populations.routeHandlers;
}

export async function run() {
  const fail = (m) => negFailures.push('signals-orm-soft-delete: ' + m);
  const routes = listed(ROOT);
  if (!routes) { fail('enumerate over the ORM fixture failed'); return; }
  const of = (m) => routes.find((c) => c.member === m);
  const win = (m) => ((of(m) || {}).signals || []).find((s) => s.question === 'window');
  const show = (m) => JSON.stringify((of(m) || {}).signals);

  const set = win('route: DELETE /notes/:id');
  if (!set || set.supports !== 'yes' || set.evidence.join() !== 'src/db/schema.ts:7,src/routes/notes.ts:11' || !/deletedAt .*table notes/.test(set.marker)) fail(`(1) update(notes).set({ deletedAt }) is window yes, at the set and the column (got ${show('route: DELETE /notes/:id')})`);
  const alias = win('route: DELETE /admin/notes/:id');
  if (!alias || alias.evidence.join() !== 'src/db/schema.ts:7,src/routes/aliased.ts:10') fail(`(2) a table imported through an alias the tree defines once reads alike (got ${show('route: DELETE /admin/notes/:id')})`);
  const data = win('route: DELETE /v2/notes/:id');
  if (!data || data.evidence.join() !== 'prisma/schema.prisma:4,src/routes/v2.ts:10' || !/model note/.test(data.marker)) fail(`(3) a model update whose data sets deletedAt is window yes, at the data and the field (got ${show('route: DELETE /v2/notes/:id')})`);
  if (!of('route: DELETE /feedback/:id') || of('route: DELETE /feedback/:id').signals.length) fail(`(4) deletedAt set on a table that declares no such column carries no signal (got ${show('route: DELETE /feedback/:id')})`);
  if (!of('route: POST /notes/:id/purge') || of('route: POST /notes/:id/purge').signals.length) fail(`(5) a handler that deletes outright carries no signal (got ${show('route: POST /notes/:id/purge')})`);
  if (!of('route: DELETE /notes/:id/everything') || of('route: DELETE /notes/:id/everything').signals.length) fail(`(5) a handler that soft-deletes beside a hard delete carries no signal (got ${show('route: DELETE /notes/:id/everything')})`);

  const tmp = mkdtempSync(join(tmpdir(), 'assay-signals-orm-'));
  try {
    const root = join(tmp, 'engine');
    for (const d of ['map', 'lib', 'yardstick']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
    const yp = join(root, 'map', 'effect-signals.yaml');
    writeFileSync(yp, readFileSync(yp, 'utf8').replace('- factory: pgTable', '- factory: someOtherTable'));
    const r2 = listed(root);
    const n = (m) => ((r2 || []).find((c) => c.member === m) || { signals: [] }).signals.length;
    if (!r2 || n('route: DELETE /notes/:id') || n('route: DELETE /admin/notes/:id') || !n('route: DELETE /v2/notes/:id')) fail(`(6) with pgTable gone from the data file, the table readings carry nothing and the model reading still holds (${JSON.stringify((r2 || []).map((c) => [c.member, c.signals.length]))})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
