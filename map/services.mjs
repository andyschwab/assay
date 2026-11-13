// services.mjs — a target's declared services, started throwaway for one measurement (#256).
//
// assay has no service of its own and keeps none: fresh-clone measures a clean machine with
// no database and no credentials (map/child-env.mjs, #47). A database-backed suite cannot run
// there, and without more it reads `test: failed` — the instrument's gap charged to the target.
// So the target declares, in its own repository, the services its test and migrate steps
// need, and fresh-clone, ONLY under an explicit opt-in (`--services`; `assay start
// --allow-exec --allow-services`), starts each one as a throwaway container, waits for its
// readiness check, runs the declared setup, runs the bound steps with the declared
// environment, and removes every container it started, always. Without the opt-in, or
// without a container runtime, the bound steps read skipped ("needs <service>, which this
// measurement did not provide"): not measured, never failed. The contract is
// map/scanners/CONTRACT.md §3b, "Services a target declares".
//
// The declaration's home is SERVICES_FILE at the repository root. Its keys are closed: an
// unknown key, a service image not pinned by a tag (or digest), an environment name the
// child allow-list owns, or a `${…}` reference to anything but a declared service's host or
// port is refused, with the reason, never guessed at.
//
// The container runtime is `docker`, found on the evaluator's PATH and run with the
// evaluator's environment (it is assay's own command, not the target's); the target's code
// never sees that environment. Containers publish their port on 127.0.0.1 only and carry no
// volume, network or privilege the declaration could ask for: there is no key for one.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseYaml } from '../lib/yaml-min.mjs';

export const SERVICES_FILE = '.assay/services.yaml';
const SERVICE_STEPS = ['test', 'migrate'];
const DEFAULT_WAIT = 60;
const MAX_WAIT = 600;

const TOP_KEYS = ['services', 'steps', 'env', 'setup'];
const SERVICE_KEYS = ['name', 'image', 'port', 'env', 'ready', 'wait'];
// names the child allow-list owns (map/child-env.mjs): a declaration never replaces them
const OWNED_NAMES = ['PATH', 'HOME', 'CI', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];
const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REF_RE = /\$\{([^}]*)\}/g;

class ServiceDeclarationError extends Error {}
const refuse = (m) => new ServiceDeclarationError(`${SERVICES_FILE}: ${m}`);
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (obj, keys, where) => {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) throw refuse(`unknown key "${k}" ${where} (the keys are ${keys.join(', ')})`);
};

// an image pinned by a tag other than `latest`, or by a digest
export function imagePinned(image) {
  if (typeof image !== 'string' || !image || /\s/.test(image)) return false;
  if (/@sha256:[a-f0-9]{64}$/.test(image)) return true;
  const last = image.split('/').pop();
  const i = last.lastIndexOf(':');
  if (i < 1) return false;
  const tag = last.slice(i + 1);
  return /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(tag) && tag !== 'latest';
}

function envMap(v, where, { owned }) {
  if (v === undefined || v === null) return {};
  if (!isMap(v)) throw refuse(`${where} must be a map of NAME: value`);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (!ENV_NAME_RE.test(k)) throw refuse(`${where}: "${k}" is not an environment name`);
    if (owned && (OWNED_NAMES.includes(k) || /^npm_config_/i.test(k))) throw refuse(`${where}: "${k}" is set by the measurement's own allow-list (map/child-env.mjs), never by a declaration`);
    if (!['string', 'number', 'boolean'].includes(typeof val)) throw refuse(`${where}: ${k} must be a plain value`);
    out[k] = String(val);
  }
  return out;
}

/** parse and check a declaration's text; throws ServiceDeclarationError naming what is refused */
export function parseServices(text) {
  let doc;
  try { doc = parseYaml(String(text)); } catch (e) { throw refuse(`not readable YAML: ${e.message}`); }
  if (!isMap(doc)) throw refuse('must be a map with services: and steps:');
  closed(doc, TOP_KEYS, 'at the top level');
  if (!Array.isArray(doc.services) || !doc.services.length) throw refuse('services: must list at least one service');
  const services = doc.services.map((s, i) => {
    if (!isMap(s)) throw refuse(`services[${i}] must be a map`);
    closed(s, SERVICE_KEYS, `in services[${i}]`);
    if (typeof s.name !== 'string' || !NAME_RE.test(s.name)) throw refuse(`services[${i}].name must be a short lower-case name (a-z, 0-9, -)`);
    if (!imagePinned(s.image)) throw refuse(`services[${i}] (${s.name}): image must be pinned by a tag other than latest, or by a digest (got ${JSON.stringify(s.image ?? null)})`);
    if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) throw refuse(`services[${i}] (${s.name}): port must be the container's port, an integer 1-65535`);
    if (typeof s.ready !== 'string' || !s.ready.trim()) throw refuse(`services[${i}] (${s.name}): ready must be the command, run inside the container, that exits 0 once it is ready`);
    if (s.wait !== undefined && !(Number.isInteger(s.wait) && s.wait >= 1 && s.wait <= MAX_WAIT)) throw refuse(`services[${i}] (${s.name}): wait must be seconds, 1-${MAX_WAIT}`);
    return { name: s.name, image: s.image, port: s.port, env: envMap(s.env, `services[${i}].env`, { owned: false }), ready: s.ready, wait: s.wait ?? DEFAULT_WAIT };
  });
  const names = services.map((s) => s.name);
  if (new Set(names).size !== names.length) throw refuse('two services share a name');
  if (!Array.isArray(doc.steps) || !doc.steps.length || doc.steps.some((x) => !SERVICE_STEPS.includes(x))) throw refuse(`steps: must list the steps that need the services, from ${SERVICE_STEPS.join(', ')}`);
  const env = envMap(doc.env, 'env', { owned: true });
  for (const [k, val] of Object.entries(env)) {
    for (const m of val.matchAll(REF_RE)) {
      const [svc, part, ...rest] = m[1].split('.');
      if (rest.length || !names.includes(svc) || !['host', 'port'].includes(part)) throw refuse(`env.${k}: \${${m[1]}} names nothing; a value may refer only to \${<service>.host} or \${<service>.port}`);
    }
  }
  if (doc.setup !== undefined && doc.setup !== null && !(Array.isArray(doc.setup) && doc.setup.every((c) => typeof c === 'string' && c.trim()))) throw refuse('setup: must be a list of commands');
  return { services, steps: [...new Set(doc.steps)], env, setup: doc.setup || [] };
}

/** the declaration at a checkout's root: null when there is none; throws when it is refused */
export function readServices(dir) {
  const p = join(dir, SERVICES_FILE);
  if (!existsSync(p)) return null;
  if (!statSync(p).isFile()) throw refuse('is not a file');
  return parseServices(readFileSync(p, 'utf8'));
}

// ── the runtime ─────────────────────────────────────────────────────────────
/** the container runtime's path on the evaluator's PATH, or null */
export function findRuntime(name = 'docker') {
  if (isAbsolute(name)) return existsSync(name) ? name : null;
  for (const d of String(process.env.PATH || '').split(':').filter((x) => x && isAbsolute(x))) {
    try { const st = statSync(join(d, name)); if (st.isFile() && (st.mode & 0o111)) return join(d, name); } catch {}
  }
  return null;
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const rt = (runtime, args, timeoutSec = 30) => {
  const r = spawnSync(runtime, args, { encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 });
  return { ok: r.status === 0 && !r.error, out: String(r.stdout || '').trim(), err: String(r.stderr || (r.error && r.error.message) || '').trim() };
};
const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0] || 'no output';

/**
 * Start every declared service, throwaway, and wait for each to be ready. Returns the state
 * stopServices removes; `provided` false names why (`reason`), and whatever started is still
 * in `containers`, for the caller's teardown.
 * @param {{services: any[]}} decl
 * @param {{ runtime: string, pullTimeout?: number, log?: (m: string) => void }} o
 */
export function startServices(decl, { runtime, pullTimeout = 600, log = /** @type {(msg: string) => void} */ (() => {}) }) {
  const state = { runtime, provided: false, reason: null, containers: /** @type {any[]} */ ([]), host: {} };
  for (const s of decl.services) {
    const container = `assay-svc-${s.name}-${randomBytes(4).toString('hex')}`;
    const entry = { name: s.name, image: s.image, container, started: false, ready: false, removed: false };
    state.containers.push(entry);
    log(`  → service ${s.name}: ${s.image} (throwaway, ${container})`);
    const env = Object.entries(s.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const r = rt(runtime, ['run', '-d', '--rm', '--name', container, '--label', 'assay.throwaway=true', '-p', `127.0.0.1::${s.port}`, ...env, s.image], pullTimeout);
    if (!r.ok) { state.reason = `${s.name} (${s.image}) did not start: ${firstLine(r.err)}`; return state; }
    entry.started = true;
    const p = rt(runtime, ['port', container, `${s.port}/tcp`]);
    const m = p.out.match(/127\.0\.0\.1:(\d+)/);
    if (!p.ok || !m) { state.reason = `${s.name} (${s.image}) published no port on 127.0.0.1: ${firstLine(p.err || p.out)}`; return state; }
    state.host[s.name] = { host: '127.0.0.1', port: m[1] };
    const deadline = Date.now() + s.wait * 1000;
    for (;;) {
      const x = rt(runtime, ['exec', container, 'sh', '-c', s.ready], 10);
      if (x.ok) { entry.ready = true; break; }
      if (Date.now() >= deadline) { state.reason = `${s.name} (${s.image}) was not ready within ${s.wait}s (\`${s.ready}\`: ${firstLine(x.err || x.out)})`; return state; }
      sleep(1000);
    }
    log(`    ${s.name} ready on 127.0.0.1:${m[1]}`);
  }
  state.provided = true;
  return state;
}

/** remove every container startServices started; each entry records whether it went */
export function stopServices(state, log = /** @type {(msg: string) => void} */ (() => {})) {
  if (!state) return;
  for (const c of state.containers) {
    if (!c.started || c.removed) continue;
    const r = rt(state.runtime, ['rm', '-f', c.container], 60);
    c.removed = r.ok;
    log(`  ← service ${c.name}: ${r.ok ? 'removed' : `NOT removed (${firstLine(r.err)}); remove ${c.container} by hand`}`);
  }
}

/** the declared environment with each `${service.host|port}` filled from the started services */
export function resolveEnv(decl, state) {
  const out = {};
  for (const [k, v] of Object.entries(decl.env)) out[k] = v.replace(REF_RE, (_, ref) => { const [svc, part] = ref.split('.'); return state.host[svc][part]; });
  return out;
}
