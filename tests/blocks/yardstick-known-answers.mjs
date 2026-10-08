// ── the yardstick's known answers (#18) ───────────────────────────────────────
// fixture-recall grades the MAP against the planted items; this grades the
// MEASUREMENT. Each scored fixture's sheet carries a `requirements:` list (the
// requirement id → the status a run of the target should read, with its reason), and
// the stored run's measurement is graded against it: agree, disagree, or out of scope
// (the deciding method did not run, so the row reads not-measured). Every claim-kind
// row is graded too, expected not-measured from a run alone, never met. The counts and
// the disagreeing ids are pinned in tests/golden.json under `<run>/requirements`, so a
// change to a decider, a tier or a topic that moves a fixture's status reads as drift.
// Pinned: (a) the grades, (b) a status hand-edited to the wrong one turns the verdict
// red, (c) a sheet that answers a claim row met, names no requirement, or carries an
// unknown status is refused, never graded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadManifest } from '../../map/project.mjs';
import { gradeRequirements } from '../../map/score.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { HERE, GOLDEN, current, verdict, negFailures } from '../harness.mjs';
import { SCORED } from './fixture-recall.mjs';

export const label = 'yardstick-known-answers';

const pinned = (g) => ({ agree: g.agree, disagree: g.disagree, out_of_scope: g.out_of_scope, disagreements: g.results.filter((r) => r.grade === 'disagree').map((r) => r.id) });

export async function run() {
  const fail = (m) => negFailures.push('yardstick-known-answers: ' + m);
  const reg = loadYardstick();
  const graded = {};
  for (const [key, dir] of SCORED) {
    const at = `${key}/requirements`;
    try {
      const answers = parseYaml(readFileSync(join(dir, 'ANSWERS.yaml'), 'utf8'));
      const rows = projectRun(dir, reg);
      const g = gradeRequirements(rows, answers, reg, loadManifest(dir));
      graded[key] = { answers, rows, manifest: loadManifest(dir), g };
      current._score[at] = pinned(g);
    } catch (e) { current._score[at] = { error: e.message.split('\n')[0] }; }
  }

  // (a) every claim-kind row is graded, and reads not-measured from a run alone
  const claims = reg.requirements.filter((d) => d.decide.kind === 'claim').map((d) => d.id);
  for (const [key, x] of Object.entries(graded)) {
    const claimGrades = x.g.results.filter((r) => claims.includes(r.id));
    if (claimGrades.length !== claims.length) fail(`${key}: every claim-kind row must be graded (graded ${claimGrades.length} of ${claims.length})`);
    for (const r of claimGrades) if (r.expected !== 'not-measured' || r.grade !== 'agree') fail(`${key}: claim row ${r.id} must read not-measured from a run alone (expected ${r.expected}, read ${r.actual})`);
  }

  // (b) a status hand-edited to the wrong one is a disagreement, and the verdict goes red
  const nb = graded.notesbox;
  if (!nb) fail('the notesbox run must grade');
  else {
    const edited = structuredClone(nb.answers);
    const row = edited.requirements.find((r) => r.id === 'd-secrets-out-of-history');
    row.status = 'met';
    const g = gradeRequirements(nb.rows, edited, reg, nb.manifest);
    const r = g.results.find((x) => x.id === 'd-secrets-out-of-history');
    if (!r || r.grade !== 'disagree' || r.expected !== 'met' || r.actual !== 'unmet') fail(`a sheet edited to read d-secrets-out-of-history met must grade it disagree (got ${JSON.stringify(r)})`);
    const v = verdict({ bless: false, negFailures: [], current: { _score: { ...current._score, 'notesbox/requirements': pinned(g) } }, goldenPath: GOLDEN });
    if (v.exit !== 1 || !v.err.some((l) => l.includes('notesbox/requirements'))) fail('a sheet edited to the wrong status must turn the harness red on notesbox/requirements');
  }

  // (c) a sheet the contract refuses is never graded
  if (nb) {
    const refused = (what, mutate, re) => {
      const a = structuredClone(nb.answers); mutate(a);
      try { gradeRequirements(nb.rows, a, reg, nb.manifest); fail(`a sheet that ${what} must be refused`); }
      catch (e) { if (!re.test(e.message)) fail(`a sheet that ${what} must be refused for that reason (got: ${e.message})`); }
    };
    refused('answers a claim row met', (a) => a.requirements.push({ id: claims[0], status: 'met', reason: 'x' }), /claim/);
    refused('names no requirement', (a) => a.requirements.push({ id: 'd-no-such-row', status: 'met', reason: 'x' }), /d-no-such-row/);
    refused('carries an unknown status', (a) => { a.requirements[0].status = 'passing'; }, /passing/);
    refused('answers one requirement twice', (a) => a.requirements.push({ ...a.requirements[0] }), /twice/);
    refused('gives no reason', (a) => { delete a.requirements[0].reason; }, /reason/);
  }
}
