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
// This runner discovers them, runs them in filename order, and composes the gate's last
// line from the labels of the blocks that ran; it holds no block and no label of its own.
//
// Zero extra deps: the blocks import the tools' own library functions and shell out to validate.mjs.
//
// Usage:
//   node tests/regression.mjs            # assert against golden.json (exit 1 on any drift)
//   node tests/regression.mjs --bless    # rewrite golden.json from current state (reviewed!)

import { join } from 'node:path';
import { HERE, GOLDEN, bless, negFailures, current, verdict, loadBlocks, runBlocks, gateLabels, gateLine } from './harness.mjs';

const { blocks, errors } = await loadBlocks(join(HERE, 'blocks'));
for (const e of errors) negFailures.push('runner: ' + e);
const ran = await runBlocks(blocks, negFailures);

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
