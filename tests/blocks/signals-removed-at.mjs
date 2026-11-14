// ── a removal mark reads like a soft delete (#315 slice 3; map/effect-signals.yaml soft_delete.columns) ──
// The owner's addition: a row kept with a removal mark and a restore path is a remove that restores,
// so `removedAt` / `removed_at` join the soft-delete columns. Over tests/enumerate-fixture/signals-orm:
//  1. `update(members).set({ removedAt: … })`, on a table that declares removedAt, is window yes, at
//     the set and at the column;
//  2. a literal `UPDATE team_members SET removed_at = …` is window yes at the statement;
//  3. both come from the data file: with the two entries gone, neither carries a signal.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'signals-removed-at';

const FIXTURE = join(HERE, 'enumerate-fixture', 'signals-orm');
const ORM = 'route: DELETE /members/:id', SQL = 'route: DELETE /teams/:team/members/:id';
function windowOf(root) {
  const r = spawnSync(process.execPath, [join(root, 'map', 'enumerate.mjs'), FIXTURE, '--json'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const routes = JSON.parse(r.stdout).populations.routeHandlers;
  return (m) => { const c = routes.find((x) => x.member === m); return c ? (c.signals || []).find((s) => s.question === 'window') || null : undefined; };
}

export async function run() {
  const fail = (m) => negFailures.push('signals-removed-at: ' + m);
  const win = windowOf(ROOT);
  if (!win) { fail('enumerate over the ORM fixture failed'); return; }
  const orm = win(ORM), sql = win(SQL);
  if (!orm || orm.supports !== 'yes' || orm.evidence.join() !== 'src/db/schema.ts:18,src/routes/members.ts:10' || !/removedAt .*table members/.test(orm.marker)) fail(`(1) update(members).set({ removedAt }) is window yes, at the set and the column (got ${JSON.stringify(orm)})`);
  if (!sql || sql.supports !== 'yes' || sql.evidence.join() !== 'src/routes/members.ts:15' || sql.marker !== 'soft delete: removed_at') fail(`(2) UPDATE … SET removed_at is window yes at the statement (got ${JSON.stringify(sql)})`);

  const tmp = mkdtempSync(join(tmpdir(), 'assay-signals-removed-'));
  try {
    const root = join(tmp, 'engine');
    for (const d of ['map', 'lib', 'yardstick']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
    const yp = join(root, 'map', 'effect-signals.yaml');
    writeFileSync(yp, readFileSync(yp, 'utf8').replace(/    - column: removed_at\n.*\n    - column: removedAt\n.*\n/, ''));
    const w2 = windowOf(root);
    if (!w2 || w2(ORM) !== null || w2(SQL) !== null) fail(`(3) with removedAt and removed_at gone from the data file, neither route carries a window signal (got ${w2 && JSON.stringify([w2(ORM), w2(SQL)])})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
