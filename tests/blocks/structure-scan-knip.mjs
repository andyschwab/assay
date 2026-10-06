// ── structure-scan: knip needs the target's installed dependencies (#118) ──────
// knip loads the target's own tool configuration files to find entry points, and those
// import the target's dependencies, so over a bare checkout it cannot run. Pinned here,
// with a fake npm (whose knip stands in for the real one), a fake pnpm and
// tests/instruments/structure-monorepo (a pnpm workspace whose vitest.config.ts imports
// vitest/config, declared but not installed):
//   (a) no node_modules and a lockfile: the dependencies install into a SCRATCH COPY with
//       the lockfile's package manager (frozen, scripts ignored), knip runs there and reads
//       ran, and the target itself is never written to;
//   (b) that package manager not on PATH, or its install failing, reads knip skipped with
//       the reason (the package manager named), never failed and never clean;
//   (c) no lockfile to say which package manager: knip runs in place, and a config it
//       cannot load for a missing module reads skipped with the module named;
//   (d) a crash with dependencies present still reads failed, and the reason keeps the
//       first ERROR lines knip printed, not only its last line.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'structure-scan-knip';

const MISSING = [
  "ERROR: Error loading vitest.config.ts (Cannot find module 'vitest/config')",
  'ERROR: Please fix or visit https://knip.dev/reference/known-issues',
];
const CRASH = [
  'ERROR: Error loading vitest.config.ts (SyntaxError: Unexpected token )',
  'ERROR: Error loading packages/db/drizzle.config.ts (TypeError: x is not a function)',
  'ERROR: Error loading tests/e2e/playwright.config.ts (ReferenceError: y is not defined)',
  'ERROR: Error loading eslint.config.js (RangeError: planted)',
  'ERROR: Please fix or visit https://knip.dev/reference/known-issues',
];

export async function run() {
  const fail = (m) => negFailures.push('structure-scan-knip: ' + m);
  const SS = await import('../../map/structure-scan.mjs');
  const fixture = join(HERE, 'instruments', 'structure-monorepo');
  const tmp = join(HERE, 'tmp-structure-scan-knip'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const savedPath = process.env.PATH;
  const withPath = (p, fn) => { process.env.PATH = p; try { return fn(); } finally { process.env.PATH = savedPath; } };
  const knipOf = (doc) => (doc && doc.tools && doc.tools.knip) || {};
  const copyOf = (name, from = fixture) => { const d = join(tmp, name); cpSync(from, d, { recursive: true }); return d; };

  // a PATH holding a fake npm (its knip either needs node_modules/vitest in its cwd, or
  // always crashes, or needs a package.json and node_modules/vitest in its cwd and then
  // reports src/util.js's unused export; its `ci` installs vitest into its cwd) and,
  // unless pnpm is 'absent', a fake pnpm that installs or fails
  const fakePath = (name, { knip, pnpm }) => {
    const dir = join(tmp, `path-${name}`); mkdirSync(dir, { recursive: true });
    const knipBin = knip === 'crash'
      ? `process.stderr.write(${JSON.stringify(CRASH.join('\n') + '\n')}); process.exit(2);\n`
      : knip === 'reports'
      ? `import { existsSync } from 'node:fs';\nif (!existsSync('package.json')) { process.stderr.write('ERROR: no package.json in ' + process.cwd() + '\\n'); process.exit(2); }\nif (!existsSync('node_modules/vitest')) { process.stderr.write(${JSON.stringify(MISSING.join('\n') + '\n')}); process.exit(2); }\nprocess.stdout.write(JSON.stringify({ issues: [{ file: 'src/util.js', exports: [{ name: 'unusedHelper', line: 3, col: 14 }] }] })); process.exit(1);\n`
      : `import { existsSync } from 'node:fs';\nif (!existsSync('node_modules/vitest')) { process.stderr.write(${JSON.stringify(MISSING.join('\n') + '\n')}); process.exit(2); }\nprocess.stdout.write(JSON.stringify({ issues: [] })); process.exit(0);\n`;
    writeFileSync(join(dir, 'npm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args[0] === 'ci') { writeFileSync(${JSON.stringify(join(dir, 'npm-ci.json'))}, JSON.stringify({ args, cwd: process.cwd() })); mkdirSync('node_modules/vitest', { recursive: true }); process.exit(0); }
if (args[0] !== 'install') process.exit(1);
const prefix = args[args.indexOf('--prefix') + 1];
for (const spec of args.filter((a) => /^[a-z][\\w-]*@\\d/.test(a))) {
  const [name, version] = spec.split('@');
  const d = join(prefix, 'node_modules', name); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version, bin: { [name]: 'bin.mjs' } }));
  writeFileSync(join(d, 'bin.mjs'), name === 'knip' ? ${JSON.stringify(knipBin)} : "process.exit(3);\\n");
}
`);
    chmodSync(join(dir, 'npm'), 0o755);
    if (pnpm !== 'absent') {
      writeFileSync(join(dir, 'pnpm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
writeFileSync(${JSON.stringify(join(dir, 'pnpm-args.json'))}, JSON.stringify({ args, cwd: process.cwd() }));
if (args[0] !== 'install') process.exit(1);
${pnpm === 'fail' ? "process.stderr.write(' ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/vitest: Not Found - 404 (planted)\\n'); process.exit(1);" : "mkdirSync('node_modules/vitest', { recursive: true });"}
`);
      chmodSync(join(dir, 'pnpm'), 0o755);
    }
    return dir;
  };

  // (a) a lockfile names pnpm: install into a scratch copy, run knip there
  const tA = copyOf('a');
  const pA = fakePath('a', { knip: 'needs-deps', pnpm: 'installs' });
  const a = withPath(pA, () => SS.run({ target: tA }));
  if (knipOf(a).status !== 'ran') fail(`with a pnpm lockfile and pnpm on PATH, the dependencies install and knip reads ran (got ${JSON.stringify(knipOf(a))})`);
  let pnpmCall = null;
  try { pnpmCall = JSON.parse(readFileSync(join(pA, 'pnpm-args.json'), 'utf8')); } catch {}
  if (!pnpmCall) fail('the install step must run the lockfile\'s package manager (pnpm was never called)');
  else {
    if (pnpmCall.args.join(' ') !== 'install --frozen-lockfile --ignore-scripts') fail(`pnpm installs from its lockfile with scripts ignored (got pnpm ${pnpmCall.args.join(' ')})`);
    if (pnpmCall.cwd === tA) fail('the install runs in a scratch copy, never in the target itself');
  }
  if (existsSync(join(tA, 'node_modules'))) fail('structure-scan never writes node_modules into the target');

  // (b) pnpm not on PATH: skipped, naming it and why
  const b = withPath(fakePath('b', { knip: 'needs-deps', pnpm: 'absent' }), () => SS.run({ target: copyOf('b') }));
  if (knipOf(b).status !== 'skipped' || !/not installed/.test(knipOf(b).reason || '') || !/pnpm/.test(knipOf(b).reason || '')) fail(`with the lockfile's package manager absent, knip reads skipped naming pnpm and the missing dependencies (got ${JSON.stringify(knipOf(b))})`);
  if (b.exit !== 1) fail(`a skipped knip exits 1, never 0 (got ${b.exit})`);
  const bRows = convert('structure-scan', JSON.stringify(b), b.exit);
  const bFact = bRows.find((r) => r.native_category === 'unused-not-run');
  if (!bFact || !/skipped/.test(bFact.observation) || !/not installed/.test(bFact.observation)) fail(`a skipped knip yields an unused-not-run fact that says skipped and why (got ${bFact ? bFact.observation : 'no row'})`);
  // (b2) the install itself failing: skipped with the package manager's own error
  const b2 = withPath(fakePath('b2', { knip: 'needs-deps', pnpm: 'fail' }), () => SS.run({ target: copyOf('b2') }));
  if (knipOf(b2).status !== 'skipped' || !/ERR_PNPM_FETCH_404/.test(knipOf(b2).reason || '')) fail(`a failed dependency install reads knip skipped with pnpm's error (got ${JSON.stringify(knipOf(b2))})`);

  // (c) no lockfile: knip runs in place, a config it cannot load reads skipped with the module named
  const tC = copyOf('c'); rmSync(join(tC, 'pnpm-lock.yaml'));
  const c = withPath(fakePath('c', { knip: 'needs-deps', pnpm: 'installs' }), () => SS.run({ target: tC }));
  const cr = knipOf(c).reason || '';
  if (knipOf(c).status !== 'skipped' || !/not installed/.test(cr) || !/vitest\/config/.test(cr)) fail(`a config importing a module that is not installed reads knip skipped, naming the module (got ${JSON.stringify(knipOf(c))})`);
  if (/Please fix/.test(cr) && !/vitest\/config/.test(cr)) fail('the reason keeps knip\'s first ERROR line, not only its last');

  // (d) dependencies present, knip crashes: failed, with the first three ERROR lines
  const tD = copyOf('d'); mkdirSync(join(tD, 'node_modules', 'vitest'), { recursive: true });
  const d = withPath(fakePath('d', { knip: 'crash', pnpm: 'installs' }), () => SS.run({ target: tD }));
  const dr = knipOf(d).reason || '';
  if (knipOf(d).status !== 'failed' || !/exited 2/.test(dr)) fail(`a knip crash with dependencies present reads failed with its exit (got ${JSON.stringify(knipOf(d))})`);
  else {
    for (const l of CRASH.slice(0, 3)) if (!dr.includes(l.replace(/^ERROR: /, ''))) fail(`the failed reason keeps the first three ERROR lines (missing "${l}" in: ${dr})`);
    if (dr.includes('RangeError')) fail(`the failed reason keeps only the first three ERROR lines (got ${dr})`);
  }

  // (e) a lone application directory: knip runs in app/, after app/'s dependencies install
  const lone = join(HERE, 'instruments', 'structure-lone-app');
  const tE = copyOf('e', lone);
  const pE = fakePath('e', { knip: 'reports', pnpm: 'absent' });
  const e = withPath(pE, () => SS.run({ target: tE }));
  if (knipOf(e).status !== 'ran') fail(`a lone app/package.json runs knip in app/ and reads ran (got ${JSON.stringify(knipOf(e))})`);
  if (knipOf(e).root !== 'app') fail(`the report records where knip ran: knip.root app (got ${JSON.stringify(knipOf(e).root)})`);
  if (knipOf(e).config !== 'knip.json') fail(`knip's configuration is read where knip ran, app/knip.json, not at the root (got ${JSON.stringify(knipOf(e).config)})`);
  const eHit = (e.unused || []).find((u) => u.name === 'unusedHelper');
  if (!eHit || eHit.file !== 'app/src/util.js' || eHit.line !== 3) fail(`knip's rows are written relative to the repository root: unusedHelper at app/src/util.js:3 (got ${JSON.stringify(e.unused)})`);
  let npmCi = null;
  try { npmCi = JSON.parse(readFileSync(join(pE, 'npm-ci.json'), 'utf8')); } catch {}
  if (!npmCi) fail('app/\'s dependencies install with its lockfile\'s package manager (npm ci was never called)');
  else {
    if (npmCi.args.join(' ') !== 'ci --ignore-scripts --no-audit --no-fund') fail(`npm installs from app/'s lockfile with scripts ignored (got npm ${npmCi.args.join(' ')})`);
    if (npmCi.cwd === tE || npmCi.cwd === join(tE, 'app')) fail('the install runs in a scratch copy, never in the target itself');
  }
  if (existsSync(join(tE, 'app', 'node_modules'))) fail('structure-scan never writes node_modules into the target\'s app/');
  const eRows = convert('structure-scan', JSON.stringify(e), e.exit);
  if (!eRows.some((r) => r.native_category === 'unused' && (r.evidence || []).includes('app/src/util.js:3'))) fail(`the unused export ingests with evidence app/src/util.js:3 (got ${JSON.stringify(eRows.map((r) => r.evidence))})`);

  // (f) two application directories, no root manifest: not-applicable, both named
  const tF = copyOf('f', lone); cpSync(join(tF, 'app'), join(tF, 'web'), { recursive: true });
  const f = withPath(fakePath('f', { knip: 'reports', pnpm: 'absent' }), () => SS.run({ target: tF }));
  const fr = knipOf(f).reason || '';
  if (knipOf(f).status !== 'not-applicable' || !/\bapp\b/.test(fr) || !/\bweb\b/.test(fr)) fail(`two application directories and no root package.json read knip not-applicable naming both (got ${JSON.stringify(knipOf(f))})`);
  const fFact = convert('structure-scan', JSON.stringify(f), f.exit).find((r) => r.native_category === 'unused-not-applicable');
  if (!fFact || !/\bapp\b/.test(fFact.observation) || !/\bweb\b/.test(fFact.observation)) fail(`the not-applicable fact names both application directories (got ${fFact ? fFact.observation : 'no row'})`);

  rmSync(tmp, { recursive: true, force: true });
}
