// ── validate's messages name the fix: `record`/`start`, not just the problem ──
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'validate-hints';

export async function run() {
  const fail = (m) => negFailures.push('validate-hints: ' + m);
  const tmp = join(HERE, 'tmp-validate-hints'); rmSync(tmp, { recursive: true, force: true });

  // missing manifest → point at `assay start`
  mkdirSync(join(tmp, 'no-manifest', 'map', 'findings'), { recursive: true });
  writeFileSync(join(tmp, 'no-manifest', 'map', 'findings', 'repo-eval-legibility.yaml'), '[]\n');
  let out1 = '';
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(tmp, 'no-manifest')], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out1 = String(e.stderr); }
  if (!/node assay\.mjs start --out/.test(out1)) fail(`the missing-manifest error must name \`assay start\` (got:\n${out1})`);

  // status ran, no rows → point at `record ... skipped`
  const runA = join(tmp, 'ran-no-rows');
  mkdirSync(join(runA, 'map', 'findings'), { recursive: true });
  writeFileSync(join(runA, 'map', 'scanners.yaml'), 'engine: x\nscanners:\n  gitleaks:\n    status: ran\n');
  let out2 = '';
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), runA], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out2 = String(e.stderr); }
  if (!new RegExp(`node assay\\.mjs record ${runA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} gitleaks skipped`).test(out2))
    fail(`the ran-with-no-rows error must name \`record ... skipped\` (got:\n${out2})`);

  // status skipped, but rows present → point at `record ... ran`
  const runB = join(tmp, 'rows-not-ran');
  mkdirSync(join(runB, 'map', 'findings'), { recursive: true });
  writeFileSync(join(runB, 'map', 'findings', 'gitleaks.yaml'), [
    '- id: F-700', '  source: gitleaks', '  native_id: "x@a.js:1"', '  native_category: secret', '  polarity: gap',
    '  observation: x', '  evidence: [a.js:1]', '',
  ].join('\n'));
  writeFileSync(join(runB, 'map', 'scanners.yaml'), 'engine: x\nscanners:\n  gitleaks:\n    status: skipped\n    reason: "x"\n');
  let out3 = '';
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), runB], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out3 = String(e.stderr); }
  if (!new RegExp(`node assay\\.mjs record ${runB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} gitleaks ran`).test(out3))
    fail(`the skipped-but-rows-present error must name \`record ... ran\` (got:\n${out3})`);

  rmSync(tmp, { recursive: true, force: true });
}
