// effect-scope.mjs — whether a listed effect candidate is in scope, by a closed rule (#315 slice 1;
// map/SCHEMA.md §6e, "Scope, by a closed rule").
//
// The effect triage closes the list enumerate writes (map/effect-triage.mjs): one entry per
// candidate, an effect finding or out of scope. Which way a candidate goes was each lane's reading,
// and lanes parted on it (a CI deploy step, a vendor client, a contract test, a read-only route, a
// build-time spawn). The rule is decided here, once:
//   • out by construction: a candidate in a test or fixture file, by the tree's own convention
//     (testOrFixture) and never in a file a non-test module imports (runtimeImported). enumerate lists
//     it under `excluded` with the reason and never offers it; validate refuses a triage that maps one
//     in, as the run's own enumeration decided it (map/effect-triage.mjs);
//   • in by construction: a workflow write (#298's kinds). It acts on the world whatever gates it, and
//     its gate is a descriptor, not a scope question; validate refuses triaging one out;
//   • the stated rule for the rest: each entry names the clause that decided it (CLAUSES), the
//     clause must be one for the candidate's kind and on the entry's side (a finding is in, out of
//     scope is out), and where the member itself carries the signal (a route's method) the clause
//     the signal gives is the only one that holds.
// The tree decides where it carries the signal; elsewhere the lane applies the clause and validate
// holds it to the closed set. Nothing here reads a descriptor or decides a requirement.

// ── out by construction ──────────────────────────────────────────────────────
// A test or fixture file, by the tree's own convention (#333): the first shape that matches is the
// reason. A name is a test's only in the language whose test runner reads that name: `*.test.*` and
// `*.spec.*` for JS/TS (Jest, Vitest, Mocha, node:test), `*_test.go` (the go tool), `test_*.py` and
// `*_test.py` (pytest, unittest discovery). A bare `test-` or `test_` prefix in any other language is
// no runner's convention, and names a runtime module as often as a test. A test directory (test/,
// tests/, __tests__/, fixtures/) is a test's in any language. A contract test is read by its name (a
// `contract-test`, `contract_tests`, `.contract.test.`, `test-contract`, a pact file), first, so it is
// named as one though it is also a `*.test.*` file.
// The path is half the rule: a file a non-test module of the tree imports is never a test file,
// whatever its path (runtimeImported, below); enumerate reads both, and the run keeps what it read.
const JS_TS = '(?:[mc]?[jt]sx?|mts|cts)';
/** @type {[RegExp, string][]} */
const TEST_SHAPES = [
  [/(?:^|[-_./])contracts?[-_.]?(?:tests?|specs?)(?:[-_./]|$)|(?:^|[-_./])(?:tests?|specs?)[-_.]?contracts?(?:[-_./]|$)|(?:^|[-_./])pacts?(?:[-_./]|$)/i, 'a contract test (by its name)'],
  [/(?:^|\/)__tests__\//, 'under a __tests__/ directory'],
  [/(?:^|\/)(?:__)?fixtures?(?:__)?\//, 'under a fixtures/ directory'],
  [/(?:^|\/)tests?\//, 'under a test/ or tests/ directory'],
  [new RegExp(`(?:^|/)[^/]+\\.test\\.${JS_TS}$`), 'a test file (*.test.*)'],
  [new RegExp(`(?:^|/)[^/]+\\.spec\\.${JS_TS}$`), 'a spec file (*.spec.*)'],
  [/(?:^|\/)[^/]+_test\.go$/, 'a Go test file (*_test.go)'],
  [/(?:^|\/)test_[^/]+\.py$|(?:^|\/)[^/]+_test\.py$/, 'a Python test file (test_*.py or *_test.py)'],
];
/** The reason a path is a test or fixture file by its name and directory, or null. @param {string} path @returns {string|null} */
export function testOrFixture(path) {
  const p = String(path || '').replace(/\\/g, '/');
  for (const [re, why] of TEST_SHAPES) if (re.test(p)) return why;
  return null;
}

// ── a file a non-test module imports is never a test file ────────────────────
// Read off the tree, deterministically: from every code file whose path is not a test's, follow its
// imports to the files of the tree they name, and from those on (a helper a runtime-imported fixture
// imports runs at run time too). An import is read where the language names a file by it:
//   • JS/TS: a relative specifier (`./x`, `../x`) of `import … from`, `export … from`, a bare
//     `import '…'`, `import(…)` or `require(…)`, resolved as node and TypeScript resolve it (the
//     path as written; `.js` written for a `.ts` source; an added extension; `<dir>/index.*`);
//   • Python: `from <module> import <names>` and `import <module>`, relative (leading dots, from the
//     importer's package) or absolute (any file of the tree whose path ends in the dotted module);
//     for `from <package> import <name>`, the submodule `<package>/<name>.py` too.
// Go needs no reading: the go tool never compiles a `_test.go` file into a non-test package. A
// reading that names a file too many keeps a candidate in scope, never drops one.
const JS_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_FILE = new RegExp(`\\.${JS_TS}$`);
const JS_SPEC = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]*)['"]|\brequire\(\s*['"](\.{1,2}\/[^'"]*)['"]\s*\)/g;
const PY_FROM = /^\s*from\s+(\.*)([\w.]*)\s+import\s+\(?\s*([\w\s,]+)/;
const PY_IMPORT = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/;
const CODE = /\.(?:[mc]?[jt]sx?|mts|cts|py|rb|go|java|kt|rs|php)$/;
const norm = (p) => { const out = []; for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); } return out.join('/'); };
const dirOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';

/** The files of the tree one file imports, by the readings above. @param {string} path @param {string} text @param {Set<string>} tree @param {Map<string,string[]>} pyBySuffix */
function importsOf(path, text, tree, pyBySuffix) {
  const out = new Set();
  if (JS_FILE.test(path)) {
    for (const m of text.matchAll(JS_SPEC)) {
      const base = norm(`${dirOf(path)}/${m[1] || m[2]}`);
      const stem = base.replace(/\.[mc]?jsx?$/, '');
      for (const c of [base, ...JS_EXT.map((e) => stem + e), ...JS_EXT.map((e) => `${base}/index${e}`)]) if (tree.has(c)) out.add(c);
    }
  } else if (path.endsWith('.py')) {
    const mod = (dots, name) => {
      const parts = name ? name.split('.') : [];
      if (dots) { let d = dirOf(path); for (let i = 1; i < dots; i++) d = dirOf(d); const b = norm([d, ...parts].join('/')); return [b ? `${b}.py` : '', `${b}/__init__.py`].filter((c) => tree.has(c)); }
      return parts.length ? [...(pyBySuffix.get(`${parts.join('/')}.py`) || []), ...(pyBySuffix.get(`${parts.join('/')}/__init__.py`) || [])] : [];
    };
    for (const line of text.split('\n')) {
      let m = PY_FROM.exec(line);
      if (m) {
        const dots = m[1].length, name = m[2];
        for (const c of mod(dots, name)) out.add(c);
        for (const n of m[3].split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)) for (const c of mod(dots, name ? `${name}.${n}` : n)) out.add(c);
        continue;
      }
      m = PY_IMPORT.exec(line);
      if (m) for (const n of m[1].split(',').map((s) => s.trim())) for (const c of mod(0, n)) out.add(c);
    }
  }
  return out;
}

/**
 * The test-shaped files of a tree that a non-test module imports, directly or through others it
 * imports: each is never a test file, whatever its path (#333).
 * @param {{ path: string, text: string }[]} files every file of the tree, its path relative to the root
 * @returns {Set<string>}
 */
export function runtimeImported(files) {
  const byPath = new Map(files.map((f) => [String(f.path).replace(/\\/g, '/'), f.text]));
  const tree = new Set(byPath.keys());
  const pyBySuffix = new Map();
  for (const p of tree) if (p.endsWith('.py')) { const s = p.split('/'); for (let i = 0; i < s.length; i++) { const k = s.slice(i).join('/'); pyBySuffix.set(k, [...(pyBySuffix.get(k) || []), p]); } }
  const reached = new Set(), queue = [...tree].filter((p) => CODE.test(p) && !testOrFixture(p));
  for (const p of queue) reached.add(p);
  while (queue.length) {
    const p = /** @type {string} */ (queue.shift());
    for (const q of importsOf(p, byPath.get(p) || '', tree, pyBySuffix)) if (!reached.has(q)) { reached.add(q); queue.push(q); }
  }
  return new Set([...reached].filter((p) => testOrFixture(p)));
}

// ── a candidate's kind, read off its member as enumerate writes it ───────────
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CLIENT_KINDS = new Set(['http write', 'http write (js)', 'message/mail send', 'git push', 'docker control']);
const SPAWN_KINDS = new Set(['shell exec', 'process spawn (js)']);
/**
 * The kind of a listed candidate: workflow (a workflow write), route (a route handler), client (an
 * outbound call site), spawn (a subprocess), or channel (an agentic channel candidate). null for a
 * member no clause covers (an effect-site kind this table does not know: a new kind lands with its
 * row here, or validate names it).
 * @param {string} member @returns {'workflow'|'route'|'client'|'spawn'|'channel'|null}
 */
export function kindOf(member) {
  const m = String(member || '');
  if (m.startsWith('route: ')) return 'route';
  if (/^(?:cli|skill|surface|tool|mcp-toolset): /.test(m)) return 'channel';
  const at = m.lastIndexOf(' @ ');
  const site = at > -1 ? m.slice(0, at) : m;
  if (/ \(workflow\)$/.test(site)) return 'workflow';
  if (CLIENT_KINDS.has(site)) return 'client';
  if (SPAWN_KINDS.has(site)) return 'spawn';
  return null;
}
/** A route member's method (`route: POST /x` → POST; ANY and ? → null). @param {string} member */
const routeMethod = (member) => { const m = /^route: (\S+) /.exec(String(member || '')); return m && (WRITE_METHODS.has(m[1]) || READ_METHODS.has(m[1])) ? m[1] : null; };

// ── the clauses: the closed set an entry's `clause` names ────────────────────
// kind: the candidates it can decide; side: in (the entry names a finding) or out (out_of_scope).
const CLAUSES = {
  'workflow-write': { kind: 'workflow', side: 'in', says: 'a workflow write is in scope by construction: it acts on the world whatever gates it' },
  'route-method-writes': { kind: 'route', side: 'in', says: 'a route whose method writes (POST, PUT, PATCH, DELETE; for ANY or ?, a write method the handler serves)' },
  'route-calls-write-site': { kind: 'route', side: 'in', says: 'a route whose handler calls a listed write site' },
  'route-reads-only': { kind: 'route', side: 'out', says: 'a route whose method reads and whose handler calls no listed write site' },
  'client-call-runtime': { kind: 'client', side: 'in', says: 'a client call site some importer of its module reaches at run time' },
  'client-call-test-or-build-only': { kind: 'client', side: 'out', says: 'a client call site every importer of whose module is test or build tooling' },
  'spawn-runtime': { kind: 'spawn', side: 'in', says: 'a spawn that runs at run time' },
  'spawn-build-time': { kind: 'spawn', side: 'out', says: 'a spawn that runs only at build or code-generation time, as a declared build script' },
  'channel-acts': { kind: 'channel', side: 'in', says: 'a channel whose invocation writes, sends or executes, or calls a listed write site' },
  'channel-reads-only': { kind: 'channel', side: 'out', says: 'a channel whose invocation only reads' },
};

/**
 * Why the construction rule refuses an entry, or null: a test or fixture candidate mapped in, or a
 * workflow write triaged out. The caller decides testReason from the run's own enumeration
 * (map/effect-triage.mjs triageErrors, #333); the workflow rule holds in every triage version.
 * @param {{ candidate: string, mappedIn: boolean, testReason: string|null }} e
 */
export function constructionError({ candidate, mappedIn, testReason }) {
  if (mappedIn && testReason) return `"${candidate}" is out of scope by construction (${testReason}): a candidate in a test or fixture file is never mapped to an effect finding`;
  if (!mappedIn && kindOf(candidate) === 'workflow') return `"${candidate}" is a workflow write, in scope by construction: it acts on the world whatever gates it (its gate is a descriptor, not a scope question), so it is never triaged out of scope`;
  return null;
}

/**
 * Why an entry's clause does not hold, or null (a triage at version 2 and up names one on every
 * entry). The clause is one of CLAUSES, for the candidate's kind, on the entry's side; a route
 * whose method writes is decided by route-method-writes and no other clause, and a route whose
 * method reads cannot claim it.
 * @param {{ candidate: string, mappedIn: boolean, clause: any }} e
 */
export function clauseError({ candidate, mappedIn, clause }) {
  const kind = kindOf(candidate);
  if (!kind) return `"${candidate}" is of a kind no scope clause covers (map/effect-scope.mjs kindOf): add its row before triaging it`;
  const fits = Object.entries(CLAUSES).filter(([, c]) => c.kind === kind && c.side === (mappedIn ? 'in' : 'out')).map(([k]) => k);
  if (typeof clause !== 'string' || !clause) return `"${candidate}" names no clause: the scope clause that decided it, for a ${kind} triaged ${mappedIn ? 'in' : 'out'}: ${fits.join(', ') || '(none: it is never triaged so)'}`;
  const c = CLAUSES[/** @type {keyof typeof CLAUSES} */ (clause)];
  if (!c) return `"${candidate}" names clause "${clause}", which is not a scope clause (${Object.keys(CLAUSES).join(', ')})`;
  if (c.kind !== kind) return `"${candidate}" is a ${kind}, and clause "${clause}" decides a ${c.kind}: ${fits.join(', ') || '(no clause)'} decide a ${kind} triaged ${mappedIn ? 'in' : 'out'}`;
  if (c.side !== (mappedIn ? 'in' : 'out')) return `"${candidate}" is triaged ${mappedIn ? 'to a finding' : 'out of scope'}, and clause "${clause}" puts a candidate ${c.side === 'in' ? 'in' : 'out of'} scope`;
  if (kind === 'route') {
    const method = routeMethod(candidate);
    if (method && WRITE_METHODS.has(method) && clause !== 'route-method-writes') return `"${candidate}": its method ${method} writes, so route-method-writes holds and decides it in scope; it is not triaged against it (by ${clause})`;
    if (method && READ_METHODS.has(method) && clause === 'route-method-writes') return `"${candidate}": its method ${method} reads, so route-method-writes does not hold; a read route is in scope only by route-calls-write-site`;
  }
  return null;
}
