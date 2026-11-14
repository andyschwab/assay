// ── the landing ritual is one command in the repository: npm run gate (#323) ──
// Each change's brief restated the same landing steps (install the pinned tools, run the suite,
// typecheck, lint, the passes check, the release-notes check), and restated, they drifted.
// `npm run gate` (lib/gate.mjs) runs them in order and ends in one exit line; CONTRIBUTING.md
// states the landing steps once and points at it. The gate stops at the tools, with the line that
// installs them, when a pinned tool is not on PATH; past them, every check runs, and the exit line
// names each that failed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'gate-command';

export async function run() {
  const fail = (m) => negFailures.push('gate-command: ' + m);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (pkg.scripts?.gate !== 'node lib/gate.mjs') fail(`package.json must carry "gate": "node lib/gate.mjs" (got ${JSON.stringify(pkg.scripts?.gate)})`);
  const G = await import('../../lib/gate.mjs').catch((e) => { fail(`lib/gate.mjs must load (${e.message.split('\n')[0]})`); return null; });
  if (!G) return;
  const { INSTALL_FOR_RUN } = await import('../../map/tools.mjs');

  // (a) the steps, in order: the tools, then the suite, typecheck, lint, the passes, the release notes
  const at = (s) => `${s.cmd === process.execPath ? 'node' : s.cmd} ${s.args.join(' ')}`;
  if (at(G.TOOLS) !== 'node assay.mjs tools verify --run') fail(`the gate's first step verifies the pinned tools (got ${at(G.TOOLS)})`);
  const want = [['test', 'npm test'], ['typecheck', 'npm run typecheck'], ['lint', 'npm run lint'], ['passes', 'node map/passes.mjs'], ['release-notes', 'node lib/release-notes.mjs --check']];
  if (G.STEPS.map((s) => s.name).join(',') !== want.map((w) => w[0]).join(',')) fail(`the gate runs ${want.map((w) => w[0]).join(', ')} in that order (got ${G.STEPS.map((s) => s.name).join(', ')})`);
  for (const [name, cmd] of want) {
    const s = G.STEPS.find((x) => x.name === name);
    if (s && at(s).replace(/ --silent/g, '') !== cmd.replace(/ --silent/g, '')) fail(`the gate's ${name} step runs ${cmd} (got ${at(s)})`);
  }

  // (b) a pinned tool missing from PATH: the real tools step fails, the gate stops there with the install line
  const noTools = { ...process.env, PATH: dirname(process.execPath) };
  const ran = [], logs = [];
  const quiet = (env) => (s) => { ran.push(s.name); return spawnSync(s.cmd, s.args, { cwd: ROOT, env, encoding: 'utf8' }).status; };
  const ok = { name: 'planted-ok', cmd: process.execPath, args: ['-e', 'process.exit(0)'] };
  const bad = { name: 'planted-red', cmd: process.execPath, args: ['-e', 'process.exit(3)'] };
  const stopped = G.runGate({ steps: [ok, ok], env: noTools, log: (l) => logs.push(l), run: quiet(noTools) });
  if (stopped.exit !== 1) fail(`the gate must fail when a pinned tool is not on PATH (exit ${stopped.exit})`);
  if (ran.join(',') !== 'tools') fail(`the gate must stop at the tools: nothing after them runs (ran ${ran.join(',')})`);
  if (!logs.some((l) => l.includes(INSTALL_FOR_RUN))) fail(`the gate must print the install line (${INSTALL_FOR_RUN}) when a tool is missing (got ${JSON.stringify(logs)})`);
  if (!/^✗ assay gate: stopped at tools/.test(stopped.line)) fail(`the exit line must say the gate stopped at the tools (got ${stopped.line})`);

  // (c) everything passes: one ✓ exit line, exit 0
  ran.length = 0;
  const green = G.runGate({ tools: { ...ok, name: 'tools' }, steps: [ok, { ...ok, name: 'planted-two' }], log: () => {}, run: quiet(process.env) });
  if (green.exit !== 0 || !/^✓ assay gate: tools, planted-ok, planted-two: all 3 steps pass$/.test(green.line)) fail(`a gate whose steps all pass exits 0 on one ✓ line (got ${green.exit}: ${green.line})`);

  // (d) a check that fails: every later check still runs, and the exit line names the one that failed
  ran.length = 0;
  const red = G.runGate({ tools: { ...ok, name: 'tools' }, steps: [ok, bad, { ...ok, name: 'planted-after' }], log: () => {}, run: quiet(process.env) });
  if (red.exit !== 1 || !/^✗ assay gate: 1 of 4 steps failed: planted-red \(exit 3\)$/.test(red.line)) fail(`a failing check exits 1 on a line naming it (got ${red.exit}: ${red.line})`);
  if (ran.join(',') !== 'tools,planted-ok,planted-red,planted-after') fail(`past the tools every check runs, so one run names every red step (ran ${ran.join(',')})`);

  // (e) the landing steps have one home, CONTRIBUTING.md; CLAUDE.md's Checks points there
  const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  for (const [what, re] of [['the tools install and PATH line', /tools install --run --dir <bin>[\s\S]*export PATH="<bin>:\$PATH"/], ['npm run gate', /`npm run gate`/],
    ['red then green', /Red, then green/], ['the golden re-bless', /golden\.json[\s\S]*--bless/], ['one Consumer: paragraph', /One `Consumer:` paragraph/],
    ['the pull request template', /PULL_REQUEST_TEMPLATE\.md/], ['a removal says what went and why', /removes something says in its subject what went and why/]])
    if (!re.test(contributing)) fail(`CONTRIBUTING.md must state the landing step: ${what}`);
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  const checks = claude.slice(claude.indexOf('## Checks'), claude.indexOf('\n## ', claude.indexOf('## Checks') + 1));
  if (!/CONTRIBUTING\.md/.test(checks) || !/npm run gate/.test(checks)) fail('CLAUDE.md\'s Checks must point at CONTRIBUTING.md and npm run gate');
  if (/npm test|re-bless|golden\.json/.test(checks)) fail('CLAUDE.md\'s Checks must point at the landing steps, not restate them');

  // (f) end to end: the command itself, with no pinned tool on PATH, ends on the stop line and exit 1
  const cli = spawnSync(process.execPath, [join(ROOT, 'lib', 'gate.mjs')], { cwd: ROOT, env: noTools, encoding: 'utf8' });
  const last = cli.stdout.trim().split('\n').pop();
  if (cli.status !== 1 || !/^✗ assay gate: stopped at tools/.test(last) || !cli.stdout.includes(INSTALL_FOR_RUN)) fail(`node lib/gate.mjs with no pinned tool on PATH must print the install line and end on the stop line, exit 1 (got ${cli.status}: ${last})`);
}
