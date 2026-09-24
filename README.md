# assay

**Evidence-based repository evaluation.** assay reads a codebase into a **map**
of what exists and what is true of it, measures the map against a **yardstick**
of requirements, and writes three **views** of the result:

| View | The question | Page | Data |
|---|---|---|---|
| **Intake** | Can this repository be taken on, and what must be true first? | `INTAKE.md` | `views/intake.yaml` |
| **Maintain** | Is it still healthy, and what do routines watch? | `MAINTAIN.md` | `views/maintain.yaml` |
| **Improve** | What makes it better next? | `IMPROVE.md`, the axis walk, `handoff/` | `views/improve.yaml` |

Every view is computed from the same map in one pass, so the three never
disagree about the repository. Each writes a data file with a schema and a plain
page; anything fancier (a branded report, a deck) is a template over the data
file and lives with whoever publishes it.

**The one rule that makes it honest: the map states what is; the views compute
how good, how bad, how urgent.** A finding may record "this effect is
irreversible and has no gate"; it may not record "critical". assay issues no
verdict and prices nothing. It shows what is met, what is open with the check
that would prove it closed, and what nobody measured.

## The three layers

```
repository ─ scanners and instruments ─▶ map/ ─▶ yardstick/ ─▶ views/
                                          │          │            ├ Intake
   facts with file:line, counted          │          │            ├ Maintain
   populations, attack paths, and a  ─────┘          │            └ Improve
   record of what was not looked at                  │
                  requirements, each decided from the map:
                  met · unmet · mixed · not measured
```

**The map** (`map/`). Scanners of two kinds draw it. **Peer scanners** bring
judgment and their own taxonomy: `repo-eval`, the built-in method
(`map/METHOD.md`), and `deep-code-review`, an external code reviewer. Each has an
adapter and keeps its native report as an appendix. **Instruments** are
deterministic and run offline against the checkout: `gitleaks`; `fresh-clone`,
which installs, builds, lints, typechecks, tests and migrates from a clean
checkout and replays the README's commands, once per workspace in a monorepo;
`dependency-scan`, `npm audit` over every lockfile; and `repo-census`, which
checks for an architecture page, a present-tense agent contract, a runbook, a
CI gate on the default branch, and the owner's evidence transcripts. Every run
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
a fix prompt per gap. `views/README.md` gives each data file's schema.

**What the owner supplies** (`owner/`). Some requirements are about things a
repository cannot show by itself: a restore was run, a rollback was exercised,
an account can be transferred. `owner/evidence/` is the format for committed
transcripts that decide six of them; `owner/custody.md` is the questions that
decide custody; `owner/PACKET.md` is the format for a repository's own
**packet** — its answers to those and to any claim-kind requirement, validated
(`node assay.mjs validate-packet`) and folded into the measurement
(`node assay.mjs measure <run> --packet <dir>`), never merged with what the run
itself decided. `node assay.mjs ask-owner --run <run>` prints the owner prompt
pre-filled with what that run already shows.

## Quickstart

The tools are zero-dependency Node (20 or later), behind one command:

```sh
node assay.mjs help                                   # every command, grouped map / yardstick / views

# draw the map
#   repo-eval: open map/METHOD.md as the opening context of a coding-agent session
#   pointed at the target repository; it drives the passes
node assay.mjs fresh-clone <target> --out <raw.json>  # an instrument, offline
node assay.mjs ingest <run> --tool gitleaks --raw gitleaks.json --exit 1
node assay.mjs ingest <run> --tool deep-code-review --raw dcr-report.yaml
node assay.mjs validate <run> [--target <target>]     # schema, ids, citations, run record; fails closed

# measure and write every view from the same map
node assay.mjs compile <run>
```

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
yardstick/       the requirements and the measurement of one map against them
views/           Intake, Maintain and Improve, and the one compile that writes them
owner/           what a repository's owner supplies that no scan can
lib/             shared helpers
tests/           the regression harness and the public scored fixtures
HISTORY.md       how the engine got here
```

assay carries no client data, no run history and no confidential fixtures: only
the method, the tools, and the public known-answer targets that measure it.
