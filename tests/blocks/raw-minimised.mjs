// ── what a run archives carries no output tail or credential (issue #49) ──
// The routine uploads the whole run directory, map/raw/ included, as a workflow
// artifact, so the raw archive is minimised at ingest like gitleaks' is: a step's
// output tail and an audit's stderr tail (either may echo an environment value)
// never reach map/raw/, and a URL target is recorded with its userinfo stripped.
// `assay start` and the routine write each raw report inside a private mkdtemp
// directory, never at a guessable name in the shared temp directory.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { runAssayInstrument } from '../../map/start.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'raw-minimised';

export async function run() {
  const fail = (m) => negFailures.push('raw-minimised: ' + m);
  const PLANTED = 'inert-planted-env-value';                       // an inert planted string, never a real credential
  const tmp = join(HERE, 'tmp-raw-minimised'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const git = (args, cwd) => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, stdio: 'pipe' });
  try {
    // (a) a fresh-clone target whose build prints a planted environment value
    const target = join(tmp, 'target');
    cpSync(join(HERE, 'instruments', 'fresh-clone-target'), target, { recursive: true });
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    pkg.scripts.build = `node -e "console.log('ASSAY_PLANTED_TOKEN=${PLANTED}')"`;
    writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    git(['init', '-q'], target); git(['add', '.'], target); git(['commit', '-q', '-m', 'fixture'], target);
    // cloned through a URL target carrying userinfo (file:// with a host clones locally)
    const url = `file://inert-user:inert-planted-pass@localhost${target}`;
    const logs = [];
    const doc = runFreshClone({ target: url, timeout: 120, log: (m) => logs.push(m) });
    if (!JSON.stringify(doc.steps).includes(PLANTED)) fail('the fixture build must print the planted value (else this block proves nothing)');
    if (JSON.stringify(doc.target).includes('inert-planted-pass') || doc.target.path !== `file://localhost${target}`) fail(`a URL target must be recorded with its userinfo stripped (got ${doc.target.path})`);
    if (logs.some((l) => l.includes('inert-planted-pass'))) fail('the clone log line must not carry the URL userinfo');
    // (b) ingest: map/raw/ holds no tail, no planted value, no userinfo — root, workspace and dependency-scan alike
    const fcDoc = { ...doc, target: { ...doc.target, path: url }, workspaces: [{ path: 'apps/x', steps: doc.steps, readme: null, readme_claims: [] }] };
    const run = join(tmp, 'run'); mkdirSync(join(run, 'map', 'findings'), { recursive: true });
    writeFileSync(join(tmp, 'fc.json'), JSON.stringify(fcDoc));
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), run, '--tool', 'fresh-clone', '--raw', join(tmp, 'fc.json'), '--exit', String(doc.exit)], { stdio: 'pipe' });
    const fcRaw = readFileSync(join(run, 'map', 'raw', 'fresh-clone.json'), 'utf8');
    if (fcRaw.includes(PLANTED) || fcRaw.includes('output_tail')) fail('the archived fresh-clone report must carry no step output tail');
    if (fcRaw.includes('inert-planted-pass')) fail('the archived fresh-clone report must carry no URL userinfo');
    const fcArch = JSON.parse(fcRaw);
    if (!fcArch.steps.some((s) => s.name === 'build' && s.status === 'passed' && s.command) || fcArch.workspaces[0]?.steps.length !== doc.steps.length) fail('the archived fresh-clone report must keep every step with its status and command');
    const dsDoc = { tool: 'dependency-scan', exit: 1, lockfiles: [{ path: 'package-lock.json', status: 'failed', method: 'scratch-copy', npm_exit_code: 2, reason: 'npm audit failed', stderr_tail: `npm ERR! ${PLANTED}` }] };
    writeFileSync(join(tmp, 'ds.json'), JSON.stringify(dsDoc));
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), run, '--tool', 'dependency-scan', '--raw', join(tmp, 'ds.json'), '--exit', '1'], { stdio: 'pipe' });
    const dsRaw = readFileSync(join(run, 'map', 'raw', 'dependency-scan.json'), 'utf8');
    if (dsRaw.includes(PLANTED) || dsRaw.includes('stderr_tail')) fail('the archived dependency-scan report must carry no stderr tail');
    if (JSON.parse(dsRaw).lockfiles[0]?.reason !== 'npm audit failed') fail('the archived dependency-scan report must keep each lockfile row and its reason');
    // (c) start: a raw report is written in a private mkdtemp directory, never through a
    // pre-planted file or symlink at the guessable assay-start-<tool>-<pid>.json name
    const guessable = join(tmpdir(), `assay-start-repo-census-${process.pid}.json`);
    const victim = join(tmp, 'victim.txt'); writeFileSync(victim, '');
    rmSync(guessable, { force: true }); symlinkSync(victim, guessable);
    const before = new Set(readdirSync(tmpdir()).filter((f) => f.startsWith('assay-start-')));
    const run2 = join(tmp, 'run2'); mkdirSync(run2, { recursive: true });
    const res = runAssayInstrument({ tool: 'repo-census', cmd: 'repo-census', cliArgs: [join(HERE, 'instruments', 'repo-census-target')], okExits: [0, 1], outDir: run2, log: () => {} });
    if (res.status !== 'ran') fail(`repo-census must run over its fixture (got ${JSON.stringify(res)})`);
    if (readFileSync(victim, 'utf8') !== '') fail('a raw report must never be written through a file or symlink planted at the guessable temp name');
    const left = readdirSync(tmpdir()).filter((f) => f.startsWith('assay-start-') && !before.has(f));
    if (left.length) fail(`the private raw-report directory must be removed after ingest (left ${left.join(', ')})`);
    rmSync(guessable, { force: true });
  } catch (e) { fail(`threw: ${e.message}`); }
  rmSync(tmp, { recursive: true, force: true });
}
