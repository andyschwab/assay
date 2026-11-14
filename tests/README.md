# tests — the regression harness

`npm test` runs `node tests/regression.mjs`, the engine's deterministic gate. It fails
closed: any unit or negative failure, any drift from the scores pinned in
`tests/golden.json`, and any block the runner cannot load or that throws turns it red.

## Layout

```
tests/regression.mjs   the runner: discovers the blocks, runs them, prints the verdict;
                       holds the closed list (the blocks that run alone)
tests/harness.mjs      what every block shares: negFailures, the fixture helpers, the
                       verdict, and the runner's discovery and pools (loadBlocks,
                       runBlocks, runBlocksParallel)
tests/block-child.mjs  runs one block in its own process for the parallel runner
tests/blocks/          one block per file, tests/blocks/<label>.mjs
tests/golden.json      the pinned scores (`--bless` rewrites it; a reviewed change only)
tests/fixtures/        the public known-answer targets the scored fixtures grade
tests/negative/        malformed runs validate must reject
tests/instruments/     instrument inputs; tests/sweeps/ the committed sweep sets
```

The runner composes the gate's last line from the labels of the blocks that ran, so the
line is computed, never edited by hand.

## How the blocks run

`npm test` runs each block in its own process, a pool as wide as the machine's available
parallelism (`--jobs N` or `ASSAY_TEST_JOBS` narrows it); `node tests/regression.mjs --serial`
runs them one at a time in filename order in one process. Parallel is invisible: the failures,
the `_score` keys and each block's output come back in the serial run's order, so the verdict
and the gate's last line are the serial run's (`tests/blocks/parallel-runner.mjs` holds it).

- **Order.** A block starts once every block its `after` names has finished; a block whose
  `after` is `'*'` starts once every other block has.
- **Shared state moves through files the runner merges.** Each process reports its failures,
  the `_score` keys it set and the instrument rows it converted; a block that runs after others
  is handed the rows they converted. Two blocks setting one `_score` key is refused.
- **The working tree is shared.** A block that writes a path in it that git does not ignore
  writes what every whole-tree block reads, and the runner refuses it unless the block runs
  under `after` or is on the closed list. Scratch goes under `os.tmpdir()` or an ignored
  `tests/tmp-*`, named for the block.
- **The closed list** (`CLOSED` in `tests/regression.mjs`) names each block that cannot run
  beside another, with its reason; each runs alone. A label on it that is no block, or one
  with no reason, is refused. A new entry is a reviewed change with its reason, never a way
  to quiet a flaky block.

## How to add a block

Add one new file, `tests/blocks/<label>.mjs`. No existing file changes: the runner
discovers it and its label reaches the gate's last line.

```js
// ── what this block pins, and the issue it came from ──
import { negFailures } from '../harness.mjs';

export const label = 'my-check';        // the filename, without .mjs

export async function run() {
  const fail = (m) => negFailures.push('my-check: ' + m);
  // assertions; each broken invariant calls fail() with what is wrong
}
```

The runner reads four exports off a block:

- `export const label` — required, the block's filename; its failures are prefixed with it.
- `export async function run` — required, the block's assertions. A block that throws is
  a failure under its label, and it is not named on the gate line.
- `export const gate` — optional, the names the block puts on the gate's last line;
  `[label]` when absent. An empty gate and a gate label two blocks claim are refused:
  every block that runs is named on the line.
- `export const after` — optional, `'*'` to run after every other block (the
  instrument-severity block sweeps the rows the others converted, which the runner hands
  it), or a list of labels the block must run after.

The runner refuses a blocks directory that is empty, a label that is not its filename,
a block with no run function, an empty gate, and an after that names no block. Confirm a
new block red with the rule it pins reverted before trusting it (`CLAUDE.md` § How a
change lands).
