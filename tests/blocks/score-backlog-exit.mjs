// ── score --json and backlog carry their verdict in the exit code (#53, F-1228, F-308) ──
// score's JSON mode exited 0 whatever it graded; backlog read a sub-tool that crashed as
// zero items in that class and exited 0. A crashed class is not computed, never 0.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'score-backlog-exit';

export async function run() {
  const fail = (m) => negFailures.push('score-backlog-exit: ' + m);
  const nb = join(HERE, 'fixtures', 'notesbox');
  const scoreExit = (answers, json) => spawnSync(process.execPath, [join(ROOT, 'map', 'score.mjs'), nb, '--answers', answers, ...(json ? ['--json'] : [])], { encoding: 'utf8' }).status;
  const miss = join(HERE, 'fixtures', 'cleanlib', 'ANSWERS.yaml');   // a control sheet: notesbox's findings are false positives there
  if (scoreExit(miss, false) !== 1) fail('the fixture is wrong: score (text) over a failing grade must exit 1');
  if (scoreExit(miss, true) !== 1) fail('score --json over a failing grade must exit 1, the same verdict as text mode');
  if (scoreExit(join(nb, 'ANSWERS.yaml'), true) !== 0) fail('score --json over a passing grade must exit 0');
  const bl = (extra) => spawnSync(process.execPath, [join(ROOT, 'map', 'backlog.mjs'), nb, ...extra], { encoding: 'utf8' });
  const crashed = bl(['--target', join(HERE, 'tmp-no-such-target')]);
  if (crashed.status === 0) fail('backlog must exit non-zero when a sub-tool (enumerate) crashed');
  let doc = null; try { doc = parseYaml(crashed.stdout); } catch (e) { fail(`backlog's output must still parse (${e.message})`); }
  if (doc) {
    if (doc.counts?.['un-enumerated-population'] === 0) fail('a class whose sub-tool crashed must not be counted 0');
    if (!/enumerate/.test(String(doc.not_computed?.['un-enumerated-population'] || ''))) fail(`a class whose sub-tool crashed must be recorded not computed, with the reason (got ${JSON.stringify(doc.not_computed)})`);
  }
  const priorGone = bl(['--prior', join(HERE, 'tmp-no-such-prior')]);
  if (priorGone.status === 0) fail('backlog must exit non-zero when the prior run it was given cannot be read');
  let pdoc = null; try { pdoc = parseYaml(priorGone.stdout); } catch (e) { fail(`backlog's output must still parse (${e.message})`); }
  if (pdoc && (pdoc.counts?.['coverage-divergence'] === 0 || !pdoc.not_computed?.['coverage-divergence'])) fail(`an unreadable prior must leave coverage-divergence not computed, never 0 (got ${JSON.stringify(pdoc.counts)})`);
  const plain = bl([]);
  if (plain.status !== 0) fail(`backlog with no sub-tool requested must exit 0 (got ${plain.status}: ${String(plain.stderr).slice(0, 160)})`);
}
