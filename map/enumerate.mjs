#!/usr/bin/env node
// enumerate.mjs — assay's deterministic population scanner.
//
// Why: an evaluation is only as repeatable as the populations it enumerates.
// Wherever a base pass SAMPLES a sub-population (which secret? which container
// class? which contract?) coverage varies run to run. This tool mechanically
// enumerates the populations that are grep-detectable, so the eval assesses a
// CLOSED list instead of whatever it happened to notice. It is the deterministic
// half of "enumerate-before-assess": the tool lists the population, the analyst
// verdicts each item.
//
// Zero-dependency (fs + path only), like validate.mjs — copies into any target.
//
// Usage:
//   node assay.mjs enumerate <target-repo>              # print the enumerated populations
//   node assay.mjs enumerate <target-repo> --run <run>  # + coverage gate: which enumerated
//                                                        #   [--exclude <glob>,<glob>] drops declared
//                                                        #   harness dirs from the gate (e.g. eval/**)
//                                                        #   items no finding's evidence cites
//
// The --run gate is the point: it turns "did you look at every X?" into a computed
// answer. An enumerated item whose file appears in NO finding's evidence is an
// unassessed population member — the class of miss this whole analysis is about.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { findingsDir, censusesPath, viewsDir } from '../lib/run-layout.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { secretShape } from '../yardstick/packet.mjs';

const target = process.argv[2];
if (!target || target.startsWith('--')) {
  console.error('usage: node enumerate.mjs <target-repo> [--run <run-dir>]');
  process.exit(2);
}
const runIdx = process.argv.indexOf('--run');
const runDir = runIdx > -1 ? process.argv[runIdx + 1] : null;
// --exclude <glob>[,<glob>]: dir prefixes to drop from the coverage GATE (not the
// printed recall) — an evaluation/benchmark harness a target ships that is not
// product surface (e.g. `eval/**` for a repo whose eval/ is a benchmark rig). The
// dirname varies per target, so the analyst declares it rather than the tool guessing.
const exIdx = process.argv.indexOf('--exclude');
const EXCLUDES = (exIdx > -1 && process.argv[exIdx + 1] ? process.argv[exIdx + 1].split(',') : [])
  .map((s) => s.trim().replace(/\/\*\*$/, '').replace(/\/+$/, '')).filter(Boolean);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'vendor', '.next', '__pycache__', 'venv', '.venv', 'coverage']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.pptx', '.woff', '.woff2', '.ttf', '.zip', '.gz', '.lock']);

// ── walk ──
function walk(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); }
    else if (e.isFile() && !BINARY.has(extname(e.name))) out.push(join(dir, e.name));
  }
  return out;
}

// FAIL LOUD: a target that is not a directory, or a tree that yields no files, is
// not a tree with no coverage gaps (walk() reads an unreadable dir as empty).
let isDir = false;
try { isDir = statSync(target).isDirectory(); } catch { /* reported below */ }
if (!isDir) { console.error(`enumerate: target is not a directory: ${target}`); process.exit(2); }
const files = walk(target);
if (!files.length) { console.error(`enumerate: target yields no files: ${target}`); process.exit(2); }
const rel = (f) => relative(target, f);
function lines(f) { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } }

// ── population detectors ──
// Each detector returns a Map<key, {evidence:Set<"path:line">, note}>. The key is
// the population MEMBER (a secret name, a mount, a contract) so the same member
// found in many files collapses to one row with all its evidence.
const pops = {
  secrets: new Map(),        // credential names → credential census
  secretConstants: new Map(),// credential-named identifiers/constants the shape filter set apart
  routeHandlers: new Map(),  // Next.js app-router handlers / pages-router API routes → HTTP surface
  socketMounts: new Map(),   // docker.sock / privilege → blast-scope / escapes
  contracts: new Map(),      // frozen dataclass / __post_init__ / schema → interface contracts
  reportPaths: new Map(),    // delivered=True / success on a failure branch → effect-vs-report
  egressControls: new Map(), // 169.254 / DOCKER-USER / URLBlocklist → network-egress controls
  effectSites: new Map(),    // subprocess / http write / send → effect channels
  containerClasses: new Map(),// docker run/create + ROLE → container/agent classes
  channelCandidates: new Map(),// bin CLIs / effect skills / delivery surfaces → terrain effect inventory
};
// A file is gate-relevant if it is live surface, not a test, a doc, an example,
// or research scratch. The gate counts only gate-relevant files; the printed
// enumeration still shows everything (recall for the census).
function gateable(path) {
  const b = basename(path);
  if (/(^|\/)tests?\//.test(path) || b.startsWith('test_') || /_test\.|\.test\./.test(b)) return false;
  if (/(^|\/)runs\//.test(path)) return false;   // self-reference: an eval run lives with its target
                                                 // (SCHEMA §5), so enumerating the target sweeps the run's
                                                 // own artifacts — recall-only, never a gate member.
  if (/\.md$/.test(b)) return false;             // docs restate, they do not implement
  if (/\.example\.|example/.test(b)) return false;
  if (/^research\//.test(path)) return false;
  if (EXCLUDES.some((pre) => path === pre || path.startsWith(pre + '/'))) return false;  // declared harness dirs
  return true;
}
// Structural populations key per-FILE so covering one instance never hides another
// (the webhook-vs-cron success-on-failure case). Secrets key by NAME (a recall list
// the credential census curates), so the same secret across files is one row.
const PER_FILE = new Set(['socketMounts', 'contracts', 'reportPaths', 'egressControls', 'containerClasses', 'effectSites', 'routeHandlers']);
function hit(pop, key, path, i, note) {
  const m = pops[pop];
  const k = PER_FILE.has(pop) ? `${key} @ ${path}` : key;
  if (!m.has(k)) m.set(k, { evidence: new Set(), note: note || '', gateable: false, member: key, file: PER_FILE.has(pop) ? path : null });
  const e = m.get(k);
  e.evidence.add(`${path}:${i + 1}`);
  if (gateable(path)) e.gateable = true;
}

const SECRET_NAME = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?:_(?:KEY|SECRET|TOKEN|PASSWORD|PASSPHRASE|CREDENTIAL|PEM))S?)\b/g;
// The secret shape filter (#33). A credential-suffixed name is an identifier or a
// constant, not a credential, when code assigns it a number or boolean (MAX_OUTPUT_TOKENS
// = 4096), or, for a *_KEY / *_TOKEN name, a string that reads as an identifier
// ('price_pro_monthly', 'pricing:v2'). It stays a credential when any site reads it from
// the environment or declares it in env/config, and a PASSWORD/SECRET/CREDENTIAL/
// PASSPHRASE/PEM name assigned a string literal is a hardcoded credential whatever the
// value looks like. A set-apart name is printed in its own section, never dropped.
const CONST_LITERAL = (name) => new RegExp(`\\b${name}\\b\\s*(?::\\s*[A-Za-z_][\\w.<>\\[\\]| ]*?)?\\s*(?:=(?!=)|:)\\s*(?:(['"\`])((?:(?!\\1).){0,200})\\1|(-?\\d[\\d_.]*|true|false)\\b)`);
const ENV_READ = (name) => new RegExp(`\\benv\\b|environ|getenv|\\bsecrets\\.|\\$\\{?${name}\\b`, 'i');
const CREDENTIAL_PREFIX = /^(?:sk|pk|rk)_(?:live|test)_|^whsec_|^xox[abpr]-|^gh[pousr]_|^AKIA|^sk-/;
const IDENTIFIER_VALUE = /^(?:[a-z][a-z0-9]*(?:[-_.:/][a-z0-9]+)*|[A-Z][A-Z0-9]*(?:[-_.:][A-Z0-9]+)*)$/;
const secretSites = new Map();   // name → { env: bool, constAt: "path:line" | null }
function secretSite(name, r, i, line, isEnvOrCfg, isCode) {
  if (!secretSites.has(name)) secretSites.set(name, { env: false, constAt: null });
  const s = secretSites.get(name);
  if (isEnvOrCfg || ENV_READ(name).test(line)) { s.env = true; return; }
  if (!isCode) return;
  const m = line.match(CONST_LITERAL(name));
  if (!m) return;
  const isNumberish = m[3] !== undefined;
  const v = m[2];
  const keyish = /_(?:KEY|TOKEN)S?$/.test(name);
  const ident = !isNumberish && keyish && v.length > 0 && v.length <= 64 && IDENTIFIER_VALUE.test(v) && !CREDENTIAL_PREFIX.test(v) && !secretShape(v);
  if ((isNumberish || ident) && !s.constAt) s.constAt = `${r}:${i + 1}`;
}

// Next.js route handlers (#33): the app router's `app/**/route.{js,ts,…}` exporting HTTP
// method functions, and the pages router's `pages/api/**` default-exported handler. Each
// exported method is one member (`METHOD /url`); a route group `(name)` and a parallel
// slot `@name` are not URL segments. A route file exporting no recognisable method is
// listed anyway (`? /url`) — a file Next serves is never left off the list.
const HTTP_METHODS = 'GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS';
const routeUrl = (segs) => '/' + segs.split('/').filter((x) => x && !/^\(.*\)$/.test(x) && !x.startsWith('@')).join('/');
function routeHandlers(r, ls) {
  const app = r.match(/(?:^|\/)app\/((?:.+\/)?)route\.[mc]?[jt]sx?$/);
  const pages = !app && r.match(/(?:^|\/)pages\/(api(?:\/.+)?)\.[mc]?[jt]sx?$/);
  if (!app && !pages) return;
  if (pages) {
    const url = routeUrl(pages[1].replace(/(?:^|\/)index$/, ''));
    const at = Math.max(0, ls.findIndex((l) => /\bexport\s+default\b/.test(l)));
    hit('routeHandlers', `route: ANY ${url}`, r, at, 'a pages-router API route (every method) — HTTP surface; assess its auth, input and effects');
    return;
  }
  const url = routeUrl(app[1]);
  let found = 0;
  for (let i = 0; i < ls.length; i++) {
    const methods = [];
    const decl = ls[i].match(new RegExp(`\\bexport\\s+(?:(?:async\\s+)?function\\s*\\*?|(?:const|let|var)\\s+)(${HTTP_METHODS})\\b`));
    if (decl) methods.push(decl[1]);
    const reexp = ls[i].match(/\bexport\s*\{([^}]*)\}/);
    if (reexp) for (const part of reexp[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/).pop();
      if (nm && new RegExp(`^(?:${HTTP_METHODS})$`).test(nm)) methods.push(nm);
    }
    for (const m of methods) { hit('routeHandlers', `route: ${m} ${url}`, r, i, 'an app-router route handler — HTTP surface; assess its auth, input and effects'); found++; }
  }
  if (!found) hit('routeHandlers', `route: ? ${url}`, r, 0, 'an app-router route file with no recognised method export — read it');
}

const EFFECT = [
  [/\bsubprocess\.(?:run|call|Popen|check_output)\b|\bos\.system\b|\bos\.popen\b/, 'shell exec'],
  [/\brequests\.(?:post|put|delete|patch)\b|\bhttpx\.(?:post|put|delete)\b|\burllib\b.*urlopen/, 'http write'],
  [/\bfetch\(|axios\.(?:post|put|delete)\b/, 'http write (js)'],
  [/chat\.postMessage|files\.upload|\.send_message\b|sendmail|smtplib/, 'message/mail send'],
  [/\bgit\s+push\b|git-credential|installation.token/, 'git push'],
  [/docker\s+(?:run|exec|create|rm|kill)\b|docker_provision|DockerClient/, 'docker control'],
];

for (const f of files) {
  const r = rel(f);
  const base = basename(f);
  const ls = lines(f);
  const isEnvOrCfg = /\.(env|ini|cfg|conf|ya?ml|toml|json)$/.test(base) || /\.env/.test(base) || base.startsWith('.env');
  const isCode = /\.(?:[mc]?[jt]sx?|py|rb|go|java|kt|rs|php)$/.test(base);
  routeHandlers(r, ls);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (line.length > 2000) continue;

    // 1. secrets — env-var-shaped credential names anywhere; strongest signal in .env/config
    let m;
    SECRET_NAME.lastIndex = 0;
    while ((m = SECRET_NAME.exec(line))) {
      hit('secrets', m[1], r, i, isEnvOrCfg ? 'declared in env/config' : 'referenced in code');
      secretSite(m[1], r, i, line, isEnvOrCfg, isCode);
    }

    // 2. socket / privilege mounts
    if (/\/var\/run\/docker\.sock|docker\.sock/.test(line)) hit('socketMounts', 'docker.sock mount', r, i, 'host docker control');
    if (/--privileged|privileged:\s*true/.test(line)) hit('socketMounts', '--privileged', r, i, 'privileged container');
    if (/--cap-add|cap_add/.test(line)) hit('socketMounts', '--cap-add', r, i, 'added capability');

    // 3. interface contracts / invariants
    if (/@dataclass\(frozen=True\)/.test(line)) hit('contracts', 'frozen dataclass', r, i, 'immutable contract');
    if (/def __post_init__/.test(line)) hit('contracts', '__post_init__ validation', r, i, 'raises on violation');
    if (/lockstep/i.test(line)) hit('contracts', 'lockstep test', r, i, 'byte-equal copies guard');
    if (/\b(class\s+\w+\((?:BaseModel|Schema)\)|zod\.|Joi\.|pydantic)/.test(line)) hit('contracts', 'schema validator', r, i, 'interface schema');

    // 4. effect-vs-report paths — success asserted where a failure was just handled
    if (/\b(?:delivered|success|ok|sent)\s*=\s*True\b/.test(line)) {
      const ctx = ls.slice(Math.max(0, i - 6), i).join('\n');
      if (/except|warning|warn|error|fail|drop|# ?still/i.test(ctx)) hit('reportPaths', 'success-set-after-failure', r, i, 'reports success on a failure branch');
    }

    // 5. network-egress controls (specific mechanisms only — bare "egress" as a word
    //    is too noisy; require a concrete control)
    if (/169\.254\.169\.254/.test(line)) hit('egressControls', 'metadata-endpoint block', r, i, 'network boundary');
    else if (/DOCKER-USER|iptables .*(?:DROP|REJECT|ACCEPT)|iptables -[AI]/.test(line)) hit('egressControls', 'iptables egress rule', r, i, 'network boundary');
    else if (/URLBlocklist|URLAllowlist/.test(line)) hit('egressControls', 'browser URL policy', r, i, 'network boundary');
    else if (/\bblock(?:list|ed)[-_]?(?:host|domain|url|terminal|pattern)|website[-_]blocklist/i.test(line)) hit('egressControls', 'host/pattern blocklist', r, i, 'egress denylist');

    // 6. effect call sites
    for (const [re, note] of EFFECT) if (/** @type {RegExp} */ (re).test(line)) hit('effectSites', note, r, i, note);

    // 7. container/agent classes
    if (/docker\s+(?:run|create)\b/.test(line)) hit('containerClasses', 'docker run/create site', r, i, 'a container is launched here — enumerate its class');
    if (/\bROLE(?:=|\s*==|\s*:)\s*["']?admin/.test(line) || /"admin"|'admin'/.test(line) && /role/i.test(line)) hit('containerClasses', 'admin-role branch', r, i, 'a distinct agent class');
  }
}

// the secret shape filter: set apart a name assigned an identifier or constant and never
// read from the environment; it is printed in its own section, never dropped
for (const [name, s] of secretSites) {
  if (s.env || !s.constAt || !pops.secrets.has(name)) continue;
  const e = pops.secrets.get(name);
  pops.secrets.delete(name);
  pops.secretConstants.set(name, { ...e, note: `assigned a non-credential literal at ${s.constAt}, never read from env — out of the credential census unless a site says otherwise` });
}

// 8. channel candidates — the AGENT'S INVOCABLE SURFACE (file-level, not line-level). The
// terrain effect inventory must be DERIVED from this listing, not drafted from memory: it is
// the set of things the agent can invoke that may produce an effect — agent-facing CLIs
// (a bin/ command surface), effect-bearing skills (a SKILL.md whose verb acts), and
// delivery/integration patches. A calibration measured that every missed effect
// channel (master-image-rebuild, webhook-inbound, meeting-audio) was one of these the
// hand-drafted inventory forgot. Each is a candidate the delegation pass triages to an effect
// finding or an out-of-scope note.
const EFFECT_VERB = /\b(send|deliver|publish|deploy|provision|rebuild|promote|revoke|upload|share|install|migrate|exec|browse|meeting|webhook|payment|mint|wipe|delete)\b/i;
// A test file (a tests/ dir, or a test-/test_/*.test./*.spec. filename) commonly
// builds fixture tool defs and effect-verb-named helpers; scanning it manufactures
// channel candidates that are not part of the shipped surface. Skip the whole
// channel-candidate scan for them.
const isTestFile = (r, b) => /(^|\/)tests?\//.test(r) || /^test[-_]/.test(b) || /\.(test|spec)\.[^.]+$/.test(b);
for (const f of files) {
  const r = rel(f), b = basename(f);
  if (isTestFile(r, b)) continue;
  // agent-facing CLI: an executable-looking file under a bin/ directory
  if (/(^|\/)bin\/[^/]+$/.test(r) && !/\.(md|txt|json)$/.test(b)) hit('channelCandidates', `cli: ${b}`, r, 0, 'an agent-invocable command — an effect channel unless proven inert');
  // effect-bearing skill: a SKILL.md whose dir or first lines name an acting verb
  if (b === 'SKILL.md') {
    const head = lines(f).slice(0, 12).join(' ');
    if (EFFECT_VERB.test(head) || EFFECT_VERB.test(r)) hit('channelCandidates', `skill: ${r.split('/').slice(-2)[0]}`, r, 0, 'a skill whose verb acts — triage as an effect channel');
  }
  // delivery / integration surface: a patch/script whose name is an effect verb
  if (/\.(py|sh|mjs|js)$/.test(b) && EFFECT_VERB.test(b)) hit('channelCandidates', `surface: ${b}`, r, 0, 'a delivery/integration surface named for an effect verb');

  // agent tool-DEFINITION table — the most common agentic shape and the one the
  // CLI/skill detectors miss: an in-code array/object of tool defs the model's
  // dispatch loop reads (a calibration run had to hand-derive 24 channels declared
  // this way). Anchor on the SDK-specific `input_schema` (Anthropic) / `inputSchema`
  // (some SDKs) / `parameters` (OpenAI/tool-runner) key, then take the nearest
  // preceding `name: "..."` as the channel slug — the invocation boundary, one
  // candidate per tool. A remote MCP toolset (`mcp_server_name`) is the same
  // surface reached provider-side; list it too.
  if (/\.(mjs|js|ts|jsx|tsx|py)$/.test(b)) {
    const fl = lines(f);
    for (let i = 0; i < fl.length; i++) {
      if (/\b(?:input_schema|inputSchema|parameters)\s*:/.test(fl[i])) {
        for (let j = i; j >= Math.max(0, i - 10); j--) {
          const nm = fl[j].match(/\bname\s*:\s*["'`]([A-Za-z][\w-]{1,60})["'`]/);
          if (nm) { hit('channelCandidates', `tool: ${nm[1]}`, r, j, 'an agent tool definition (name + input_schema) — the model-invocable surface; triage as an effect channel or an inert read'); break; }
        }
      }
      const mcp = fl[i].match(/\bmcp_server_name\s*:\s*["'`]([\w.-]+)["'`]/);
      if (mcp) hit('channelCandidates', `mcp-toolset: ${mcp[1]}`, r, i, 'a remote MCP toolset the model can call provider-side — triage as an effect channel');
    }
  }
}

// ── output ──
const LABEL = {
  secrets: 'SECRETS (→ credential census: each below/above the prompt boundary?)',
  secretConstants: 'SECRET-NAMED CONSTANTS (shape filter: an identifier or constant, not a credential — recall only)',
  routeHandlers: 'ROUTE HANDLERS (→ HTTP surface: assess each handler\'s auth, input and effects)',
  socketMounts: 'SOCKET / PRIVILEGE MOUNTS (→ blast-scope: does it escape the tenant ceiling?)',
  contracts: 'INTERFACE CONTRACTS (→ deterministic-gates/verification: does it fail loud?)',
  reportPaths: 'EFFECT-vs-REPORT PATHS (→ verification: is success asserted over a failed effect?)',
  egressControls: 'NETWORK-EGRESS CONTROLS (→ delegation: enumerate each, strength or gap)',
  effectSites: 'EFFECT CALL SITES (→ delegation: does each map to an enumerated effect channel?)',
  containerClasses: 'CONTAINER / AGENT CLASSES (→ assess EACH class separately — admin ≠ user)',
  channelCandidates: 'CHANNEL CANDIDATES (→ terrain effect inventory: derive it from THIS, not memory)',
};
const order = ['channelCandidates', 'routeHandlers', 'secrets', 'secretConstants', 'socketMounts', 'containerClasses', 'effectSites', 'egressControls', 'contracts', 'reportPaths'];

const JSON_MODE = process.argv.includes('--json');   // suppress the pretty enumeration; emit only JSON
if (!JSON_MODE) console.log(`\nassay enumerate — ${rel(target) || target}  (${files.length} files scanned)\n`);
for (const pop of JSON_MODE ? [] : order) {
  const m = pops[pop];
  // collapse per-file keys back to their member for the readable print
  const byMember = new Map();
  for (const [, v] of m) {
    const mem = v.member || [...v.evidence][0]; // secrets: member is the key itself
    if (!byMember.has(mem)) byMember.set(mem, { evidence: new Set(), note: v.note, files: new Set() });
    const g = byMember.get(mem);
    for (const e of v.evidence) g.evidence.add(e);
    if (v.file) g.files.add(v.file);
  }
  // for secrets the key IS the member
  const members = PER_FILE.has(pop) ? byMember : new Map([...m].map(([k, v]) => [k, { evidence: v.evidence, note: v.note, files: new Set() }]));
  console.log(`── ${LABEL[pop]}  [${members.size}${PER_FILE.has(pop) ? ` across ${m.size} files` : ''}]`);
  for (const [key, v] of [...members.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ev = [...v.evidence].slice(0, 3).join(', ') + (v.evidence.size > 3 ? ` (+${v.evidence.size - 3})` : '');
    console.log(`   • ${key}${v.note ? `  — ${v.note}` : ''}\n       ${ev}`);
  }
  console.log('');
}

// ── coverage gate (--run) ──
if (runDir) {
  // The gate hard-checks only the low-noise structural populations that have no
  // dedicated census. Secrets → the credential census; container-classes and
  // effect-sites → many-to-few channel mappings. Those stay recall-only (printed).
  // Route handlers are the HTTP surface, one file each, so they gate too (#33).
  const GATE_POPS = new Set(['routeHandlers', 'socketMounts', 'contracts', 'reportPaths', 'egressControls']);

  // A member is "covered" if any of its evidence files appears anywhere the run
  // ASSESSED it: a finding's evidence or covers list (map/findings/, parsed, never
  // read as text), the counted populations (map/censuses.yaml), or a view (views/**,
  // e.g. the axis walk). Read all of them.
  let cited = new Set();
  try {
    const srcs = [];
    const fd = findingsDir(runDir);
    if (existsSync(censusesPath(runDir))) srcs.push(censusesPath(runDir));
    const vd = viewsDir(runDir);
    const walkMd = (dir) => { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walkMd(p); else if (e.name.endsWith('.md')) srcs.push(p);
    } };
    walkMd(vd);
    for (const p of srcs) {
      const txt = readFileSync(p, 'utf8');
      // a path segment may be a Next.js route group `(name)` or a dynamic `[id]`/`[[...slug]]`
      // (#33); a bracket or paren only counts closed around a word, so `(app/x.ts:3)` cites app/x.ts
      for (const m of txt.matchAll(/((?:[A-Za-z0-9_.@-]|\/|\([A-Za-z0-9_.@-]+\)|\[{1,2}(?:\.{3})?[A-Za-z0-9_-]+\]{1,2})+?\.(?:py|sh|[mc]?[jt]sx?|json|ya?ml|txt|example|service)):\d/g)) cited.add(m[1].split(':')[0]);
    }
    // a finding's evidence list, parsed in block or flow form whatever the cited file's
    // type (#36), plus its `covers:` list: the members of a byte-identical family it
    // assessed as one pattern (SCHEMA §6b). A path in the observation prose cites nothing.
    if (existsSync(fd)) for (const f of readdirSync(fd)) if (f.endsWith('.yaml')) {
      const doc = parseYaml(readFileSync(join(fd, f), 'utf8'));
      for (const row of Array.isArray(doc) ? doc : []) for (const k of ['evidence', 'covers'])
        for (const e of Array.isArray(row?.[k]) ? row[k] : []) cited.add(String(e).split(':')[0]);
    }
  } catch (e) { console.error(`--run: could not read findings in ${runDir}: ${e.message}`); process.exit(2); }

  // covered by the exact path, or by a cited directory on a segment boundary; `.`,
  // `./` and an empty path name the whole tree and cover nothing (repo-census cites
  // `.:1` for a repo-wide fact, which once cleared every member under a dot-directory)
  const norm = (s) => String(s).replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  const citedPaths = [...cited].map(norm).filter((c) => c && c !== '.');
  const covers = (evSet) => [...evSet].some((e) => { const p = norm(e.split(':')[0]); return citedPaths.some((c) => p === c || p.startsWith(c + '/')); });

  // collect the uncovered live-surface members once; render as text or JSON
  const coverageGaps = [];
  for (const pop of order) {
    if (!GATE_POPS.has(pop)) continue;
    for (const [key, v] of pops[pop].entries()) {
      if (v.gateable && !covers(v.evidence))
        coverageGaps.push({ population: pop, member: v.member || key, file: v.file || null, evidence: [...v.evidence][0] || null });
    }
  }

  if (process.argv.includes('--json')) {   // machine-readable for map/backlog.mjs
    console.log(JSON.stringify({ target: rel(target) || target, coverageGaps }, null, 2));
    // same verdict semantics as the text gate: uncovered members = non-zero exit
    // (callers wanting the payload on failure read stdout, as backlog.mjs does).
    process.exit(coverageGaps.length ? 1 : 0);
  }

  console.log('══ COVERAGE GATE — enumerated, live-surface population members no finding cites ══');
  console.log('   (gate counts only live source; test/doc/example/research files are recall-only.)\n');
  let last = null;
  for (const g of coverageGaps) {
    if (g.population !== last) { console.log(`  ${g.population}:`); last = g.population; }
    console.log(`     ✗ ${g.member}${g.file ? `  ${g.file}` : ''}`);
  }
  if (!coverageGaps.length) console.log('  ✓ every enumerated live-surface population member is cited by at least one finding.\n');
  else console.log(`\n  ${coverageGaps.length} uncovered — each is a population member the base did not assess. Verdict each, or record why it is out of scope.\n`);
  process.exit(coverageGaps.length ? 1 : 0);
}
