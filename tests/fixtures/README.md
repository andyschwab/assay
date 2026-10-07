---
type: doc
title: "Public fixture runs — scored against known answers"
---
# Public fixture runs

Self-contained evaluation runs over the public [assay-fixtures](https://github.com/andyschwab/assay-fixtures)
targets, kept here so the regression harness can pin the engine's **recall** without
reaching outside the repo — self-contained immutable copies, kept separate from any confidential run data.

- `notesbox/` — a run over the `flawed-webapp` target (repo-eval delegation-focused
  passes, a live gitleaks instrument row, and the fresh-clone and dependency-scan
  instruments' own output over the target). Scored against `notesbox/ANSWERS.yaml`,
  a frozen snapshot of the target's answer sheet.
- `cleanlib/` — a run over the `clean-lib` control target (the same methods).
  Scored against `cleanlib/ANSWERS.yaml`; the assertion is 0 false positives, with
  the instruments' known absences answered on the sheet rather than counted.
- `lockfiles/` — dependency-scan's run over the `lockfiles` target (#17): one
  lockfile pinning a package with a known critical advisory, one truncated so npm
  refuses it offline (ENOLOCK). Scored against `lockfiles/ANSWERS.yaml` by the
  `dependency-scan-fixture` block, not pinned in `tests/golden.json`. Until the
  fixtures repository carries the target, its files wait in
  `pending-assay-fixtures/` (that README says how they are applied).
- `fixtures-root/` — repo-census over the fixture repository's root, scored against
  the repo-root sheet (`fixtures-root/ANSWERS.yaml`). Repo-scoped instruments are
  answered only there, so the per-target runs record repo-census skipped.

The instrument rows are the instruments' real output over the public fixtures
(`map/raw/` keeps each report), regenerated with `node assay.mjs <instrument>`
and `node assay.mjs ingest`, never hand-written.

`ANSWERS.yaml` here is a **frozen copy**; the source of truth is the answer sheet in
the assay-fixtures repo. `tests/regression.mjs` re-derives the score every run and
fails on drift. These runs are NOT blind (the same agent authored the answers and the
findings), so they prove the harness + pipeline + recall floor, not blind
determinism — that is a separate measurement: a blind sweep set under
`tests/sweeps/` (its README says what one holds and what the gate checks).
