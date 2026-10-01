---
type: doc
title: "tests/sweeps — committed sweep sets and the repeatability gate"
---
# tests/sweeps/

A **sweep set** is N runs of the same judgment passes over one frozen target, kept so
a repeatability figure is a number the tree reproduces instead of prose. `npm test`
measures every set here with `node assay.mjs variance --set <set>` and fails when
either measure falls below the set's own threshold.

```
tests/sweeps/<set>/
  SWEEP.yaml               what was swept, under which method, and the threshold
  sweep-1/map/…            one run dir per sweep: map/scanners.yaml + map/findings/
  sweep-2/map/…
  …
```

`SWEEP.yaml` (every field required; `map/variance.mjs` `loadSweepSet` refuses a set
missing one, exit 2):

```yaml
target: "<public target, and where it lives>"
target_commit: "<the commit every sweep read>"
method_commit: "<the assay commit whose METHOD.md and SCHEMA.md the sweeps ran under>"
date: "YYYY-MM-DD"
blind: true | false        # true only for fresh contexts that never saw an answer sheet
threshold:
  fact_presence: <0–100>         # % of union facts every sweep caught (measure 1)
  descriptor_agreement: <0–100>  # % of shared effect channels with all six descriptors identical (measure 2)
sweeps: [sweep-1, sweep-2, …]    # at least two directory names inside the set
```

Each sweep is an ordinary run: it validates (`node assay.mjs validate`), and its run
record names the model of record per pass (`map/SCHEMA.md` §5a), which variance reads
for its per-model-pair agreement. Only the judgment scanner is swept; every other
scanner row is `skipped` with the reason.

**When to re-run.** A set is pinned to `method_commit`. Re-run it, and re-commit it
as a reviewed change, when `map/METHOD.md` or `map/SCHEMA.md` moves in a way that
changes what a pass records; between those moves the committed set stands. A
threshold change is a reviewed change to `SWEEP.yaml`, never a silent drift.

**The sets here.**

- `fixture-notesbox/`: fixture-sized and **not blind**: three copies of the notesbox
  fixture's repo-eval passes with one finding dropped and one descriptor re-judged.
  It proves the gate reads the number and can go red; it says nothing about the
  method's repeatability.
- `assay-2026-10-01/`: **blind**, over this repository at `c30912c` (method at the same
  commit): three fresh-context `repo-eval` runs, each a child session that never saw an
  answer sheet, the other sweeps, or this directory, all recorded with their model
  (`claude-opus-5-5` on every pass). Measured: 24 union facts, 9 caught by all three
  (fact presence 38%); 17 effect channels, 5 shared by two or more sweeps, 1 identical
  on all six descriptors (descriptor agreement 20%), with divergences in both directions.
  The threshold is set at the measurement. This is the figure `map/METHOD.md` and
  `map/SCHEMA.md` cite for the method's repeatability; the field figures they also
  quote were taken off-repo before this gate existed and are history. A new blind set
  is `assay-<date>/`, run the same way (at least three fresh contexts over one pinned
  commit, `blind: true`, threshold at or below what it measured) when `METHOD.md` or
  `SCHEMA.md` moves.
