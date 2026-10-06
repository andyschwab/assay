#!/usr/bin/env node
// structure-scan.mjs — the STRUCTURE-SCAN instrument: how is the code itself
// built? Duplicated blocks, unused files / exports / dependencies, stale
// artifacts, and how often each file changes. Its rows come in through
// map/ingest.mjs (profile `structure-scan`) and land on the shared
// code-maintainability axis via adapters/structure-scan.yaml
// (map/scanners/CONTRACT.md §3e).
//
// What it does, in order:
//   1. INSTALL the two tools it drives from the npm registry, at the pinned
//      versions in TOOLS, into a private scratch directory (`npm install
//      --prefix <scratch> --ignore-scripts`): jscpd (duplication) and knip
//      (unused code). Neither is ever a dependency of this repository. The
//      registry is the same reach fresh-clone's install already needs (§3a,
//      "offline"); npm absent from PATH, or an install that fails, reads the tool
//      `skipped` with the reason — never clean.
//   2. RUN jscpd over the checkout's source (its JSON reporter, scoped by
//      --format to the code languages in JSCPD_FORMATS and by --ignore to
//      JSCPD_IGNORE: lockfiles, generated snapshots, build output, vendored
//      code; it only reads files), recording its totals (lines, duplicated
//      lines, percentage, source files) as facts, and knip in it (its JSON
//      reporter). knip imports the target's own tool configuration files
//      (vite.config.*, eslint.config.*, …) to find entry points, which is
//      executing the target's code: with `noExec` (`assay start` without
//      --allow-exec, the routine's gate job) it is `skipped` with that reason.
//      Those configs import the target's dependencies: with no node_modules at
//      the root, a lockfile's package manager installs them into a scratch copy
//      first (knipDeps, #118), or knip reads `skipped` with why it could not.
//      A repository with no package.json has nothing knip can read:
//      `not-applicable`, never clean. A tool that exits outside its success set
//      (jscpd: 0 — no --threshold or --exit-code is passed, so findings never
//      change its exit; knip: 0 clean, 1 issues) or whose report does not parse
//      reads `failed` with its exit — a crashed tool never reads as 0 findings.
//   3. READ the tree itself: every tracked file (`git ls-files`, else a walk
//      skipping node_modules/ and .git/) whose name says it is abandoned —
//      `old` as the last token before the extension (`x_old.ts`, `x-old.ts`,
//      `x.old.js`, `x.old`), `*.bak`, `*.orig`, a `copy` suffix (`x copy.js`,
//      `x-copy.js`, `Copy of x`), and a `*-v1*` beside a `*-v2*` (every lower
//      version of a name a higher one exists beside). A file under a
//      `migrations/` directory is never stale: its name is history by design.
//   4. COUNT churn: commits touching each file in the last 90 days (`git log
//      --since=90.days.ago --format= --name-only --relative`). A shallow
//      checkout, or no git history at all, records `history: shallow | none`
//      instead, so a view never guesses a count that was not read.
//
// The document keeps each tool's own report (less any code text: jscpd's
// `fragment` is dropped) under `raw`, and the locations and counts read out of
// them under `duplicates`, `unused` and `stale`; rows are built from those only.
//
// Exit: 0 when every tool ran (or is not-applicable) and nothing was found; 1
// when anything was found or any tool did not run (skipped or failed); a crash
// of the runner itself exits 2 (uncaught at the CLI boundary), so ingest.mjs
// (success set [0, 1]) halts on it.
//
// Usage:
//   node assay.mjs structure-scan <target-dir> --out <file.json> [--timeout <seconds per tool, default 300>] [--no-exec]
// Zero dependencies of its own (node: modules only); the tools are fetched per run.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute, relative, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';
import { childEnv, proxyDropNote } from './child-env.mjs';
import { detectToolchain } from './fresh-clone.mjs';

export const VERSION = '0.1.0';
// the pinned tool versions this instrument installs, and records, per run
export const TOOLS = { jscpd: '5.4.0', knip: '6.39.0' };
export const TOOL_STATUS = ['ran', 'skipped', 'failed', 'not-applicable'];
// knip's issue types that say "unused"; unlisted / unresolved / binaries are missing things, not unused ones
export const UNUSED_KINDS = ['files', 'dependencies', 'devDependencies', 'optionalPeerDependencies', 'exports', 'types', 'enumMembers', 'namespaceMembers', 'classMembers'];
export const HISTORY = ['full', 'shallow', 'none'];
const MAX_BUFFER = 256 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git']);
// jscpd reads source code only (#117): a clone pair in a lockfile, a data file, a prose page
// or generated output is not the maintainability claim a duplicate row makes. Its own format
// names (`jscpd --list`); test and fixture directories stay in scope (TEST_PATH flags them).
const JSCPD_FORMATS = ['javascript', 'typescript', 'jsx', 'tsx', 'python', 'go', 'ruby', 'java', 'kotlin', 'rust', 'php', 'csharp', 'swift', 'css', 'scss', 'sql', 'bash', 'vue', 'svelte'];
const JSCPD_IGNORE = ['**/node_modules/**', '**/.git/**', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock', '**/migrations/meta/**', '**/*.min.*', '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**', '**/vendor/**', '**/__snapshots__/**'];
// a path under a test or fixture directory, or a *.test.* / *.spec.* file
export const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|e2e|fixtures|__fixtures__|__mocks__)\/|\.(test|spec)\.[^/]+$/i;
const CHURN_DAYS = 90;
const NO_EXEC_REASON = "knip not run: it imports the target's own tool configuration files (vite.config.*, eslint.config.*, …) to find entry points, which runs the target's code; re-run with --allow-exec in a disposable container or VM";

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const lastLine = (s) => oneLine(String(s || '').trim().split('\n').filter(Boolean).pop() || '').slice(0, 240);
const toolEnv = () => childEnv({ npm_config_fund: 'false', npm_config_audit: 'false', npm_config_update_notifier: 'false' });
const posix = (p) => p.split('\\').join('/');

// ── install the pinned tools into a scratch prefix ──────────────────────────
function install(names, prefix, timeoutSec) {
  const specs = names.map((n) => `${n}@${TOOLS[n]}`);
  const r = spawnSync('npm', ['install', '--prefix', prefix, '--no-save', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', ...specs], {
    encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: toolEnv(),
  });
  if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT') return { ok: false, reason: `npm is not on PATH, so ${specs.join(' and ')} could not be installed from the npm registry` };
  if (r.error) return { ok: false, reason: `npm install ${specs.join(' ')} did not complete: ${oneLine(r.error.message)}` };
  if (r.status !== 0) return { ok: false, reason: `npm could not install ${specs.join(' ')} from the registry (exit ${r.status}): ${lastLine(r.stderr) || 'no output'}` };
  return { ok: true };
}
// the installed package's own bin, run with this node (never a shebang lookup on PATH)
function binOf(prefix, name) {
  const dir = join(prefix, 'node_modules', name);
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; }
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin[name];
  return bin ? { file: join(dir, bin), version: String(pkg.version || '') } : null;
}
function runTool(bin, args, cwd, timeoutSec) {
  return spawnSync(process.execPath, [bin.file, ...args], { cwd, encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: toolEnv() });
}
function failure(name, r) {
  if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ETIMEDOUT') return `${name} timed out`;
  if (r.error) return `could not spawn ${name}: ${oneLine(r.error.message)}`;
  if (r.signal) return `${name} was killed by ${r.signal}`;
  return `${name} exited ${r.status}: ${lastLine(r.stderr) || lastLine(r.stdout) || 'no output'}`;
}

// ── jscpd: one entry per clone pair, locations and counts only ──────────────
function runJscpd(bin, root, scratch, timeoutSec) {
  const out = join(scratch, 'jscpd-out');
  const r = runTool(bin, ['--reporters', 'json', '--output', out, '--format', JSCPD_FORMATS.join(','), '--ignore', JSCPD_IGNORE.join(','), '.'], root, timeoutSec);
  if (r.status !== 0 || r.error || r.signal) return { status: 'failed', reason: failure('jscpd', r), exit_code: r.status ?? null };
  let rep;
  try { rep = JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8')); } catch { rep = null; }
  if (!rep || !Array.isArray(rep.duplicates)) return { status: 'failed', reason: 'jscpd exited 0 but wrote no readable jscpd-report.json with a duplicates list', exit_code: r.status };
  const tot = rep.statistics && rep.statistics.total;
  const num = (k) => (tot && typeof tot[k] === 'number' && Number.isFinite(tot[k]) ? tot[k] : null);
  if ([num('lines'), num('duplicatedLines'), num('percentage'), num('sources')].includes(null)) return { status: 'failed', reason: 'jscpd exited 0 but its report carries no statistics.total (lines, duplicatedLines, percentage, sources)', exit_code: r.status };
  const statistics = { lines: num('lines'), duplicated_lines: num('duplicatedLines'), percentage: Math.round(num('percentage') * 100) / 100, sources: num('sources') };
  const loc = (f) => (f && typeof f.name === 'string' && Number.isInteger(f.start)) ? { file: posix(f.name), start: f.start, end: Number.isInteger(f.end) ? f.end : f.start } : null;
  const duplicates = [];
  for (const d of rep.duplicates) {
    const a = loc(d && d.firstFile), b = loc(d && d.secondFile);
    if (!a || !b) return { status: 'failed', reason: 'jscpd reported a duplicate without both locations (truncated report?)', exit_code: r.status };
    duplicates.push({ a, b, lines: Number.isInteger(d.lines) ? d.lines : null, tokens: Number.isInteger(d.tokens) ? d.tokens : null });
  }
  for (const d of rep.duplicates) delete d.fragment;   // never carry the duplicated code itself
  return { status: 'ran', exit_code: r.status, duplicates, statistics, raw: rep };
}

// ── knip's configuration: the file that names the target's entry points, or null ─
// Without one knip cannot see a dispatch by path (a command table of module paths), so
// its unused files, exports, types and members are not evidence there (#121); the run
// records which file it found so ingest can say so on each such row. The names knip reads.
const KNIP_CONFIG_FILES = ['knip.json', 'knip.jsonc', '.knip.json', '.knip.jsonc', 'knip.ts', 'knip.js', 'knip.mts', 'knip.cts', 'knip.mjs', 'knip.cjs', 'knip.config.ts', 'knip.config.js', 'knip.config.mts', 'knip.config.cts', 'knip.config.mjs', 'knip.config.cjs'];
export function knipConfig(dir) {
  const file = KNIP_CONFIG_FILES.find((f) => existsSync(join(dir, f)));
  if (file) return file;
  try { const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); if (pkg && typeof pkg === 'object' && pkg.knip !== undefined) return 'package.json'; } catch { /* no readable manifest: no configuration in it */ }
  return null;
}

// ── knip's dependencies: the target's own, installed before knip reads it (#118) ──
// knip loads the target's tool configuration files, which import the target's
// dependencies, so it needs them installed. node_modules at the root: knip runs in
// place. None, with dependencies declared and a lockfile naming the package manager:
// they install (frozen, scripts ignored) into a scratch copy of the tree, never into
// the target, and knip runs there; that package manager absent or its install failing
// reads knip skipped with the reason. Otherwise (no lockfile, or nothing declared) knip
// runs in place, and a config it cannot load for a missing module reads skipped
// (knipVerdict) rather than failed.
const NOT_INSTALLED = "the target's dependencies are not installed (no node_modules at the root)";
const LOCK_INSTALL = { npm: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], pnpm: ['install', '--frozen-lockfile', '--ignore-scripts'], yarn: ['install', '--frozen-lockfile', '--ignore-scripts'] };
// the first ERROR lines knip printed: they say what it could not load; its last line only says "Please fix"
const knipErrors = (s) => String(s || '').split('\n').map(oneLine).filter((l) => /^ERROR:/.test(l)).slice(0, 3).join(' | ').slice(0, 600);
const errLines = (s) => String(s || '').split('\n').map(oneLine).filter((l) => /\bERR/.test(l)).slice(0, 3).join(' | ').slice(0, 600);
function knipDeps(root, scratch, timeoutSec) {
  if (existsSync(join(root, 'node_modules'))) return { cwd: root, installed: true };
  const tc = /** @type {Record<string, any>} */ (detectToolchain(root).toolchain || {});
  if (!tc.has_dependencies || !tc.lockfile || !LOCK_INSTALL[tc.package_manager]) return { cwd: root, installed: !tc.has_dependencies };
  const pm = tc.package_manager, args = LOCK_INSTALL[pm], cmd = `${pm} ${args.join(' ')}`;
  const copy = join(scratch, 'knip-target');
  const lead = `${NOT_INSTALLED}; knip loads the target's tool configuration files, which import them`;
  try { cpSync(root, copy, { recursive: true, filter: (src) => !SKIP_DIRS.has(basename(src)) }); }
  catch (e) { return { skip: `${lead}, and the tree could not be copied to install them into scratch: ${oneLine(e.message)}` }; }
  const r = spawnSync(pm, args, { cwd: copy, encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: toolEnv() });
  if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT') return { skip: `${lead}, and ${pm} (named by ${tc.lockfile}) is not on PATH to install them` };
  if (r.error || r.signal || r.status !== 0) return { skip: `${lead}, and \`${cmd}\` in a scratch copy did not complete (${r.error ? oneLine(r.error.message) : r.signal ? `killed by ${r.signal}` : `exit ${r.status}`}): ${errLines(r.stderr) || lastLine(r.stderr) || lastLine(r.stdout) || 'no output'}` };
  return { cwd: copy, installed: true, note: `installed the target's dependencies with \`${cmd}\` into a scratch copy` };
}
// a knip that could not load a config for a module that was never installed did not
// measure the tree (skipped, the module named); any other exit outside 0/1 is a crash
function knipVerdict(r, installed) {
  const errors = knipErrors(r.stderr);
  if (!installed && !r.error && !r.signal && /Cannot find (module|package)/.test(errors)) return { status: 'skipped', reason: `${NOT_INSTALLED}: ${errors}`, exit_code: r.status };
  const why = r.error || r.signal || !errors ? failure('knip', r) : `knip exited ${r.status}: ${errors}`;
  return { status: 'failed', reason: why, exit_code: r.status ?? null };
}

// ── knip: one entry per unused item, file:line where knip gives one ─────────
function runKnip(bin, root, scratch, timeoutSec) {
  const deps = knipDeps(root, scratch, timeoutSec);
  if (deps.skip) return { status: 'skipped', reason: deps.skip, exit_code: null };
  const r = runTool(bin, ['--reporter', 'json', '--no-progress'], deps.cwd, timeoutSec);
  if (r.error || r.signal || (r.status !== 0 && r.status !== 1)) { const v = knipVerdict(r, deps.installed); return { status: v.status, reason: v.reason, exit_code: v.exit_code }; }
  let rep;
  try { rep = JSON.parse(r.stdout); } catch { rep = null; }
  if (!rep || !Array.isArray(rep.issues)) return { status: 'failed', reason: `knip exited ${r.status} but printed no JSON report with an issues list`, exit_code: r.status };
  const unused = [];
  for (const iss of rep.issues) {
    if (!iss || typeof iss.file !== 'string') return { status: 'failed', reason: 'knip reported an issue without its file (truncated report?)', exit_code: r.status };
    for (const kind of UNUSED_KINDS) {
      const list = Array.isArray(iss[kind]) ? iss[kind] : [];
      for (const item of list) {
        if (!item || typeof item.name !== 'string') continue;
        unused.push({ kind, file: posix(iss.file), line: Number.isInteger(item.line) ? item.line : 1, name: item.name });
      }
    }
  }
  return { status: 'ran', exit_code: r.status, unused, raw: rep, note: deps.note };
}

// ── the tree: tracked files, stale names ─────────────────────────────────────
function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER, env: toolEnv() });
  return (!r.error && r.status === 0) ? String(r.stdout) : null;
}
function listFiles(root) {
  const out = git(root, ['ls-files', '-z']);
  if (out !== null) return out.split('\0').filter(Boolean).map(posix).sort();
  const files = [];
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); continue; }
      if (e.isFile()) files.push(posix(relative(root, join(dir, e.name))));
    }
  })(root);
  return files.sort();
}
/** @type {Array<[string, RegExp]>} */
const STALE_NAME = [
  // `old` only as the last token before the extension (`x_old.ts`, `x-old.ts`,
  // `x.old.js`, `x.old`), never a word inside a name (`retire_old_roles.sql`)
  ['old', /[._-]old(\.[^.]+)?$/i],
  ['.bak', /\.bak$/i],
  ['.orig', /\.orig$/i],
  ['copy', /[ _-]copy( \d+)?(\.[^.]+)?$|^copy of /i],
];
// a migration's name is history by design: never a stale artifact, whatever it says
const MIGRATION_PATH = /(^|\/)migrations\//i;
function staleArtifacts(all) {
  const files = all.filter((f) => !MIGRATION_PATH.test(f));
  const out = [];
  for (const f of files) {
    const hit = STALE_NAME.find(([, re]) => re.test(basename(f)));
    if (hit) out.push({ file: f, pattern: hit[0] });
  }
  // a lower -vN beside a higher one of the same name, in the same directory
  const groups = new Map();
  for (const f of files) {
    const m = basename(f).match(/^(.*)-v(\d+)(.*)$/i);
    if (!m) continue;
    const key = `${dirname(f)}\0${m[1].toLowerCase()}\0${m[3].toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ file: f, v: Number(m[2]) });
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const top = list.reduce((a, b) => (b.v > a.v ? b : a));
    for (const x of list) if (x.v < top.v && !out.some((o) => o.file === x.file)) out.push({ file: x.file, pattern: '-vN', newer: top.file });
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : 1));
}

// ── churn: commits per file over the last 90 days, or the fact there is no history ─
function churn(root) {
  if (git(root, ['rev-parse', '--git-dir']) === null) return { history: 'none', counts: {} };
  if (String(git(root, ['rev-parse', '--is-shallow-repository']) || '').trim() === 'true') return { history: 'shallow', counts: {} };
  const out = git(root, ['log', `--since=${CHURN_DAYS}.days.ago`, '--format=', '--name-only', '--relative', '--', '.']);
  if (out === null) return { history: 'none', counts: {} };
  const counts = {};
  for (const l of out.split('\n').map((x) => x.trim()).filter(Boolean)) counts[posix(l)] = (counts[posix(l)] || 0) + 1;
  return { history: 'full', counts };
}

// ── the run ──────────────────────────────────────────────────────────────────
export function run({ target, timeout = 300, noExec = false, log = /** @type {(msg: string) => void} */ (() => {}) }) {
  const startedAt = new Date().toISOString();
  if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
  const root = resolve(target);
  const tools = /** @type {Record<string, any>} */ ({});
  const raw = /** @type {Record<string, any>} */ ({});
  let duplicates = [], unused = [];

  const hasManifest = existsSync(join(root, 'package.json'));
  if (!hasManifest) tools.knip = { status: 'not-applicable', reason: 'no package.json at the root: knip has no project to read' };
  else if (noExec) tools.knip = { status: 'skipped', reason: NO_EXEC_REASON };
  const want = ['jscpd', 'knip'].filter((t) => !tools[t]);

  const scratch = mkdtempSync(join(tmpdir(), 'assay-structure-scan-'));
  try {
    const inst = install(want, scratch, timeout);
    log(`  → npm install ${want.map((t) => `${t}@${TOOLS[t]}`).join(' ')}: ${inst.ok ? 'installed' : inst.reason}`);
    for (const t of want) {
      if (!inst.ok) { tools[t] = { status: 'skipped', reason: inst.reason }; continue; }
      const bin = binOf(scratch, t);
      if (!bin) { tools[t] = { status: 'skipped', reason: `npm reported ${t}@${TOOLS[t]} installed, but its package carries no ${t} bin` }; continue; }
      const res = t === 'jscpd' ? runJscpd(bin, root, scratch, timeout) : runKnip(bin, root, scratch, timeout);
      tools[t] = { status: res.status, version: bin.version, exit_code: res.exit_code, ...(res.reason ? { reason: res.reason } : {}), ...(res.statistics ? { statistics: res.statistics } : {}), ...(res.note ? { note: res.note } : {}) };
      if (res.status === 'ran') {
        raw[t] = res.raw;
        if (t === 'jscpd') duplicates = res.duplicates; else unused = res.unused;
      }
      log(`  → ${t} ${bin.version}: ${res.status}${res.reason ? ` (${res.reason})` : ''}`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  if (tools.knip.status === 'ran') tools.knip.config = knipConfig(root);
  const envNote = proxyDropNote();
  if (envNote) for (const t of Object.values(tools)) t.env_note = envNote;

  const { history, counts } = churn(root);
  const stale = staleArtifacts(listFiles(root));
  log(`  → tree: ${stale.length} stale artifact(s); history ${history}`);

  const found = duplicates.length + unused.length + stale.length;
  const notRun = Object.values(tools).some((t) => t.status === 'skipped' || t.status === 'failed');
  return {
    tool: 'structure-scan', version: VERSION, started_at: startedAt, finished_at: new Date().toISOString(),
    target: { path: target }, timeout_seconds: timeout, churn_days: CHURN_DAYS, history,
    tools, duplicates, unused, stale, churn: counts, raw,
    exit: (found || notRun) ? 1 : 0,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--out', '--timeout'].includes(args[i - 1])));
  const out = opt('--out');
  const timeout = opt('--timeout') ? Number(opt('--timeout')) : 300;
  if (!target || !out || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('usage: node assay.mjs structure-scan <target-dir> --out <file.json> [--timeout <seconds per tool, default 300>] [--no-exec]');
    process.exit(2);
  }
  try {
    const doc = run({ target, timeout, noExec: args.includes('--no-exec'), log: (m) => console.error(m) });
    writeFileSync(isAbsolute(out) ? out : resolve(out), JSON.stringify(doc, null, 2) + '\n');
    const t = Object.entries(doc.tools).map(([k, v]) => `${k} ${v.status}`).join(' · ');
    console.error(`${doc.exit === 0 ? '✓' : '✗'} structure-scan: ${doc.duplicates.length} duplicate(s) · ${doc.unused.length} unused · ${doc.stale.length} stale · ${t} · history ${doc.history} → ${out}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ structure-scan crashed: ${e.message}`);
    process.exit(2);
  }
}
