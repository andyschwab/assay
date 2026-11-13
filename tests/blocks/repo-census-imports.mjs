// ── repo-census: an agent contract is the file and what it imports (issue #249) ──
// A root CLAUDE.md of a few lines that imports the real contract (`@FOUNDATION.md`, which imports
// `@CATEGORY.md`, which names every workspace) covers those workspaces: the credit reads the
// imported files, in order, and cites the imported line. Pinned:
//   - a workspace named only in a file two imports deep is credited, citing that file's line;
//   - an import inside a fenced block (closed only by a like fence at least as long), an indented
//     code block or an inline code span is not an import; a sentence's closing period is not the path's;
//   - a nested project credited through the root's imports hands that contract to its workspaces;
//   - an import cycle ends, and an import that leaves the tree (by path or through a symlink) or
//     names no file is skipped;
//   - an architecture page's credit does not follow `@` tokens: imports are an agent contract's.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
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
    // apps/web ships its own container: a separately deployed unit, covered only by a naming (#306)
    put('apps/web/Dockerfile', 'FROM node:22\n');
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
    tree({ contract: '# CLAUDE.md\n\n```\n@FOUNDATION.md\n```\n\nRun `cat @FOUNDATION.md` by hand.\n', foundation: CATEGORY });
    doc = census();
    const quoted = at(doc, 'agent-contract', 'apps/web');
    if (!quoted || quoted.status !== 'gap') fail(`an @path inside a fenced block or a code span is not an import; got ${quoted ? `${quoted.status} ${quoted.evidence?.[0]}` : 'no row'}`);

    // ── not imports either: inside a longer fence around a ``` example, in an indented code block ──
    tree({ contract: '# CLAUDE.md\n\n````\n```\n@FOUNDATION.md\n```\n````\n\n    @FOUNDATION.md\n', foundation: CATEGORY });
    doc = census();
    const fencedIn = at(doc, 'agent-contract', 'apps/web');
    if (!fencedIn || fencedIn.status !== 'gap') fail(`an @path inside a four-backtick fence, or an indented code block, is not an import; got ${fencedIn ? `${fencedIn.status} ${fencedIn.evidence?.[0]}` : 'no row'}`);
    // a ~~~ block holding a ``` line closes on ~~~, and the import after it counts; a sentence's period is not the path's
    tree({ contract: '# CLAUDE.md\n\n~~~\n```\n~~~\n\nRead @FOUNDATION.md.\n', foundation: '# Foundation\n\n@docs/CATEGORY.md\n', category: CATEGORY });
    doc = census();
    const after = at(doc, 'agent-contract', 'apps/web');
    if (!after || after.status !== 'pass' || after.evidence?.[0] !== 'docs/CATEGORY.md:5') fail(`a ~~~ block closes on ~~~ (a \`\`\` line inside it does not), and "Read @FOUNDATION.md." imports FOUNDATION.md; got ${after ? `${after.status} ${after.evidence?.[0]}` : 'no row'}`);

    // ── an @path indented under a list item is the item's text: an import; the credit names the contract ──
    tree({ contract: '# CLAUDE.md\n\n1. Read the rules:\n\n    @FOUNDATION.md\n', foundation: '# Foundation\n\n@docs/CATEGORY.md\n', category: CATEGORY });
    doc = census();
    const listed = at(doc, 'agent-contract', 'apps/web');
    if (!listed || listed.status !== 'pass' || listed.evidence?.[0] !== 'docs/CATEGORY.md:5') fail(`an @path indented under a list item imports; got ${listed ? `${listed.status} ${listed.evidence?.[0]}` : 'no row'}`);
    if (listed && !/CLAUDE\.md, which passes, imports docs\/CATEGORY\.md/.test(listed.observation)) fail(`a credit through an import says the contract passes and imports the file that names it; got ${listed.observation}`);

    // ── a credited nested project hands its contract down: its workspace is read against the root's whole chain ──
    rmSync(tmp, { recursive: true, force: true });
    put('package.json', pkg('catalog'));
    put('CLAUDE.md', '# CLAUDE.md\n\n@FOUNDATION.md\n');
    put('FOUNDATION.md', '# Foundation\n\n- apps/api: the service, in every entry.\n\n@CATEGORY.md\n');
    put('CATEGORY.md', '# Category\n\n- templates/x: the entry.\n');
    put('templates/x/package.json', pkg('x', { workspaces: ['apps/*'] }));
    put('templates/x/package-lock.json', '{}\n');
    put('templates/x/apps/api/package.json', pkg('api'));
    doc = census();
    const tx = at(doc, 'agent-contract', 'templates/x'), txApi = at(doc, 'agent-contract', 'templates/x/apps/api');
    if (!tx || tx.status !== 'pass') fail(`templates/x is credited through the root's imports; got ${tx ? `${tx.status} ${tx.evidence?.[0]}` : 'no row'}`);
    if (!txApi || txApi.status !== 'pass' || txApi.evidence?.[0] !== 'FOUNDATION.md:3') fail(`templates/x/apps/api is credited by the contract templates/x was credited from (FOUNDATION.md:3 names apps/api), not by the imported file alone; got ${txApi ? `${txApi.status} ${txApi.evidence?.[0]}` : 'no row'}`);

    // ── a cycle ends; a target outside the tree (a path, or a symlink inside the tree), or missing, is skipped ──
    const outside = join(HERE, 'tmp-repo-census-imports-outside.md');
    writeFileSync(outside, '- apps/web\n');
    tree({ contract: '# CLAUDE.md\n\n@LINK.md\n@FOUNDATION.md\n@../tmp-repo-census-imports-outside.md\n@MISSING.md\n', foundation: '# Foundation\n\n@CLAUDE.md\n@docs/CATEGORY.md\n', category: CATEGORY });
    let linked = true;
    try { symlinkSync(outside, join(tmp, 'LINK.md')); } catch { linked = false; /* a host with no symlinks */ }
    doc = census();
    const cyc = at(doc, 'agent-contract', 'apps/web');
    if (!doc) fail('an import cycle must end: the census wrote no report');
    else if (!cyc || cyc.status !== 'pass' || cyc.evidence?.[0] !== 'docs/CATEGORY.md:5') fail(`through a cycle, a symlink out of the tree${linked ? '' : ' (not made on this host)'}, an outside path and a missing file, the credit still comes from docs/CATEGORY.md:5 (never a file outside the tree); got ${cyc ? `${cyc.status} ${cyc.evidence?.[0]}` : 'no row'}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(join(HERE, 'tmp-repo-census-imports-outside.md'), { force: true });
  }
}
