// ── the run knows its lanes (#56, F-118 F-438 F-615 F-120): the run record names
// the model per scanner AND per repo-eval pass (with an optional spend), repo-eval's
// missing model warns like any judgment scanner's, the report and INDEX name the
// models of record, and variance reports agreement per model pair ─────────────
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { computeVariance, varianceFromSweeps } from '../../map/variance.mjs';
import { setScannerRow } from '../../map/record.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings } from '../harness.mjs';

export const label = 'model-of-record';

export async function run() {
  const fail = (m) => negFailures.push('model-of-record: ' + m);
  const scannersText = (repoEvalRow) => [
    'engine: fixture', 'scanners:', '  repo-eval:', '    status: ran', ...repoEvalRow,
    '  deep-code-review:', '    status: skipped', '    reason: "fixture: not executed"',
    '  gitleaks:', '    status: ran', '  fresh-clone:', '    status: ran', '  dependency-scan:', '    status: ran',
    '  repo-census:', '    status: skipped', '    reason: "fixture: not executed"', '',
  ].join('\n');
  const tmp = join(HERE, 'tmp-model-of-record'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmp);
  const validateJson = (rows) => {
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), scannersText(rows));
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp, '--json'], { encoding: 'utf8' });
    try { return { exit: r.status, ...JSON.parse(r.stdout) }; } catch { return { exit: r.status, errors: [`unparseable: ${r.stdout}${r.stderr}`], warnings: [] }; }
  };
  const noModelWarn = (v) => v.warnings.filter((w) => /repo-eval: .*no model/.test(w));

  // F-118: repo-eval is a judgment scanner — no model, a warning like any other
  const bare = validateJson([]);
  if (bare.exit !== 0) fail(`a repo-eval row with no model must still validate (a warning, not an error); got ${bare.errors.join(' | ')}`);
  if (!noModelWarn(bare).length) fail(`a repo-eval row that ran with no model must warn like any judgment scanner (got warnings: ${bare.warnings.join(' | ') || 'none'})`);
  // per pass: a model on SOME passes names the passes still without one
  const some = validateJson(['    passes:', '      delegation:', '        model: "model-b"']);
  if (!noModelWarn(some).some((w) => /legibility/.test(w) && /verification/.test(w) && !/delegation/.test(w))) fail(`a partly-recorded repo-eval must name the passes with no model (legibility, verification), not the recorded one (got ${noModelWarn(some).join(' | ') || 'none'})`);
  const all = validateJson(['    passes:', '      delegation:', '        model: "model-b"', '      legibility:', '        model: "model-b"', '      verification:', '        model: "model-c"']);
  if (all.exit !== 0 || noModelWarn(all).length) fail(`every pass carrying a model must validate without the warning (got ${[...all.errors, ...noModelWarn(all)].join(' | ')})`);
  const row = validateJson(['    model: "model-a"', '    spend: "41k tokens"']);
  if (row.exit !== 0 || noModelWarn(row).length) fail(`a row-level model and spend must validate without the warning (got ${[...row.errors, ...noModelWarn(row)].join(' | ')})`);
  // the per-pass record fails closed on what it cannot mean
  const badPass = validateJson(['    model: "model-a"', '    passes:', '      no-such-pass:', '        model: "x"']);
  if (badPass.exit === 0 || !badPass.errors.some((e) => /no-such-pass/.test(e))) fail('a pass the built-in scanner does not have must be an error, naming it');
  const emptyPass = validateJson(['    model: "model-a"', '    passes:', '      delegation:', '        note: "x"']);
  if (emptyPass.exit === 0 || !emptyPass.errors.some((e) => /delegation/.test(e))) fail('a pass entry carrying neither model nor spend must be an error');
  const badSpend = validateJson(['    model: "model-a"', '    spend: ""']);
  if (badSpend.exit === 0 || !badSpend.errors.some((e) => /spend/.test(e))) fail('an empty spend must be an error (absent, or what was spent)');

  // record: --pass edits one pass of the repo-eval row, and every later edit keeps it
  const base = scannersText([]);
  const { text: p1 } = setScannerRow(base, 'repo-eval', 'ran', { pass: 'delegation', model: 'model-b', spend: '12k tokens' });
  const m1 = parseYaml(p1).scanners['repo-eval'];
  if (m1?.passes?.delegation?.model !== 'model-b' || m1?.passes?.delegation?.spend !== '12k tokens' || m1.model !== undefined) fail(`record --pass must write the pass's model and spend, not the row's (got ${JSON.stringify(m1)})`);
  const { text: p2 } = setScannerRow(p1, 'repo-eval', 'ran', { model: 'model-a', spend: '40k tokens' });
  const m2 = parseYaml(p2).scanners['repo-eval'];
  if (m2?.passes?.delegation?.model !== 'model-b' || m2.model !== 'model-a' || m2.spend !== '40k tokens') fail(`a row-level record must keep the recorded passes and set the row's model and spend (got ${JSON.stringify(m2)})`);
  const { text: p3 } = setScannerRow(p2, 'repo-eval', 'ran', { pass: 'legibility', model: 'model-c' });
  const m3 = parseYaml(p3).scanners['repo-eval'];
  if (m3?.passes?.delegation?.model !== 'model-b' || m3?.passes?.legibility?.model !== 'model-c' || m3.spend !== '40k tokens') fail(`recording a second pass must keep the first and the row's spend (got ${JSON.stringify(m3)})`);
  if (!/gitleaks:\n {4}status: ran/.test(p3)) fail('a pass record must not disturb another row');
  let threw = false; try { setScannerRow(base, 'gitleaks', 'ran', { pass: 'delegation', model: 'x' }); } catch { threw = true; }
  if (!threw) fail('record --pass on a scanner with no passes (only repo-eval has them) must refuse');
  threw = false; try { setScannerRow(base, 'repo-eval', 'ran', { pass: 'no-such-pass', model: 'x' }); } catch { threw = true; }
  if (!threw) fail('record --pass with a pass the built-in scanner does not have must refuse');

  // F-438 / F-615: INDEX and the report name the model per scanner and per pass
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), p3);
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), 'target: "cleanlib"\nmaintainer: "the test maintainers"\nexec_summary: "test"\nroadmap: []\n');
  writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
  const c = spawnSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), tmp], { encoding: 'utf8' });
  if (c.status !== 0) fail(`the fixture is wrong: cleanlib with a per-pass record must compile (exit ${c.status}: ${String(c.stderr).split('\n').slice(-3).join(' | ')})`);
  else {
    for (const page of ['INDEX.md', 'IMPROVE.md']) {
      const md = readFileSync(join(tmp, page), 'utf8');
      if (!/repo-eval on model-a \(40k tokens\)/.test(md)) fail(`${page} must name repo-eval's model and spend of record`);
      if (!/delegation pass on model-b \(12k tokens\)/.test(md) || !/legibility pass on model-c/.test(md)) fail(`${page} must name the model per pass where recorded`);
    }
    const imp = readFileSync(join(tmp, 'IMPROVE.md'), 'utf8');
    const colo = imp.slice(imp.indexOf('Generated by assay'));
    if (!/model-b/.test(colo)) fail('the report\'s colophon must credit the models that drafted findings, not only assay');
  }
  // a judgment scanner that ran with no model is NAMED as such, never silent
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), scannersText([]));
  if (spawnSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), tmp], { encoding: 'utf8' }).status === 0) {
    if (!/repo-eval: no model recorded/.test(readFileSync(join(tmp, 'INDEX.md'), 'utf8'))) fail('INDEX must say a judgment scanner ran with no model recorded');
  } else fail('the fixture is wrong: cleanlib with a bare record must compile');
  rmSync(tmp, { recursive: true, force: true });

  // F-120: variance reads the model and reports agreement per model pair
  const fa = { dimension: 'delegation', evidence: ['a.md:1'] }, fb = { dimension: 'delegation', evidence: ['b.md:1'] };
  const vm = varianceFromSweeps([[fa, fb], [fa, fb], [fa]], ['s0', 's1', 's2'], [() => 'a', () => 'a', () => 'b']);
  const pairs = vm.byModelPair || {};
  if (pairs['a × a']?.agree !== 2 || pairs['a × a']?.of !== 2) fail(`agreement for the a × a sweep pair must be 2/2 (got ${JSON.stringify(pairs['a × a'])})`);
  if (pairs['a × b']?.agree !== 2 || pairs['a × b']?.of !== 4 || pairs['a × b']?.pct !== 50) fail(`agreement across the a × b sweep pairs must be 2/4 = 50% (got ${JSON.stringify(pairs['a × b'])})`);
  const runA = join(tmp, 'a'), runB = join(tmp, 'b');
  copyFixtureFindings('notesbox', runA); copyFixtureFindings('notesbox', runB);
  writeFileSync(join(runA, 'map', 'scanners.yaml'), scannersText(['    model: "model-a"']));
  writeFileSync(join(runB, 'map', 'scanners.yaml'), scannersText(['    model: "model-a"', '    passes:', '      context:', '        model: "model-c"']));
  const cv = computeVariance([runA, runB]).byModelPair || {};
  if (!cv['model-a × model-a'] || !cv['model-a × model-c']) fail(`computeVariance must read each sweep's model of record, per pass (got pairs: ${Object.keys(cv).join(', ') || 'none'})`);
  const cli = spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), runA, runB], { encoding: 'utf8' });
  if (!/by model pair/.test(cli.stdout) || !/model-a × model-c/.test(cli.stdout)) fail('the variance report must print agreement per model pair');
  rmSync(tmp, { recursive: true, force: true });
}
