#!/usr/bin/env node
// dependency-scan.mjs — the DEPENDENCY-SCAN instrument: does every npm lockfile
// in the tree audit clean against the npm registry's advisory database?
// (yardstick/requirements.yaml d-dependencies-known-clean — "no known-critical
// dependency vulnerability is present".) Its rows come in through
// map/ingest.mjs (profile `dependency-scan`) and land on the shared
// code-security axis via adapters/dependency-scan.yaml.
//
// What it does, in order:
//   1. ENUMERATE every package-lock.json / npm-shrinkwrap.json in the tree
//      (node_modules/ and .git/ excluded), plus every pnpm-lock.yaml /
//      yarn.lock — recorded `not-supported`, never silently skipped.
//   2. AUDIT each npm lockfile with `npm audit --json` (no install; the
//      lockfile is read as-is, against the live registry). A directory that
//      is a workspace member whose effective root carries no lockfile of its
//      own makes npm audit fail ENOLOCK; that member's package.json + its own
//      lockfile are copied into a scratch dir and audited there instead
//      (`method: scratch-copy`, vs `in-place`).
//   3. RECORD one row per lockfile — path, method, npm's own exit code,
//      severity counts, dependencies audited — and one advisory row per
//      (advisory id, package): id (GHSA, else the npm source id), package,
//      installed version(s) read out of the lockfile itself, vulnerable
//      range, severity, whether npm reports a fix available, and the
//      advisory url.
//
// Fail loud, never empty: npm audit exits 1 when vulnerabilities exist and 0
// when none — both are successful AUDITS. Any other exit code, a report whose
// JSON does not carry the expected `vulnerabilities` + `metadata` shape (an
// npm error document, e.g. no registry reachable, looks exactly like this), a
// timeout, or a spawn failure makes that lockfile `status: failed`, never
// read as clean — a tool that errored must never read as "0 findings". A
// pnpm-lock.yaml / yarn.lock is `not-supported`, never clean. The document's
// own `exit` is 0 only when every lockfile in the tree audited with zero
// advisories; 1 when any advisory exists, any lockfile failed, or any
// lockfile is not-supported; a crash of the runner itself exits 2 (uncaught
// at the CLI boundary), so ingest.mjs (success set [0, 1]) halts on it.
//
// Network: npm audit needs the registry; a lockfile whose audit cannot reach
// it comes back as an npm error document (see above) and is recorded failed,
// with the stderr tail, never clean.
//
// Usage:
//   node assay.mjs dependency-scan <target-dir> --out <file.json> [--timeout <seconds per lockfile, default 300>]
// Zero dependencies (node: modules only).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute, dirname, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from './doctrine.mjs';

export const VERSION = '0.1.0';
export const LOCK_STATUS = ['audited', 'failed', 'not-supported'];
export const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];
const MAX_BUFFER = 64 * 1024 * 1024;
const TAIL_LINES = 40;
const SKIP_DIRS = new Set(['node_modules', '.git']);

const tail = (s) => String(s || '').split('\n').slice(-TAIL_LINES).join('\n');
function scrubbedEnv() {
  const env = { ...process.env };
  env.CI = env.CI || '1';
  env.npm_config_fund = 'false'; env.npm_config_update_notifier = 'false';
  return env;
}

// ── enumerate lockfiles ──────────────────────────────────────────────────────
export function findLockfiles(root) {
  const npm = [], other = [];
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name < b.name ? -1 : 1)) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); continue; }
      if (e.name === 'package-lock.json' || e.name === 'npm-shrinkwrap.json') npm.push(join(dir, e.name));
      else if (e.name === 'pnpm-lock.yaml') other.push({ path: join(dir, e.name), manager: 'pnpm' });
      else if (e.name === 'yarn.lock') other.push({ path: join(dir, e.name), manager: 'yarn' });
    }
  })(root);
  return { npm: npm.sort(), other: other.sort((a, b) => a.path < b.path ? -1 : 1) };
}

// ── read installed version(s) of a package straight out of the lockfile itself ─
// (npm audit's report gives node_modules PATHS, never versions; the lockfile is
// the one artifact both formats — lockfileVersion 1 `dependencies`, 2/3 `packages`
// — already carry the answer, so nothing here touches the network.)
export function installedVersions(lockJson, pkgName) {
  const versions = new Set();
  if (lockJson && lockJson.packages && typeof lockJson.packages === 'object' && !Array.isArray(lockJson.packages)) {
    for (const [p, info] of Object.entries(lockJson.packages)) {
      if (!info || typeof info !== 'object') continue;
      const base = p === '' ? null : p.split('node_modules/').pop();
      if (base === pkgName && info.version) versions.add(String(info.version));
    }
  }
  if (!versions.size && lockJson && lockJson.dependencies && typeof lockJson.dependencies === 'object') {
    (function walk(deps) {
      for (const [name, info] of Object.entries(deps)) {
        if (!info || typeof info !== 'object') continue;
        if (name === pkgName && info.version) versions.add(String(info.version));
        if (info.dependencies) walk(info.dependencies);
      }
    })(lockJson.dependencies);
  }
  return [...versions];
}

// ── one advisory row per (id, package), from npm's audit-report-v2 shape ─────
// A package's `via` array carries advisory OBJECTS where the advisory applies
// directly to that package, and bare STRINGS (other package names) where it is
// only reachable transitively — those name the package that carries the real
// object elsewhere in the same report, so they are skipped here (never turned
// into a phantom advisory on the dependent).
export function advisoriesFor(vulnerabilities, lockJson) {
  const rows = []; const seen = new Set();
  for (const [pkg, v] of Object.entries(vulnerabilities || {})) {
    if (!v || !Array.isArray(v.via)) continue;
    for (const via of v.via) {
      if (typeof via !== 'object' || !via) continue;                 // a string entry: transitive pointer only
      const name = via.name || pkg;
      const ghsa = typeof via.url === 'string' && via.url.match(/GHSA-[a-zA-Z0-9-]+/);
      const id = ghsa ? ghsa[0] : (via.source !== undefined ? `npm-${via.source}` : null);
      if (!id) continue;
      const key = `${id}@${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const installed = installedVersions(lockJson, name);
      rows.push({
        id, package: name,
        installed: installed.length ? installed.join(', ') : null,
        range: via.range || v.range || null,
        severity: via.severity || v.severity,
        fix_available: !!v.fixAvailable,
        url: via.url || null,
        title: via.title || null,
      });
    }
  }
  return rows;
}

// ── running one npm audit, with the ENOLOCK scratch-copy fallback ────────────
function runAudit(cwd, timeoutSec) {
  return spawnSync('npm', ['audit', '--json'], {
    cwd, encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL',
    maxBuffer: MAX_BUFFER, env: scrubbedEnv(),
  });
}
function parseAudit(stdout) { try { return JSON.parse(stdout); } catch { return null; } }
const isValidReport = (doc) => !!(doc && typeof doc === 'object' && doc.vulnerabilities && typeof doc.vulnerabilities === 'object' && doc.metadata && typeof doc.metadata === 'object' && doc.metadata.vulnerabilities);
function failureReason(r, doc) {
  if (r.error && r.error.code === 'ETIMEDOUT') return 'npm audit timed out';
  if (r.error) return `could not spawn npm: ${r.error.message}`;
  if (r.signal) return `npm audit was killed by ${r.signal}`;
  if (doc && doc.error) return `npm audit error ${doc.error.code || ''}: ${oneLine(doc.error.summary || doc.error.detail || 'no summary')}`.trim();
  if (!doc) return 'npm audit did not produce parseable JSON (registry unreachable, or npm printed a non-JSON error)';
  return `npm audit exited ${r.status} with an unrecognized report shape`;
}
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function auditLockfile(lockPath, root, timeoutSec, log) {
  const relPath = relative(root, lockPath).split('\\').join('/');
  const dir = dirname(lockPath);
  let r = runAudit(dir, timeoutSec);
  let doc = parseAudit(r.stdout);
  let method = 'in-place';
  const enolock = (doc && doc.error && doc.error.code === 'ENOLOCK') ||
    (!doc && /ENOLOCK/.test(String(r.stdout || '') + String(r.stderr || '')));
  if (enolock) {
    method = 'scratch-copy';
    const scratch = mkdtempSync(join(tmpdir(), 'assay-dependency-scan-'));
    try {
      const pkgJson = join(dir, 'package.json');
      if (existsSync(pkgJson)) copyFileSync(pkgJson, join(scratch, 'package.json'));
      copyFileSync(lockPath, join(scratch, basename(lockPath)));
      r = runAudit(scratch, timeoutSec);
      doc = parseAudit(r.stdout);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  const ok = (r.status === 0 || r.status === 1) && isValidReport(doc);
  log(`  → npm audit ${relPath} (${method}): ${ok ? `exit ${r.status}` : 'failed'}`);
  if (!ok) {
    return {
      path: relPath, status: 'failed', method, npm_exit_code: r.status ?? null,
      reason: failureReason(r, doc), stderr_tail: tail(r.stderr),
    };
  }
  let lockJson = null;
  try { lockJson = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { lockJson = null; }
  const c = doc.metadata.vulnerabilities;
  return {
    path: relPath, status: 'audited', method, npm_exit_code: r.status,
    counts: { critical: c.critical || 0, high: c.high || 0, moderate: c.moderate || 0, low: c.low || 0, info: c.info || 0 },
    dependencies_audited: (doc.metadata.dependencies && doc.metadata.dependencies.total) ?? null,
    advisories: advisoriesFor(doc.vulnerabilities, lockJson),
  };
}

// ── the run ──────────────────────────────────────────────────────────────────
export function run({ target, timeout = 300, log = () => {} }) {
  const startedAt = new Date().toISOString();
  if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
  const root = resolve(target);
  const { npm, other } = findLockfiles(root);
  const lockfiles = [];
  for (const lp of npm) lockfiles.push(auditLockfile(lp, root, timeout, log));
  for (const o of other) {
    const relPath = relative(root, o.path).split('\\').join('/');
    log(`  → ${relPath}: not-supported (${o.manager})`);
    lockfiles.push({ path: relPath, status: 'not-supported', manager: o.manager,
      reason: `audit with ${o.manager === 'pnpm' ? 'pnpm audit' : 'yarn npm audit'} instead` });
  }
  lockfiles.sort((a, b) => a.path < b.path ? -1 : 1);
  const anyAdvisory = lockfiles.some((l) => l.status === 'audited' && l.advisories.length);
  const anyFailed = lockfiles.some((l) => l.status === 'failed');
  const anyUnsupported = lockfiles.some((l) => l.status === 'not-supported');
  return {
    tool: 'dependency-scan', version: VERSION, started_at: startedAt, finished_at: new Date().toISOString(),
    target: { path: target }, timeout_seconds: timeout, lockfiles,
    exit: (anyAdvisory || anyFailed || anyUnsupported) ? 1 : 0,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  const out = opt('--out');
  const timeout = opt('--timeout') ? Number(opt('--timeout')) : 300;
  if (!target || !out || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('usage: node assay.mjs dependency-scan <target-dir> --out <file.json> [--timeout <seconds per lockfile, default 300>]');
    process.exit(2);
  }
  try {
    const doc = run({ target, timeout, log: (m) => console.error(m) });
    writeFileSync(isAbsolute(out) ? out : resolve(out), JSON.stringify(doc, null, 2) + '\n');
    const audited = doc.lockfiles.filter((l) => l.status === 'audited');
    const advisories = audited.reduce((n, l) => n + l.advisories.length, 0);
    const failed = doc.lockfiles.filter((l) => l.status === 'failed').length;
    const unsupported = doc.lockfiles.filter((l) => l.status === 'not-supported').length;
    console.error(`${doc.exit === 0 ? '✓' : '✗'} dependency-scan: ${audited.length} lockfile(s) audited (${advisories} advisor${advisories === 1 ? 'y' : 'ies'}) · ${failed} failed · ${unsupported} not supported → ${out}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ dependency-scan crashed: ${e.message}`);
    process.exit(2);
  }
}
