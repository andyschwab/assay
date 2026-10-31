// ── branch-cleanup runs on every push to the default branch, and that run deletes (#173) ──
// A slice ends with the cleanup run on its merge commit, so nobody has to dispatch the sweep. The workflow's own
// expressions are evaluated here for each event (GitHub's && and || pick an operand the way JavaScript's do), and the
// plan step is run with the DRY_RUN each event sets, against the fake GitHub tests/blocks/branch-cleanup.mjs records:
//   (a) it triggers on a push to main or master and on a dispatch, and is callable (#227: a caller's run is its
//       github context, so (b)-(d) hold for a call as for the caller's own event), nothing else;
//   (b) the plan job runs on a push only when the push is to this repository's default branch, and always by hand;
//   (c) a push is not a dry run; a dispatch is one unless a person turned dry_run off;
//   (d) the plan hands its dry-run decision to the delete job, which deletes only when it is false and there is
//       something to delete; a plan with no DRY_RUN at all is a dry run.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';
import { stepScript, BRANCHES, PLANNED, FAKE_GH } from './branch-cleanup.mjs';

export const label = 'branch-cleanup-on-merge';

const FILE = join(ROOT, '.github', 'workflows', 'branch-cleanup.yml');

// a `${{ … }}` expression of the workflow, evaluated against a context: names read off it, the operators as written
function evaluate(expr, ctx) {
  const body = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const js = body.replace(/\b(github|inputs|needs)(\.[\w.]+)/g, (m) => `ctx.${m}`).replace(/==/g, '===').replace(/!===/g, '!==');
  return Function('ctx', `return (${js});`)(ctx);
}

export async function run() {
  const fail = (m) => negFailures.push('branch-cleanup-on-merge: ' + m);
  const s = readFileSync(FILE, 'utf8');

  // (a)
  const on = s.match(/^on:\n((?: [^\n]*\n)+)/m);
  const triggers = on ? on[1].match(/^ {2}\w+:/gm) : null;
  if (JSON.stringify(triggers) !== JSON.stringify(['  push:', '  workflow_dispatch:', '  workflow_call:'])) fail(`the workflow runs on push and workflow_dispatch, and as a call from another repository's (#227), nothing else (got ${JSON.stringify(triggers)})`);
  const branches = (s.match(/^ {2}push:\n {4}branches: \[([^\]]*)\]/m) || [])[1];
  if (!branches || !branches.split(',').map((b) => b.trim()).includes('main')) fail(`a push to the default branch triggers it (got branches ${JSON.stringify(branches)})`);

  const planIf = (s.match(/\n {2}plan:\n(?: {4}[^\n]*\n)*? {4}if: (\$\{\{[^\n]*\}\})\n/) || [])[1];
  const dryRun = (s.match(/DRY_RUN: "(\$\{\{[^"]*\}\})"/) || [])[1];
  const deleteIf = (s.match(/\n {2}delete:\n(?: {4}[^\n]*\n)*? {4}if: (\$\{\{[^\n]*\}\})\n/) || [])[1];
  if (!planIf || !dryRun || !deleteIf) { fail(`the plan job's if, the plan step's DRY_RUN and the delete job's if are each one expression (got ${JSON.stringify({ planIf, dryRun, deleteIf })})`); return; }
  const push = (ref) => ({ github: { event_name: 'push', ref_name: ref, event: { repository: { default_branch: 'main' } } }, inputs: {} });
  const dispatch = (dry) => ({ github: { event_name: 'workflow_dispatch', ref_name: 'main', event: { repository: { default_branch: 'main' } } }, inputs: { dry_run: dry } });

  // (b)
  if (!evaluate(planIf, push('main'))) fail('a push to the default branch runs the plan');
  if (evaluate(planIf, push('master'))) fail('a push to a branch that is not this repository\'s default runs nothing');
  if (!evaluate(planIf, dispatch(true))) fail('a run by hand runs the plan');

  // (c)
  const asEnv = (v) => String(v);
  if (asEnv(evaluate(dryRun, push('main'))) !== 'false') fail(`a push is not a dry run (DRY_RUN reads ${evaluate(dryRun, push('main'))})`);
  if (asEnv(evaluate(dryRun, dispatch(true))) !== 'true') fail('a dispatch is a dry run by default');
  if (asEnv(evaluate(dryRun, dispatch(false))) !== 'false') fail('a dispatch with dry_run off deletes');

  // (d)
  const del = (dry, merged) => evaluate(deleteIf, { needs: { plan: { outputs: { dry_run: dry, merged } } } });
  if (!del('false', PLANNED)) fail('the delete job runs when the plan is not a dry run and names branches');
  if (del('true', PLANNED)) fail('the delete job never runs on a dry run');
  if (del('false', '')) fail('the delete job does not run with nothing to delete');
  if (del('', PLANNED)) fail('the delete job never runs when the plan said nothing about dry_run');

  const planScript = stepScript(s, 'Plan');
  if (!planScript) { fail('the plan step exists, named "Plan…"'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'branch-cleanup-on-merge-'));
  try {
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'gh.json'), JSON.stringify(BRANCHES));
    writeFileSync(join(dir, 'bin', 'gh'), FAKE_GH);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    const keepList = (s.match(/^ {2}KEEP: ([^#\n]+?)\s*(?:#[^\n]*)?$/m) || [])[1] || '';
    const plan = (dry) => {
      const out = join(dir, 'output'), log = join(dir, 'gh.log');
      writeFileSync(out, ''); writeFileSync(log, '');
      const env = { ...process.env, PATH: [join(dir, 'bin'), process.env.PATH].join(delimiter), GH_JSON: join(dir, 'gh.json'), GH_LOG: log, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: 'org/app', KEEP: keepList };
      if (dry === undefined) delete env.DRY_RUN; else env.DRY_RUN = dry;
      const r = spawnSync('bash', ['-c', planScript], { encoding: 'utf8', cwd: dir, env });
      return { status: r.status, out: `${r.stdout}${r.stderr}`, output: readFileSync(out, 'utf8') };
    };
    const outputOf = (r, k) => (r.output.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1];
    const pushRun = plan(asEnv(evaluate(dryRun, push('main'))));
    if (pushRun.status !== 0 || outputOf(pushRun, 'dry_run') !== 'false' || outputOf(pushRun, 'merged') !== PLANNED || /dry run: nothing deleted/.test(pushRun.out)) fail(`a push's plan hands the delete job dry_run=false and its branches (got exit ${pushRun.status}, ${JSON.stringify(pushRun.output)})`);
    const byHand = plan(asEnv(evaluate(dryRun, dispatch(true))));
    if (outputOf(byHand, 'dry_run') !== 'true' || !/dry run: nothing deleted/.test(byHand.out)) fail(`a dispatch's plan is a dry run and says so (got ${JSON.stringify(byHand.output)})`);
    const unset = plan(undefined);
    if (outputOf(unset, 'dry_run') !== 'true') fail(`a plan with no DRY_RUN is a dry run (got ${JSON.stringify(unset.output)})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
