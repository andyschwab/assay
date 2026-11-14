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
the contract a publisher builds on; each page is its plain rendering. A view field
that exists because one operator's tooling reads it names that consumer in its own
text (a `consumer:` key or a sentence) and is phrased for any operator; the core
names no operator (`CLAUDE.md` rule 7).

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
met:               # findings: what the row was met by (#260): a census's members, the effect
                   # findings a met effect row read, an instrument's strength rows; [] when none
  - { id, tier, topic, title, basis, findings: [F-…], note }
to_run:            # status not-measured
  - { id, tier, topic, title, check, decided_by, basis, note, context: [F-…] }
                   # context: on a claim row only, and only when the run saw any (#262)
not_applicable:    # status not-applicable — decided from the map, NEVER counted as met
  - { id, tier, topic, title, basis, note }
not_seen:          # every run-record row that did not run
  - { scanner, status, reason }
contradictions:    # a packet claim of satisfied against a run-decided unmet row (Intake and Maintain)
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
`context` (#262, M4 of #257) is a claim row's: the finding ids the run listed on that
row's population (its context list, `map/SCHEMA.md` §6b), read off `yardstick.yaml`'s
`context:`. It is what the run saw bearing on a row only the owner decides, never what
its status rests on: it is not `findings`, it rides on whichever list the row's status
put it in (`to_run` without a packet, `met`/`open` when the packet decided it), and the
page renders it as "Seen in this run (context, not a decision): F-…", a label that never
reads as met or unmet. It appears only when the run saw any.
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
  not_measured:       # context / context_seen: a claim row's, only when the run saw any (#262)
    - { id, tier, topic, title, status, risk, fix, where: [], findings: [], check, context: [F-…], context_seen: ["…"], decided_by, reason }
  met:                # seen: the observations of the strengths the row cites, what was seen in place (#260)
    - { id, tier, topic, title, status, risk, fix, where: ["file:line", …], findings: [F-…], seen: ["…"], check, reason }
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
(instrument and facet rows, and a census row's members), and `where` is those findings' evidence,
`file:line` in the target, what the owner can open; a claim row, or a census that lists
no members, decides over the owner's own word or an authored count rather than
individual findings, so both read empty there and `reason` (the
measurement's note) carries what there is to point at instead. Every row carries `seen`:
on a `met` row, the observations of the strengths it cites, which `OWNER.md` renders under
"Holds" as what was seen in place, so the owner reads what holds and not only that nothing
was found missing; `[]` on every other row and on a met row that cites no strength. `decided_by` names what would decide a
`not_measured` row (a scanner, `census`, or `owner` for a claim only the
owner can make) — present only there, the same convention as Intake's
`to_run`. A claim row the run saw evidence on carries `context` (the ids, as Intake's) and
`context_seen` (their observations, in the owner's words), kept apart from `findings`,
`where` and `seen` so they never read as what the status rests on; `OWNER.md` renders them
after "What would tell" as "Seen in this run (context, not a decision): …". `OWNER.md` renders `floor` in full (one fix prompt per open row, in
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
| `views/improve/candidates.yaml` | the run's candidate properties (#264): the findings no requirement takes (`yardstick/untaken.mjs`: a finding `yardstick/population.mjs` `requirementTaking` names no requirement for, given the census it is listed in), grouped by the `property:` each names (`map/SCHEMA.md` §1), a reviewer's row by the property its adapter places it on (`map/placement.mjs`, #306): `{ view: candidates, run, yardstick, counts: { findings, taken, candidates, properties, unnamed }, properties: [{ property, findings: [F-…] }], unnamed: [F-…], unplaced: [{ finding, reason }] }`, properties sorted by name, ids in the map's order, a finding that names no property in `unnamed`, and `unplaced` the unnamed reviewer rows its adapter could not place, each with the reason; written by `compile` after measuring, and rendered in the walk (`views/improve/axes.md`, "Findings no requirement takes", on every run) and as `IMPROVE.md` §8 (where the run carries prose). A candidate is listed, never priced and never promoted here: promotion to a requirement needs two independent targets (#257, #265) |
| `views/improve/axes.md` | the axis walk: per axis, what to preserve, the risks ranked, and the requirements on that topic; custody, reproducibility and operability as their own sections; the axes no scanner measured this run |
| `views/improve/maturity-grades.yaml` | maturity coverage per dimension, computed (`node assay.mjs maturity`) |
| `views/improve/maturity.md`, `views/improve/security.md`, `views/improve/security-gate.yaml` | the maturity reading and the exposures and attack paths, written by the built-in method's view passes (`map/METHOD.md`) and checked by `validate` |
| `views/improve/leverage.md` | where one change moves the most: no pass writes it any more (#326), but a stored run may still hold one, and `validate` still checks that every finding id it cites resolves |
| `handoff/` | the remediation handoff (`START-HERE.md`, `REMEDIATION.md`, `FINDINGS.md`, `plan/`), one sequence shared with `IMPROVE.md` §6 (`views/improve/sequence.mjs`) of the reviewer's roadmap items, one read-first triage item per scanner that declares one, and every remaining scanner-fix remedy grouped per its adapter's declared `handoff.unit` (`map/scanners/CONTRACT.md` §7), in the order below. Every remedy carries two proofs — what the repository's own tools can check, and what the next assay run checks. |
| `handoff/sequence.json` | the same sequence as data, for an agent that iterates the work (`assay.handoff-sequence/1`, `lib/run-data.mjs`): `{ schema, run, sequence: [{ n, kind: authored \| triage \| remedy \| owner, voice: eval-authored \| triage \| scanner-verbatim \| owner-defined, source, title, findings: [F-…], plan: plan/NN-*.md \| null, rank: { halt, tier, severity, absent_evidence }, confidence: { value: confirmed \| judged \| absent-evidence \| not-measured \| known-misfire, rule, finding, reason?, declared?, repeatability?: [{ set, sweeps, requirement_agreement, candidate_agreement }] }, consequence: { value: severe \| significant \| contained \| cosmetic \| unvalued, rule \| null, reason?, finding, facts: { reversibility, external, gate_type, fail_mode, telemetry, blast_scope, halt, reach, trigger, tier, tags, floor, halt_at }, effect?, contested?: [{ fact, values, read, where }], judgment?: { value, because, applied, facts_value?, facts_rule?, refused? } } }], pending: [F-…], policy: { file, sha256, rules: [name] } }`; `rank` is the key that placed the item, read off its worst open gap (`tier` null when no requirement takes it; a sequence written before #306 carries none, one written before #316 no `absent_evidence`); `confidence` is how much assay knows about that gap, the value and the rule that assigned it (below, "How much assay knows"; a sequence written before #319 carries none), with `reason` and `declared` (the adapter's pair) on a misfire or a not-measured step, and `repeatability` on a judged item only where a named sweep set measured its source, each figure `{ agree, of, pct }` or `null` when the set could not take it; `consequence` is what is at stake for that item, its most consequential open gap's: the value, the policy rule that fired (or the engine's `lane-judgment`; `null`, with the `reason`, on an `unvalued` one), the finding it was read off, every fact of the closed list it read (`null` where the run could not read one), the effect finding whose facts it read when the gap touches one rather than is one, the facts the run or a sweep set contested (`values` riskier first, `read` the riskier) and a lane's judgment, applied or refused (below, "What is at stake"; a sequence written before slice 2 of #319 carries none); `policy` names the consequence policy the values were read under, its digest and its rule names (`yardstick/consequence.yaml`, or the operator's file the run record names); an `owner` item's `source` names every scanner or lane among its findings; `pending` holds only the fix-less gaps no requirement takes and no property names; `handoff.mjs` checks it before writing, `validate` reads it back |

**The sequence's order** (#306, #316) is one key, read off what each item's findings are;
which scanner found a finding, and whether the item is authored, triage, a scanner's fix or
the owner's to define, never moves it. It is expressed once, as the tuple `KEY` in
`views/improve/sequence.mjs`. Each open gap the item holds is keyed by, in this order:

1. **Halt** comes first: an unheld halt (`map/doctrine.mjs` `isHalt` over its effect facet), or
   a gap with confidence `confirmed` at or above the severity that the requirement it bears on
   names as a halt (`halt_at:` in `yardstick/requirements.yaml`, `yardstick/README.md`). The
   requirement row says what is a halt, never the scanner that found it.
2. **Severity class**: Blocker, Critical and High; then Medium; then Low, Nit and unrated, the
   severity a view reads (`views/severity.mjs`). A High never ranks below a Low, whatever their
   tiers. A gap whose every listing row reads not measured is not a confirmed gap: it ranks
   unrated, with the tier it bears on.
3. **Evidence**: within a class, a gap whose confidence is `absent-evidence` (below: an
   owner's evidence file found absent, `evidence_absent: true`, `map/SCHEMA.md` §1, such as the
   census's "no evidence transcript") comes after every gap observed in the tree. This is a
   clause of the key, not a severity adjustment: the absent transcript keeps its severity and its
   class. It reads the confidence, so a transcript row from a census the run record says failed
   is not measured, not absent evidence.
4. **Tier**: the tier of the requirement the gap bears on, in the tier order above (custody,
   safety, reproducibility, verification, legibility, operability), read off the measurement
   (`yardstick.yaml`): the most urgent tier among the rows that list it unmet or mixed, else
   among the rows that list it met or not applicable, else among the rows that read not
   measured. A gap no requirement takes comes after every tiered gap of its class and evidence.
5. **Severity** within the class: Blocker before Critical before High, Low before Nit before
   unrated.

An item is placed by its worst gap, so a group bundled by `handoff.unit` sits where its worst
member would; an item holding no open gap comes last. Ties go to the item whose lowest finding
id comes first. No item is held first for any other reason: a reviewer's roadmap item is placed
by the findings it cites like any other, and a triage item by the hits it holds.

**How much assay knows** (#319). Every item records its **confidence**, how much assay knows
about its worst gap, on a closed scale. Each value is assigned by one named rule, stated once in
`map/confidence.mjs` (`RULES`), read off the kind of evidence (the source's adapter, never its
name), the finding's own fields, the run record and the census's deployment signals, and never
off a tool's severity label. The rules are tried in this order, and the first that fires decides:

| Rule | Value | Fires when |
| --- | --- | --- |
| `adapter-declared-misfire` | `known-misfire` | the adapter declares this rule does not apply on a deployment signal the census read, a file's name or a resource type a `.tf` declares (`confidence.misfires`, `map/scanners/CONTRACT.md` §3), with the reason: a container HEALTHCHECK on a tree deployed by Heroku, Fly, Kubernetes or Cloud Run; the gap stays visible and never reads met |
| `source-not-run` | `not-measured` | the run record (`map/scanners.yaml`) says its source was skipped or failed |
| `adapter-declared-not-measured` | `not-measured` | the adapter declares that a row with these `detail:` facts is a step that could not run (`confidence.not_measured`), with the reason: a fresh-clone test that stopped within seconds with no test counted, on a tree that names a database and declares no services (#256, #305), or a migrate the runner did not run because its only form needs a live database (`reason_code: needs-live-database`); never a failure |
| `evidence-file-absent` | `absent-evidence` | the gap is an owner's evidence file found absent (`evidence_absent: true`) |
| `deterministic-instrument` | `confirmed` | its source's evidence is `deterministic` |
| `cited-and-confirmed` | `confirmed` | its source's evidence is `cited` (re-resolved at the head), its own `confidence:` is `confirmed`, and it cites a `path:line` |
| `cited-not-confirmed` | `judged` | its source's evidence is `cited`, and it is `plausible` or `unverified`, or cites no `path:line` |
| `judged-source` | `judged` | its source's evidence is `judged`: a lane's reading of practice, its owner items included |

What an adapter declares about this exact rule in this exact context comes before the general
kind of its source's evidence, and a source that did not run decides nothing. No rule, no value:
the handoff halts. An item takes its worst gap's confidence (the gap the key places first); among
gaps tied at that worst key, the strongest value applies, in the scale's order (confirmed, judged,
absent evidence, not measured, known misfire). A **judged** value carries its source's measured
repeatability, requirement agreement and per-candidate descriptor agreement (`map/variance.mjs`,
#257, #312), only from a sweep set named for the run (`compile --sweep-set <dir>`, a committed set
under `tests/sweeps/` or the operator's own) whose every sweep ran that source; with none named,
no figure, and a figure the set could not take is `null`, never a number. START-HERE renders each
item's confidence in one phrase, REMEDIATION with its rule and reason. The key does not reorder by
confidence beyond clause 3: the quadrant view and the lenses are #319's next slices.

**What is at stake** (#319, slice 2). Every item also records its **consequence**: the
consequence policy applied to the facts of what its gaps touch, on a closed scale (severe,
significant, contained, cosmetic), by `map/consequence.mjs`, or **unvalued**, outside the scale. The facts are closed: the effect a
gap is or touches (its six descriptors), whether that effect is an unheld halt, the live chain
that carries the gap (its reach and its effort to trigger), and the tier, tags and floor of the row
it bears on, and whether the gap reaches the `halt_at:` that row names. The policy is data, `yardstick/consequence.yaml` (its contract, rules and the default
policy are `yardstick/README.md`, "Consequence"), or the operator's own file the run record names
(`compile --consequence-policy <file>`). Every rule is read, and the highest value that fires
wins. A gap no rule values reads `unvalued`, with the reason (no fact on the closed list that a
rule reads applies to it): never a value of the scale without the rule that gave it, never a
guess, never a label, and it never halts the handoff. A tool's or a lane's severity label is read
by no rule; `halt_at` alone compares a gap's severity to the bar its own requirement row names, as
the key's halt clause does. A contested fact (a descriptor the run's findings on one channel, or a named sweep set's
sweeps, record differently) reads its riskier value and the item says so; a lane's judgment
(`judged_consequence:`) raises the value when it is higher and is refused when it would lower it.
An item takes its most consequential open gap's value, the first in the key's order among equals;
it reads unvalued only when every open gap it holds does.
START-HERE renders it in one phrase beside the confidence (`consequence <value> (<rule>)`, the
contested facts named, or `consequence not valued: <reason>`), REMEDIATION with the rule, what it says, the facts read, any contest and
any judgment. The key does not read it: the order is the one above, and the quadrant view and the
lenses that would read consequence and confidence together are #319's next slice. Nothing sums,
multiplies or otherwise combines the two.

**What is sequenced** (#316). Every open gap the roadmap does not cover is in the sequence or
named outside it with the reason. A gap with a scanner's fix is a remedy or triage item. A gap
with no fix (a practice review's gap, most often) is an **owner** item: one per requirement the
measurement lists it on, else one per property it observes (`map/placement.mjs`), its remedy
the owner's to decide, ranked by the same key. A fix-less gap with neither has nothing to group
it under: it stays in `pending`, and START-HERE counts and names it with that reason.
| `views/improve/chains.json` | the ranked chains as data (`assay.chains/1`, `map/SCHEMA.md` §6d): `{ schema, run, live: [{ rank, entry: { id, label }, headline: { id, label }, sinks: [{ id, label, blast }], blast, difficulty_rank, difficulty_why, path: [F-…], tentative }], held: [{ entry, holds: [{ id, label, by }] }], contained: [{ id, label, why }], unresolved: [{ kind, id, label, why }] }`; `report.mjs` checks it before writing, `validate` reads it back |
| `views/improve/report.json` | the report's model as data, labels applied, for a renderer of the report that imports nothing (`assay.improve-report/1`, `lib/run-data.mjs` `checkImproveReport`): `{ schema, run, labels: { dimension, who, group, confidence }, capabilities: { counts: { kinds, unguarded, byGroup }, groups: [{ group, label, kinds, unguarded, channels: [{ channel, label, what, findings: [F-…], external, reversibility, telemetry, trace, blast, gates, halt }] }] }, chains: { live: [chains.json's live row, plus blast_word, difficulty, cuts: [{ id, label }], weakest: { id, confidence, word } \| null], held, contained, unresolved }, supervision: { total, supervised, unsupervised, kinds: [{ channel, label, sites, ids: [F-…], fixes: [{ n, slug }] }], fixes: [n], any_unplanned }, howto }`; a live chain's `cuts` are the control or process gaps that stop it (`[]` when none) and its `weakest` the step a tentative chain rests on (`confidence` `plausible` or `unverified`, `word` the report's phrase for it), `null` when the chain is not tentative, both as `map/chains.mjs` computes them; every entry naming a finding by `id` (each `entry`, `headline`, sink, hold, cut, `weakest`, `contained` and `unresolved` row) carries that finding's `confidence` and `word`, the phrase `labels.confidence` gives it (`{ plausible, unverified }` → the report's hedge), `null` when confirmed, so a renderer never maps a confidence to words itself and `checkImproveReport` refuses an entry without both; `howto` is the report's how-to text, markdown; `report.mjs` checks it before writing, `validate` reads it back |

### Across runs: the candidates tally (#265)

`node assay.mjs candidates <run> <run> … [--json]` (`views/improve/tally.mjs`) tallies the
candidate properties of several measured runs, reading each run's candidates through
`buildCandidates` (`views/improve/candidates.mjs`), so a run counts once measured, whether
or not `compile` has written its `candidates.yaml`. A target is what the run states of
itself, `identity: { repository, path }` in `map/scanners.yaml` (`map/SCHEMA.md` §5a):
runs of one target count once. A property seen on two or more independent targets is
**proposed**, one seen on one target **held** (#257 Q2). Proposing edits nothing: a
proposed property becomes a requirement only by a reviewed change to
`yardstick/requirements.yaml` that names its sources, as every row does, and the output
says so. **Saturation** (D3): the runs in the date each records (`drawn:`, else the latest
`reviewed.date` on a row; never the file system's), each with the number of properties it
adds that no earlier run carried; that number falling means the yardstick is converging.
`--json` writes, to stdout and nowhere in a run:

`{ runs: [{ run, target, date, added }], properties: [{ property, status: proposed | held, targets: [<identity>], findings, first }], unnamed }`

`runs` in date order (ties keep the order given), each `target` as its target's first run
states it (`<repository>`, or `<repository>#<path>` for a subtree); `properties` proposed
first, then by the number of targets, then by name, `findings` the candidate findings that
name it over every run and `first` the run it first appeared in; `unnamed` the number of
candidate findings that name no property, counted, never as one property. A run that
states no identity, records no date, or has no `yardstick.yaml` is refused, naming what is
missing, and nothing is tallied; `--target <run>=<repository>[#<path>]` and `--date
<run>=YYYY-MM-DD` state them for a stored run drawn before the fields, and a statement
that contradicts the run's own record is refused.

## Since: what changed?

`views/since.mjs` → `views/since.yaml` and `SINCE.md`, written by
`node assay.mjs since <run> --previous <prev-run>` or `node assay.mjs compile
<run> --since <prev-run>` — compile with no `--since` writes neither file, and
`INDEX.md` links `SINCE.md` only when it exists. The pure comparison it reads is
`yardstick/compare.mjs` (`yardstick/README.md`'s "Comparing two measurements"
section is its one home); this view only joins title/tier/topic from the
register and renders.

Two runs can be measured by different engines, and a rule that changed between
them would otherwise read as a move of the repository (#183). So Since compares
three measurements, every one of them the yardstick's
(`yardstick/measure.mjs`):
- the previous run's stored `yardstick.yaml`;
- the previous run's map, measured by this run's engine (`projectRun`);
- this run's `yardstick.yaml`.

The moves (regressed, improved, newly and no longer measured) are the second
against the third: the repository's change, on one engine. `re_ruled` is the
first against the second: one map, two engines, so every row there is the
engine's change, never the repository's. A requirement the yardstick added
between the engines is `yardstick_only`; one it retired (`requirements.yaml`
`retired:`, `yardstick/README.md` "A retired requirement") is `retired`, naming its
successor and why, and the page lists it under "Retired requirements". The findings are split by the
run records (`map/scanners.yaml`) the same way: a finding from a scanner that did
not run in the previous run is `not_run_before`, never new; one whose scanner did
not run in this run is `not_run_now`, never no longer found. Only a scanner that
ran both times speaks to what the repository changed.

```yaml
view: since
run: <run name>
previous: <previous run name>
yardstick: <this run's requirements.yaml version>
previous_yardstick: <the previous run's version>
yardstick_version_changed: true | false
engine: <this run's engine, from map/scanners.yaml>
previous_engine: <the previous run's engine>
counts: { regressed: N, improved: N, newly_measured: N, no_longer_measured: N, re_ruled: N, yardstick_only: N, retired: N, findings_new: N, findings_no_longer_found: N, findings_not_run_before: N, findings_not_run_now: N }
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
re_ruled:              # the previous map's stored status (previous) against today's engine's
                        # reading of the same map (current): the engine's change, never a move
  - { id, tier, topic, title, previous: {status, basis}, current: {status, basis}, note }
yardstick_only:        # the id exists on only one side — the yardstick itself was edited
  - { id, side: previous | current, title, status, basis }
retired:               # the previous run measured it; the yardstick has since retired it
  - { id, successor, why, status, basis }   # status: what the previous run read
findings:
  new:                 # matched by fingerprint against the previous run's base; not matched there
    - { fingerprint, id, source, dimension, native_category, evidence: […], observation }
  no_longer_found:     # matched in the previous run; not matched in this one
    - { fingerprint, id, source, dimension, native_category, evidence: […], observation }
  not_run_before:      # in this run only, from a scanner that did not run in the previous run
    - { fingerprint, id, source, dimension, native_category, evidence: […], observation }
  not_run_now:         # in the previous run only, from a scanner that did not run in this one
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

Beside it sits a **scanner-free fingerprint** (`yardstick/compare.mjs`'s
`factFingerprint`), for counting one fact two scanners found rather than for Since:
`(projected axis, polarity, the effect channel or else the evidence file set with
the `:line` suffix stripped, the effect descriptors)`. The axis is the one the
projection reads off the scanner's adapter, never the scanner's own category, so
two scanners measuring one property meet on it (`CLAUDE.md` rule 5); the schema
carries no symbol, so the file set is the finest identity every scanner records.
`corroboratedFacts` returns the facts two or more scanners recorded; two rows of
one scanner on one fact are never corroboration. Since keeps the scanner-keyed
fingerprint: a fact's custody stays with its scanner.

`SINCE.md`'s headline line is **counts only** — no verdict, no severity the
views do not already compute (`CLAUDE.md` rule 1) — and its sections run most
useful first: regressed, improved, newly/no-longer measured, re-ruled by the
engine, then the findings delta last, with the findings from a scanner that ran in
only one run apart from it.

## The index

`INDEX.md` leads with the four pages, one line each with its counts, then lists
the data files and any scanner's native report kept as an appendix.
