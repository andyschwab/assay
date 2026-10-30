// ── a whole-repository rule reads regular files only, so a nested repository cannot crash it (#216) ──
// `git ls-files --others` lists an untracked nested git repository as a directory entry (`dir/`), and
// core-names-no-scanner read every entry as a file: a scratch repository another block, or a concurrent run,
// left in the tree made it throw EISDIR. Pinned with a nested repository planted in the tree:
//   (a) repoFiles lists neither the repository's directory nor anything under it;
//   (b) the three rules that read every file (core-names-no-scanner, no-history-file, retired-names) run
//       over the tree without throwing;
//   (c) the harness blocks' scratch directories (tests/tmp-*) are ignored, so a scratch repository is not
//       listed at all.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, negFailures, repoFiles } from '../harness.mjs';

export const label = 'repo-files-nested';

const PROBE = join('tests', 'nested-repo-probe');

export async function run() {
  const fail = (m) => negFailures.push('repo-files-nested: ' + m);
  const dir = join(ROOT, PROBE);
  if (existsSync(dir)) { fail(`${PROBE} already exists; this block owns that name`); return; }
  try {
    mkdirSync(dir, { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'inside.txt'), 'a file inside a nested repository\n');

    // (a)
    const listed = repoFiles().filter((f) => f.startsWith(PROBE));
    if (listed.length) fail(`(a) repoFiles lists no part of a nested repository (got ${JSON.stringify(listed)})`);

    // (b)
    for (const name of ['core-names-no-scanner', 'no-history-file', 'retired-names']) {
      try { await (await import(`./${name}.mjs`)).run(); }
      catch (e) { fail(`(b) ${name} reads the tree with a nested repository in it without throwing (got ${e.message.split('\n')[0]})`); }
    }

    // (c)
    const ignored = spawnSync('git', ['check-ignore', '-q', join('tests', 'tmp-any', 'f')], { cwd: ROOT });
    if (ignored.status !== 0) fail('(c) the harness blocks\' scratch directories (tests/tmp-*) are ignored');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
