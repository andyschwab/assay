// ── structure-scan: knip runs in every project the tree holds (issue #246) ──
// A catalog's entry under templates/<name>/ is a project of its own, which a knip run in the
// root alone never reads. map/projects.mjs finds the projects; knip runs in each one that holds a
// package.json. Pinned, with a fake npm whose knip reports one unused export in its cwd's
// src/util.js, or crashes in a project named `crashes`:
//   - knip runs in the root and in each nested project; an item is named from the root
//     (templates/alpha/src/util.js), and the record carries `roots`, one per project; a file a
//     deeper project's knip read is that project's alone, never reported twice;
//   - each project installs its dependencies into a scratch copy of its own;
//   - a project knip failed in is named in `roots` with its reason, the run's exit is 1, and
//     ingest records it as a fact (`unused-not-run@templates/beta`) beside the rows of the
//     projects it ran in;
//   - an item is read under its own project's knip configuration: an entry with a knip.json is
//     configured, the root without one is not (`unconfigured` on the root's item alone);
//   - with no root package.json, two applications each with its own lockfile are two projects
//     (two without one stay not-applicable: tests/blocks/structure-scan-knip.mjs, case f);
//   - a tree with one project carries no `roots`: its record is as it always was.
import { writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'structure-scan-projects';

export async function run() {
  const fail = (m) => negFailures.push('structure-scan-projects: ' + m);
  const SS = await import('../../map/structure-scan.mjs');
  const tmp = join(HERE, 'tmp-structure-scan-projects');
  const tree = join(tmp, 'tree');
  const put = (rel, text) => { mkdirSync(dirname(join(tree, rel)), { recursive: true }); writeFileSync(join(tree, rel), text); };
  const project = (rel, name) => {
    const at = rel ? `${rel}/` : '';
    put(`${at}package.json`, JSON.stringify({ name, version: '1.0.0', private: true }) + '\n');
    put(`${at}package-lock.json`, '{}\n');
    put(`${at}src/util.js`, 'export const used = 1;\nexport const alsoUsed = 2;\nexport const unusedHelper = 3;\n');
    mkdirSync(join(tree, at, 'node_modules'), { recursive: true });   // installed: knip runs in place
  };
  const savedPath = process.env.PATH;
  // a PATH with a fake npm: `install --prefix` drops a knip (and a jscpd that exits 3) into the prefix
  const bin = join(tmp, 'bin'); mkdirSync(bin, { recursive: true });
  // the stand-in knip reports `unusedHelper` in every .js file under where it runs (node_modules aside)
  const knipBin = `import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const name = JSON.parse(readFileSync('package.json', 'utf8')).name;
if (name === 'crashes') { process.stderr.write('ERROR: Error loading vitest.config.ts (SyntaxError: planted)\\n'); process.exit(2); }
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []);
process.stdout.write(JSON.stringify({ issues: walk('.').sort().map((file) => ({ file, exports: [{ name: 'unusedHelper', line: 3, col: 14 }] })) })); process.exit(1);
`;
  writeFileSync(join(bin, 'npm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args[0] === 'ci') { mkdirSync('node_modules', { recursive: true }); process.exit(0); }
if (args[0] !== 'install') process.exit(1);
const prefix = args[args.indexOf('--prefix') + 1];
for (const spec of args.filter((a) => /^[a-z][\\w-]*@\\d/.test(a))) {
  const [name, version] = spec.split('@');
  const d = join(prefix, 'node_modules', name); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version, bin: { [name]: 'bin.mjs' } }));
  writeFileSync(join(d, 'bin.mjs'), name === 'knip' ? ${JSON.stringify(knipBin)} : "process.exit(3);\\n");
}
`);
  chmodSync(join(bin, 'npm'), 0o755);
  const scan = () => { process.env.PATH = `${bin}:${savedPath}`; try { return SS.run({ target: tree }); } finally { process.env.PATH = savedPath; } };

  try {
    // ── a catalog: the root, an entry knip reads, an entry knip crashes in ──
    rmSync(tree, { recursive: true, force: true });
    project('', 'catalog');
    project('templates/alpha', 'alpha');
    put('templates/alpha/knip.json', '{}\n');
    project('templates/beta', 'crashes');
    const doc = scan();
    const k = doc.tools.knip;
    const roots = (k.roots || []).map((r) => `${r.root}:${r.status}`);
    if (JSON.stringify(roots) !== JSON.stringify(['.:ran', 'templates/alpha:ran', 'templates/beta:failed'])) fail(`knip runs in the root and each nested project, each recorded in roots; got ${JSON.stringify(k.roots)}`);
    if (k.status !== 'ran') fail(`knip ran in a project, so its record reads ran (got ${k.status} ${k.reason || ''})`);
    // the root's knip reaches into both entries: alpha's file is alpha's alone (knip ran there),
    // beta's stays the root's (knip failed in beta)
    const files = doc.unused.map((u) => u.file).sort();
    if (JSON.stringify(files) !== JSON.stringify(['src/util.js', 'templates/alpha/src/util.js', 'templates/beta/src/util.js'])) fail(`each project's items are named from the root, and a file a deeper project's knip read is reported once; got ${JSON.stringify(files)}`);
    if (doc.exit !== 1) fail(`a project knip failed in turns the run's exit to 1 (got ${doc.exit})`);
    const beta = (k.roots || []).find((r) => r.root === 'templates/beta');
    if (!beta || !/SyntaxError: planted/.test(beta.reason || '')) fail(`the failed project carries its reason (got ${JSON.stringify(beta)})`);
    const rows = convert('structure-scan', JSON.stringify(doc), doc.exit);
    if (!rows.some((r) => r.native_id === 'unused-not-run@templates/beta' && r.polarity === 'fact')) fail(`ingest records the project knip failed in as a fact (got ${rows.map((r) => r.native_id).join(', ')})`);
    const rootItem = rows.find((r) => r.native_id === 'unused-exports@src/util.js:unusedHelper');
    const alphaItem = rows.find((r) => r.native_id === 'unused-exports@templates/alpha/src/util.js:unusedHelper');
    if (!rootItem || rootItem.detail?.unconfigured !== true) fail(`the root's item, read with no knip configuration, is flagged unconfigured (got ${JSON.stringify(rootItem?.detail)})`);
    if (!alphaItem || alphaItem.detail?.unconfigured) fail(`templates/alpha's item is read under its own knip.json, so it is not flagged (got ${JSON.stringify(alphaItem?.detail)})`);

    // ── ingest refuses a roots list naming a project twice, or outside the tree ──
    for (const bad of [['.', '.'], ['.', '../x'], ['.', '/abs']]) {
      const d = JSON.parse(JSON.stringify(doc));
      d.tools.knip.roots = d.tools.knip.roots.slice(0, 2).map((r, i) => ({ ...r, root: bad[i] }));
      let threw = false; try { convert('structure-scan', JSON.stringify(d), d.exit); } catch { threw = true; }
      if (!threw) fail(`ingest refuses knip roots ${JSON.stringify(bad)}`);
    }

    // ── each project installs into its own scratch copy: one project's files never reach another's run ──
    rmSync(tree, { recursive: true, force: true });
    for (const [name, only] of [['alpha', 'alpha-only'], ['beta', 'beta-only']]) {
      put(`templates/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', private: true, dependencies: { dep: '1.0.0' } }) + '\n');
      put(`templates/${name}/package-lock.json`, '{}\n');
      put(`templates/${name}/src/${only}.js`, 'export const unusedHelper = 3;\n');
    }
    const sep = scan();
    const sepFiles = sep.unused.map((u) => u.file).sort();
    if (JSON.stringify(sepFiles) !== JSON.stringify(['templates/alpha/src/alpha-only.js', 'templates/beta/src/beta-only.js'])) fail(`each project's dependencies install into a scratch copy of its own, so no item names a file the project does not hold; got ${JSON.stringify(sepFiles)}`);

    // ── no root manifest, two applications each with its own lockfile: knip runs in both ──
    rmSync(tree, { recursive: true, force: true });
    project('api', 'api');
    project('web', 'web');
    const two = scan();
    const tr = (two.tools.knip.roots || []).map((r) => `${r.root}:${r.status}`);
    if (JSON.stringify(tr) !== JSON.stringify(['api:ran', 'web:ran'])) fail(`with no root package.json, two applications that install on their own are two projects knip reads; got ${JSON.stringify(two.tools.knip)}`);

    // ── one project: the record as it always was ──
    rmSync(tree, { recursive: true, force: true });
    project('', 'flat');
    const flat = scan();
    if (flat.tools.knip.roots !== undefined || flat.tools.knip.status !== 'ran' || flat.tools.knip.root !== '.') fail(`a tree with one project carries no roots, and knip's record reads as before (got ${JSON.stringify(flat.tools.knip)})`);
  } finally {
    process.env.PATH = savedPath;
    rmSync(tmp, { recursive: true, force: true });
  }
}
