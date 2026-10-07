// ── dependency-scan: manifest enumeration + lockfile coverage on real directories ──
// findManifests / isCoveredByLockfile / run() end to end: a manifest with real
// dependencies and no lockfile in its own directory, nor in an ancestor whose workspaces include it, is uncovered
// (never silently clean); zero package.json anywhere is the distinct
// not-applicable fact.
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run as runDependencyScan } from '../../map/dependency-scan.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'dependency-scan-manifests';

export async function run() {
  const fail = (m) => negFailures.push('dependency-scan-manifests: ' + m);
  const tmp = join(HERE, 'tmp-dep-manifests'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'covered'), { recursive: true });
  mkdirSync(join(tmp, 'uncovered'), { recursive: true });
  writeFileSync(join(tmp, 'covered', 'package.json'), JSON.stringify({ name: 'covered', dependencies: { left: '1.0.0' } }));
  writeFileSync(join(tmp, 'covered', 'package-lock.json'), JSON.stringify({ name: 'covered', lockfileVersion: 3, packages: {} }));
  writeFileSync(join(tmp, 'uncovered', 'package.json'), JSON.stringify({ name: 'uncovered', dependencies: { right: '1.0.0' } }));
  const doc = runDependencyScan({ target: tmp, timeout: 5, log: () => {} });
  const uncoveredPaths = doc.manifests.map((m) => m.path);
  if (!uncoveredPaths.includes('uncovered/package.json')) fail(`a manifest with dependencies and no lockfile anywhere up its tree must be recorded uncovered (got ${JSON.stringify(uncoveredPaths)})`);
  if (uncoveredPaths.includes('covered/package.json')) fail('a manifest whose own directory carries a lockfile must NOT be recorded uncovered');
  if (doc.noManifest !== false) fail('with real package.json files present, noManifest must be false');
  if (doc.exit !== 1) fail(`an uncovered manifest must make the document exit 1 (got ${doc.exit})`);
  rmSync(tmp, { recursive: true, force: true });

  const tmpEmpty = join(HERE, 'tmp-dep-empty'); rmSync(tmpEmpty, { recursive: true, force: true });
  mkdirSync(tmpEmpty, { recursive: true });
  writeFileSync(join(tmpEmpty, 'README.md'), '# nothing here\n');
  const docEmpty = runDependencyScan({ target: tmpEmpty, timeout: 5, log: () => {} });
  if (docEmpty.noManifest !== true) fail('a tree with zero package.json anywhere must record noManifest: true');
  if (docEmpty.manifests.length) fail('a tree with zero package.json anywhere must record zero uncovered manifests');
  if (docEmpty.exit !== 0) fail(`a tree with nothing to audit must exit 0 (not-applicable is not a failure, got ${docEmpty.exit})`);
  rmSync(tmpEmpty, { recursive: true, force: true });

  // (#53, F-1212) an ancestor lockfile covers a nested manifest only when that ancestor's
  // declared workspaces include it: npm never audits a manifest outside its workspaces, so a
  // root lockfile with no root package.json covers nothing below it, and examples/demo under
  // a root whose workspaces name packages/* is unaudited. Decided on #53, 2026-10-01; this
  // rewrites the earlier assertion that any ancestor lockfile covered any nested manifest.
  const tmpAncestor = join(HERE, 'tmp-dep-ancestor'); rmSync(tmpAncestor, { recursive: true, force: true });
  mkdirSync(join(tmpAncestor, 'packages', 'sub'), { recursive: true });
  writeFileSync(join(tmpAncestor, 'package-lock.json'), JSON.stringify({ name: 'root', lockfileVersion: 3, packages: {} }));
  writeFileSync(join(tmpAncestor, 'packages', 'sub', 'package.json'), JSON.stringify({ name: 'sub', dependencies: { left: '1.0.0' } }));
  const docAncestor = runDependencyScan({ target: tmpAncestor, timeout: 5, log: () => {} });
  if (!docAncestor.manifests.some((m) => m.path === 'packages/sub/package.json')) fail(`a root lockfile with no root package.json declares no workspaces, so packages/sub must read unaudited (got ${JSON.stringify(docAncestor.manifests)})`);
  rmSync(tmpAncestor, { recursive: true, force: true });

  const tmpWs = join(HERE, 'tmp-dep-workspaces'); rmSync(tmpWs, { recursive: true, force: true });
  mkdirSync(join(tmpWs, 'packages', 'sub'), { recursive: true });
  mkdirSync(join(tmpWs, 'examples', 'demo'), { recursive: true });
  writeFileSync(join(tmpWs, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  writeFileSync(join(tmpWs, 'package-lock.json'), JSON.stringify({ name: 'root', lockfileVersion: 3, packages: {} }));
  writeFileSync(join(tmpWs, 'packages', 'sub', 'package.json'), JSON.stringify({ name: 'sub', dependencies: { left: '1.0.0' } }));
  writeFileSync(join(tmpWs, 'examples', 'demo', 'package.json'), JSON.stringify({ name: 'demo', dependencies: { right: '1.0.0' } }));
  const docWs = runDependencyScan({ target: tmpWs, timeout: 5, log: () => {} });
  const wsPaths = docWs.manifests.map((m) => m.path);
  if (wsPaths.includes('packages/sub/package.json')) fail(`a manifest inside the root's workspaces globs is covered by the root lockfile (got ${JSON.stringify(wsPaths)})`);
  if (!wsPaths.includes('examples/demo/package.json')) fail(`examples/demo/package.json under a root lockfile, outside its workspaces, must read unaudited (got ${JSON.stringify(wsPaths)})`);
  // pnpm: the workspace list is pnpm-workspace.yaml's, `!` exclusions honoured
  rmSync(join(tmpWs, 'package-lock.json')); writeFileSync(join(tmpWs, 'package.json'), JSON.stringify({ name: 'root' }));
  writeFileSync(join(tmpWs, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  writeFileSync(join(tmpWs, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - 'examples/*'\n  - '!examples/demo'\n");
  const pnpmPaths = runDependencyScan({ target: tmpWs, timeout: 5, log: () => {} }).manifests.map((m) => m.path);
  if (pnpmPaths.includes('packages/sub/package.json')) fail(`a manifest pnpm-workspace.yaml includes is covered by the root pnpm-lock.yaml (got ${JSON.stringify(pnpmPaths)})`);
  if (!pnpmPaths.includes('examples/demo/package.json')) fail(`a manifest pnpm-workspace.yaml excludes with ! is not covered (got ${JSON.stringify(pnpmPaths)})`);
  rmSync(tmpWs, { recursive: true, force: true });

  // (#53, F-1212) a package.json that JSON.parse refuses was skipped, so a tree whose only
  // manifest carried a BOM or a trailing comma read no-manifest → not-applicable. A BOM is
  // stripped; a manifest that still does not parse is one nothing audited, never no manifest.
  const tmpBad = join(HERE, 'tmp-dep-unparseable'); rmSync(tmpBad, { recursive: true, force: true });
  mkdirSync(join(tmpBad, 'bom'), { recursive: true });
  mkdirSync(join(tmpBad, 'comma'), { recursive: true });
  writeFileSync(join(tmpBad, 'bom', 'package.json'), '﻿' + JSON.stringify({ name: 'bom', dependencies: { left: '1.0.0' } }));
  writeFileSync(join(tmpBad, 'comma', 'package.json'), '{ "name": "comma", "dependencies": { "right": "1.0.0", } }\n');
  const docBad = runDependencyScan({ target: tmpBad, timeout: 5, log: () => {} });
  const badPaths = docBad.manifests.map((m) => m.path);
  if (docBad.noManifest !== false) fail('a tree whose manifests carry a BOM or a trailing comma must not read noManifest');
  if (!badPaths.includes('bom/package.json')) fail(`a BOM-prefixed manifest with dependencies and no lockfile must be recorded uncovered (got ${JSON.stringify(badPaths)})`);
  const commaRow = docBad.manifests.find((m) => m.path === 'comma/package.json');
  if (!commaRow || commaRow.unparseable !== true) fail(`an unparseable manifest with no lockfile must be recorded as one nothing audited, marked unparseable (got ${JSON.stringify(commaRow)})`);
  if (docBad.exit !== 1) fail(`unaudited manifests must make the document exit 1 (got ${docBad.exit})`);
  const badRows = convert('dependency-scan', JSON.stringify(docBad), docBad.exit);
  const commaFact = badRows.find((r) => r.native_id === 'no-lockfile@comma/package.json');
  if (!commaFact || !/could not be parsed/.test(commaFact.observation)) fail(`ingest must say the unparseable manifest could not be parsed (got ${JSON.stringify(commaFact?.observation)})`);
  if (badRows.some((r) => r.native_category === 'no-manifest')) fail('ingest must write no no-manifest row for a tree that has manifests');
  rmSync(tmpBad, { recursive: true, force: true });

  // (#100) the repository's manifests only: a build run in place (fresh-clone --no-clone)
  // writes package.json files into gitignored output (dist/, .next/standalone/); those are
  // the instrument's own side effect, never manifests nothing audited. A git top level
  // counts only what it tracks (ignored and untracked paths are not the repository's); a
  // plain directory skips what its .gitignore files exclude. A tracked manifest with
  // dependencies and no lockfile still reads uncovered, so the filter hides nothing else.
  const plant = (dir) => {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    mkdirSync(join(dir, 'app'), { recursive: true });
    mkdirSync(join(dir, 'web', '.next', 'standalone'), { recursive: true });
    writeFileSync(join(dir, '.gitignore'), 'dist/\n.next/\n');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'root' }));
    writeFileSync(join(dir, 'app', 'package.json'), JSON.stringify({ name: 'app', dependencies: { left: '1.0.0' } }));
    writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify({ name: 'built', dependencies: { right: '1.0.0' } }));
    writeFileSync(join(dir, 'dist', 'package-lock.json'), JSON.stringify({ name: 'built', lockfileVersion: 3, packages: {} }));
    writeFileSync(join(dir, 'web', '.next', 'standalone', 'package.json'), JSON.stringify({ name: 'standalone', dependencies: { next: '1.0.0' } }));
  };
  const built = (p) => p.startsWith('dist/') || p.includes('/.next/');
  const outside = (doc, where) => {
    const lockPaths = doc.lockfiles.map((l) => l.path), manPaths = doc.manifests.map((m) => m.path);
    if (lockPaths.some(built)) fail(`${where}: a lockfile under a gitignored path must never be audited (got ${JSON.stringify(lockPaths)})`);
    if (manPaths.some(built)) fail(`${where}: a manifest under a gitignored path must never be recorded uncovered (got ${JSON.stringify(manPaths)})`);
    if (!manPaths.includes('app/package.json')) fail(`${where}: a manifest the repository keeps, with dependencies and no lockfile, must still read uncovered (got ${JSON.stringify(manPaths)})`);
  };
  const repo = mkdtempSync(join(tmpdir(), 'assay-dep-ignored-repo-'));
  plant(repo);
  mkdirSync(join(repo, 'scratch'), { recursive: true });
  const git = (args) => spawnSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=assay regression', ...args], { cwd: repo, encoding: 'utf8' });
  git(['init', '-q']); git(['add', '-A']);
  if (git(['commit', '-q', '-m', 'planted']).status !== 0) fail('test setup: could not commit the scratch repository');
  writeFileSync(join(repo, 'scratch', 'package.json'), JSON.stringify({ name: 'untracked', dependencies: { up: '1.0.0' } }));
  const docRepo = runDependencyScan({ target: repo, timeout: 5, log: () => {} });
  outside(docRepo, 'a git top level');
  if (docRepo.manifests.some((m) => m.path.startsWith('scratch/'))) fail(`a git top level: an untracked manifest is not the repository's and must never be recorded uncovered (got ${JSON.stringify(docRepo.manifests)})`);
  if (docRepo.scope?.rule !== 'tracked') fail(`a git top level must record the walk's scope as tracked (got ${JSON.stringify(docRepo.scope)})`);
  rmSync(repo, { recursive: true, force: true });
  const loose = mkdtempSync(join(tmpdir(), 'assay-dep-ignored-dir-'));
  plant(loose);
  const docLoose = runDependencyScan({ target: loose, timeout: 5, log: () => {} });
  outside(docLoose, 'a plain directory');
  if (docLoose.scope?.rule !== 'gitignore') fail(`a directory that is not a git top level must record the walk's scope as gitignore (got ${JSON.stringify(docLoose.scope)})`);
  rmSync(loose, { recursive: true, force: true });
}
