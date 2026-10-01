// ── a test step that passed with tests skipped says so (issue #30) ──
// An exit code of 0 is not the suite having run: a clean checkout with no database
// once read `test: passed` while 330 of 551 tests skipped themselves. The runner
// reads the common runners' own summary (vitest, jest, node:test, pytest, go test)
// into `tests: {passed, skipped, failed, total}` on the test step, or records
// `tests: 'unparsed'` when it cannot; the step status stays passed (the exit code is
// honest) and ingest adds one test gap row stating the skipped share.
import { join } from 'node:path';
import { run as runFreshClone, parseTestCounts } from '../../map/fresh-clone.mjs';
import { HERE, negFailures, viewSev, convert } from '../harness.mjs';

export const label = 'test-skips';

export async function run() {
  const fail = (m) => negFailures.push('test-skips: ' + m);
  const same = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  // (a) the summary parse, one known shape per runner, and an unknown one
  if (typeof parseTestCounts !== 'function') fail('map/fresh-clone.mjs must export parseTestCounts');
  else {
    same(parseTestCounts(' Test Files  33 passed | 19 skipped (52)\n      Tests  221 passed | 330 skipped (551)\n   Start at  10:00:00'), { passed: 221, skipped: 330, failed: 0, total: 551 }, 'vitest summary');
    same(parseTestCounts('\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m4 passed\u001b[39m\u001b[22m\u001b[90m (5)\u001b[39m'), { passed: 4, skipped: 0, failed: 1, total: 5 }, 'vitest summary with colour codes');
    same(parseTestCounts('Test Suites: 1 skipped, 2 passed, 2 of 3 total\nTests:       1 failed, 3 skipped, 2 passed, 6 total\nSnapshots:   0 total'), { passed: 2, skipped: 3, failed: 1, total: 6 }, 'jest summary');
    same(parseTestCounts('# tests 5\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 3\n# todo 0'), { passed: 2, skipped: 3, failed: 0, total: 5 }, 'node:test tap summary');
    same(parseTestCounts('ℹ tests 5\nℹ pass 2\nℹ fail 0\nℹ skipped 3\nℹ todo 0'), { passed: 2, skipped: 3, failed: 0, total: 5 }, 'node:test spec summary');
    same(parseTestCounts('============ 2 passed, 3 skipped in 0.12s ============'), { passed: 2, skipped: 3, failed: 0, total: 5 }, 'pytest summary');
    same(parseTestCounts('=== RUN   TestA\n--- PASS: TestA (0.00s)\n=== RUN   TestB\n--- SKIP: TestB (0.00s)\n    b_test.go:9: needs DATABASE_URL\n--- FAIL: TestC (0.00s)\nFAIL'), { passed: 1, skipped: 1, failed: 1, total: 3 }, 'go test -v');
    same(parseTestCounts('> x@0.0.0 test\n> node -e "process.exit(0)"\n'), null, 'an unrecognised runner');
  }
  // (b) the runner over the fixture: test passed, 2 passed and 3 skipped, exit 0
  const doc = runFreshClone({ target: join(HERE, 'instruments', 'fresh-clone-skips'), clone: false, timeout: 120 });
  const testStep = doc.steps.find((s) => s.name === 'test');
  if (testStep?.status !== 'passed') fail(`the fixture's test step exits 0 and must read passed — the status stays honest (got ${testStep?.status})`);
  same(testStep?.tests, { passed: 2, skipped: 3, failed: 0, total: 5 }, 'the fixture test step counts');
  if (doc.exit !== 0) fail(`skipped tests are not a failed step; the runner exit stays 0 (got ${doc.exit})`);
  // (c) convert: one test gap row stating the share skipped, citing the manifest, with a fix
  const rows = convert('fresh-clone', JSON.stringify(doc), 0);
  const skipRows = rows.filter((r) => r.native_category === 'test');
  if (skipRows.length !== 1) fail(`a passed test step with skips yields exactly one test row (got ${skipRows.length})`);
  const r = skipRows[0];
  if (r) {
    if (r.polarity !== 'gap' || r.severity || viewSev(r) !== 'Medium' || !r.fix) fail('the skipped-share row is a gap with a fix, banded Medium by the view');
    if (r.native_id !== 'test:skipped') fail(`the skipped-share row is keyed test:skipped (got ${r.native_id})`);
    if (!/passed, but 3 of 5 tests \(60%\) were skipped in a clean checkout/.test(r.observation)) fail(`the observation states the skipped share (got "${r.observation}")`);
    if (r.evidence?.[0] !== 'package.json:1') fail(`with no test config file, the row cites the manifest that declares the test script (got ${r.evidence?.[0]})`);
  }
  const withConfig = { ...doc, steps: doc.steps.map((s) => s.name === 'test' ? { ...s, test_config: 'vitest.config.ts' } : s), workspaces: [{ path: 'apps/api', toolchain: { manifest: 'package.json' }, steps: doc.steps.map((s) => s.name === 'test' ? { ...s, test_config: 'vitest.config.ts' } : s), readme: null, readme_claims: [] }] };
  same(convert('fresh-clone', JSON.stringify(withConfig), 0).filter((x) => x.native_category === 'test').map((x) => [x.native_id, x.evidence[0]]), [['test:skipped', 'vitest.config.ts:1'], ['apps/api:test:skipped', 'apps/api/vitest.config.ts:1']], 'with a test config, root and workspace rows cite it');
  const dbFix = convert('fresh-clone', JSON.stringify({ ...doc, toolchain: { ...doc.toolchain, database_signals: ['dep:pg'] } }), 0).find((x) => x.native_category === 'test')?.fix || '';
  if (!/database/i.test(dbFix) || !/test:db/.test(dbFix)) fail(`with a database in the tree, the fix names a database and a clean-clone way to provide one (got "${dbFix}")`);
  // (d) no skips, no row; counts unparsed, no row and the step says so
  const noSkips = { ...doc, steps: doc.steps.map((s) => s.name === 'test' ? { ...s, tests: { passed: 5, skipped: 0, failed: 0, total: 5 } } : s) };
  if (convert('fresh-clone', JSON.stringify(noSkips), 0).some((x) => x.native_category === 'test')) fail('a suite with no skips emits no test row');
  const target = runFreshClone({ target: join(HERE, 'instruments', 'fresh-clone-target'), clone: false, timeout: 120 });
  if (target.steps.find((s) => s.name === 'test')?.tests !== 'unparsed') fail('a test step whose runner summary cannot be read records tests: unparsed, so a reader knows the ratio was not checked');
  if (convert('fresh-clone', JSON.stringify(target), 1).some((x) => x.native_category === 'test')) fail('unparsed counts leave the status as is and emit no row');
  const badCounts = { ...doc, steps: doc.steps.map((s) => s.name === 'test' ? { ...s, tests: { passed: 'two' } } : s) };
  let threw = false; try { convert('fresh-clone', JSON.stringify(badCounts), 0); } catch { threw = true; }
  if (!threw) fail('malformed test counts must halt the converter (truncated report?)');
}
