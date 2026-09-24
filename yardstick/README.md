---
type: doc
title: "yardstick/ — the requirements, and the measurement of one map against them"
---
# yardstick/

`requirements.yaml` holds the **requirements**: what must be true of a repository
somebody stands behind, stated without naming a stack, each with the mechanism
that **decides** it from a map. `measure.mjs` measures one run's map against them
and writes `yardstick.yaml`: per requirement, `met`, `unmet`, `mixed` or
`not-measured`, with the finding ids and a note saying how it was decided. Every
view reads that file and nothing else to decide a requirement.

A repository may also state its own **claims** per requirement (the format is
below). Claims and a run's measurement are compared, never merged: a claim the
run contradicts is a finding.

## The rows

| Field | Meaning |
|---|---|
| `id` | `d-<slug>`, the public namespace. A team's private requirements carry their own prefix in their claims file and join this one when a second team needs them |
| `title` | the requirement, one sentence, no stack in it |
| `tier` | the order to fix things when taking a repository on, which is also the order of irreversibility: custody, safety, reproducibility, verification, legibility, operability (the file's `tiers:` list) |
| `topic` | what part of the code it is about: an axis of the roster (`map/project.mjs`), or custody, reproducibility or operability, which no scanner measures as an axis. Improve groups by topic |
| `tags` | which view reads it: `floor` (Intake: the bar for taking a repository on), `fleet` (Maintain: what a steward's routines read), `ai-operating` (the model-call layer) |
| `decide` | the deciding mechanism, one of four kinds below |
| `check` | the proving check: what shows the requirement met |
| `sources` | where the row was extracted from, as `<kind>/<slug>`: `floor/` a takeover floor, `manifest/` a template's guarantee manifest, `foundation/` a foundation template's rules, `takeover-eval/` and `template-eval/` evaluations of real repositories (never named), `method/` this method, `scanner-candidates/` the scanner roster, `issue/` an assay issue. Every row has one: requirements are extracted from practice, not designed |
| `status` | draft, stable or deprecated: the row's own lifecycle |

## The four deciding kinds

| Kind | Decided from | Reads |
|---|---|---|
| `facet` | the effect and capability facets the finding schema forces (`map/doctrine.mjs`) | met or unmet with the population; not-measured when the map has no effects |
| `census` | an authored, enumerated population in the run's `map/censuses.yaml`, by measure name | met (all), unmet (none), mixed (some), with `met of N`; not-measured when no census of that name ran |
| `instrument` | a scanner's rows, gated by the run record and, for a peer scanner, its coverage file | unmet on gap rows; met when an instrument ran clean or a peer scanned the domain with no gaps; not-measured when skipped, failed or not scanned, **with the recorded reason** |
| `claim` | nothing in a run | always not-measured from a run: only the owner can decide it (the Intake view says `decided_by: owner`). The claim rows are the list of instruments still to build |

`decide.category` on an `instrument` row may be a **list**: categories one scanner
must hold jointly (`d-fresh-clone-runs` needs both `install` and `build`). A
finding in any listed category joins the population; the row reads met only when
every listed category is met by the single-category rules, so one member scanned
clean and the other not scanned reads not-measured. An empty list is rejected.

The instruments that decide rows:

- `gitleaks`: secrets in the tree and its history.
- `fresh-clone` (`map/fresh-clone.mjs`, contract §3b): install, build, lint,
  typecheck, test and migrate from a clean checkout, once per workspace in a
  monorepo, and the README's commands replayed. It decides `d-fresh-clone-runs`
  (`[install, build]`), `d-tests-execute-core` (`test`),
  `d-lint-typecheck-gate` (`[lint, typecheck]`) and `d-schema-versioned`
  (`migrate`; with no database in the tree there is no migrate row and the
  requirement reads met).
- `dependency-scan` (`map/dependency-scan.mjs`, contract §3c): `npm audit` over
  every lockfile. `d-dependencies-known-clean` decides on the `critical` category
  alone, so high and lower advisories do not unmeet it.
- `repo-census` (`map/repo-census.mjs`, contract §3d), from the tree alone: an
  architecture page, a present-tense agent contract, a runbook, a CI gate on the
  default branch, and six **owner-evidence transcripts** for what a repository
  cannot show by itself (a restore, a rollback, a one-command deploy, a smoke
  check on the deployed app, a monitor that alerted a person, cost alerts). The
  transcript format is `owner/evidence/README.md`.

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
