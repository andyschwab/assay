#!/usr/bin/env node
// regression.mjs — the assay tool regression harness (public): the runner.
//
// Pins the load-bearing computed behavior of the engine so a change to a tool cannot
// silently move a result. It does NOT snapshot full output (that churns on wording); it
// pins: the negative fixtures the validator MUST reject, the fail-closed unit invariants
// (yaml-min throws on unparseable input; projection halts on an unmapped category), the
// engine-pipeline invariants (roster honesty, the explicit-axis rail, the
// non-blocking decision overlay), the instrument-port invariants (fail-loud intake, a
// secret is never copied, score bands, unknown-check halt), and — the headline — the
// engine's RECALL against the public known-answer fixtures. A deliberate change is a
// reviewed `--bless` of golden.json in the same commit; a negative/unit assertion is
// never re-blessed (a failure there is always a real regression).
//
// Each block is its own file under tests/blocks/ (tests/README.md says how to add one).
// This runner discovers them and runs each in its own process, a bounded pool at once
// (tests/harness.mjs runBlocksParallel): a block starts once the blocks its `after` names have
// finished, a block on CLOSED below runs alone, and the failures, the _score keys and each
// block's output come back in the serial run's order, so the verdict and the gate's last line
// are the serial run's. `--serial` runs them in filename order in this one process instead.
// The runner composes the gate's last line from the labels of the blocks that ran; it holds no
// block and no label of its own.
//
// Zero extra deps: the blocks import the tools' own library functions and shell out to validate.mjs.
//
// Usage:
//   node tests/regression.mjs              # assert against golden.json (exit 1 on any drift)
//   node tests/regression.mjs --bless      # rewrite golden.json from current state (reviewed!)
//   node tests/regression.mjs --serial     # one block at a time, in this process
//   node tests/regression.mjs --jobs N     # at most N blocks at once (default: the machine's
//                                          # available parallelism, or ASSAY_TEST_JOBS)

import { join } from 'node:path';
import { isMain } from '../map/doctrine.mjs';
import { HERE, GOLDEN, bless, negFailures, current, convertedRows, verdict, loadBlocks, runBlocks, runBlocksParallel, defaultJobs, gateLabels, gateLine } from './harness.mjs';

// The closed list: the blocks that cannot run beside another, each with its reason. Each runs
// alone, nothing else in the pool beside it. A label here that is no block is refused.
export const CLOSED = {
  'instrument-roster': 'plants an adapter (map/scanners/adapters/quill-review.yaml) that every loadAdapters() reads, and a bare run under tests/.tmp-roster-bare',
  'second-reviewer-adapter': 'plants an adapter (map/scanners/adapters/quill-review.yaml) that every loadAdapters() reads',
  'second-secret-scanner-adapter': 'plants an adapter (map/scanners/adapters/keyhound.yaml) that every loadAdapters() reads',
  'raw-minimised': 'lists os.tmpdir() before and after an in-process assay start instrument run and fails on any new assay-start-* entry; a block beside it running assay start leaves one there mid-run',
  'repo-files-nested': 'plants an untracked nested repository under tests/, the shape repoFiles() must drop; a whole-tree block beside it would read the tree mid-plant',
};

// the run itself, only when this file is the command (tests/prove-red.mjs imports CLOSED)
if (isMain(import.meta.url)) {
  const { blocks, errors } = await loadBlocks(join(HERE, 'blocks'));
  for (const e of errors) negFailures.push('runner: ' + e);
  let ran;
  if (process.argv.includes('--serial')) ran = await runBlocks(blocks, negFailures);
  else {
    const j = process.argv.indexOf('--jobs');
    const jobs = j > -1 ? Number(process.argv[j + 1]) : defaultJobs();
    if (!Number.isInteger(jobs) || jobs < 1) { console.error('--jobs takes a whole number of blocks at once, 1 or more'); process.exit(2); }
    const r = await runBlocksParallel(blocks, { jobs, closed: CLOSED, onOutput: (b, out) => { if (out) process.stdout.write(out); } });
    negFailures.push(...r.failures);
    Object.assign(current._score, r.score);
    convertedRows.push(...r.rows);
    ran = r.ran;
  }

  // the line's two counts are the negative fixtures and scored fixtures the blocks declare
  const count = (name) => {
    const b = blocks.find((x) => Array.isArray(x.mod[name]));
    if (!b) { negFailures.push(`runner: no block exports ${name}, so the gate line cannot count it`); return 0; }
    return b.mod[name].length;
  };
  const negative = count('NEGATIVE'), scored = count('SCORED');

  const v = verdict({ bless, negFailures, current, goldenPath: GOLDEN });
  for (const l of v.out) console.log(l);
  for (const l of v.err) console.error(l);
  if (v.ok) console.log(gateLine({ negative, scored, labels: gateLabels(ran) }));
  process.exit(v.exit);
}
