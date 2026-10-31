---
type: doc
title: "The static-analysis instrument's positive control"
---
# The static-analysis instrument's positive control

Two planted flows the vendored taint rules (`../taint/`) must report, one per rule file: a
query parameter reaching a shell in `routes/run.js:4`, and a request argument reaching a
shell in `app/run.py:6`. `assay start` and the routine run the instrument over this
directory, with the vendored rules, before they run it over the target (`run.control` in
`../../opengrep.yaml`, `map/scanners/CONTRACT.md` §3a, #223, #232). When a hit is missing,
the run records the instrument failed and the target is not run, so zero results on a target
always come with a control that fired.

The files are inert: nothing imports or runs them.
