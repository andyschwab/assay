---
type: doc
title: "tests/sweeps — committed sweep sets and the repeatability gate"
---
# tests/sweeps/

A **sweep set** is N runs of the same judgment passes over one frozen target, kept so
a repeatability figure is a number the tree reproduces instead of prose. `npm test`
measures every set here with `node assay.mjs variance --set <set>` and fails when
any measure falls below the set's own threshold.

```
tests/sweeps/<set>/
  SWEEP.yaml               what was swept, under which method, and the threshold
  sweep-1/map/…            one run dir per sweep: map/scanners.yaml + map/findings/
  sweep-2/map/…
  …
```

`SWEEP.yaml` (`map/variance.mjs` `loadSweepSet` refuses a set that breaks any of this, exit 2):

```yaml
target: "<public target, and where it lives>"
target_commit: "<the commit every sweep read>"
method_commit: "<the assay commit whose METHOD.md and SCHEMA.md the sweeps ran under>"
date: "YYYY-MM-DD"
blind: true | false        # true only for fresh contexts that never saw an answer sheet
threshold:                       # each measure the set takes, gated above 0
  fact_presence: <1–100>         # % of union facts every sweep caught (measure 1)
  candidate_agreement: <1–100>   # % of listed candidates every sweep maps whose six descriptors are identical (measure 2, primary)
  descriptor_agreement: <1–100>  # % of shared effect channels with all six descriptors identical (measure 2, per channel; one release)
  requirement_agreement: <1–100> # % of requirements any sweep decides whose status is identical in every sweep (measure 3)
not_measured:                    # each measure the set cannot take, with the reason; omitted when it takes all four
  <measure>: "<why the set cannot take it>"
sweeps: [sweep-1, sweep-2, …]    # at least two directory names inside the set
```

**A gate checks something or says it does not** (#323). Each of the four measures is either
under `threshold`, above 0, or under `not_measured` with the reason, never both and never
neither. A threshold of 0 is refused: it passes whatever the set measures, so it would read as a
gate and check nothing. A measure declared not measured is printed as not measured and gates
nothing, unless the set does take it after all (a candidate every sweep maps, a shared channel, a
decided requirement): then the declaration is false, and the set is a breach (exit 1) until it
states that measure's threshold.

**Which figure gates descriptors** (#312). Both keys gate, each its own figure. `candidate_agreement`
is the primary one: a listed candidate (a member of the run's `map/raw/enumerate.json` effect
population that its `map/effect-triage.yaml` maps to an effect finding) takes that finding's six
descriptors, and every candidate all sweeps map is compared field by field, however each lane
grouped candidates into findings. A candidate one sweep maps and another triages out of scope or
leaves untriaged is a scope disagreement, and an effect finding no candidate maps to is counted by
its slug; both are reported apart and never enter the figure. Where every sweep's triage answers a
candidate's checklist (#315), its `gate_type` and `reversibility` are the values its answers give,
and agreement per answer is reported beside the figure; a set whose triages carry no answers reads
as before. A set whose sweeps carry no candidate
list compares no candidate, so it declares `candidate_agreement` under `not_measured`, and a threshold
over it would be a breach. `descriptor_agreement` keeps its meaning, the per-channel figure (a channel is
the sorted set of candidates one finding covers, else the finding's slug, #298), and gates beside it
for one release so the committed sets stay comparable; in the release after that, the key, the
per-channel figure and its `descriptors` output are retired together, and `candidate_agreement`
alone gates descriptors.

Each sweep is an ordinary run: it validates (`node assay.mjs validate`), and its run
record names the model of record per pass (`map/SCHEMA.md` §5a), which variance reads
for its per-model-pair agreement. Only the judgment scanner is swept; every other
scanner row is `skipped` with the reason.

**Re-measure before re-run** (#324). A set is pinned to `method_commit`. What variance computes
from the stored runs is the measure; what a pass records is the method. A change that moves only
the measure re-measures the stored runs under the current engine, with no session (#312 did this
for every set here). A set is re-run, and re-committed as a reviewed change, only when the text a
pass records under moved since its `method_commit`. That text, and nothing else, is:

- `map/METHOD.md`'s pass sections: "Ground rules", "Pass 0", the "Passes 1–7" introduction, and
  each "Pass <n>" (each from its heading to the next heading of its level or above);
- the `map/SCHEMA.md` sections `map/passes.yaml` names (each pass's `schema:`), by number;
- `map/passes.yaml`, read as data: each pass's entry, so a comment that moves changes no pass.

`node assay.mjs variance --set <set> --check-method` applies the rule (`map/sweep-method.mjs`):
it prints `re-measure` when none of that moved, or `re-run` naming each piece that moved and the
passes it is theirs (the ground rules, Pass 0 and the introduction are every pass's; a pass's own
section and map entry are that pass's; a SCHEMA.md section is the passes whose `schema:` names it).
A `method_commit` the clone does not hold exits 2: fetch it, never guess. The rule is the same for
a committed set and an operator's own: run the check before scheduling a sweep. A threshold change
is a reviewed change to `SWEEP.yaml`, never a silent drift.

**Cost.** `variance` prints each sweep's cost as its run record has it: the `spend:` and
`duration:` of the scanner that ran (`map/SCHEMA.md` §5a, `node assay.mjs record … --spend
--duration`), copied as written (`cost` in `--json`). A sweep whose record carries neither reads
`not recorded`; nothing is estimated. The run record is the one home of a session's cost, so
`SWEEP.yaml` carries no copy of it.

**The sets here.** One set per target, the newest, plus two older sets the mapping set reads.
A set a later set of the same target supersedes is removed in the change that commits the later
one; git keeps it (#323).

- `assay-2026-11-12c/`: **blind**, over this repository at `2b247c0`, method at `9da5005`:
  three fresh-context `practice-review` lanes, each a child session that never saw an answer
  sheet, the other sweeps, or this directory, every pass recorded with its model. Measured: 11
  of 84 union facts caught by all three (fact presence 13%); 4 of 10 listed candidates every
  sweep maps identical on all six descriptors (40%, per channel the same); 13 of 14 decided
  requirements identical (92%). This is the figure `map/METHOD.md` and `map/SCHEMA.md` cite for
  the method's repeatability; the field figures they also quote were taken off-repo before this
  gate existed and are history. A new blind set is `assay-<date>/`, run the same way (at least
  three fresh contexts over one pinned commit, `blind: true`, threshold at or below what it
  measured) when `METHOD.md` or `SCHEMA.md` moves.
- `flawed-webapp-2026-11-12b/`: **blind**, over the public flawed-webapp fixture target,
  method at `7f8b209`. A 12-file target saturates fact presence and recall, so requirement
  agreement is the measure that carries information here.
- `fixture-notesbox/`: fixture-sized and **not blind**: three copies of the notesbox
  fixture's practice-review passes with one finding dropped and one descriptor re-judged.
  It proves the gate reads the number and can go red; it says nothing about the
  method's repeatability.
- `assay-2026-11-11/` and `flawed-webapp-2026-11-11/`: **blind**, the method at `4b81665`, kept
  because `tests/mapping/MAPPING.yaml` cites 49 of their findings by id: each entry is a judged
  answer to which requirement one real finding belongs to, with its reason, and the newer sets
  carry different findings under different ids, so moving the mapping set onto them would be
  re-judging it, not re-pointing it. Their sweeps carry no candidate list, so each declares
  `candidate_agreement` not measured.
