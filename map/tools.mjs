// tools.mjs — install the external tools the adopted adapters pin, and say which are behind (#189).
//
// The tools are a precondition of a measurement, never one of its results (#198): a run
// that cannot field every adopted instrument does not start. `verify` says whether each
// pinned tool is on PATH and answers `--version` with its pin; the routine's gate step and
// `assay start <target>` refuse to draw a map until it does. A session, and every child
// review session beside it, installs them before it starts (an environment's setup
// script, a workflow step). Each adapter that drives an external tool says what to
// install in a `tool:` block (map/scanners/CONTRACT.md §3g), and nothing here names a
// tool (CLAUDE.md rule 7):
//   tool.bin        the command the adapter runs
//   tool.version    the pinned version — the adapter's verified_against where it has one
//   tool.upstream   where a newer release is read: github:<owner>/<repo> | pypi:<package>
//   tool.fetch      per platform (linux-x64, darwin-arm64, …): url, sha256, and member,
//                   the file inside an archive (.tar.gz, .zip, .whl); a download whose
//                   sha256 differs is refused, naming both sums, and nothing is installed
//   tool.pypi       instead of fetch: a package installed at the pinned version into its
//                   own environment (uv tool install, else a venv) — pinned by version, and
//                   PyPI's own hashes over TLS, not by a sum here (its dependencies float)
// A tool already installed at its pin (the stamp beside the binaries, its sha256 still
// matching) is left as it is.
//
// Usage: node assay.mjs tools install [--dir <bin-dir>] [--only <scanner>]   (default ~/.local/bin)
//        node assay.mjs tools verify                                          (each pin on PATH and answering)
//        node assay.mjs tools check [--json]                                  (pinned against latest)
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isMain } from './doctrine.mjs';
import { loadAdapters } from './project.mjs';

const platformKey = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`;
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const has = (cmd) => sh('sh', ['-c', `command -v ${cmd}`]).status === 0;

// the adopted adapters' tool blocks, in scanner order
export function pinnedTools(adapters = loadAdapters()) {
  return Object.entries(adapters)
    .filter(([, a]) => a && a.tool && a.adopted !== false && !a.retired)
    .map(([scanner, a]) => ({ scanner, verified: a.verified_against ?? null, versionArgs: (a.run && a.run.version) || ['--version'], ...a.tool }))
    .sort((x, y) => x.scanner.localeCompare(y.scanner));
}

// what a tool block owes, in a line each (a block holds them; install reads nothing else)
export function toolBlockProblems(t) {
  const out = [];
  if (!t.bin || !t.version) out.push('a tool block names its bin and version');
  if (t.verified && String(t.verified) !== String(t.version)) out.push(`tool.version ${t.version} is not the adapter's verified_against ${t.verified}: the pin and the verified version move together`);
  if (!/^(github:[\w.-]+\/[\w.-]+|pypi:[\w.-]+)$/.test(String(t.upstream || ''))) out.push('tool.upstream is github:<owner>/<repo> or pypi:<package>');
  if (!!t.fetch === !!t.pypi) out.push('a tool block has fetch (per-platform artifacts) or pypi (a package), not both or neither');
  for (const [plat, f] of Object.entries(t.fetch || {})) {
    if (!/^https:\/\//.test(String(f && f.url))) out.push(`fetch.${plat}.url is an https URL`);
    if (!/^[0-9a-f]{64}$/.test(String(f && f.sha256))) out.push(`fetch.${plat}.sha256 is 64 hex characters`);
    if (/\.(tar\.gz|tgz|zip|whl)$/.test(String(f && f.url)) && !f.member) out.push(`fetch.${plat}.member names the file inside the archive`);
  }
  return out;
}

const curl = (url, dest) => { const r = sh('curl', ['-fsSL', '--retry', '2', '-o', dest, url]); if (r.status !== 0) throw new Error(`download failed: ${url} (${(r.stderr || '').trim()})`); };

function extract(archive, url, member, out) {
  const tmp = mkdtempSync(join(tmpdir(), 'assay-tool-'));
  try {
    if (/\.(tar\.gz|tgz)$/.test(url)) {
      const r = sh('tar', ['-xzf', archive, '-C', tmp, member]);
      if (r.status !== 0) throw new Error(`${member} not in the archive (${(r.stderr || '').trim()})`);
      copyFileSync(join(tmp, member), out);
    } else if (/\.(zip|whl)$/.test(url)) {
      const r = sh('unzip', ['-o', '-q', archive, member, '-d', tmp]);
      if (r.status !== 0) throw new Error(`${member} not in the archive (${(r.stderr || '').trim()})`);
      copyFileSync(join(tmp, member), out);
    } else copyFileSync(archive, out);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// install one tool → { scanner, bin, status: installed | current | failed | unsupported, detail }
export function installTool(t, dir, { platform = platformKey(), fetch = curl } = {}) {
  const row = (status, detail) => ({ scanner: t.scanner, bin: t.bin, version: t.version, status, detail });
  const problems = toolBlockProblems(t);
  if (problems.length) return row('failed', `the tool block is malformed: ${problems.join('; ')}`);
  mkdirSync(dir, { recursive: true });
  const stampPath = join(dir, '.assay-tools.json');
  let stamp = {}; try { stamp = JSON.parse(readFileSync(stampPath, 'utf8')); } catch { /* none yet */ }
  const target = join(dir, t.bin);
  const was = stamp[t.bin];
  if (was && was.version === t.version && existsSync(target) && (!was.sha256 || sha256(target) === was.sha256)) return row('current', `already at ${t.version}`);
  if (t.pypi) {
    const spec = `${t.pypi}==${t.version}`;
    if (has('uv')) {
      // the installer runs in the operator's own environment: it never touches a target, so it
      // is not one of the instruments that execute a target's code (map/child-env.mjs)
      const r = sh('uv', ['tool', 'install', '--force', spec], { env: { ...process.env, UV_TOOL_BIN_DIR: dir } });
      if (r.status !== 0) return row('failed', `uv tool install ${spec}: ${(r.stderr || '').trim().split('\n').pop()}`);
    } else {
      const venv = join(homedir(), '.local', 'share', 'assay-tools', `${t.pypi}-${t.version}`);
      const v = sh('python3', ['-m', 'venv', venv]);
      const p = v.status === 0 ? sh(join(venv, 'bin', 'pip'), ['install', '--quiet', spec]) : v;
      if (p.status !== 0) return row('failed', `pip install ${spec}: ${(p.stderr || '').trim().split('\n').pop()}`);
      if (existsSync(target)) unlinkSync(target);
      symlinkSync(join(venv, 'bin', t.bin), target);
    }
    stamp[t.bin] = { version: t.version, scanner: t.scanner };
    writeFileSync(stampPath, JSON.stringify(stamp, null, 1) + '\n');
    return row('installed', `${spec} (version-pinned from PyPI)`);
  }
  const f = t.fetch[platform];
  if (!f) return row('unsupported', `no pinned artifact for ${platform} (pinned: ${Object.keys(t.fetch).join(', ')})`);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-dl-'));
  try {
    const dl = join(tmp, basename(new URL(f.url).pathname));
    fetch(f.url, dl);
    const got = sha256(dl);
    if (got !== f.sha256) return row('failed', `checksum mismatch for ${f.url}: pinned ${f.sha256}, downloaded ${got}; nothing installed`);
    const out = join(tmp, 'bin'); extract(dl, f.url, f.member, out);
    chmodSync(out, 0o755);
    copyFileSync(out, target); chmodSync(target, 0o755);
    stamp[t.bin] = { version: t.version, scanner: t.scanner, sha256: sha256(target) };
    writeFileSync(stampPath, JSON.stringify(stamp, null, 1) + '\n');
    return row('installed', `${t.version} from ${f.url} (sha256 verified)`);
  } catch (e) { return row('failed', e.message); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

// one tool as this machine runs it: the bin PATH resolves, and what it says asked its version
// (the adapter's run.version args, else --version)
const answerOf = (t) => {
  if (!has(t.bin)) return { found: false };
  const r = sh(t.bin, t.versionArgs || ['--version'], { timeout: 60000 });
  return { found: true, exit: r.status, output: `${r.stdout || ''}${r.stderr || ''}`.trim() };
};

// every pinned tool ready to run → one row per tool: ready | absent | broken | other-version.
// Ready is on PATH, asked its version exits 0 and prints the pinned one; anything else names
// what it found. `answer` is the seam a test drives without the tools themselves.
export function verifyTools(tools = pinnedTools(), answer = answerOf) {
  const v = (t) => String(t.version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tools.map((t) => {
    const a = answer(t);
    const row = (status, detail) => ({ scanner: t.scanner, bin: t.bin, version: String(t.version), status, detail });
    if (!a.found) return row('absent', `${t.bin} is not on PATH`);
    if (a.exit !== 0) return row('broken', `${t.bin} ${(t.versionArgs || ['--version']).join(' ')} exited ${a.exit}: ${String(a.output).split('\n').pop() || '(no output)'}`);
    if (!new RegExp(`(^|[^\\d.])v?${v(t)}($|[^\\d.])`).test(a.output)) return row('other-version', `${t.bin} ${(t.versionArgs || ['--version']).join(' ')} says ${JSON.stringify(String(a.output).split('\n')[0])}, not ${t.version}`);
    return row('ready', `${t.bin} ${t.version}`);
  });
}

// the one line a run that refuses to start prints and records, or null when every tool is ready
export function toolsNotReady(rows = verifyTools()) {
  const bad = rows.filter((r) => r.status !== 'ready');
  if (!bad.length) return null;
  return `assay's pinned tools are not ready, so no map is drawn: ${bad.map((r) => `${r.scanner} (${r.status}: ${r.detail})`).join('; ')}. Install them with \`node assay.mjs tools install --dir <bin>\`, put <bin> on PATH, and confirm with \`node assay.mjs tools verify\``;
}

// the latest upstream version of one tool, or null with why
function latestOf(t) {
  const [kind, name] = String(t.upstream).split(/:(.+)/);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-check-'));
  try {
    const out = join(tmp, 'r.json');
    const url = kind === 'pypi' ? `https://pypi.org/pypi/${name}/json` : `https://api.github.com/repos/${name}/releases/latest`;
    const auth = kind === 'github' && process.env.GITHUB_TOKEN ? ['-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`] : [];
    const r = sh('curl', ['-fsSL', ...auth, '-o', out, url]);
    if (r.status !== 0) return { latest: null, why: `could not read ${url}` };
    const j = JSON.parse(readFileSync(out, 'utf8'));
    const v = kind === 'pypi' ? j.info && j.info.version : j.tag_name;
    return { latest: v ? String(v).replace(/^v/, '') : null, why: v ? null : `no version in ${url}` };
  } catch (e) { return { latest: null, why: e.message }; }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

// pinned against latest → one row per tool: current | behind | unknown (never read as current)
export function checkTools(tools = pinnedTools(), latest = latestOf) {
  return tools.map((t) => {
    const { latest: l, why } = latest(t);
    const status = !l ? 'unknown' : l === String(t.version) ? 'current' : 'behind';
    return { scanner: t.scanner, bin: t.bin, pinned: String(t.version), latest: l, status, why };
  });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
  const sub = args[0];
  const tools = pinnedTools().filter((t) => !opt('--only') || t.scanner === opt('--only'));
  if (sub === 'install') {
    const dir = opt('--dir') || join(homedir(), '.local', 'bin');
    let bad = 0;
    for (const t of tools) {
      const r = installTool(t, dir);
      // unsupported is not installed: a platform with no pinned artifact cannot run the routine
      if (r.status === 'failed' || r.status === 'unsupported') bad++;
      console.log(`${r.status === 'failed' ? '✗' : r.status === 'unsupported' ? '·' : '✓'} ${r.scanner} (${r.bin}): ${r.status}, ${r.detail}`);
    }
    if (!process.env.PATH.split(':').includes(dir)) console.log(`note: ${dir} is not on PATH; add it so the instruments find their tools`);
    process.exit(bad ? 1 : 0);
  } else if (sub === 'verify') {
    const rows = verifyTools(tools);
    for (const r of rows) console.log(`${r.status === 'ready' ? '✓' : '✗'} ${r.scanner} (${r.bin}): ${r.status}, ${r.detail}`);
    process.exit(rows.every((r) => r.status === 'ready') ? 0 : 1);
  } else if (sub === 'check') {
    const rows = checkTools(tools);
    if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
    else for (const r of rows) console.log(`${r.status.padEnd(8)} ${r.scanner} (${r.bin}): pinned ${r.pinned}, latest ${r.latest ?? '?'}${r.why ? ` — ${r.why}` : ''}`);
  } else {
    console.error('usage: node assay.mjs tools install [--dir <bin-dir>] [--only <scanner>]\n       node assay.mjs tools verify [--only <scanner>]\n       node assay.mjs tools check [--json]');
    process.exit(2);
  }
}
