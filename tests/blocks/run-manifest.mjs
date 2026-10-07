// ── run-manifest invariants: absence is named, never implied ──────────────────
// The registry of "not measured" axes comes from ADOPTED adapters only; a retired
// adapter (adopted: false) stays projectable for frozen rows but never widens the
// roster a run must dispose of. Every renderer names a scanner that did not run
// with its recorded reason; the package refuses to compile without the manifest;
// appendices come from THIS run only (a sibling run's report is never listed).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadAdapters, adoptedAdapters, registryAxes, dispositions, scannerLine, notRunPhrase, AXIS_ORDER, orderAxes, axisTitle } from '../../map/project.mjs';
import { TOPICS } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'run-manifest';

export async function run() {
  const fail = (m) => negFailures.push('run-manifest: ' + m);
  const adapters = loadAdapters();
  const adopted = Object.keys(adoptedAdapters(adapters)).sort();
  if (adopted.includes('scorecard')) fail('scorecard is retired (adopted: false) and must not be in the adopted roster');
  if (!adapters.scorecard) fail('the retired scorecard adapter must still LOAD (frozen runs carrying its rows must project)');
  // the adopted roster is pinned by name: adopting or retiring a scanner is a reviewed
  // change to this line in the same commit (fresh-clone adopted 2026-09-22;
  // dependency-scan and repo-census adopted 2026-09-24; structure-scan adopted 2026-10-05, #108)
  if (JSON.stringify(adopted) !== JSON.stringify(['deep-code-review', 'dependency-scan', 'fresh-clone', 'gitleaks', 'repo-census', 'repo-eval', 'structure-scan'])) fail(`adopted roster must be deep-code-review, dependency-scan, fresh-clone, gitleaks, repo-census, repo-eval, structure-scan (got ${adopted.join(', ')})`);
  const reg = registryAxes(adapters);
  // code-maintainability joined 2026-10-05 (#109): deep-code-review's domain H contributes it
  if (!reg.includes('code-security') || !reg.includes('multiplayer') || !reg.includes('code-maintainability') || reg.length !== 10) fail(`registry must be the 10 axes the adopted scanners contribute — an instrument adds none (got ${reg.length}: ${reg.join(', ')})`);
  if (orderAxes(reg).join() !== AXIS_ORDER.join()) fail(`AXIS_ORDER must name every registry axis, code-maintainability between code-correctness and code-security (got ${orderAxes(reg).join(', ')})`);
  if (axisTitle('code-maintainability') === 'code-maintainability') fail('code-maintainability must carry a label in AXIS_META');
  if (!TOPICS.includes('code-maintainability')) fail('the yardstick TOPICS must accept code-maintainability (the axis roster plus three)');
  const m = { engine: 'x', scanners: { 'repo-eval': { status: 'ran' }, 'deep-code-review': { status: 'skipped', reason: 'out of scope' }, gitleaks: { status: 'failed', reason: 'binary missing' }, 'fresh-clone': { status: 'skipped', reason: 'no scratch clone here' }, 'dependency-scan': { status: 'skipped', reason: 'no registry reach here' }, 'repo-census': { status: 'skipped', reason: 'no filesystem access here' }, 'structure-scan': { status: 'skipped', reason: 'no registry reach here' } } };
  const d = dispositions(m, adapters);
  if (d.ran.join() !== 'repo-eval' || d.skipped[0]?.reason !== 'out of scope' || d.failed[0]?.id !== 'gitleaks' || d.missing.length) fail('dispositions must group ran / skipped / failed with reasons and report nothing missing');
  const line = scannerLine(m, ['repo-eval'], adapters);
  if (!line.includes('skipped: deep-code-review (out of scope)') || !line.includes('failed: gitleaks (binary missing)') || !line.includes('fresh-clone (no scratch clone here)')) fail(`the scanners line must name skipped and failed scanners with their reasons (got "${line}")`);
  if (!scannerLine(null, ['repo-eval'], adapters).includes('no run manifest')) fail('a missing manifest must be named on the scanners line, never silently omitted');
  if (dispositions({ scanners: { 'repo-eval': { status: 'ran' } } }, adapters).missing.join() !== 'deep-code-review,dependency-scan,fresh-clone,gitleaks,repo-census,structure-scan') fail('adopted scanners without a row must be reported missing');
  if (!notRunPhrase(m, 'deep-code-review').startsWith('skipped this run: out of scope')) fail('notRunPhrase must carry the recorded reason');
  // the package: refuses without a manifest; lists this run's appendices only, and names the skip
  const tmp = join(HERE, 'tmp-manifest');
  rmSync(tmp, { recursive: true, force: true });
  const runA = join(tmp, 'runs', 'a-2026-01-01'), runB = join(tmp, 'runs', 'b-2026-01-02');
  // run A is notesbox with deep-code-review recorded skipped (the stored run has it ran, #16):
  // its rows dropped, so the code axes it measures read not measured, with the reason
  copyFixtureFindings('notesbox', runA);
  rmSync(join(runA, 'map', 'findings', 'deep-code-review.yaml'), { force: true });
  mkdirSync(join(runB, 'map', 'native'), { recursive: true });
  writeFileSync(join(runB, 'map', 'native', 'deep-code-review.md'), '# a sibling run\'s native report — must never be listed by run A\n');
  let refused = false;
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), runA], { stdio: 'pipe' }); } catch { refused = true; }
  if (!refused) fail('compile-package must refuse to compile a run with no manifest (the package is what gets read)');
  if (existsSync(join(runA, 'INDEX.md'))) fail('a refused package must not have written INDEX.md');
  copyFixtureScanners('notesbox', runA);
  const manifestA = join(runA, 'map', 'scanners.yaml');
  const ranRow = '  deep-code-review:\n    status: ran\n';
  const manifestText = readFileSync(manifestA, 'utf8');
  if (!manifestText.includes(ranRow)) fail('the stored notesbox run record must say deep-code-review ran');
  writeFileSync(manifestA, manifestText.replace(ranRow, '  deep-code-review:\n    status: skipped\n    reason: "fixture run: the code scanner was not executed over this public target"\n'));
  // the walk prints the reason on the not-measured register
  const walk = execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'axes.mjs'), runA, '--stdout'], { stdio: 'pipe' }).toString();
  if (!walk.includes('deep-code-review (skipped this run: fixture run')) fail('the walk must print the skipped scanner and its reason on the not-measured register');
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), runA], { stdio: 'pipe' }); }
  catch (e) { fail(`compile-package must compile a run with a valid manifest (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  const index = existsSync(join(runA, 'INDEX.md')) ? readFileSync(join(runA, 'INDEX.md'), 'utf8') : '';
  if (index.includes('b-2026-01-02')) fail('INDEX must not list a sibling run\'s native report as this run\'s appendix');
  if (!index.includes('skipped: deep-code-review (fixture run')) fail('INDEX must name the skipped scanner and its reason on the scanners line');
  if (!index.includes('deep-code-review skipped this run: fixture run')) fail('INDEX not-measured line must say WHY the measuring scanner did not run');
  const start = existsSync(join(runA, 'handoff', 'START-HERE.md')) ? readFileSync(join(runA, 'handoff', 'START-HERE.md'), 'utf8') : '';
  if (!start.includes('skipped: deep-code-review (fixture run')) fail('the handoff must carry the same scanners line with the skip reason');
  rmSync(tmp, { recursive: true, force: true });
}
