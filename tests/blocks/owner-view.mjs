// ── Owner: the fourth view of the same measurement, in the owner's own register ─
// (a) every requirement row carries a non-empty owner.risk / owner.fix (fail-closed,
//     mirrored by validateYardstick's own rejection of a row with neither);
// (b) compiling the public notesbox fixture writes OWNER.md with the six headings the
//     brief specifies, and views/owner.yaml's floor rows agree with Intake's floor rows
//     by id and status — the SAME measurement, never a second opinion;
// (c) OWNER.md carries no score/grade line (CLAUDE.md rule 1: the map states what is,
//     a view computes open/met/not-measured, never prices or grades it);
// (d) a requirement row with its owner block removed fails validateYardstick — the
//     negative half of (a), a missing register is a validation failure, not a blank page.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadYardstick, validateYardstick } from '../../yardstick/measure.mjs';
import { viewPath as runViewPath, ownerPagePath as runOwnerPagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'owner-view';

export async function run() {
  const fail = (m) => negFailures.push('owner-view: ' + m);
  const reg = loadYardstick();

  // (a) every one of the 55 rows carries owner.risk / owner.fix
  const missingOwner = reg.requirements.filter((d) => !d.owner || !String(d.owner.risk || '').trim() || !String(d.owner.fix || '').trim());
  if (missingOwner.length) fail(`every requirement row must carry non-empty owner.risk and owner.fix (missing on ${missingOwner.map((d) => d.id).join(', ')})`);

  // (d) the negative half: strip one row's owner block and confirm the register-level
  // validator (the same one loadYardstick calls) rejects it — never silently blank
  const stripped = JSON.parse(JSON.stringify(reg));
  delete stripped.requirements[0].owner;
  const strippedErrors = validateYardstick(stripped);
  if (!strippedErrors.some((e) => /owner\.risk and owner\.fix required/.test(e))) fail('validateYardstick must reject a requirement row with no owner block');

  // (b) + (c): compile the notesbox fixture and read OWNER.md + views/owner.yaml back
  const tmp = join(HERE, 'tmp-owner-view'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed on the notesbox fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'intake.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/intake.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'owner.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/owner.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }

  const ownerPage = existsSync(runOwnerPagePath(tmp)) ? readFileSync(runOwnerPagePath(tmp), 'utf8') : '';
  if (!ownerPage) fail('OWNER.md must be written at the run root');
  const HEADINGS = ['## Fix in this order', '## Could not tell', '## Holds', '## Beyond the floor', '## What was not looked at'];
  for (const h of HEADINGS) if (!ownerPage.includes(h)) fail(`OWNER.md must carry the heading "${h}"`);
  if (!/^# What is true of /m.test(ownerPage)) fail('OWNER.md must open with "# What is true of …"');

  // (c) no score/grade/verdict line — CLAUDE.md rule 1, the same discipline Intake/Maintain hold
  const SCORE_PATTERN = /\b\d+(\.\d+)?\s*\/\s*\d+\b|\b\d+\s*(out of|of)\s*\d+\s*(points?|stars?)\b|\bscore\s*[:=]|\bgrade\s*[:=]|\b[A-F][+-]?\s+grade\b|\bpass(ed)?\/fail(ed)?\b|\boverall\s+(rating|verdict)\b/i;
  const scoreLines = ownerPage.split('\n').filter((l) => SCORE_PATTERN.test(l));
  if (scoreLines.length) fail(`OWNER.md must carry no score/grade line (found: ${JSON.stringify(scoreLines)})`);

  if (!existsSync(runViewPath(tmp, 'owner'))) fail('views/owner.yaml must be written');
  else {
    const ownerDoc = parseYaml(readFileSync(runViewPath(tmp, 'owner'), 'utf8'));
    const intakeYamlDoc = parseYaml(readFileSync(runViewPath(tmp, 'intake'), 'utf8'));
    const intakeStatus = {};
    for (const r of intakeYamlDoc.open || []) intakeStatus[r.id] = r.status;
    for (const r of intakeYamlDoc.met || []) intakeStatus[r.id] = 'met';
    for (const r of intakeYamlDoc.to_run || []) intakeStatus[r.id] = 'not-measured';
    for (const r of intakeYamlDoc.not_applicable || []) intakeStatus[r.id] = 'not-applicable';
    const ownerStatus = {};
    for (const r of ownerDoc.floor?.open || []) ownerStatus[r.id] = r.status;
    for (const r of ownerDoc.floor?.met || []) ownerStatus[r.id] = r.status;
    for (const r of ownerDoc.floor?.not_measured || []) ownerStatus[r.id] = r.status;
    for (const r of ownerDoc.floor?.not_applicable || []) ownerStatus[r.id] = r.status;
    const intakeIds = Object.keys(intakeStatus), ownerIds = Object.keys(ownerStatus);
    const missing = intakeIds.filter((id) => !(id in ownerStatus));
    const mismatched = intakeIds.filter((id) => id in ownerStatus && ownerStatus[id] !== intakeStatus[id]);
    if (intakeIds.length !== ownerIds.length || missing.length || mismatched.length)
      fail(`views/owner.yaml's floor rows must equal Intake's rows by id and status (intake ${intakeIds.length}, owner ${ownerIds.length}; missing ${missing.join(', ') || 'none'}; mismatched ${mismatched.join(', ') || 'none'})`);

    // every floor row carries a non-empty risk/fix/check, joined from the register
    const allFloor = [...(ownerDoc.floor.open || []), ...(ownerDoc.floor.met || []), ...(ownerDoc.floor.not_measured || [])];
    const blank = allFloor.filter((r) => !r.risk || !r.fix || !r.check);
    if (blank.length) fail(`every owner.yaml floor row must carry risk, fix and check (blank on ${blank.map((r) => r.id).join(', ')})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
