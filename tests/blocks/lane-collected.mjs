// ── a collected review lane is validated whole, against the target it read (#201) ──
// A review session publishes; the consumer collects its outputs into the run and validates them, so a lane
// cannot publish a partial run as complete. `validate --lane <scanner> --target <checkout>`:
//   (a) a lane recorded ran with every file it publishes in the run validates;
//   (b) one of them missing fails, naming it; a plain validate does not ask, so a run drawn with fewer
//       passes, or frozen before the lanes, still validates;
//   (c) without --target it is refused: the lane's citations are read against the tree it reviewed;
//   (d) a lane collected but not recorded ran fails, naming the record command;
//   (e) a lane with no outputs of its own (its report is ingested) fails while nothing is ingested
//       (the run record's own rule: ran with no rows is not a clean run).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-collected';

export async function run() {
  const fail = (m) => negFailures.push('lane-collected: ' + m);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-lane-collected-'));
  const adapters = loadAdapters();
  const target = join(scratch, 'target'); mkdirSync(target);
  writeFileSync(join(target, 'README.md'), '# Demo\n\nWhat it is.\n');
  const finding = '- id: F-001\n  dimension: artifact-legibility\n  polarity: strength\n  subject_type: artifact\n  observation: >\n    The README says what the repository is.\n  evidence: [README.md:1]\n  confidence: confirmed\n';
  const outputs = laneSeed('practice-review', { name: 'Demo' }, adapters).outputs;
  // a run whose only scanner that ran is practice-review, every other one recorded skipped
  const runWith = (name, { pr = 'ran', drop = [], dcr = 'skipped' } = {}) => {
    const dir = join(scratch, name);
    mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
    const rows = Object.keys(adoptedAdapters(adapters)).map((id) => {
      const status = id === 'practice-review' ? pr : id === 'deep-code-review' ? dcr : 'skipped';
      return [`  ${id}:`, `    status: ${status}`, ...(status === 'ran' ? ['    model: "a-model"'] : ['    reason: "not in this block"'])].join('\n');
    });
    writeFileSync(join(dir, 'map', 'scanners.yaml'), `engine: block\nscanners:\n${rows.join('\n')}\n`);
    for (const o of outputs.filter((x) => !drop.includes(x))) {
      const body = o.endsWith('.md') ? '# Terrain\n\nA planted target with one README.\n' : o.endsWith('censuses.yaml') ? 'dimensions: []\n' : o.endsWith('-legibility.yaml') ? finding : '[]\n';
      writeFileSync(join(dir, o), body);
    }
    return dir;
  };
  const validate = (dir, extra) => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir, ...extra], { encoding: 'utf8' });
  try {
    // (a)
    const whole = validate(runWith('whole'), ['--lane', 'practice-review', '--target', target]);
    if (whole.status !== 0) fail(`(a) a lane recorded ran with every output in the run validates (got ${whole.status}: ${(whole.stderr + whole.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ')})`);

    // (b)
    const gone = 'map/findings/practice-review-gates.yaml';
    const partial = runWith('partial', { drop: [gone] });
    const strict = validate(partial, ['--lane', 'practice-review', '--target', target]);
    if (strict.status !== 1 || !strict.stderr.includes(gone)) fail(`(b) an output missing fails the lane's check, naming it (got ${strict.status}: ${strict.stderr.split('\n').filter((l) => /•/.test(l)).slice(0, 2).join(' | ')})`);
    const plain = validate(partial, []);
    if (plain.status !== 0) fail(`(b) a plain validate passes it (got ${plain.status})`);

    // (c)
    const noTarget = validate(runWith('no-target'), ['--lane', 'practice-review']);
    if (noTarget.status !== 2 || !/--target/.test(noTarget.stderr)) fail(`(c) --lane without --target is refused (got ${noTarget.status}: ${noTarget.stderr.trim()})`);

    // (d)
    const unrecorded = validate(runWith('unrecorded', { pr: 'skipped' }), ['--lane', 'practice-review', '--target', target]);
    if (unrecorded.status !== 1 || !/not recorded ran: node assay\.mjs record/.test(unrecorded.stderr)) fail(`(d) a lane collected but not recorded ran fails, naming the record command (got ${unrecorded.status})`);

    // (e)
    const notIngested = validate(runWith('not-ingested', { dcr: 'ran' }), ['--lane', 'deep-code-review', '--target', target]);
    if (notIngested.status !== 1 || !/status ran, but the base carries no rows from deep-code-review/.test(notIngested.stderr)) fail(`(e) a lane whose report is ingested fails while nothing is (got ${notIngested.status}: ${notIngested.stderr.split('\n').filter((l) => /•/.test(l)).slice(0, 2).join(' | ')})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
