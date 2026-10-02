// ── since: two small runs (a fixture copy, one requirement flipped), incl. a
// finding "no longer found" — never "fixed" (views/README.md) ────────────────
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings } from '../../map/project.mjs';
import { decisionsPath, sincePagePath, viewPath as runViewPath, indexPath as runIndexPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'since';

export async function run() {
  const fail = (m) => negFailures.push('since: ' + m);
  const tmp = join(HERE, 'tmp-since'); rmSync(tmp, { recursive: true, force: true });
  const prev = join(tmp, 'prev-2026-01-01'), curr = join(tmp, 'curr-2026-02-01');
  copyFixtureFindings('notesbox', prev); copyFixtureScanners('notesbox', prev);
  copyFixtureFindings('notesbox', curr); copyFixtureScanners('notesbox', curr);
  // flip one requirement's deciding findings: gitleaks emptied in `curr` only —
  // d-secrets-out-of-history: unmet (prev) -> met (curr), and F-700 reads "no longer found".
  writeFileSync(join(curr, 'map', 'findings', 'gitleaks.yaml'), '[]\n');
  // a finding "no longer found" that carries no requirement at all (subject_type: control,
  // decided by no facet/instrument row) — removing it must change since's findings tally
  // and NOTHING in the yardstick, proving the two are read from independent inputs.
  const delFile = join(curr, 'map', 'findings', 'repo-eval-delegation.yaml');
  const delRaw = readFileSync(delFile, 'utf8');
  const delWithoutF050 = delRaw.replace(/- id: F-050[\s\S]*?(?=\n- id: F-051)/, '');
  if (delWithoutF050 === delRaw || delWithoutF050.includes('F-050')) fail('test setup: could not remove F-050 from the curr fixture copy — the since "no longer found" case would be vacuous');
  writeFileSync(delFile, delWithoutF050);
  for (const r of [prev, curr]) {
    // triage every open gap so a later compile of `curr` never hits the handoff's
    // degenerate gate — decisions.yaml never changes what measure.mjs decides (it
    // reads raw findings only), so this cannot affect the since comparison itself.
    const gaps = loadFindings(r).filter((f) => f.polarity === 'gap');
    mkdirSync(dirname(decisionsPath(r)), { recursive: true });
    writeFileSync(decisionsPath(r), gaps.map((f) => `- finding: ${f.id}\n  action: accept\n  reason: "regression fixture: triaged so the handoff never degenerates"\n  by: test\n  at: "2026-01-01"`).join('\n') + '\n');
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), r, '--write'], { stdio: 'pipe' }); }
    catch (e) { fail(`measure --write must succeed on ${r} (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  }

  let sinceOut = '';
  try { sinceOut = execFileSync(process.execPath, [join(ROOT, 'views', 'since.mjs'), curr, '--previous', prev], { stdio: 'pipe' }).toString(); }
  catch (e) { fail(`views/since.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-3).join(' | ')})`); }
  const sinceYamlPath = runViewPath(curr, 'since');
  if (!existsSync(sinceYamlPath)) fail('views/since.yaml must be written');
  if (!existsSync(sincePagePath(curr))) fail('SINCE.md must be written at the run root');
  const doc = existsSync(sinceYamlPath) ? parseYaml(readFileSync(sinceYamlPath, 'utf8')) : null;
  if (doc) {
    if (doc.view !== 'since' || doc.run !== 'curr-2026-02-01' || doc.previous !== 'prev-2026-01-01') fail('since.yaml must name itself, the run and the previous run');
    const improvedIds = (doc.improved || []).map((r) => r.id);
    if (!improvedIds.includes('d-secrets-out-of-history')) fail(`d-secrets-out-of-history must read improved (unmet -> met) in since.yaml (got improved: ${improvedIds.join(', ')})`);
    if ((doc.regressed || []).length) fail('nothing should have regressed in this fixture');
    const noLongerFound = (doc.findings?.no_longer_found || []).map((f) => f.id);
    if (!noLongerFound.includes('F-700')) fail(`F-700 (gitleaks, emptied in curr) must read as no-longer-found (got ${noLongerFound.join(', ')})`);
    if (!noLongerFound.includes('F-050')) fail(`F-050 (removed from curr's repo-eval pass) must read as no-longer-found (got ${noLongerFound.join(', ')})`);
  }
  const sincePage = existsSync(sincePagePath(curr)) ? readFileSync(sincePagePath(curr), 'utf8') : '';
  if (!/no longer found/i.test(sincePage) || /\bfixed\b/i.test(sincePage.replace(/never "fixed"/i, ''))) fail('SINCE.md must say "no longer found", never "fixed", for an unmatched finding');
  if (!sincePage.includes('regressed') || sincePage.indexOf('Regressed') > sincePage.indexOf('Improved')) fail('SINCE.md must lead with regressions, then improvements (most useful first)');

  // compile --since: writes SINCE.md and INDEX links it; compile without --since writes neither.
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), curr, '--since', prev], { stdio: 'pipe' }); }
  catch (e) { fail(`compile --since must succeed (${String(e.stderr || e.message).split('\n').slice(-5).join(' | ')})`); }
  if (!existsSync(sincePagePath(curr))) fail('compile --since must write SINCE.md');
  const index = existsSync(runIndexPath(curr)) ? readFileSync(runIndexPath(curr), 'utf8') : '';
  if (!index.includes('SINCE.md')) fail('INDEX.md must link SINCE.md when a since view was compiled');

  const curr2 = join(tmp, 'curr-no-since-2026-03-01');
  copyFixtureFindings('notesbox', curr2); copyFixtureScanners('notesbox', curr2);
  const gaps2 = loadFindings(curr2).filter((f) => f.polarity === 'gap');
  mkdirSync(dirname(decisionsPath(curr2)), { recursive: true });
  writeFileSync(decisionsPath(curr2), gaps2.map((f) => `- finding: ${f.id}\n  action: accept\n  reason: "regression fixture"\n  by: test\n  at: "2026-01-01"`).join('\n') + '\n');
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), curr2], { stdio: 'pipe' }); }
  catch (e) { fail(`compile with no --since must still succeed (${String(e.stderr || e.message).split('\n').slice(-5).join(' | ')})`); }
  if (existsSync(sincePagePath(curr2)) || existsSync(runViewPath(curr2, 'since'))) fail('compile with no --since must write neither SINCE.md nor views/since.yaml');
  const index2 = existsSync(runIndexPath(curr2)) ? readFileSync(runIndexPath(curr2), 'utf8') : '';
  if (index2.includes('SINCE.md')) fail('INDEX.md must not link SINCE.md when no since view was compiled');

  rmSync(tmp, { recursive: true, force: true });
}
