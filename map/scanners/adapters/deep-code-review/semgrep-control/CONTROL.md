---
type: doc
title: "The before-review analyzer's positive control"
---
# The before-review analyzer's positive control

Two planted flows the vendored taint rules (`../semgrep-taint/`) must report, one per rule
file: a query parameter reaching a shell in `routes/run.js:4`, and a request argument
reaching a shell in `app/run.py:6`. `assay start` and the routine run the analyzer over this
directory, with the vendored rules, before they run it over the target
(`before_review.control` in `../../deep-code-review.yaml`, `map/scanners/CONTRACT.md` §3g,
#223). When a hit is missing, the run records the analyzer failed, so zero results on a
target always come with a control that fired.

The files are inert: nothing imports or runs them.
