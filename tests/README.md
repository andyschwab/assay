# tests — the regression harness

`npm test` runs `node tests/regression.mjs`, the engine's deterministic gate. It fails
closed: any unit or negative failure, any drift from the scores pinned in
`tests/golden.json`, and any block the runner cannot load or that throws turns it red.

## Layout

```
tests/regression.mjs   the runner: discovers the blocks, runs them, prints the verdict
tests/harness.mjs      what every block shares: negFailures, the fixture helpers, the
                       verdict, and the runner's discovery (loadBlocks, runBlocks)
tests/blocks/          one block per file, tests/blocks/<label>.mjs
tests/golden.json      the pinned scores (`--bless` rewrites it; a reviewed change only)
tests/fixtures/        the public known-answer targets the scored fixtures grade
tests/negative/        malformed runs validate must reject
tests/instruments/     instrument inputs; tests/sweeps/ the committed sweep sets
```

The runner runs the blocks in filename order and composes the gate's last line from
the labels of the blocks that ran, so the line is computed, never edited by hand.

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
  `[label]` when absent. A gate label two blocks claim is refused.
- `export const after` — optional, `'*'` to run after every other block (the
  instrument-severity block sweeps the rows the others converted), or a list of labels
  the block must run after.

The runner refuses a blocks directory that is empty, a label that is not its filename,
a block with no run function, and an after that names no block. Confirm a new block red
with the rule it pins reverted before trusting it (`CLAUDE.md` § How a change lands).

Some blocks export `gate = []`: they ran before the split without a name on the gate
line (#87), and naming them there is its own reviewed change.
