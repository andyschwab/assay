// ── Intake, Maintain, Improve: three views of one yardstick measurement ───────
// All three read ONLY yardstick.yaml (+ the yardstick for title/check/tier,
// + the manifest for what was not seen) — never findings directly. Intake is the
// floor population, Maintain the fleet population (every row also stamped
// floor: true|false), Improve groups every requirement by topic exactly once.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'intake-maintain-improve';

export async function run() {
  const fail = (m) => negFailures.push('intake-maintain-improve: ' + m);
  const tmp = join(HERE, 'tmp-views'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed on the notesbox fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'intake.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/intake.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'maintain.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/maintain.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'topics.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`views/improve/topics.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }

  for (const f of ['intake.yaml', 'maintain.yaml', 'improve.yaml']) if (!existsSync(join(tmp, 'views', f))) fail(`views/${f} must be written`);
  if (!existsSync(join(tmp, 'INTAKE.md'))) fail('INTAKE.md must be written at the run root');
  if (!existsSync(join(tmp, 'MAINTAIN.md'))) fail('MAINTAIN.md must be written at the run root');

  const reg = loadYardstick();
  const dupes = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);

  if (existsSync(join(tmp, 'views', 'intake.yaml'))) {
    const doc = parseYaml(readFileSync(join(tmp, 'views', 'intake.yaml'), 'utf8'));
    const floorIds = reg.requirements.filter((d) => (d.tags || []).includes('floor')).map((d) => d.id);
    const all = [...(doc.open || []), ...(doc.met || []), ...(doc.to_run || [])];
    const ids = all.map((r) => r.id);
    const missing = floorIds.filter((id) => !ids.includes(id));
    if (ids.length !== floorIds.length || missing.length || dupes(ids).length)
      fail(`every floor row must appear exactly once across intake.yaml's open/met/to_run (got ${ids.length} of ${floorIds.length} floor rows; missing ${missing.join(', ') || 'none'}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  let maintainDoc = null;
  if (existsSync(join(tmp, 'views', 'maintain.yaml'))) {
    maintainDoc = parseYaml(readFileSync(join(tmp, 'views', 'maintain.yaml'), 'utf8'));
    const fleetIds = reg.requirements.filter((d) => (d.tags || []).includes('fleet')).map((d) => d.id);
    const all = [...(maintainDoc.open || []), ...(maintainDoc.met || []), ...(maintainDoc.to_run || [])];
    const ids = all.map((r) => r.id);
    const missing = fleetIds.filter((id) => !ids.includes(id));
    if (ids.length !== fleetIds.length || missing.length || dupes(ids).length)
      fail(`every fleet row must appear exactly once in maintain.yaml (got ${ids.length} of ${fleetIds.length} fleet rows; missing ${missing.join(', ') || 'none'}; duplicated ${dupes(ids).join(', ') || 'none'})`);
    if (all.some((r) => typeof r.floor !== 'boolean')) fail('every maintain.yaml row must carry floor: true|false');
  }

  if (existsSync(join(tmp, 'views', 'improve.yaml'))) {
    const doc = parseYaml(readFileSync(join(tmp, 'views', 'improve.yaml'), 'utf8'));
    const ids = (doc.topics || []).flatMap((t) => (t.rows || []).map((r) => r.id));
    if (ids.length !== reg.requirements.length || dupes(ids).length)
      fail(`every requirement must appear exactly once in improve.yaml (got ${ids.length} of ${reg.requirements.length}; duplicated ${dupes(ids).join(', ') || 'none'})`);
  }

  // decided_by: "owner" for every claim row (claim always reads not-measured, so
  // it always lands in to_run) — check both Intake and Maintain's to_run lists.
  const claimIds = new Set(reg.requirements.filter((d) => d.decide.kind === 'claim').map((d) => d.id));
  const intakeDoc = existsSync(join(tmp, 'views', 'intake.yaml')) ? parseYaml(readFileSync(join(tmp, 'views', 'intake.yaml'), 'utf8')) : null;
  const toRunClaims = [...((intakeDoc && intakeDoc.to_run) || []), ...((maintainDoc && maintainDoc.to_run) || [])].filter((r) => claimIds.has(r.id));
  if (!toRunClaims.length) fail('expected at least one claim row in to_run to check decided_by against');
  else {
    const bad = toRunClaims.filter((r) => r.decided_by !== 'owner');
    if (bad.length) fail(`decided_by must be "owner" for every claim row (got ${bad.map((r) => `${r.id}:${r.decided_by}`).join(', ')})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
