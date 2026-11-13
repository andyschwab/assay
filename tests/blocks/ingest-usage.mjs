// ── a run-directory command given no run prints its usage, never a stack (#304) ──
// `node assay.mjs ingest` with no arguments threw a TypeError from lib/run-layout.mjs, building a
// path from a run directory it was never given. Pinned:
//   (a) ingest with no arguments, with a run and no --tool, and with an unknown tool, exits 2 with
//       its usage and no stack;
//   (b) every command whose first argument is a run directory it reads, given one that does not
//       exist, exits 2 with that command's own usage and no stack (assay.mjs's one guard; ingest,
//       which makes a new run's map, is held by (a)).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'ingest-usage';

const RUN_DIR_COMMANDS = ['validate', 'record', 'migrate-run', 'project', 'score', 'backlog', 'measure', 'ratchet', 'compile', 'intake', 'maintain', 'owner', 'since', 'maturity'];
const STACK = /^\s+at |TypeError|ReferenceError|node:internal/m;

export async function run() {
  const fail = (m) => negFailures.push('ingest-usage: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const scratch = mkdtempSync(join(tmpdir(), 'assay-ingest-usage-'));
  try {
    // (a)
    for (const [what, args] of [['no arguments', []], ['a run and no --tool', [scratch]], ['an unknown tool', [scratch, '--tool', 'no-such-scanner', '--raw', 'x', '--exit', '0']]]) {
      const r = assay('ingest', ...args);
      if (r.status !== 2 || !/^usage: node assay\.mjs ingest <run-dir>/m.test(r.stderr) || STACK.test(r.stderr)) fail(`(a) ingest with ${what} exits 2 with its usage, no stack (got ${r.status}: ${r.stderr.trim().split('\n')[0]})`);
    }
    // (b)
    const missing = join(scratch, 'no-such-run');
    for (const cmd of RUN_DIR_COMMANDS) {
      const r = assay(cmd, missing, '--previous', missing, '--answers', missing);
      if (r.status !== 2 || !r.stderr.includes(`assay ${cmd}: no such run directory: ${missing}`) || !/usage: /.test(r.stderr) || STACK.test(r.stderr)) fail(`(b) ${cmd} given a run directory that does not exist exits 2 with its usage, no stack (got ${r.status}: ${(r.stderr || r.stdout).trim().split('\n')[0]})`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
