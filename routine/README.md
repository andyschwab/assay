---
type: doc
title: "routine/ — the routine a stewarded repository runs on its own schedule"
---
# routine/

Once a steward takes a repository on, the repository itself keeps producing
assay's own measurement of it — on a schedule, on every pull request, and on
demand — without a person re-running the engine by hand. `assay-routine.yml` is
a GitHub Actions workflow template; `run.mjs` is the driver it calls, and the
one a steward calls locally too, so CI and a terminal run the identical path.

## What it produces, and where

Each firing writes an ordinary assay run directory — `map/`, `yardstick.yaml`,
`views/`, `INDEX.md`, `INTAKE.md`, `MAINTAIN.md`, `SINCE.md` when `--since` was
given (`views/README.md`) — and the workflow uploads that directory as a
build artifact (`assay-run-<run id>`, kept per the template's
`retention-days`). Nothing is written back into the repository: the routine
reads the checkout, measures it, and hands the result to whoever is watching
the workflow run.

## What it runs, and what it never does

The routine runs the instruments assay runs offline on its own — `repo-census`,
`fresh-clone`, `dependency-scan` — plus `gitleaks` when that binary happens to
be on the runner's `PATH`; when it is not, the run record carries it
`skipped`, with that reason, never silently as clean
(`map/scanners/CONTRACT.md` §3a). `repo-eval` and `deep-code-review` are
judgment-bearing, LLM-driven scanners; the routine never runs them — every
run's record carries both `skipped: "not run by the routine; a steward
session runs them"`, so a repository's own scheduled runs never masquerade as
the fuller evaluation a steward session performs. It then validates, compiles
the package (folding in the repository's own `packet/` when one is committed —
`owner/PACKET.md` is the one home of that format, not restated here), and
ratchets the compiled measurement against `packet/baseline.yaml` when that
file exists.

The routine does not fix anything, does not triage anything
(`owner/decisions.yaml` stays a human's own act), and does not open issues —
it produces a measurement and a pass/fail on the baseline; what a steward or a
repository's own maintainers do with that is outside it.

## The baseline: accepted by a named steward, in a reviewed commit

A baseline (`yardstick/README.md`'s ratchet section is its one format home) is
never written or committed by the routine itself — `ratchet --write-baseline`
only writes the file to disk. A named steward reviews it and commits
`packet/baseline.yaml` themselves, as an ordinary reviewed change; from then
on every firing that finds that file ratchets against it, and a pull request
that would quietly unmeet something the baseline held fails the job — that
failure **is** the no-regression gate, not an incidental error.

Until a baseline is committed, the routine still runs and still compiles the
package; it prints a visible warning that no baseline exists yet rather than
skipping the ratchet in silence.

**On a pull request, the baseline is read from the base branch, never from the
change under review.** The pull request's own working tree is whatever the
change proposes — including, potentially, an edited `packet/baseline.yaml` —
so grading it against its own copy would let a change switch off the very gate
meant to hold it. The workflow template detects a pull request (it passes
`--base-ref origin/${{ github.base_ref }}` after fetching that branch) and
`routine/run.mjs` then reads the baseline with `git show
<base-ref>:packet/baseline.yaml` in the checkout (`yardstick/ratchet.mjs`'s
`--baseline-ref --repo`), never the file on disk. When the working tree's
`packet/baseline.yaml` differs from the base ref's copy at all, the routine
prints that plainly — a steward accepts a new baseline in its own reviewed
change, never silently through the pull request it would otherwise gate. On a
schedule or `workflow_dispatch` run (no base ref — there is no "pull request"
to distinguish from the accepted state), the working tree's committed copy is
read directly, exactly as before.

## Installing it

1. Copy `routine/assay-routine.yml` into the stewarded repository as
   `.github/workflows/assay-routine.yml`.
2. Set `ASSAY_REPO` and `ASSAY_REF` in the file — `ASSAY_REF` is a full commit
   SHA, **never a branch name** (a branch moves; a scheduled run must run the
   exact engine a steward reviewed). If assay's own repository is private,
   uncomment the token line in the "assay" checkout step and supply a secret
   that can read it.
3. If the workflow's `pull_request` branch filter isn't the repository's
   actual default branch, change it.
4. Run the routine once (`workflow_dispatch`, or locally —
   `node routine/run.mjs <repo-dir> --out <run-dir>`), have a named steward
   review the result, and commit `packet/baseline.yaml` from it
   (`node assay.mjs ratchet <run-dir> --write-baseline packet/baseline.yaml`)
   — a reviewed change, same as any other.

Optional: to include `gitleaks`, add a workflow step that installs the
`gitleaks` binary onto `PATH` before the routine step; the routine detects it
automatically and needs no flag.

## `--since` is not wired into the template

`compile --since` and `since.mjs` (`views/README.md`) need a previous run's
directory. The template does not fetch one: identifying "the previous
**scheduled** run" (as opposed to whichever workflow run happened to finish
last, `pull_request` runs included) and downloading its artifact both need
the GitHub Actions API, which needs an `actions: read` permission this
template deliberately does not add — the routine's own promise is
`permissions: contents: read` and no more. A steward who wants the since view
runs it locally against two run directories they have kept:

```sh
node routine/run.mjs <repo-dir> --out <run-dir> --since <prev-run-dir>
```

## Running it locally

```sh
node routine/run.mjs <repo-dir> --out <run-dir> [--baseline <file>] [--since <prev-run-dir>] [--packet <dir>]
```

`--baseline` defaults to `<repo-dir>/packet/baseline.yaml` when that file
exists; `--packet` defaults to `<repo-dir>/packet` when it carries a
`manifest.yaml`. Both can be pointed elsewhere (a packet kept beside the
repository rather than inside it, per `owner/PACKET.md`).
