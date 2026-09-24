---
type: doc
title: "registry/ — the descriptor register and the descriptor projection"
---
# registry/ — the descriptor register

`descriptors.yaml` is the **register**: one row per *descriptor*, a requirement
that must be true of a repository somebody stands behind, stated stack-neutrally,
with the mechanism that **decides** it. It is the vocabulary two things share:

- a **sidecar** — a repository's own claims, per descriptor: satisfied by which
  mechanism here, not applicable with a reason, or open (format: the next section);
- a **run** — assay's verification: `tools/descriptors.mjs` projects a findings
  base onto the register and writes `eval/view-descriptors.yaml`, per descriptor
  `met | unmet | mixed | not-measured` with the finding ids and the mechanism.

The two are compared, never merged: a claim the run contradicts is the finding.

## The rows

| Field | Meaning |
|---|---|
| `id` | `d-<slug>`, the public namespace. A team's private descriptors carry their own prefix in their sidecar and never enter this file until a second team needs them |
| `title` | the requirement, one sentence, no stack in it |
| `tier` | custody · safety · reproducibility · verification · legibility · operability, the order the work is done, which is also the order of irreversibility |
| `tags` | `floor` (the takeover bar: risk), `fleet` (operability at scale: what a steward's routines read), `ai-operating` (the model-call layer) |
| `axis` | the axis roster family the descriptor belongs to, when one exists; absent for custody and operability rows the roster never carried |
| `decide` | the deciding mechanism, one of four kinds below |
| `check` | the proving check an outcomes sheet would carry |
| `sources` | where the row was extracted from (a takeover floor, a fleet contract, a template's guarantee manifest, a foundation template's rules, a takeover evaluation, this method). Every row has one: the register is extracted, not designed |
| `status` | draft · stable · deprecated, the register's own lifecycle |

## The four deciding kinds

| Kind | Decided from | Reads |
|---|---|---|
| `facet` | the effect and capability facets the schema forces (`doctrine.mjs`) | met / unmet with the population; not-measured when the base has no effects |
| `census` | an authored enumerated population in `maturity-inputs.yaml`, by measure name | met (all), unmet (none), mixed (some), with `met of N`; not-measured when no census of that name ran |
| `instrument` | a scanner's rows, gated by the run manifest and, for a peer scanner, its coverage sidecar | unmet on gap rows; met when the scanner ran clean (an instrument) or scanned the domain with no gaps (a peer); not-measured when skipped, failed, or not scanned, **with the recorded reason** |
| `claim` | nothing in a run | always not-measured from a run; only a sidecar asserts it. The list of `claim` rows is the register's instrument backlog |

`decide.category` on an `instrument` row is usually one native category, but may
be a **list** — two rows one instrument decider must hold jointly (fresh-clone's
`d-fresh-clone-runs` needs both `install` and `build`; `d-lint-typecheck-gate`
needs both `lint` and `typecheck`). A finding in **any** listed category joins the
population the row decides from; the row reads **met** only when **every** listed
category is independently met by the same rules a single category uses — one
member scanned clean and the other not-scanned is `not-measured`, never met.
`validateRegistry` requires the list to be non-empty; an empty list names nothing
and is rejected the same as a missing category.

Adopted instruments the register can decide by: `gitleaks` (secrets) and
`fresh-clone` (`tools/fresh-clone.mjs`, scanner-contract §3b — install / build /
lint / typecheck / test / migrate from a clean checkout plus README claim replay,
now workspace-aware: an npm-workspaces root runs the same step plan once per
workspace, in addition to the root, and a workspace's gap rows carry its path in
`native_id` and evidence, #127). Four of the fresh-clone rows the floor asked for
are re-kinded onto it: `d-fresh-clone-runs` (`category: [install, build]`),
`d-tests-execute-core` (`category: test`), `d-lint-typecheck-gate` (`category:
[lint, typecheck]`), and `d-schema-versioned` (`category: migrate` — with no
database signals anywhere in the tree the runner emits no migrate row, so the row
reads met: nothing to migrate). `d-readme-true` stays `census` (`measures:
[doc-freshness]`) — the README-claim mechanism is the same fresh-clone run, but
the row is decided as a census, not this instrument, and is out of scope for this
re-kind.

Prose is never read. An observation that merely mentions a topic is not a
measurement; the first prototype of this projection term-matched observation
text and turned a "single authored bookkeeping contract" into a met bus-factor
row. Census names are accepted as a list per descriptor because past runs never
closed that vocabulary; new runs use the first name listed.

## The sidecar (v0, format only)

A repository that carries its claims keeps `packet/manifest.yaml`:

```yaml
registry: 0                       # the register version claimed against
namespaces: [assay]               # plus any team prefix the sidecar uses
supplements: [<name>]             # the prescriptions this repo inherits
claims:
  - id: d-effects-gated
    state: satisfied              # satisfied | not-applicable | open
    by: core/workflow halts + audit in one transaction
  - id: d-backup-restore-exercised
    state: open
```

The self-check a repository runs in its own CI against this file, and the
verification file a run writes beside it, are the next step; this version
defines the vocabulary they share. The shape descends from a template's
guarantee manifest whose one rule carries over verbatim: never let presence
impersonate enforcement.

## Running it

```sh
node tools/descriptors.mjs <run-dir>            # the table
node tools/descriptors.mjs <run-dir> --write    # eval/view-descriptors.yaml (generated)
```

The register is validated on load (closed kinds, tiers, tags, facet rules; every
row sourced) and the harness pins the deciders' behavior with a synthetic base.
The axis projection is untouched; this is a second projection beside it until a
versioned release makes it the lead.
