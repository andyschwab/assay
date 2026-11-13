#!/usr/bin/env node
// fresh-clone.mjs — the FRESH-CLONE instrument: does the repository install, build,
// lint, typecheck, test and migrate from a clean checkout, and are the README's
// command claims true of the tree? (yardstick/requirements.yaml d-fresh-clone-runs,
// d-tests-execute-core, d-lint-typecheck-gate, d-schema-versioned, d-readme-true —
// "the instrument the floor most needs".) Its rows come in through map/ingest.mjs
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
//      never `passed`: absence of a lint script is not a green lint. The test step
//      also records the runner's own pass / skip / fail counts (`tests`, or
//      `unparsed`): an exit code of 0 is not the suite having run (#30).
//   4. REPLAY the README's command claims: every line in a fenced block that starts
//      `npm run <script>`, `npm test`, `npx <bin>`, `node <file>` or `make <target>`
//      is a claim; it is `present` when the script / binary / file / target exists
//      in the tree, else `missing`. Presence is what this pass decides — the runner
//      never executes an arbitrary README command beyond the declared steps above.
//   5. WORKSPACES: a workspaces root (`pnpm-workspace.yaml`'s `packages:` list, with
//      `!` exclusions, when that file exists — pnpm ignores the package.json field;
//      else `workspaces` in package.json, an array or `{packages: [...]}`; globs
//      `dir/*` and `dir/**` resolved with zero deps) is not one repository, it is
//      several — a root shell with no scripts, no
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
//      other. A pnpm or yarn root's own install already installs every workspace, so
//      there a workspace's install is `covered` by the root's (or `skipped`, with the
//      reason, when the root's install did not pass) — never an npm command against a
//      pnpm or yarn lockfile. A workspace with no lockfile of its own runs its scripts
//      with the root's package manager for the same reason.
//      COVERED BY THE ROOT: a step a workspace does not declare itself is `covered`,
//      not a gap, when a root step that PASSED demonstrably reaches it — a recursive
//      root command (`pnpm -r`, `npm … --workspaces`, `yarn workspaces foreach`,
//      `turbo run`, `nx run-many`, `lerna run`) for any step; a root linter pointed
//      at `.` for lint; a root test runner (vitest / jest / node --test) given no
//      path arguments, which discovers tests across the tree, for test. Migrate
//      belongs to whichever package declares it (the root, else the first workspace
//      that does), not to every workspace importing the ORM. The covering command is
//      recorded on the step (`covered_by`) and yields no finding row; a workspace
//      script that exists and fails stays a gap. Anything the rules cannot show stays
//      not-declared: the reach is read from the command, never assumed.
//      A workspace-free repo emits `workspaces: []` and nothing else changes.
//   6. A LONE APPLICATION DIRECTORY (#35): a repository with no package.json at its
//      root and exactly one directory directly beneath it holding one (`app/`, the
//      shape apps built from a common starter kit take) is that directory's project —
//      structure-scan's rule for where knip runs (knipRoot), the same rule here.
//      `--app <dir>` declares it instead (a directory inside the tree holding a
//      package.json; anything else crashes). The steps and workspaces run there; the
//      README replayed is the root's (else the app's own), its commands checked as a
//      reader runs them after `cd <dir>`. The document records `app: { path, from }`
//      and names `readme` from the root; workspace paths stay relative to the app.
//   7. NESTED PROJECTS (#246): map/projects.mjs's rule, the census's too. A directory below the
//      root with its own package.json and its own lockfile or workspace file is a project of its
//      own, measured as a root is (its plan, its README, its workspaces) under `projects[]`; a root
//      step the root does not declare reads `covered` by its projects when every one reaches it
//      (map/scanners/CONTRACT.md). A step whose package manager is not on PATH (an install, or
//      a script run through npm, pnpm or yarn) is not attempted and reads skipped, never failed (#248).
//   8. SERVICES A TARGET DECLARES (#256, map/services.mjs): a repository whose test or migrate
//      step needs a service (a database) names it in `.assay/services.yaml` at its root — the
//      image pinned by tag, its readiness check, the environment its bound steps get, and setup
//      commands. Under `--services` (and only then) each is started as a throwaway container
//      before the root project's steps; once install has run, the setup commands run (each its
//      own row under `services.setup`, never charged to a step), then migrate (the real migrate
//      script, against an empty database) and test, with the declared environment, each bound
//      row naming the services it ran with; every container is removed in the run's `finally`.
//      Declared without `--services`, or with no container runtime, or a service that did not
//      come up: the bound steps read skipped, "needs <service>, which this measurement did not
//      provide (…)", which the requirements read not measured. A declaration that is refused
//      (an unknown key, an unpinned image) is recorded `services.refused` and the steps run as
//      if nothing were declared. No declaration, nothing changes: a failing step stays failed.
//      The declaration binds the root project (its application directory included), not its
//      workspaces or nested projects.
//
// The target's own code runs here — its install (lifecycle scripts included), build,
// lint, typecheck, test and migrate-dry scripts — so every child gets the allow-listed
// environment of map/child-env.mjs (PATH, HOME, CI, the npm_config_* values below),
// never the evaluator's, and the evaluator's DATABASE_URL never reaches a step. The one
// addition is a target's own declared environment (8, above), and only on the steps it
// declares, only under --services. It is not a
// sandbox: run it in a disposable container or VM, and `assay start` runs it only
// under --allow-exec (map/scanners/CONTRACT.md §3a).
//
// Fail loud, never empty: the JSON's `exit` is 1 when any step failed or timed out
// or any claim is missing — at the root OR in any workspace — 0 only when every
// DECLARED step (root and every workspace) passed and every claim is present; the
// process exit code equals it. A crash of the runner itself exits 2, so ingest.mjs
// (success set [0, 1]) halts on it. The last 40 lines of each step's combined
// output stay in this document only (an operator whose runner holds no secrets may keep
// it, outside the run: `assay start --unstripped-report <file>`) — ingest copies the command and exit code
// into rows, never the output, and drops the tails before archiving the document
// into map/raw/ (the routine uploads the run), so an environment value that a build
// prints cannot leak into a findings base or a run. A URL target is recorded and
// logged with its userinfo stripped (repo-census's stripUserinfo); only git sees it.
//
// Usage:
//   node assay.mjs fresh-clone <target-dir | git URL> --out <file.json>
//         [--timeout <seconds per step, default 600>] [--no-clone] [--app <dir>] [--services]
// Zero dependencies (node: modules only).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute, sep, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';
import { childEnv, proxyDropNote } from './child-env.mjs';
import { stripUserinfo } from './repo-census.mjs';
import { locateProjects } from './projects.mjs';
import { SERVICES_FILE, readServices, findRuntime, startServices, stopServices, resolveEnv } from './services.mjs';

export const VERSION = '0.8.0';   // 0.2.0: workspaces[]; 0.3.0: pnpm-workspace.yaml, step status `covered` (+ covered_by); 0.4.0: test step `tests` counts (#30); 0.5.0: `app` (#35); 0.6.0: `projects[]` (#246), an install skipped when its package manager is not on PATH (#248); 0.7.0: `services` and a step's `services` (#256); 0.8.0: a step's `reason_code` (#319)
export const STEPS = ['install', 'build', 'lint', 'typecheck', 'test', 'migrate'];
export const STEP_STATUS = ['passed', 'failed', 'not-declared', 'timed-out', 'skipped', 'covered'];
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
  // exists; recorded here so ingest can tell "no migrate script" from "no database" —
  // and, with none of these anywhere, d-schema-versioned reads not-applicable, never
  // met (yardstick/requirements.yaml). Supabase and Drizzle are their own signals, not
  // implied by the generic ORM list: a Supabase project often carries no ORM dependency
  // at all, only supabase/migrations/*.sql and the client package.
  const dbFiles = [
    'prisma', 'migrations', 'db/migrations', 'knexfile.js', 'knexfile.ts',
    'drizzle.config.ts', 'drizzle.config.js', 'ormconfig.json', 'alembic.ini',
    'db/schema.rb', 'schema.prisma', 'supabase/migrations', 'supabase/config.toml',
    'drizzle',
  ].filter((f) => existsSync(join(dir, f)));
  const dbDeps = [
    '@prisma/client', 'prisma', 'knex', 'typeorm', 'sequelize', 'drizzle-orm',
    'drizzle-kit', 'mongoose', 'pg', 'mysql2', 'better-sqlite3', 'sqlite3',
    'kysely', 'mikro-orm', '@mikro-orm/core', '@supabase/supabase-js', '@supabase/ssr',
  ];
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  // the common `migrations/*.sql` shape under a plain db/ or sql/ directory — no ORM,
  // no config file, just numbered SQL files a raw migration runner (or a hand-rolled
  // script) replays; matched by content, not just the directory's existence, so an
  // empty or unrelated db/migrations dir does not (already covered by dbFiles above,
  // this catches the sibling `sql/migrations` shape too).
  const sqlMigrationDirs = ['db/migrations', 'sql/migrations'].filter((d) => {
    try { return readdirSync(join(dir, d)).some((f) => f.toLowerCase().endsWith('.sql')); } catch { return false; }
  });
  tc.database_signals = [
    ...dbFiles.map((f) => `file:${f}`),
    ...dbDeps.filter((d) => deps[d] !== undefined).map((d) => `dep:${d}`),
    ...sqlMigrationDirs.map((d) => `file:${d}/*.sql`),
  ];
  const nvmrc = readText(join(dir, '.nvmrc'));
  if (nvmrc) tc.declared.nvmrc = nvmrc.trim();
  const toolVersions = readText(join(dir, '.tool-versions'));
  if (toolVersions) tc.declared.tool_versions = toolVersions.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  // a second family: recorded honestly as not-supported, never half-run
  const py = ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'poetry.lock'].filter((f) => existsSync(join(dir, f)));
  if (py.length) tc.other_families.push({ family: 'python', files: py, support: 'not-supported', reason: 'this runner exercises the node family only; python steps are not attempted and are not counted as passed' });
  const others = [['go', ['go.mod']], ['rust', ['Cargo.toml']], ['ruby', ['Gemfile']], ['jvm', ['pom.xml', 'build.gradle', 'build.gradle.kts']]];
  for (const [family, files] of others) {
    const present = /** @type {string[]} */ (files).filter((f) => existsSync(join(dir, f)));
    if (present.length) tc.other_families.push({ family, files: present, support: 'not-supported', reason: `this runner exercises the node family only; ${family} steps are not attempted and are not counted as passed` });
  }
  if (tc.family === 'none' && tc.other_families.length) tc.family = tc.other_families[0].family;
  return { toolchain: tc, pkg };
}

// ── workspaces and the application directory: map/projects.mjs, the one rule every
// instrument reads for where a tree's projects are (#246); re-exported for this file's callers
export { readPnpmWorkspace, workspaceGlobRe, resolveWorkspaces } from './projects.mjs';

// ── step planning: what is declared, and the command that runs it ────────────
// reason_code (#319): the reason as data, closed (REASON_CODES), so a rule keys on it, never the prose
export const REASON_CODES = ['needs-live-database', 'service-not-provided'];
const NOT_DECLARED = (reason, reason_code) => ({ status: 'not-declared', command: null, reason, ...(reason_code ? { reason_code } : {}) });
const MIGRATE_NAMES = ['migrate', 'db:migrate'];
const MIGRATE_DRY_NAMES = ['migrate:dry', 'migrate:dry-run', 'migrate:check', 'migrate:status', 'db:migrate:dry', 'db:migrate:dry-run', 'db:migrate:check', 'db:migrate:status'];

function planSteps(toolchain, pkg) {
  const plan = /** @type {Record<string, any>} */ ({});
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
    else plan.migrate = NOT_DECLARED(`"${migName}" is declared but needs a live database; no DATABASE_URL-free dry form (a migrate:dry / migrate:check / migrate:status script, or --dry-run) exists, so it was not run against an empty database`, 'needs-live-database');
  }
  return plan;
}

// ── running one step ─────────────────────────────────────────────────────────
// the allow-list (map/child-env.mjs): no credential, and no DATABASE_URL of the evaluator's;
// `declared` is a target's own declared environment (map/services.mjs), only on its bound steps
const stepEnv = (declared = /** @type {Record<string, string>} */ ({})) => ({ ...childEnv({ npm_config_fund: 'false', npm_config_audit: 'false', npm_config_update_notifier: 'false' }), ...declared });
// one path as one shell word (the step commands run through a shell)
const shellQuote = (s) => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`;
const tail = (s) => String(s || '').split('\n').slice(-TAIL_LINES).join('\n');

// ── test counts: an exit code of 0 is not the suite having run (#30) ─────────
// The runner's own summary line is the only place the skipped share shows: a suite
// whose database tests skip themselves when DATABASE_URL is unset exits 0 having run
// 40% of itself. Read from the step's whole output (never only the tail, which a long
// go -v listing outruns), colour codes stripped; every summary a run prints is summed
// (a script running two suites prints two). Not-run-but-listed tests (todo) count as
// skipped. Null when no known summary appears: the caller records `unparsed`.
const TEST_CONFIGS = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cjs',
  'jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json', 'pytest.ini', 'conftest.py'];
const ANSI_RE = /\u001b\[[0-9;]*m/g;
const TEST_COUNT_PARSERS = [
  // vitest: `Tests  221 passed | 330 skipped (551)` (not `Test Files`)
  (lines) => lines.map((l) => l.match(/^\s*Tests\s+(.+?)\s*\((\d+)\)\s*$/)).filter(Boolean)
    .map((m) => ({ ...countWords(m[1].split('|')), total: Number(m[2]) })),
  // jest: `Tests:       1 failed, 3 skipped, 2 passed, 6 total`
  (lines) => lines.map((l) => l.match(/^\s*Tests:\s+(.+?),?\s*(\d+) total\s*$/)).filter(Boolean)
    .map((m) => ({ ...countWords(m[1].split(',')), total: Number(m[2]) })),
  // node:test, tap (`# pass 2`) or spec (`ℹ pass 2`) reporter; one block per run, starting at `tests N`
  (lines) => {
    const out = [];
    for (const l of lines) {
      const m = l.match(/^\s*(?:#|\u2139)\s+(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)\s*$/);
      if (!m) continue;
      if (m[1] === 'tests') { out.push({ passed: 0, skipped: 0, failed: 0, total: Number(m[2]) }); continue; }
      const cur = out[out.length - 1];
      if (!cur) continue;
      if (m[1] === 'pass') cur.passed += Number(m[2]);
      else if (m[1] === 'fail' || m[1] === 'cancelled') cur.failed += Number(m[2]);
      else cur.skipped += Number(m[2]);
    }
    return out;
  },
  // pytest: `==== 2 passed, 3 skipped in 0.12s ====`
  (lines) => lines.map((l) => l.match(/^=+ (.*\d+ (?:passed|failed|skipped|errors?)\b.*?) in [\d.]+s\b.*=+\s*$/)).filter(Boolean)
    .map((m) => { const c = countWords(m[1].split(',')); return { ...c, total: c.passed + c.skipped + c.failed }; }),
  // go test -v: one `--- PASS|SKIP|FAIL: Name` line per test (subtests indented)
  (lines) => {
    const c = { passed: 0, skipped: 0, failed: 0, total: 0 };
    for (const l of lines) {
      const m = l.match(/^\s*--- (PASS|SKIP|FAIL): /);
      if (!m) continue;
      c[{ PASS: 'passed', SKIP: 'skipped', FAIL: 'failed' }[m[1]]]++; c.total++;
    }
    return c.total ? [c] : [];
  },
];
function countWords(parts) {
  const c = { passed: 0, skipped: 0, failed: 0 };
  for (const p of parts) {
    const m = p.trim().match(/^(\d+)\s+(passed|failed|skipped|todo|pending|errors?|xfailed|xpassed|deselected)\b/);
    if (!m) continue;
    const n = Number(m[1]);
    if (m[2] === 'passed' || m[2] === 'xpassed') c.passed += n;
    else if (m[2] === 'failed' || m[2].startsWith('error')) c.failed += n;
    else if (m[2] !== 'deselected') c.skipped += n;
  }
  return c;
}
export function parseTestCounts(output) {
  const lines = String(output || '').replace(ANSI_RE, '').split(/\r?\n/);
  for (const parse of TEST_COUNT_PARSERS) {
    const found = parse(lines);
    if (found.length) return found.reduce((a, b) => ({ passed: a.passed + b.passed, skipped: a.skipped + b.skipped, failed: a.failed + b.failed, total: a.total + b.total }));
  }
  return null;
}

export function runStep(name, command, cwd, timeoutSec, declaredEnv = {}) {
  const started = Date.now();
  const r = spawnSync(command + ' 2>&1', { cwd, shell: true, env: stepEnv(declaredEnv), encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER });
  const duration_ms = Date.now() - started;
  const output_tail = tail(r.stdout);
  const envNote = proxyDropNote();   // #65: a proxy URL kept from the step is said on its row
  const noted = (row) => envNote ? { ...row, env_note: envNote } : row;
  if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ETIMEDOUT') return noted({ name, status: 'timed-out', command, exit_code: null, duration_ms, output_tail, reason: `exceeded ${timeoutSec}s` });
  if (r.error) return noted({ name, status: 'failed', command, exit_code: null, duration_ms, output_tail, reason: `could not spawn: ${r.error.message}` });
  if (r.signal) return noted({ name, status: 'failed', command, exit_code: null, duration_ms, output_tail, reason: `killed by ${r.signal}` });
  const row = noted({ name, status: r.status === 0 ? 'passed' : 'failed', command, exit_code: r.status, duration_ms, output_tail });
  if (name === 'test') {
    row.tests = parseTestCounts(r.stdout) || 'unparsed';
    const config = TEST_CONFIGS.find((f) => existsSync(join(cwd, f)));
    if (config) row.test_config = config;   // where a skipped share's evidence points
  }
  return row;
}

// svc: the root project's declared services (map/services.mjs) — { decl, state, provided,
// reason, setup: [] }; absent, nothing is bound. With it, migrate runs before test (the declared
// setup, then migrate, then test); the rows keep STEPS order.
const SERVICE_ORDER = ['install', 'build', 'lint', 'typecheck', 'migrate', 'test'];
function runSteps(plan, cwd, timeoutSec, log = /** @type {(msg: string) => void} */ (() => {}), svc = null) {
  const out = [];
  let installBroken = null;
  for (const name of svc ? SERVICE_ORDER : STEPS) {
    const p = plan[name];
    if (p.status === 'not-declared') { out.push({ name, status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: p.reason, ...(p.reason_code ? { reason_code: p.reason_code } : {}) }); continue; }
    if (p.status === 'covered') { out.push({ name, status: 'covered', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: p.reason, covered_by: p.covered_by }); continue; }
    if (p.status === 'pm-missing') {   // #248: the package manager is not on PATH; nothing was run
      out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: p.reason });
      installBroken = `did not run (${p.reason})`; continue;
    }
    if (p.status === 'root-install-broken') {   // the root's install covers this one and did not pass
      out.push({ name, status: 'skipped', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: p.reason });
      installBroken = 'skipped (the root install did not pass)'; continue;
    }
    if (p.needs_install && installBroken) { out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: `install ${installBroken}; ${name} not attempted` }); continue; }
    // #248: a step whose command runs a package manager not on PATH is not attempted (the shell
    // would answer 127, the instrument's gap read as the target's failure)
    const runner = String(p.command || '').split(/\s+/)[0];
    if (['npm', 'pnpm', 'yarn'].includes(runner) && !onPath(runner)) {
      out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: `${runner} is not on PATH, so ${name} was not attempted` });
      if (name === 'install') installBroken = `did not run (${runner} is not on PATH)`;
      continue;
    }
    const stepCwd = p.cwd || cwd;   // a workspace's install may run from the root (npm ci --workspace)
    let declaredEnv = {};
    const bound = !!(svc && svc.decl.steps.includes(name));
    if (bound) {
      // #256: a bound step runs only with its services, after the declared setup; else it reads
      // skipped with the reason — the measurement's gap, never charged to the target
      const names = svc.decl.services.map((x) => x.name).join(' and ');
      if (!svc.provided) { out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: `needs ${names}, which this measurement did not provide (${svc.reason})`, reason_code: 'service-not-provided' }); continue; }
      const setupBroken = runSetup(svc, cwd, timeoutSec, log);
      if (setupBroken) { out.push({ name, status: 'skipped', command: p.command, exit_code: null, duration_ms: 0, output_tail: '', reason: `the declared setup ${setupBroken}; ${name} not attempted` }); continue; }
      declaredEnv = svc.env;
    }
    log(`  → ${name}: ${p.command}${bound ? ` (with ${svc.decl.services.map((x) => x.name).join(', ')}, throwaway)` : ''}`);
    const row = runStep(name, p.command, stepCwd, timeoutSec, declaredEnv);
    if (p.declared_as) { row.declared_as = p.declared_as; row.dry_form = p.dry_form; }
    if (bound) row.services = svc.decl.services.map((x) => ({ name: x.name, image: x.image, throwaway: true }));
    out.push(row);
    log(`    ${row.status}${row.exit_code !== null ? ` (exit ${row.exit_code})` : ''} in ${row.duration_ms} ms`);
    if (name === 'install' && row.status !== 'passed') installBroken = row.status;
  }
  return svc ? STEPS.map((n) => out.find((r) => r.name === n)) : out;
}

// the declared setup, once, before the first bound step: each command its own row; the first
// that does not pass stops the rest (recorded skipped) and is returned, said for the bound steps
function runSetup(svc, cwd, timeoutSec, log) {
  if (svc.setupDone) return svc.setupBroken;
  svc.setupDone = true;
  for (const command of svc.decl.setup) {
    if (svc.setupBroken) { svc.setup.push({ command, status: 'skipped', exit_code: null, duration_ms: 0, output_tail: '', reason: `an earlier setup command ${svc.setupBrokenStatus}` }); continue; }
    log(`  → setup: ${command}`);
    const r = runStep('setup', command, cwd, timeoutSec, svc.env);
    const { name: _n, ...row } = r;
    svc.setup.push(row);
    log(`    ${row.status}${row.exit_code !== null ? ` (exit ${row.exit_code})` : ''} in ${row.duration_ms} ms`);
    if (row.status !== 'passed') { svc.setupBroken = `\`${command}\` ${row.status}${row.exit_code !== null ? ` (exit ${row.exit_code})` : ''}`; svc.setupBrokenStatus = row.status; }
  }
  return svc.setupBroken;
}

// ── one workspace's run: its own step plan, its own README, install possibly
//    rebased onto the root (see the module doc's WORKSPACES section) ───────────
// root: { pkg, steps, migrateOwner } — the root's manifest, its step rows (run first),
// and which package declares migrations. Absent (older callers), nothing is covered.
export function planWorkspace(rootToolchain, wsToolchain, wsPkg, wsRelPath, root = null) {
  // a workspace with no lockfile of its own is driven by the root's package manager —
  // never an npm command against a pnpm or yarn tree
  const tc = (wsToolchain.family === 'node' && !wsToolchain.lockfile && rootToolchain.lockfile)
    ? { ...wsToolchain, package_manager: rootToolchain.package_manager } : wsToolchain;
  const plan = planSteps(tc, wsPkg);
  if (rootToolchain.lockfile && plan.install.status === 'declared') {
    if (rootToolchain.package_manager === 'npm') {
      // the root's lockfile covers the whole tree: install this workspace from the root,
      // scoped to it, rather than re-deriving a package-manager guess in its own directory
      plan.install = { status: 'declared', command: `npm ci --workspace ${shellQuote(wsRelPath)}`, needs_install: false, cwd: 'ROOT' };
    } else {
      // pnpm / yarn: the root install already installed every workspace
      const ri = root && Array.isArray(root.steps) ? root.steps.find((x) => x.name === 'install') : null;
      if (ri && ri.status === 'passed') plan.install = { status: 'covered', reason: `the root's ${rootToolchain.package_manager} install installs every workspace`, covered_by: { path: '.', step: 'install', command: ri.command } };
      else plan.install = { status: 'root-install-broken', reason: `covered by the root's ${rootToolchain.package_manager} install, which ${ri ? ri.status : 'was not run'}; not attempted separately` };
    }
  }
  if (root) {
    for (const step of ['build', 'lint', 'typecheck', 'test']) {
      if (plan[step].status !== 'not-declared') continue;
      const by = rootCovers(root, step, rootToolchain, wsRelPath);
      if (by) plan[step] = { status: 'covered', reason: by.why, covered_by: { path: '.', step, command: by.command, via: by.via } };
    }
    if (plan.migrate.status === 'not-declared' && !declaresMigrate(wsPkg) && root.migrateOwner && root.migrateOwner.path !== wsRelPath) {
      plan.migrate = { status: 'covered', reason: `migrations belong to ${root.migrateOwner.path === '.' ? 'the root' : root.migrateOwner.path}, which declares "${root.migrateOwner.script}"`, covered_by: { path: root.migrateOwner.path, step: 'migrate', command: root.migrateOwner.script } };
    }
  }
  return plan;
}

// ── does a passing root step reach a workspace? Read from the command, never assumed ──
const RECURSE_RES = [
  /\bpnpm\b[^&|;]*\s(?:-r|--recursive)\b/,
  /\bnpm\b[^&|;]*\s(?:--workspaces|-ws)\b/,
  /\byarn\s+workspaces\s+(?:foreach|run)\b/,
  /\blerna\s+(?:run|exec)\b/,
  /\bturbo\s+(?:run\s+)?[\w:-]+/,
  /\bnx\s+(?:run-many|affected)\b/,
];
const LINT_AT_ROOT_RE = /\b(?:eslint|oxlint|biome\s+(?:check|lint|ci)|prettier\s+(?:--check|-c))\b[^&|;]*\s\.(?:\s|$)/;
const TEST_RUNNER_RE = /\b(vitest|jest|node\s+--test)\b(.*)$/;
// a test runner given no path argument discovers tests across the tree from the root;
// a token containing `/` names a location, and then it does not cover by discovery
const discoversTree = (cmd) => {
  const m = cmd.match(TEST_RUNNER_RE);
  if (!m) return false;
  const toks = m[2].trim().split(/\s+/).filter(Boolean).filter((t) => !['run', 'watch'].includes(t));
  return !toks.some((t) => !t.startsWith('-') && t.includes('/'));
};
const SCRIPT_REF_RE = /^(?:npm|pnpm|yarn)\s+(?:run\s+)?([\w:.-]+)\s*$/;
function rootCovers(root, step, rootToolchain, wsRelPath) {
  const st = Array.isArray(root.steps) ? root.steps.find((x) => x.name === step) : null;
  if (!st || st.status !== 'passed') return null;       // only a root step that ran and passed covers anything
  const scripts = (root.pkg && root.pkg.scripts) || {};
  const seen = new Set();
  const reach = (name, depth) => {
    if (depth > 3 || seen.has(name) || typeof scripts[name] !== 'string') return null;
    seen.add(name);
    for (const part of scripts[name].split(/&&|\|\||;/).map((x) => x.trim()).filter(Boolean)) {
      if (RECURSE_RES.some((re) => re.test(part))) return { via: 'recursive', part };
      if (step === 'lint' && LINT_AT_ROOT_RE.test(part)) return { via: 'lint-root', part };
      if (step === 'test' && discoversTree(part)) return { via: 'test-discovery', part };
      const ref = part.match(SCRIPT_REF_RE);
      if (ref && !['install', 'ci'].includes(ref[1])) { const r = reach(ref[1], depth + 1); if (r) return r; }
    }
    return null;
  };
  const r = reach(step, 0);
  if (!r) return null;
  const why = { recursive: 'runs in every workspace', 'lint-root': 'lints the whole tree from the root', 'test-discovery': 'discovers tests across the tree from the root' }[r.via];
  return { command: st.command, via: r.via, why: `the root's passing \`${st.command}\` (\`${r.part}\`) ${why}, ${wsRelPath} included` };
}
const MIGRATE_SCRIPT_RE = /prisma\s+migrate\s+deploy|knex\s+migrate:latest/;
function declaresMigrate(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  return MIGRATE_NAMES.find((n) => scripts[n] !== undefined) || Object.keys(scripts).find((n) => MIGRATE_SCRIPT_RE.test(String(scripts[n]))) || null;
}

function runWorkspace(wsRelPath, workDir, rootToolchain, timeoutSec, log = /** @type {(msg: string) => void} */ (() => {}), root = null) {
  const wsDir = join(workDir, wsRelPath);
  const { toolchain, pkg } = detectToolchain(wsDir);
  const plan = planWorkspace(rootToolchain, toolchain, pkg, wsRelPath, root);
  if (plan.install.cwd === 'ROOT') plan.install.cwd = workDir;   // resolve the sentinel to the real clone root
  const missing = packageManagerMissing(toolchain, plan);   // #248, a workspace's own install too
  if (missing) plan.install = { status: 'pm-missing', command: plan.install.command, reason: missing };
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
function parseReadmeClaims(text) {
  const claims = /** @type {any[]} */ ([]);
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
    if (p !== resolve(dir) && !p.startsWith(resolve(dir) + sep)) return false;   // never resolve outside the tree
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

// file: a README outside dir (the root's, replayed in the app) — its claims checked in dir
function replayReadme(dir, pkg, file = null) {
  const readme = file ? null : findReadme(dir);
  if (!readme && !file) return { readme: null, claims: [] };
  const claims = parseReadmeClaims(readFileSync(file || join(dir, readme), 'utf8'));
  for (const c of claims) c.status = claimPresent(c, dir, pkg) ? 'present' : 'missing';
  return { readme, claims };
}

// ── the run ──────────────────────────────────────────────────────────────────
const isUrl = (s) => /^(https?|ssh|git|file):\/\//.test(s) || /^[\w.-]+@[\w.-]+:/.test(s);
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: stepEnv(), maxBuffer: MAX_BUFFER });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}

// ── one project, measured: its plan, its README, its workspaces ─────────────
// `project` is map/projects.mjs's entry: `run` is the directory its steps run in, `workspaces`
// relative to it. The root's README is the front door for an application directory (#35), its
// commands replayed in the app (`cd <dir>`); a nested project's README is its own.
function measureProject(workDir, project, timeout, log, { readmeFromRoot, svc = null }) {
  const runDir = project.run === '.' ? workDir : join(workDir, project.run);
  const { toolchain, pkg } = detectToolchain(runDir);
  const plan = planSteps(toolchain, pkg);
  const missing = packageManagerMissing(toolchain, plan);
  if (missing) { plan.install = { status: 'pm-missing', command: plan.install.command, reason: missing }; log(`  → install: ${missing}`); }
  // #256: a migrate bound to declared services runs the real migrate script against them (an
  // empty database), dry form or not; without them, one with no dry form reads skipped, not
  // undeclared; one with a dry form runs it as before
  if (svc && svc.decl.steps.includes('migrate') && toolchain.family === 'node' && pkg) {
    const mig = declaresMigrate(pkg);
    const run = (n) => toolchain.package_manager === 'yarn' ? `yarn run ${n}` : `${toolchain.package_manager} run ${n}`;
    if (mig && (svc.provided || plan.migrate.status === 'not-declared')) plan.migrate = { status: 'declared', command: run(mig), needs_install: true, declared_as: mig, dry_form: null };
  }
  const steps = runSteps(plan, runDir, timeout, log, svc);
  const rootReadme = readmeFromRoot ? findReadme(workDir) : null;
  const { readme: ownReadme, claims } = rootReadme ? replayReadme(runDir, pkg, join(workDir, rootReadme)) : replayReadme(runDir, pkg);
  const prefix = project.run === '.' ? '' : `${project.run}/`;
  const readme = rootReadme || (ownReadme ? `${prefix}${ownReadme}` : ownReadme);
  const wsPaths = pkg ? project.workspaces : [];
  if (wsPaths.length) log(`→ workspaces: ${wsPaths.join(', ')}`);
  // the project's context for coverage: its manifest, its step rows (already run), and
  // which package owns migrations (the project, else the first workspace declaring one)
  let migrateOwner = null;
  const ownMig = declaresMigrate(pkg);
  if (ownMig) migrateOwner = { path: '.', script: ownMig };
  else for (const p of wsPaths) {
    const wm = declaresMigrate(detectToolchain(join(runDir, p)).pkg);
    if (wm) { migrateOwner = { path: p, script: wm }; break; }
  }
  const ctx = { pkg, steps, migrateOwner };
  const workspaces = wsPaths.map((p) => runWorkspace(p, runDir, toolchain, timeout, log, ctx));
  return { toolchain, steps, readme, readme_claims: claims, workspaces_from: wsPaths.length ? project.workspaces_from : null, workspaces };
}

// ── the package manager a plan installs with, on PATH (#248) ─────────────────
// A lockfile names npm, pnpm or yarn; a host without it would run the install, the shell would answer
// 127, and the target would read "install failed" for the instrument's own gap. Looked up on the
// PATH the steps run with (child-env.mjs), never executed: missing, the install is not attempted
// and reads skipped, which the requirements read as not measured.
function packageManagerMissing(toolchain, plan) {
  if (!plan.install || plan.install.status !== 'declared' || typeof plan.install.command !== 'string') return null;
  // the binary the install command runs (a workspace's may be the root's npm, run from the root)
  const pm = plan.install.command.split(/\s+/)[0];
  if (!['npm', 'pnpm', 'yarn'].includes(pm)) return null;
  if (onPath(pm)) return null;
  const why = pm === toolchain.package_manager && toolchain.lockfile ? `named by ${toolchain.lockfile}` : `the install command \`${plan.install.command}\` runs it`;
  const hint = toolchain.declared && toolchain.declared.packageManager ? '; `corepack enable` provides the version packageManager names' : '';
  return `${pm} (${why}) is not on PATH, so the install was not attempted${hint}`;
}
// an executable `name` in one of the absolute directories of the steps' PATH (a relative entry
// would resolve against the step's directory, which a lookup from here cannot vouch for)
function onPath(name) {
  const env = stepEnv();
  const win = process.platform === 'win32';
  const dirs = String(env.PATH || '').split(win ? ';' : ':').filter((d) => d && isAbsolute(d));
  const exts = win ? ['', ...String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())] : [''];
  return dirs.some((d) => exts.some((e) => {
    try { const st = statSync(join(d, name + e)); return st.isFile() && (win || (st.mode & 0o111) !== 0); } catch { return false; }
  }));
}

// ── a root step covered by its nested projects (#246) ───────────────────────
const PROJECT_COVERED_STEPS = ['build', 'lint', 'typecheck', 'test'];
function coverByProjects(st, nested, workDir) {
  if (st.status !== 'not-declared') return st;
  const stepOf = (pr) => pr.steps.find((x) => x.name === st.name);
  if (st.name === 'migrate') {
    // the package that declares a migrate script owns the migrations, a dry form or not (the
    // workspaces' rule); its own row says whether a clean checkout can run it
    const owner = nested.map((pr) => ({ pr, script: declaresMigrate(detectToolchain(join(workDir, pr.path)).pkg) })).find((o) => o.script);
    if (!owner) return st;
    return { ...st, status: 'covered', reason: `migrations belong to ${owner.pr.path}, which declares "${owner.script}"`, covered_by: { path: owner.pr.path, step: 'migrate', command: owner.script } };
  }
  if (!PROJECT_COVERED_STEPS.includes(st.name)) return st;
  const rows = nested.map((pr) => ({ pr, x: stepOf(pr) }));
  const declaring = rows.filter(({ x }) => x && x.status !== 'not-declared');
  if (!declaring.length) return st;   // no project declares it either: the root's gap stands
  if (rows.every(({ x }) => x && (x.status === 'passed' || x.status === 'covered'))) {
    const by = rows.map(({ pr, x }) => ({ path: pr.path, step: st.name, command: x.command || (x.covered_by && !Array.isArray(x.covered_by) ? x.covered_by.command : st.name) }));
    return { ...st, status: 'covered', reason: `the root declares no ${st.name}; each of its nested projects runs its own and it passes (${by.map((b) => b.path).join(', ')})`, covered_by: by.length === 1 ? by[0] : by };
  }
  // a project declares it but it did not pass everywhere (skipped, failed, or undeclared in a
  // sibling): each project's own row decides, and the root says only that it ran nothing of its own
  return { ...st, status: 'skipped', reason: `the root declares no ${st.name} of its own; its nested projects' own ${st.name} rows decide (${rows.map(({ pr, x }) => `${pr.path}: ${x ? x.status : 'not recorded'}`).join(', ')})` };
}

// services: the opt-in that starts a target's declared services (#256); runtime: the container
// runtime to start them with (default `docker` on the evaluator's PATH; a path, for a stub)
export function run({ target, timeout = 600, clone = true, app: declaredApp = null, services = false, runtime = 'docker', log = /** @type {(msg: string) => void} */ (() => {}) }) {
  const startedAt = new Date().toISOString();
  let workDir, scratch = null;
  const t = { path: isUrl(target) ? stripUserinfo(target) : resolve(target), head: null, cloned: false };   // a local root absolute, so ingest can place it against the run's target (#35)
  if (clone) {
    const src = isUrl(target) ? target : `file://${resolve(target)}`;
    if (!isUrl(target) && !existsSync(target)) throw new Error(`target does not exist: ${target}`);
    scratch = mkdtempSync(join(tmpdir(), 'assay-fresh-clone-'));
    workDir = join(scratch, 'checkout');
    log(`→ git clone --depth 1 ${stripUserinfo(src)}`);
    const c = git(['clone', '--depth', '1', '--quiet', src, workDir], scratch);
    if (!c.ok) { rmSync(scratch, { recursive: true, force: true }); throw new Error(`git clone failed: ${(c.err || c.out).split(src).join(stripUserinfo(src))}`); }
    t.cloned = true;
  } else {
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    workDir = resolve(target);
  }
  let svc = null, svcReport = null;
  try {
    const head = git(['rev-parse', 'HEAD'], workDir);
    t.head = head.ok ? head.out : null;
    ({ svc, svcReport } = prepareServices(workDir, { services, runtime, timeout, log }));
    // where the tree's projects are (map/projects.mjs, #246): the root, in its application
    // directory (#35) when it has one, then each nested project, measured on its own
    const { projects: located, setAside } = locateProjects(workDir, { app: declaredApp });
    const rootProject = located[0];
    const app = rootProject.run !== '.' ? { path: rootProject.run, from: rootProject.from } : null;
    if (app) log(`→ application directory: ${app.path} (${app.from === '--app' ? 'declared with --app' : 'the lone directory holding a package.json'})`);
    const root = measureProject(workDir, rootProject, timeout, log, { readmeFromRoot: !!app, svc });
    if (svc) { stopServices(svc.state, log); svcReport.setup = svc.setup; }
    const nested = located.slice(1).map((pr) => {
      log(`→ nested project: ${pr.path}`);
      const m = measureProject(workDir, pr, timeout, (msg) => log(`  [${pr.path}]${msg}`), { readmeFromRoot: false });
      return { path: pr.path, from: pr.from, toolchain: m.toolchain, steps: m.steps, readme: m.readme, readme_claims: m.readme_claims, ...(m.workspaces_from ? { workspaces_from: m.workspaces_from } : {}), workspaces: m.workspaces };
    });
    // a root step the root does not declare is covered by its nested projects when each of them
    // reaches it (#246): build, lint, typecheck and test when every project's own step passed or is
    // covered; migrate when a project declares it (migrations belong to the package declaring them)
    if (nested.length) root.steps = root.steps.map((st) => coverByProjects(st, nested, workDir));
    const bad = (e) => e.steps.some((s) => s.status === 'failed' || s.status === 'timed-out') || e.readme_claims.some((c) => c.status === 'missing')
      || (e.workspaces || []).some((w) => w.steps.some((s) => s.status === 'failed' || s.status === 'timed-out') || w.readme_claims.some((c) => c.status === 'missing'));
    const svcBad = !!(svcReport && (svcReport.refused || (svcReport.setup || []).some((x) => x.status === 'failed' || x.status === 'timed-out')));
    if (svcReport && svc) svcReport.containers = svc.state ? svc.state.containers.map(({ name, image, container, started, ready, removed }) => ({ name, image, container, started, ready, removed })) : [];
    return {
      tool: 'fresh-clone', version: VERSION, started_at: startedAt, finished_at: new Date().toISOString(),
      target: t, ...(app ? { app } : {}), toolchain: root.toolchain, timeout_seconds: timeout, steps: root.steps, readme: root.readme, readme_claims: root.readme_claims,
      ...(root.workspaces_from ? { workspaces_from: root.workspaces_from } : {}), workspaces: root.workspaces,
      ...(nested.length ? { projects: nested } : {}),
      ...(setAside.length ? { projects_set_aside: setAside } : {}),
      ...(svcReport ? { services: svcReport } : {}),
      exit: bad(root) || nested.some(bad) || svcBad ? 1 : 0,
    };
  } finally {
    // every container started is removed, whatever happened above (#256)
    if (svc) stopServices(svc.state, log);
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

// ── a target's declared services (#256, map/services.mjs) ────────────────────
// Read from the checkout's root. Refused: recorded, and the steps run as if nothing were
// declared. Declared: started only under the opt-in, with a runtime; otherwise the reason the
// bound steps give. Returns the runner's state (svc) and the report's `services` entry.
function prepareServices(workDir, { services, runtime, timeout, log }) {
  let decl;
  try { decl = readServices(workDir); }
  catch (e) {
    log(`→ services: ${e.message} — refused; the steps run as if nothing were declared`);
    return { svc: null, svcReport: { declared_in: SERVICES_FILE, refused: e.message } };
  }
  if (!decl) return { svc: null, svcReport: null };
  const svc = { decl, state: null, provided: false, reason: null, env: {}, setup: [], setupDone: false, setupBroken: null, setupBrokenStatus: null };
  const rtPath = services ? findRuntime(runtime) : null;
  if (!services) svc.reason = 'fresh-clone ran without --services, the opt-in that starts a target\'s declared services';
  else if (!rtPath) svc.reason = `no container runtime: ${runtime} is not on PATH`;
  else {
    log(`→ services: starting ${decl.services.map((s) => s.name).join(', ')} from ${SERVICES_FILE}, throwaway`);
    svc.state = startServices(decl, { runtime: rtPath, pullTimeout: timeout, log });
    if (svc.state.provided) { svc.provided = true; svc.env = resolveEnv(decl, svc.state); }
    else { svc.reason = svc.state.reason; stopServices(svc.state, log); }
  }
  if (!svc.provided) log(`→ services: not provided (${svc.reason}); ${decl.steps.join(' and ')} read skipped`);
  const svcReport = {
    declared_in: SERVICES_FILE, requested: !!services, provided: svc.provided, reason: svc.reason,
    steps: decl.steps, services: decl.services.map((s) => ({ name: s.name, image: s.image })), containers: [], setup: [],
  };
  return { svc, svcReport };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || args[i - 1] === '--no-clone' || args[i - 1] === '--services'));
  const out = opt('--out'), app = opt('--app');
  const timeout = opt('--timeout') ? Number(opt('--timeout')) : 600;
  if (!target || !out || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('usage: node assay.mjs fresh-clone <target-dir | git URL> --out <file.json> [--timeout <seconds per step, default 600>] [--no-clone] [--app <dir>] [--services]');
    process.exit(2);
  }
  try {
    const doc = run({ target, timeout, clone: !args.includes('--no-clone'), app, services: args.includes('--services'), log: (m) => console.error(m) });
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
