# Scanner intake — the procedure a candidate goes through

A scanner earns its place in assay by what it measures that nothing else does, by
the facts it corroborates on a shared axis, by failing loud, and by what it costs
(`CLAUDE.md` rule 5). This page is the procedure a candidate goes through to be
adopted, and the criteria for adopting and retiring one. The adapter format is
`CONTRACT.md` §3, the instrument role §3a, the run record `../SCHEMA.md` §5a;
`CANDIDATES.md` lists the tools under consideration. Nothing here prices work or
ranks scanners: the roster states what each one decides and finds, and the decision
is a person's.

## The procedure

1. **An adapter, and nothing in the core.** One file,
   `map/scanners/adapters/<id>.yaml`, carrying `adopted: false` while it is a
   candidate (a candidate is an adapter with `adopted: false` and no `retired:`).
   What the core needs to know is a field of it (`CLAUDE.md` rule 7): `role:`
   (`judgment` or `instrument`), `ingest:` (for a reviewer, `format: machine-report`,
   the `tool` value its report carries and the `start_id` its rows are numbered
   from; an instrument has a conversion profile in `map/ingest.mjs`), `method:`
   (the class a known-answer sheet's `detectable_by` names), and a `map:` of every
   native category to a shared, property-named axis with `default: FAIL`. Map onto
   an existing axis wherever the property is the same: that is where corroboration
   becomes visible.
2. **Fail-loud assertions.** A harness block (`tests/blocks/<name>.mjs`) that
   proves its intake halts: a tool error, a missing exit code, a malformed or
   truncated report, an unknown category, a report older than `min_version`. The
   adapter names that block as `fails_loud:`. A tool that errors into "0 findings"
   lowers coverage while reading as clean, so a scanner with no such block is not
   adoptable.
3. **A run over every fixture target.** Each target under `tests/fixtures/` with
   an answer sheet (`ANSWERS.yaml`) gets a run carrying the candidate's rows,
   ingested with `node assay.mjs ingest`, never hand-written, and validated with
   `node assay.mjs validate`. Record the run on its row in `map/scanners.yaml`:
   `duration:` (how long it ran, with the unit, or a whole number of seconds; any
   scanner) and, for a judgment scanner, `model:` and `spend:`, with
   `node assay.mjs record <run> <id> ran --duration "<text>" [--spend "<text>"]`.
   Where no target holds what the candidate measures, grow a fixture for it, as
   the `lockfiles` target was grown for one instrument (`tests/fixtures/README.md`).
4. **Answers on the sheets.** What the candidate should find goes on the sheets:
   an `instruments:` entry for a repository-level check, `detectable_by` naming its
   `method:` on a planted item it should recover, and a `requirements:` entry for
   each requirement it would decide (`yardstick/README.md`, "Known answers"). A
   requirement it decides is an instrument row in `yardstick/requirements.yaml`
   whose `decide.scanner` names it.
5. **The roster report.** `node assay.mjs roster <run>...` over those runs prints
   `roster.yaml`, one row per adapter:

   ```yaml
   - scanner: <id>
     role: judgment | instrument
     status: adopted | candidate | retired
     decides_alone: [d-…]            # requirements whose decide.scanner is this one
     not_measured_if_retired: [d-…]  # what would leave the measured scale without it
     feeds: [<axis>…]                # every axis its adapter maps to or contributes
     fails_loud: <block>             # the adapter's fails_loud:
     ran_in: [<run>…]                # the runs whose record says it ran
     unique_recoveries: [<run>/<answer id>…]   # recovered with its rows, missed without
     corroborated: N                 # facts it shares with another scanner
     cost:
       duration: ["<run>: <value>"…]
       spend: ["<run>: <value>"…]
   ```

   With no run given, or for a scanner that ran in none of the runs, the run
   fields read not measured, never zero; a run with no run record halts. `unique_recoveries` is the run's
   known answers that `map/score.mjs` reads recovered with every row and not
   recovered with this scanner's rows taken out. `corroborated` counts the facts
   `yardstick/compare.mjs`'s scanner-free fingerprint finds recorded by this scanner
   and at least one other. The harness pins the adopted roster's counts over the
   committed fixture runs (`roster` in `tests/golden.json`); a change that moves one
   is a reviewed re-bless.

## Adoption

A candidate is adopted (its `adopted: false` removed) when the roster shows all of:

- **It measures something.** It decides a requirement nothing else does
  (`decides_alone`), recovers an answer nothing else does (`unique_recoveries`), or
  corroborates facts another scanner records on a shared axis (`corroborated`).
  A scanner whose every row is already recorded by another adds a reading, not a
  measurement: say which it is.
- **It fails loud.** `fails_loud` names a block whose halts were confirmed red.
- **An instrument runs offline** against the checkout under review (`CONTRACT.md`
  §3a): one that needs a repository-hosting platform's API cannot be adopted,
  since every run would have to dispose of it.
- **Its cost is on the record.** `duration:` on every run, `spend:` for a judgment
  scanner, so the roster states what it costs beside what it finds.

Adoption is one change that removes `adopted: false`, adds the fixture runs and
their answers, re-blesses the roster pin and adds a `HISTORY.md` entry.

## Retirement

Retiring a scanner is a recorded decision, never a deletion (`CONTRACT.md` §4a):
its adapter keeps `adopted: false` with a `retired:` note stating why, so frozen
runs that carry its rows still project. Before retiring one, read its
`not_measured_if_retired`: every requirement listed there reads not measured on
every later run until another scanner is bound to decide it, and its
`unique_recoveries` are the known answers no later run will recover. Name both in
the change that retires it.

The procedure's second provenance is an invented reviewer taken through it end to
end by the `instrument-roster` block (`tests/instruments/` holds its adapter and its
report over the `notesbox` target): it decides nothing alone and recovers nothing
alone, and both of its findings corroborate a fact another scanner recorded.
