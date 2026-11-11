// ── the census populations a tool can list, enumerated (#286, M6 of #257) ──
// A census whose population the tree lists deterministically is closed by enumerate, as M1 closed
// the effects. enumerate --json lists two new populations, each pinned on its own fixture target:
//   (a) changeGates (tests/enumerate-fixture/gates): one member per CI step (`ci step:
//       <workflow>/<job>: <step>`, a repeated label numbered), a job with no steps as `ci job:`, a
//       hook (.husky/ but not its `_/` helpers, .githooks/, a pre-commit config's ids), and a
//       package script named for a check; a test directory's package.json lists nothing;
//   (b) modelCalls (tests/enumerate-fixture/models): one member per file that imports a provider's
//       SDK, calls a model or names a provider's endpoint, its lines the evidence; a file that only
//       keeps `messages`, a test file and a doc list nothing;
//   (c) enumerate's own patterns are not a model call site when it enumerates this repository.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'census-candidates-enumerated';

const GATES = [
  'ci job: ci.yml/release',
  'ci step: ci.yml/test: Install',
  'ci step: ci.yml/test: actions/checkout',
  'ci step: ci.yml/test: npm run lint',
  'ci step: ci.yml/test: npm test',
  'ci step: ci.yml/test: npm test #2',
  'hook: pre-commit (.husky)',
  'hook: pre-commit no-large-files',
  'hook: pre-push (.githooks)',
  'script: lint',
  'script: test',
  'script: test:unit',
  'script: typecheck',
];
const MODELS = { 'model call: app/chat.py': ['app/chat.py:1', 'app/chat.py:6'], 'model call: lib/llm.mjs': ['lib/llm.mjs:1', 'lib/llm.mjs:5'], 'model call: lib/raw.mjs': ['lib/raw.mjs:2'] };

export async function run() {
  const fail = (m) => negFailures.push('census-candidates-enumerated: ' + m);
  const enumerate = (dir) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'enumerate', dir, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    try { return JSON.parse(r.stdout).populations; } catch { fail(`enumerate --json over ${dir} must print the populations (exit ${r.status}): ${String(r.stderr).slice(0, 200)}`); return null; }
  };
  const sorted = (xs) => [...xs].sort((a, b) => a.localeCompare(b));

  // (a) change gates
  const g = enumerate(join(HERE, 'enumerate-fixture', 'gates'));
  if (g) {
    const got = (g.changeGates || []).map((m) => m.member);
    if (JSON.stringify(sorted(got)) !== JSON.stringify(sorted(GATES))) fail(`changeGates over the gates fixture must list each CI step, step-less job, hook and check script once (want ${GATES.join(' | ')}; got ${got.join(' | ') || 'none'})`);
    const step = (g.changeGates || []).find((m) => m.member === 'ci step: ci.yml/test: npm run lint');
    if (step && JSON.stringify(step.evidence) !== JSON.stringify(['.github/workflows/ci.yml:14'])) fail(`a CI step's evidence is its own item line (got ${step.evidence})`);
    if (got.some((m) => /husky\.sh|a-test-fixture|build|start/.test(m))) fail(`husky's helper, a test directory's scripts and a script not named for a check are no change gate (got ${got.join(' | ')})`);
  }

  // (b) model call sites
  const m = enumerate(join(HERE, 'enumerate-fixture', 'models'));
  if (m) {
    const got = Object.fromEntries((m.modelCalls || []).map((x) => [x.member, x.evidence]));
    if (JSON.stringify(sorted(Object.keys(got))) !== JSON.stringify(sorted(Object.keys(MODELS)))) fail(`modelCalls over the models fixture must list each calling file once, no test file, doc or messages list (want ${Object.keys(MODELS).join(' | ')}; got ${Object.keys(got).join(' | ') || 'none'})`);
    for (const [k, ev] of Object.entries(MODELS)) if (got[k] && JSON.stringify(got[k]) !== JSON.stringify(ev)) fail(`${k}: its evidence is every import, call and endpoint line (want ${ev}; got ${got[k]})`);
  }

  // (c) this repository: enumerate's own patterns are no call site, and the gates are its own CI
  const self = enumerate(ROOT);
  if (self) {
    if ((self.modelCalls || []).some((x) => /map\/enumerate\.mjs/.test(x.member))) fail('enumerate lists its own model-call patterns as a model call site');
    if ((self.changeGates || []).some((x) => /enumerate-fixture/.test(x.evidence.join(' ')))) fail('a fixture under tests/ is listed as one of this repository\'s change gates');
    if (!(self.changeGates || []).some((x) => x.member === 'ci step: ci.yml/test: npm test')) fail('this repository\'s own CI test step is a change gate (ci step: ci.yml/test: npm test)');
  }
}
