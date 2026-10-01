// ── fresh-clone instrument (map/fresh-clone.mjs → ingest profile fresh-clone) ──
// The runner over the public fixture must record what IS: the two declared steps
// pass, the undeclared floor steps read not-declared (never passed), the planted
// README claim reads missing, and the exit is 1. The converter turns exactly those
// into gap rows and nothing else; a runner crash (exit 2) halts it; an all-passing
// document with exit 0 is a verified-clean run (zero rows); every category maps.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti, contributedBySources } from '../../map/project.mjs';
import { HERE, ROOT, negFailures, viewSev, convert, adaptersOnce, copyFixtureFindings } from '../harness.mjs';

export const label = 'fresh-clone';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  const fx = join(HERE, 'instruments', 'fresh-clone-target');
  const tmp = join(HERE, 'tmp-fresh-clone'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'fresh-clone.json');
  // (a) the runner, in place, no install (the fixture declares no dependencies)
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '120'], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the fixture must exit 1 (a missing claim is a gap; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    const st = Object.fromEntries((doc.steps || []).map((s) => [s.name, s.status]));
    if (doc.exit !== 1 || doc.tool !== 'fresh-clone' || doc.target?.cloned !== false) fail(`document must carry tool fresh-clone, exit 1, cloned false (got ${doc.tool}/${doc.exit}/${doc.target?.cloned})`);
    if (st.test !== 'passed' || st.build !== 'passed') fail(`declared test and build must pass (got test ${st.test}, build ${st.build})`);
    if (st.lint !== 'not-declared' || st.typecheck !== 'not-declared' || st.migrate !== 'not-declared') fail(`undeclared lint/typecheck/migrate must read not-declared, never passed (got ${st.lint}/${st.typecheck}/${st.migrate})`);
    if (st.install !== 'not-declared') fail(`a package with no dependencies and no lockfile has no install to run (got ${st.install})`);
    if (doc.steps.length !== 6 || doc.steps.some((s) => !['passed', 'failed', 'not-declared', 'timed-out', 'skipped'].includes(s.status))) fail('every step must carry one of the five closed statuses');
    if (doc.steps.some((s) => s.status === 'passed' && !(s.command && Number.isInteger(s.exit_code) && Number.isInteger(s.duration_ms)))) fail('a run step must record command, exit code and duration');
    const claims = Object.fromEntries((doc.readme_claims || []).map((c) => [c.name, c]));
    if (claims.test?.status !== 'present' || claims.build?.status !== 'present') fail('claims for scripts that exist must read present');
    if (claims.deploy?.status !== 'missing' || !Number.isInteger(claims.deploy?.line)) fail('the planted `npm run deploy` claim must read missing with its README line');
    if (doc.toolchain?.family !== 'node' || doc.toolchain?.package_manager !== 'npm') fail('the toolchain must be detected as node/npm from package.json');
    // (b) convert: rows for the missing claim and the not-declared floor steps, none for the passing steps
    const rows = convert('fresh-clone', raw, 1);
    const cats = rows.map((r) => r.native_category).sort().join(',');
    if (cats !== 'lint,no-database-signal,readme-claim,typecheck') fail(`convert must yield lint, typecheck, readme-claim gap rows plus a no-database-signal FACT row — no migrate GAP row for a tree with no database (got ${cats || '(none)'})`);
    if (!Array.isArray(doc.toolchain?.database_signals) || doc.toolchain.database_signals.length) fail('the fixture carries no database signals');
    const noDbFact = rows.find((r) => r.native_category === 'no-database-signal');
    if (noDbFact?.polarity !== 'fact' || noDbFact?.source !== 'fresh-clone' || !noDbFact?.evidence?.length) fail(`the no-database-signal row must be a fact (not a gap), from fresh-clone, with evidence (got ${JSON.stringify(noDbFact)})`);
    const dbDoc = { ...doc, toolchain: { ...doc.toolchain, database_signals: ['dep:@prisma/client'] } };
    const dbRows = convert('fresh-clone', JSON.stringify(dbDoc), 1);
    if (!dbRows.some((r) => r.native_category === 'migrate')) fail('with a database in the tree, an undeclared migrate step is a gap');
    if (dbRows.some((r) => r.native_category === 'no-database-signal')) fail('with a database in the tree, no no-database-signal fact must be emitted');
    if (rows.filter((r) => r.polarity === 'gap').some((r) => !r.fix || r.severity || !viewSev(r))) fail('every fresh-clone GAP row carries a fix and no severity; the view bands it');
    if (rows.filter((r) => r.polarity === 'fact').some((r) => r.fix || r.severity)) fail('a fresh-clone FACT row carries neither severity nor fix (it is not a gap)');
    const claimRow = rows.find((r) => r.native_category === 'readme-claim');
    if (claimRow?.evidence[0] !== `README.md:${claims.deploy?.line}`) fail(`a missing claim must cite README.md:<line> (got ${claimRow?.evidence[0]})`);
    if (rows.find((r) => r.native_category === 'lint')?.evidence[0] !== 'package.json:1') fail('a step row must cite the manifest that declares the steps');
    if (rows.some((r) => r.native_category === 'test' || r.native_category === 'build')) fail('a passing step must yield no row');
    if (rows[0]?.id !== 'F-900') fail(`fresh-clone ids start at F-900 (got ${rows[0]?.id})`);
    if (JSON.stringify(rows).includes('output_tail') || JSON.stringify(rows).includes('> fresh-clone-target@')) fail('step output must never be copied into rows (it stays in the raw archive)');
    // a failed install/build/test reads High; timed-out likewise; not-declared reads Medium
    const failedDoc = { ...doc, exit: 1, steps: doc.steps.map((s) => s.name === 'build' ? { ...s, status: 'failed', exit_code: 1 } : s.name === 'test' ? { ...s, status: 'timed-out', exit_code: null, reason: 'exceeded 1s' } : s) };
    const fr = Object.fromEntries(convert('fresh-clone', JSON.stringify(failedDoc), 1).map((r) => [r.native_category, r]));
    if (viewSev(fr.build) !== 'High' || viewSev(fr.test) !== 'High' || viewSev(fr.lint) !== 'Medium') fail(`failed build / timed-out test read High, not-declared lint Medium in the view (got ${viewSev(fr.build)}/${viewSev(fr.test)}/${viewSev(fr.lint)})`);
    if (!/exit 1/.test(fr.build?.observation || '')) fail('a failed step row carries the exit code in its observation');
    // (c) a runner crash halts; a document that disagrees with the exit code halts; truncation halts
    mustThrow('a runner crash (exit 2)', () => convert('fresh-clone', raw, 2));
    mustThrow('a document whose exit disagrees with the runner exit', () => convert('fresh-clone', raw, 0));
    mustThrow('a truncated document (no steps)', () => convert('fresh-clone', JSON.stringify({ tool: 'fresh-clone', exit: 1, readme_claims: [] }), 1));
    mustThrow('a document missing a step row', () => convert('fresh-clone', JSON.stringify({ ...doc, steps: doc.steps.filter((s) => s.name !== 'test') }), 1));
    mustThrow('an unknown step status', () => convert('fresh-clone', JSON.stringify({ ...doc, steps: doc.steps.map((s) => s.name === 'lint' ? { ...s, status: 'ok' } : s) }), 1));
    mustThrow('malformed JSON', () => convert('fresh-clone', raw.slice(0, 200), 1));
    mustThrow('a foreign report', () => convert('fresh-clone', '[]', 0));
    // (d) an all-passing synthetic document with exit 0 is a verified-clean run: zero rows
    const cleanDoc = { ...doc, exit: 0, steps: doc.steps.map((s) => ({ ...s, status: 'passed', command: s.command || `npm run ${s.name}`, exit_code: 0 })), readme_claims: doc.readme_claims.map((c) => ({ ...c, status: 'present' })) };
    if (convert('fresh-clone', JSON.stringify(cleanDoc), 0).length !== 0) fail('an all-passing document (exit 0) must convert to zero rows (the explicit empty file records the run)');
    // (e) projection: every category maps, onto existing axes, and the instrument contributes none
    const all = convert('fresh-clone', JSON.stringify({ ...failedDoc, toolchain: { ...failedDoc.toolchain, database_signals: ['dep:knex'] } }), 1);
    const proj = projectMulti(all, adaptersOnce());
    if (proj.unmapped.length) fail(`fresh-clone rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    const axisOf = (cat) => proj.projected.find((p) => p.f.native_category === cat)?.axis;
    if (axisOf('build') !== 'context-economy' || axisOf('migrate') !== 'context-economy') fail('build / migrate must land on the reproducibility-shaped axis (context-economy, where d-fresh-clone-runs lives)');
    if (axisOf('test') !== 'deterministic-gates' || axisOf('lint') !== 'deterministic-gates') fail('test / lint must land on the shared deterministic-gates axis');
    if (axisOf('readme-claim') !== 'artifact-legibility') fail('a README claim must land on artifact-legibility');
    if (contributedBySources(adaptersOnce(), ['fresh-clone']).size !== 0) fail('fresh-clone is an instrument and must contribute no axis');
    const rogue = projectMulti([{ ...rows[0], native_category: 'deploy' }], adaptersOnce());
    if (!rogue.unmapped.length) fail('an unknown fresh-clone category must halt at projection (default: FAIL)');
    // the CLI end to end: ingest writes the rows file and the raw archive, and the run validates green
    copyFixtureFindings('notesbox', tmp);
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), readFileSync(join(HERE, 'fixtures', 'notesbox', 'map', 'scanners.yaml'), 'utf8').replace(/  fresh-clone:\n    status: skipped\n    reason: "[^"]*"\n/, '  fresh-clone:\n    status: ran\n'));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', out, '--exit', '1'], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept the fixture document (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (!existsSync(join(tmp, 'map', 'findings', 'fresh-clone.yaml')) || !existsSync(join(tmp, 'map', 'raw', 'fresh-clone.json'))) fail('ingest must write map/findings/fresh-clone.yaml and archive the raw document');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested fresh-clone run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
    // a verified-clean run: the explicit empty file validates green with fresh-clone recorded as ran
    writeFileSync(join(tmp, 'clean.json'), JSON.stringify(cleanDoc));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'fresh-clone', '--raw', join(tmp, 'clean.json'), '--exit', '0'], { stdio: 'pipe' }); } catch { fail('ingest must accept a clean (exit 0) document'); }
    const cleanFile = readFileSync(join(tmp, 'map', 'findings', 'fresh-clone.yaml'), 'utf8');
    if (!/0 row\(s\)/.test(cleanFile) || /^- id:/m.test(cleanFile)) fail('a clean run writes the explicit empty rows file');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch { fail('a verified-clean fresh-clone run (empty explicit file, manifest ran) must validate green'); }
  }
  rmSync(tmp, { recursive: true, force: true });
}
