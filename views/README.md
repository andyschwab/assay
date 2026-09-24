---
type: doc
title: "views/ — Intake, Maintain and Improve: what each writes"
---
# views/

Three views of one run, written by one command from the same measurement:

```sh
node assay.mjs compile <run>
```

`compile` validates the map, measures it against the yardstick
(`yardstick.yaml`), then writes every view and `INDEX.md`. A view decides no
requirement on its own: it reads the measurement, joins each requirement's
title, tier, topic and check from `yardstick/requirements.yaml`, and reads the
run record for what was not seen. No view prices work or issues a verdict.

Every list is in tier order (custody, safety, reproducibility, verification,
legibility, operability), then in `requirements.yaml` order. Each data file is
the contract a publisher builds on; each page is its plain rendering.

## Intake: can it be carried?

`views/intake.mjs` → `views/intake.yaml` and `INTAKE.md`. The requirements tagged
`floor`: the bar for taking a repository on.

```yaml
view: intake
run: <run name>
yardstick: <requirements.yaml version>
counts: { requirements: N, open: N, met: N, to_run: N }
open:              # status unmet or mixed
  - { id, tier, topic, title, status, met, of, findings: [F-…], note, check }
met:
  - { id, tier, topic, title, note }
to_run:            # status not-measured
  - { id, tier, topic, title, check, decided_by, note }
not_seen:          # every run-record row that did not run
  - { scanner, status, reason }
```

`met` and `of` appear when the requirement is decided over a counted population.
`decided_by` names what would decide a row still to run: a scanner, `census`, or
`owner` for a claim only the owner can make (`owner/custody.md`,
`owner/evidence/`).

## Maintain: is it still healthy?

`views/maintain.mjs` → `views/maintain.yaml` and `MAINTAIN.md`. The requirements
tagged `fleet`: what a steward's routines read to keep a repository healthy
without a person looking. Same shape as Intake, with `view: maintain` and
`floor: true | false` on every row (whether Intake also reads it).

## Improve: what makes it better?

The lead page is `IMPROVE.md`, the maintainer report (`views/improve/report.mjs`
over `views/improve/templates/`). It needs the run's authored
`views/improve/prose.yaml`; without it, a run still gets the rest.

| File | What it is |
|---|---|
| `views/improve.yaml` | every requirement grouped by topic, each exactly once: `topics: [{ topic, met, unmet, mixed, not_measured, rows: [{ id, title, status }] }]` |
| `views/improve/axes.md` | the axis walk: per axis, what to preserve, the risks ranked, and the requirements on that topic; custody, reproducibility and operability as their own sections; the axes no scanner measured this run |
| `views/improve/maturity-grades.yaml` | maturity coverage per dimension, computed (`node assay.mjs maturity`) |
| `views/improve/maturity.md`, `views/improve/security.md`, `views/improve/security-gate.yaml`, `views/improve/leverage.md` | the maturity reading, the exposures and attack paths, and where one change moves the most, written by the built-in method's view passes (`map/METHOD.md`) and checked by `validate` |
| `handoff/` | one fix prompt per gap, for a coding session to act on, each with its evidence and a proof step |

## The index

`INDEX.md` leads with the three pages, one line each with its counts, then lists
the data files and any scanner's native report kept as an appendix.
