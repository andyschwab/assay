// ── fresh-clone and ingest find a lone application directory (#35) ──
// A repository that keeps its whole application in one directory beneath the root
// (`app/`, its own package.json there, none at the root) read "no package.json in the
// tree": six steps not declared and every README claim missing. fresh-clone must find
// that directory by structure-scan's rule (knipRoot: one directory directly beneath the
// root holding the only package.json) or take it from `--app <dir>`, run there, and
// replay the README's commands as a reader does after `cd <dir>`. Ingest must write
// evidence relative to the repository root: the app's manifest is `app/package.json:1`.
// An instrument run in a subdirectory of the run's target (fresh-clone <target>/app)
// is rebased onto the target, so the run validates with --target and no hand edit;
// one run outside the target is ingested as it is, with a warning naming both paths.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toScannersYaml } from '../../map/start.mjs';
import { HERE, ROOT, negFailures, convert } from '../harness.mjs';

export const label = 'fresh-clone-lone-app';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone-lone-app: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-lone-app');
  const tmp = join(HERE, 'tmp-fresh-clone-lone-app'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
  const freshClone = (target, extra, out) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), target, '--no-clone', ...extra, '--out', out, '--timeout', '120'], { encoding: 'utf8' });
    let doc = null; try { doc = JSON.parse(readFileSync(out, 'utf8')); } catch { /* none written */ }
    return { exit: r.status, doc, raw: existsSync(out) ? readFileSync(out, 'utf8') : '', stderr: r.stderr };
  };

  // (a) the lone directory, found: the steps run in app/, the README replays there
  const found = freshClone(fx, [], join(tmp, 'found.json'));
  if (found.exit !== 1) fail(`fresh-clone over the lone-app fixture must exit 1 (the planted deploy claim; got ${found.exit}: ${found.stderr.trim().split('\n').pop()})`);
  const checkApp = (doc, from, at) => {
    if (!doc) { fail(`${at}: no document written`); return; }
    if (!doc.app || doc.app.path !== 'app' || doc.app.from !== from) fail(`${at}: the document must record app {path: app, from: ${from}} (got ${JSON.stringify(doc.app)})`);
    const st = Object.fromEntries((doc.steps || []).map((s) => [s.name, s.status]));
    if (st.build !== 'passed' || st.test !== 'passed') fail(`${at}: build and test must run in app/ and pass (got build ${st.build}, test ${st.test})`);
    const claims = Object.fromEntries((doc.readme_claims || []).map((c) => [c.name, c.status]));
    if (claims.build !== 'present' || claims.test !== 'present' || claims.deploy !== 'missing') fail(`${at}: the README's commands must replay in app/ (build, test present; deploy missing; got ${JSON.stringify(claims)})`);
    if (doc.readme !== 'README.md') fail(`${at}: the README replayed is the root's, named from the root (got ${doc.readme})`);
  };
  checkApp(found.doc, 'lone-directory', 'found');

  // (b) the declared directory: --app app does the same; one that is not there, or leaves the tree, crashes
  checkApp(freshClone(fx, ['--app', 'app'], join(tmp, 'declared.json')).doc, '--app', '--app app');
  for (const bad of ['nope', '../fresh-clone-target']) {
    const r = freshClone(fx, ['--app', bad], join(tmp, 'bad.json'));
    if (r.exit !== 2) fail(`--app ${bad} must crash (exit 2), never run somewhere else (got ${r.exit})`);
  }

  // (c) ingest: the app's evidence is relative to the repository root
  if (found.doc) {
    const rows = convert('fresh-clone', found.raw, 1);
    const lint = rows.find((r) => r.native_id === 'lint:not-declared');
    if (!lint || lint.evidence[0] !== 'app/package.json:1') fail(`the app's lint row must cite app/package.json:1 (got ${lint && lint.evidence[0]})`);
    const claim = rows.find((r) => r.native_category === 'readme-claim');
    if (!claim || claim.evidence[0] !== 'README.md:11') fail(`the missing deploy claim must cite the root README, README.md:11 (got ${claim && claim.evidence[0]})`);
    const bad = rows.flatMap((r) => r.evidence).filter((e) => !existsSync(join(fx, e.replace(/:\d+$/, ''))));
    if (bad.length) fail(`every row must cite a path that exists from the repository root (not: ${bad.join(', ')})`);
  }

  // (d) the subdirectory run, rebased: fresh-clone <target>/app ingests with app/ evidence
  //     and validates with --target <target>, the run's target read from its own record
  const sub = freshClone(join(fx, 'app'), [], join(tmp, 'sub.json'));
  if (!sub.doc || sub.doc.app || sub.doc.target?.path !== resolve(fx, 'app')) fail(`fresh-clone run in app/ must record its own absolute root and no app (got ${JSON.stringify(sub.doc && { app: sub.doc.app, target: sub.doc.target })})`);
  const yaml = toScannersYaml('0000000', { 'fresh-clone': { status: 'skipped', reason: 'pending' } }, undefined, resolve(fx));
  if (!/^target: /m.test(yaml)) fail('the run record must carry the run\'s target root (target:)');
  const runDir = join(tmp, 'run');
  const st = assay(['start', '--out', runDir]);
  if (st.status !== 0) fail(`start --out (no target) must draw an empty run (got ${st.status}: ${(st.stderr || st.stdout).trim().split('\n').pop()})`);
  const mPath = join(runDir, 'map', 'scanners.yaml');
  if (existsSync(mPath)) writeFileSync(mPath, readFileSync(mPath, 'utf8').replace(/^scanners:/m, `${yaml.match(/^target: .*$/m)?.[0] ?? ''}\nscanners:`));
  const ing = assay(['ingest', runDir, '--tool', 'fresh-clone', '--raw', join(tmp, 'sub.json'), '--exit', String(sub.exit)]);
  if (ing.status !== 0) fail(`ingest of the subdirectory run must succeed (got ${ing.status}: ${(ing.stderr || ing.stdout).trim()})`);
  const findings = existsSync(join(runDir, 'map', 'findings', 'fresh-clone.yaml')) ? readFileSync(join(runDir, 'map', 'findings', 'fresh-clone.yaml'), 'utf8') : '';
  if (!/evidence: \["app\/package\.json:1"\]/.test(findings)) fail(`a fresh-clone run at <target>/app must ingest with app/-prefixed evidence (got ${JSON.stringify(findings.match(/evidence: .*/)?.[0])})`);
  if (/evidence: \["package\.json:1"\]/.test(findings)) fail('no row may cite the app\'s manifest as package.json:1 against the repository root');
  const val = assay(['validate', runDir, '--target', fx]);
  if (val.status !== 0) fail(`the rebased run must validate with --target <target> (got ${val.status}: ${(val.stdout + val.stderr).split('\n').filter((l) => /✗|evidence path/.test(l)).slice(0, 3).join(' | ')})`);

  // (e) the same for the other instruments that name their root: dependency-scan, repo-census
  const ds = { tool: 'dependency-scan', target: { path: resolve(fx, 'app') }, lockfiles: [], manifests: [{ path: 'package.json', status: 'no-lockfile' }], exit: 0 };
  const dsRows = convert('dependency-scan', JSON.stringify(ds), 0, null, { target: resolve(fx) });
  if (dsRows[0]?.evidence[0] !== 'app/package.json:1') fail(`dependency-scan run in app/ must rebase onto the target (got ${dsRows[0]?.evidence[0]})`);
  if (dsRows.scope?.relation !== 'inside') fail(`the rebase must be recorded as inside the target (got ${JSON.stringify(dsRows.scope)})`);
  const same = convert('fresh-clone', found.raw, 1, null, { target: resolve(fx) });
  if (same.scope?.relation !== 'same' || same.find((r) => r.native_id === 'lint:not-declared')?.evidence[0] !== 'app/package.json:1') fail('a document whose root is the target is ingested unchanged');

  // (f) a root outside the target: ingested as it is, with a warning naming both paths
  const elsewhere = join(HERE, 'instruments', 'fresh-clone-target');
  const outRows = convert('fresh-clone', sub.raw, sub.exit, null, { target: elsewhere });
  if (outRows.scope?.relation !== 'outside') fail(`a root outside the target must read outside (got ${JSON.stringify(outRows.scope)})`);
  if (outRows.some((r) => r.evidence.some((e) => e.startsWith('app/') || e.startsWith('..')))) fail('a root outside the target is never rebased');
  const run2 = join(tmp, 'run2');
  const st2 = assay(['start', '--out', run2]);
  const warn = assay(['ingest', run2, '--tool', 'fresh-clone', '--raw', join(tmp, 'sub.json'), '--exit', String(sub.exit), '--target', elsewhere]);
  if (st2.status !== 0 || warn.status !== 0) fail(`a root outside the target warns, never halts (got start ${st2.status}, ingest ${warn.status})`);
  if (!(warn.stderr.includes(resolve(fx, 'app')) && warn.stderr.includes(elsewhere) && /not the run's target/.test(warn.stderr))) fail(`the scope warning must name both paths (got ${JSON.stringify(warn.stderr.trim())})`);
  rmSync(tmp, { recursive: true, force: true });
}
