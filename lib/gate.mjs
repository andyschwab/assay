#!/usr/bin/env node
// gate.mjs — the landing gate, one command (`npm run gate`; CONTRIBUTING.md "Landing a change").
//
// A change lands when this ends green. In order:
//   1. the pinned tools answer on PATH (`node assay.mjs tools verify --run`); when one does not,
//      it stops there, with the line that installs them, since the suite needs them;
//   2. each check, run whatever the one before it did, so one run names every red step:
//      npm test, npm run typecheck, npm run lint, node map/passes.mjs, node lib/release-notes.mjs --check;
//   3. one exit line, `✓ assay gate: …` or `✗ assay gate: …` naming each step that failed, and
//      exit 1 when any did.
//
// Usage: node lib/gate.mjs        (npm run gate)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL_FOR_RUN, VERIFY_FOR_RUN } from '../map/tools.mjs';
import { isMain } from '../map/doctrine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// the tools step, then the checks, each { name, cmd, args }
export const TOOLS = { name: 'tools', cmd: process.execPath, args: ['assay.mjs', 'tools', 'verify', '--run'] };
export const STEPS = [
  { name: 'test', cmd: 'npm', args: ['test', '--silent'] },
  { name: 'typecheck', cmd: 'npm', args: ['run', '--silent', 'typecheck'] },
  { name: 'lint', cmd: 'npm', args: ['run', '--silent', 'lint'] },
  { name: 'passes', cmd: process.execPath, args: ['map/passes.mjs'] },
  { name: 'release-notes', cmd: process.execPath, args: ['lib/release-notes.mjs', '--check'] },
];
const INSTALL_LINE = `${INSTALL_FOR_RUN}, put <bin> on PATH in the same shell (export PATH="<bin>:$PATH"), and confirm with ${VERIFY_FOR_RUN}`;

// runGate → { exit, line, failed }. `run` runs one step and returns its exit status; the default
// streams the step's output to this terminal.
export function runGate({ tools = TOOLS, steps = STEPS, cwd = ROOT, env = process.env, log = console.log,
  run = (s) => spawnSync(s.cmd, s.args, { cwd, env, stdio: 'inherit' }).status } = {}) {
  const at = (s) => `${s.cmd === process.execPath ? 'node' : s.cmd} ${s.args.join(' ')}`;
  log(`── gate: ${tools.name} (${at(tools)})`);
  if (run(tools) !== 0) {
    log(`The pinned tools are not all on PATH, and the suite needs them. Install them: ${INSTALL_LINE}`);
    const line = `✗ assay gate: stopped at ${tools.name}: the pinned tools are not on PATH (${INSTALL_FOR_RUN})`;
    return { exit: 1, line, failed: [tools.name] };
  }
  const failed = [];
  for (const s of steps) {
    log(`── gate: ${s.name} (${at(s)})`);
    const status = run(s);
    if (status !== 0) failed.push(`${s.name} (exit ${status})`);
  }
  const names = [tools.name, ...steps.map((s) => s.name)];
  const line = failed.length
    ? `✗ assay gate: ${failed.length} of ${names.length} steps failed: ${failed.join(', ')}`
    : `✓ assay gate: ${names.join(', ')}: all ${names.length} steps pass`;
  return { exit: failed.length ? 1 : 0, line, failed };
}

if (isMain(import.meta.url)) {
  const r = runGate();
  console.log(r.line);
  process.exit(r.exit);
}
