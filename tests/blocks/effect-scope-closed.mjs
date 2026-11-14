// ── a listed candidate's scope is decided by a closed rule (#315 slice 1; map/effect-scope.mjs,
// map/SCHEMA.md §6e) ──
// Lanes parted on whether a listed candidate is in scope at all: a CI deploy step, a vendor client,
// a contract test, a read-only route. The rule is closed:
//  1. out by construction: a candidate in a test or fixture file (here a contract test, by its
//     name) is listed under `excluded` with the reason and never offered for triage, and validate
//     refuses a triage that maps one in (one the list excluded, or one a list drawn before the rule
//     still offers);
//  2. in by construction: a workflow write is never triaged out of scope, at any triage version;
//  3. the stated rule for the rest: at version 2 every entry names the clause that decided it, on
//     the entry's side and for the candidate's kind; a read-only GET route is triaged out by
//     route-reads-only and the clause is recorded, a POST route is decided by route-method-writes
//     and cannot be triaged against it, and a GET route cannot claim it;
//  4. a stored version 1 triage, which names no clause, reads as it was written.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { loadChannelFiles } from '../../map/effect-triage.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'effect-scope-closed';

const WORKFLOW = 'deploy/publish (workflow) @ .github/workflows/deploy.yml';
const CONTRACT = 'http write (js) @ src/clients/billing.contract-test.mjs';
const CLIENT = 'http write (js) @ src/clients/billing.mjs';
const SERVER = 'http write (js) @ server.mjs';
const GET = 'route: GET /relay/status';
const POST = 'route: POST /relay/send';

export async function run() {
  const fail = (m) => negFailures.push('effect-scope-closed: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-effect-scope-'));
  try {
    const target = join(HERE, 'enumerate-fixture', 'effect-scope');

    // (1) the contract test's write is excluded with its reason, and never offered
    const ej = assay('enumerate', target, '--json');
    let doc = null;
    try { doc = JSON.parse(ej.stdout); } catch { /* reported below */ }
    const pops = doc && doc.populations;
    if (!pops) { fail(`enumerate --json must print the populations (exit ${ej.status})`); return; }
    const offered = ['channelCandidates', 'routeHandlers', 'effectSites'].flatMap((p) => pops[p].map((c) => c.member));
    if (offered.includes(CONTRACT)) fail(`a write in a contract test must never be offered for triage (it is listed among the candidates)`);
    const ex = (pops.excluded || []).find((c) => c.member === CONTRACT);
    if (!ex || ex.population !== 'effectSites' || ex.reason !== 'a contract test (by its name)') fail(`a write in a contract test must be listed under excluded, from effectSites, with the reason "a contract test (by its name)" (got ${JSON.stringify(ex)})`);
    for (const m of [WORKFLOW, CLIENT, SERVER, GET, POST]) if (!offered.includes(m)) fail(`"${m}" must be offered for triage (candidates: ${offered.join(', ')})`);

    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    writeFileSync(enumeratePath(run), ej.stdout);
    const triage = (version, entries) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: ${version}\ntriage:\n${entries.map((x) => `  - candidate: "${x[0]}"\n${x.slice(1).map((l) => `    ${l}\n`).join('')}`).join('')}`);
    const validates = (want, re, what) => {
      const v = assay('validate', run);
      const out = v.stdout + v.stderr;
      if (want && v.status !== 0) fail(`${what}: validate must pass (exit ${v.status}): ${out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ')}`);
      if (!want && (v.status === 0 || !re.test(out))) fail(`${what}: validate must refuse it naming ${re} (exit ${v.status}): ${out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ')}`);
    };
    const complete = [
      [GET, 'out_of_scope: "reads only: returns the relay\'s status"', 'clause: route-reads-only'],
      [POST, 'finding: F-052', 'clause: route-method-writes'],
      [WORKFLOW, 'finding: F-053', 'clause: workflow-write'],
      [SERVER, 'finding: F-052', 'clause: client-call-runtime'],
      [CLIENT, 'finding: F-053', 'clause: client-call-runtime'],
    ];
    const swap = (cand, ...lines) => complete.map((x) => (x[0] === cand ? [cand, ...lines] : x));

    // (3) a complete triage at version 2, each entry with its clause, validates; the read-only GET
    // route is triaged out by route-reads-only, and the clause is recorded
    triage(2, complete);
    validates(true, null, 'a complete version 2 triage, every entry with the clause that decided it');
    const { triage: read, version } = loadChannelFiles(run);
    const get = (read || []).find((x) => x && x.candidate === GET);
    if (version !== 2 || !get || get.clause !== 'route-reads-only' || !get.out_of_scope) fail(`the read-only GET route's entry must record its clause, route-reads-only, out of scope (got version ${version}, ${JSON.stringify(get)})`);

    // (1) a triage that maps the excluded contract test in is refused
    triage(2, [...complete, [CONTRACT, 'finding: F-053', 'clause: client-call-runtime']]);
    validates(false, /"http write \(js\) @ src\/clients\/billing\.contract-test\.mjs" is out of scope by construction \(a contract test \(by its name\)\)/, 'a triage that maps the excluded contract test in');

    // (2) a workflow write triaged out of scope is refused, at either version
    triage(2, swap(WORKFLOW, 'out_of_scope: "a CI step, not the product"', 'clause: route-reads-only'));
    validates(false, /is a workflow write, in scope by construction/, 'a workflow write triaged out of scope (version 2)');
    triage(1, complete.map((x) => x.slice(0, 2)).map((x) => (x[0] === WORKFLOW ? [WORKFLOW, 'out_of_scope: "a CI step, not the product"'] : x)));
    validates(false, /is a workflow write, in scope by construction/, 'a workflow write triaged out of scope (version 1)');

    // (3) the clause must hold: named, on the entry's side, for the candidate's kind, and the one
    // the route's method gives where the method carries the signal
    triage(2, swap(GET, 'out_of_scope: "reads only"'));
    validates(false, /"route: GET \/relay\/status" names no clause/, 'a version 2 entry with no clause');
    triage(2, swap(GET, 'out_of_scope: "reads only"', 'clause: reads-only'));
    validates(false, /clause "reads-only", which is not a scope clause/, 'a clause outside the closed set');
    triage(2, swap(POST, 'out_of_scope: "a relay, not ours"', 'clause: route-reads-only'));
    validates(false, /"route: POST \/relay\/send": its method POST writes, so route-method-writes holds/, 'a POST route triaged out against route-method-writes');
    triage(2, swap(GET, 'finding: F-052', 'clause: route-method-writes'));
    validates(false, /"route: GET \/relay\/status": its method GET reads, so route-method-writes does not hold/, 'a GET route claiming route-method-writes');
    triage(2, swap(GET, 'finding: F-052', 'clause: route-calls-write-site'));
    validates(true, null, 'a GET route whose handler calls a listed write site, mapped in by route-calls-write-site');
    triage(2, swap(CLIENT, 'finding: F-053', 'clause: spawn-runtime'));
    validates(false, /is a client, and clause "spawn-runtime" decides a spawn/, 'a clause for another kind of candidate');
    triage(2, swap(CLIENT, 'out_of_scope: "vendor client"', 'clause: client-call-runtime'));
    validates(false, /clause "client-call-runtime" puts a candidate in scope/, 'an out-of-scope entry naming an in clause');

    // (4) a stored version 1 triage names no clause and reads as it was written
    triage(1, complete.map((x) => x.slice(0, 2)));
    validates(true, null, 'a stored version 1 triage with no clauses');
    triage(1, complete);
    validates(false, /unknown key "clause"/, 'a version 1 triage carrying version 2 keys');

    // (1) a list drawn before the rule still offers the contract test: mapping it in is refused
    const old = JSON.parse(readFileSync(enumeratePath(run), 'utf8'));
    old.version = 1;
    old.populations.effectSites.push({ member: CONTRACT, note: 'http write (js)', gateable: false, evidence: ['src/clients/billing.contract-test.mjs:3'] });
    delete old.populations.excluded;
    writeFileSync(enumeratePath(run), JSON.stringify(old));
    triage(1, [...complete.map((x) => x.slice(0, 2)), [CONTRACT, 'finding: F-053']]);
    validates(false, /is out of scope by construction \(a contract test \(by its name\)\)/, 'a stored list that offers the contract test, mapped in');
    triage(1, [...complete.map((x) => x.slice(0, 2)), [CONTRACT, 'out_of_scope: "a contract test"']]);
    validates(true, null, 'a stored list that offers the contract test, triaged out');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
