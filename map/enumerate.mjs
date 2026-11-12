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
//   node assay.mjs enumerate <target-repo> --json       # the same populations as JSON (assay start
//                                                        #   writes it to map/raw/enumerate.json, #259)
//   node assay.mjs enumerate <target-repo> --run <run>  # + coverage gate: which enumerated
//                                                        #   [--exclude <glob>,<glob>] drops declared
//                                                        #   harness dirs from the gate (e.g. eval/**)
//                                                        #   items no finding's evidence cites
//
// The --run gate is the point: it turns "did you look at every X?" into a computed
// answer. An enumerated item whose file appears in NO finding's evidence is an
// unassessed population member — the class of miss this whole analysis is about.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, resolve } from 'node:path';
import { findingsDir, censusesPath, viewsDir } from '../lib/run-layout.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { secretShape } from '../yardstick/packet.mjs';
import { ENUMERATE_POPULATIONS } from './enumerate-populations.mjs';

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
  changeGates: new Map(),    // CI steps, hooks, config-driven checks → the change-gates census (#286)
  modelCalls: new Map(),     // files calling a model through a provider's SDK or API → the model-call census (#286)
  routeHandlers: new Map(),  // Next.js, node:http and Express-style route handlers → HTTP surface
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
// An effect-site member is one kind of call in one file (`http write (js) @ lib/sync.mjs`, #272):
// the triage closes it with one entry, so one entry never covers unrelated channels in other files.
// The other per-file populations key per file but name their member without it (a route names its
// URL; a mount or contract is read through its file's evidence).
const PER_FILE_MEMBER = new Set(['effectSites']);
function hit(pop, key, path, i, note) {
  const m = pops[pop];
  const k = PER_FILE.has(pop) ? `${key} @ ${path}` : key;
  if (!m.has(k)) m.set(k, { evidence: new Set(), note: note || '', gateable: false, member: PER_FILE_MEMBER.has(pop) ? k : key, file: PER_FILE.has(pop) ? path : null });
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
// The filter also sets apart a credential-suffixed name assigned an array or object literal
// whose every string is identifier-shaped (TRIAGE_KEYS, a list of 'candidate', 'finding', …; #292):
// a list of key names, not a credential. In a JS/TS file a `${NAME}` is a template
// interpolation, not an environment read; `$NAME` is still read as one (a shell string).
const CONST_LITERAL = (name) => new RegExp(`\\b${name}\\b\\s*(?::\\s*[A-Za-z_][\\w.<>\\[\\]| ]*?)?\\s*(?:=(?!=)|:)\\s*(?:(['"\`])((?:(?!\\1).){0,200})\\1|(-?\\d[\\d_.]*|true|false)\\b)`);
const ENV_READ = (name, js) => new RegExp(`\\benv\\b|environ|getenv|\\bsecrets\\.|\\$${js ? '' : '\\{?'}${name}\\b`, 'i');
const ENV_IN_LITERAL = /\benv\b|environ|getenv/i;
const CREDENTIAL_PREFIX = /^(?:sk|pk|rk)_(?:live|test)_|^whsec_|^xox[abpr]-|^gh[pousr]_|^AKIA|^sk-/;
const IDENTIFIER_VALUE = /^(?:[a-z][a-z0-9]*(?:[-_.:/][a-z0-9]+)*|[A-Z][A-Z0-9]*(?:[-_.:][A-Z0-9]+)*)$/;
const identifierValue = (v) => v.length > 0 && v.length <= 64 && IDENTIFIER_VALUE.test(v) && !CREDENTIAL_PREFIX.test(v) && !secretShape(v);
const isJs = (r) => /\.[mc]?[jt]sx?$/.test(r);
const secretSites = new Map();   // name → { env: bool, constAt: "path:line" | null }
function secretSite(name, r, i, line, isEnvOrCfg, isCode, ls) {
  if (!secretSites.has(name)) secretSites.set(name, { env: false, constAt: null });
  const s = secretSites.get(name);
  if (isEnvOrCfg || ENV_READ(name, isJs(r)).test(line)) { s.env = true; return; }
  if (!isCode) return;
  const coll = ls && collectionAssigned(name, ls, i);
  if (coll) {
    if (ENV_IN_LITERAL.test(coll.text)) { s.env = true; return; }
    if (coll.open !== 'new' && credentialSuffixed(name) && coll.strings.every((x) => identifierValue(x.value)) && !s.constAt) s.constAt = `${r}:${i + 1}`;
    return;
  }
  const m = line.match(CONST_LITERAL(name));
  if (!m) return;
  const isNumberish = m[3] !== undefined;
  const v = m[2];
  const keyish = /(?:key|token)s?$/i.test(name);
  const ident = !isNumberish && keyish && identifierValue(v);
  if ((isNumberish || ident) && !s.constAt) s.constAt = `${r}:${i + 1}`;
}

// Credential names in any case (#292). SECRET_NAME reads UPPER_SNAKE names wherever they appear;
// a camelCase, lowerCamel or snake_case credential name (apiKey, backupApiKey, authToken,
// clientSecret, api_key, a bare token or password) is listed where code assigns it a literal: a
// non-empty string with no interpolation, or an array, object or `new Map(…)` literal that holds a
// string. A name headed by a credential word (tokenTable, secret_store) is listed where it is
// assigned such a collection: a table of credentials. And a declared object or map literal,
// whatever its name, that holds a string of secret shape (secretShape, yardstick/packet.mjs, or a
// provider prefix) is listed by its name, unless the line holding that string already names a
// credential. A name assigned nothing literal (`apiKey = process.env.X`) is not listed here.
const CRED = 'Key|Secret|Token|Password|Passphrase|Credential|Pem';
const HEAD = 'token|secret|password|passphrase|credential|apiKey|api_key';
const CODE_SECRET_NAME = new RegExp(`(?<![\\w$])([a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*?(?:${CRED})s?|(?:[a-z][a-z0-9]*_)+(?:${CRED.toLowerCase()})s?|(?:${HEAD})(?:s?(?:[A-Z]|_[a-z])\\w*)?)(?![\\w$])`, 'g');
const BARE = new RegExp(`^(?:${HEAD})$`);
// a name that ends in a credential word: KEY after `_` (UPPER_SNAKE), Key after a lowercase
// letter or digit (camelCase), key after `_` (snake_case), or a bare credential word other than key
const credentialSuffixed = (name) => new RegExp(`(?:_(?:${CRED.toUpperCase()})S?|[a-z0-9](?:${CRED})s?|_(?:${CRED.toLowerCase()})s?|^(?:${HEAD})s?)$`).test(name);
const credentialHeaded = (name) => new RegExp(`^(?:${HEAD})s?(?:[A-Z]|_[a-z])`).test(name);
const ASSIGN = /^\s*(?::\s*[A-Za-z_][\w.<>[\]| ]*?)?\s*(?:=(?![=>])|:)\s*/;
// the bracketed literal that opens at line i, column c: its text and its string literals, each
// with its line. Reads to the matching close across at most 300 lines; null when it never closes.
function literalAt(ls, i, c) {
  const close = { '[': ']', '{': '}', '(': ')' };
  const stack = [], strings = [];
  let text = '', q = null, cur = '', curAt = i, interp = false;
  for (let j = i; j < Math.min(ls.length, i + 300); j++) {
    const l = ls[j];
    for (let k = j === i ? c : 0; k < l.length; k++) {
      const ch = l[k];
      text += ch;
      if (q) {
        if (ch === '\\') { cur += ch + (l[k + 1] || ''); text += l[k + 1] || ''; k++; continue; }
        if (q === '`' && ch === '$' && l[k + 1] === '{') interp = true;
        if (ch === q) { strings.push({ value: cur, line: curAt, interp }); q = null; continue; }
        cur += ch;
        continue;
      }
      if (ch === '/' && l[k + 1] === '/') break;
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur = ''; curAt = j; interp = false; continue; }
      if (close[ch]) stack.push(close[ch]);
      else if (ch === ']' || ch === '}' || ch === ')') {
        if (stack.pop() !== ch) return null;
        if (!stack.length) return { text, strings, end: j };
      }
    }
    if (q && q !== '`') return null;   // an unterminated quote: not a literal this reads
    text += '\n';
  }
  return null;
}
// the collection literal `name` is assigned on line i ([…], {…} or new Map(…)/new Set(…)), or null
function collectionAssigned(name, ls, i) {
  const l = ls[i];
  const re = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  let m;
  while ((m = re.exec(l))) {
    const rest = l.slice(m.index + name.length);
    const a = rest.match(ASSIGN);
    if (!a) continue;
    const at = m.index + name.length + a[0].length;
    const tail = l.slice(at);
    const nm = tail.match(/^new\s+(?:Map|Set)\s*\(\s*/);
    if (nm) { const lit = literalAt(ls, i, at + nm[0].indexOf('(')); if (lit) return { ...lit, open: 'new' }; continue; }
    if (tail[0] === '[' || tail[0] === '{') { const lit = literalAt(ls, i, at); if (lit) return { ...lit, open: tail[0] }; }
  }
  return null;
}
// the string literal `name` is assigned on line i (non-empty, no interpolation), or null
function stringAssigned(name, line) {
  const re = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'g');
  let m;
  while ((m = re.exec(line))) {
    const rest = line.slice(m.index + name.length);
    const a = rest.match(ASSIGN);
    if (!a) continue;
    const s = rest.slice(a[0].length).match(/^(['"`])((?:\\.|(?!\1).){1,500})\1/);
    if (s && !(s[1] === '`' && s[2].includes('${'))) return s[2];
  }
  return null;
}
const DECLARED = /^\s*(?:export\s+)?(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=|([A-Za-z_][\w]*)\s*(?::\s*[\w.[\], ]+)?\s*=(?!=))\s*(?:new\s+(?:Map|Set)\s*\(|[[{])/;
const secretShaped = (v) => !!v && (CREDENTIAL_PREFIX.test(v) || !!secretShape(v));
// the columns of a line that are code: not inside a string literal, and before a line comment
function codeColumns(line, py) {
  const code = [];
  let q = null;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if ((ch === '/' && line[k + 1] === '/') || (py && ch === '#')) break;
    code[k] = true;
  }
  return code;
}
function codeSecrets(r, ls, isCode) {
  if (!isCode) return;
  const py = /\.py$/.test(r);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (line.length > 2000 || /^\s*(?:\/\/|\/?\*|#)/.test(line)) continue;
    const code = codeColumns(line, py);
    CODE_SECRET_NAME.lastIndex = 0;
    let m;
    while ((m = CODE_SECRET_NAME.exec(line))) {
      const name = m[1];
      if (!code[m.index]) continue;   // a name inside a string or a comment is not assigned here
      // a bare credential word (token, password) counts only assigned a string; a collection by
      // that name is as often a list of tokens a parser reads
      const bare = BARE.test(name);
      const suffixed = credentialSuffixed(name), headed = !bare && credentialHeaded(name);
      const str = suffixed && stringAssigned(name, line);
      const coll = !str && !bare && (suffixed || headed) && collectionAssigned(name, ls, i);
      if (!str && !(coll && coll.strings.some((x) => x.value && !x.interp))) continue;
      hit('secrets', name, r, i, 'assigned a literal in code');
      secretSite(name, r, i, line, false, true, ls);
    }
    // a declared object or map literal holding a string of secret shape, whatever its name
    const d = line.match(DECLARED);
    if (!d) continue;
    const name = d[1] || d[2];
    const coll = collectionAssigned(name, ls, i);
    if (!coll) continue;
    for (const s of coll.strings) {
      if (s.interp || !secretShaped(s.value)) continue;
      const at = ls[s.line];
      SECRET_NAME.lastIndex = 0;
      if (SECRET_NAME.test(at) || [...at.matchAll(CODE_SECRET_NAME)].some((x) => stringAssigned(x[1], at))) continue;
      hit('secrets', name, r, s.line, 'a literal holding a value of secret shape');
    }
    SECRET_NAME.lastIndex = 0;
  }
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

// node:http and Express-style dispatch (#272), in a JS/TS file. A server that compares the
// request's method and its path (`req.method === 'POST' && url.pathname === '/admin/purge'`, in
// either order, on one line) inside a file that calls `createServer` lists one member per route
// (`route: POST /admin/purge`); a path compared with no method on its line is `route: ANY <path>`.
// An `app.<method>(path, …)` or `router.<method>(path, …)` call (any `…Router` receiver too) is
// one member per call, `all` reading ANY. A file that calls `createServer` and whose routes none
// of these read is listed anyway (`route: ? <file>`), as a Next.js route file
// is: a served file is never left off the list. A literal `.` or `(` is written `[.]`/`[(]` so
// these patterns are not themselves a route.
const NODE_SERVER = /\bcreateServer\s*[(]/;
const REQ_METHOD = new RegExp(`\\b(?:req|request)[.]method\\s*===?\\s*['"\`](${HTTP_METHODS})['"\`]|['"\`](${HTTP_METHODS})['"\`]\\s*===?\\s*(?:req|request)[.]method\\b`);
const REQ_PATH = /\b(?:pathname|(?:req|request)[.]url|url|path)\s*===?\s*['"`](\/[^'"`\s]*)['"`]|['"`](\/[^'"`\s]*)['"`]\s*===?\s*(?:pathname|(?:req|request)[.]url|url|path)\b/;
const EXPRESS_ROUTE = /\b(app|router|\w+Router)[.](get|post|put|patch|delete|options|head|all)\s*[(]\s*['"`](\/[^'"`]*)['"`]/g;
function serverRoutes(r, ls) {
  if (!/\.[mc]?[jt]sx?$/.test(r)) return;
  let found = 0;
  const served = ls.some((l) => l.length <= 2000 && NODE_SERVER.test(l));
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (l.length > 2000) continue;
    EXPRESS_ROUTE.lastIndex = 0;
    let m;
    while ((m = EXPRESS_ROUTE.exec(l))) {
      const method = m[2] === 'all' ? 'ANY' : m[2].toUpperCase();
      hit('routeHandlers', `route: ${method} ${m[3]}`, r, i, `an Express-style ${m[1]}.${m[2]} route — HTTP surface; assess its auth, input and effects`);
      found++;
    }
    if (!served) continue;
    const p = l.match(REQ_PATH);
    if (!p) continue;
    const meth = l.match(REQ_METHOD);
    hit('routeHandlers', `route: ${meth ? meth[1] || meth[2] : 'ANY'} ${p[1] || p[2]}`, r, i, 'a node:http route (the request\'s method and path compared in a createServer handler) — HTTP surface; assess its auth, input and effects');
    found++;
  }
  if (served && !found) hit('routeHandlers', `route: ? ${r}`, r, Math.max(0, ls.findIndex((l) => NODE_SERVER.test(l))), 'a node:http server whose routes enumerate cannot read — read it');
}

// A function named for sending mail or a message (#272), defined or called: `sendEmail`, `sendMail`,
// `sendMessage`, `sendSms`, `sendNotification`, `sendWebhook`, their snake_case forms, and `notify…`
// only where the name says the channel is outward (`notifyByEmail`, `notifySlack`, `notifyWebhook`,
// …); a bare `notify` is in-process as often as not, and a `.send` is any socket. The name is
// followed by its call or its definition (`(`, or `= async`/`= function`/`= (`), in a code file.
const SEND_FN = /\b(?:send(?:E?[Mm]ail|Message|Sms|SMS|Text|Notification|Webhook)|send_(?:e?mail|message|sms|notification|webhook)|notify(?:By|Via|_)?(?:Email|Mail|Slack|Sms|SMS|Webhook|Discord|Teams|Pager|email|mail|slack|sms|webhook))\w*(?=\s*(?:[(]|=\s*(?:async\b|function\b|[(])))/;

const EFFECT = [
  [/\bsubprocess\.(?:run|call|Popen|check_output)\b|\bos\.system\b|\bos\.popen\b/, 'shell exec'],
  [/\brequests\.(?:post|put|delete|patch)\b|\bhttpx\.(?:post|put|delete)\b|\burllib\b.*urlopen/, 'http write'],
  [/\bfetch\(|axios\.(?:post|put|delete)\b/, 'http write (js)'],
  [/chat\.postMessage|files\.upload|\.send_message\b|sendmail|smtplib/, 'message/mail send'],
  [SEND_FN, 'message/mail send', 'code'],   // a name, so read in code only: prose names functions too
  [/\bgit\s+push\b|git-credential|installation.token/, 'git push'],
  [/docker\s+(?:run|exec|create|rm|kill)\b|docker_provision|DockerClient/, 'docker control'],
];

for (const f of files) {
  const r = rel(f);
  const base = basename(f);
  const ls = lines(f);
  // a run's own artifacts and test fixtures declare nothing: a committed run's map/raw/enumerate.json
  // names every constant enumerate set apart, and would read each as declared in config (#292)
  const isEnvOrCfg = (/\.(env|ini|cfg|conf|ya?ml|toml|json)$/.test(base) || /\.env/.test(base) || base.startsWith('.env')) && !/(^|\/)(?:tests?|runs)\//.test(r);
  const isCode = /\.(?:[mc]?[jt]sx?|py|rb|go|java|kt|rs|php)$/.test(base);
  const effectReadable = !/\.md$/.test(base) && !/(^|\/)(?:tests?|runs)\//.test(r);
  routeHandlers(r, ls);
  serverRoutes(r, ls);
  codeSecrets(r, ls, isCode);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (line.length > 2000) continue;

    // 1. secrets — env-var-shaped credential names anywhere; strongest signal in .env/config
    let m;
    SECRET_NAME.lastIndex = 0;
    while ((m = SECRET_NAME.exec(line))) {
      hit('secrets', m[1], r, i, isEnvOrCfg ? 'declared in env/config' : 'referenced in code');
      secretSite(m[1], r, i, line, isEnvOrCfg, isCode, ls);
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

    // 6. effect call sites — read where code runs: a doc restates a call and makes none, and a test
    //    or a run's own artifacts (a committed sweep's terrain.md, raw/enumerate.json, triage) quote
    //    one. With members keyed per file (#272) each such file would be its own triage entry.
    if (effectReadable) for (const [re, note, only] of EFFECT) if ((only !== 'code' || isCode) && /** @type {RegExp} */ (re).test(line)) hit('effectSites', /** @type {string} */ (note), r, i, /** @type {string} */ (note));

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

// 9. change gates (#286) — the checks a change passes through before it lands or ships, read from
// the tree as written, never run: one member per CI step (a GitHub Actions workflow's job steps,
// keyed `ci step: <workflow>/<job>: <step>`; a job with no steps, a reusable workflow call, is
// one `ci job:` member), one per hook (.husky/, .githooks/, a pre-commit or lefthook config, a
// package.json hooks block), and one per package.json script named for a check (test, lint,
// typecheck, check, verify, validate, audit, or a `:`-variant of one). The member is the grain the
// census judges: a step's job timeout and the script it runs are read on that step's finding.
// Test files and runs/ are skipped: a fixture's workflow is not this repository's gate.
const GIT_HOOKS = 'applypatch-msg|pre-applypatch|post-applypatch|pre-commit|pre-merge-commit|prepare-commit-msg|commit-msg|post-commit|pre-rebase|post-checkout|post-merge|pre-push|pre-receive|update|post-receive|post-update|push-to-checkout|pre-auto-gc|post-rewrite';
const CHECK_SCRIPT = /^(?:test|lint|typecheck|type-check|check|verify|validate|audit|format:check|fmt:check)(?::[\w:.-]+)?$|^(?:lint|test|check|verify|validate|typecheck):/;
const indentOf = (l) => l.length - l.trimStart().length;
const blank = (l) => !l.trim() || /^\s*#/.test(l);
const unquote = (v) => v.trim().replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
function workflowGates(r, ls) {
  const wf = basename(r);
  const jobsAt = ls.findIndex((l) => /^jobs:\s*(?:#.*)?$/.test(l));
  if (jobsAt < 0) return;
  let jobIndent = -1;
  for (let i = jobsAt + 1; i < ls.length; i++) {
    const l = ls[i];
    if (blank(l)) continue;
    const ind = indentOf(l);
    if (ind === 0) break;                         // the next top-level key ends jobs:
    if (jobIndent < 0) jobIndent = ind;
    if (ind !== jobIndent) continue;
    const jm = l.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(?:#.*)?$/);
    if (!jm) continue;
    const job = jm[1];
    let end = i + 1;
    while (end < ls.length && (blank(ls[end]) || indentOf(ls[end]) > jobIndent)) end++;
    const body = ls.slice(i + 1, end);
    const stepsRel = body.findIndex((x) => /^\s*steps:\s*(?:#.*)?$/.test(x));
    const seen = new Map();
    const add = (label, at) => {
      const key = `ci step: ${wf}/${job}: ${label}`;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      hit('changeGates', n > 1 ? `${key} #${n}` : key, r, at, 'a CI step a change passes through: does it go red when what it needs is absent, or never finishes?');
    };
    if (stepsRel < 0) {
      hit('changeGates', `ci job: ${wf}/${job}`, r, i, 'a CI job with no steps of its own (a reusable workflow call): does it go red when what it needs is absent?');
    } else {
      const stepsIndent = indentOf(body[stepsRel]);
      let itemIndent = -1;
      for (let k = stepsRel + 1; k < body.length; k++) {
        const x = body[k];
        if (blank(x)) continue;
        const ind = indentOf(x);
        if (ind <= stepsIndent && !/^\s*-\s/.test(x)) break;
        if (!/^\s*-\s/.test(x)) continue;
        if (itemIndent < 0) itemIndent = ind;
        if (ind !== itemIndent) continue;
        // the step's own keys: the item line, and the lines indented under it
        let e = k + 1;
        while (e < body.length && (blank(body[e]) || indentOf(body[e]) > itemIndent)) e++;
        const keys = {};
        const step = [x.replace(/^(\s*)-\s/, '$1  '), ...body.slice(k + 1, e)];
        const keyIndent = itemIndent + 2;
        step.forEach((y, j) => {
          const km = y.match(/^(\s*)(name|run|uses)\s*:\s*(.*)$/);
          if (!km || km[1].length !== keyIndent || keys[km[2]] !== undefined) return;
          let v = km[3];
          if (/^[|>][-+]?\s*(?:#.*)?$/.test(v.trim())) v = (step.slice(j + 1).find((z) => !blank(z)) || '').trim();
          keys[km[2]] = unquote(v);
        });
        const label = keys.name || keys.run || (keys.uses ? keys.uses.replace(/@.*$/, '') : '') || `step ${k - stepsRel}`;
        add(label.replace(/\s+/g, ' ').slice(0, 80), i + 1 + k);
        k = e - 1;
      }
    }
    i = end - 1;
  }
}
function hookGates(r, ls) {
  const b = basename(r);
  if (/^\.husky\/[^/_.][^/]*$/.test(r)) hit('changeGates', `hook: ${b} (.husky)`, r, 0, 'a git hook a commit or push runs: does it go red when what it needs is absent?');
  if (/^\.githooks\/[^/.][^/]*$/.test(r)) hit('changeGates', `hook: ${b} (.githooks)`, r, 0, 'a git hook a commit or push runs: does it go red when what it needs is absent?');
  if (/^\.pre-commit-config\.ya?ml$/.test(r)) ls.forEach((l, i) => {
    const m = l.match(/^\s*-\s*id\s*:\s*(\S+)/);
    if (m) hit('changeGates', `hook: pre-commit ${unquote(m[1])}`, r, i, 'a pre-commit hook: does it go red when what it needs is absent?');
  });
  if (/^\.?lefthook\.ya?ml$/.test(r)) ls.forEach((l, i) => {
    const m = l.match(new RegExp(`^(${GIT_HOOKS})\\s*:`));
    if (m) hit('changeGates', `hook: ${m[1]} (lefthook)`, r, i, 'a git hook lefthook runs: does it go red when what it needs is absent?');
  });
}
function packageGates(r, ls) {
  if (basename(r) !== 'package.json') return;
  let pkg;
  try { pkg = JSON.parse(ls.join('\n')); } catch { return; }
  const lineOf = (key, from = 0) => { const i = ls.findIndex((l, j) => j >= from && l.includes(JSON.stringify(key))); return i < 0 ? 0 : i; };
  const at = r === 'package.json' ? '' : ` (${r})`;
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
  const from = lineOf('scripts');
  for (const name of Object.keys(scripts)) if (CHECK_SCRIPT.test(name))
    hit('changeGates', `script: ${name}${at}`, r, lineOf(name, from), 'a config-driven check (a package script named for one): does it go red when what it needs is absent?');
  for (const block of ['simple-git-hooks', 'husky']) {
    const o = pkg && pkg[block];
    const hooks = block === 'husky' ? o && o.hooks : o;
    if (hooks && typeof hooks === 'object') for (const h of Object.keys(hooks)) if (new RegExp(`^(?:${GIT_HOOKS})$`).test(h))
      hit('changeGates', `hook: ${h} (package.json ${block})`, r, lineOf(h, lineOf(block)), 'a git hook declared in package.json: does it go red when what it needs is absent?');
  }
}

// 10. model call sites (#286) — a file that calls a model through a provider's SDK or HTTP API,
// one member per file (`model call: <path>`), every import, call and endpoint line its evidence.
// Each pattern names a provider's published package, method or endpoint so the tree can be read
// for it; none names a scanner (CLAUDE.md rule 7). A literal `.` or `(` is written `[.]` / `[(]`
// so this file's own patterns are not a call site. Test files and runs/ are skipped.
const MODEL_IMPORT = /(?:from\s+|require\(\s*|import\(\s*|import\s+)['"](?:@anthropic-ai\/[\w-]+|openai|@google\/(?:generative-ai|genai)|@google-cloud\/vertexai|@mistralai\/[\w-]+|cohere-ai|groq-sdk|ollama|ai|@ai-sdk\/[\w-]+|@aws-sdk\/client-bedrock-runtime)['"]|^\s*(?:import|from)\s+(?:anthropic|openai|google\.generativeai|google\.genai|mistralai|cohere|groq|ollama|litellm)\b|^\s*from\s+google\s+import\s+genai\b/;
const MODEL_CALL = /[.]messages[.](?:create|stream)\s*[(]|[.]chat[.]completions[.](?:create|stream|parse)\s*[(]|[.]responses[.](?:create|stream)\s*[(]|\bChatCompletion[.]create\s*[(]|[.]generateContent(?:Stream)?\s*[(]|\b(?:generateText|streamText|generateObject|streamObject)\s*[(]|\bInvoke(?:Model|ModelWithResponseStream)Command\b|\blitellm[.]completion\s*[(]/;
const MODEL_ENDPOINT = /\bapi\.anthropic\.com\b|\bapi\.openai\.com\b|\bgenerativelanguage\.googleapis\.com\b|\bapi\.mistral\.ai\b|\bapi\.groq\.com\b|\bapi\.cohere\.(?:ai|com)\b|\bbedrock-runtime\.[\w-]+\.amazonaws\.com\b/;

for (const f of files) {
  const r = rel(f), b = basename(f);
  if (isTestFile(r, b) || /(^|\/)runs\//.test(r)) continue;
  const ls = lines(f);
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(r)) workflowGates(r, ls);
  hookGates(r, ls);
  packageGates(r, ls);
  if (/\.(?:[mc]?[jt]sx?|py)$/.test(b)) ls.forEach((l, i) => {
    if (l.length > 2000) return;
    if (MODEL_IMPORT.test(l) || MODEL_CALL.test(l) || MODEL_ENDPOINT.test(l)) hit('modelCalls', `model call: ${r}`, r, i, 'a model call site: does it emit one structured record of its tier, spend and outcome?');
  });
}

// ── output ──
const LABEL = {
  secrets: 'SECRETS (→ credential census: each below/above the prompt boundary?)',
  secretConstants: 'SECRET-NAMED CONSTANTS (shape filter: an identifier or constant, not a credential — recall only)',
  changeGates: 'CHANGE GATES (→ change-gates census: does each go red when what it needs is absent or never finishes?)',
  modelCalls: 'MODEL CALL SITES (→ model-call census: does each call emit a structured record of tier, spend and outcome?)',
  routeHandlers: 'ROUTE HANDLERS (→ HTTP surface: assess each handler\'s auth, input and effects)',
  socketMounts: 'SOCKET / PRIVILEGE MOUNTS (→ blast-scope: does it escape the tenant ceiling?)',
  contracts: 'INTERFACE CONTRACTS (→ deterministic-gates/verification: does it fail loud?)',
  reportPaths: 'EFFECT-vs-REPORT PATHS (→ verification: is success asserted over a failed effect?)',
  egressControls: 'NETWORK-EGRESS CONTROLS (→ delegation: enumerate each, strength or gap)',
  effectSites: 'EFFECT CALL SITES (→ delegation: does each map to an enumerated effect channel?)',
  containerClasses: 'CONTAINER / AGENT CLASSES (→ assess EACH class separately — admin ≠ user)',
  channelCandidates: 'CHANNEL CANDIDATES (→ terrain effect inventory: derive it from THIS, not memory)',
};
const order = ENUMERATE_POPULATIONS;

const JSON_MODE = process.argv.includes('--json');   // suppress the pretty enumeration; emit only JSON

// --json without --run: the populations as data (#259). `assay start` writes this into the run
// (lib/run-layout.mjs enumeratePath), and the run's channel candidates are the population the
// effect-channel triage closes (map/SCHEMA.md §6e). One entry per member, keyed as the readable
// print keys it; evidence and files are target-relative, and the target is named by its
// directory's name only — a local path describes the machine, not the run.
function populationsJson() {
  const out = {};
  for (const pop of order) {
    const members = new Map();
    for (const [k, v] of pops[pop]) {
      const mem = v.member || k;
      if (!members.has(mem)) members.set(mem, { member: mem, note: v.note, gateable: false, evidence: new Set() });
      const g = members.get(mem);
      for (const e of v.evidence) g.evidence.add(e);
      if (v.gateable) g.gateable = true;
    }
    out[pop] = [...members.values()].sort((a, b) => a.member.localeCompare(b.member))
      .map((g) => ({ member: g.member, note: g.note, gateable: g.gateable, evidence: [...g.evidence].sort() }));
  }
  return { schema: 'enumerate', version: 1, target: basename(resolve(target)), files: files.length, populations: out };
}
if (JSON_MODE && !runDir) {
  process.stdout.write(JSON.stringify(populationsJson(), null, 2) + '\n');
  process.exit(0);
}

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
