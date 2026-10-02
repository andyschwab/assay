// ── SCORED fixtures (the recall floor) ────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings, loadAdapters, loadManifest } from '../../map/project.mjs';
import { score } from '../../map/score.mjs';
import { HERE, current } from '../harness.mjs';

export const label = 'fixture-recall';

// SCORED public-fixture runs: grade the engine against the known-answer sheets so recall
// and the control's false-positive count are pinned. A projection change that mis-homes a
// finding drops recall and this goes red. Answer sheets live beside each run.
export const SCORED = [
  ['notesbox', join(HERE, 'fixtures', 'notesbox')],
  ['cleanlib', join(HERE, 'fixtures', 'cleanlib')],
  ['fixtures-root', join(HERE, 'fixtures', 'fixtures-root')],   // the repo-scoped instruments (repo-census)
];

export async function run() {
  for (const [key, dir] of SCORED) {
    try {
      const answers = parseYaml(readFileSync(join(dir, 'ANSWERS.yaml'), 'utf8'));
      const findings = loadFindings(dir);
      const r = score(findings, loadAdapters(), answers, loadManifest(dir));
      const missed = r.results.filter((x) => x.status === 'missed').length;
      const misHomed = r.results.filter((x) => x.status === 'mis-homed').length;
      current._score[key] = { recall: r.recall, recovered: r.recovered, in_scope: r.total_in_scope, missed, misHomed, falsePositives: r.falsePositives.length };
    } catch (e) { current._score[key] = { error: e.message.split('\n')[0] }; }
  }
}
