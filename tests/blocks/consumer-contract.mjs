// ── consumer-contract: what a consumer may rely on, read off the code (#229) ──
// A consumer pinned to assay reads the floor and the contract instead of knowing them by
// heart: the floor moved in #161 and a consumer fixture that named a row now beyond it
// went red. Pinned:
//   (a) the floor query: `assay yardstick --floor [--json]` prints exactly the
//       requirements.yaml rows tagged floor, in file order; with no --floor every row;
//       an unknown flag exits 2, never an empty listing;
//   (b) CONSUMERS.md states the contract: every `node assay.mjs <command>` it names is a
//       command help lists; it names the floor query, the tools action with each input
//       action.yml declares, and the reusable branch-cleanup workflow (which declares
//       workflow_call); every file of its surface block exists;
//   (c) the change rule, on a planted repository: a commit touching the surface carries
//       a `Consumer:` git trailer, or the check refuses it naming the commit; a commit off
//       the surface needs none; the release notes put the trailers first;
//   (d) the same rule on this repository's own history, since the newest v* tag, or since
//       CONSUMERS.md was added: a shallow history fails loud, never reads as clean;
//   (e) release.yml: dispatched by a person only, on the default branch, refuses a version
//       that is not vX.Y.Z, runs the gate and the trailer check before it tags, and is the
//       one job that holds contents: write; ci.yml checks out full history for (d).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'consumer-contract';

const assay = (args, opts = {}) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8', ...opts });
const notes = (args, cwd) => spawnSync(process.execPath, [join(ROOT, 'lib', 'release-notes.mjs'), ...args], { encoding: 'utf8', cwd });

export async function run() {
  const fail = (m) => negFailures.push('consumer-contract: ' + m);
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');

  // (a) the floor query
  const reg = parseYaml(read('yardstick/requirements.yaml'));
  const floorIds = reg.requirements.filter((d) => (d.tags || []).includes('floor')).map((d) => d.id);
  const allIds = reg.requirements.map((d) => d.id);
  if (!floorIds.length) fail('requirements.yaml has no floor row; the query below would read nothing');
  const fj = assay(['yardstick', '--floor', '--json']);
  if (fj.status !== 0) fail(`yardstick --floor --json exited ${fj.status}: ${fj.stderr.trim()}`);
  else {
    let doc = null;
    try { doc = JSON.parse(fj.stdout); } catch (e) { fail(`yardstick --floor --json printed no JSON: ${e.message}`); }
    if (doc) {
      const got = (doc.requirements || []).map((r) => r.id);
      if (JSON.stringify(got) !== JSON.stringify(floorIds)) fail(`yardstick --floor --json lists ${JSON.stringify(got)}; requirements.yaml's floor rows are ${JSON.stringify(floorIds)}`);
      if (doc.floor !== true) fail('yardstick --floor --json must say floor: true');
      for (const r of doc.requirements || []) if (!r.title || !r.tier || !Array.isArray(r.harm) || !r.harm.length) fail(`yardstick --floor --json row ${r.id} must carry title, tier and its harm list`);
    }
  }
  const ft = assay(['yardstick', '--floor']);
  const textIds = ft.status === 0 ? ft.stdout.split('\n').map((l) => l.split(/\s+/)[0]).filter((w) => allIds.includes(w)) : [];
  if (JSON.stringify(textIds) !== JSON.stringify(floorIds)) fail(`yardstick --floor prints ${JSON.stringify(textIds)} (exit ${ft.status}); the floor is ${JSON.stringify(floorIds)}`);
  const aj = assay(['yardstick', '--json']);
  let all = [];
  try { all = JSON.parse(aj.stdout).requirements.map((r) => r.id); } catch { /* read below */ }
  if (JSON.stringify(all) !== JSON.stringify(allIds)) fail(`yardstick --json must list every row (${allIds.length}); got ${all.length} (exit ${aj.status})`);
  const bad = assay(['yardstick', '--flor']);
  if (bad.status !== 2) fail(`yardstick --flor must exit 2 (an unknown flag), got ${bad.status}`);

  // (b) CONSUMERS.md
  if (!existsSync(join(ROOT, 'CONSUMERS.md'))) { fail('CONSUMERS.md is missing: the consumer contract has no page'); return; }
  const page = read('CONSUMERS.md');
  const helpOut = assay(['help']).stdout;
  const commands = new Set([...helpOut.matchAll(/^  ([a-z][a-z-]*) {2,}/gm)].map((m) => m[1]));
  for (const m of page.matchAll(/node assay\.mjs ([a-z][a-z-]*)/g)) if (m[1] !== 'help' && !commands.has(m[1])) fail(`CONSUMERS.md names \`node assay.mjs ${m[1]}\`, a command help does not list`);
  if (!/node assay\.mjs yardstick --floor/.test(page)) fail('CONSUMERS.md must name the floor query, `node assay.mjs yardstick --floor`');
  if (!page.includes('.github/actions/tools')) fail('CONSUMERS.md must name the tools action, .github/actions/tools');
  // action.yml's inputs: the keys indented one level under `inputs:` (lib/yaml-min reads no flow map)
  const actionInputs = (read('.github/actions/tools/action.yml').match(/^inputs:\n((?:  .*\n)+)/m)?.[1] || '').split('\n').map((l) => l.match(/^  ([A-Za-z_][\w-]*):/)?.[1]).filter(Boolean);
  if (!actionInputs.length) fail('the tools action declares no input this block can read');
  for (const input of actionInputs) if (!new RegExp('`' + input + '`').test(page)) fail(`CONSUMERS.md must name the tools action's input \`${input}\``);
  if (!page.includes('.github/workflows/branch-cleanup.yml')) fail('CONSUMERS.md must name the reusable workflow, .github/workflows/branch-cleanup.yml');
  if (!/^\s*workflow_call:/m.test(read('.github/workflows/branch-cleanup.yml'))) fail('branch-cleanup.yml must declare workflow_call: CONSUMERS.md offers it as a reusable workflow');
  const { surfaceOf, missingTrailers, compileNotes } = await import('../../lib/release-notes.mjs');
  const surface = surfaceOf(page);
  if (!surface.length) fail('CONSUMERS.md has no surface block (```surface): the change rule would read nothing');
  if (!surface.includes('CONSUMERS.md')) fail('the surface must include CONSUMERS.md itself');
  for (const f of surface) if (!existsSync(join(ROOT, f))) fail(`CONSUMERS.md's surface names ${f}, which does not exist`);

  // (c) the rule on a planted repository
  const tmp = join(HERE, 'tmp-consumer-contract'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
    const commit = (file, text, msg) => { writeFileSync(join(tmp, file), text); git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').trim(); };
    git('init', '-q');
    commit('other.txt', '0\n', 'before the contract');
    commit('CONSUMERS.md', '# c\n\n```surface\nCONSUMERS.md\ncli.mjs\n```\n', 'the contract\n\nConsumer: none, the page is new');
    commit('other.txt', '1\n', 'off the surface: no trailer needed');
    commit('cli.mjs', '1\n', 'cli: rename --x to --y\n\nConsumer: pass --y where you passed --x');
    const ok = notes(['--check'], tmp);
    if (ok.status !== 0) fail(`the trailer check refuses a history that carries every trailer: ${ok.stderr.trim()}`);
    const n = notes([], tmp);
    const lines = n.stdout.split('\n').filter(Boolean);
    const first = lines.findIndex((l) => l.includes('pass --y where you passed --x'));
    const subj = lines.findIndex((l) => l.includes('off the surface'));
    if (n.status !== 0 || first === -1 || subj === -1 || first > subj) fail(`the release notes must put the Consumer: trailers before the commit list (exit ${n.status}):\n${n.stdout}`);
    if (n.stdout.includes('before the contract')) fail('the release notes with no tag must start at the commit that added CONSUMERS.md');
    if (n.stdout.includes('none, the page is new')) fail('a `Consumer: none…` trailer says nothing to change and must not head the notes');
    const bare = commit('cli.mjs', '2\n', 'cli: drop --y\n\nThe flag went because nothing read it.');
    const red = notes(['--check'], tmp);
    if (red.status === 0 || !red.stderr.includes(bare.slice(0, 7))) fail(`the trailer check must refuse ${bare.slice(0, 7)}, which touches cli.mjs with no Consumer: trailer (exit ${red.status}): ${red.stderr.trim()}`);
    git('tag', 'v1.0.0');
    commit('other.txt', '2\n', 'after the tag');
    const since = notes(['--check'], tmp);
    if (since.status !== 0) fail(`a tag starts the range: a commit before v1.0.0 is not this release's (exit ${since.status}): ${since.stderr.trim()}`);
    // the predicate itself
    if (missingTrailers([{ sha: 'a', subject: 's', files: ['cli.mjs'], consumer: [] }], ['cli.mjs']).length !== 1) fail('missingTrailers passes a surface commit with no trailer');
    if (missingTrailers([{ sha: 'a', subject: 's', files: ['x'], consumer: [] }], ['cli.mjs']).length !== 0) fail('missingTrailers refuses a commit off the surface');
    if (!/^## /m.test(compileNotes([], null))) fail('compileNotes of no commit must still print its headings, never an empty page');
  } catch (e) { fail(`the planted repository could not be built or read: ${e.message}`); }
  finally { rmSync(tmp, { recursive: true, force: true }); }

  // (d) this repository's own history
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (shallow === 'true') fail('the history is shallow: the Consumer: trailer rule read nothing (fetch full history: actions/checkout fetch-depth: 0)');
  else {
    const own = notes(['--check'], ROOT);
    if (own.status !== 0) fail(`the Consumer: trailer check refuses this repository's history (exit ${own.status}):\n${own.stderr.trim()}`);
  }

  // (e) release.yml, and ci.yml's full history
  const relPath = join(ROOT, '.github', 'workflows', 'release.yml');
  if (!existsSync(relPath)) { fail('.github/workflows/release.yml is missing: no person can cut a release'); return; }
  const rel = readFileSync(relPath, 'utf8');
  const on = rel.match(/^on:\n((?:\s+.*\n)+)/m)?.[1] || '';
  if (!/^\s{2}workflow_dispatch:/m.test(on) || /^\s{2}(push|pull_request|schedule|workflow_call|release):/m.test(on)) fail('release.yml must run only when a person dispatches it (workflow_dispatch and nothing else)');
  if (!/github\.ref_name == github\.event\.repository\.default_branch/.test(rel)) fail('release.yml must tag only the default branch');
  if (!rel.includes('^v[0-9]+\\.[0-9]+\\.[0-9]+$')) fail('release.yml must refuse a version that is not vX.Y.Z');
  const at = (s) => rel.indexOf(s);
  for (const s of ['npm test', 'lib/release-notes.mjs --check']) if (at(s) === -1 || at(s) > at('gh release create')) fail(`release.yml must run \`${s}\` before it tags`);
  if (!/^permissions: \{ contents: read \}/m.test(rel)) fail('release.yml must default to contents: read');
  for (const m of rel.matchAll(/uses:\s*([^\s@#]+)@([^\s#]+)/g)) if (!m[1].startsWith('./') && !/^[0-9a-f]{40}$/.test(m[2])) fail(`release.yml: ${m[1]}@${m[2]} is not pinned to a commit SHA`);
  if (!/fetch-depth: 0/.test(rel)) fail('release.yml must check out full history: the notes read every commit since the last tag');
  if (!/fetch-depth: 0/.test(read('.github/workflows/ci.yml'))) fail('ci.yml must check out full history (fetch-depth: 0) so (d) reads the commits');
}
