# assay

**Evidence-based repository evaluation.** assay reads a codebase into a **map**
of what exists and what is true of it, measures the map against a **yardstick**
of requirements, and writes four **views** of the result:

| View | The question | Page | Data |
|---|---|---|---|
| **Intake** | Can this repository be taken on, and what must be true first? | `INTAKE.md` | `views/intake.yaml` |
| **Maintain** | Is it still healthy, and what do routines watch? | `MAINTAIN.md` | `views/maintain.yaml` |
| **Improve** | What makes it better next? | `IMPROVE.md`, the axis walk, `handoff/` | `views/improve.yaml` |
| **Owner** | What is true of my app, and what do I do first? | `OWNER.md` | `views/owner.yaml` |

With a previous run to compare against, a fifth, **Since**, reads two runs:
what changed between them (`SINCE.md`, `views/since.yaml`).

Every view is computed from the same map in one pass, so the four never
disagree about the repository. Owner reads the same measurement in plain,
non-engineer language — consequence first, no score, no grade, no verdict —
for the person who built the app with an AI. Each writes a data file with a
schema and a plain page; anything fancier (a branded report, a deck) is a
template over the data file and lives with whoever publishes it.

**The one rule that makes it honest: the map states what is; the views compute
how good, how bad, how urgent.** A finding may record "this effect is
irreversible and has no gate"; it may not record "critical". assay issues no
verdict and prices nothing. It shows what is met, what is open with the check
that would prove it closed, and what nobody measured.

## Architecture: the three layers

```
repository ─ scanners and instruments ─▶ map/ ─▶ yardstick/ ─▶ views/
                                          │          │            ├ Intake
   facts with file:line, counted          │          │            ├ Maintain
   populations, attack paths, and a  ─────┘          │            ├ Improve
   record of what was not looked at                  │            ├ Owner
                                                     │            └ Since (two runs)
                  requirements, each decided from the map:
                  met · unmet · mixed · not measured · not applicable
```

**The map** (`map/`). Scanners of two kinds draw it. **Peer scanners** bring
judgment and their own taxonomy: `repo-eval`, the built-in method
(`map/METHOD.md`), and `deep-code-review`, an external code reviewer. Each has an
adapter and keeps its native report as an appendix. **Instruments** are
deterministic and run offline against the checkout (offline as defined below): `gitleaks`; `fresh-clone`,
which installs, builds, lints, typechecks, tests and migrates from a clean
checkout and replays the README's commands, once per workspace in a monorepo;
`dependency-scan`, npm, pnpm or yarn audit over every lockfile; and `repo-census`, which
checks for an architecture page, a present-tense agent contract, a runbook, a
CI gate on the default branch, and the owner's evidence transcripts.
**Two instruments execute the target's code.** `fresh-clone` runs the target's
own install (lifecycle scripts included), build, lint, typecheck, test and
migrate-dry scripts, and `dependency-scan` runs the target's package manager.
Each child sees only `PATH`, `HOME`, `CI` and the runner's own `npm_config_*`
settings, never the evaluator's environment or credentials, and every audit
runs from a scratch copy of one lockfile and its manifest, so the target's own
`.npmrc`, `.yarnrc` or `.pnpmfile.cjs` never loads. That is not a sandbox: run
them in a disposable container or VM. `assay start` runs fresh-clone only
when given `--allow-exec` and otherwise records it skipped, with the reason. Every run
carries a **run record** (`map/scanners.yaml`) saying, for each adopted
scanner, that it ran, or was skipped or failed and why. The validator refuses a
run without one, and a scanner that did not run reads **not measured**, never
clean. The finding format is `map/SCHEMA.md`; the scanner contract is
`map/scanners/CONTRACT.md`.

**The yardstick** (`yardstick/`). `requirements.yaml` holds the requirements a
repository must meet to be stood behind, stated without naming a stack. Each has
a **tier** (the order to fix things when taking a repository on: custody,
safety, reproducibility, verification, legibility, operability), a **topic**
(what part of the code it is about), tags saying which view reads it (`floor`
for Intake, `fleet` for Maintain), and the mechanism that **decides** it from
the map. A requirement no run can decide is a **claim** only the owner can make,
and reads not measured until the owner does. `yardstick/README.md` is the
contract.

**The views** (`views/`). Intake reads the floor requirements in tier order;
Maintain reads the fleet requirements; Improve reads every requirement by topic
and adds the maturity of each dimension, the attack paths through the code, and
a fix prompt per gap; Owner reads the same floor and beyond-floor requirements
in plain, non-engineer language, joined with a risk and a fix from the
yardstick's own `owner:` register; Since compares two runs' measurements and
findings. `views/README.md` gives each data file's schema.

**What the owner supplies** (`owner/`). Some requirements are about things a
repository cannot show by itself: a restore was run, a rollback was exercised,
an account can be transferred. `owner/evidence/` is the format for committed
transcripts that decide six of them; `owner/ask-owner.md` is the one prompt an
owner pastes into their own AI to answer the rest (`node assay.mjs ask-owner`
fills it from the map); `owner/PACKET.md` is the format for a repository's own
**packet** — its answers to those and to any claim-kind requirement, validated
(`node assay.mjs validate-packet`) and folded into the measurement
(`node assay.mjs measure <run> --packet <dir>`), never merged with what the run
itself decided. `node assay.mjs ask-owner --run <run>` prints the owner prompt
pre-filled with what that run already shows.

**External services and data stores.** assay runs no service and keeps no
database, queue or bucket: its only data store is the run directory on disk
(laid out by `lib/run-layout.mjs`), plus the files a stewarded repository
commits (`packet/`). It reaches outside the checkout in three places, and only
these. **The package registry** (npm's, or the one a lockfile names):
`fresh-clone`'s install step runs the target's own package manager, and
`dependency-scan` runs `npm audit`, `pnpm audit` or `yarn audit` against it to
resolve advisories. **The instruments' binaries** on the runner's `PATH`:
`git`, `node`, the target's package manager, and `gitleaks` when present.
**GitHub Actions**, only for `routine/`: the template checks out the target
and assay itself, reading assay with an optional read token when assay's own
repository is private (`routine/README.md`). No adopted instrument calls a
repo-hosting platform's own API; that is what **offline** means everywhere in
assay (`map/scanners/CONTRACT.md` §3a): no hosting platform's API, while a
package registry may be reached. A peer scanner (`repo-eval`,
`deep-code-review`) runs in a coding-agent session the operator opens, outside
the engine. How to operate all of it is `RUNBOOK.md`.

## Quickstart

The tools are zero-dependency Node (20 or later); TypeScript is a development-only
dependency, for `npm run typecheck` (checkJs over the engine's modules) beside
`npm run lint` (Node's own syntax check) and `npm test`. Behind one command:

```sh
node assay.mjs help                                   # every command, grouped map / yardstick / views

# draw the map — one command makes the run, runs every offline instrument, and
# records every other adopted scanner skipped, with how to record it once it runs.
# fresh-clone executes the target's code, so it runs only under --allow-exec:
# pass it in a disposable container or VM
node assay.mjs start --out <run> <target> [--allow-exec]

#   repo-eval: open map/METHOD.md as the opening context of a coding-agent session
#   pointed at the target repository; it drives the passes
node assay.mjs ingest <run> --tool deep-code-review --raw dcr-report.yaml
#   ingesting a report also flips that scanner's row to ran in map/scanners.yaml
node assay.mjs record <run> repo-eval ran                          # or record one directly (no report to ingest)
node assay.mjs validate <run> [--target <target>]     # schema, ids, citations, run record; fails closed

# measure and write every view from the same map
node assay.mjs compile <run>

# what changed since a previous run, and holding the line on it
node assay.mjs compile <run> --since <prev-run>              # + SINCE.md
node assay.mjs ratchet <run> --baseline packet/baseline.yaml # fails when a met/mixed row regresses
```

Once a steward accepts a repository, `routine/` is a GitHub Actions template the
stewarded repository runs on its own schedule — it runs the offline instruments,
compiles the package, and ratchets against a committed baseline; `routine/README.md`
is the contract.

## Measured, not asserted

The engine is graded against **known-answer fixtures**: small targets whose every
planted defect and strength is documented, in
[assay-fixtures](https://github.com/andyschwab/assay-fixtures).
`node assay.mjs score` grades a run against a target's `ANSWERS.yaml`, and
`npm test` pins those scores with the rest of the regression harness, so a change
that misfiles a finding turns the suite red.

Repeatability is two numbers. **Fact presence** asks whether every run recorded a
fact about the same thing; **descriptor agreement** asks whether the runs judged
it the same way (reversibility, gate type and the other finding descriptors the
views compute from). `node assay.mjs variance <run> <run> …` reports both, with a
direction for each divergence: all one way is consistent with the target having
changed; both ways at once is judgment drift.

## Layout

```
assay.mjs        the command line
map/             drawing the map: the finding format, the built-in method, scanners, instruments, validation
yardstick/       the requirements, the measurement of one map against them, and comparing two (since/ratchet)
views/           Intake, Maintain, Improve, Owner and Since, and the one compile that writes them
owner/           what a repository's owner supplies that no scan can
routine/         the routine a stewarded repository runs on its own schedule (GitHub Actions template + driver)
lib/             shared helpers
tests/           the regression harness and the public scored fixtures
RUNBOOK.md       releasing, re-blessing, restarting a routine, rolling back, the read token, restoring a baseline
HISTORY.md       how the engine got here
```

assay carries no client data, no run history and no confidential fixtures: only
the method, the tools, and the public known-answer targets that measure it.
