# Contributing

Read `CLAUDE.md` first: the ground rules and how a change lands. This page is the one home of
the landing steps; a brief for a change states its invariant and its shape, and points here for
the rest.

## Landing a change

1. **Put the pinned tools on PATH.** The suite runs the instruments a routine runs, so it needs
   the tools their adapters pin. Install them into a directory of your choosing, put it on PATH
   in the same shell, and confirm:

   ```sh
   node assay.mjs tools install --run --dir <bin>
   export PATH="<bin>:$PATH"
   node assay.mjs tools verify --run
   ```

2. **Run the gate: `npm run gate`.** It verifies the pinned tools (and stops there, with the
   install line, when one is missing), then runs `npm test`, `node tests/prove-red.mjs`,
   `npm run typecheck`, `npm run lint`, `node map/passes.mjs` and
   `node lib/release-notes.mjs --check`, every one of them whatever the one before it did, and
   ends in one exit line: `✓ assay gate: …`, or `✗ assay gate: …` naming each step that
   failed, exit 1. A change lands on a green gate. CI runs this same command
   (`.github/workflows/ci.yml`). The suite runs its blocks in parallel (`tests/README.md`,
   "How the blocks run"); it takes a few minutes, so run the gate in the background and read
   its exit line before you push.

3. **Red, then green.** Confirm each new assertion red with the rule it pins reverted, for its
   own reason, then green with the rule restored (`CLAUDE.md` § How a change lands). An
   assertion that holds a core invariant lands with its entry in `tests/prove-red.mjs`
   (`tests/README.md`, "Red proofs"), which the gate re-proves on every run; for any other, the
   commit that lands the assertion and the pull request body say it was confirmed red. A new harness
   block is a new file under `tests/blocks/` (`tests/README.md`); no existing file is edited to
   add one. An existing block that pins the old shape is re-pinned with the reason, in the
   block; a unit or negative assertion is never loosened.

4. **Re-bless only a pinned score, and only on purpose.** A change that moves a score
   `tests/golden.json` pins re-blesses it in the same commit (`node tests/regression.mjs
   --bless`, then review `git diff tests/golden.json`), saying why each number moved. A unit or
   negative assertion that fails is a real regression: restore the rule it pins; it is never
   re-blessed.

5. **One `Consumer:` paragraph.** A commit that touches a file of the consumer surface
   (`CONSUMERS.md`, "The change rule") carries its `Consumer:` trailers, what a consumer must
   change or `Consumer: none, <why>`, together in the message's last paragraph beside its other
   trailers: git reads trailers there only. `node lib/release-notes.mjs --check` (in the gate)
   names a commit that lacks one.

6. **A commit that removes something says in its subject what went and why.** The change
   record is git (`CLAUDE.md` § How a change lands): no history file or dated log is kept.

7. **Open the pull request on the template** (`.github/PULL_REQUEST_TEMPLATE.md`): what changed,
   and the evidence it is verified, the gate's exit line and each red you saw among it.

## Elsewhere

- A gap in the method, a scanner, the yardstick or a contract is an issue on this repository's
  tracker, stated with public evidence only.
- Security problems go to the address in `SECURITY.md`, not to an issue.
