// ── fresh-clone: an undeclared build reads unmet, the same as lint/typecheck/test ──
// Before this fix, "build undeclared -> met" was the one floor step that quietly
// read met on absence while lint/typecheck/test already read unmet on the same
// absence — inconsistent, and exactly the honesty gap Andy's review found.
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures, convert } from '../harness.mjs';

export const label = 'fresh-clone-build-floor';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone-build-floor: ' + m);
  const baseDoc = {
    tool: 'fresh-clone', version: '0.2.0', started_at: 't1', finished_at: 't2',
    target: { path: 'x', head: 'abc', cloned: true },
    toolchain: { family: 'node', manifest: 'package.json', package_manager: 'npm', lockfile: null, declared: {}, other_families: [], database_signals: [] },
    timeout_seconds: 600,
    steps: [
      { name: 'install', status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: 'no dependencies and no lockfile declared in package.json' },
      { name: 'build', status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: 'no "build" script in package.json' },
      { name: 'lint', status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: 'no "lint" script in package.json' },
      { name: 'typecheck', status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: 'no "typecheck" script in package.json' },
      { name: 'test', status: 'passed', command: 'npm test', exit_code: 0, duration_ms: 5 },
      { name: 'migrate', status: 'not-declared', command: null, exit_code: null, duration_ms: 0, output_tail: '', reason: 'no migrate / db:migrate script (nor a prisma migrate deploy / knex migrate:latest script) in package.json' },
    ],
    readme: 'README.md', readme_claims: [], workspaces: [],
    exit: 1,
  };
  const rows = convert('fresh-clone', JSON.stringify(baseDoc), 1);
  const build = rows.find((r) => r.native_category === 'build');
  if (!build) fail('an undeclared build step must now emit a gap row, the same as undeclared lint/typecheck');
  if (build && (build.polarity !== 'gap' || !/build/i.test(build.observation || ''))) fail(`the build gap row must read as a gap naming the build step (got ${JSON.stringify(build)})`);
  const cats = rows.map((r) => r.native_category).sort().join(',');
  if (cats !== 'build,lint,no-database-signal,typecheck') fail(`convert must yield build, lint, typecheck gap rows plus a no-database-signal fact — no migrate GAP row (no database signals) (got ${cats || '(none)'})`);
  // through the yardstick: d-fresh-clone-runs (category [install, build]) must now read unmet
  let reg = null;
  try { reg = loadYardstick(); } catch (e) { fail('yardstick failed to load: ' + e.message.split('\n')[0]); }
  if (reg) {
    const measured = measureRun({ findings: rows, manifest: [{ scanner: 'fresh-clone', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-fresh-clone-runs');
    if (measured?.status !== 'unmet') fail(`an undeclared build must read d-fresh-clone-runs unmet, not met (got ${measured?.status})`);
  }
}
