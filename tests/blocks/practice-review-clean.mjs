// ── a practice-review run whose passes all found nothing validates as a clean run (#219) ──
// The run record's rule (SCHEMA.md §5a): a scanner recorded ran carries rows in the base, or an explicit
// (possibly empty) findings file for a verified-clean run. The built-in scanner writes one file per pass
// (map/findings/practice-review-<pass>.yaml), never map/findings/practice-review.yaml, so passes that all
// found nothing read as a scanner that never ran. Pinned:
//   (a) practice-review recorded ran, every pass file present and empty: validate passes, plain and --lane;
//   (b) practice-review recorded ran with no pass file and no rows still fails, naming the pass files.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'practice-review-clean';

export async function run() {
  const fail = (m) => negFailures.push('practice-review-clean: ' + m);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-pr-clean-'));
  const adapters = loadAdapters();
  const target = join(scratch, 'target'); mkdirSync(target);
  writeFileSync(join(target, 'README.md'), '# Demo\n');
  const outputs = laneSeed('practice-review', { name: 'Demo' }, adapters).outputs;
  const runWith = (name, passFiles) => {
    const dir = join(scratch, name);
    mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
    const rows = Object.keys(adoptedAdapters(adapters)).map((id) => id === 'practice-review'
      ? `  ${id}:\n    status: ran\n    model: "a-model"`
      : `  ${id}:\n    status: skipped\n    reason: "not in this block"`);
    writeFileSync(join(dir, 'map', 'scanners.yaml'), `engine: block\nscanners:\n${rows.join('\n')}\n`);
    for (const o of outputs) {
      if (o.startsWith('map/findings/') && !passFiles) continue;
      writeFileSync(join(dir, o), o.endsWith('.md') ? '# Terrain\n\nA planted target with one README.\n' : o.endsWith('censuses.yaml') ? 'dimensions: []\n' : '[]\n');
    }
    return dir;
  };
  const validate = (dir, extra = []) => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir, ...extra], { encoding: 'utf8' });
  const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 2).join(' | ');
  try {
    // (a)
    const clean = runWith('clean', true);
    for (const extra of [[], ['--lane', 'practice-review', '--target', target]]) {
      const r = validate(clean, extra);
      if (r.status !== 0) fail(`(a) every pass file present and empty validates${extra.length ? ' (--lane)' : ''} (got ${r.status}: ${bullets(r)})`);
    }
    // (b)
    const none = validate(runWith('none', false));
    if (none.status !== 1 || !/status ran, but the base carries no rows from practice-review[^\n]*practice-review-<pass>\.yaml/.test(none.stderr)) fail(`(b) ran with no pass file and no rows fails, naming the pass files (got ${none.status}: ${bullets(none)})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
