// ── fresh-clone on a pnpm monorepo (#25, #26): the root's gates cover the tree ──
// A pnpm workspace (pnpm-workspace.yaml, no package.json field) whose gates run once at
// the root must not read as seven failed installs and a gap per undeclared workspace
// step. The fixture runs through offline shims (tests/instruments/shims: CI has no pnpm
// and no registry); the pnpm shim really runs package.json scripts, so a workspace's own
// failing test still fails. Pinned: the list comes from pnpm-workspace.yaml with its `!`
// exclusion; no npm command ever runs against the pnpm tree; each undeclared step a
// passing root step reaches reads covered, naming the covering command; migrate belongs
// to the package that declares it; the failing workspace test stays a gap; the root's
// database signal is read tree-wide. And the other direction: a root step that did not
// pass, or that does not reach the tree, covers nothing.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkspace } from '../../map/fresh-clone.mjs';
import { HERE, ROOT, negFailures, convert } from '../harness.mjs';

export const label = 'fresh-clone-pnpm';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone-pnpm: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-pnpm');
  const tmp = join(HERE, 'tmp-fresh-clone-pnpm'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'fresh-clone.json');
  const env = { ...process.env, PATH: `${join(HERE, 'instruments', 'shims')}:${process.env.PATH}` };
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '60'], { stdio: 'pipe', env }); }
  catch (e) { exit = e.status; }
  let doc = null; try { doc = JSON.parse(readFileSync(out, 'utf8')); } catch { fail('the runner must write a document'); }
  if (doc) {
    if (exit !== 1 || doc.exit !== 1) fail(`packages/failing's own test fails, so the run exits 1 (got ${exit}/${doc.exit})`);
    if (doc.workspaces_from !== 'pnpm-workspace.yaml') fail(`the workspace list must come from pnpm-workspace.yaml (got ${doc.workspaces_from})`);
    const paths = (doc.workspaces || []).map((w) => w.path).join();
    if (paths !== 'apps/web,packages/failing,packages/lib') fail(`workspaces must be apps/web, packages/failing, packages/lib — packages/scratch excluded by "!packages/scratch" (got ${paths})`);
    const cmds = [doc.steps, ...(doc.workspaces || []).map((w) => w.steps)].flat().map((x) => x.command).filter(Boolean);
    if (cmds.some((c) => /^npm\b|\bnpm ci\b/.test(c))) fail(`no npm command may run against a pnpm tree (got ${cmds.filter((c) => /npm/.test(c)).join(' | ')})`);
    const ws = (p) => (doc.workspaces || []).find((w) => w.path === p) || { steps: [] };
    const st = (p, n) => ws(p).steps.find((x) => x.name === n) || {};
    const web = (n) => st('apps/web', n);
    if (web('install').status !== 'covered' || web('install').covered_by?.command !== 'pnpm install --frozen-lockfile') fail(`apps/web install must be covered by the root pnpm install (got ${JSON.stringify(web('install'))})`);
    if (web('build').status !== 'passed' || web('build').command !== 'pnpm run build') fail(`apps/web's own build runs with pnpm and passes (got ${web('build').status} / ${web('build').command})`);
    for (const [n, via] of [['lint', 'lint-root'], ['typecheck', 'recursive'], ['test', 'test-discovery']])
      if (web(n).status !== 'covered' || web(n).covered_by?.via !== via || web(n).covered_by?.path !== '.') fail(`apps/web ${n} must be covered by the root (${via}) (got ${JSON.stringify(web(n))})`);
    if (web('migrate').status !== 'covered' || web('migrate').covered_by?.path !== '.' || web('migrate').covered_by?.command !== 'db:migrate') fail(`apps/web migrate must belong to the root's db:migrate (got ${JSON.stringify(web('migrate'))})`);
    if (st('packages/failing', 'test').status !== 'failed') fail(`a workspace's own failing test stays failed, never covered (got ${st('packages/failing', 'test').status})`);
    if (st('packages/lib', 'install').status !== 'covered') fail('packages/lib (dependencies, no lockfile of its own) installs through the root');
    let rows = [];
    try { rows = convert('fresh-clone', readFileSync(out, 'utf8'), exit); } catch (e) { fail(`ingest must accept the covered statuses (${e.message})`); }
    const ids = rows.map((r) => r.native_id).sort().join(', ');
    if (ids !== 'build:not-declared, migrate:not-declared, packages/failing:build:not-declared, packages/failing:test:failed, packages/lib:build:not-declared')
      fail(`ingest must file only the real gaps — the root's undeclared build and live-database migrate, the failing workspace test, and the builds no root step reaches (got ${ids})`);
    if (rows.some((r) => r.native_category === 'no-database-signal')) fail('the root declares prisma migrations and apps/web depends on @prisma/client: no "no database signal" fact may be filed');
    const bare = readFileSync(out, 'utf8').replace(/"covered_by": \{[^}]*\}/, '"covered_by": null');
    let threw = false; try { convert('fresh-clone', bare, exit); } catch { threw = true; }
    if (!threw) fail('a covered step with no covered_by must halt ingest (coverage that names no covering step is not evidence)');
  }
  // the other direction, on the planner directly
  const rootTc = { family: 'node', package_manager: 'pnpm', lockfile: 'pnpm-lock.yaml' };
  const wsTc = { family: 'node', package_manager: 'npm', lockfile: null, has_dependencies: true };
  const rootPkg = { scripts: { lint: 'eslint src', test: 'vitest run apps/web', typecheck: 'pnpm -r typecheck' } };
  const passed = (n, c) => ({ name: n, status: 'passed', command: c });
  const plan = planWorkspace(rootTc, wsTc, { name: 'x', dependencies: { a: '1' } }, 'packages/x', { pkg: rootPkg, migrateOwner: null,
    steps: [{ name: 'install', status: 'failed', command: 'pnpm install --frozen-lockfile' }, passed('lint', 'pnpm run lint'), passed('test', 'pnpm run test'), { name: 'typecheck', status: 'failed', command: 'pnpm run typecheck' }] });
  if (plan.install.status !== 'root-install-broken') fail(`a root install that failed covers nothing: the workspace install is recorded skipped (got ${plan.install.status})`);
  if (plan.lint.status !== 'not-declared') fail('`eslint src` does not reach packages/x: lint stays not-declared');
  if (plan.test.status !== 'not-declared') fail('`vitest run apps/web` names a path: test stays not-declared for packages/x');
  if (plan.typecheck.status !== 'not-declared') fail('a recursive root typecheck that FAILED covers nothing');
  rmSync(tmp, { recursive: true, force: true });
}
