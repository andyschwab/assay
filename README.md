# assay

**Evidence-based repository evaluation.** assay reads a codebase and produces a
neutral base of findings — facts with structured descriptors and `file:line`
evidence — then projects that base through per-scanner adapters onto a flat,
property-named **axis roster**, and compiles it into three readers:

- a **maintainer report** (the human lead: authored narrative over computed
  structure, area by area, with the attack chains computed and ranked, never
  asserted),
- a **per-axis walk** (the detail: properties, severity-ranked risks, seams),
- an **agent-ready remediation handoff** (paste one file into a coding session to
  close a gap, with every claim auditable before you act).

The one rule that makes it honest: **the base states _what is_; the views compute
_how good / how bad / how urgent_.** A finding may record "this effect is
irreversible and has no gate"; it may not record "critical." Severity and
priority are computed from the descriptors, and the engine issues **no
deploy/no-deploy verdict** — it presents properties and risks and leaves the
go/no-go to the reader.

## The axis model

Findings land on a flat roster of **property-named axes** — never tool-named.
Every scanner, the built-in method included, contributes the axes its own method
measures, and any scanner may *feed* an axis it does not contribute, so two
scanners measuring one property corroborate on one axis instead of in two
chapters. An axis no present scanner measures reads **"not measured"**, never
"clean". Two kinds of thing plug in:

- **Peer scanners** — judgment-bearing evaluators with their own taxonomy
  (`repo-eval`, the built-in seven-dimension method; `deep-code-review`, an
  external code reviewer). Each carries an adapter and keeps its native report as
  an appendix.
- **Instruments** — deterministic tools (`gitleaks`, OpenSSF `scorecard`) that
  feed existing axes and never add one. Ten instruments add zero chapters. Their
  intake **fails loud, never empty**: a tool that errored can never read as "0
  findings", and a secrets scanner's matched values are never copied out of its
  report.

The contract for both is `integration/scanner-contract.md`; the candidate roster
of further scanners is `integration/scanner-candidates.md`.

## Quickstart

The built-in scanner (`repo-eval`) is an LLM method: open `METHOD.md` as the
opening context of a coding-agent session pointed at the target repository, and it
drives the passes. The supporting tools are zero-dependency Node (≥ 20):

```sh
# validate a findings base (schema, ids, links, citations — fails closed)
node tools/validate.mjs <run-dir> [--target <target-repo>]

# project + compile the package (report + walk + handoff + index)
node tools/compile-package.mjs <run-dir>

# ingest a deterministic instrument (fails loud on a bad exit code)
node tools/ingest.mjs <run-dir> --tool gitleaks --raw gitleaks.json --exit 1

# grade a run against a known-answer fixture sheet
node tools/score.mjs <run-dir> --answers <target>/ANSWERS.yaml

# measure repeatability across two or more runs of one target (two numbers:
# fact presence, and agreement on the descriptors the verdict is computed from)
node tools/variance.mjs <run-dir> <run-dir> [<run-dir> ...]
```

Rendering the report to PDF (`tools/render-pdf.mjs`) additionally needs
`markdown-it` and a headless Chromium; the base tools stay dependency-free so they
copy cleanly into any target repo.

## Repeatability is two numbers, not one

Repeatability is measured at both layers, because they drift independently.
**Fact presence** asks whether every run recorded a fact about the same thing.
**Descriptor agreement** asks whether the runs then *judged* it the same way — and
that is the layer the product's output rides on, since maturity coverage, the halt
flags, the attack-chain ranking and the deployment gate are all computed from the
effect facet. A pair of runs can agree on what exists and disagree on what it means,
and only the second number sees it. `tools/variance.mjs` reports both, and gives each
divergence a direction: all-one-way is consistent with the target having changed,
**both-ways at once is judgment drift** — and a cross-run coverage delta computed over
those descriptors is not a trend.

## Measured, not asserted

The engine's coverage is measured against **known-answer fixtures** — small
targets whose every planted defect and strength is documented — in a companion
repo, [assay-fixtures](https://github.com/andyschwab/assay-fixtures). `tools/score.mjs`
grades a run against a target's `ANSWERS.yaml` (recall of planted items, and a
control target's false-positive count), and `tests/regression.mjs` pins those
scores so a projection change that misfiles a finding drops recall and turns the
suite red. Run it:

```sh
npm test
```

## Layout

```
METHOD.md                  the built-in scanner method (the LLM passes)
SCHEMA.md                  the finding format contract (validator-enforced)
integration/               the scanner contract, adapters, and candidate roster
tools/                     zero-dep engine tools + the PDF renderer
templates/                 report partials, styles, vendored fonts
canon/                     per-target enumeration contracts (ships empty)
tests/                     the regression harness + public scored fixtures
HISTORY.md                 append-only dated log of how the engine got here
```

## Provenance

assay is the extracted, self-contained engine of a broader knowledge framework;
this repository is the public evaluation engine on its own. It carries no
client data, no run history, and no confidential fixtures — only the method, the
tools, and the public known-answer targets used to measure it.
