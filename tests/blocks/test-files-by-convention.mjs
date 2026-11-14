// ── a file is a test only by its tree's own convention, and a stored run's own enumeration decides
// its triage (#333; map/effect-scope.mjs, map/SCHEMA.md §6e) ──
// #328 put a candidate out of scope by construction when its file was named `test-*`, `test_*` or
// `*_test.*` in any language. A runtime adapter whose name begins with "test-" lost its effects
// (listed under `excluded`, never offered), and a stored run whose lane had mapped it in failed
// validate. The rule now:
//  1. a candidate is out by construction only where the tree's convention says its file is a test:
//     the language's test-runner naming (`*.test.*`, `*.spec.*` in JS/TS; `*_test.go`; `test_*.py`,
//     `*_test.py`), a test directory (`test/`, `tests/`, `__tests__/`, `fixtures/`) or a contract
//     test by name; and never a file a non-test module of the tree imports, whatever its name;
//  2. the stored enumeration decides: a version 1 triage is never refused for mapping a candidate
//     its own enumerate.json listed; a candidate that enumeration put under `excluded` is refused at
//     any version, and a version 2 triage against a list drawn before the rule is held to the rule
//     by its paths.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'test-files-by-convention';

const MEDIA = 'http write (js) @ src/adapters/test-media.ts';
const JOB = 'http write (js) @ src/jobs/test-cleanup.ts';
const SEED = 'http write (js) @ src/fixtures/seed.ts';
const HOOKS = 'http write @ pkg/test_hooks.py';
const INDEX = 'http write (js) @ src/index.ts';
const APP = 'http write @ pkg/app.py';
const EXCLUDED = {
  'http write (js) @ src/foo.test.ts': 'a test file (*.test.*)',
  'http write (js) @ src/bar.spec.js': 'a spec file (*.spec.*)',
  'http write (js) @ src/__tests__/baz.ts': 'under a __tests__/ directory',
  'http write @ pkg/test_thing.py': 'a Python test file (test_*.py or *_test.py)',
  'git push @ cmd/thing_test.go': 'a Go test file (*_test.go)',
  'http write (js) @ src/fixtures/unused.ts': 'under a fixtures/ directory',
};
const FOO = 'http write (js) @ src/foo.test.ts';

export async function run() {
  const fail = (m) => negFailures.push('test-files-by-convention: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-test-files-'));
  try {
    // (1) enumerate offers the runtime modules and lists each test file under excluded, with its reason
    const ej = assay('enumerate', join(HERE, 'enumerate-fixture', 'test-files-by-convention'), '--json');
    let doc = null;
    try { doc = JSON.parse(ej.stdout); } catch { /* reported below */ }
    const pops = doc && doc.populations;
    if (!pops) { fail(`enumerate --json must print the populations (exit ${ej.status})`); return; }
    const offered = ['channelCandidates', 'routeHandlers', 'effectSites'].flatMap((p) => pops[p].map((c) => c.member));
    const excluded = new Map((pops.excluded || []).map((c) => [c.member, c.reason]));
    if (!offered.includes(MEDIA)) fail(`a runtime module named test-media.ts, imported by src/index.ts, must stay a candidate offered for triage (excluded as ${JSON.stringify(excluded.get(MEDIA))})`);
    if (!offered.includes(JOB)) fail(`a runtime module named test-cleanup.ts that no module imports must stay a candidate: a test- name is no TypeScript runner's convention (excluded as ${JSON.stringify(excluded.get(JOB))})`);
    for (const m of [SEED, HOOKS]) if (!offered.includes(m)) fail(`"${m}": a file a non-test module imports is never a test file, whatever its path, and must be offered for triage (excluded as ${JSON.stringify(excluded.get(m))})`);
    for (const m of [INDEX, APP]) if (!offered.includes(m)) fail(`"${m}" must be offered for triage`);
    for (const [m, why] of Object.entries(EXCLUDED)) {
      if (offered.includes(m)) fail(`"${m}" is a test file by its tree's convention and must never be offered for triage`);
      if (excluded.get(m) !== why) fail(`"${m}" must be listed under excluded with the reason "${why}" (got ${JSON.stringify(excluded.get(m))})`);
    }

    // (2) a stored run: its own enumerate.json decides what its triage may map in
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    const site = (member, line) => ({ member, note: member.split(' @ ')[0], gateable: true, evidence: [`${member.split(' @ ')[1]}:${line}`] });
    const list = (sites, ex) => writeFileSync(enumeratePath(run), JSON.stringify({ schema: 'enumerate', version: 2, target: 'test-files-by-convention', files: 12,
      populations: { channelCandidates: [], routeHandlers: [], effectSites: sites, ...(ex ? { excluded: ex } : {}) } }));
    const ANSWERS = ['answers:', ...['refuses_unless', 'second_act', 'staged', 'person_act', 'declared_scope', 'rate_limit', 'disclosed'].map((k) => `  ${k}: { answer: no, evidence: ["server.mjs:5"] }`), '  received_or_gone: { answer: yes, evidence: ["server.mjs:5"] }', '  window: { answer: not-determinable }'];
    const triage = (version, entries) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: ${version}\ntriage:\n${entries.map((c) => `  - candidate: "${c}"\n    finding: F-053\n${(version >= 2 ? ['clause: client-call-runtime', ...ANSWERS] : []).map((l) => `    ${l}\n`).join('')}`).join('')}`);
    const validates = (want, re, what) => {
      const v = assay('validate', run);
      const out = v.stdout + v.stderr;
      const said = out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ');
      if (want && v.status !== 0) fail(`${what}: validate must pass (exit ${v.status}): ${said}`);
      if (!want && (v.status === 0 || !re.test(out))) fail(`${what}: validate must refuse it naming ${re} (exit ${v.status}): ${said}`);
    };
    const sites = [site(INDEX, 8), site(MEDIA, 3), site(SEED, 3)];
    const ex = [{ ...site(FOO, 2), population: 'effectSites', reason: 'a test file (*.test.*)' }];

    // a stored v1 triage maps in candidates its own enumeration listed, one of them in a fixtures/
    // file a runtime module imports: it validates, whatever the path rule says of its file
    list(sites, ex);
    triage(1, [INDEX, MEDIA, SEED]);
    validates(true, null, 'a stored version 1 triage that maps in candidates its own enumeration listed');
    // the same, against a list drawn before the rule (no excluded population)
    list(sites, null);
    validates(true, null, 'a stored version 1 triage that maps in candidates its own pre-rule enumeration listed');

    // a version 2 triage against a list that carries the rule: what the list offers, the list decided
    list(sites, ex);
    triage(2, [INDEX, MEDIA, SEED]);
    validates(true, null, 'a version 2 triage that maps in candidates its own enumeration listed under the rule');

    // a candidate the enumeration put under excluded is refused, at version 2 and at version 1
    triage(2, [INDEX, MEDIA, SEED, FOO]);
    validates(false, /"http write \(js\) @ src\/foo\.test\.ts" is out of scope by construction \(a test file \(\*\.test\.\*\)\)/, 'a version 2 triage that maps in a candidate its enumeration excluded');
    triage(1, [INDEX, MEDIA, SEED, FOO]);
    validates(false, /"http write \(js\) @ src\/foo\.test\.ts" is out of scope by construction \(a test file \(\*\.test\.\*\)\)/, 'a version 1 triage that maps in a candidate its enumeration excluded');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
