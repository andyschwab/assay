#!/usr/bin/env node
// fresh-clone.mjs — the FRESH-CLONE instrument: does the repository install, build,
// lint, typecheck, test and migrate from a clean checkout, and are the README's
// command claims true of the tree? (registry/descriptors.yaml d-fresh-clone-runs,
// d-tests-execute-core, d-lint-typecheck-gate, d-schema-versioned, d-readme-true —
// "the instrument the floor most needs".) Its rows come in through tools/ingest.mjs
// (profile `fresh-clone`) and land on existing axes via adapters/fresh-clone.yaml.
//
// What it does, in order:
//   1. CLONE the target into a scratch directory (`git clone --depth 1`), so nothing
//      the working tree happens to carry (node_modules, .env, build output) can make
//      a broken repo look healthy. `--no-clone` runs in place (fixtures, CI checkouts).
//   2. DETECT the toolchain from what is present: package.json + lockfile kind
//      (package-lock → npm, pnpm-lock → pnpm, yarn.lock → yarn), the declared
//      toolchain (engines, .nvmrc, .tool-versions). A second family (pyproject /
//      requirements) is RECORDED as not-supported, never guessed at.
//   3. RUN the declared steps — install, build, lint, typecheck, test, migrate —
//      where each is declared. A step that is not declared is `not-declared`,
//      never `passed`: absence of a lint script is not a green lint.
//   4. REPLAY the README's command claims: every line in a fenced block that starts
//      `npm run <script>`, `npm test`, `npx <bin>`, `node <file>` or `make <target>`
//      is a claim; it is `present` when the script / binary / file / target exists
//      in the tree, else `missing`. Presence is what this pass decides — the runner
//      never executes an arbitrary README command beyond the declared steps above.
//   5. WORKSPACES (#127): an npm-workspaces root (`workspaces` in package.json, an
//      array or `{packages: [...]}`, globs `dir/*` and `dir/**` resolved with zero
//      deps) is not one repository, it is several — a root shell with no scripts, no
//      dependencies and no lockfile of its own reads "six steps not declared, exit
//      0" while the apps underneath it fail `npm ci` from a clean clone. When the
//      root declares no workspaces but `apps/*` or `packages/*` exist with their own
//      package.json, they are treated as workspaces too (the shape most repos use
//      without ever writing the field). The step plan runs once per workspace, in
//      its own directory, IN ADDITION to the root. Install is the one step that
//      does not simply run in the workspace directory: when the ROOT carries a
//      lockfile, the workspace installs via `npm ci --workspace <path>` run from the
//      root (the lockfile covers the whole tree); when the root carries none, the
//      workspace's own plan runs in its own directory — which reproduces the real
//      `EUSAGE` failure npm gives when a workspace's own lockfile disagrees with a
//      root that has none, and that failure is the honest result, recorded like any
//      other. A workspace-free repo emits `workspaces: []` and nothing else changes.
//
// Fail loud, never empty: the JSON's `exit` is 1 when any step failed or timed out
// or any claim is missing — at the root OR in any workspace — 0 only when every
// DECLARED step (root and every workspace) passed and every claim is present; the
// process exit code equals it. A crash of the runner itself exits 2, so ingest.mjs
// (success set [0, 1]) halts on it. The last 40 lines of each step's combined
// output stay in this raw document only — ingest copies the command and exit code
// into rows, never the output, so an environment value that a build prints cannot
// leak into a findings base.
//
// Usage:
//   node tools/fresh-clone.mjs <target-dir | git URL> --out <file.json>
//         [--timeout <seconds per step, default 600>] [--no-clone]
// Zero dependencies (node: modules only).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';

export const VERSION = '0.2.0';   // 0.2.0: workspaces[] (#127) — additive, older readers ignore it
export const STEPS = ['install', 'build', 'lint', 'typecheck', 'test', 'migrate'];
export const STEP_STATUS = ['passed', 'failed', 'not-declared', 'timed-out', 'skipped'];
export const CLAIM_STATUS = ['present', 'missing'];
const TAIL_LINES = 40;
const MAX_BUFFER = 64 * 1024 * 1024;

// ── toolchain detection ──────────────────────────────────────────────────────
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const nonEmpty = (o) => !!(o && typeof o === 'object' && Object.keys(o).length);

export function detectToolchain(dir) {
  const tc = { family: 'none', manifest: null, package_manager: null, lockfile: null, declared: {}, other_families: [] };
  const pkgPath = join(dir, 'package.json');
  const pkg = existsSync(pkgPath) ? readJson(pkgPath) : null;
  if (existsSync(pkgPath) && !pkg) tc.package_json_error = 'package.json exists but is not valid JSON';
  if (pkg) {
    tc.family = 'node';
    tc.manifest = 'package.json';
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) { tc.package_manager = 'pnpm'; tc.lockfile = 'pnpm-lock.yaml'; }
    else if (existsSync(join(dir, 'yarn.lock'))) { tc.package_manager = 'yarn'; tc.lockfile = 'yarn.lock'; }
    else if (existsSync(join(dir, 'package-lock.json'))) { tc.package_manager = 'npm'; tc.lockfile = 'package-lock.json'; }
    else if (existsSync(join(dir, 'npm-shrinkwrap.json'))) { tc.package_manager = 'npm'; tc.lockfile = 'npm-shrinkwrap.json'; }
    else { tc.package_manager = 'npm'; tc.lockfile = null; }
    if (typeof pkg.packageManager === 'string') tc.declared.packageManager = pkg.packageManager;
    if (nonEmpty(pkg.engines)) tc.declared.engines = pkg.engines;
    tc.has_dependencies = nonEmpty(pkg.dependencies) || nonEmpty(pkg.devDependencies) || nonEmpty(pkg.optionalDependencies);
    tc.scripts = Object.keys(pkg.scripts || {});
  }
  // database signals: a migration command is a floor requirement only where a database
  // exists; recorded here so ingest can tell "no migrate script" from "no database"
  const dbFiles = ['prisma', 'migrations', 'db/migrations', 'knexfile.js', 'knexfile.ts', 'drizzle.config.ts', 'drizzle.config.js', 'ormconfig.json', 'alembic.ini', 'db/schema.rb', 'schema.prisma'].filter((f) => existsSync(join(dir, f)));
  const dbDeps = ['@prisma/client', 'prisma', 'knex', 'typeorm', 'sequelize', 'drizzle-orm', 'mongoose', 'pg', 'mysql2', 'better-sqlite3', 'sqlite3', 'kysely', 'mikro-orm', '@mikro-orm/core'];
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  tc.database_signals = [...dbFiles.map((f) => `file:${f}`), ...dbDeps.filter((d) => deps[d] !== undefined).map((d) => `dep:${d}`)];
  const nvmrc = readText(join(dir, '.nvmrc'));
  if (nvmrc) tc.declared.nvmrc = nvmrc.trim();
  const toolVersions = readText(join(dir, '.tool-versions'));
  if (toolVersions) tc.declared.tool_versions = toolVersions.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  // a second family: recorded honestly as not-supported, never half-run
  const py = ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'poetry.lock'].filter((f) => existsSync(join(dir, f)));
  if (py.length) tc.other_families.push({ family: 'python', files: py, support: 'not-supported', reason: 'this runner exercises the node family only; python steps are not attempted and are not counted as passed' });
  const others = [['go', ['go.mod']], ['rust', ['Cargo.toml']], ['ruby', ['Gemfile']], ['jvm', ['pom.xml', 'build.gradle', 'build.gradle.kts']]];
  for (const [family, files] of others) {
    const present = files.filter((f) => existsSync(join(dir, f)));
    if (present.length) tc.other_families.push({ family, files: present, support: 'not-supported', reason: `this runner exercises the node family only; ${family} steps are not attempted and are not counted as passed` });
  }
  if (tc.family === 'none' && tc.other_families.length) tc.family = tc.other_families[0].family;
  return { toolchain: tc, pkg };
}

// ── workspaces (#127): resolve without a glob dependency ────────────────────
// Supports the three shapes npm-workspaces manifests actually use: a plain path
// ("tools/cli"), a single-star directory glob ("apps/*"), and a deep glob
// ("packages/**" — any depth of subdirectory). A candidate is a workspace only
// when it carries its own package.json; a pattern matching nothing is silently
// empty, same as npm's own resolution.
function expandWorkspaceGlob(rootDir, pattern) {
  const segs = pattern.split('/').filter(Boolean);
  const out = [];
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  const walk = (relParts, segIdx) => {
    if (segIdx === segs.length) {
      const rel = relParts.join('/');
      if (rel && existsSync(join(rootDir, rel, 'package.json'))) out.push(rel);
      return;
    }
    const seg = segs[segIdx];
    const curAbs = join(rootDir, ...relParts);
    if (seg === '**') {
      walk(relParts, segIdx + 1);                 // ** may consume zero levels
      if (!isDir(curAbs)) return;
      for (const entry of readdirSync(curAbs)) {
        if (isDir(join(curAbs, entry))) walk([...relParts, entry], segIdx); // stay on ** for deeper levels
      }
      return;
    }
    if (seg.includes('*')) {
      if (!isDir(curAbs)) return;
      const re = new RegExp('^' + seg.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      for (const entry of readdirSync(curAbs)) {
        if (re.test(entry) && isDir(join(curAbs, entry))) walk([...relParts, entry], segIdx + 1);
      }
      return;
    }
    if (isDir(join(curAbs, seg))) walk([...relParts, seg], segIdx + 1);
  };
  walk([], 0);
  return out;
}

export function resolveWorkspaces(dir, pkg) {
  let patterns = [];
  if (pkg && pkg.workspaces) {
    if (Array.isArray(pkg.workspaces)) patterns = pkg.workspaces;
    else if (pkg.workspaces && typeof pkg.workspaces === 'object' && Array.isArray(pkg.workspaces.packages)) patterns = pkg.workspaces.packages;
  }
  if (!patterns.length) {
    // no workspaces declared: treat apps/* and packages/* as workspaces when they exist
    // (the shape most repos use without ever writing the field — the Scout defect)
    for (const base of ['apps', 'packages']) {
      try { if (statSync(join(dir, base)).isDirectory()) patterns.push(`${base}/*`); } catch { /* not present */ }
    }
  }
  const seen = new Set();
  for (const pattern of patterns) for (const p of expandWorkspaceGlob(dir, String(pattern))) seen.add(p);
  return [...seen].sort();
}

// ── step planning: what is declared, and the command that runs it ────────────
const NOT_DECLARED = (reason) => ({ status: 'not-declared', command: null, reason });
const MIGRATE_NAMES = ['migrate', 'db:migrate'];
const MIGRATE_DRY_NAMES = ['migrate:dry', 'migrate:dry-run', 'migrate:check', 'migrate:status', 'db:migrate:dry', 'db:migrate:dry-run', 'db:migrate:check', 'db:migrate:status'];

export function planSteps(toolchain, pkg) {
  const plan = {};
  if (toolchain.family !== 'node' || !pkg) {
    const why = toolchain.package_json_error || (toolchain.family === 'none' ? 'no package.json in the tree' : `${toolchain.family} family: not supported by this runner`);
    for (const s of STEPS) plan[s] = NOT_DECLARED(why);
    return plan;
  }
  const scripts = pkg.scripts || {};
  const pm = toolchain.package_manager;
  const run = (name) => pm === 'yarn' ? `yarn run ${name}` : `${pm} run ${name}`;
  // install is declared by the presence of dependencies or a lockfile; a package with
  // neither has nothing to install, and an install step it never declared is not a pass
  if (toolchain.has_dependencies || toolchain.lockfile) {
    let cmd;
    if (pm === 'pnpm') cmd = toolchain.lockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install';
    else if (pm === 'yarn') cmd = toolchain.lockfile ? 'yarn install --frozen-lockfile' : 'yarn install';
    else cmd = toolchain.lockfile ? 'npm ci' : 'npm install';
    plan.install = { status: 'declared', command: cmd, needs_install: false };
  } else plan.install = NOT_DECLARED('no dependencies and no lockfile declared in package.json');
  for (const s of ['build', 'lint', 'typecheck']) {
    plan[s] = scripts[s] !== undefined ? { status: 'declared', command: run(s), needs_install: true } : NOT_DECLARED(`no "${s}" script in package.json`);
  }
  plan.test = scripts.test !== undefined
    ? { status: 'declared', command: pm === 'npm' ? 'npm test' : run('test'), needs_install: true }
    : NOT_DECLARED('no "test" script in package.json');
  // migrate: a script named migrate / db:migrate, or one invoking prisma migrate deploy /
  // knex migrate:latest — run only when a DATABASE_URL-free dry form exists, because
  // this runner carries no database and will not point a real migration at one
  const migName = MIGRATE_NAMES.find((n) => scripts[n] !== undefined)
    || Object.keys(scripts).find((n) => /prisma\s+migrate\s+deploy|knex\s+migrate:latest/.test(String(scripts[n])));
  if (!migName) plan.migrate = NOT_DECLARED('no migrate / db:migrate script (nor a prisma migrate deploy / knex migrate:latest script) in package.json');
  else {
    const dry = MIGRATE_DRY_NAMES.find((n) => scripts[n] !== undefined);
    if (dry) plan.migrate = { status: 'declared', command: run(dry), needs_install: true, declared_as: migName, dry_form: dry };
    else if (/--dry-run/.test(String(scripts[migName]))) plan.migrate = { status: 'declared', command: run(migName), needs_install: true, declared_as: migName, dry_form: migName };
    else plan.migrate = NOT_DECLARED(`"${migName}" is declared but needs a live database; no DATABASE_URL-free dry form (a migrate:dry / migrate:check / migrate:status script, or --dry-run) exists, so it was not run against an empty database`);
  }
  return plan;
}

// ── running one step ─────────────────────────────────────────────────────────
function scrubbedEnv() {
  const env = { ...process.env };
  delete env.DATABASE_URL;                 // never let a real database reach a migrate step
  env.CI = env.CI || '1';
  env.npm_config_fund = 'false'; env.npm_config_audit = 'false'; env.npm_config_update_notifier = 'false';
  return env;
}
const tail = (s) => String(s || '').split('\n').slice(-TAIL_LINES).join('\n');

export function runStep(name, command, cwd, timeoutSec) {
  const started = Date.now();
  const r = spawnSync(command + ' 2>&1', { cwd, shell: true, env: scrubbedEnv(), encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER });
  const duration_ms = Date.now() - started;
  const output_tail = tail(r.stdout);
  if (r.error && r.error.code === 'ETIMEDOUT') return { name, status: 'timed-out', command, exit_code: null, duration_ms, output_tail, reason: `exceeded ${timeoutSec}s` };
  if (r.error) return { name, status: 'failed', command, exit_code: null, duration_ms, output_tail, reason: `could not spawn: ${r.error.message}` };
  if (r.signal) return { name, status: 'failed', command, exit_code: null, duration_ms, output_tail, reason: `killed by ${r.signal}` };
  return { name, status: r.status === 0 ? 'passed' : 'failed', command, exit_code: r.status, duration_ms, output_tail };
}

export function runSteps(plan, cwd, timeoutSec, log = () => {}) {
  const out = [];
  let installBroken = null;
  for (const name of STEPS) {
    const p = plan[name];
    if (p.status === 'not-declared') { out.push({ name, status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: p.reason }); continue; }
    if (p.needs_install && installBroken) { out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: `install ${installBroken}; ${name} not attempted` }); continue; }
    const stepCwd = p.cwd || cwd;   // a workspace's install may run from the root (npm ci --workspace)
    log(`  → ${name}: ${p.command}`);
    const row = runStep(name, p.command, stepCwd, timeoutSec);
    if (p.declared_as) { row.declared_as = p.declared_as; row.dry_form = p.dry_form; }
    out.push(row);
    log(`    ${row.status}${row.exit_code !== null ? ` (exit ${row.exit_code})` : ''} in ${row.duration_ms} ms`);
    if (name === 'install' && row.status !== 'passed') installBroken = row.status;
  }
  return out;
}

// ── one workspace's run: its own step plan, its own README, install possibly
//    rebased onto the root (see the module doc's WORKSPACES section) ───────────
export function planWorkspace(rootToolchain, wsToolchain, wsPkg, wsRelPath) {
  const plan = planSteps(wsToolchain, wsPkg);
  if (rootToolchain.lockfile && plan.install.status === 'declared') {
    // the root's lockfile covers the whole tree: install this workspace from the root,
    // scoped to it, rather than re-deriving a package-manager guess in its own directory
    plan.install = { status: 'declared', command: `npm ci --workspace ${wsRelPath}`, needs_install: false, cwd: 'ROOT' };
  }
  return plan;
}

export function runWorkspace(wsRelPath, workDir, rootToolchain, timeoutSec, log = () => {}) {
  const wsDir = join(workDir, wsRelPath);
  const { toolchain, pkg } = detectToolchain(wsDir);
  const plan = planWorkspace(rootToolchain, toolchain, pkg, wsRelPath);
  if (plan.install.cwd === 'ROOT') plan.install.cwd = workDir;   // resolve the sentinel to the real clone root
  const steps = runSteps(plan, wsDir, timeoutSec, (m) => log(`  [${wsRelPath}]${m}`));
  const { readme, claims } = replayReadme(wsDir, pkg);
  return { path: wsRelPath, toolchain, steps, readme, readme_claims: claims };
}

// ── README claim replay ──────────────────────────────────────────────────────
export function findReadme(dir) {
  const names = readdirSync(dir).filter((f) => /^readme(\.(md|markdown|txt))?$/i.test(f)).sort();
  return names.find((f) => /\.md$/i.test(f)) || names[0] || null;
}
// the claim grammar — one line, one claim; a leading shell prompt is not part of it
const CLAIM_RE = /^(?:\$\s+|>\s+)?(npm run (\S+)|npm test\b|npx (\S+)|node (\S+)|make (\S+))/;
export function parseReadmeClaims(text) {
  const claims = [];
  let inFence = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) inFence = fence[1][0];
      else if (fence[1][0] === inFence) inFence = null;
      continue;
    }
    if (!inFence) continue;
    const m = line.trim().match(CLAIM_RE);
    if (!m) continue;
    const command = m[1];
    if (m[2] !== undefined) claims.push({ line: i + 1, command, kind: 'npm-script', name: m[2].replace(/^--$/, '') });
    else if (/^npm test/.test(command)) claims.push({ line: i + 1, command, kind: 'npm-script', name: 'test' });
    else if (m[3] !== undefined) claims.push({ line: i + 1, command, kind: 'npx-bin', name: m[3] });
    else if (m[4] !== undefined) claims.push({ line: i + 1, command, kind: 'node-file', name: m[4] });
    else if (m[5] !== undefined) claims.push({ line: i + 1, command, kind: 'make-target', name: m[5] });
  }
  return claims.filter((c) => c.name && !c.name.startsWith('-'));
}

export function claimPresent(claim, dir, pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  if (claim.kind === 'npm-script') return scripts[claim.name] !== undefined;
  if (claim.kind === 'node-file') {
    const p = resolve(dir, claim.name);
    if (!p.startsWith(resolve(dir))) return false;                    // never resolve outside the tree
    return existsSync(p) || existsSync(p + '.js') || existsSync(p + '.mjs') || existsSync(p + '.cjs');
  }
  if (claim.kind === 'npx-bin') {
    const bare = claim.name.replace(/@.*$/, (s) => (claim.name.startsWith('@') ? s : ''));   // strip a version pin, keep a scope
    const bin = bare.startsWith('@') ? bare.split('/').slice(0, 2).join('/') : bare.split('@')[0];
    if (existsSync(join(dir, 'node_modules', '.bin', bin.split('/').pop()))) return true;
    if (pkg) {
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
      if (deps[bin] !== undefined) return true;
      const own = pkg.bin;
      if (typeof own === 'string' && pkg.name === bin) return true;
      if (own && typeof own === 'object' && own[bin] !== undefined) return true;
    }
    return false;
  }
  if (claim.kind === 'make-target') {
    const mk = ['Makefile', 'makefile', 'GNUmakefile'].map((f) => join(dir, f)).find((p) => existsSync(p));
    if (!mk) return false;
    const re = new RegExp(`^${claim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
    return re.test(readFileSync(mk, 'utf8'));
  }
  return false;
}

export function replayReadme(dir, pkg) {
  const readme = findReadme(dir);
  if (!readme) return { readme: null, claims: [] };
  const claims = parseReadmeClaims(readFileSync(join(dir, readme), 'utf8'));
  for (const c of claims) c.status = claimPresent(c, dir, pkg) ? 'present' : 'missing';
  return { readme, claims };
}

// ── the run ──────────────────────────────────────────────────────────────────
const isUrl = (s) => /^(https?|ssh|git|file):\/\//.test(s) || /^[\w.-]+@[\w.-]+:/.test(s);
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: scrubbedEnv(), maxBuffer: MAX_BUFFER });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}

export function run({ target, timeout = 600, clone = true, log = () => {} }) {
  const startedAt = new Date().toISOString();
  let workDir, scratch = null;
  const t = { path: target, head: null, cloned: false };
  if (clone) {
    const src = isUrl(target) ? target : `file://${resolve(target)}`;
    if (!isUrl(target) && !existsSync(target)) throw new Error(`target does not exist: ${target}`);
    scratch = mkdtempSync(join(tmpdir(), 'assay-fresh-clone-'));
    workDir = join(scratch, 'checkout');
    log(`→ git clone --depth 1 ${src}`);
    const c = git(['clone', '--depth', '1', '--quiet', src, workDir], scratch);
    if (!c.ok) { rmSync(scratch, { recursive: true, force: true }); throw new Error(`git clone failed: ${c.err || c.out}`); }
    t.cloned = true;
  } else {
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    workDir = resolve(target);
  }
  try {
    const head = git(['rev-parse', 'HEAD'], workDir);
    t.head = head.ok ? head.out : null;
    const { toolchain, pkg } = detectToolchain(workDir);
    const plan = planSteps(toolchain, pkg);
    const steps = runSteps(plan, workDir, timeout, log);
    const { readme, claims } = replayReadme(workDir, pkg);
    const stepBad = steps.some((s) => s.status === 'failed' || s.status === 'timed-out');
    const claimBad = claims.some((c) => c.status === 'missing');
    const wsPaths = pkg ? resolveWorkspaces(workDir, pkg) : [];
    if (wsPaths.length) log(`→ workspaces: ${wsPaths.join(', ')}`);
    const workspaces = wsPaths.map((p) => runWorkspace(p, workDir, toolchain, timeout, log));
    const wsBad = workspaces.some((w) => w.steps.some((s) => s.status === 'failed' || s.status === 'timed-out') || w.readme_claims.some((c) => c.status === 'missing'));
    return {
      tool: 'fresh-clone', version: VERSION, started_at: startedAt, finished_at: new Date().toISOString(),
      target: t, toolchain, timeout_seconds: timeout, steps, readme, readme_claims: claims, workspaces,
      exit: stepBad || claimBad || wsBad ? 1 : 0,
    };
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || args[i - 1] === '--no-clone'));
  const out = opt('--out');
  const timeout = opt('--timeout') ? Number(opt('--timeout')) : 600;
  if (!target || !out || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('usage: node tools/fresh-clone.mjs <target-dir | git URL> --out <file.json> [--timeout <seconds per step, default 600>] [--no-clone]');
    process.exit(2);
  }
  try {
    const doc = run({ target, timeout, clone: !args.includes('--no-clone'), log: (m) => console.error(m) });
    writeFileSync(isAbsolute(out) ? out : resolve(out), JSON.stringify(doc, null, 2) + '\n');
    const failed = doc.steps.filter((s) => s.status === 'failed' || s.status === 'timed-out').map((s) => s.name);
    const undeclared = doc.steps.filter((s) => s.status === 'not-declared').map((s) => s.name);
    const missing = doc.readme_claims.filter((c) => c.status === 'missing').length;
    const wsSummary = doc.workspaces && doc.workspaces.length
      ? ` · ${doc.workspaces.length} workspace(s): ${doc.workspaces.map((w) => `${w.path} ${w.steps.some((s) => s.status === 'failed' || s.status === 'timed-out') || w.readme_claims.some((c) => c.status === 'missing') ? 'FAIL' : 'ok'}`).join(', ')}`
      : '';
    console.error(`${doc.exit === 0 ? '✓' : '✗'} fresh-clone: ${doc.steps.filter((s) => s.status === 'passed').length} passed · ${failed.length} failed/timed-out${failed.length ? ` (${failed.join(', ')})` : ''} · ${undeclared.length} not declared${undeclared.length ? ` (${undeclared.join(', ')})` : ''} · README claims ${doc.readme_claims.length - missing}/${doc.readme_claims.length} present${wsSummary} → ${out}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ fresh-clone crashed: ${e.message}`);
    process.exit(2);
  }
}
