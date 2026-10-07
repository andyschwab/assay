// ── map/start.mjs: `assay start` makes a run, draws it, and records the rest ──
// `assay start` (unlike the routine) runs fresh-clone in its DEFAULT clone
// mode, never --no-clone: a person's own checkout is not a fresh CI checkout,
// and running fresh-clone in place would install into their working tree and
// measure uncommitted state. That means fresh-clone-target — a plain
// directory, no .git (the routine test above runs it with --no-clone, which
// never clones) — is not a usable target here: `git clone` refuses a source
// with no .git at all, offline or not. A real target IS a git repository, so
// this wraps a throwaway copy of the fixture in `git init` once, in the temp
// dir, so the clone stays a same-machine, no-network filesystem clone.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, chmodSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { scannersPath as runScannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'start';

export async function run() {
  const fail = (m) => negFailures.push('start: ' + m);
  const tmp = join(HERE, 'tmp-start'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const target = join(tmp, 'target');
  cpSync(join(HERE, 'instruments', 'fresh-clone-target'), target, { recursive: true });
  const git = (args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'assay regression']);
  git(['add', '-A']);
  const committed = git(['commit', '-q', '-m', 'init']);
  if (committed.status !== 0) fail(`could not git-init the scratch target (${committed.stderr})`);

  const runDir = join(tmp, 'run');
  const start = execFileSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', runDir, target, '--allow-exec'], { encoding: 'utf8' });
  const manifestPath = runScannersPath(runDir);
  if (!existsSync(manifestPath)) fail('start must write map/scanners.yaml');
  else {
    const manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
    if (!manifest.engine) fail('start must record engine:');
    const rows = manifest.scanners || {};
    const adopted = adoptedAdapters(loadAdapters());
    for (const id of Object.keys(adopted)) if (!rows[id]) fail(`start must record a row for every adopted scanner (missing ${id})`);
    if (rows['repo-census']?.status !== 'ran') fail(`repo-census needs no network and must read ran (got ${JSON.stringify(rows['repo-census'])})`);
    if (rows['dependency-scan']?.status !== 'ran') fail(`dependency-scan needs no network against this lockfile-free fixture and must read ran (got ${JSON.stringify(rows['dependency-scan'])})`);
    if (rows['fresh-clone']?.status !== 'ran') fail(`fresh-clone (--allow-exec, default clone mode, a real local git target) must read ran (got ${JSON.stringify(rows['fresh-clone'])})`);
    for (const id of ['repo-eval', 'deep-code-review']) {
      const r = rows[id];
      if (r?.status !== 'skipped') fail(`${id} must be recorded skipped by start (got ${JSON.stringify(r)})`);
      else if (!/not yet run: a steward session runs it/.test(r.reason || '') || !r.reason.includes(`node assay.mjs record <run> ${id} ran`))
        fail(`${id}'s skip reason must say it has not run yet and name the exact record command (got ${JSON.stringify(r.reason)})`);
    }
    if (!rows['gitleaks'] || !['ran', 'skipped'].includes(rows['gitleaks'].status)) fail(`gitleaks must be recorded ran or skipped, never absent (got ${JSON.stringify(rows['gitleaks'])})`);
    if (rows['gitleaks']?.status === 'skipped' && rows['gitleaks'].reason !== 'gitleaks binary not on PATH where this run was drawn')
      fail(`gitleaks-absent must carry start's own reason, verbatim (got ${JSON.stringify(rows['gitleaks'].reason)})`);
  }
  if (!/✓ assay validate/.test(start)) fail(`start must run validate and print its verdict (got:\n${start})`);
  const val = execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), runDir, '--target', target], { encoding: 'utf8' });
  if (!/^✓ assay validate/.test(val)) fail(`validate must pass over a run start just drew (got:\n${val})`);

  // start refuses an existing run — nothing is redrawn in place.
  let refused = null;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', runDir, target], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { refused = e; }
  if (!refused) fail('start over an existing map/scanners.yaml must refuse, not redraw it');
  else if (refused.status !== 2) fail(`start refusing an existing run must exit 2 (got ${refused.status})`);
  else if (!/already exists/.test(String(refused.stderr))) fail(`start's refusal must say the manifest already exists (got: ${refused.stderr})`);

  // start with no target: every adopted scanner skipped, still validates green
  // (a run whose instruments run elsewhere — a child session publishing its
  // own documents — still starts with a valid record).
  const runDirNoTarget = join(tmp, 'run-no-target');
  const startNT = execFileSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', runDirNoTarget], { encoding: 'utf8' });
  const manifestNT = parseYaml(readFileSync(runScannersPath(runDirNoTarget), 'utf8'));
  const rowsNT = manifestNT.scanners || {};
  const adopted = adoptedAdapters(loadAdapters());
  for (const id of Object.keys(adopted)) {
    const r = rowsNT[id];
    if (r?.status !== 'skipped') fail(`with no target, ${id} must be recorded skipped (got ${JSON.stringify(r)})`);
    else if (r.reason !== 'not yet run: ingesting its report records it ran') fail(`with no target, ${id}'s reason must be the generic one, verbatim (got ${JSON.stringify(r.reason)})`);
  }
  if (!/✓ assay validate/.test(startNT)) fail(`start with no target must still validate green (got:\n${startNT})`);

  // an instrument that recorded one of its own tools skipped or failed says so on
  // the console, with the reason's first sentence (#129): structure-scan over
  // tests/instruments/structure-monorepo, its pnpm lockfile's package manager off
  // PATH, reads knip skipped. A fake npm installs a knip and a jscpd that are never
  // reached or exit 3; every PATH directory holding a pnpm is dropped (start runs
  // its instruments with this node, never one from PATH).
  const ssTarget = join(tmp, 'structure-monorepo');
  cpSync(join(HERE, 'instruments', 'structure-monorepo'), ssTarget, { recursive: true });
  const fakeBin = join(tmp, 'path-no-pnpm'); mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(fakeBin, 'npm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
const args = process.argv.slice(2);
if (args[0] !== 'install') process.exit(1);
const prefix = args[args.indexOf('--prefix') + 1];
for (const spec of args.filter((a) => /^[a-z][\\w-]*@\\d/.test(a))) {
  const [name, version] = spec.split('@');
  const d = join(prefix, 'node_modules', name); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version, bin: { [name]: 'bin.mjs' } }));
  writeFileSync(join(d, 'bin.mjs'), "process.exit(3);\\n");
}
`);
  chmodSync(join(fakeBin, 'npm'), 0o755);
  const noPnpm = (process.env.PATH || '').split(delimiter).filter((d) => d && !existsSync(join(d, 'pnpm')));
  const ssStart = spawnSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', join(tmp, 'run-structure'), ssTarget, '--allow-exec'], { encoding: 'utf8', env: { ...process.env, PATH: [fakeBin, ...noPnpm].join(delimiter) } });
  const ssOut = String(ssStart.stdout || '');
  const knipLine = ssOut.split('\n').find((l) => /structure-scan: knip skipped/.test(l));
  if (!knipLine) fail(`start must log structure-scan's knip skipped on its own line (got:\n${ssOut}${ssStart.stderr || ''})`);
  else if (!/· structure-scan: knip skipped — the target's dependencies are not installed \(no node_modules at the root\);.* pnpm \(named by pnpm-lock\.yaml\) is not on PATH/.test(knipLine)) fail(`the knip line must carry the reason's first sentence (got: ${knipLine})`);
  if (!/· structure-scan: jscpd failed — jscpd exited 3/.test(ssOut)) fail(`start must log every tool an instrument recorded failed, not only knip (got:\n${ssOut})`);

  rmSync(tmp, { recursive: true, force: true });
}
