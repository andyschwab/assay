// projects.mjs — where a tree's projects are: the one rule every instrument reads (#246).
//
// A tree is one or more PROJECTS, each with its own WORKSPACES, read from the files alone
// (nothing runs, zero dependencies):
//
//   - the ROOT project, always. It runs in the root, or in its APPLICATION DIRECTORY when the
//     root holds no package.json and exactly one directory directly beneath it does (#35: an
//     application kept whole in app/), or in the directory a caller declares (`--app`).
//   - a NESTED project: a directory below the root, not inside the root project's run directory's
//     workspaces, holding its own package.json AND something that makes it install on its own: a
//     lockfile (package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml, yarn.lock, bun.lock,
//     bun.lockb), a pnpm-workspace.yaml, or a `workspaces` field. A catalog keeps several such
//     projects side by side (templates/<name>/), each its own pnpm workspace; a repository with no
//     package.json at its root and two or more applications beneath it is the same shape. The walk
//     goes NESTED_MAX_DEPTH directories deep, never into node_modules, a dot-directory, or a fixture
//     or test tree (a test's planted project is the test's input, not the tree's project), and,
//     beside a root that is itself an application, not into a docs site or examples tree directly
//     under it (docs/, website/, site/, examples/, example/, samples/: that application's
//     furniture). Each such directory holding what would have been a project is named in
//     `setAside`; a
//     packet's `apps` pointer declares what discovery leaves out, never into another repository (a submodule named in .gitmodules, or any directory
//     carrying its own .git: a tree of its own, measured on its own), and never below a project it
//     found (that project's workspaces are its own).
//   - each project's WORKSPACES, resolved in its run directory: pnpm-workspace.yaml's `packages:`
//     (with `!` exclusions) when that file lists any (pnpm ignores the package.json field), else
//     package.json `workspaces` (an array or `{packages: [...]}`), else the convention: apps/* and
//     packages/* holding their own package.json. Globs `dir`, `dir/*` and `dir/**`, resolved here.
//
// Paths are relative to the root, `/`-separated. A caller with a packet's `apps` pointer uses the
// pointer instead (owner/PACKET.md): that is a declaration, and this file is discovery.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const readPkg = (dir) => { const t = readText(join(dir, 'package.json')); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
// the real subdirectories of p (never a symlink, so no walk loops), [] when it cannot be read
const subdirs = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; } };
// the subdirectories of p a package manager follows: real ones and symlinks to a directory (a package
// linked into apps/* is a workspace); only a single step is taken through a link, so no loop
const linkedSubdirs = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() || (e.isSymbolicLink() && isDir(join(p, e.name)))).map((e) => e.name).sort(); } catch { return []; } };
// a glob walks no dependency tree and no hidden directory: pnpm and npm skip both
const GLOB_SKIP = (name) => name === 'node_modules' || name.startsWith('.');

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const PROJECT_SKIP = new Set(['node_modules', 'fixtures', '__fixtures__', 'testdata', 'test', 'tests', '__tests__']);
// beside a root that is itself an application (it holds a package.json), a docs site or an examples
// tree directly under it is that application's furniture, not a second application; anywhere else
// (a catalog entry named docs/, a root with no package.json whose site/ is the product) it is a project
const BESIDE_ROOT_SKIP = new Set(['docs', 'website', 'site', 'examples', 'example', 'samples']);
const NESTED_MAX_DEPTH = 4;
const SKIP_DIRS = new Set(['node_modules', '.git']);

// ── workspaces: resolve without a glob dependency ────────────────────
// Supports the three shapes npm-workspaces manifests actually use: a plain path
// ("tools/cli"), a single-star directory glob ("apps/*"), and a deep glob
// ("packages/**" — any depth of subdirectory). A candidate is a workspace only
// when it carries its own package.json; a pattern matching nothing is silently
// empty, same as npm's own resolution.
function expandWorkspaceGlob(rootDir, pattern) {
  const segs = pattern.split('/').filter(Boolean);
  const out = [];
  const walk = (relParts, segIdx) => {
    if (segIdx === segs.length) {
      const rel = relParts.join('/');
      if (rel && existsSync(join(rootDir, rel, 'package.json'))) out.push(rel);
      return;
    }
    const seg = segs[segIdx];
    if (seg === '..' || seg === '.') return;      // a workspace never leaves the tree (packet.mjs refuses `..` too)
    const curAbs = join(rootDir, ...relParts);
    if (seg === '**') {
      walk(relParts, segIdx + 1);                 // ** may consume zero levels
      for (const entry of subdirs(curAbs)) {   // real directories only: a link under ** could loop
        if (!GLOB_SKIP(entry)) walk([...relParts, entry], segIdx); // stay on ** for deeper levels
      }
      return;
    }
    if (seg.includes('*')) {
      const re = new RegExp('^' + seg.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      for (const entry of linkedSubdirs(curAbs)) {
        if (!GLOB_SKIP(entry) && re.test(entry)) walk([...relParts, entry], segIdx + 1);
      }
      return;
    }
    if (isDir(join(curAbs, seg))) walk([...relParts, seg], segIdx + 1);
  };
  walk([], 0);
  return out;
}

// pnpm-workspace.yaml's `packages:` list — a block list or an inline flow list of
// strings, `!` marking an exclusion. That is the shape pnpm's own file takes; anything
// else reads as no list, and the package.json / convention fallback applies.
export function readPnpmWorkspace(dir) {
  const text = readText(join(dir, 'pnpm-workspace.yaml'));
  if (text === null) return null;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^packages\s*:/.test(l));
  const raw = [];
  if (at > -1) {
    const inline = lines[at].match(/^packages\s*:\s*\[(.*)\]\s*(?:#.*)?$/);
    if (inline) raw.push(...inline[1].split(','));
    else for (let j = at + 1; j < lines.length; j++) {
      if (/^\s*(?:#.*)?$/.test(lines[j])) continue;
      const m = lines[j].match(/^\s+-\s*(.+?)\s*(?:#.*)?$/);
      if (!m) break;
      raw.push(m[1]);
    }
  }
  const items = raw.map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter((x) => x && x !== '.');
  return { include: items.filter((x) => !x.startsWith('!')), exclude: items.filter((x) => x.startsWith('!')).map((x) => x.slice(1)) };
}
// a workspace glob as a whole-path matcher (`**` any depth, `*` one segment) — used for
// pnpm's `!` exclusions, which name paths to drop rather than directories to walk
export function workspaceGlobRe(pattern) {
  const esc = String(pattern).replace(/^\.\//, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const body = esc.replace(/\*\*\//g, '\u0000').replace(/\/\*\*/g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '(?:/.*)?').replace(/\u0002/g, '.*');
  return new RegExp(`^${body}$`);
}

// where the workspace list came from — recorded so a reader can check it
function workspaceSource(dir, pkg) {
  const pw = readPnpmWorkspace(dir);
  if (pw && pw.include.length) return 'pnpm-workspace.yaml';
  if (pkg && pkg.workspaces && (Array.isArray(pkg.workspaces) || Array.isArray(pkg.workspaces.packages))) return 'package.json';
  return 'convention (apps/*, packages/*)';
}

export function resolveWorkspaces(dir, pkg) {
  let patterns = [], exclude = [];
  const pw = readPnpmWorkspace(dir);
  if (pw && pw.include.length) { patterns = pw.include; exclude = pw.exclude.map(workspaceGlobRe); }
  else if (pkg && pkg.workspaces) {
    if (Array.isArray(pkg.workspaces)) patterns = pkg.workspaces;
    else if (pkg.workspaces && typeof pkg.workspaces === 'object' && Array.isArray(pkg.workspaces.packages)) patterns = pkg.workspaces.packages;
  }
  if (!patterns.length) {
    // no workspaces declared: treat apps/* and packages/* as workspaces when they exist
    // (the shape most repos use without ever writing the field — the defect that motivated workspaces)
    for (const base of ['apps', 'packages']) {
      try { if (statSync(join(dir, base)).isDirectory()) patterns.push(`${base}/*`); } catch { /* not present */ }
    }
  }
  const seen = new Set();
  for (const pattern of patterns) for (const p of expandWorkspaceGlob(dir, String(pattern).replace(/^\.\//, ''))) if (!exclude.some((re) => re.test(p))) seen.add(p);
  return [...seen].sort();
}

// ── the application directory (#35): the root project's run directory, or --app ──
// null when the root carries its own package.json (or nothing qualifies): the root runs.
function resolveApp(dir, declared = null) {
  if (declared !== null) {
    const abs = resolve(dir, declared);
    const rel = relative(dir, abs).split(sep).join('/');
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`--app ${declared}: not a directory inside the target`);
    if (!existsSync(join(abs, 'package.json'))) throw new Error(`--app ${declared}: no package.json there`);
    return { path: rel, from: '--app' };
  }
  if (existsSync(join(dir, 'package.json'))) return null;
  let dirs = [];
  try { dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && existsSync(join(dir, e.name, 'package.json'))).map((e) => e.name); } catch { /* unreadable: none */ }
  return dirs.length === 1 ? { path: dirs[0], from: 'lone-directory' } : null;
}

// ── a nested project: its own package.json, and something that installs it on its own ──
function installsOnItsOwn(abs) {
  if (!existsSync(join(abs, 'package.json'))) return false;
  if (LOCKFILES.some((f) => existsSync(join(abs, f))) || existsSync(join(abs, 'pnpm-workspace.yaml'))) return true;
  const pkg = readPkg(abs);
  return !!(pkg && pkg.workspaces && (Array.isArray(pkg.workspaces) || Array.isArray(pkg.workspaces.packages)));
}

// whether abs, or a directory below it within `depth` levels, installs on its own
function holdsProject(abs, depth) {
  if (installsOnItsOwn(abs)) return true;
  if (depth <= 0) return false;
  return subdirs(abs).some((n) => !n.startsWith('.') && n !== 'node_modules' && holdsProject(join(abs, n), depth - 1));
}
// the nested projects below the root, breadth-first and sorted; `claimed` holds the paths the root
// project already owns (its run directory when that is not the root, and its workspaces), which are
// neither projects nor walked into
// the submodule paths .gitmodules names (`path = …`), whether or not they are checked out
function submodulePaths(dir) {
  const text = readText(join(dir, '.gitmodules'));
  if (text === null) return [];
  return [...text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map((m) => m[1].replace(/^\.\//, '').replace(/\/+$/, ''));
}
function findNested(dir, claimed, setAside) {
  const found = [];
  const others = new Set(submodulePaths(dir));
  const rootIsApp = existsSync(join(dir, 'package.json'));
  let level = [''];
  for (let depth = 1; depth <= NESTED_MAX_DEPTH && level.length; depth++) {
    const next = [];
    for (const rel of level) {
      for (const name of subdirs(join(dir, rel))) {
        const child = rel ? `${rel}/${name}` : name;
        if (name.startsWith('.')) continue;
        if (PROJECT_SKIP.has(name)) continue;   // a test's input, never the tree's project
        if (depth === 1 && rootIsApp && BESIDE_ROOT_SKIP.has(name)) {
          if (holdsProject(join(dir, child), NESTED_MAX_DEPTH - depth)) setAside.push({ path: child, reason: 'a docs site or examples tree beside the root application' });
          continue;
        }
        if (claimed.has(child) || others.has(child) || existsSync(join(dir, child, '.git'))) continue;
        if (installsOnItsOwn(join(dir, child))) { found.push(child); continue; }
        next.push(child);
      }
    }
    level = next;
  }
  return found.sort();
}

/**
 * Where the tree's projects are.
 * @param {string} dir the tree's root
 * @param {{ app?: string | null }} [opts] app: a declared application directory for the root project (`--app`)
 * @returns {{ projects: Array<{ path: string, run: string, from: string, workspaces: string[], workspaces_from: string | null, locations: string[] }>, setAside: Array<{ path: string, reason: string }> }}
 *   `path` is the project's directory ('.' for the root), `run` the directory its steps run in (the
 *   root's application directory, else `path`), `workspaces` each workspace relative to `run` (what
 *   an install covers), `locations` those and every apps/* or packages/* directory holding a
 *   package.json beside them (what a document must account for), relative to `run` too. `setAside`
 *   names each directory that installs on its own but is not read as a project, and why.
 */
export function locateProjects(dir, { app = null } = {}) {
  const root = resolve(dir);
  const appDir = resolveApp(root, app);
  const rootRun = appDir ? appDir.path : '.';
  const runAbs = (run) => (run === '.' ? root : join(root, run));
  const wsOf = (run) => {
    const abs = runAbs(run);
    const pkg = readPkg(abs);
    const workspaces = resolveWorkspaces(abs, pkg);
    // apps/* and packages/* holding a package.json are the tree's applications and libraries
    // whether or not a workspace list names them (the census has always checked them)
    const conventional = ['apps', 'packages'].flatMap((b) => linkedSubdirs(join(abs, b)).filter((e) => !GLOB_SKIP(e) && existsSync(join(abs, b, e, 'package.json'))).map((e) => `${b}/${e}`));
    return { workspaces, workspaces_from: workspaces.length ? workspaceSource(abs, pkg) : null, locations: [...new Set([...workspaces, ...conventional])].sort() };
  };
  const rootProject = { path: '.', run: rootRun, from: appDir ? appDir.from : 'root', ...wsOf(rootRun) };
  const claimed = new Set();
  if (rootRun !== '.') claimed.add(rootRun);
  for (const w of rootProject.locations) claimed.add(rootRun === '.' ? w : `${rootRun}/${w}`);
  const setAside = [];
  const nested = findNested(root, claimed, setAside).map((p) => ({ path: p, run: p, from: 'nested', ...wsOf(p) }));
  return { projects: [rootProject, ...nested], setAside };
}

/** A workspace's path from the root: its project's run directory joined with its own path. */
export const workspacePath = (project, ws) => (project.run === '.' ? ws : `${project.run}/${ws}`);
