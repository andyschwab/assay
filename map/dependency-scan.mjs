#!/usr/bin/env node
// dependency-scan.mjs — the DEPENDENCY-SCAN instrument: does every lockfile in
// the tree (npm, pnpm, yarn) audit clean against the registry's advisory database?
// (yardstick/requirements.yaml d-dependencies-known-clean — "no known-critical
// dependency vulnerability is present".) Its rows come in through
// map/ingest.mjs (profile `dependency-scan`) and land on the shared
// code-security axis via adapters/dependency-scan.yaml.
//
// What it does, in order:
//   1. ENUMERATE every package-lock.json / npm-shrinkwrap.json, pnpm-lock.yaml
//      and yarn.lock in the tree (node_modules/ and .git/ excluded).
//   1a. AUDIT each pnpm-lock.yaml with `pnpm audit --json` and each yarn
//      classic yarn.lock with `yarn audit --json`, both read from the lockfile
//      alone (no install). Both report npm's v6 advisory objects, recorded in
//      the same rows as the npm path. When the package manager is not on the
//      runner (or the lockfile is yarn berry, whose `yarn npm audit` this
//      instrument does not drive yet), the lockfile is `not-run` with the reason:
//      the instrument's limit, recorded as such — never charged to the target
//      as a gap, never read as clean.
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
// lockfile `not-run` (its package manager unavailable) is never clean either. A package.json
// that declares real dependencies with NO lockfile (npm or otherwise) covering
// it — in its own directory or any ancestor up to the scan root — is recorded
// in `manifests` (`status: no-lockfile`): zero lockfiles audited is never read
// as clean (`yardstick/requirements.yaml` `d-dependencies-known-clean` reads
// not-measured over it, "no lockfile: nothing to audit", never met; a lockfile
// that failed or was not run reads the same way: not audited is not clean). Zero
// package.json files anywhere in the tree is the DIFFERENT fact `noManifest:
// true` — no dependency graph exists at all, and the requirement reads
// not-applicable, never met by silence. The document's own `exit` is 0 only
// when every lockfile in the tree audited with zero advisories AND every
// manifest with dependencies is covered by a lockfile; 1 when any advisory
// exists, any lockfile failed or was not run, or any manifest
// is uncovered; a crash of the runner itself exits 2 (uncaught at the CLI
// boundary), so ingest.mjs (success set [0, 1]) halts on it.
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

export const VERSION = '0.2.0';   // 0.2.0: pnpm + yarn classic audited; `not-supported` became `not-run`
export const LOCK_STATUS = ['audited', 'failed', 'not-run'];
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

// ── enumerate manifests (package.json with real dependencies) ───────────────
// A manifest with nothing to install has nothing to audit either — not counted.
// Zero manifests anywhere in the tree is a DIFFERENT fact from "a manifest with
// no lockfile": the former is not-applicable (there is no dependency graph to
// speak of); the latter is not-measured (there is one, but nothing audited it).
const nonEmptyDeps = (pkg) => !!(pkg && typeof pkg === 'object' && ['dependencies', 'devDependencies', 'optionalDependencies'].some((k) => pkg[k] && typeof pkg[k] === 'object' && Object.keys(pkg[k]).length));
export function findManifests(root) {
  const manifests = [];
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name < b.name ? -1 : 1)) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); continue; }
      if (e.name !== 'package.json') continue;
      const p = join(dir, e.name);
      let pkg = null;
      try { pkg = JSON.parse(readFileSync(p, 'utf8')); } catch { /* unreadable manifest: not counted either way */ continue; }
      manifests.push({ dir, path: p, hasDependencies: nonEmptyDeps(pkg) });
    }
  })(root);
  return manifests.sort((a, b) => a.path < b.path ? -1 : 1);
}
// A manifest is "covered" when a lockfile (npm or otherwise — any lockfile is
// evidence something tracked its dependency graph, even one this instrument
// cannot itself audit) sits in its own directory or any ancestor directory up
// to the scan root — the same resolution npm itself walks for `npm ci`.
export function isCoveredByLockfile(manifestDir, root, lockDirs) {
  let d = resolve(manifestDir), stop = resolve(root);
  for (;;) {
    if (lockDirs.has(d)) return true;
    if (d === stop) return false;
    const parent = dirname(d);
    if (parent === d) return false;
    d = parent;
  }
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

// ── pnpm and yarn classic: npm's v6 advisory objects ─────────────────────────
// Both `pnpm audit --json` and yarn classic's `auditAdvisory` lines carry the same
// advisory object: module_name, severity, vulnerable_versions, patched_versions,
// github_advisory_id, url, title, findings[].version. One row per (id, package).
export function advisoriesFromV6(list) {
  const rows = []; const seen = new Set();
  for (const a of list) {
    if (!a || typeof a !== 'object' || !a.module_name) continue;
    const ghsa = typeof a.url === 'string' && a.url.match(/GHSA-[a-zA-Z0-9-]+/);
    const id = a.github_advisory_id || (ghsa ? ghsa[0] : null) || (a.id !== undefined ? `npm-${a.id}` : null);
    if (!id) continue;
    const key = `${id}@${a.module_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const installed = [...new Set((Array.isArray(a.findings) ? a.findings : []).map((f) => f && f.version).filter(Boolean).map(String))];
    rows.push({
      id, package: a.module_name,
      installed: installed.length ? installed.join(', ') : null,
      range: a.vulnerable_versions || null,
      severity: a.severity,
      fix_available: !!(a.patched_versions && a.patched_versions !== '<0.0.0'),
      url: a.url || null,
      title: a.title || null,
    });
  }
  return rows;
}
const countsOf = (v) => ({ critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0, info: v.info || 0 });

// `pnpm audit --json`: exit 0 clean, 1 advisories. Any other exit, or a report without
// `advisories` + `metadata.vulnerabilities`, is not an audit.
export function parsePnpmAudit(stdout, status) {
  let doc = null;
  try { doc = JSON.parse(stdout); } catch { doc = null; }
  const ok = (status === 0 || status === 1) && doc && typeof doc === 'object' && doc.advisories && typeof doc.advisories === 'object'
    && doc.metadata && doc.metadata.vulnerabilities;
  if (!ok) {
    const reason = doc && doc.error ? `pnpm audit error ${doc.error.code || ''}: ${oneLine(doc.error.message || doc.error.summary || '')}`.trim()
      : doc ? `pnpm audit exited ${status} with an unrecognized report shape`
      : 'pnpm audit did not produce parseable JSON (registry unreachable, or pnpm printed a non-JSON error)';
    return { ok: false, reason };
  }
  return { ok: true, counts: countsOf(doc.metadata.vulnerabilities), dependencies_audited: doc.metadata.totalDependencies ?? doc.metadata.dependencies ?? null, advisories: advisoriesFromV6(Object.values(doc.advisories)) };
}

// `yarn audit --json` (classic): NDJSON — `auditAdvisory` lines and one `auditSummary`.
// The exit code is a severity bitmask (0–31), so any of those is an audit; without a
// summary line, or with an `error` line, it is not.
export function parseYarnClassicAudit(stdout, status) {
  const parsed = [];
  for (const l of String(stdout || '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    try { parsed.push(JSON.parse(l)); }
    catch { return { ok: false, reason: 'yarn audit printed a line that is not JSON (registry unreachable, or yarn printed a non-JSON error)' }; }
  }
  const err = parsed.find((x) => x && x.type === 'error');
  const summary = parsed.find((x) => x && x.type === 'auditSummary' && x.data && x.data.vulnerabilities);
  if (err) return { ok: false, reason: `yarn audit error: ${oneLine(err.data)}` };
  if (!summary) return { ok: false, reason: 'yarn audit produced no auditSummary (a truncated or failed audit)' };
  if (!(Number.isInteger(status) && status >= 0 && status <= 31)) return { ok: false, reason: `yarn audit exited ${status}` };
  const advisories = advisoriesFromV6(parsed.filter((x) => x && x.type === 'auditAdvisory' && x.data && x.data.advisory).map((x) => x.data.advisory));
  return { ok: true, counts: countsOf(summary.data.vulnerabilities), dependencies_audited: summary.data.totalDependencies ?? summary.data.dependencies ?? null, advisories };
}

function toolVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', env: scrubbedEnv(), timeout: 30000 });
  return (!r.error && r.status === 0) ? String(r.stdout || '').trim() : null;
}
// yarn berry (2+): a .yarnrc.yml beside the lockfile, or the berry lockfile header
function isYarnBerry(lockPath) {
  if (existsSync(join(dirname(lockPath), '.yarnrc.yml'))) return true;
  try { return /^__metadata:/m.test(readFileSync(lockPath, 'utf8').slice(0, 4000)); } catch { return false; }
}

// one pnpm-lock.yaml / yarn.lock: audited with its own package manager, or not-run
// with the reason when the instrument cannot (its limit, not the target's gap)
export function auditOtherLockfile(o, root, timeoutSec, log = () => {}) {
  const relPath = relative(root, o.path).split('\\').join('/');
  const notRun = (reason) => { log(`  → ${relPath}: not-run (${reason})`); return { path: relPath, status: 'not-run', manager: o.manager, reason }; };
  if (o.manager === 'yarn' && isYarnBerry(o.path)) return notRun('a yarn berry (2+) lockfile: this instrument drives yarn classic\'s `yarn audit` only; run `yarn npm audit --all --recursive` on it');
  const version = toolVersion(o.manager);
  if (!version) return notRun(`${o.manager} is not available on the runner; run \`${o.manager} audit\` where it is, or re-run dependency-scan there`);
  const cmd = `${o.manager} audit --json`;
  const r = spawnSync(o.manager, ['audit', '--json'], { cwd: dirname(o.path), encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: scrubbedEnv() });
  let res;
  if (r.error && r.error.code === 'ETIMEDOUT') res = { ok: false, reason: `${cmd} timed out` };
  else if (r.error) res = { ok: false, reason: `could not spawn ${o.manager}: ${r.error.message}` };
  else if (r.signal) res = { ok: false, reason: `${cmd} was killed by ${r.signal}` };
  else res = o.manager === 'pnpm' ? parsePnpmAudit(r.stdout, r.status) : parseYarnClassicAudit(r.stdout, r.status);
  log(`  → ${cmd} ${relPath} (${o.manager} ${version}): ${res.ok ? `exit ${r.status}` : 'failed'}`);
  if (!res.ok) return { path: relPath, status: 'failed', manager: o.manager, method: 'in-place', exit_code: r.status ?? null, reason: res.reason, stderr_tail: tail(r.stderr) };
  return { path: relPath, status: 'audited', manager: o.manager, tool_version: version, method: 'in-place', exit_code: r.status,
    counts: res.counts, dependencies_audited: res.dependencies_audited, advisories: res.advisories };
}

// ── the run ──────────────────────────────────────────────────────────────────
export function run({ target, timeout = 300, log = () => {} }) {
  const startedAt = new Date().toISOString();
  if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
  const root = resolve(target);
  const { npm, other } = findLockfiles(root);
  const lockfiles = [];
  for (const lp of npm) lockfiles.push({ manager: 'npm', ...auditLockfile(lp, root, timeout, log) });
  for (const o of other) lockfiles.push(auditOtherLockfile(o, root, timeout, log));
  lockfiles.sort((a, b) => a.path < b.path ? -1 : 1);

  // manifests: a package.json with real dependencies and NO lockfile (npm or
  // otherwise) covering it has nothing audited it — never read as clean (a zero
  // count of lockfiles audited is not the same fact as zero advisories found).
  // Zero manifests anywhere in the tree is the distinct not-applicable fact:
  // there is no dependency graph at all to audit.
  const lockDirs = new Set([...npm.map((p) => dirname(p)), ...other.map((o) => dirname(o.path))]);
  const allManifests = findManifests(root);
  const uncovered = allManifests.filter((m) => m.hasDependencies && !isCoveredByLockfile(m.dir, root, lockDirs));
  const manifests = uncovered.map((m) => ({ path: relative(root, m.path).split('\\').join('/'), status: 'no-lockfile' }));
  const noManifest = allManifests.length === 0;
  if (manifests.length) for (const m of manifests) log(`  → ${m.path}: no-lockfile (declares dependencies, no lockfile covers it — nothing to audit)`);
  else if (noManifest) log('  → no package.json anywhere in the tree — not applicable, nothing to audit');

  const anyAdvisory = lockfiles.some((l) => l.status === 'audited' && l.advisories.length);
  const anyFailed = lockfiles.some((l) => l.status === 'failed');
  const anyNotRun = lockfiles.some((l) => l.status === 'not-run');
  const anyUncovered = manifests.length > 0;
  return {
    tool: 'dependency-scan', version: VERSION, started_at: startedAt, finished_at: new Date().toISOString(),
    target: { path: target }, timeout_seconds: timeout, lockfiles, manifests, noManifest,
    exit: (anyAdvisory || anyFailed || anyNotRun || anyUncovered) ? 1 : 0,
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
    const notRun = doc.lockfiles.filter((l) => l.status === 'not-run').length;
    const uncoveredNote = doc.manifests.length ? ` · ${doc.manifests.length} manifest(s) with no lockfile` : doc.noManifest ? ' · no manifest in the tree (not applicable)' : '';
    console.error(`${doc.exit === 0 ? '✓' : '✗'} dependency-scan: ${audited.length} lockfile(s) audited (${advisories} advisor${advisories === 1 ? 'y' : 'ies'}) · ${failed} failed · ${notRun} not run${uncoveredNote} → ${out}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ dependency-scan crashed: ${e.message}`);
    process.exit(2);
  }
}
