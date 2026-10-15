// ── no-history-file: the change record is git (#164) ──
// A dated history file restates the commit that made the change, so no parallel log
// is kept: the confirmed-red record rides the pull request body and the commit message
// (CLAUDE.md § How a change lands). Pinned: (a) no file outside tests/ is a HISTORY.md,
// sits under a history/ folder, or is a log file dated in its name, tracked or not
// (tests/ is exempt: fixtures and sweep sets are other repositories' trees, as data);
// (b) no file outside tests/ names a HISTORY.md, so no contract asks for one back;
// (c) the rule's own predicate refuses each planted shape and passes ordinary files.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'no-history-file';

const DATED = /(?:^|[^0-9])(?:19|20)\d{2}-?[01]\d-?[0-3]\d(?:[^0-9]|$)/;

// Why a path is a history file, or null when it is not one.
export function historyShape(f) {
  if (f.startsWith('tests/')) return null;
  const parts = f.split('/');
  const base = parts[parts.length - 1];
  if (/^history\.md$/i.test(base)) return 'a HISTORY.md';
  if (parts.slice(0, -1).some((d) => d.toLowerCase() === 'history')) return 'a file under a history/ folder';
  if (/log/i.test(base) && DATED.test(base)) return 'a dated log file';
  return null;
}

export async function run() {
  const fail = (m) => negFailures.push('no-history-file: ' + m);

  // (c) the predicate, on planted paths
  const planted = ['HISTORY.md', 'docs/history.md', 'history/2026-10-15.md', 'map/history/notes.md', 'changelog-2026-10-15.md', 'ops/log-20261015.txt', 'worklog-2026-10-15.log'];
  for (const p of planted) if (!historyShape(p)) fail(`the rule passes a planted history file ${p}`);
  const ordinary = ['README.md', 'map/backlog.mjs', 'map/structure-scan.mjs', 'ops/evidence/d-deploy-one-command.md', 'tests/sweeps/x/HISTORY.md', 'tests/history/2026-10-15.log', 'logs.md'];
  for (const p of ordinary) if (historyShape(p)) fail(`the rule refuses an ordinary file ${p}`);

  let files;
  try { files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean); }
  catch (e) { fail(`git ls-files failed: ${e.message}`); return; }
  if (!files.length) { fail('git ls-files listed no file; the rule read nothing'); return; }

  for (const f of files) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;   // deleted in the working tree
    // (a) no history file
    const why = historyShape(f);
    if (why) fail(`${f} is ${why}; the change record is git (#164)`);
    // (b) nothing outside tests/ names one
    if (f.startsWith('tests/') || statSync(p).size > 4_000_000) continue;
    const buf = readFileSync(p);
    if (buf.includes(0)) continue;   // binary
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((l, i) => { if (/\bHISTORY\.md\b/i.test(l)) fail(`${f}:${i + 1} names HISTORY.md; the change record is git (#164)`); });
  }
}
