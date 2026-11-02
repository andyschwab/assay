// ── fresh-clone over a tree's nested projects (#246), and a package manager not on PATH (#248) ──
// A catalog's root is a map: it installs and tests its own few files, and declares no build,
// lint or typecheck. Its entry under templates/<name>/ is a project of its own (its own
// package.json and lockfile), which a run that reads only the root never builds. Pinned:
//   - the entry is measured as a project of its own: its own install, build, lint, typecheck and
//     test, in its own directory, recorded under `projects[]` with its path;
//   - the root's undeclared build, lint and typecheck read `covered`, by the entry's passing steps,
//     and the root's own test still runs; ingest turns none of them into a gap, and the entry's
//     rows carry its path;
//   - an entry whose lockfile names pnpm, on a host with no pnpm on PATH, reads install skipped
//     with the reason (never failed, never exit 127), its later steps skipped with it, and ingest
//     records the not-run fact, never an install gap: the instrument's gap is not the target's;
//     npm is looked up the same way;
//   - a tree with no nested project carries no `projects` key.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HERE, ROOT, negFailures, convert } from '../harness.mjs';

export const label = 'fresh-clone-projects';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone-projects: ' + m);
  const tmp = join(HERE, 'tmp-fresh-clone-projects');
  const tree = join(tmp, 'tree');
  const put = (rel, text) => { mkdirSync(dirname(join(tree, rel)), { recursive: true }); writeFileSync(join(tree, rel), text); };
  const ok = 'node -e "process.exit(0)"';
  // an npm project with no dependencies: `npm ci` installs it offline from its own lockfile
  const npmProject = (rel, name, scripts) => {
    put(`${rel ? rel + '/' : ''}package.json`, JSON.stringify({ name, version: '1.0.0', private: true, scripts }, null, 2) + '\n');
    put(`${rel ? rel + '/' : ''}package-lock.json`, JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name, version: '1.0.0' } } }, null, 2) + '\n');
  };
  const fc = (env = process.env) => {
    const out = join(tmp, 'fresh-clone.json');
    rmSync(out, { force: true });
    let exit = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), tree, '--no-clone', '--out', out, '--timeout', '120'], { stdio: 'pipe', env }); }
    catch (e) { exit = e.status; }
    const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
    let doc = null; try { doc = JSON.parse(raw); } catch { /* none */ }
    return { exit, raw, doc };
  };
  const steps = (e) => Object.fromEntries((e?.steps || []).map((s) => [s.name, s]));

  try {
    // ── a catalog: the root tests its own files; the entry builds, lints, typechecks and tests ──
    rmSync(tmp, { recursive: true, force: true });
    npmProject('', 'catalog', { test: ok });
    npmProject('templates/alpha', 'alpha', { build: ok, lint: ok, typecheck: ok, test: ok });
    let { exit, raw, doc } = fc();
    if (!doc) { fail('the runner wrote no document over the catalog'); return; }
    if (exit !== 0 || doc.exit !== 0) fail(`the catalog passes everywhere, so the runner exits 0 (got ${exit}, document ${doc.exit})`);
    const alpha = (doc.projects || []).find((p) => p.path === 'templates/alpha');
    if (!alpha || (doc.projects || []).length !== 1) fail(`projects[] must hold templates/alpha alone (got ${JSON.stringify((doc.projects || []).map((p) => p.path))})`);
    const a = steps(alpha);
    for (const nm of ['install', 'build', 'lint', 'typecheck', 'test']) if (a[nm]?.status !== 'passed') fail(`templates/alpha's own ${nm} must run in its directory and pass (got ${a[nm]?.status} ${a[nm]?.reason || ''})`);
    const r = steps(doc);
    for (const nm of ['build', 'lint', 'typecheck']) {
      const by = r[nm]?.covered_by;
      if (r[nm]?.status !== 'covered' || !by || by.path !== 'templates/alpha') fail(`the root's undeclared ${nm} must read covered by templates/alpha's passing ${nm} (got ${r[nm]?.status} ${JSON.stringify(by)})`);
    }
    if (r.test?.status !== 'passed') fail(`the root's own test still runs (got ${r.test?.status})`);
    let rows = convert('fresh-clone', raw, 0);
    const gaps = rows.filter((x) => x.polarity === 'gap').map((x) => x.native_id);
    if (gaps.some((id) => /^(build|lint|typecheck):/.test(id))) fail(`a covered root step is no gap (got ${gaps.join(', ')})`);
    if (gaps.some((id) => id.startsWith('templates/alpha:') && !/^templates\/alpha:migrate/.test(id))) fail(`the entry's passing steps are no gap (got ${gaps.join(', ')})`);
    if (!rows.some((x) => x.native_id.startsWith('templates/alpha:'))) fail(`the entry's rows carry its path (got ${rows.map((x) => x.native_id).join(', ')})`);

    // ── #248: a pnpm entry on a host with no pnpm ──
    rmSync(tree, { recursive: true, force: true });
    npmProject('', 'catalog', { test: ok });
    put('templates/beta/package.json', JSON.stringify({ name: 'beta', private: true, packageManager: 'pnpm@9.0.0', scripts: { build: ok, test: ok }, dependencies: { 'left-pad': '1.3.0' } }, null, 2) + '\n');
    put('templates/beta/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    const bin = join(tmp, 'bin'); mkdirSync(bin, { recursive: true });
    symlinkSync(process.execPath, join(bin, 'node'));   // node alone: no pnpm, no corepack shim
    ({ exit, raw, doc } = fc({ ...process.env, PATH: bin }));
    const beta = (doc?.projects || []).find((p) => p.path === 'templates/beta');
    const b = steps(beta);
    if (!beta) fail(`projects[] must hold templates/beta (got ${JSON.stringify((doc?.projects || []).map((p) => p.path))})`);
    else {
      if (b.install?.status !== 'skipped' || !/pnpm .*is not on PATH/.test(b.install?.reason || '')) fail(`with no pnpm on PATH, install reads skipped, naming pnpm not on PATH (got ${b.install?.status} exit ${b.install?.exit_code} "${b.install?.reason || ''}")`);
      if (b.install?.exit_code === 127) fail('install never records the shell\'s 127: nothing was run');
      if (b.build?.status !== 'skipped' || !/install did not run/.test(b.build?.reason || '')) fail(`build is skipped with the install's reason (got ${b.build?.status} "${b.build?.reason || ''}")`);
    }
    const rootInstall = steps(doc).install;
    if (rootInstall?.status !== 'skipped' || !/npm .*is not on PATH/.test(rootInstall?.reason || '')) fail(`npm is looked up the same way: with none on PATH the root's install reads skipped (got ${rootInstall?.status} exit ${rootInstall?.exit_code} "${rootInstall?.reason || ''}")`);
    rows = raw ? convert('fresh-clone', raw, doc?.exit ?? 0) : [];
    if (rows.some((x) => x.native_id === 'templates/beta:install:failed')) fail('ingest must not read the missing package manager as the target\'s install failing');
    if (!rows.some((x) => x.native_id === 'templates/beta:install-not-run' && x.polarity === 'fact')) fail(`ingest records the install not run, as a fact (got ${rows.map((x) => x.native_id).join(', ')})`);

    // ── a flat tree: no projects key ──
    rmSync(tree, { recursive: true, force: true });
    npmProject('', 'flat', { build: ok, test: ok });
    ({ doc } = fc());
    if (!doc || doc.projects !== undefined) fail(`a tree with no nested project carries no projects key (got ${JSON.stringify(doc?.projects)})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
