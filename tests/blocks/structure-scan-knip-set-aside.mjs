// ── structure-scan: a config knip could not load is set aside, and the rest measured (#186) ──
// A target's tool config may refuse to load on purpose (a test config that throws under CI
// with no database configured), and knip loads every plugin's config, so one refusal failed
// the whole unused-code pass. Pinned with a fake npm whose knip refuses vitest.config.ts until
// it is handed a configuration, over tests/instruments/structure-monorepo with its
// dependencies present:
//   (a) knip is retried once and reads ran; the retry keeps the vitest plugin with its config
//       set aside (`config: []`, never the plugin off, which reads every test file unused),
//       ignores the refused file, and does not report the packages it imports; the retry's
//       configuration lives outside the target;
//   (b) ingest says so: one unused-config-not-read fact citing the file, mapped by the adapter;
//   (c) a target's own knip.json is kept, the override merged into it;
//   (d) not retried, and failed as before: a refused file no knip plugin reads, and a target
//       whose own knip configuration is code;
//   (e) a retry that fails too reads failed, naming the file set aside and both failures.
import { writeFileSync, mkdirSync, rmSync, cpSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';
import { projectMulti } from '../../map/project.mjs';

export const label = 'structure-scan-knip-set-aside';

const REFUSED = ['ERROR: Error loading vitest.config.ts (planted: this config refuses to load under CI)', 'ERROR: Please fix or visit https://knip.dev/reference/known-issues'];

export async function run() {
  const fail = (m) => negFailures.push('structure-scan-knip-set-aside: ' + m);
  const SS = await import('../../map/structure-scan.mjs');
  const fixture = join(HERE, 'instruments', 'structure-monorepo');
  const tmp = join(HERE, 'tmp-structure-scan-set-aside'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const savedPath = process.env.PATH;
  const withPath = (p, fn) => { process.env.PATH = p; try { return fn(); } finally { process.env.PATH = savedPath; } };
  const target = (name, extra = () => {}) => { const d = join(tmp, name); cpSync(fixture, d, { recursive: true }); mkdirSync(join(d, 'node_modules', 'vitest'), { recursive: true }); extra(d); return d; };
  // a fake npm installing a knip that refuses vitest.config.ts unless handed --config (it then
  // records the configuration and reports one unused export, or, when `again` is 'crash',
  // refuses again); `plugins` says whether the installed knip carries a vitest plugin
  const fakePath = (name, { plugins = true, again = 'reports' } = {}) => {
    const dir = join(tmp, `path-${name}`); mkdirSync(dir, { recursive: true });
    const seen = join(dir, 'config-seen.json');
    const knipBin = `import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const at = args.indexOf('--config');
if (at < 0) { process.stderr.write(${JSON.stringify(REFUSED.join('\n') + '\n')}); process.exit(2); }
writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ path: args[at + 1], cwd: process.cwd(), config: JSON.parse(readFileSync(args[at + 1], 'utf8')) }));
${again === 'crash' ? "process.stderr.write('ERROR: Error loading packages/db/drizzle.config.ts (planted second refusal)\\n'); process.exit(2);" : "process.stdout.write(JSON.stringify({ issues: [{ file: 'packages/db/src/index.js', exports: [{ name: 'unusedHelper', line: 1, col: 1 }] }] })); process.exit(1);"}
`;
    writeFileSync(join(dir, 'npm'), `#!${process.execPath}
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
  if (name === 'knip' && ${plugins}) mkdirSync(join(d, 'dist', 'plugins', 'vitest'), { recursive: true });
}
`);
    chmodSync(join(dir, 'npm'), 0o755);
    return { dir, seen: () => { try { return JSON.parse(readFileSync(seen, 'utf8')); } catch { return null; } } };
  };
  const knipOf = (doc) => (doc && doc.tools && doc.tools.knip) || {};
  try {
    // (a)
    const tA = target('a');
    const pA = fakePath('a');
    const a = withPath(pA.dir, () => SS.run({ target: tA }));
    const k = knipOf(a), seen = pA.seen();
    if (k.status !== 'ran') fail(`(a) a refused config is set aside and knip reads ran (got ${JSON.stringify(k)})`);
    const nr = (k.config_not_read || [])[0];
    if (!nr || nr.file !== 'vitest.config.ts' || nr.plugin !== 'vitest' || !(nr.imports || []).includes('vitest') || !/refuses to load under CI/.test(nr.reason)) fail(`(a) the run records the file set aside, its plugin, its reason and its imports (got ${JSON.stringify(k.config_not_read)})`);
    if (!seen) fail('(a) the retry hands knip a configuration');
    else {
      if (!seen.config.vitest || !Array.isArray(seen.config.vitest.config) || seen.config.vitest.config.length !== 0) fail(`(a) the retry keeps the vitest plugin with its config set aside (vitest: { config: [] }), never the plugin off (got ${JSON.stringify(seen.config.vitest)})`);
      if (!(seen.config.ignore || []).includes('vitest.config.ts')) fail(`(a) the refused file is ignored (got ignore ${JSON.stringify(seen.config.ignore)})`);
      if (!(seen.config.ignoreDependencies || []).includes('vitest')) fail(`(a) the packages the refused file imports are not reported unused (got ${JSON.stringify(seen.config.ignoreDependencies)})`);
      if (seen.path.startsWith(tA)) fail('(a) the retry\'s configuration lives in scratch, never in the target');
    }
    if (k.config !== null) fail(`(a) the target's own knip configuration is still read as absent: the retry's is not the target's (got ${JSON.stringify(k.config)})`);
    if (existsSync(join(tA, 'knip-set-aside.json'))) fail('(a) nothing is written into the target');
    // (b)
    const rows = convert('structure-scan', JSON.stringify(a), a.exit);
    const fact = rows.filter((r) => r.native_category === 'unused-config-not-read');
    if (fact.length !== 1 || fact[0].polarity !== 'fact' || fact[0].evidence[0] !== 'vitest.config.ts:1' || !/set aside/.test(fact[0].observation)) fail(`(b) ingest writes one unused-config-not-read fact citing the file (got ${JSON.stringify(fact)})`);
    if (!rows.some((r) => r.native_category === 'unused')) fail('(b) the rest of the pass still yields its unused rows');
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`(b) the adapter maps every row (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    // (c)
    const tC = target('c', (d) => writeFileSync(join(d, 'knip.json'), JSON.stringify({ entry: ['packages/*/src/main.js'], ignore: ['scripts/**'] })));
    const pC = fakePath('c');
    const c = withPath(pC.dir, () => SS.run({ target: tC }));
    const sc = pC.seen();
    if (knipOf(c).status !== 'ran' || !sc || JSON.stringify(sc.config.entry) !== JSON.stringify(['packages/*/src/main.js']) || !(sc.config.ignore || []).includes('scripts/**') || !(sc.config.ignore || []).includes('vitest.config.ts')) fail(`(c) the target's own knip.json is kept and the override merged into it (got ${JSON.stringify(sc && sc.config)})`);
    // (d)
    const d1 = withPath(fakePath('d1', { plugins: false }).dir, () => SS.run({ target: target('d1') }));
    if (knipOf(d1).status !== 'failed' || !/no knip plugin reads vitest\.config\.ts/.test(knipOf(d1).reason || '') || !/refuses to load under CI/.test(knipOf(d1).reason || '')) fail(`(d) a refused file no plugin reads is not retried and reads failed, keeping knip's error (got ${JSON.stringify(knipOf(d1))})`);
    const d2 = withPath(fakePath('d2').dir, () => SS.run({ target: target('d2', (d) => writeFileSync(join(d, 'knip.ts'), 'export default {};\n')) }));
    if (knipOf(d2).status !== 'failed' || !/knip\.ts\) is code/.test(knipOf(d2).reason || '')) fail(`(d) a target whose own knip configuration is code is not rewritten, and reads failed (got ${JSON.stringify(knipOf(d2))})`);
    // (e)
    const e = withPath(fakePath('e', { again: 'crash' }).dir, () => SS.run({ target: target('e') }));
    const er = knipOf(e).reason || '';
    if (knipOf(e).status !== 'failed' || !/retried with vitest\.config\.ts set aside/.test(er) || !/planted second refusal/.test(er) || !/refuses to load under CI/.test(er)) fail(`(e) a retry that fails too reads failed, naming the file set aside and both failures (got ${JSON.stringify(knipOf(e))})`);
  } finally { process.env.PATH = savedPath; rmSync(tmp, { recursive: true, force: true }); }
}
