---
type: doc
title: "Public fixture runs — scored against known answers"
---
# Public fixture runs

Self-contained evaluation runs over the public [assay-fixtures](https://github.com/andyschwab/assay-fixtures)
targets, kept here so the regression harness can pin the engine's **recall** without
reaching outside the repo — self-contained immutable copies, kept separate from any confidential run data.

- `notesbox/` — a run over the `flawed-webapp` target (repo-eval delegation-focused
  passes + a live gitleaks instrument row). Scored against `notesbox/ANSWERS.yaml`,
  a frozen snapshot of the target's answer sheet.
- `cleanlib/` — a run over the `clean-lib` control target. Scored against
  `cleanlib/ANSWERS.yaml`; the assertion is 0 false positives.

`ANSWERS.yaml` here is a **frozen copy**; the source of truth is the answer sheet in
the assay-fixtures repo. `tests/regression.mjs` re-derives the score every run and
fails on drift. These runs are NOT blind (the same agent authored the answers and the
findings), so they prove the harness + pipeline + recall floor, not blind
determinism — that is a separate, later measurement.
