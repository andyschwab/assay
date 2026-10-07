---
type: doc
title: "routine/ — the routine a stewarded repository runs on its own schedule"
---
# routine/

Once a steward takes a repository on, the repository itself keeps producing
assay's own measurement of it — on a schedule, on every pull request, on every
push to the default branch, and on demand — without a person re-running the
engine by hand. The push trigger exists because a pull request only measures
the change; without it, a way for something to reach the default branch
without going through that gate (an admin merge, a direct push, a merge
commit that changes the diff) would go unmeasured until the next weekly
schedule — the push trigger means merged main is measured the same day.
`assay-routine.yml` is a GitHub Actions workflow template; `run.mjs` is the
driver it calls, and the one a steward calls locally too, so CI and a terminal
run the identical path.

## What it produces, and where

Each firing writes an ordinary assay run directory — `map/`, `yardstick.yaml`,
`views/`, `INDEX.md`, `INTAKE.md`, `MAINTAIN.md`, `SINCE.md` when `--since` was
given (`views/README.md`) — and the workflow uploads that directory as a
build artifact (`assay-run-<run id>`, kept per the template's
`retention-days`). Nothing is written back into the repository: the routine
reads the checkout, measures it, and hands the result to whoever is watching
the workflow run.

That artifact can be downloaded by anyone who can read the repository's
workflow runs (on a public repository, anyone), for as long as
`retention-days` keeps it, and the upload step does not filter it. So nothing
in a run carries what an instrument's output could have echoed: ingest drops
fresh-clone's step output tails, dependency-scan's stderr tails and the code
text of structure-scan's duplicated blocks before
archiving to `map/raw/`, keeps gitleaks' locations only, and records a URL
target with its userinfo stripped. A failing step's cause is read from the
workflow's own log, not from the artifact.

Every firing also writes `<run>/routine.yaml` (`lib/run-layout.mjs`'s
`routinePath`) — the run's own record of what the routine did and whether its
gate held, so a fleet collector reading only the uploaded run artifact knows
the outcome without going back to the CI logs. It is written as the very last
step before `run.mjs` returns, on every path: a held or failed gate, a
skipped one (no baseline yet), and — best effort — `gate: not-run` when
`validate` or `compile` itself failed (or the routine hit an unexpected error)
before a measurement even existed to gate on.

```yaml
# routine.yaml — written by routine/run.mjs; the run's own record of what the routine did
routine: 1
date: "<ISO 8601 UTC timestamp>"
repository: "<the remote with userinfo stripped, if known; else omitted>"
commit: "<the checkout's HEAD sha>"
engine: "<assay commit the routine ran>"
trigger: "<GITHUB_EVENT_NAME when set: schedule | push | pull_request | workflow_dispatch; else local>"
baseline:
  source: none | file | ref
  where: "<the file path or git ref; omitted when none>"
gate: held | failed | skipped | not-run
failures:          # the ratchet's failure lines, verbatim, one per entry; [] when none
  - "<line>"
contradictions: <count of contradictions in yardstick.yaml>
exit: <the routine's exit code>
```

`commit` and `repository` come from the same checkout-identity check
`repo-census` uses (`map/repo-census.mjs`'s `gitHead`/`gitRemote`): the target
directory must be a repo root of its own, never resolved through git's own
upward discovery to an enclosing repository, and `repository` is left out
entirely when no `origin` remote is configured. `baseline.source` is `ref` on
a pull request (`--base-ref`, `where` the base ref), `file` on a schedule or
local run that found a baseline (`where` its path in the repository, or its absolute path
when it lives outside it), and `none` when
no baseline was found at all — which is exactly when `gate` reads `skipped`.
`gate: failed` is a ratchet exit of 1 (`failures` non-empty); `gate: held` is
exit 0 with a baseline in hand; `gate: not-run` means the gate never ran —
validation or compile failed, the routine crashed, or the ratchet could not
evaluate (exit 2: an unreadable baseline, a missing ref) — with the reason in
`failures`. A reason is recorded on one line, capped at 400 characters (the full
output stays in the CI log). `failures` is read straight
from the ratchet subprocess's own stderr — the lines `evaluateRatchet`
already prints with a `✗ ` prefix, minus its one summary line — rather than
re-loading the baseline and re-running the comparison a second time.

## What it runs, and what it never does

The routine runs the instruments assay runs offline on its own — `repo-census`,
`fresh-clone`, `dependency-scan`, `structure-scan` (whose knip step imports the
target's own tool configs, so in the two-job template it runs in the `target` job
after fresh-clone's install, never in the gate job, which never executes the
target) — plus `gitleaks` when that binary happens to
be on the runner's `PATH` and the checkout is the repository's own top level
(never a subdirectory of a larger checkout, whose history is not this
repository's); when either fails, the run record carries it `skipped`, with
that reason, never silently as clean
(`map/scanners/CONTRACT.md` §3a). `fresh-clone` executes the repository's own
install and scripts; the routine runs it in place because its checkout is a
fresh, disposable CI job, with the allow-listed environment of
`map/child-env.mjs` only (§3a, "What runs, and with what"), and in a job of
its own (below, "Two jobs"). `repo-eval` and `deep-code-review` are
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

## Two jobs: the change's code never shares a job with its gate

On a pull request the code being measured is the change itself, and
`fresh-clone` runs its install and tests. Whatever runs there can write to
anything in its job — the engine checkout, the run directory, the local
`origin/<base>` ref, the runner's step files — so a change whose test script
rewrote `yardstick/ratchet.mjs` or the run's `yardstick.yaml` could make its
own gate read held. The template therefore splits the routine in two:

- **`target`** checks out the repository and the pinned engine, runs
  `node routine/run.mjs <repo> --target-steps --handoff <dir>` — `fresh-clone`
  in place, then `structure-scan` over the dependencies that install left
  (knip, which imports the target's tool configs, runs in this job and
  nowhere else, #128), nothing else — and uploads only `<dir>` (each one's raw
  report, `fresh-clone.json` and `structure-scan.json`, and its
  `.status.json`, the exit and the last lines of its output) as a
  short-lived artifact. It never validates, compiles or ratchets.
- **`routine`** (`needs: target`; the required status check) checks out the
  repository and the pinned engine afresh, downloads the handoff, and runs
  `node routine/run.mjs <repo> --out <run> --handoff <dir>`: every other
  instrument, then `ingest` of the handed-forward reports (validated like any
  other — they are data, never code), validate, compile and ratchet. Nothing in
  this job ever executes the change. A missing or unreadable handoff records
  that instrument failed with the reason, never runs it and never reads clean.

The reports themselves are the change's own account of its install, its tests
and its structure (a change can rewrite what jscpd and knip report, as it can
what its tests report), which the change controls in any case once its code
runs beside them; what it can no longer reach is the
engine, the baseline, the packet and the run the gate reads. Both jobs check
out with `persist-credentials: false`, so no job token (and no
`ASSAY_READ_TOKEN`, when uncommented) is left in a `.git/config`; the gate
job's one `git fetch` of the base branch takes the token from its own step's
environment. The base branch name reaches every script through `env:`,
quoted, never expanded into the script text.

A steward's local run (no `--handoff`) runs `fresh-clone` itself, exactly
as before; run it in a disposable checkout.

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
`--base-ref "origin/$BASE_REF"`, the base branch through `env:`, after
fetching that branch) and
`routine/run.mjs` then reads the baseline with `git show
<base-ref>:packet/baseline.yaml` in the checkout (`yardstick/ratchet.mjs`'s
`--baseline-ref --repo`), never the file on disk. When the working tree's
`packet/baseline.yaml` differs from the base ref's copy at all, the routine
prints that plainly — a steward accepts a new baseline in its own reviewed
change, never silently through the pull request it would otherwise gate.
The packet is read the same way (`git show <base-ref>:packet/manifest.yaml`,
unless `--packet` names one): a change that edits its own claims is named,
and measured against the base branch's claims. A base ref that does not
resolve to a commit — mistyped, never fetched, or git itself failing — exits
1 with `gate: not-run` and the reason; only a ref that resolves and carries
no `packet/baseline.yaml` yet skips the gate. On a
schedule or `workflow_dispatch` run (no base ref — there is no "pull request"
to distinguish from the accepted state), the working tree's committed copy is
read directly, exactly as before.

## Installing it

1. Copy `routine/assay-routine.yml` into the stewarded repository as
   `.github/workflows/assay-routine.yml`.
2. Set `ASSAY_REPO` and `ASSAY_REF` in the file — `ASSAY_REF` is a full commit
   SHA, **never a branch name** (a branch moves; a scheduled run must run the
   exact engine a steward reviewed). If assay's own repository is private,
   uncomment the token line in both "assay" checkout steps and supply a
   secret that can read it; `persist-credentials: false` on those steps keeps
   it out of `.git/config`, where the `target` job's scripts would find it.
3. If the workflow's `pull_request` branch filter isn't the repository's
   actual default branch, change it.
4. Run the routine once (`workflow_dispatch`, or locally —
   `node routine/run.mjs <repo-dir> --out <run-dir>`), have a named steward
   review the result, and commit `packet/baseline.yaml` from it
   (`node assay.mjs ratchet <run-dir> --write-baseline packet/baseline.yaml`)
   — a reviewed change, same as any other.
5. **Make the `routine` job a required status check** on the default branch
   (repository Settings → Branches → a branch protection rule, or the newer
   rulesets UI — either names the job by its `jobs.routine` id; `target` need
   not be required, since `routine` needs it). Skip this and
   the gate is a red mark someone can ignore, never a block: GitHub runs a
   pull request's own copy of the workflow regardless of whether its job
   passes, and nothing stops the merge unless the branch rule says this job is
   required.
6. **Add `CODEOWNERS` entries for `packet/` and `.github/workflows/`**, naming
   the steward team, e.g.:
   ```
   /packet/                    @your-org/stewards
   /.github/workflows/         @your-org/stewards
   ```
   Without this, anyone who can open a pull request can also edit the baseline
   it is graded against or the workflow that grades it — a steward's review is
   what makes either change accountable, and `CODEOWNERS` is what makes that
   review required rather than optional.

Optional: to include `gitleaks`, add a workflow step that installs the
`gitleaks` binary onto `PATH` before the routine step; the routine detects it
automatically and needs no flag. The template carries this step commented out,
pinned to one release and verified against its published checksum — copy it in
and uncomment it rather than adding an unpinned `curl | sh` of your own.

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
