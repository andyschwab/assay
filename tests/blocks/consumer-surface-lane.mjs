// ── the trailer check watches the files that write the lane's contract (#297) ──
// CONSUMERS.md names map/raw/enumerate.json as the practice-review lane's input, the two triage
// files as its outputs, and the lane seed, but its surface block listed none of the files that
// write them, so `release-notes --check` let a commit change the lane's input with no Consumer:
// trailer (v0.10.0's range read "0 touch the consumer surface" over two that did). Pinned: the
// surface lists each writer, and on a planted repository carrying this page's own surface block a
// commit touching map/enumerate.mjs with no trailer fails the check, naming it.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'consumer-surface-lane';

const WRITERS = ['map/enumerate.mjs', 'map/enumerate-populations.mjs', 'map/lane.mjs',
  'map/scanners/adapters/practice-review/lane.md', 'map/scanners/adapters/deep-code-review/lane.md',
  'map/SCHEMA.md', 'yardstick/requirements.yaml'];

export async function run() {
  const fail = (m) => negFailures.push('consumer-surface-lane: ' + m);
  const page = readFileSync(join(ROOT, 'CONSUMERS.md'), 'utf8');
  const { surfaceOf } = await import('../../lib/release-notes.mjs');
  const surface = surfaceOf(page);
  for (const f of WRITERS) if (!surface.includes(f)) fail(`CONSUMERS.md's surface must list ${f}, which writes the lane's input, outputs, seed or questions`);

  const block = page.match(/^```surface\n[\s\S]*?^```\n/m);
  if (!block) { fail('CONSUMERS.md has no surface block'); return; }
  const tmp = join(HERE, 'tmp-consumer-surface-lane'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
    const commit = (file, text, msg) => { mkdirSync(dirname(join(tmp, file)), { recursive: true }); writeFileSync(join(tmp, file), text); git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').trim(); };
    const check = () => spawnSync(process.execPath, [join(ROOT, 'lib', 'release-notes.mjs'), '--check'], { encoding: 'utf8', cwd: tmp });
    git('init', '-q');
    commit('CONSUMERS.md', `# c\n\n${block[0]}`, 'the contract\n\nConsumer: none, the page is new');
    commit('map/enumerate.mjs', '// 1\n', 'enumerate: list a new kind\n\nConsumer: the lane triages the new members');
    const ok = check();
    if (ok.status !== 0) fail(`a commit touching map/enumerate.mjs with its Consumer: trailer passes the check (exit ${ok.status}): ${ok.stderr.trim()}`);
    const bare = commit('map/enumerate.mjs', '// 2\n', 'enumerate: list another kind\n\nNo trailer.');
    const red = check();
    if (red.status === 0 || !red.stderr.includes(bare.slice(0, 7))) fail(`a commit touching map/enumerate.mjs with no Consumer: trailer must fail the check, naming ${bare.slice(0, 7)} (exit ${red.status}): ${red.stderr.trim() || red.stdout.trim()}`);
  } catch (e) { fail(`the planted repository could not be built or read: ${e.message}`); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}
