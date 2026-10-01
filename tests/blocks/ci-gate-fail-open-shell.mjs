// ── repo-census ci-gate: a gate that can fail open through its shell script, not
// just `continue-on-error: true` — `|| true`, `|| exit 0`, `|| :`, and `set +e`
// (a multi-line `run: |` script), each cited by the exact offending line.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflow } from '../../map/repo-census.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'ci-gate-fail-open-shell';

export async function run() {
  const fail = (m) => negFailures.push('ci-gate-fail-open-shell: ' + m);
  const wfInline = (cmd) => `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ${cmd}\n`;
  const wfBlock = (lines) => `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: |\n${lines.map((l) => `          ${l}`).join('\n')}\n`;
  const inlineRunLine = wfInline('x').split('\n').findIndex((l) => /^\s*- run:/.test(l)) + 1;
  for (const [label, cmd] of [['|| true', 'npm test || true'], ['|| exit 0', 'npm test || exit 0'], ['|| :', 'npm test || :']]) {
    const steps = parseWorkflow(wfInline(cmd)).steps;
    if (!steps[0]?.isGateCmd) fail(`${label}: the underlying command must still count as a gate command`);
    if (!steps[0]?.continueOnError) fail(`${label}: a run command ending in "${label}" must read as failing open`);
    if (steps[0]?.coeLine !== inlineRunLine) fail(`${label}: must cite the run: line itself (got ${steps[0]?.coeLine}, want ${inlineRunLine})`);
  }
  // set +e, as the first line of a multi-line block-scalar script — the actual
  // gate command sits on a LATER line, and the citation must land on the set +e line
  const setELines = wfBlock(['set +e', 'npm test']).split('\n');
  const setELine = setELines.findIndex((l) => /set \+e/.test(l)) + 1;
  const setE = parseWorkflow(wfBlock(['set +e', 'npm test'])).steps;
  if (!setE[0]?.isGateCmd) fail('set +e: the script must still be read as a gate command (npm test is in it)');
  if (!setE[0]?.continueOnError) fail('set +e must read as failing open, even on a line before the gate command');
  if (setE[0]?.coeLine !== setELine) fail(`set +e must cite its own line, not the run: line (got ${setE[0]?.coeLine}, want ${setELine})`);
  // a normal multi-line script with neither shape must NOT read as failing open
  const clean = parseWorkflow(wfBlock(['echo starting', 'npm test'])).steps;
  if (clean[0]?.continueOnError) fail('a clean multi-line script must not read as failing open');
  // continue-on-error: true still wins as its own citation (unchanged behavior)
  const literalWf = `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: npm test\n        continue-on-error: true\n`;
  const literalLine = literalWf.split('\n').findIndex((l) => /continue-on-error/.test(l)) + 1;
  const literal = parseWorkflow(literalWf).steps;
  if (!literal[0]?.continueOnError || literal[0]?.coeLine !== literalLine) fail(`continue-on-error: true must still be read at its own line (got ${literal[0]?.continueOnError}/${literal[0]?.coeLine}, want ${literalLine})`);
  // end-to-end through repo-census: each shape gaps ci-gate, citing the shape in the observation
  for (const [label, wfText] of [
    ['|| true', wfInline('npm test || true')],
    ['|| exit 0', wfInline('npm test || exit 0')],
    ['|| :', wfInline('npm test || :')],
    ['set +e', wfBlock(['set +e', 'npm test'])],
  ]) {
    const tmp = join(HERE, 'tmp-ci-gate-shell'); rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(tmp, '.github', 'workflows', 'ci.yml'), wfText);
    const out = join(tmp, 'repo-census.json');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-09-28'], { stdio: 'pipe' }); } catch { /* gaps expected */ }
    const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    const ci = doc?.checks.find((c) => c.name === 'ci-gate');
    if (ci?.status !== 'gap' || !/fails open/.test(ci.observation || '')) fail(`${label}: repo-census must gap ci-gate over this shape (got ${ci?.status}/${ci?.observation})`);
    if (!ci.evidence[0]?.includes('ci.yml')) fail(`${label}: must cite ci.yml (got ${ci?.evidence})`);
    rmSync(tmp, { recursive: true, force: true });
  }
}
