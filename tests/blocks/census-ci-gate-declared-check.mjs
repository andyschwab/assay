// ── census-ci-gate-declared-check: a workflow that runs the declared check is a gate (#306) ──
// A run read d-ci-gate-on-default-branch unmet ("no workflow runs gates on a pull request or
// main") for a workflow that triggered on pull_request, merge_group and push to main and ran
// the repository's check and build. The census missed two parts of the shape: a step that runs
// a package script by a name outside its fixed verb list (`pnpm check`), or with the package
// manager's flags before it (`pnpm -r build`), and a merge queue's merge_group as a trigger.
// The reading now resolves a step through the scripts the repository declares, and counts
// merge_group beside pull_request. A repository with no gate workflow, a workflow that runs
// no check, and one that runs the check only by hand still read a gap.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { run as census } from '../../map/repo-census.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'census-ci-gate-declared-check';

export async function run() {
  const fail = (m) => negFailures.push('census-ci-gate-declared-check: ' + m);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-ci-gate-'));
  const pkg = { name: 'app', private: true, scripts: { check: 'biome check . && tsc -b', verify: 'vitest run', build: 'vite build', deploy: 'node scripts/deploy.mjs' } };
  const gate = (name, files) => {
    const dir = join(scratch, name);
    for (const [f, body] of Object.entries({ 'package.json': JSON.stringify(pkg, null, 2) + '\n', ...files })) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); }
    return census({ target: dir, defaultBranch: 'main', asOf: '2026-11-13' }).checks.find((c) => c.name === 'ci-gate');
  };
  const steps = (...cmds) => `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm install --frozen-lockfile\n${cmds.map((c) => `      - run: ${c}\n`).join('')}`;
  try {
    // false positives: the reported shape, and the declared check behind a merge queue alone
    const reported = gate('reported', { '.github/workflows/ci.yml': `name: ci\non:\n  pull_request:\n  merge_group:\n  push:\n    branches: [main]\n${steps('pnpm check', 'pnpm -r build')}` });
    if (reported?.status !== 'pass') fail(`a workflow on pull_request, merge_group and push to main that runs \`pnpm check\` and \`pnpm -r build\` gates the default branch (got ${reported?.status}: ${reported?.observation})`);
    else if (!reported.evidence.includes('.github/workflows/ci.yml:1')) fail(`the pass must cite the gating workflow (got ${JSON.stringify(reported.evidence)})`);
    const queue = gate('merge-queue', { '.github/workflows/queue.yml': `on: [merge_group]\n${steps('pnpm --filter web verify')}` });
    if (queue?.status !== 'pass') fail(`a merge queue's merge_group running a declared script whose body is a test runner gates the default branch (got ${queue?.status}: ${queue?.observation})`);

    // true positives: no workflow; a workflow that runs no check; the check run only by hand
    const none = gate('no-workflow', {});
    if (none?.status !== 'gap') fail(`a repository with no workflow has no gate (got ${none?.status})`);
    const noCheck = gate('no-check', { '.github/workflows/ci.yml': `on:\n  pull_request:\n  merge_group:\n${steps('pnpm deploy', 'pnpm start')}` });
    if (noCheck?.status !== 'gap') fail(`a workflow that installs and deploys but runs no check is no gate (got ${noCheck?.status}: ${noCheck?.observation})`);
    const byHand = gate('by-hand', { '.github/workflows/ci.yml': `on:\n  workflow_dispatch:\n${steps('pnpm check')}` });
    if (byHand?.status !== 'gap') fail(`a workflow run only by hand gates no change on its way to the default branch (got ${byHand?.status}: ${byHand?.observation})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
