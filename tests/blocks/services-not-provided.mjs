// ── a declared service this measurement did not provide reads not measured (#256) ──
// No docker needed. The fixture declares Postgres for its test and migrate steps. Without the
// opt-in (`--services`), or with it but no container runtime, those steps read `skipped`, "needs
// postgres, which this measurement did not provide (…)", and d-tests-execute-core and
// d-schema-versioned read not measured, never unmet. Without the declaration, nothing changes:
// the same suite, refusing to run without its database, reads `failed`, and the row unmet.
import { rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureRun } from '../../yardstick/measure.mjs';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { projectMulti } from '../../map/project.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'services-not-provided';

export async function run() {
  const fail = (m) => negFailures.push('services-not-provided: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-services');
  const ran = [{ scanner: 'fresh-clone', status: 'ran' }];
  const measure = (doc) => {
    const rows = convert('fresh-clone', JSON.stringify(doc), doc.exit);
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`every row maps (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    return { rows, m: Object.fromEntries(measureRun({ findings: rows, manifest: ran, inputs: null, coverage: {} }).map((r) => [r.id, r])) };
  };
  const cases = [
    ['declared, no opt-in', { services: false }, /fresh-clone ran without --services/],
    ['declared, opted in, no container runtime', { services: true, runtime: join(fx, 'no-such-runtime') }, /no container runtime/],
  ];
  for (const [what, opts, why] of cases) {
    const doc = runFreshClone({ target: fx, clone: false, timeout: 120, ...opts });
    const st = Object.fromEntries(doc.steps.map((s) => [s.name, s]));
    for (const s of ['test', 'migrate']) {
      if (st[s]?.status !== 'skipped') fail(`${what}: ${s} must read skipped (got ${st[s]?.status})`);
      else if (!/^needs postgres, which this measurement did not provide/.test(st[s].reason) || !why.test(st[s].reason)) fail(`${what}: ${s}'s reason says what it needs and why it was not provided (got ${st[s].reason})`);
      if (st[s]?.services) fail(`${what}: a step that did not run names no services it ran with`);
    }
    if (doc.services?.provided !== false || doc.services?.requested !== !!opts.services || (doc.services?.containers || []).length) fail(`${what}: the report says the services were not provided, and started none (got ${JSON.stringify(doc.services)})`);
    if (doc.exit !== 0) fail(`${what}: a step not measured is no failure (exit ${doc.exit})`);
    const { rows, m } = measure(doc);
    const facts = rows.filter((r) => r.polarity === 'fact').map((r) => r.native_category).sort().join(',');
    if (facts !== 'migrate-not-run,test-not-run') fail(`${what}: one not-run fact per bound step (got ${facts})`);
    if (rows.some((r) => ['test', 'migrate'].includes(r.native_category))) fail(`${what}: no test or migrate gap is charged`);
    for (const id of ['d-tests-execute-core', 'd-schema-versioned']) {
      if (m[id]?.status !== 'not-measured') fail(`${what}: ${id} reads not-measured (got ${m[id]?.status}: ${m[id]?.note})`);
      else if (!/did not provide/.test(m[id].note)) fail(`${what}: ${id}'s note carries the reason (got ${m[id].note})`);
    }
  }
  // undeclared: the same suite refuses to run without its database, and reads failed
  const scratch = mkdtempSync(join(tmpdir(), 'assay-services-undeclared-'));
  cpSync(fx, scratch, { recursive: true });
  rmSync(join(scratch, '.assay'), { recursive: true, force: true });
  const doc = runFreshClone({ target: scratch, clone: false, timeout: 120, services: true });
  rmSync(scratch, { recursive: true, force: true });
  const test = doc.steps.find((s) => s.name === 'test');
  if (test?.status !== 'failed' || doc.services !== undefined) fail(`undeclared, a failing test still reads failed, with no services entry (got ${test?.status}, ${JSON.stringify(doc.services)})`);
  const { m } = measure(doc);
  if (m['d-tests-execute-core']?.status !== 'unmet') fail(`undeclared, d-tests-execute-core reads unmet (got ${m['d-tests-execute-core']?.status})`);
  if (m['d-schema-versioned']?.status !== 'unmet') fail(`undeclared, a migrate with no dry form reads unmet, as before (got ${m['d-schema-versioned']?.status})`);
}
