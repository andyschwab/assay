// ── enumerate records what the tree states about each effect candidate, and nothing it does not
// (#315 slice 3; map/effect-signals.mjs, map/effect-signals.yaml, map/SCHEMA.md §6e, "The signals") ──
// Over tests/enumerate-fixture/signals:
//  1. a workflow with a job-level environment, a permissions block and a manual dispatch carries
//     three signals (refuses_unless yes, held outside; declared_scope yes; person_act yes), each
//     with its file:line; one triggered by a push alone carries person_act no, and nothing else;
//     one a dispatch or a push starts carries person_act no (the path that waits for no one decides);
//  2. a script whose argument parsing defaults to a dry run with --apply carries second_act yes
//     (SCHEMA.md §6e names a dry run by default with an apply flag among second_act's cases); one
//     that writes whenever it runs carries no signal;
//  3. a route behind a listed limiter, and one behind a limiter the tree defines and applies by name,
//     carry rate_limit yes; a route behind none carries no rate_limit signal, never a no;
//  4. a route whose handler sets a soft-delete column carries window yes; one that hard-deletes
//     carries none;
//  5. no signal is ever read where its marker is absent: the only noes recorded are the triggers'.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'signals-from-code';

export async function run() {
  const fail = (m) => negFailures.push('signals-from-code: ' + m);
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'enumerate', join(HERE, 'enumerate-fixture', 'signals'), '--json'], { encoding: 'utf8' });
  if (r.status !== 0) { fail(`enumerate --json over the signals fixture exited ${r.status}: ${r.stderr.slice(0, 300)}`); return; }
  const doc = JSON.parse(r.stdout);
  const all = ['channelCandidates', 'routeHandlers', 'effectSites'].flatMap((p) => doc.populations[p]);
  const of = (member) => all.find((c) => c.member === member);
  const sig = (member, q) => ((of(member) || {}).signals || []).find((s) => s.question === q);
  const show = (member) => JSON.stringify((of(member) || {}).signals);
  for (const c of all) if (!Array.isArray(c.signals)) fail(`every candidate carries a signals list, empty where the tree states nothing (${c.member}: ${JSON.stringify(c.signals)})`);

  // (1) the workflows
  const REL = 'release write (workflow) @ .github/workflows/release.yml';
  if (!of(REL)) fail(`the release workflow's write must be listed (${all.map((c) => c.member).join(', ')})`);
  const env = sig(REL, 'refuses_unless');
  if (!env || env.supports !== 'yes' || env.held_by !== 'outside' || !/outside the repository/.test(env.what || '') || env.evidence.join() !== '.github/workflows/release.yml:11' || env.marker !== 'job key: environment')
    fail(`(1) a job-level environment: is refuses_unless yes, held outside, at its file:line (got ${show(REL)})`);
  const perm = sig(REL, 'declared_scope');
  if (!perm || perm.supports !== 'yes' || perm.evidence.join() !== '.github/workflows/release.yml:12') fail(`(1) a permissions block is declared_scope yes at its file:line (got ${show(REL)})`);
  const disp = sig(REL, 'person_act');
  if (!disp || disp.supports !== 'yes' || disp.evidence.join() !== '.github/workflows/release.yml:3' || disp.marker !== 'on: workflow_dispatch') fail(`(1) a workflow_dispatch trigger is person_act yes at its file:line (got ${show(REL)})`);
  if ((of(REL) || {}).signals?.length !== 3) fail(`(1) the release workflow carries exactly those three signals (got ${show(REL)})`);
  const NIGHT = 'deploy/publish (workflow) @ .github/workflows/nightly.yml';
  const push = sig(NIGHT, 'person_act');
  if (!push || push.supports !== 'no' || push.evidence.join() !== '.github/workflows/nightly.yml:3' || push.marker !== 'on: push') fail(`(1) a push trigger alone is person_act no at its file:line (got ${show(NIGHT)})`);
  if ((of(NIGHT) || {}).signals?.length !== 1) fail(`(1) a workflow with no environment and no permissions carries no signal on them (got ${show(NIGHT)})`);
  const DOCS = 'github api write (workflow) @ .github/workflows/docs.yml';
  const mixed = sig(DOCS, 'person_act');
  if (!mixed || mixed.supports !== 'no' || mixed.marker !== 'on: push' || mixed.evidence.join() !== '.github/workflows/docs.yml:2') fail(`(1) a manual dispatch beside a push is person_act no: the push waits for no one (got ${show(DOCS)})`);

  // (2) the scripts
  const PRUNE = 'http write (js) @ scripts/prune.mjs', SYNC = 'http write (js) @ scripts/sync.mjs';
  const dry = sig(PRUNE, 'second_act');
  if (!dry || dry.supports !== 'yes' || dry.evidence.join() !== 'scripts/prune.mjs:2,scripts/prune.mjs:3' || dry.marker !== 'apply flag: --apply') fail(`(2) a dry-run default with --apply is second_act yes, at the flag and the default (got ${show(PRUNE)})`);
  if (sig(PRUNE, 'staged')) fail(`(2) a dry-run default is second_act's case, not staged's (got ${show(PRUNE)})`);
  if (!of(SYNC) || of(SYNC).signals.length) fail(`(2) a script with no dry-run default and no apply flag carries no signal (got ${show(SYNC)})`);

  // (3) the routes and their limiters
  const NOTES = 'route: POST /notes', FEEDBACK = 'route: POST /feedback', PURGE = 'route: POST /admin/purge';
  const lim = sig(NOTES, 'rate_limit');
  if (!lim || lim.supports !== 'yes' || lim.evidence.join() !== 'src/server.mjs:7,src/server.mjs:9' || lim.marker !== 'limiter: writeCap') fail(`(3) a route behind a listed limiter is rate_limit yes, at the limiter and where the route applies it (got ${show(NOTES)})`);
  const own = sig(PURGE, 'rate_limit');
  if (!own || own.supports !== 'yes' || own.evidence.join() !== 'src/admin.mjs:3,src/admin.mjs:7' || own.marker !== 'limiter: adminThrottle') fail(`(3) a route behind a limiter the tree defines and applies by name is rate_limit yes (got ${show(PURGE)})`);
  if (!of(FEEDBACK)) fail('(3) the unlimited route must be listed');
  else if (of(FEEDBACK).signals.length) fail(`(3) a route behind no limiter carries no signal at all, never rate_limit no (got ${show(FEEDBACK)})`);

  // (4) a soft delete, and a hard one
  const SOFT = 'route: DELETE /notes/:id', HARD = 'route: DELETE /feedback/:id';
  const win = sig(SOFT, 'window');
  if (!win || win.supports !== 'yes' || win.evidence.join() !== 'src/server.mjs:20' || win.marker !== 'soft delete: deleted_at') fail(`(4) a handler that sets deleted_at is window yes at the statement (got ${show(SOFT)})`);
  if (!of(HARD) || of(HARD).signals.length) fail(`(4) a handler that hard-deletes carries no window signal (got ${show(HARD)})`);
  if (sig(PURGE, 'window')) fail(`(4) a purge that deletes carries no window signal (got ${show(PURGE)})`);

  // (5) the only no recorded is a trigger's: no marker absent reads as a no
  const nos = all.flatMap((c) => c.signals.filter((s) => s.supports === 'no').map((s) => `${c.member}: ${s.question}`));
  if (nos.sort().join() !== [`${NIGHT}: person_act`, `${DOCS}: person_act`].sort().join()) fail(`(5) a no is recorded only where the tree states one (got ${nos.join('; ')})`);
}
