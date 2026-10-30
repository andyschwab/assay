// ── a retired id stays out of the tree (#188) ──
// The built-in judgment scanner and its method class were renamed. The old ids live only
// where an earlier engine's runs are read: map/migrate-run.mjs, and the blocks that turn
// a run back into that shape to pin the migration. Anywhere else, a reader or writer
// that still names one would split the tree across two names.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures, repoFiles } from '../harness.mjs';

export const label = 'retired-names';

// written split so this file does not hold them whole
const RETIRED = [['repo', 'eval'].join('-'), ['eval', 'pass'].join('-')];
const MAY = new Set(['map/migrate-run.mjs', 'tests/blocks/migrate-run-retired-id.mjs']);

export async function run() {
  const fail = (m) => negFailures.push('retired-names: ' + m);
  const files = repoFiles();
  for (const f of files) {
    if (RETIRED.some((r) => f.includes(r))) { fail(`${f}: a path names a retired id`); continue; }
    if (MAY.has(f)) continue;
    let t; try { t = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const r of RETIRED) if (t.includes(r)) fail(`${f}: names the retired id ${r} (only map/migrate-run.mjs reads it)`);
  }
}
