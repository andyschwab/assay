// ── repo-census gate commands: what a CI step must run to count as a gate ─────
// A zero-dependency repository runs its tests with `node` directly (the public
// fixture repository's CI does); the census read that as no gate. A test runner or
// a test file is a gate; running the app, or a script that merely mentions tests, is not.
import { parseWorkflow } from '../../map/repo-census.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'census-gate-commands';

export async function run() {
  const fail = (m) => negFailures.push('census-gate-commands: ' + m);
  const wf = (cmd) => `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ${cmd}\n`;
  for (const cmd of ['npm test', 'node --test', 'node test/smoke.mjs', 'node targets/clean-lib/test/slugify.test.mjs', 'node lib/a.spec.ts', 'bun test', 'deno test', 'pytest -q'])
    if (!parseWorkflow(wf(cmd)).steps[0]?.isGateCmd) fail(`"${cmd}" must count as a gate step`);
  for (const cmd of ['node server.mjs', 'node scripts/build-tests.mjs', 'node testing.mjs', 'echo test'])
    if (parseWorkflow(wf(cmd)).steps[0]?.isGateCmd) fail(`"${cmd}" must not count as a gate step`);
}
