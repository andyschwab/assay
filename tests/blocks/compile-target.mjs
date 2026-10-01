// ── compile's gate checks citations against the target when it has one (#52) ──
// compile forwards --target to validate, so a citation to a line the target's file does
// not have halts the package, not only `assay start` and the routine.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'compile-target';

export async function run() {
  const fail = (m) => negFailures.push('compile-target: ' + m);
  const fx = join(HERE, 'negative', 'evidence-line-past-end');
  const tmp = mkdtempSync(join(tmpdir(), 'assay-compile-target-'));
  cpSync(join(fx, 'map'), join(tmp, 'map'), { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), tmp, '--target', join(fx, 'target')], { encoding: 'utf8' });
  const out = String(r.stdout || '') + String(r.stderr || '');
  if (r.status === 0) fail('compile --target over a citation past the end of its file must fail at the validate gate (it compiled)');
  else if (!/evidence line 9 is past the end of lib\/agent\.mjs/.test(out)) fail(`compile --target must fail at the validate gate for the cited line (got exit ${r.status}: ${out.split('\n').slice(-6).join(' | ')})`);
  if (existsSync(join(tmp, 'INDEX.md'))) fail('compile --target must write no package over a base whose citations do not resolve');
  rmSync(tmp, { recursive: true, force: true });
}
