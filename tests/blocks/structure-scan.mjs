// ── structure-scan: duplication, unused code, stale artifacts and churn (#108) ──
// map/structure-scan.mjs installs jscpd and knip from the npm registry into its own
// scratch at run time (never a dependency of this repository), runs them over the
// checkout, and reads the tree and git history itself. Pinned here:
//   (a) an absent tool (no npm on PATH) reads skipped with the reason, a crashing tool
//       failed — both deterministic with a fake PATH — and neither ever reads 0 rows;
//   (b) a repository with no package.json reads `unused` not-applicable, never clean;
//   (c) without exec permission knip (which imports the target's own tool configs) is
//       skipped with that reason;
//   (d) the real tools over tests/instruments/structure-target find exactly the planted
//       duplicate pair, unused export and stale file, with file:line, and the archived
//       raw report carries no code text. A registry this run cannot reach is a SKIPPED
//       case that says so on stderr, never a pass.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';
import { projectMulti, adoptedAdapters } from '../../map/project.mjs';

export const label = 'structure-scan';

export async function run() {
  const fail = (m) => negFailures.push('structure-scan: ' + m);
  let SS;
  try { SS = await import('../../map/structure-scan.mjs'); }
  catch (e) { fail(`map/structure-scan.mjs must exist and load (${e.message.split('\n')[0]})`); return; }
  const target = join(HERE, 'instruments', 'structure-target');
  const tmp = join(HERE, 'tmp-structure-scan'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const savedPath = process.env.PATH;
  const withPath = (p, fn) => { process.env.PATH = p; try { return fn(); } finally { process.env.PATH = savedPath; } };
  const cats = (rows) => rows.map((r) => r.native_category).sort().join(',');
  const toolOf = (doc, t) => (doc && doc.tools && doc.tools[t]) || {};
  // a fake npm on its own PATH: `install` writes each requested tool as a package whose bin
  // exits non-zero (crash), or fails like an unreachable registry (unreachable)
  const fakeNpm = (mode) => {
    const dir = join(tmp, `path-${mode}`); mkdirSync(dir, { recursive: true });
    const crash = "process.stderr.write('planted crash\\n'); process.exit(3);\n";
    writeFileSync(join(dir, 'npm'), `#!${process.execPath}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('10.0.0-fake'); process.exit(0); }
if (args[0] !== 'install') process.exit(1);
${mode === 'unreachable' ? "process.stderr.write('npm error code ECONNREFUSED (planted: registry unreachable)\\n'); process.exit(1);" : ''}
const prefix = args[args.indexOf('--prefix') + 1];
for (const spec of args.filter((a) => /^[a-z][\\w-]*@\\d/.test(a))) {
  const [name, version] = spec.split('@');
  const d = join(prefix, 'node_modules', name); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version, bin: { [name]: 'crash.js' } }));
  writeFileSync(join(d, 'crash.js'), ${JSON.stringify(crash)});
}
`);
    chmodSync(join(dir, 'npm'), 0o755);
    return dir;
  };
  const empty = join(tmp, 'path-empty'); mkdirSync(empty, { recursive: true });

  // (a) absent: no npm on PATH — both tools skipped with the reason, the tree pass still runs
  const absent = withPath(empty, () => SS.run({ target }));
  for (const t of ['jscpd', 'knip']) {
    if (toolOf(absent, t).status !== 'skipped' || !/npm/.test(toolOf(absent, t).reason || '')) fail(`with no npm on PATH, ${t} must read skipped with a reason naming npm (got ${JSON.stringify(toolOf(absent, t))})`);
  }
  if (absent.exit !== 1) fail(`a run with a tool not run must exit 1, never 0 (got ${absent.exit})`);
  const absentRows = convert('structure-scan', JSON.stringify(absent), absent.exit);
  if (!absentRows.length) fail('an absent tool must never read as 0 rows');
  if (cats(absentRows) !== 'duplicate-not-run,stale-artifact,unused-not-run') fail(`an absent jscpd and knip must yield their not-run facts beside the tree pass's stale artifact (got ${cats(absentRows)})`);
  const notRun = absentRows.find((r) => r.native_category === 'duplicate-not-run');
  if (notRun && (notRun.polarity !== 'fact' || !/skipped/.test(notRun.observation))) fail(`a skipped tool's row is a fact that says skipped (got ${notRun.polarity}: ${notRun.observation})`);
  const staleAbsent = absentRows.find((r) => r.native_category === 'stale-artifact');
  if (staleAbsent && !(staleAbsent.detail && ['shallow', 'none'].includes(staleAbsent.detail.history))) fail(`with no git to read, a row's detail says history ${'none'} (got ${JSON.stringify(staleAbsent.detail)})`);

  // (a2) the registry unreachable: skipped with npm's own reason
  const unreach = withPath(fakeNpm('unreachable'), () => SS.run({ target }));
  if (toolOf(unreach, 'jscpd').status !== 'skipped' || !/ECONNREFUSED|install/.test(toolOf(unreach, 'jscpd').reason || '')) fail(`a failed install must read skipped with the install's reason (got ${JSON.stringify(toolOf(unreach, 'jscpd'))})`);

  // (a3) crashing: installed, but the tool exits outside its success set — failed, never clean
  const crashed = withPath(fakeNpm('crash'), () => SS.run({ target }));
  for (const t of ['jscpd', 'knip']) {
    const s = toolOf(crashed, t);
    if (s.status !== 'failed' || !/exit(ed)? 3/.test(s.reason || '')) fail(`a ${t} that exits 3 must read failed with its exit in the reason (got ${JSON.stringify(s)})`);
    if (s.version !== SS.TOOLS[t]) fail(`the version a run installed is recorded (${t}: want ${SS.TOOLS[t]}, got ${s.version})`);
  }
  const crashRows = convert('structure-scan', JSON.stringify(crashed), crashed.exit);
  const crashFact = crashRows.find((r) => r.native_category === 'unused-not-run');
  if (!crashFact || !/failed/.test(crashFact.observation)) fail(`a crashed knip must yield an unused-not-run fact that says failed (got ${crashFact ? crashFact.observation : 'no row'})`);

  // (b) no package.json: unused is not-applicable (knip never runs), never clean, never not-run
  const nopkg = join(tmp, 'nopkg'); cpSync(target, nopkg, { recursive: true }); rmSync(join(nopkg, 'package.json'));
  const na = withPath(empty, () => SS.run({ target: nopkg }));
  if (toolOf(na, 'knip').status !== 'not-applicable') fail(`a tree with no package.json must read knip not-applicable (got ${JSON.stringify(toolOf(na, 'knip'))})`);
  const naRows = convert('structure-scan', JSON.stringify(na), na.exit);
  if (!naRows.some((r) => r.native_category === 'unused-not-applicable' && r.polarity === 'fact')) fail(`no package.json must yield one unused-not-applicable fact (got ${cats(naRows)})`);
  if (naRows.some((r) => r.native_category === 'unused-not-run')) fail('no package.json is not-applicable, not a tool that failed to run');

  // (c) no exec: knip loads the target's own config files, so it is skipped and says why
  const noExec = withPath(fakeNpm('crash'), () => SS.run({ target, noExec: true }));
  if (toolOf(noExec, 'knip').status !== 'skipped' || !/--allow-exec/.test(toolOf(noExec, 'knip').reason || '')) fail(`without exec permission knip must read skipped naming --allow-exec (got ${JSON.stringify(toolOf(noExec, 'knip'))})`);
  if (toolOf(noExec, 'jscpd').status !== 'failed') fail('without exec permission jscpd (it only reads files) still runs');

  // every category a run can emit projects onto the shared code-maintainability axis
  const proj = projectMulti([...absentRows, ...crashRows, ...naRows], adaptersOnce());
  if (proj.unmapped.length) fail(`every structure-scan row must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.some((p) => p.axis !== 'code-maintainability')) fail(`structure-scan rows feed code-maintainability (got ${[...new Set(proj.projected.map((p) => p.axis))].join(', ')})`);

  // (d) the real tools, installed from the registry, over the planted fixture
  const real = SS.run({ target });
  const installFailed = ['jscpd', 'knip'].filter((t) => toolOf(real, t).status === 'skipped');
  if (installFailed.length) {
    console.error(`  ⚠ structure-scan: SKIPPED the real-tool case — ${installFailed.map((t) => `${t}: ${toolOf(real, t).reason}`).join('; ')}. Nothing about jscpd or knip over the fixture was proven this run.`);
  } else {
    for (const t of ['jscpd', 'knip']) if (toolOf(real, t).status !== 'ran' || toolOf(real, t).version !== SS.TOOLS[t]) fail(`${t} must run over the fixture at its pinned version (got ${JSON.stringify(toolOf(real, t))})`);
    const runDir = join(tmp, 'run'); mkdirSync(join(runDir, 'map', 'findings'), { recursive: true });
    // a run record naming every adopted scanner, so validate reads only what this run carries
    const others = Object.keys(adoptedAdapters(adaptersOnce())).filter((id) => id !== 'structure-scan');
    writeFileSync(join(runDir, 'map', 'scanners.yaml'), ['engine: test', 'scanners:', '  structure-scan:', '    status: skipped', '    reason: "flipped to ran by the ingest below"', ...others.flatMap((id) => [`  ${id}:`, '    status: skipped', '    reason: "not part of this block"'])].join('\n') + '\n');
    const rawFile = join(tmp, 'structure-scan.json'); writeFileSync(rawFile, JSON.stringify(real, null, 2));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), runDir, '--tool', 'structure-scan', '--raw', rawFile, '--exit', String(real.exit)], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest of the real run must succeed (${String(e.stderr || e.message).trim().split('\n').pop()})`); }
    const rows = convert('structure-scan', JSON.stringify(real), real.exit);
    const gaps = rows.filter((r) => r.polarity === 'gap');
    if (cats(gaps) !== 'duplicate,stale-artifact,unused') fail(`the fixture reads exactly its three planted rows (got ${gaps.map((r) => `${r.native_category} ${r.evidence.join(' ')}`).join('; ')})`);
    const dup = gaps.find((r) => r.native_category === 'duplicate');
    if (dup && dup.evidence.join(' ') !== 'src/billing.js:1 src/invoice.js:2') fail(`the planted duplicate cites both copies at file:line (got ${dup.evidence.join(' ')})`);
    if (dup && !(Number.isInteger(dup.detail?.lines) && Number.isInteger(dup.detail?.tokens))) fail(`a duplicate row records the clone's line and token counts (got ${JSON.stringify(dup.detail)})`);
    const unused = gaps.find((r) => r.native_category === 'unused');
    if (unused && (unused.evidence.join() !== 'src/format.js:5' || !/formatLegacy/.test(unused.observation))) fail(`the planted unused export cites src/format.js:5 and names formatLegacy (got ${unused.evidence.join()}: ${unused.observation})`);
    const stale = gaps.find((r) => r.native_category === 'stale-artifact');
    if (stale && stale.evidence.join() !== 'src/invoice.js.bak:1') fail(`the planted stale file cites src/invoice.js.bak:1 (got ${stale.evidence.join()})`);
    for (const r of gaps) if (!(Number.isInteger(r.detail?.churn_90d) || ['shallow', 'none'].includes(r.detail?.history))) fail(`every row's detail carries churn_90d, or the history fact when there is none to read (got ${JSON.stringify(r.detail)} on ${r.native_id})`);
    if (gaps.some((r) => 'severity' in r)) fail('a structure-scan row records counts as facts, never a severity');
    // only locations and counts leave the raw report: no code fragment in a row or the archive
    const findings = existsSync(join(runDir, 'map', 'findings', 'structure-scan.yaml')) ? readFileSync(join(runDir, 'map', 'findings', 'structure-scan.yaml'), 'utf8') : '';
    const archive = existsSync(join(runDir, 'map', 'raw', 'structure-scan.json')) ? readFileSync(join(runDir, 'map', 'raw', 'structure-scan.json'), 'utf8') : '';
    if (!archive) fail('ingest must archive the raw report at map/raw/structure-scan.json');
    if (/Number\.isNaN\(quantity\)/.test(findings + archive) || /"fragment"/.test(archive)) fail('a duplicated block\'s code must never be copied into the rows or the archived raw report');
    if (!/"duplicates"/.test(archive) || !/"issues"/.test(archive)) fail('the archive keeps both tools\' raw reports (jscpd duplicates, knip issues) less any code text');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), runDir, '--target', target], { stdio: 'pipe' }); }
    catch (e) { fail(`the ingested run must validate against the target — every row's evidence resolves there (${(String(e.stdout || '') + String(e.stderr || '')).trim().split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 3).join(' | ')})`); }
  }
  rmSync(tmp, { recursive: true, force: true });
}
