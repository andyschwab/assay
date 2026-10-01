# RUNBOOK — operating assay

assay runs no service and keeps no data of its own (`README.md`, "Architecture"),
so its operations are few: cutting a release, re-blessing the pinned scores,
restarting a stewarded repository's routine, rolling either back, rotating the
optional read token, and restoring a baseline. Each step below is something a
person runs; nothing here runs on its own.

## Release

1. The change is merged to `main` through a pull request whose `ci` check
   (`npm test`) is green, with its `HISTORY.md` entry.
2. A release that changes what the engine computes bumps `version` in
   `package.json` (and an instrument's own `VERSION` when its output changed)
   and says so in that `HISTORY.md` entry.
3. Tag the merge commit `v<version>` so a consumer can name it.
4. A stewarded repository adopts it by setting `ASSAY_REF` in its
   `.github/workflows/assay-routine.yml` to that commit's full SHA — never a
   branch or a tag, which can move (`routine/README.md`, "Installing it").

## Re-bless the pinned scores

Only when a change is meant to move a fixture's recall:

```sh
npm test                              # red: names each drifted score
node tests/regression.mjs --bless     # rewrites tests/golden.json
git diff tests/golden.json            # review every moved number
```

Commit `tests/golden.json` in the same commit as the change, saying why each
number moved. A unit or negative assertion that fails is never re-blessed: it
is a real regression; restore the rule it pins (`CLAUDE.md`, "Checks").

## Restart a routine run

A stewarded repository's routine (`routine/assay-routine.yml`) that failed or
needs re-running is restarted from the repository's Actions tab: re-run the
failed `routine` job, or start it by hand (`workflow_dispatch`). To reproduce
it locally against the same checkout:

```sh
node routine/run.mjs <repo-dir> --out <run-dir>
```

`<run-dir>/routine.yaml` records what that run did (`routine/README.md`).

## Roll back

- **The engine a repository runs.** Set `ASSAY_REF` back to the previous full
  commit SHA in a reviewed change to the repository's workflow; the next routine
  run uses it. Nothing else needs undoing: the routine never writes to the
  repository.
- **A change to assay itself.** Revert the commit on `main` through a pull
  request with green CI, with a `HISTORY.md` entry saying what was rolled back
  and why. Never rewrite `main`'s history.

## Rotate or revoke the read token

The routine needs a token only when assay's own repository is private: the
`ASSAY_READ_TOKEN` secret the "assay" checkout step reads
(`routine/assay-routine.yml`). It needs read access to that one repository and
nothing more.

- **Rotate the key:** create a new read-only token, replace the
  `ASSAY_READ_TOKEN` secret's value in the stewarded repository's settings,
  re-run the routine once to confirm it checks assay out, then revoke the old
  token where it was issued.
- **Revoke it:** delete the credential where it was issued and remove the
  secret. If assay's repository is public, comment the token line back out; the
  checkout needs no credential.

## Restore from backup

assay keeps no database and no backup of its own. What a stewarded repository
relies on is committed: `packet/baseline.yaml` and `packet/manifest.yaml` live in
that repository's git history, which is their backup. To restore a baseline
that was lost or wrongly changed, check the last good version out of history
and commit it as a reviewed change:

```sh
git log -- packet/baseline.yaml
git checkout <good-commit> -- packet/baseline.yaml
```

A run directory is regenerable, never restored: re-run `node assay.mjs compile
<run>` over its map, or draw the map again (`node assay.mjs start`).
