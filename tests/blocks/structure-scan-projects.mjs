// ── structure-scan: knip runs in every project the tree holds (issue #246) ──
// A catalog's entry under templates/<name>/ is a project of its own, which a knip run in the
// root alone never reads. map/projects.mjs finds the projects; knip runs in each one that holds a
// package.json. Pinned, with a fake npm whose knip reports one unused export in its cwd's
// src/util.js, or crashes in a project named `crashes`:
//   - knip runs in the root and in each nested project; an item is named from the root
//     (templates/alpha/src/util.js), and the record carries `roots`, one per project;
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
  const knipBin = `import { readFileSync } from 'node:fs';
const name = JSON.parse(readFileSync('package.json', 'utf8')).name;
if (name === 'crashes') { process.stderr.write('ERROR: Error loading vitest.config.ts (SyntaxError: planted)\\n'); process.exit(2); }
process.stdout.write(JSON.stringify({ issues: [{ file: 'src/util.js', exports: [{ name: 'unusedHelper', line: 3, col: 14 }] }] })); process.exit(1);
`;
  writeFileSync(join(bin, 'npm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
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
    const files = doc.unused.map((u) => `${u.file}:${u.name}`).sort();
    if (JSON.stringify(files) !== JSON.stringify(['src/util.js:unusedHelper', 'templates/alpha/src/util.js:unusedHelper'])) fail(`each project's items are named from the root; got ${JSON.stringify(files)}`);
    if (doc.exit !== 1) fail(`a project knip failed in turns the run's exit to 1 (got ${doc.exit})`);
    const beta = (k.roots || []).find((r) => r.root === 'templates/beta');
    if (!beta || !/SyntaxError: planted/.test(beta.reason || '')) fail(`the failed project carries its reason (got ${JSON.stringify(beta)})`);
    const rows = convert('structure-scan', JSON.stringify(doc), doc.exit);
    if (!rows.some((r) => r.native_id === 'unused-not-run@templates/beta' && r.polarity === 'fact')) fail(`ingest records the project knip failed in as a fact (got ${rows.map((r) => r.native_id).join(', ')})`);
    const rootItem = rows.find((r) => r.native_id === 'unused-exports@src/util.js:unusedHelper');
    const alphaItem = rows.find((r) => r.native_id === 'unused-exports@templates/alpha/src/util.js:unusedHelper');
    if (!rootItem || rootItem.detail?.unconfigured !== true) fail(`the root's item, read with no knip configuration, is flagged unconfigured (got ${JSON.stringify(rootItem?.detail)})`);
    if (!alphaItem || alphaItem.detail?.unconfigured) fail(`templates/alpha's item is read under its own knip.json, so it is not flagged (got ${JSON.stringify(alphaItem?.detail)})`);

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
