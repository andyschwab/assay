---
type: doc
title: "yardstick/ — the requirements, and the measurement of one map against them"
---
# yardstick/

`requirements.yaml` holds the **requirements**: what must be true of a repository
somebody stands behind, stated without naming a stack, each with the mechanism
that **decides** it from a map. `measure.mjs` measures one run's map against them
and writes `yardstick.yaml`: per requirement, `met`, `unmet`, `mixed`,
`not-measured` or `not-applicable`, with the finding ids and a note saying how it
was decided. Every view reads that file and nothing else to decide a requirement.

**`not-applicable`** is decided **only from the map, never from a packet claim**
— a claim of `not-applicable` on a row the run itself decides (`facet`, `census`,
`instrument`) is ignored for status, exactly like any other claim on a
run-decided row (see "Claims and a run, compared" below). A `facet`/`census`/
`instrument` row declares when it can be not-applicable with
`decide.not_applicable_when: <fact-category>` (and, symmetrically,
`decide.not_measured_when: <fact-category>`, for "the evidence to decide this
was never gathered" rather than "this does not apply"): the name of a
`polarity: fact` row the same scanner records when it looked for something and
found none, or a list of such names (any one fires it). An `instrument` row may
also name `decide.excluding: <detail-flag>`: a row whose `detail` carries that
flag `true` is set aside from the requirement's population (it stays in the map
and the views, and the note counts it) — the scanner says its own evidence cannot
carry the requirement there, as structure-scan's `unconfigured` does for
`d-no-dead-code`. The condition only fires when the row's own decided category
carries **no** rows this run — real evidence (a gap, a strength) always governs
over it, the same "a list is an AND, never overridden by a side fact" rule a
joint category already holds. `d-schema-versioned` was the first row to use it: `fresh-clone` records a `no-database-signal` fact when it finds no
database file or dependency anywhere in the tree, and the row reads
not-applicable — never met by silence, the way a tree with no database used to
read. `d-dependencies-known-clean` reads not-measured on `no-lockfile` (a manifest
with dependencies that no lockfile covers) or `lockfile-not-audited` (a lockfile
whose audit failed, or whose package manager was not on the runner): a lockfile
nothing audited is not a clean one, and before that fact existed a run whose only
lockfile went unaudited read met. The four fresh-clone rows read not-measured on
their steps' `<step>-not-run` facts (`test-not-run`, `lint-not-run`, …), which
fresh-clone records for a step it skipped because the install did not pass: a
step that never ran is not a clean one, and before that fact existed a
repository whose install failed read met on tests, lint and typecheck. The six
`repo-census` owner-evidence rows read not-applicable on their
`evidence-<id>-not-applicable` facts, which the census records when it finds no
deployment signal anywhere in the tree: before that fact existed a library or a
command-line tool read six unmet rows asking it to prove a restore, a rollback
and an alert for something it never deploys. A `claim`-kind row's own state can independently be `not-applicable`
(the owner is the only decider a claim row ever has, same as `satisfied`): see
below.

**Stage and urgency are a reader's lens, never an input.** On a run-decided row,
`not-applicable` is a scanner's positive observation: it looked and found nothing
to apply the row to (the deployment signal above is the evidence-based proxy for
"nothing deployed yet"). What is demanded of a repository now — its stage, the
urgency of a gap, the scope of an engagement — is a reader's lens applied to the
measurement above the line, never a fact the map records. A consumer that defers
rows by stage (every row carries a `topic`, so the operating rows are one
`topic: operability` away) shows them as deferred, never as not-applicable or met.
The engine takes no stage input: no `stage:` on the run record, no `--stage` on
compile, no `not_applicable_at:` on a row. A stage-driven `not-applicable` would be
a claim on a run-decided row by another name; stages move both ways, so the
ratchet would release held rows on a downgrade, and `since` would read the move as
unchanged (not-measured ↔ not-applicable).

A repository may also state its own **claims** per requirement, in a **packet**
(`/owner/PACKET.md` is the one home of its format). Claims and a run's
measurement are compared, never merged: a claim the run contradicts is a
finding, never silently overwritten.

## The rows

| Field | Meaning |
|---|---|
| `id` | `d-<slug>`, the public namespace. A team's private requirements carry their own prefix in their packet and join this one when a second team needs them |
| `title` | the requirement, one sentence, no stack in it |
| `tier` | the order to fix things when taking a repository on, which is also the order of irreversibility: custody, safety, reproducibility, verification, legibility, operability (the file's `tiers:` list) |
| `topic` | what part of the code it is about: an axis of the roster (`map/project.mjs`), or custody, reproducibility or operability, which no scanner measures as an axis. Improve groups by topic |
| `tags` | which view reads it: `floor` (Intake: the bar for taking a repository on), `fleet` (Maintain: what a steward's routines read), `ai-operating` (the model-call layer). Every row in the register carries at least one, so no measured row is read by Owner alone |
| `harm` | on a `floor` row, and only there: what its gap can harm, from the file's closed `harms:` list (`data`, `people`, `money`, `recovery`). `owner.risk` says how, in plain words. A row with no harm to name is valuable and measured, and lives beyond the floor |
| `decide` | the deciding mechanism, one of four kinds below |
| `check` | the proving check: what shows the requirement met |
| `sources` | where the row was extracted from, as `<kind>/<slug>`: `floor/` a takeover floor, `manifest/` a template's guarantee manifest, `foundation/` a foundation template's rules, `takeover-eval/` and `template-eval/` evaluations of real repositories (never named), `method/` this method, `scanner-candidates/` the scanner roster, `issue/` an assay issue. Every row has one: requirements are extracted from practice, not designed |
| `status` | draft, stable or deprecated: the row's own lifecycle |
| `owner` | a nested `{ risk, fix }` block for the Owner view (`views/owner.mjs`, `OWNER.md`): `risk` is what could happen to the app's owner if the requirement stays unmet — consequence to a person first, plain words, a term explained in a short clause the first time, no stack names, no tool names, one or two sentences; `fix` is the next thing to do, one sentence, actionable by the owner's own AI. Never a score, a grade, or a severity word — the tier already carries the priority. Required on every row |

**The floor.** A row is `floor` when its gap can cause harm to data, to people, to
money or to recovery (#161), and it names which in `harm`. Quality that makes work
faster or safer to change, but harms nothing by its absence, is valuable and
measured, and lives beyond the floor: Maintain reads it through `fleet`, and Owner
lists it beyond the floor. This says which view reads a row, never a severity: the
map still states what is (`CLAUDE.md` rule 1). `measure.mjs` refuses a floor row
with no harm, and a harm on a row beyond the floor.

A row that exists because one operator's tooling reads it names that consumer in
its own text (a `consumer:` field or a sentence) and is phrased for any operator;
the core names no operator (`CLAUDE.md` rule 7).

**When a lane reviewed a row.** A row a review lane decides (`map/scanners/CONTRACT.md`
§3h) carries `reviewed:` in `yardstick.yaml`, one entry per lane that ran and recorded what
it reviewed: `{ by: <scanner>, head: <sha>, date: YYYY-MM-DD }`, read off the run record
(#201). A facet or census row whose lane has not run reads not measured, its note naming the
lane not run and the run record's reason. `validate` reads a stored `reviewed:` the run
record does not produce as drift.

## The four deciding kinds

| Kind | Decided from | Reads |
|---|---|---|
| `facet` | the effect and capability facets the finding schema forces (`map/doctrine.mjs`), and for the effect rows the run's closed effect population (below) | met or unmet with the population, a met effect row citing the effect findings it read; not-measured when the map has no effects, or when the run carries no channel candidate list; mixed when a row would read met beside an untriaged candidate |
| `census` | an enumerated population in the run's `map/censuses.yaml`, by measure name, read off the finding ids its `members:` lists (below) | met only when every member is a strength, citing them; unmet on a gap (mixed when a strength sits beside it, except on a `safety` row); mixed when a member carries no verdict; with `met of N`; not-measured when no census of that name ran. A census with no `members:` never reads met |
| `instrument` | a scanner's rows, gated by the run record and, for a peer scanner, its coverage file | unmet on gap rows (mixed when a strength row sits beside them, except on a `safety`-tier requirement, whose check is a cleanliness claim: there one gap row reads unmet whatever strengths sit beside it); met when an instrument ran clean or a peer scanned the domain with no gaps; not-measured when skipped, failed or not scanned, **with the recorded reason** |
| `claim` | nothing in a run | not-measured from a run alone: only the owner can decide it (the Intake view says `decided_by: owner`), which a repository's own **packet** may do (`basis: owner` — `/owner/PACKET.md`: `satisfied` → met, `not-applicable` → not-applicable, `open` → unmet). A claim row with a `decide.context` also carries the findings the run listed on its population as `context:`, never as `findings:` (below). The claim rows a packet never speaks to are the list of instruments still to build |

**A facet or census row's check names its population and its question** (#261, M3 of #257).
If two careful readers holding the yardstick put one finding on different rows, the
measurement cannot place it either. So every `facet` and `census` row's `check:`, and every
`claim` row's that carries a context list (#262), is one string in one form:

```
Population: every <term> <scope>; excluded: <what>. Question: <one question>? <how the row reads>
```

- `<term>` is one entry of `requirements.yaml`'s closed `members:` vocabulary. Each entry
  has a `term`, the finding `subject_types` a member may carry, and what it `means`.
- The scope says which members count. `excluded:` says what does not count, and names the
  row that takes a near neighbour.
- The question is the one question asked of each member. Exactly one question mark appears,
  and the row's reading follows it.
- No two rows' populations name the same term.

`yardstick/population.mjs` holds the form (`parseCheck`, `validatePopulations`), and
`tests/blocks/check-names-population.mjs` enforces it.

**Which requirement takes a finding** is one reading, `requirementTaking(finding, { member })` in
`yardstick/population.mjs`. Every route that answers adds a candidate. The finding is taken when
exactly one candidate answers, and is taken by no requirement when none does. Two candidates
read as ambiguous, never as one of them. The routes are:

1. **An instrument row** takes its deciders' rows: a finding whose scanner and native category
   (or a fact category its `not_applicable_when` / `not_measured_when` reads) a binding decides
   the row on.
2. **An effect or capability finding** is taken by its own facets: the term whose `record:` is
   `halt-class-effect` (`isHaltClass`), `effect` or `capability`. The four effect rows all *read*
   an effect finding through its facets, but one row *takes* it:
   - `d-effects-gated` takes a halt-class effect, whose polarity is the answer to that row's
     question (`map/SCHEMA.md` §8);
   - `d-effects-provable` takes any other effect.
3. **Any other finding** is taken by the row whose population names the term its `member` gives.
   In a run, `member` is the census or context list the finding is listed in; a reader supplies
   it otherwise. A claim row with a `decide.context` names its population in the same form, and
   takes a finding as context only (below).

Findings carry no requirement id (#257 Q1), and a term no row names is a stated boundary. These
are the boundaries #257 named:

- **Stale docs.** A concrete claim in the README, a doc page it routes to, or the agent contract
  file is a `doc claim`, which `d-readme-true` takes. A stale comment or header in code is a
  `code comment`, which no requirement takes until a docs-current-with-code row is promoted. A
  second account of one fact is `d-one-home-per-fact`'s population, a claim row that takes it as
  context, never as a decision (below).
- **Spend.** No row takes a per-run or per-process ceiling enforced before a paid call (the
  paid-spend-capped candidate). `d-cost-alerts` covers an alert on the bill after the spend, and
  only the repo census's owner-evidence transcript decides it. Whether a model call site records
  its spend is `d-model-call-telemetry`'s, a census row (below).
- **The multiplayer principals.** `d-agent-consumable-surface` takes an `interface` (can an agent
  use it through a contract stated outside the code?). Whether the server checks who is asking
  (`d-routes-authorized`) and whose data a request reaches (`d-tenant-isolation-in-data-layer`)
  are instrument rows: they take their instruments' rows and no judgment finding. Whom an effect
  acts as is taken by no row.

`tests/mapping/MAPPING.yaml` is the known-answer set: public findings, each with the
requirement that takes it, or `none`. `tests/blocks/finding-maps-to-one-requirement.mjs` holds
the yardstick to it. The block goes red when one row's population is blurred, or is moved onto
another row's term.

**The claim rows a run evidences** (#262, M4 of #257). In one run, 23 findings bore on ten
claim rows and every one read not measured. Each of the ten carries one reviewed disposition
on the row, `decide.why`, which opens with the kind and `(#262)`:

- **Census-decided** where a run can close the population by reading the tree. The row is a
  `census` row in the form above, and its census is in `map/METHOD.md`'s census list and the
  practice-review lane's instructions.
  - `d-model-call-telemetry` (`model call site`, census `model-call-telemetry`): every model
    call is a provider SDK import or a call to a provider's API in the code.
  - `d-ingested-content-is-data` (`ingestion point`, census `ingested-content`): outside text
    enters only through an upload, a fetch, an inbound route, webhook or feed, or a file read
    the code makes.
- **A claim** where only the owner can attest it. The row stays `claim`, and when unsure it
  stays one: a census that cannot be closed from the tree would read met over a population
  nobody enumerated. It still names its population in the form above, so the one reading of
  which requirement takes a finding (`requirementTaking`) places a finding on it, and its
  `decide.context` names the **context list** the review writes for it (`map/SCHEMA.md` §6b).
  The row's status stays not measured, or the packet's claim; the list's ids ride on the row as
  `context:`, never in `findings:`, and the views show them as "Seen in this run (context, not
  a decision)" (`views/README.md`).
  - `d-one-home-per-fact` (`second account`): no listing closes the facts a system relies on.
  - `d-model-qualification` (`model in use`): a qualification happens off the repository.
  - `d-ai-disclosure` (`outward AI output`): whether a disclosure meets its audience's norms
    is the owner's to say.
  - `d-guards-bite` (`guard fixture`): seeing a check go red when weakened takes a mutation run
    the lane does not make, and the checks are the change-gates census's population.
  - `d-backlog-is-issues` (`backlog record`): the issues and their labels live on the forge.
  - `d-ai-feature-evals` (`AI feature`): which features ship is a product boundary the tree
    does not draw.
  - `d-calibration-harness` (`relied-on rubric`): which rubrics are relied on is the owner's to
    say, and the repeated runs happen in a model.
  - `d-change-carries-verification` (`change verification`): the changes live in the forge's
    history, not the tree.

**Gates on a change** (#257 Q5). `d-gates-fail-closed` keeps the gates in front of the
application's effects. `d-change-gates-fail-closed` is a separate census row (`change-gates`).
Its population is every check the repository runs on a change before it lands or ships: a CI
job or step, a commit or push hook, a config-driven check. It asks of each whether the check goes
red when what it needs is absent or never finishes. `d-ci-gate-on-default-branch` keeps the
repo census's own reading: whether a CI workflow on the default branch exists and runs the gates.

**The effect population** (#259, the remaining case of #53). A rule over the effect
findings reads only what the run recorded, so an effect nobody wrote down could leave it
met. The population is therefore closed by the run, not by the reader: `assay start` writes
the deterministic enumeration into the run (`map/raw/enumerate.json`), the practice-review
lane is given it and triages every candidate (the channel candidates, route handlers and
effect-site members, #269) in `map/effect-triage.yaml` to the
effect finding that covers it or out of scope with a reason (`map/SCHEMA.md` §6e), and the
yardstick reads both (`map/effect-triage.mjs`). The four effect rules (`halts-gated`,
`halts-traced`, `effects-provable`, `gates-fail-closed`) read:

- **not measured** when the run carries no candidate list, whatever effect findings it
  holds, with that reason: a population never enumerated is missing data, never met;
- their own rule over the effect findings when every candidate is triaged. A web app with no
  CLI, skill, tool definition or MCP toolset still has a list: its route handlers and effect
  call sites. A list empty in all three populations is closed: enumerate found nothing that
  acts;
- **mixed** where that rule would read met and a candidate is untriaged, the note naming each
  one; an unmet or not-measured reading stays as it is, its note naming them too, since a gap
  the run did record stands.

`d-effect-channels-enumerated` is decided by the triage itself, as the `facet` rule
`channels-triaged`: met when every candidate is triaged (`met of N`, citing the effect
findings that cover them), unmet naming the untriaged ones when a triage exists, and not
measured without a list, over an empty one, or with no triage at all (#275). A run whose lane
did not triage (a routine run, a lane skipped) holds a review that did not happen, never a gap
in the target: the note names the lane, "not run" or "wrote no triage". For a web app it is
decided over the route handlers and effect-site members. It is a `facet` row, not a `census` one: a census reads
the members a review session lists in `map/censuses.yaml`, while this row is computed from the
run's own two files, the way the other facet rules are computed from the finding facets, so
nothing in it can be hand-inflated. Binding lives on the yardstick side (#257 Q1): the
triage names findings, and no finding carries a requirement id.

**A census a tool can list** (#286, M6 of #257). Before M6 each lane drew a census's members
itself, at its own grain, so two sweeps of one target parted on rows they judged alike: one
counted one workflow token per workflow, another one token. A census row whose population the
tree lists deterministically now names it: `decide.candidates` lists the enumerate
population(s) (`map/raw/enumerate.json`), the row's `check:` states that one candidate is one
member, and the lane triages each candidate once in `map/census-triage.yaml`, to the census
member that judges it or out of scope with a reason (`map/SCHEMA.md` §6f, `map/census-triage.mjs`).
`validate` refuses a missed candidate, a candidate triaged twice, a finding that is not a member
of that census, and a member judging two candidates. Such a row reads its members as any census
does, then over the list, as the effect rows read (#259):

- **not measured** when the run carries no list, or a list that lacks the row's population (an
  enumeration older than it), whatever its census says, with that reason;
- its census reading when every candidate is triaged (a list enumerate wrote empty is closed);
- **mixed** where that reading would be met and a candidate is untriaged, naming each one; an
  unmet or not-measured reading stays as it is, naming them too.

`d-credentials-enumerated` reads over `secrets`, `d-change-gates-fail-closed` over
`changeGates`, and `d-model-call-telemetry` over `modelCalls`. `secretConstants` is no row's
candidate list: enumerate already set each apart as a constant no site reads from the
environment, which the credential check excludes. Every other census row says on the row,
in `decide.open`, why no tool lists its population (doc claims, non-obvious decisions, modules,
interfaces, lessons, ingestion points); its members are drawn by the terrain and read as
before, and its agreement across sweeps is tracked, not forced. A census row carries exactly
one of the two, and an enumerate population closes at most one census.

**Met needs positive evidence** (#260, M2 of #257). A requirement reads met by what the run
saw in place, never by the absence of a gap, and its row cites what that was:

- **A census lists its members.** Each `sampled:` entry in `map/censuses.yaml` names its
  population in `members:`, the finding ids that are its members, one per member
  (`map/SCHEMA.md` §6b, read by `map/census.mjs`). Its `met`/`of` are read off them: a
  `strength` member is met, a `gap` member is not, and a `fact` member records what is
  without a verdict against the bar, so it counts in `of` and never in `met`. An authored
  `met`/`of` that disagrees with the members fails `validate`.
- **Met needs every member to have a verdict.** A census row reads met only when every
  member is a strength. A member with no verdict (a fact, or an id the run does not carry)
  holds the row mixed, named in the note; a census whose members all lack one reads not
  measured. The row's `findings:` cites every member, on met as on unmet, so a reader sees
  why it is met. A census with no `members:` has only an authored count, which is not
  evidence: it cannot read met (a count that says all reads mixed, with that reason), and
  otherwise keeps what it says.
- **Gaps decide unmet; strengths support met; a strength never offsets a gap.** A gap member
  reads the row unmet, or mixed where a strength sits beside it on a row that is mixable; a
  `safety` row stays a cleanliness claim, and one gap reads it unmet, the instrument rule's
  own.
- **A met effect row cites what it read.** The four effect rules read met only over a closed
  population (above), and a met row cites the effect findings in the rule's population, the
  ones the triage drew in; an unmet row cites the ones that fail.

The views show it: Intake and Maintain carry a met row's `findings:`, and Owner says what was
seen in place, the cited strengths' observations, under "Holds" (`views/README.md`).

**Who decides an `instrument` row.** The row may name one decider itself (`scanner`,
`category` and its conditions on `decide`), a list of them (`decide.deciders`), or none:
an external scanner never appears here (`CLAUDE.md` rule 7). It binds through its
adapter's `decides:` (`map/scanners/CONTRACT.md` §3), each entry naming the requirement,
the category and the same optional conditions. A binding counts when the scanner is
adopted, or on a run that records a disposition for it; a binding to a requirement the
yardstick lacks halts the load. One decider reads as it always has. With several (#177):
a gap from any decider decides the row (mixed only where a strength sits beside it and
the row is mixable); a decider that reads not-applicable steps aside, and the row reads
not-applicable only when every decider does; any other decider not measured holds the
row not-measured; met needs every remaining decider met. A decider's `audits:` names the
fact category in which its scanner records each file it audited; another decider's
`not_measured_when` fact about only such files is answered, not holding. A row whose
check is several properties that must all hold carries `decide.any_gap: unmet`: like a
`safety` row, one gap reads unmet whatever strengths sit beside it.

`decide.category` on an `instrument` row may be a **list**: categories one scanner
must hold jointly (`d-fresh-clone-runs` needs both `install` and `build`). A
finding in any listed category joins the population; the row reads met only when
every listed category is met by the single-category rules, so one member scanned
clean and the other not scanned reads not-measured. An empty list is rejected.

The instruments that decide rows:

- An external instrument decides the rows its adapter's `decides:` names
  (`CLAUDE.md` rule 7); the secret scan decides `d-secrets-out-of-history` that way,
  and the static-analysis instrument `d-untrusted-input-checked` (#232): any hit of its
  vendored taint rules reads it unmet, a run beside a positive control that fired with
  none reads it met, and a tree with no file in a language the rules read reads
  not-applicable on its `no-input` fact.
- `fresh-clone` (`map/fresh-clone.mjs`, contract §3b): install, build, lint,
  typecheck, test and migrate from a clean checkout, once per workspace in a
  monorepo, and the README's commands replayed. It decides `d-fresh-clone-runs`
  (`[install, build]`), `d-tests-execute-core` (`test`),
  `d-lint-typecheck-gate` (`[lint, typecheck]`) and `d-schema-versioned`
  (`migrate`; with no database signal anywhere in the tree the requirement reads
  **not-applicable**, decided from fresh-clone's own `no-database-signal` fact,
  never met by silence; a database signal with no migrate step declared reads
  unmet).
- `dependency-scan` (`map/dependency-scan.mjs`, contract §3c): `npm audit` over
  every lockfile. `d-dependencies-known-clean` decides on the `critical` category
  alone, so high and lower advisories do not unmeet it. A manifest with real
  dependencies and no lockfile covering it (npm, pnpm, or yarn — zero lockfiles
  audited is never clean) reads **not-measured**, "no lockfile: nothing to
  audit"; no `package.json` anywhere in the tree reads **not-applicable** — there
  is no dependency graph to speak of.
- `repo-census` (`map/repo-census.mjs`, contract §3d), from the tree alone: an
  architecture page, a present-tense agent contract, a runbook, a CI gate on the
  default branch, and six **owner-evidence transcripts** for what a repository
  cannot show by itself (a restore, a rollback, a one-command deploy, a smoke
  check on the deployed app, a monitor that alerted a person, cost alerts). The
  transcript format is `owner/evidence/README.md`. A tree with no deployment
  signal anywhere (contract §3d) reads the six transcript rows
  **not-applicable** — nothing is deployed to prove — never met.
- `structure-scan` (`map/structure-scan.mjs`, contract §3e): how the code is built
  to be changed, on the `code-maintainability` topic. It decides
  `d-no-drifting-duplicates` (`duplicate`: no clone pair of 50 tokens or more,
  the threshold the row states) and `d-no-dead-code` (`[unused, stale-artifact]`:
  no unused dependency, no unused file, export, type or member where the target
  configures knip, and no tracked file named as abandoned). knip finds entry
  points from the manifest and its plugins and cannot see a module reached by
  path (a command table of module paths), so without a knip configuration
  (`knip.json`, `knip.ts`, … or a `knip` key in `package.json`, recorded as
  `tools.knip.config`) its unused files, exports, types and members stay rows,
  flagged `detail.unconfigured: true`, and the row's `decide.excluding:
  unconfigured` sets them aside (#121); an unused dependency decides it either
  way.
  A pass that was skipped or failed reads its row **not-measured** on its own
  `duplicate-not-run` / `unused-not-run` fact, with the reason (knip runs only
  under `--allow-exec`, so in the routine's gate job `d-no-dead-code` reads
  not-measured unless a stale file is found); a tree with no `package.json`
  reads `d-no-dead-code` **not-applicable** on `unused-not-applicable`, unless a
  stale file is found. `d-one-home-per-fact` keeps the docs half as a claim.

Prose is never read. An observation that mentions a topic is not a measurement.
Census names are accepted as a list per requirement; a new run uses the first.

## The packet: a repository's own claims

A repository that states its own claims keeps a **packet** — `/owner/PACKET.md`
is the one home of its format (`packet/manifest.yaml`, validated by
`node assay.mjs validate-packet`) and of how a packet's claims and a run's
measurement are read together, compared, never merged. `basis: run | owner` on
every row in `yardstick.yaml` says which decided it this run; a claim the run
contradicts lands in `yardstick.yaml`'s `contradictions:` list, never silently
overwritten.

## Running it

```sh
node assay.mjs measure <run>                       # the table
node assay.mjs measure <run> --write                # yardstick.yaml
node assay.mjs measure <run> --packet <dir> --write  # + a repository's own packet
node assay.mjs compile <run> [--packet <dir>]        # measures, then writes every view
```

`requirements.yaml` is validated on load (closed kinds, tiers, topics, tags,
facet rules; every row sourced), and the harness pins each decider's behaviour on
a synthetic map.

## Known answers: grading the measurement on the fixtures

`node assay.mjs score` grades the **map** against a fixture's planted items; a
fixture's sheet (`ANSWERS.yaml`) can also carry the status the **measurement** of a
run over that target should read, so a change to a decider, a tier or a topic that
moves a fixture's status is caught (#18):

```yaml
requirements:                    # requirement id → the status a run should read
  - id: d-secrets-out-of-history
    status: unmet                # met | unmet | mixed | not-measured | not-applicable
    reason: "P-01: a backup-service API key is hardcoded in config/settings.mjs."
```

- Each entry states what the target **is**, tied to an item on the same sheet, read
  through the requirement's own `check:`; never copied from a run's output. The
  sheet is the floor, not the ceiling: a requirement it does not answer is not graded.
- **Claim rows read `not-measured` from a run alone, never met.** Every claim-kind
  row is graded with that expectation whether the sheet lists it or not, and a sheet
  that answers one anything else is refused.
- A sheet naming a requirement the yardstick does not carry, a status outside the
  five, an id answered twice or an entry with no reason is refused, never graded.
- Each answer grades **agree**, **disagree**, or **out of scope**: the row reads
  `not-measured` because its deciding method did not run (an instrument the run
  record marks skipped or failed, or a census no run authored), the same scope rule
  `score` applies to a planted item. A facet row is always in scope.

`score` prints the grade (expected vs measured per requirement) beside recall, and
`--json` carries it as `requirements`; the exit code stays recall's verdict. The
harness (`tests/blocks/yardstick-known-answers.mjs`) grades the stored fixture runs
and pins each one's agree / disagree / out-of-scope counts and its disagreeing ids
in `tests/golden.json` under `<run>/requirements`, as `_score` pins recall: a known
disagreement is pinned in plain sight, and any move is a reviewed re-bless.

## Comparing two measurements: `since` and `ratchet`

`compare.mjs` is the pure core both of the below build on: `compare(previous,
current)` over two documents shaped like `yardstick.yaml`
(`{ version, requirements: [{ id, status, basis, findings, note }] }`), classifying
every requirement id present on either side as `improved`, `regressed`,
`unchanged`, `newly-measured`, `no-longer-measured`, or `yardstick-only` (present
on only one side — the yardstick itself changed). The order `met > mixed > unmet`
is total; `not-measured` and `not-applicable` are both deliberately **off** that
scale (neither is a better or worse verdict — one is "we don't know yet", the
other "this was determined not to apply"), so a status leaving the ranked scale
either way reads `no-longer-measured`, and a status arriving onto it from either
off-scale status reads `newly-measured` — never `improved`, never `unchanged`. A
transition **between** the two off-scale statuses themselves (`not-measured` ↔
`not-applicable`) is the one coarsening this accepts and reads `unchanged`
(neither side is on the ranked scale for the other to have moved on); the actual
statuses still render correctly everywhere, since every renderer reads
`previous.status` / `current.status` off the row, never the classification label
alone. A yardstick version difference between the two sides is reported on
the result, never hidden. `compare.mjs` also exports `fingerprintFinding` /
`compareFindings`, a **finding**-level match across two runs for the `since` view
below — never by `id` (a finding's id carries no meaning across independent runs,
`map/SCHEMA.md` §3), but by `(scanner, dimension-or-native-category, polarity, evidence
file paths with the line stripped)` — a check that passed last run and gaps now
is a new finding. A collision on that key is a known, accepted
coarsening (the same one `map/variance.mjs`'s own identity tokens accept); it
fails toward under-reporting "new", never toward inventing one.

### `since`: what changed between two runs

```sh
node assay.mjs since <run> --previous <prev-run>        # writes views/since.yaml + SINCE.md
node assay.mjs compile <run> --since <prev-run>          # compiles every other view too
```

Reads both runs' `yardstick.yaml`, plus the previous run's map measured by this
engine (`projectRun`), through `compare()` for the requirement-level story, so a
rule that changed between engines reads re-ruled, never as a move of the
repository (#183). It reads both runs' findings through `compareFindings()` for
which findings are new since the previous run and which are no longer found, apart
from the scanners that ran in only one of the runs. The schema and page are
documented in `views/README.md`, the one home of the Since view's shape. Compile
with no `--since` writes neither file.

### `ratchet`: a baseline can never quietly regress

```sh
node assay.mjs ratchet <run> --baseline <baseline.yaml> [--write-baseline <file>]
node assay.mjs ratchet <run> --baseline-ref <git-ref> --repo <dir> [--write-baseline <file>]
```

`--baseline` reads the baseline from a file on disk; `--baseline-ref` reads it
from a git ref instead — `git show <ref>:packet/baseline.yaml` in the
repository named by `--repo` — never from the working tree. That second form
is what a pull request is graded against: the change under review could edit
its own `packet/baseline.yaml` on disk, and a gate that read that copy would be
a gate the change itself could switch off. `routine/run.mjs` picks the form:
a pull request (a `--base-ref` was given) always ratchets against the base
ref's copy; a schedule or manual run ratchets against the working tree's
committed copy, because that IS the accepted state there (`routine/README.md`).

A **baseline** is a small, reviewed, GENERATED-then-committed file — `ratchet
--write-baseline` writes it from a run's current measurement; a named steward
reviews it and commits it themselves, never the command (`routine/README.md`).
Its format, documented here as its one home:

```yaml
baseline: 1                      # format version
yardstick: 0                     # the requirements.yaml version these rows speak to
accepted:
  date: 2026-09-28
  by: steward                    # a role, never a name (same convention as owner/PACKET.md)
commit: <7-40 hex, or "">        # the target commit the baseline describes, filled by the reviewer
requirements:                    # every requirement id, its status and basis AT ACCEPTANCE
  - id: d-secrets-out-of-history
    status: met
    basis: run
```

`ratchet` reads the baseline as `compare()`'s `previous` side and the run's own
`yardstick.yaml` as `current`, then fails (exit 1) when a requirement the
baseline recorded `met` or `mixed` is now worse or `no-longer-measured`, or when
a baseline requirement is absent from the current measurement entirely (the
yardstick itself dropped or renamed it — nothing there to hold any more). A
baseline row recorded `unmet` or `not-measured` never fails the ratchet — there
is nothing held to lose. `not-applicable` is never a failure either direction: a
baseline row that **was** `not-applicable` never fails regardless of what it
becomes now (it was never held — not-applicable is not `met`/`mixed`), and a
held row that **becomes** `not-applicable` (a requirement that stops applying)
is reported, not a regression — both land in the `changed` list rather than
`failures`, printed on their own line. The one exception is an **owner** row
(`basis: owner` in the baseline or now): a packet claim, not the map, can say
`not-applicable`, so a held owner claim that becomes `not-applicable` fails
like `no-longer-measured` — otherwise a change could release its own claim by
editing one line of its packet. Every failure line names the
requirement, its title, its before → after, and the current finding ids behind
it when the row carries any. Exit 0 prints a one-line `held N, improved M,
changed (not-applicable) K` summary plus the improved and changed rows, and
suggests locking improvements in with `--write-baseline`. Exit 2 — never 0 —
on a missing or unreadable run, baseline file, or (with `--baseline-ref`) git
ref/repository, on a value flag given no value, and on a ref beginning with
`-` (never handed to git, which would read it as an option).
`--write-baseline` refuses to write from a run that fails its own gate
(exit 1): a regressed or contradicted measurement is never accepted.

`ratchet` also fails (exit 1) whenever the run's own measurement carries any
**contradiction** — a repository's own packet claimed a requirement
`satisfied` and this run found the mechanism absent (`yardstick.yaml`'s
`contradictions:` list, `measureRun`'s own output above). This check runs
**every time**, with or without a baseline: a claim the run itself disproves is
always a failure under stewardship, never something a flag can wave through —
there is no `--allow-contradictions`. Each failure line names the requirement,
that the owner claimed it satisfied, and what this run found instead.
