---
type: doc
title: "views/ — Intake, Maintain, Improve and Owner: what each writes"
---
# views/

Four views of one run, written by one command from the same measurement, plus a
fifth — Since — of two runs, when there is a previous one to compare against:

```sh
node assay.mjs compile <run>                     # Intake, Maintain, Improve, Owner
node assay.mjs compile <run> --since <prev-run>  # + Since
```

`compile` validates the map, measures it against the yardstick
(`yardstick.yaml`), then writes every view and `INDEX.md`. A view decides no
requirement on its own: it reads the measurement, joins each requirement's
title, tier, topic and check (and, for Owner, its `owner.risk` / `owner.fix`)
from `yardstick/requirements.yaml`, and reads the run record for what was not
seen. No view prices work or issues a verdict.

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
counts: { requirements: N, open: N, met: N, to_run: N, not_applicable: N }
open:              # status unmet or mixed
  - { id, tier, topic, title, status, basis, met, of, findings: [F-…], note, check }
met:
  - { id, tier, topic, title, basis, note }
to_run:            # status not-measured
  - { id, tier, topic, title, check, decided_by, basis, note }
not_applicable:    # status not-applicable — decided from the map, NEVER counted as met
  - { id, tier, topic, title, basis, note }
not_seen:          # every run-record row that did not run
  - { scanner, status, reason }
contradictions:    # a packet claim of satisfied against a run-decided unmet row (Intake only)
  - { id, claim, run_status, findings: [F-…] }
owner:             # what the run's own packet says about itself, facts only (Intake only)
  answered: { date, by, via } | null
  accounts: { count, personal, organisational, transferable: { yes, no, unknown },
              rows: [{ what, provider, owner_role, personal_or_organisational, transferable }] }
  credentials: { count, lives: […], never_rotated, readers: […] }
  people: { build: […] | null, deploy: […] | null, restore: […] | null, restore_done }
  data: { personal, leaves_via: […] }
  money: { monthly: [{ provider, amount }], alerts }
  handover
  notes
```

`met` and `of` appear when the requirement is decided over a counted population.
`decided_by` names what would decide a row still to run: a scanner, `census`, or
`owner` for a claim only the owner can make (`owner/ask-owner.md`,
`owner/PACKET.md`). `basis` (`run | owner`) is who decided the row THIS run —
`owner` only where a repository's own packet decided it (`yardstick/measure.mjs
--packet`, `owner/PACKET.md`); the page renders it as "met, by the owner's word".
`not_applicable` rows are listed on their own, separate from `met` — a
requirement that does not apply was not satisfied, and it is never counted or
rendered as met (`yardstick/README.md`'s `not-applicable` status: decided only
from the map, never a packet claim on a run-decided row). `contradictions` is
the run's own recorded list (never recomputed by a view) — a packet's
`satisfied` claim the run itself found unmet, the claim and the run's status and
findings kept side by side, never merged. `INTAKE.md`'s "Contradicted claims"
section renders it.

`owner` is the run's own copied packet (`owner/manifest.yaml`, `owner/PACKET.md`),
reduced to facts — assay issues no verdict on any of it, the same rule that
governs everything else this view writes. `null` when the run carries no
packet at all; `INTAKE.md`'s "What the owner told us" section then reads "No
owner's packet yet: the owner prompt (`assay.mjs ask-owner`) collects these."
A role list (`people.build/deploy/restore`) is `null` when the packet never
spoke to it (rendered "unknown") and `[]` when the owner named nobody
(rendered "nobody") — the same placeholder-free convention `owner/PACKET.md`
already uses; every other unknown value renders as the word "unknown", never
dropped. `custody.credentials` also informs `d-credentials-enumerated`, but
ONLY as a trailing note on whatever list (open/met/to_run) the run itself put
that row in ("… (the owner listed N credentials)") — it never changes the
row's run-decided status; a claim never lets presence stand in for
enforcement.

## Maintain: is it still healthy?

`views/maintain.mjs` → `views/maintain.yaml` and `MAINTAIN.md`. The requirements
tagged `fleet`: what a steward's routines read to keep a repository healthy
without a person looking. Same shape as Intake, including `basis` (shown the
same way on the page) and `contradictions` (the run's own recorded list, same
shape and rendering as Intake's — a claim a steward's routines must not lose
sight of between intake and the next human look), with `view: maintain` and
`floor: true | false` on every row (whether Intake also reads it).

## Owner: what is true of it?

`views/owner.mjs` → `views/owner.yaml` and `OWNER.md`. The same measurement as
Intake and Maintain, for the person who built the app with an AI and is not an
engineer — consequence first, plain words, a term explained in a short clause
the first time, no stack names, no tool names; no score, no grade, no verdict.
The tier order (custody, safety, reproducibility, verification, legibility,
operability) is the priority. The register lives once, on every row of
`yardstick/requirements.yaml` (`owner.risk` / `owner.fix`); this view only
joins it to the measurement.

```yaml
view: owner
run: <run name>
yardstick: <requirements.yaml version>
counts: { floor_open, floor_not_measured, floor_met, floor_not_applicable, beyond_floor_open, beyond_floor_not_measured, beyond_floor_met, beyond_floor_not_applicable }
floor:                # the same population Intake reads (tags: [floor])
  open:
    - { id, tier, topic, title, status, risk, fix, where: ["file:line", …], findings: [F-…], check, reason }
  not_measured:
    - { id, tier, topic, title, status, risk, fix, where: [], findings: [], check, decided_by, reason }
  met:
    - { id, tier, topic, title, status, risk, fix, where: ["file:line", …], findings: [F-…], check, reason }
  not_applicable:    # decided from the map as having nothing to apply to; listed, never counted as met
    - { id, tier, topic, title, status, risk, fix, where: [], findings: [], check, reason }
beyond_floor:          # every requirement NOT tagged floor — fleet and ai-operating rows together
  open: [...]
  not_measured: [...]
  met: [...]
not_looked_at:         # every run-record row that did not run (map/scanners.yaml)
  - { scanner, status, reason }
```

`status` is `unmet | mixed | met | not-measured` — the same statuses
`yardstick.yaml` carries, never a score or a severity word. `findings` is the
measurement's own finding ids when the deciding mechanism produced any
(instrument and some facet rows), and `where` is those findings' evidence,
`file:line` in the target, what the owner can open; a census or claim row
decides over a named population or the owner's own word rather than
individual findings, so both read empty there and `reason` (the
measurement's note) carries what there is to point at instead. `decided_by` names what would decide a
`not_measured` row (a scanner, `census`, or `owner` for a claim only the
owner can make) — present only there, the same convention as Intake's
`to_run`. `OWNER.md` renders `floor` in full (one fix prompt per open row, in
tier order) and `beyond_floor` compactly; its "Fix in this order" list and
`floor.open` always agree by id and status with Intake's `open` list — same
measurement, never a second opinion.

## Improve: what makes it better?

The lead page is `IMPROVE.md`, the maintainer report (`views/improve/report.mjs`
over `views/improve/templates/`). It needs the run's authored
`views/improve/prose.yaml`; without it, a run still gets the rest.

| File | What it is |
|---|---|
| `views/improve.yaml` | every requirement grouped by topic, each exactly once: `topics: [{ topic, met, unmet, mixed, not_measured, not_applicable, rows: [{ id, title, status }] }]` |
| `views/improve/axes.md` | the axis walk: per axis, what to preserve, the risks ranked, and the requirements on that topic; custody, reproducibility and operability as their own sections; the axes no scanner measured this run |
| `views/improve/maturity-grades.yaml` | maturity coverage per dimension, computed (`node assay.mjs maturity`) |
| `views/improve/maturity.md`, `views/improve/security.md`, `views/improve/security-gate.yaml`, `views/improve/leverage.md` | the maturity reading, the exposures and attack paths, and where one change moves the most, written by the built-in method's view passes (`map/METHOD.md`) and checked by `validate` |
| `handoff/` | the remediation handoff (`START-HERE.md`, `REMEDIATION.md`, `FINDINGS.md`, `plan/`), one sequence shared with `IMPROVE.md` §6 (`views/improve/sequence.mjs`): the reviewer's roadmap first, then one read-first triage item per scanner that declares one, then every remaining scanner-fix remedy grouped per its adapter's declared `handoff.unit` (`map/scanners/CONTRACT.md` §7), worst severity first. Every remedy carries two proofs — what the repository's own tools can check, and what the next assay run checks. |

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
regressed:            # met/mixed -> worse, or dropped to not-measured/not-applicable
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis, findings: [F-…]}, note }
improved:              # rank went up (unmet -> mixed -> met)
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
newly_measured:        # not-measured/not-applicable -> decided
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
no_longer_measured:    # decided -> not-measured OR not-applicable (NEVER "unchanged", NEVER
                        # "improved"); current.status names which — read it, never assume
                        # not-measured (a requirement that stopped applying is not the same
                        # as one nobody measured)
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

`INDEX.md` leads with the four pages, one line each with its counts, then lists
the data files and any scanner's native report kept as an appendix.
