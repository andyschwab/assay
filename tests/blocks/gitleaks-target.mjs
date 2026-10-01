// ── runGitleaks: the secret scan reads the target's own history, never an
// enclosing repository's (issue #51) ──
// gitleaks in git mode scans the history of whatever repository contains its
// --source, so a target that is a subdirectory of a larger checkout was measured
// against the enclosing repository's history, and its hits cited paths outside
// the target. A subdirectory of a repository is refused with a recorded reason —
// whatever is on PATH, so the harness answers the same with and without the
// binary; a directory in no repository at all is scanned in directory mode, its
// evidence relative to the target. The planted value is assembled at runtime so
// this file carries no new secret-shaped literal.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGitleaks } from '../../map/start.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'gitleaks-target';

export async function run() {
  const fail = (m) => negFailures.push('gitleaks-target: ' + m);
  const planted = `const key = "${'AKIA' + 'ABCDEFGHIJKLMNOP'}";\n`;
  const hasGitleaks = spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status === 0;
  const scratch = mkdtempSync(join(tmpdir(), 'assay-gitleaks-target-'));
  const logs = [];
  const findingsFile = (out) => join(out, 'map', 'findings', 'gitleaks.yaml');

  // a subdirectory of a repository whose history holds a planted value outside it
  const parent = join(scratch, 'parent');
  mkdirSync(join(parent, 'sub'), { recursive: true });
  writeFileSync(join(parent, 'planted.js'), planted);
  writeFileSync(join(parent, 'sub', 'clean.js'), 'export const ok = 1;\n');
  const git = (args) => spawnSync('git', args, { cwd: parent, encoding: 'utf8' });
  git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'assay regression']);
  git(['add', '-A']);
  if (git(['commit', '-q', '-m', 'planted']).status !== 0) fail('test setup: could not commit the scratch parent repository');
  const outSub = join(scratch, 'run-sub');
  const sub = runGitleaks(join(parent, 'sub'), outSub, (l) => logs.push(l), 'absent here');
  if (sub.status !== 'skipped' || !/not its git repository's top level/.test(sub.reason || '')) fail(`a subdirectory of a repository must be refused with the not-a-top-level reason, whatever is on PATH (got ${JSON.stringify(sub)})`);
  if (existsSync(findingsFile(outSub))) fail('a refused target must write no gitleaks rows — never the enclosing repository\'s hits');

  // the repository's own top level is still scanned in git mode, its own history read
  if (hasGitleaks) {
    const outTop = join(scratch, 'run-top');
    const top = runGitleaks(parent, outTop, (l) => logs.push(l), 'absent here');
    const rows = existsSync(findingsFile(outTop)) ? readFileSync(findingsFile(outTop), 'utf8') : '';
    if (top.status !== 'ran' || !/planted\.js:1/.test(rows)) fail(`a repository's own top level must be scanned and cite planted.js:1 (got ${JSON.stringify(top)}, rows ${JSON.stringify(rows.slice(0, 200))})`);
  }

  // a directory in no repository: directory mode, evidence relative to the target
  const loose = join(scratch, 'loose');
  mkdirSync(join(loose, 'lib'), { recursive: true });
  writeFileSync(join(loose, 'lib', 'k.js'), planted);
  if (spawnSync('git', ['-C', loose, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).status === 0) fail(`test setup: the temp directory ${tmpdir()} is inside a git repository, so the directory-mode case cannot be built`);
  const outLoose = join(scratch, 'run-loose');
  const lo = runGitleaks(loose, outLoose, (l) => logs.push(l), 'absent here');
  // the evidence element may be quoted (#53: ingest quotes every element) or bare
  if (hasGitleaks) {
    const rows = existsSync(findingsFile(outLoose)) ? readFileSync(findingsFile(outLoose), 'utf8') : '';
    if (lo.status !== 'ran' || !/evidence: \["?lib\/k\.js:1"?\]/.test(rows)) fail(`a directory in no repository must be scanned in directory mode, evidence relative to the target (got ${JSON.stringify(lo)}, rows ${JSON.stringify(rows.slice(0, 300))})`);
  } else if (lo.status !== 'skipped' || lo.reason !== 'absent here') fail(`with no binary, a directory in no repository must read skipped with the caller's absent reason (got ${JSON.stringify(lo)})`);

  // the engine's own disposition of its planted test values is tracked where gitleaks
  // reads it (CLAUDE.md rule 6): a .gitleaksignore at the root, every entry a
  // commit-pinned fingerprint, every entry under a comment that says why.
  const ignorePath = join(ROOT, '.gitleaksignore');
  if (!existsSync(ignorePath)) fail('.gitleaksignore must record the planted test values (CLAUDE.md rule 6) where gitleaks reads it');
  else {
    const lines = readFileSync(ignorePath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const entries = lines.filter((l) => !l.startsWith('#'));
    if (!entries.length) fail('.gitleaksignore must list at least one fingerprint');
    for (const e of entries) {
      if (!/^[0-9a-f]{40}:tests\/[^:]+:[\w-]+:\d+$/.test(e)) fail(`.gitleaksignore entry ${JSON.stringify(e)} must be a commit-pinned fingerprint under tests/ (the only place a planted value may live)`);
      const i = lines.indexOf(e);
      if (i === 0 || !lines[i - 1].startsWith('#') && !entries.includes(lines[i - 1])) fail(`.gitleaksignore entry ${JSON.stringify(e)} must sit under a comment giving its reason`);
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
