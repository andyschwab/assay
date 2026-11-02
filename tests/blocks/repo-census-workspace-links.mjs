// ── repo-census: a workspace link that leaves the tree is set aside (issue #251) ──
// map/projects.mjs follows a single link step into apps/* so a package linked from outside
// the checkout reads as a workspace, the way pnpm and npm treat it. A link whose target sits
// outside the tree is not that tree's workspace: its files belong to another directory, and
// reading them credits the report with a project that is not there. Such a location is named
// in projects_set_aside, never dropped silently.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-workspace-links';

export async function run() {
  const fail = (m) => negFailures.push('repo-census-workspace-links: ' + m);
  const tmp = join(HERE, 'tmp-repo-census-workspace-links');
  const outside = join(HERE, 'tmp-repo-census-workspace-links-outside');
  const out = join(HERE, 'tmp-repo-census-workspace-links.json');
  const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
  const pkg = (name) => JSON.stringify({ name, private: true }) + '\n';
  try {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    put('package.json', JSON.stringify({ name: 'linked-escape', private: true, workspaces: ['apps/*'] }) + '\n');
    mkdirSync(join(tmp, 'apps'), { recursive: true });
    mkdirSync(join(outside, 'leak'), { recursive: true });
    writeFileSync(join(outside, 'leak', 'package.json'), pkg('leak'));
    writeFileSync(join(outside, 'leak', 'ARCHITECTURE.md'), '# Architecture\n\nOne service and its database.\n');
    let escaped = true;
    try { symlinkSync(join(outside, 'leak'), join(tmp, 'apps/leak'), 'junction'); } catch { escaped = false; /* a host with no symlinks */ }

    let doc = null;
    rmSync(out, { force: true });
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch { /* exit 1 is expected: the bare tree gaps its own pages */ }
    doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    if (!doc) { fail('the census wrote no report over the linked tree'); return; }
    if (!escaped) return;   // a host with no symlinks cannot plant the escape
    if (doc.monorepo?.locations?.includes('apps/leak')) fail(`a workspace link that leaves the tree is no location; got ${JSON.stringify(doc.monorepo?.locations)}`);
    if (!(doc.projects_set_aside || []).some((x) => x.path === 'apps/leak')) fail(`a workspace link that leaves the tree is named in projects_set_aside, never dropped silently; got ${JSON.stringify(doc.projects_set_aside)}`);
    if (doc.checks.some((c) => c.detail?.path === 'apps/leak')) fail(`no check reads a location outside the tree; got ${JSON.stringify(doc.checks.filter((c) => c.detail?.path === 'apps/leak'))}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(out, { force: true });
  }
}
