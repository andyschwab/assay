---
type: doc
title: "views/ — Intake, Maintain and Improve: what each writes"
---
# views/

Three views of one run, written by one command from the same measurement, plus a
fourth — Since — of two runs, when there is a previous one to compare against:

```sh
node assay.mjs compile <run>                     # Intake, Maintain, Improve
node assay.mjs compile <run> --since <prev-run>  # + Since
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
  - { id, tier, topic, title, status, basis, met, of, findings: [F-…], note, check }
met:
  - { id, tier, topic, title, basis, note }
to_run:            # status not-measured
  - { id, tier, topic, title, check, decided_by, basis, note }
not_seen:          # every run-record row that did not run
  - { scanner, status, reason }
contradictions:    # a packet claim of satisfied against a run-decided unmet row (Intake only)
  - { id, claim, run_status, findings: [F-…] }
```

`met` and `of` appear when the requirement is decided over a counted population.
`decided_by` names what would decide a row still to run: a scanner, `census`, or
`owner` for a claim only the owner can make (`owner/ask-owner.md`,
`owner/PACKET.md`). `basis` (`run | owner`) is who decided the row THIS run —
`owner` only where a repository's own packet decided it (`yardstick/measure.mjs
--packet`, `owner/PACKET.md`); the page renders it as "met, by the owner's word".
`contradictions` is the run's own recorded list (never recomputed by a view) — a
packet's `satisfied` claim the run itself found unmet, the claim and the run's
status and findings kept side by side, never merged. `INTAKE.md`'s "Contradicted
claims" section renders it.

## Maintain: is it still healthy?

`views/maintain.mjs` → `views/maintain.yaml` and `MAINTAIN.md`. The requirements
tagged `fleet`: what a steward's routines read to keep a repository healthy
without a person looking. Same shape as Intake, including `basis` (shown the
same way on the page) and `contradictions` (the run's own recorded list, same
shape and rendering as Intake's — a claim a steward's routines must not lose
sight of between intake and the next human look), with `view: maintain` and
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

## Since: what changed?

`views/since.mjs` → `views/since.yaml` and `SINCE.md`, written by
`node assay.mjs since <run> --previous <prev-run>` or `node assay.mjs compile
<run> --since <prev-run>` — compile with no `--since` writes neither file, and
`INDEX.md` links `SINCE.md` only when it exists. The pure comparison it reads is
`yardstick/compare.mjs` (`yardstick/README.md`'s "Comparing two measurements"
section is its one home); this view only joins title/tier/topic from the
register and renders.

```yaml
view: since
run: <run name>
previous: <previous run name>
yardstick: <this run's requirements.yaml version>
previous_yardstick: <the previous run's version>
yardstick_version_changed: true | false
counts: { regressed: N, improved: N, newly_measured: N, no_longer_measured: N, yardstick_only: N, findings_new: N, findings_no_longer_found: N }
regressed:            # met/mixed -> worse, or dropped to not-measured
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis, findings: [F-…]}, note }
improved:              # rank went up (unmet -> mixed -> met)
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
newly_measured:        # not-measured -> decided
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
no_longer_measured:    # decided -> not-measured (NEVER "unchanged", NEVER "improved")
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
yardstick_only:        # the id exists on only one side — the yardstick itself was edited
  - { id, side: previous | current, title, status, basis }
findings:
  new:                 # matched by fingerprint against the previous run's base; not matched there
    - { fingerprint, id, source, dimension, native_category, evidence: […], observation }
  no_longer_found:     # matched in the previous run; not matched in this one
    - { fingerprint, id, source, dimension, native_category, evidence: […], observation }
```

A finding is matched across the two runs by a **fingerprint**
(`yardstick/compare.mjs`'s `fingerprintFinding`), never by its `id` — an id
carries no meaning across independent runs (`map/SCHEMA.md` §3: "ids are
renumbered across independent runs anyway"). The fingerprint is `(scanner,
dimension-or-native_category, polarity, evidence file paths with the `:line`
suffix stripped)`: a check that passed and now gaps is a new finding; a fact moving to a different line in the same file still matches; a
fact moving to a different file, or recorded by a different scanner or category,
does not. A finding in `no_longer_found` reads **"no longer found"**, never
**"fixed"** — the absence is absence of re-detection this run, not proof the
underlying fact is gone; `SINCE.md` and every renderer say it that way.

`SINCE.md`'s headline line is **counts only** — no verdict, no severity the
views do not already compute (`CLAUDE.md` rule 1) — and its sections run most
useful first: regressed, improved, newly/no-longer measured, then the findings
delta last.

## The index

`INDEX.md` leads with the three pages, one line each with its counts, then lists
the data files and any scanner's native report kept as an appendix.
