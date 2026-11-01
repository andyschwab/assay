// ── routine-command: the routine is a listed command (#239) ──
// A consumer drawing a fleet's runs called routine/run.mjs by path, past the contract.
// Pinned: `node assay.mjs routine` dispatches to routine/run.mjs (so help lists it and
// cli-commands holds it to a command-line body), passes the driver's usage refusal
// through (exit 2 with no repository named), and CONSUMERS.md lists
// `node assay.mjs routine <repo> --out <run>` with what it writes (routine.yaml).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'routine-command';

export async function run() {
  const fail = (m) => negFailures.push('routine-command: ' + m);
  const src = readFileSync(join(ROOT, 'assay.mjs'), 'utf8');
  if (!/'routine': \['routine\/run\.mjs'/.test(src)) fail('assay.mjs must dispatch `routine` to routine/run.mjs');
  const h = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'help'], { encoding: 'utf8' });
  if (!/^ {2}routine {2,}/m.test(h.stdout)) fail('help must list the routine command');
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'routine'], { encoding: 'utf8' });
  if (r.status !== 2 || !/usage/i.test(r.stderr)) fail(`\`assay routine\` with no repository must exit 2 with its usage (got ${r.status}: ${r.stderr.trim().slice(0, 120)})`);
  const page = readFileSync(join(ROOT, 'CONSUMERS.md'), 'utf8');
  const row = page.split('\n').find((l) => l.startsWith('| `node assay.mjs routine <repo> --out <run>')) || '';
  if (!row) fail('CONSUMERS.md must list `node assay.mjs routine <repo> --out <run>` as a command row');
  else if (!/routine\.yaml/.test(row)) fail('CONSUMERS.md\'s routine row must say what it writes (routine.yaml)');
}
