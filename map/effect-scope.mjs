// effect-scope.mjs — whether a listed effect candidate is in scope, by a closed rule (#315 slice 1;
// map/SCHEMA.md §6e, "Scope, by a closed rule").
//
// The effect triage closes the list enumerate writes (map/effect-triage.mjs): one entry per
// candidate, an effect finding or out of scope. Which way a candidate goes was each lane's reading,
// and lanes parted on it (a CI deploy step, a vendor client, a contract test, a read-only route, a
// build-time spawn). The rule is decided here, once:
//   • out by construction: a candidate in a test or fixture file (testOrFixture). enumerate lists it
//     under `excluded` with the reason and never offers it; validate refuses a triage that maps one in;
//   • in by construction: a workflow write (#298's kinds). It acts on the world whatever gates it, and
//     its gate is a descriptor, not a scope question; validate refuses triaging one out;
//   • the stated rule for the rest: each entry names the clause that decided it (CLAUSES), the
//     clause must be one for the candidate's kind and on the entry's side (a finding is in, out of
//     scope is out), and where the member itself carries the signal (a route's method) the clause
//     the signal gives is the only one that holds.
// The tree decides where it carries the signal; elsewhere the lane applies the clause and validate
// holds it to the closed set. Nothing here reads a descriptor or decides a requirement.

// ── out by construction ──────────────────────────────────────────────────────
// A test or fixture file, by its path: the first shape that matches is the reason. A contract test
// is read by its name (a `contract-test`, `contract_tests`, `.contract.test.`, `test-contract`, a
// pact file), first, so it is named as one though it is also a `*.test.*` file.
/** @type {[RegExp, string][]} */
const TEST_SHAPES = [
  [/(?:^|[-_./])contracts?[-_.]?(?:tests?|specs?)(?:[-_./]|$)|(?:^|[-_./])(?:tests?|specs?)[-_.]?contracts?(?:[-_./]|$)|(?:^|[-_./])pacts?(?:[-_./]|$)/i, 'a contract test (by its name)'],
  [/(?:^|\/)__tests__\//, 'under a __tests__/ directory'],
  [/(?:^|\/)(?:__)?fixtures?(?:__)?\//, 'under a fixtures/ directory'],
  [/(?:^|\/)tests?\//, 'under a test/ or tests/ directory'],
  [/(?:^|\/)[^/]+\.test\.[^/]+$/, 'a test file (*.test.*)'],
  [/(?:^|\/)[^/]+\.spec\.[^/]+$/, 'a spec file (*.spec.*)'],
  [/(?:^|\/)test[-_][^/]+$|(?:^|\/)[^/]+_test\.[^/]+$/, 'a test file (test-*, test_* or *_test.*)'],
];
/** The reason a path is a test or fixture file, or null. @param {string} path @returns {string|null} */
export function testOrFixture(path) {
  const p = String(path || '').replace(/\\/g, '/');
  for (const [re, why] of TEST_SHAPES) if (re.test(p)) return why;
  return null;
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
 * workflow write triaged out. Holds in every triage version (#315: no stored run triaged against it).
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
