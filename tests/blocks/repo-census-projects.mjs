// ── repo-census: a tree's nested projects are locations, read by one rule (issue #246) ──
// A catalog keeps several projects side by side under templates/<name>/, each its own pnpm
// workspace with its own architecture page, agent contract and runbook, under a root that is a
// map, not an application. map/projects.mjs finds them (a package.json plus a lockfile or a
// workspace file), and the census checks each one and its workspaces:
//   - the entry's own page, contract and runbook read pass at the entry;
//   - a workspace inside the entry is credited by the ENTRY's document, which names it by its
//     path from the entry (`apps/web`), not from the root;
//   - the root, with no architecture page or runbook of its own, is covered by its projects when
//     each carries one that passes on its own, and is a gap again when one of them does not;
//   - the runbook belongs to a project, never to a workspace;
//   - a pnpm-workspace.yaml at the root is a workspace declaration, outside apps/ and packages/ too;
//   - a test's planted project, a submodule and a directory carrying its own .git are not projects;
//   - a flat tree reads as it always has: no `projects` key, no new location.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-projects';

export async function run() {
  const fail = (m) => negFailures.push('repo-census-projects: ' + m);
  const tmp = join(HERE, 'tmp-repo-census-projects');
  const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
  const pkg = (name, extra = {}) => JSON.stringify({ name, private: true, ...extra }) + '\n';
  const RUNBOOK = ['# Runbook', '', '## Restart', 'Restart the service from the console.', '', '## Roll back', 'Roll back to the previous revision.', '',
    '## Rotate a key', 'Rotate the secret in the store, then redeploy.', '', '## Restore', 'Restore the database from the nightly backup.', ''].join('\n');
  const entry = (name, { runbook = true } = {}) => {
    const b = `templates/${name}`;
    put(`${b}/package.json`, pkg(name));
    put(`${b}/pnpm-lock.yaml`, "lockfileVersion: '9.0'\n");
    put(`${b}/pnpm-workspace.yaml`, 'packages:\n  - apps/*\n');
    put(`${b}/apps/web/package.json`, pkg(`${name}-web`));
    put(`${b}/docs/architecture.md`, '# Architecture\n\nOne service and its database.\n\n- `apps/web`: the UI and the API.\n');
    put(`${b}/CLAUDE.md`, '# CLAUDE.md\n\nRun the gate before a commit. apps/web holds the routes.\n');
    if (runbook) put(`${b}/RUNBOOKS.md`, RUNBOOK);
  };
  const tree = ({ beta = false, betaRunbook = true } = {}) => {
    rmSync(tmp, { recursive: true, force: true });
    put('package.json', pkg('catalog', { scripts: { test: 'node --test' } }));
    put('README.md', '# The catalog\n\nEach entry under templates/ is one application tree.\n');
    put('CLAUDE.md', '# CLAUDE.md\n\nEdit an entry in the entry.\n');
    entry('alpha');
    if (beta) entry('beta', { runbook: betaRunbook });
    // not projects: a test's planted project, a submodule, a nested repository
    put('tests/fixtures/planted/package.json', pkg('planted'));
    put('tests/fixtures/planted/package-lock.json', '{}\n');
    put('.gitmodules', '[submodule "ext/lib"]\n\tpath = ext/lib\n\turl = https://example.invalid/lib.git\n');
    put('ext/lib/package.json', pkg('lib'));
    put('ext/lib/package-lock.json', '{}\n');
    put('vendored/package.json', pkg('vendored'));
    put('vendored/yarn.lock', '\n');
    put('vendored/.git', 'gitdir: ../.git/modules/vendored\n');
  };
  const census = () => {
    const out = join(tmp, '..', 'tmp-repo-census-projects.json');
    rmSync(out, { force: true });
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch { /* exit 1 is expected: ci-gate and the workspace pages gap in this bare tree */ }
    const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    rmSync(out, { force: true });
    return doc;
  };
  const at = (doc, nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc);

  try {
    // ── one entry: located, checked, credited, and covering the root ──
    tree();
    let doc = census();
    if (!doc) { fail('the census wrote no report over the catalog'); return; }
    const projects = (doc.projects || []).map((p) => p.path);
    if (JSON.stringify(projects) !== JSON.stringify(['.', 'templates/alpha'])) fail(`projects should be the root and templates/alpha alone (a planted test project, a submodule and a nested repository are not projects); got ${JSON.stringify(projects)}`);
    for (const loc of ['templates/alpha', 'templates/alpha/apps/web']) if (!doc.monorepo?.locations?.includes(loc)) fail(`${loc} should be a census location; got ${JSON.stringify(doc.monorepo?.locations)}`);
    for (const nm of ['architecture-page', 'agent-contract', 'runbook']) {
      const c = at(doc, nm, 'templates/alpha');
      if (!c || c.status !== 'pass' || c.detail?.coveredBy) fail(`${nm}@templates/alpha should pass on the entry's own file; got ${c ? `${c.status} ${c.observation}` : 'no row'}`);
    }
    for (const [nm, file] of [['architecture-page', 'templates/alpha/docs/architecture.md'], ['agent-contract', 'templates/alpha/CLAUDE.md']]) {
      const c = at(doc, nm, 'templates/alpha/apps/web');
      if (!c || c.status !== 'pass' || c.detail?.coveredBy !== file) fail(`${nm}@templates/alpha/apps/web should pass, credited by the entry's ${file}, which names it as apps/web; got ${c ? `${c.status} ${JSON.stringify(c.detail)}` : 'no row'}`);
    }
    for (const nm of ['architecture-page', 'runbook']) {
      const c = at(doc, nm, '.');
      if (!c || c.status !== 'pass' || JSON.stringify(c.detail?.delegatedTo) !== JSON.stringify(['templates/alpha'])) fail(`${nm}@. should pass, delegated to templates/alpha (the root has none of its own); got ${c ? `${c.status} ${JSON.stringify(c.detail)} ${c.observation}` : 'no row'}`);
    }
    if (at(doc, 'runbook', 'templates/alpha/apps/web')) fail('a workspace owes no runbook: the runbook belongs to a project');

    // ── a second entry with no runbook: the root is no longer covered, and the entry gaps ──
    tree({ beta: true, betaRunbook: false });
    doc = census();
    const rootRb = doc && at(doc, 'runbook', '.');
    if (!rootRb || rootRb.status !== 'gap') fail(`runbook@. should gap when one of the root's projects carries no runbook; got ${rootRb ? `${rootRb.status} ${rootRb.observation}` : 'no row'}`);
    const betaRb = doc && at(doc, 'runbook', 'templates/beta');
    if (!betaRb || betaRb.status !== 'gap') fail(`runbook@templates/beta should gap; got ${betaRb ? betaRb.status : 'no row'}`);
    const rootArch = doc && at(doc, 'architecture-page', '.');
    if (!rootArch || rootArch.status !== 'pass' || JSON.stringify(rootArch.detail?.delegatedTo) !== JSON.stringify(['templates/alpha', 'templates/beta'])) fail(`architecture-page@. should stay delegated, to both entries; got ${rootArch ? JSON.stringify(rootArch.detail) : 'no row'}`);

    // ── a root pnpm-workspace.yaml is a workspace declaration, outside apps/ and packages/ too ──
    rmSync(tmp, { recursive: true, force: true });
    put('package.json', pkg('tooling'));
    put('pnpm-workspace.yaml', 'packages:\n  - tools/*\n');
    put('tools/cli/package.json', pkg('cli'));
    put('docs/architecture.md', '# Architecture\n\nA CLI over one API.\n');
    doc = census();
    if (!doc || !doc.monorepo?.locations?.includes('tools/cli')) fail(`a root pnpm-workspace.yaml naming tools/* should make tools/cli a location; got ${JSON.stringify(doc?.monorepo)}`);

    // ── a flat tree: as it always was ──
    rmSync(tmp, { recursive: true, force: true });
    put('package.json', pkg('flat'));
    put('package-lock.json', '{}\n');
    put('docs/architecture.md', '# Architecture\n\nOne service and its database.\n');
    doc = census();
    if (!doc || doc.projects !== undefined || doc.monorepo?.detected !== false) fail(`a flat tree should carry no projects key and no locations; got ${JSON.stringify({ projects: doc?.projects, monorepo: doc?.monorepo })}`);
    if (doc && doc.checks.filter((c) => c.name === 'runbook').length !== 1) fail('a flat tree has one runbook row, the root\'s');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
