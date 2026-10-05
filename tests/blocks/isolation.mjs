// ── isolation (#47): the target's code never runs with the evaluator's environment ──
// fresh-clone and dependency-scan spawn the target's package manager. Pinned: (a) a child
// of either instrument sees only the allow-listed environment names — PATH, HOME, CI, the
// npm_config_* values the runner sets and the proxy/CA plumbing (#65), a proxy URL carrying
// userinfo dropped with the reason on the row — never a credential the evaluator's shell holds;
// (b) every audit runs in a scratch directory holding only the manifest and the lockfile,
// so a planted .yarnrc (yarn-path → the target's own script) never runs and cannot forge
// a clean audit; (c) `assay start <target>` runs fresh-clone (the target's install,
// lifecycle scripts and test) only under --allow-exec, recording it skipped with the
// reason otherwise; (d) a workspace path never leaves the tree or reaches the shell
// unquoted, and the README claim check refuses a sibling sharing the tree's prefix.
// tests/instruments/exec-planted carries the planted doors; tests/instruments/isolation-shims
// stands in for npm and yarn offline, recording every call (cwd, files, env names).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { planWorkspace, runStep as runFreshCloneStep, resolveWorkspaces as resolveFreshCloneWorkspaces, claimPresent as freshCloneClaimPresent } from '../../map/fresh-clone.mjs';
import { run as runDependencyScan } from '../../map/dependency-scan.mjs';
import { TOOLS as STRUCTURE_TOOLS } from '../../map/structure-scan.mjs';
import { scannersPath as runScannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'isolation';

export async function run() {
  const fail = (m) => negFailures.push('isolation: ' + m);
  // the network plumbing (#65): passed through only while the proxy URL carries no userinfo
  const PLUMBING = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];
  const ALLOWED = new Set(['PATH', 'HOME', 'CI', 'npm_config_fund', 'npm_config_audit', 'npm_config_update_notifier', ...PLUMBING]);
  const SHELL_SET = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);   // names a POSIX shell sets itself
  const PLANTED = 'ASSAY_PLANTED_TOKEN';                         // an inert planted name, never a real credential
  const tmp = join(HERE, 'tmp-isolation'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const recordsPath = join(tmp, 'records.ndjson');
  const records = () => existsSync(recordsPath) ? readFileSync(recordsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const markers = (dir) => existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('planted-ran-')) : [];
  const savedPath = process.env.PATH, savedPlanted = process.env[PLANTED], savedDb = process.env.DATABASE_URL;
  const savedPlumbing = Object.fromEntries(PLUMBING.map((n) => [n, process.env[n]]));
  const CLEAN_PROXY = 'http://127.0.0.1:1', USERINFO_PROXY = 'http://planted-user:inert-planted-value@127.0.0.1:1';
  try {
    process.env[PLANTED] = 'inert-planted-value';
    process.env.DATABASE_URL = 'postgres://inert-planted-value@127.0.0.1:1/none';
    process.env.HTTPS_PROXY = CLEAN_PROXY; process.env.HTTP_PROXY = CLEAN_PROXY; process.env.NO_PROXY = 'localhost';
    process.env.NODE_EXTRA_CA_CERTS = join(tmp, 'planted-ca.pem'); process.env.SSL_CERT_FILE = join(tmp, 'planted-ca.pem');

    // (a) fresh-clone: a step's own process sees the allow-list and nothing else
    const step = runFreshCloneStep('test', `node -e "process.stdout.write('ENV:' + Object.keys(process.env).sort().join(','))"`, tmp, 30);
    const seen = ((step.output_tail || '').match(/ENV:(\S*)/) || [])[1];
    if (step.status !== 'passed' || seen === undefined) fail(`the env probe step must run (got ${step.status}: ${step.output_tail})`);
    else {
      const extra = seen.split(',').filter((n) => n && !ALLOWED.has(n) && !SHELL_SET.has(n));
      if (extra.length) fail(`a fresh-clone step must see only the allow-listed environment names (also saw ${extra.join(', ')})`);
      const missing = PLUMBING.filter((n) => !seen.split(',').includes(n));
      if (missing.length) fail(`a fresh-clone step must receive the network plumbing while the proxy URL carries no userinfo (#65; missing ${missing.join(', ')})`);
      if (step.env_note) fail(`a step whose plumbing all passed through must carry no env_note (got ${step.env_note})`);
    }

    // (a2) a proxy URL carrying user:pass@ is dropped, the rest of the plumbing still passes,
    // and the step's own row records why (#65)
    process.env.HTTPS_PROXY = USERINFO_PROXY;
    const dropStep = runFreshCloneStep('test', `node -e "process.stdout.write('ENV:' + Object.keys(process.env).sort().join(','))"`, tmp, 30);
    const dropSeen = (((dropStep.output_tail || '').match(/ENV:(\S*)/) || [])[1] || '').split(',');
    if (dropSeen.includes('HTTPS_PROXY')) fail('a proxy URL carrying userinfo must never reach a fresh-clone step');
    if (!dropSeen.includes('HTTP_PROXY') || !dropSeen.includes('NODE_EXTRA_CA_CERTS')) fail(`dropping a userinfo proxy URL must not drop the rest of the plumbing (saw ${dropSeen.join(', ')})`);
    if (!/HTTPS_PROXY/.test(dropStep.env_note || '') || !/userinfo/.test(dropStep.env_note || '')) fail(`a step run with a userinfo proxy URL dropped must record why on its row, naming the variable (got env_note ${JSON.stringify(dropStep.env_note)})`);
    if (/inert-planted-value|planted-user/.test(JSON.stringify(dropStep))) fail('the row recording a dropped proxy URL must never carry the URL\'s userinfo');
    process.env.HTTPS_PROXY = CLEAN_PROXY;

    // (b) dependency-scan over the planted target: audits in scratch, nothing planted runs
    const target = join(tmp, 'target');
    cpSync(join(HERE, 'instruments', 'exec-planted'), target, { recursive: true });
    process.env.PATH = `${join(HERE, 'instruments', 'isolation-shims')}:${savedPath}`;
    const doc = runDependencyScan({ target, timeout: 30, log: () => {} });
    if (markers(target).length) fail(`dependency-scan ran the target's own code (${markers(target).join(', ')}): the audit read the target's .yarnrc`);
    const audits = records().filter((r) => r.args[0] === 'audit');
    if (audits.length !== 2) fail(`dependency-scan must audit both lockfiles through the package manager itself (got ${audits.length} audit call(s): ${audits.map((r) => r.tool).join(', ')})`);
    for (const r of audits) {
      if (r.cwd === target || r.cwd.startsWith(target + '/')) fail(`${r.tool} audit must run in a scratch directory, never inside the target (ran in ${r.cwd})`);
      const lock = r.tool === 'yarn' ? 'yarn.lock' : 'package-lock.json';
      if (r.files.join() !== ['package.json', lock].sort().join()) fail(`${r.tool} audit's directory must hold only package.json and ${lock} (held ${r.files.join(', ')})`);
      const extra = r.env.filter((n) => !ALLOWED.has(n));
      if (extra.length) fail(`${r.tool} audit must see only the allow-listed environment names (also saw ${extra.join(', ')})`);
      const missing = PLUMBING.filter((n) => !r.env.includes(n));
      if (missing.length) fail(`${r.tool} audit must receive the network plumbing while the proxy URL carries no userinfo (#65; missing ${missing.join(', ')})`);
    }
    if (doc.lockfiles.some((l) => l.env_note)) fail(`a lockfile audited with all its plumbing passed through must carry no env_note (got ${JSON.stringify(doc.lockfiles.map((l) => l.env_note))})`);
    process.env.HTTPS_PROXY = USERINFO_PROXY;
    const before = records().length;
    const dropDoc = runDependencyScan({ target, timeout: 30, log: () => {} });
    if (!dropDoc.lockfiles.length || dropDoc.lockfiles.some((l) => !/HTTPS_PROXY/.test(l.env_note || ''))) fail(`every dependency-scan lockfile row run with a userinfo proxy URL dropped must record why (got ${JSON.stringify(dropDoc.lockfiles.map((l) => [l.path, l.env_note]))})`);
    if (/inert-planted-value|planted-user/.test(JSON.stringify(dropDoc))) fail('a dependency-scan report must never carry a dropped proxy URL\'s userinfo');
    const dropAudits = records().slice(before).filter((r) => r.args[0] === 'audit');
    if (dropAudits.length !== 2 || dropAudits.some((r) => r.env.includes('HTTPS_PROXY') || !r.env.includes('NODE_EXTRA_CA_CERTS'))) fail(`a proxy URL carrying userinfo must never reach a package manager's audit, and the rest of the plumbing still must (got ${JSON.stringify(dropAudits.map((r) => [r.tool, r.env.filter((n) => PLUMBING.includes(n))]))})`);
    process.env.HTTPS_PROXY = CLEAN_PROXY;
    if (doc.lockfiles.some((l) => l.status !== 'audited')) fail(`both planted lockfiles audit through the shims (got ${JSON.stringify(doc.lockfiles.map((l) => [l.path, l.status, l.reason]))})`);

    // (c) start without --allow-exec: fresh-clone recorded skipped, no install or script runs
    const git = (args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' });
    git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'assay regression']);
    git(['add', '-A']);
    if (git(['commit', '-q', '-m', 'init']).status !== 0) fail('could not git-init the planted target');
    rmSync(recordsPath, { force: true });
    const runDir = join(tmp, 'run');
    let startOut = '';
    try { startOut = execFileSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', runDir, target], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { startOut = String(e.stdout || '') + String(e.stderr || ''); }
    const rows = existsSync(runScannersPath(runDir)) ? (parseYaml(readFileSync(runScannersPath(runDir), 'utf8')).scanners || {}) : {};
    const fc = rows['fresh-clone'];
    if (fc?.status !== 'skipped' || !/--allow-exec/.test(fc.reason || '') || !/target's own/.test(fc.reason || '')) fail(`without --allow-exec, start must record fresh-clone skipped, saying it runs the target's own code and naming --allow-exec (got ${JSON.stringify(fc)})`);
    if (rows['dependency-scan']?.status !== 'ran') fail(`start still runs dependency-scan (scratch-only, no target code) without --allow-exec (got ${JSON.stringify(rows['dependency-scan'])})`);
    // structure-scan's own tools (#108) are the one install allowed: the pinned jscpd / knip specs
    // only, scripts off, into a prefix outside the target — never the target's own dependencies
    const toolSpecs = Object.entries(STRUCTURE_TOOLS).map(([n, v]) => `${n}@${v}`);
    const toolInstall = (a) => a[0] === 'install' && a.includes('--ignore-scripts') && a.indexOf('--prefix') > 0 && !resolve(a[a.indexOf('--prefix') + 1]).startsWith(resolve(target))
      && a.filter((x) => !x.startsWith('--') && x !== 'install' && x !== a[a.indexOf('--prefix') + 1]).every((x) => toolSpecs.includes(x));
    const ranTarget = records().filter((r) => r.args[0] !== 'audit' && r.args[0] !== '--version' && !toolInstall(r.args));
    if (ranTarget.length) fail(`start without --allow-exec ran the target's own install or scripts (${ranTarget.map((r) => `${r.tool} ${r.args.join(' ')}`).join(' | ')})`);
    if (markers(target).length) fail(`start without --allow-exec ran planted code (${markers(target).join(', ')})`);
    if (!/✓ assay validate/.test(startOut)) fail(`a start that skipped fresh-clone must still validate green (got:\n${startOut})`);
  } finally {
    process.env.PATH = savedPath;
    if (savedPlanted === undefined) delete process.env[PLANTED]; else process.env[PLANTED] = savedPlanted;
    if (savedDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedDb;
    for (const [n, v] of Object.entries(savedPlumbing)) if (v === undefined) delete process.env[n]; else process.env[n] = v;
  }

  // (d) workspace paths and README claims stay inside the tree
  const ws = join(tmp, 'ws');
  mkdirSync(join(ws, 'apps', 'my app'), { recursive: true });
  mkdirSync(join(tmp, 'outside'), { recursive: true });
  writeFileSync(join(ws, 'apps', 'my app', 'package.json'), '{"name":"spaced"}');
  writeFileSync(join(tmp, 'outside', 'package.json'), '{"name":"outside"}');
  const wsPaths = resolveFreshCloneWorkspaces(ws, { workspaces: ['apps/*', '../outside'] });
  if (wsPaths.join() !== 'apps/my app') fail(`a workspace pattern with a ".." segment must never resolve outside the tree (got ${JSON.stringify(wsPaths)})`);
  const lockTc = { family: 'node', package_manager: 'npm', lockfile: 'package-lock.json' };
  const wsPlan = planWorkspace(lockTc, { family: 'node', package_manager: 'npm', lockfile: null, has_dependencies: true }, { name: 'spaced', dependencies: { x: '1' } }, 'apps/my app');
  if (wsPlan.install.command !== "npm ci --workspace 'apps/my app'") fail(`a workspace path must reach the shell quoted (got ${wsPlan.install.command})`);
  mkdirSync(join(tmp, 'ws-sibling'), { recursive: true });
  writeFileSync(join(tmp, 'ws-sibling', 'x.js'), '');
  if (freshCloneClaimPresent({ kind: 'node-file', name: '../ws-sibling/x.js' }, ws, {})) fail('a README node-file claim resolving to a sibling directory that shares the tree\'s prefix must read missing, never present');
  // (e) the front door and the help banner say the two instruments execute the target's code
  if (!/\*\*Two instruments execute the target's code\.\*\*/.test(readFileSync(join(ROOT, 'README.md'), 'utf8'))) fail('README must say plainly that fresh-clone and dependency-scan execute the target\'s code');
  const helpOut = execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'help'], { encoding: 'utf8' });
  if (!/fresh-clone and dependency-scan execute the target's code/.test(helpOut) || !/--allow-exec/.test(helpOut)) fail('`assay help` must say fresh-clone and dependency-scan execute the target\'s code, and name --allow-exec');
  rmSync(tmp, { recursive: true, force: true });
}
