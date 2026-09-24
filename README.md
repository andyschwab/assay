# assay

**Evidence-based repository evaluation.** assay draws a **map** of a repository
(a neutral base of findings — facts with structured descriptors and `file:line`
evidence, projected through per-scanner adapters onto a flat, property-named
**axis roster**), measures that map against a **yardstick** of requirements, and
writes three **views** of the result:

- **Intake** (can it be carried? — the floor-tagged requirements),
- **Maintain** (is it still healthy? — the fleet-tagged requirements),
- **Improve** (what makes it better? — the maintainer report: authored narrative
  over computed structure, the per-axis walk, and an agent-ready remediation
  handoff you can paste into a coding session, every claim auditable before you
  act).

The one rule that makes it honest: **the base states _what is_; the views compute
_how good / how bad / how urgent_.** A finding may record "this effect is
irreversible and has no gate"; it may not record "critical." Severity and
priority are computed from the base, and the engine issues **no deploy/no-deploy
verdict** — it presents properties and risks and leaves the go/no-go to the
reader. assay never prices anything.

## The axis model

Findings land on a flat roster of **property-named axes** — never tool-named.
Every scanner, the built-in method included, contributes the axes its own method
measures, and any scanner may *feed* an axis it does not contribute, so two
scanners measuring one property corroborate on one axis instead of in two
chapters. An axis no present scanner measures reads **"not measured"**, never
"clean" — and every run carries a **manifest** (`eval/scanners.yaml`) recording,
for each adopted scanner, whether it ran, was skipped (with the reason), or failed
(with the error). The validator refuses a run without it, and every rendered
artifact names a scanner that did not run with its reason: an integration that
can be omitted without a recorded decision would read as coverage. Two kinds of
thing plug in:

- **Peer scanners** — judgment-bearing evaluators with their own taxonomy
  (`repo-eval`, the built-in seven-dimension method; `deep-code-review`, an
  external code reviewer). Each carries an adapter and keeps its native report as
  an appendix.
- **Instruments** — deterministic tools (`gitleaks`; `fresh-clone`, the scripted
  clean-checkout run that installs, builds, lints, typechecks, tests, migrates
  and replays the README's command claims; `dependency-scan`, `npm audit` over
  every lockfile in the tree; OpenSSF `scorecard` is integrated but retired from
  the adopted roster because it needs GitHub API access at run time) that feed
  existing axes and never add one. Ten instruments add zero chapters.
  and replays the README's command claims; `repo-census`, which decides an
  architecture page, a present-tense agent contract, a runbook, and a CI gate on
  the default branch from the tree alone; OpenSSF `scorecard` is
  integrated but retired from the adopted roster because it needs GitHub API
  access at run time) that feed existing axes and never add one. Ten instruments
  add zero chapters. An adopted instrument runs offline against the checkout.
  Their intake **fails loud, never empty**: a tool that errored can never read as
  "0 findings", and a secrets scanner's matched values are never copied out of
  its report.

The contract for both is `map/scanners/CONTRACT.md`; the candidate roster
of further scanners is `map/scanners/CANDIDATES.md`.

## Quickstart

The built-in scanner (`repo-eval`) is an LLM method: open `METHOD.md` as the
opening context of a coding-agent session pointed at the target repository, and it
drives the passes. The supporting tools are zero-dependency Node (≥ 20):

```sh
# validate a findings base (schema, ids, links, citations, the run manifest — fails closed)
node assay.mjs validate <run-dir> [--target <target-repo>]

# draw the map, measure it against the yardstick, write Intake + Maintain + Improve
node assay.mjs compile <run-dir>

# ingest a deterministic instrument (fails loud on a bad exit code)
node assay.mjs ingest <run-dir> --tool gitleaks --raw gitleaks.json --exit 1

# ingest a peer scanner's machine report (fails loud on incomplete coverage)
node assay.mjs ingest <run-dir> --tool deep-code-review --raw findings-2026-09-15.yaml

# grade a run against a known-answer fixture sheet
node assay.mjs score <run-dir> --answers <target>/ANSWERS.yaml

# measure repeatability across two or more runs of one target (two numbers:
# fact presence, and agreement on the descriptors the verdict is computed from)
node assay.mjs variance <run-dir> <run-dir> [<run-dir> ...]
```

## The yardstick (v0)

Beside the axis roster, findings project onto **the yardstick**
(`yardstick/requirements.yaml`): one row per requirement a repository must meet to
be stood behind, stated stack-neutrally, each tagged with a tier (fix order),
a topic (the axis roster, plus `custody` and `operability` for the two tiers with
none of their own), and naming the mechanism that decides it (a schema facet, an
authored census, a scanner's rows, or a sidecar claim). `yardstick/measure.mjs
<run-dir>` reads a run and writes `eval/yardstick.yaml`: per requirement, met /
unmet / mixed / not-measured with the finding ids; a claim-only row always reads
not-measured from a run, because only a repository's own sidecar asserts it and
the two are compared, never merged. `yardstick/README.md` is the contract. Every
run carries the measurement: `views/compile.mjs` writes it after validating, then
writes the three views from it, and `map/validate.mjs` recomputes every status and
fails on drift, so a stale read cannot outlive its base. The axis views are
unchanged.

## Repeatability is two numbers, not one

Repeatability is measured at both layers, because they drift independently.
**Fact presence** asks whether every run recorded a fact about the same thing.
**Descriptor agreement** asks whether the runs then *judged* it the same way — and
that is the layer the product's output rides on, since maturity coverage, the halt
flags, the attack-chain ranking and the deployment gate are all computed from the
effect facet. A pair of runs can agree on what exists and disagree on what it means,
and only the second number sees it. `map/variance.mjs` reports both, and gives each
divergence a direction: all-one-way is consistent with the target having changed,
**both-ways at once is judgment drift** — and a cross-run coverage delta computed over
those descriptors is not a trend.

## Measured, not asserted

The engine's coverage is measured against **known-answer fixtures** — small
targets whose every planted defect and strength is documented — in a companion
repo, [assay-fixtures](https://github.com/andyschwab/assay-fixtures). `map/score.mjs`
grades a run against a target's `ANSWERS.yaml` (recall of planted items, and a
control target's false-positive count), and `tests/regression.mjs` pins those
scores so a projection change that misfiles a finding drops recall and turns the
suite red. Run it:

```sh
npm test
```

## Layout

```
assay.mjs                  the one CLI: node assay.mjs <command> [args]
lib/                        yaml-min.mjs, display.mjs — shared, zero-dep
map/                        drawing the map: SCHEMA.md, METHOD.md, the scanner
                             contract + adapters (map/scanners/), the canon
                             (map/canon/), and the zero-dep engine tools
yardstick/                  the requirements + the measurement of one map against them (v0)
views/                      the three views: intake.mjs, maintain.mjs, compile.mjs, improve/
owner/                      evidence/ — what a repository's owner supplies
tests/                      the regression harness + public scored fixtures
HISTORY.md                  append-only dated log of how the engine got here
```

## Provenance

assay is the extracted, self-contained engine of a broader knowledge framework;
this repository is the public evaluation engine on its own. It carries no
client data, no run history, and no confidential fixtures — only the method, the
tools, and the public known-answer targets used to measure it.
