// ── the CI interface a consumer calls instead of copying (#227) ──
// A consumer that runs assay in CI checks this repository out (a submodule, or actions/checkout at a tag) and calls
// it, so an engine change to which tools a run needs, or to the branch sweep, reaches it with the pin. Pinned:
//   (a) .github/actions/tools/action.yml is a composite action whose one input, `dir`, is optional; its step finds
//       assay through the action's own path (so it works at any checkout path), installs and verifies the tools a
//       run needs (--run) under set -euo pipefail, and puts them on PATH. Its script, run here against a planted
//       assay.mjs, fails the step and puts nothing on PATH when the install or the verify fails, and installs into
//       the runner's temp directory when `dir` is left empty;
//   (b) this repository's own CI and the routine template call the action as `uses: ./<path-to-assay>/.github/
//       actions/tools` and carry no copy of the install, so the tool flags live in one file;
//   (c) .github/workflows/branch-cleanup.yml is callable (`on: workflow_call` beside push and dispatch) with the same
//       dry_run input: a boolean that defaults to true, so a caller that passes nothing gets the dispatch's dry run
//       (a caller on a push deletes, as the push itself does: tests/blocks/branch-cleanup-on-merge.mjs);
//   (d) `tools --role` is retired: the CLI refuses it, and any option it does not know, as a usage error (exit 2)
//       rather than ignoring it and selecting every pinned tool; no doc names it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, negFailures, repoFiles } from '../harness.mjs';

export const label = 'ci-interface';

const ACTION = join(ROOT, '.github', 'actions', 'tools', 'action.yml');

// the `run: |` body of a composite action's only step, dedented
function actionScript(s) {
  const at = s.indexOf('run: |\n');
  if (at < 0) return null;
  const lines = s.slice(at + 'run: |\n'.length).split('\n');
  const indent = lines[0].length - lines[0].trimStart().length;
  const end = lines.findIndex((l) => l.trim() && l.length - l.trimStart().length < indent);
  return (end < 0 ? lines : lines.slice(0, end)).map((l) => l.slice(indent)).join('\n');
}

export async function run() {
  const fail = (m) => negFailures.push('ci-interface: ' + m);

  // (a)
  if (!existsSync(ACTION)) fail('(a) .github/actions/tools/action.yml exists');
  else {
    const s = readFileSync(ACTION, 'utf8');
    if (!/^runs:\n {2}using: composite\n/m.test(s)) fail('(a) the tools action is a composite action');
    const inputs = (s.match(/^inputs:\n((?: {2}[^\n]*\n| {4}[^\n]*\n)*)/m) || [])[1] || '';
    const names = [...inputs.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]);
    if (JSON.stringify(names) !== '["dir"]') fail(`(a) the tools action takes one input, dir (got ${JSON.stringify(names)})`);
    if (!/^ {4}required: false$/m.test(inputs)) fail('(a) the dir input is optional');
    if ((s.match(/^ {4}- /gm) || []).length !== 1) fail('(a) the tools action is one step');
    const script = actionScript(s);
    if (!script) { fail('(a) the tools action\'s step runs a script'); }
    else {
      if (!/^ {6}shell: bash$/m.test(s)) fail('(a) the step runs in bash');
      if (!/^set -euo pipefail$/m.test(script)) fail('(a) the step runs under set -euo pipefail');
      if (!/GITHUB_ACTION_PATH/.test(script)) fail('(a) the step finds assay through the action\'s own path');
      if (!/tools install --run\b/.test(script) || !/tools verify --run\b/.test(script)) fail('(a) the step installs and verifies the tools a run needs (--run)');
      if (/continue-on-error|\|\|\s*(true|echo|:)/.test(s)) fail('(a) a failed install or verify fails the step');
      if (/\$\{\{\s*inputs\./.test(script)) fail('(a) the dir input reaches the script through the environment, never interpolated into it');
      // run the step against a planted assay at <root>, the action at <root>/.github/actions/tools
      const dir = mkdtempSync(join(tmpdir(), 'ci-interface-'));
      try {
        const actionPath = join(dir, 'assay', '.github', 'actions', 'tools');
        mkdirSync(actionPath, { recursive: true });
        writeFileSync(join(dir, 'assay', 'assay.mjs'), `import { appendFileSync } from 'node:fs'; const a = process.argv.slice(2); appendFileSync(process.env.LOG, a.join(' ') + '\\n'); process.exit(process.env.FAIL === a[1] ? 1 : 0);`);
        const step = (env) => {
          const out = join(dir, 'path'), log = join(dir, 'log');
          writeFileSync(out, ''); writeFileSync(log, '');
          const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', cwd: dir, env: { ...process.env, GITHUB_ACTION_PATH: actionPath, GITHUB_PATH: out, RUNNER_TEMP: join(dir, 'tmp'), LOG: log, ...env } });
          return { status: r.status, path: readFileSync(out, 'utf8').trim(), log: readFileSync(log, 'utf8').trim(), out: `${r.stdout}${r.stderr}` };
        };
        const ok = step({ DIR: join(dir, 'bin') });
        if (ok.status !== 0 || ok.path !== join(dir, 'bin') || ok.log !== `tools install --run --dir ${join(dir, 'bin')}\ntools verify --run`) fail(`(a) the step installs, verifies and puts dir on PATH (got exit ${ok.status}, PATH ${JSON.stringify(ok.path)}, calls ${JSON.stringify(ok.log)}: ${ok.out.slice(0, 300)})`);
        const dflt = step({ DIR: '' });
        if (dflt.status !== 0 || dflt.path !== join(dir, 'tmp', 'assay-bin')) fail(`(a) with dir empty the tools go to the runner's temp directory (got exit ${dflt.status}, PATH ${JSON.stringify(dflt.path)})`);
        for (const sub of ['install', 'verify']) {
          const r = step({ DIR: join(dir, 'bin'), FAIL: sub });
          if (r.status === 0 || r.path !== '') fail(`(a) a failed ${sub} fails the step and puts nothing on PATH (got exit ${r.status}, PATH ${JSON.stringify(r.path)})`);
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }

  // (b)
  for (const [file, uses] of [['.github/workflows/ci.yml', './.github/actions/tools'], ['routine/assay-routine.yml', './assay/.github/actions/tools']]) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    if (!new RegExp(`^\\s*(?:- )?uses: ${uses.replace(/[./]/g, '\\$&')}\\s*$`, 'm').test(text)) fail(`(b) ${file} calls the tools action as \`uses: ${uses}\``);
    if (/tools (install|verify)/.test(text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'))) fail(`(b) ${file} carries no copy of the tools step: the action is the one place it lives`);
  }

  // (c)
  const bc = readFileSync(join(ROOT, '.github', 'workflows', 'branch-cleanup.yml'), 'utf8');
  const call = (bc.match(/^ {2}workflow_call:\n((?: {4}[^\n]*\n)*)/m) || [])[1];
  if (!call) fail('(c) branch-cleanup.yml is callable as a reusable workflow (on: workflow_call)');
  else if (!/^ {6}dry_run:\n(?: {8}[^\n]*\n)*? {8}type: boolean\n(?: {8}[^\n]*\n)*? {8}default: true\n/m.test(call)) fail('(c) the call takes dry_run, a boolean that defaults to true');

  // (d)
  const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'tools', ...args], { encoding: 'utf8' });
  for (const args of [['verify', '--run', '--role', 'instrument'], ['install', '--run', '--rol', 'x'], ['verify', '--bogus']]) {
    const r = cli(args);
    if (r.status !== 2 || !/usage/.test(r.stderr)) fail(`(d) \`tools ${args.join(' ')}\` is a usage error, exit 2 (got exit ${r.status}: ${(r.stdout + r.stderr).trim().slice(0, 200)})`);
  }
  const only = cli(['verify', '--run', '--only', 'no-such-scanner']);
  if (only.status !== 0 || /usage/.test(only.stderr)) fail(`(d) \`tools verify --run --only <scanner>\` still reads --only and its value (got exit ${only.status}: ${only.stderr.trim().slice(0, 200)})`);
  for (const f of repoFiles()) {
    if (f.startsWith('tests/') || !/\.(md|mjs|yml|yaml)$/.test(f)) continue;
    const t = readFileSync(join(ROOT, f), 'utf8');
    if (/tools [^\n`]*--role\b/.test(t)) fail(`(d) ${f} names \`tools … --role\`, which is retired`);
  }
}
