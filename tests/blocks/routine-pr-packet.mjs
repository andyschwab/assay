// ── routine --base-ref reads the packet from the base ref too, and a held owner claim
// moved to not-applicable is a regression (#48, F-1204) ──
// The base commit carries a packet claiming d-contract-test-per-vendor satisfied (an owner
// row, met) and a baseline holding it. The "pull request" edits only the working tree's
// packet to not-applicable. Graded on a pull request, the base ref's packet decides the row
// (the edit cannot move the measurement, and it is named); read from the working tree (a
// schedule run over a tree carrying that edit), the move reads as a ratchet failure.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { routinePath } from '../../lib/run-layout.mjs';
import { runRoutine } from '../../routine/run.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'routine-pr-packet';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('routine-pr-packet: ' + m);
  const tmp = join(HERE, 'tmp-routine-pr-packet'); rmSync(tmp, { recursive: true, force: true });
  const repoDir = join(tmp, 'repo');
  mkdirSync(join(repoDir, 'packet'), { recursive: true });
  const git = (gitArgs) => spawnSync('git', gitArgs, { cwd: repoDir, encoding: 'utf8' });
  writeFileSync(join(repoDir, 'package.json'), JSON.stringify({ name: 'pr-packet-target', version: '0.0.0', private: true, scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2) + '\n');
  writeFileSync(join(repoDir, 'README.md'), '# pr-packet-target\n\nA regression-only fixture; not a real package.\n');
  const manifest = (claim) => [
    '# an invented packet for a regression fixture (CLAUDE.md rule 6)',
    'packet: 1', 'yardstick: 0',
    'answered:', '  date: "2026-09-01"', '  by: founder', '  via: owner-prompt',
    'claims:', '  - id: d-contract-test-per-vendor', ...claim, '',
  ].join('\n');
  const manifestFile = join(repoDir, 'packet', 'manifest.yaml');
  writeFileSync(manifestFile, manifest(['    state: satisfied', '    certainty: sure', '    by: "a contract test per vendor under tests/contract/"']));
  git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'Test']);
  git(['add', '-A']);
  if (git(['commit', '-q', '-m', 'initial']).status !== 0) fail('test setup: initial commit must succeed');
  const rowOf = (runDir) => {
    const y = existsSync(join(runDir, 'yardstick.yaml')) ? parseYaml(readFileSync(join(runDir, 'yardstick.yaml'), 'utf8')) : null;
    return y && (y.requirements || []).find((r) => r.id === 'd-contract-test-per-vendor');
  };
  const runDir1 = join(tmp, 'run1');
  try { runRoutine({ repoDir, outDir: runDir1 }, () => {}); } catch (e) { fail(`test setup: the seeding run must not throw (${e.message})`); }
  const row1 = rowOf(runDir1);
  if (!row1 || row1.status !== 'met' || row1.basis !== 'owner') fail(`test setup: the packet's satisfied claim must read met, basis owner (got ${JSON.stringify(row1)})`);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), runDir1, '--write-baseline', join(repoDir, 'packet', 'baseline.yaml')], { stdio: 'pipe' }); }
  catch (e) { fail(`test setup: --write-baseline must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  git(['add', '-A']);
  if (git(['commit', '-q', '-m', 'a steward accepts the baseline']).status !== 0) fail('test setup: the baseline commit must succeed');
  const baseCommit = git(['rev-parse', 'HEAD']).stdout.trim();

  // the pull request: the held claim, edited to not-applicable in the change's own tree
  writeFileSync(manifestFile, manifest(['    state: not-applicable', '    reason: "no vendor is called any more"']));

  const runDirPr = join(tmp, 'run-pr');
  const logsPr = [];
  let rPr;
  try { rPr = runRoutine({ repoDir, outDir: runDirPr, baseRef: baseCommit }, (l) => logsPr.push(l)); }
  catch (e) { fail(`runRoutine --base-ref must not throw (${e.message})`); }
  const rowPr = rowOf(runDirPr);
  if (!rowPr || rowPr.status !== 'met') fail(`on a pull request the base ref's packet decides the owner row — the change's own edit must not move it (got ${JSON.stringify(rowPr)}):\n${logsPr.join('\n')}`);
  if (!logsPr.some((l) => /edits the packet/.test(l))) fail(`the routine must name a change that edits packet/manifest.yaml plainly (got:\n${logsPr.join('\n')})`);
  if (rPr && (!rPr.ok || rPr.exitCode !== 0)) fail(`with the base ref's packet, nothing held moved, so the gate holds (got ok=${rPr.ok} exit=${rPr.exitCode}):\n${logsPr.join('\n')}`);

  const runDirTree = join(tmp, 'run-tree');
  const logsTree = [];
  let rTree;
  try { rTree = runRoutine({ repoDir, outDir: runDirTree }, (l) => logsTree.push(l)); }
  catch (e) { fail(`runRoutine with no --base-ref must not throw (${e.message})`); }
  const rowTree = rowOf(runDirTree);
  if (!rowTree || rowTree.status !== 'not-applicable') fail(`test setup: read from the working tree, the edited claim must read not-applicable (got ${JSON.stringify(rowTree)})`);
  if (rTree && (rTree.ok || rTree.exitCode !== 1)) fail(`a held owner claim edited to not-applicable must fail the gate, never read held (got ok=${rTree.ok} exit=${rTree.exitCode}):\n${logsTree.join('\n')}`);
  const recTree = existsSync(routinePath(runDirTree)) ? parseYaml(readFileSync(routinePath(runDirTree), 'utf8')) : null;
  if (!recTree || recTree.gate !== 'failed' || !(recTree.failures || []).some((f) => /d-contract-test-per-vendor/.test(f) && /met\s*→\s*not-applicable/.test(f))) fail(`routine.yaml must read gate: failed with the d-contract-test-per-vendor met → not-applicable line (got ${JSON.stringify(recTree)})`);
  rmSync(tmp, { recursive: true, force: true });
}
