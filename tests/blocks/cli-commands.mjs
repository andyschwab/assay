// ── every command help advertises has a command-line body (#53, F-103, F-603) ──
// chains, capabilities, supervision and decisions dispatched to library modules with no
// argv read and no isMain block, so `node assay.mjs supervision <run>` printed nothing and
// exited 0 — indistinguishable from an empty, clean result. A command help lists must run
// something; a library module is not a command.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'cli-commands';

export async function run() {
  const fail = (m) => negFailures.push('cli-commands: ' + m);
  const src = readFileSync(join(ROOT, 'assay.mjs'), 'utf8');
  const helpOut = execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'help'], { encoding: 'utf8' });
  const listed = [...helpOut.matchAll(/^  ([a-z][a-z-]*) {2,}/gm)].map((m) => m[1]);
  if (listed.length < 10) fail(`help must list the commands (parsed ${listed.length})`);
  for (const cmd of listed) {
    const script = src.match(new RegExp(`'${cmd}': \\['([^']+)'`))?.[1];
    if (!script) { fail(`help lists "${cmd}" but assay.mjs dispatches it to no script`); continue; }
    const body = readFileSync(join(ROOT, script), 'utf8');
    if (!/isMain\(import\.meta\.url\)|process\.argv/.test(body)) fail(`help lists "${cmd}", but ${script} has no command-line body (no isMain block, no argv read): it would print nothing and exit 0`);
  }
  for (const cmd of ['chains', 'capabilities', 'supervision', 'decisions']) {
    if (listed.includes(cmd)) continue;
    const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), cmd, join(HERE, 'fixtures', 'notesbox')], { encoding: 'utf8' });
    if (r.status === 0) fail(`\`assay ${cmd}\` is not a command, so it must exit non-zero (got 0)`);
  }
}
