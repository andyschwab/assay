// ── repo-census: an agent contract is the file and what it imports (issue #249) ──
// A root CLAUDE.md of a few lines that imports the real contract (`@FOUNDATION.md`, which imports
// `@CATEGORY.md`, which names every workspace) covers those workspaces: the credit reads the
// imported files, in order, and cites the imported line. Pinned:
//   - a workspace named only in a file two imports deep is credited, citing that file's line;
//   - an import inside a fenced block or an inline code span is not an import;
//   - an import cycle ends, and an import that leaves the tree or names no file is skipped;
//   - an architecture page's credit does not follow `@` tokens: imports are an agent contract's.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-imports';

export async function run() {
  const fail = (m) => negFailures.push('repo-census-imports: ' + m);
  const tmp = join(HERE, 'tmp-repo-census-imports');
  const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
  const pkg = (name, extra = {}) => JSON.stringify({ name, private: true, ...extra }) + '\n';
  const tree = ({ contract, foundation, category, arch = '# Architecture\n\nOne service and its database.\n' }) => {
    rmSync(tmp, { recursive: true, force: true });
    put('package.json', pkg('app', { workspaces: ['apps/*', 'packages/*'] }));
    put('apps/web/package.json', pkg('web'));
    put('packages/db/package.json', pkg('db'));
    put('docs/architecture.md', arch);
    put('CLAUDE.md', contract);
    if (foundation !== undefined) put('FOUNDATION.md', foundation);
    if (category !== undefined) put('docs/CATEGORY.md', category);
  };
  const census = () => {
    const out = join(tmp, '..', 'tmp-repo-census-imports.json');
    rmSync(out, { force: true });
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch { /* exit 1 is expected: ci-gate and runbook gap in this bare tree */ }
    const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    rmSync(out, { force: true });
    return doc;
  };
  const at = (doc, nm, loc) => doc?.checks.find((c) => c.name === nm && c.detail?.path === loc);
  const CATEGORY = '# Category\n\n## The map of homes\n\n- `apps/web`: the routes.\n- packages/db: migrations and policies.\n';

  try {
    // ── two imports deep: CLAUDE.md → FOUNDATION.md → docs/CATEGORY.md ──
    tree({ contract: '# CLAUDE.md\n\n@FOUNDATION.md\n\nThis app\'s rules.\n', foundation: '# Foundation\n\nThe core.\n\n@docs/CATEGORY.md\n', category: CATEGORY });
    let doc = census();
    const web = at(doc, 'agent-contract', 'apps/web'), db = at(doc, 'agent-contract', 'packages/db');
    if (!web || web.status !== 'pass' || web.evidence?.[0] !== 'docs/CATEGORY.md:5') fail(`agent-contract@apps/web passes, credited by the line of docs/CATEGORY.md that CLAUDE.md imports through FOUNDATION.md; got ${web ? `${web.status} ${web.evidence?.[0]}` : 'no row'}`);
    if (!db || db.status !== 'pass' || db.evidence?.[0] !== 'docs/CATEGORY.md:6') fail(`agent-contract@packages/db passes, credited at docs/CATEGORY.md:6; got ${db ? `${db.status} ${db.evidence?.[0]}` : 'no row'}`);
    // the architecture page's credit does not follow imports
    tree({ contract: '# CLAUDE.md\n\n@FOUNDATION.md\n', foundation: '# Foundation\n\n@docs/CATEGORY.md\n', category: CATEGORY, arch: '# Architecture\n\nOne service and its database.\n\n@CATEGORY.md\n' });
    doc = census();
    const archWeb = at(doc, 'architecture-page', 'apps/web');
    if (!archWeb || archWeb.status !== 'gap') fail(`an architecture page's @ token is not an import: architecture-page@apps/web stays a gap; got ${archWeb ? `${archWeb.status} ${archWeb.evidence?.[0]}` : 'no row'}`);

    // ── not imports: a fenced block, an inline code span ──
    tree({ contract: '# CLAUDE.md\n\n```\n@FOUNDATION.md\n```\n\nRun `@FOUNDATION.md` by hand.\n', foundation: CATEGORY });
    doc = census();
    const quoted = at(doc, 'agent-contract', 'apps/web');
    if (!quoted || quoted.status !== 'gap') fail(`an @path inside a fenced block or a code span is not an import; got ${quoted ? `${quoted.status} ${quoted.evidence?.[0]}` : 'no row'}`);

    // ── a cycle ends; a target outside the tree, or missing, is skipped ──
    tree({ contract: '# CLAUDE.md\n\n@FOUNDATION.md\n@../outside.md\n@MISSING.md\n', foundation: '# Foundation\n\n@CLAUDE.md\n@docs/CATEGORY.md\n', category: CATEGORY });
    put('../outside.md', '- apps/web\n');
    doc = census();
    rmSync(join(tmp, '..', 'outside.md'), { force: true });
    const cyc = at(doc, 'agent-contract', 'apps/web');
    if (!doc) fail('an import cycle must end: the census wrote no report');
    else if (!cyc || cyc.status !== 'pass' || cyc.evidence?.[0] !== 'docs/CATEGORY.md:5') fail(`through a cycle, an outside target and a missing one, the credit still comes from docs/CATEGORY.md:5 (never the file outside the tree); got ${cyc ? `${cyc.status} ${cyc.evidence?.[0]}` : 'no row'}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
