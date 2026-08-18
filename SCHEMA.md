---
type: doc
title: "repo-eval — findings schema & run layout (authoritative)"
---
# repo-eval SCHEMA — the format contract

This is the **authoritative** specification of the repo-eval evidence base: the
finding schema, the controlled vocabularies, the id allocation, the run
directory layout, and the security view's machine-readable stage tail. `METHOD.md`
references this file rather than embedding the schema, and `tools/validate.mjs`
enforces it mechanically — so a run is *generate → validate (red/green) → compile*,
never "open the last run and match conventions by eye."

Why a pinned format at all: comparability across runs and re-runs depends on closed
vocabularies and stable ids (a later run diffs "still open?" by id). The format is
the interop surface between passes, between analysts, and between a run and its
tooling — the format-as-contract principle, made deterministic by the validator (determinism,
deterministic gates).

---

## 1. The finding (one object per list item in `eval/findings-NN-*.yaml`)

Lean neutral core, with facets attached only when the `subject_type` requires them.

```yaml
- id: F-023                    # F-### ; unique across the run; no dimension meaning (§3)
  dimension: delegation        # closed vocab §2
  polarity: gap                # strength | gap | fact   (views read this oppositely)
  subject_type: effect         # effect | control | artifact | contract | process | capability
  observation: >               # ONE grounded sentence — the fact, not the interpretation
    The agent sends email as the user with no draft/confirm step.
  evidence: [path:line, path:line]     # MANDATORY, non-empty; repo-relative to the TARGET repo
  confidence: confirmed        # confirmed | plausible | unverified
  # ── facets (conditional-required — see §4) ──
  effect:                      # REQUIRED iff subject_type == effect
    channel: gmail-send        # free short slug (not a closed vocab)
    reversibility: irreversible   # reversible | reversible-with-window | irreversible
    external: true                # does the effect leave the trust boundary? (bool)
    gate_type: none               # deterministic-halt | staged-reversible | scope-bound |
                                  #   rate-throttle | disclosure-only | external-halt | none
    fail_mode: closed             # open | closed — REQUIRED iff gate_type != none
    telemetry: unstructured       # none | unstructured | structured-event | audited
    blast_scope: tenant           # user | tenant | fleet | cross-tenant
  capabilities:                # REQUIRED iff subject_type == capability (all three bools)
    untrusted_input: true
    private_data: true
    external_effect: true
  label: "control of every workspace"  # optional short human name; the chain view renders
                                        # it verbatim (entry / sink / cut). See §6d.
  # ── optional links (all values are F-### ids, except preconditions) ──
  preconditions: [prompt-injection]   # closed vocab §2; attacker requirement(s)
  reaches: [F-055]             # findings reachable from here in one context (the chain graph)
  explained_by: [F-090]        # links UP to a systemic finding (feeds fan-out + chain cuts)
  escapes: [F-081]             # strength-finding ids whose containment this effect pierces
```

**Mandatory keys on every finding:** `id`, `dimension`, `polarity`,
`subject_type`, `observation`, `evidence` (non-empty), `confidence`.

**Optional keys:** `preconditions`, `reaches`, `explained_by`, `escapes`, `label`,
the two facets (which become mandatory under §4), and the **overlay** fields
`axis` / `also_axes` / `source` (§2a).

### 2a. Overlay layer (optional; the axis projection)

A finding may carry its projection onto the engine's flat **axis roster** —
written directly, or derived by a per-scanner adapter (usually the adapter maps
the finding's native category; the finding need not carry an axis itself). Axes
are **property-named and shared**: every scanner — the native seven-dimension
method included — contributes axes through its adapter's `contributes:` list, and
any scanner may feed an axis it does not contribute, so two scanners measuring
one property corroborate on one axis. **These fields are optional and
backward-compatible**: a pre-overlay base carries none, and the validator only
checks them when present. The projection gate (fail-closed) is what lets several
scanners report into one coherent set of axis profiles; the full contract,
adapter format, and fail-closed rule live in `integration/scanner-contract.md`.

```yaml
axis: code-correctness               # a contributed axis (the roster is adapter-derived)
also_axes: [delegation]              # optional compound cross-links (a finding touching >1 axis)
source: deep-code-review             # which scanner produced it (repo-eval for native passes)
```

A finding's `also_axes` place it in every section it truly touches (the seam is
first-class, not collapsed). Adapters declare which axes they `contributes:`, so
coverage is a capability, not a count — an axis no present scanner contributes
reads "not measured", never "clean". **Grandfathered:** findings frozen under the
retired five-domain model carry `domain:` / `also_domains:` / `foundation:`; the
first two translate mechanically (`project.mjs` `LEGACY_DOMAIN_AXIS`), the third
is ignored, and none of the three appears on a new finding.

The `reaches` graph is not decoration: `tools/chains.mjs` walks it from every
capability that holds untrusted input to the unguarded effects it can drive, and the
report leads with those chains, **computed and ranked, never authored** (§6d). Draw the
edge wherever an injected instruction at one finding could drive another — that factual,
evidence-backed edge is what makes the lead risk deterministic.

---

## 2. Controlled vocabularies (CLOSED — the validator rejects any other value)

| Field | Allowed values |
|---|---|
| `dimension` | artifact-legibility · context-economy · deterministic-gates · verification · delegation · improvement-loop · multiplayer · **unprompted** |
| `polarity` | strength · gap · fact |
| `subject_type` | effect · control · artifact · contract · process · capability |
| `confidence` | confirmed · plausible · unverified |
| `reversibility` | reversible · reversible-with-window · irreversible |
| `gate_type` | deterministic-halt · staged-reversible · scope-bound · rate-throttle · disclosure-only · external-halt · none |
| `telemetry` | none · unstructured · structured-event · audited |
| `blast_scope` | user · tenant · fleet · cross-tenant |
| `fail_mode` | open · closed |
| `preconditions` | prompt-injection · stolen-credential · malicious-dependency · network-position · insider · zero-day · physical |
| `axis` (overlay, optional) | open by design — any axis a present adapter `contributes:` or maps to (the seven native dimension axes; deep-code-review adds code-correctness · code-security) |

`channel` (inside `effect`) is a free short slug, deliberately **not** closed — it
names the concrete effect surface.

**Channel granularity (one finding per channel, so the effect count is
reproducible).** Emit **one `effect` finding per distinct channel-slug**, where a
channel is *the authored function or CLI the agent invokes* (the invocable surface from
the terrain's channel candidates), not each underlying call site and not a bundle of
several. Two runs that split "Google Workspace" into `gmail-send` + `drive-write` vs.
merge it into `google-workspace` produce different effect counts — and the effect count
is a maturity denominator, so the number moves without the facts changing. The rule: if
the agent invokes it as one command/function, it is one channel; if two commands with
different reach/reversibility, two channels. Pick the invocation boundary, not the API
boundary, and the count is the same every run.

**Precondition → difficulty** (the anti-alarm dial, used by the security view, not the
base): prompt-injection = trivial; stolen-credential / malicious-dependency = moderate;
network-position / insider = hard; zero-day / physical = exotic.

**Canonical dimension for a cross-cutting fact (same fact, same dimension every
run).** Some facts could plausibly sit in two dimensions; assign by the fact's *primary
nature*, not by which pass happened to surface it, so it lands identically across runs:

| The fact is about… | dimension |
|---|---|
| an effect firing, its gate, credential boundary, blast, or the trifecta | `delegation` |
| whether an effect can *prove it happened* / effect-vs-report / a success-on-failure seam | `verification` |
| a test/CI/typecheck/lint, or a schema/contract that fails loud at an interface | `deterministic-gates` |
| whether rationale reconstructs from files | `artifact-legibility` |
| whether a bounded context loads fast / module coupling / doc freshness | `context-economy` |
| whether corrections compound (a lesson → a durable mechanism) | `improvement-loop` |
| a seam no criterion asked for that fits none cleanly | `unprompted` |

Worked case: the false-green cron guard (a job reports success without the effect) is
`verification` — it is about proving the effect, even though the delegation pass may notice
it. Put it in `verification` every time.

**Canonical descriptors — decide once, not per run.** Two descriptors are *identity*
across runs (the cross-run diff and `variance.mjs` align findings by them), so they must not be
re-chosen each sweep:

- **Channel slug.** The terrain assigns one fixed slug per effect channel (in its effect
  inventory); authoring draws the slug from the terrain, never invents one. Without this,
  the same channel is `github-app` in one run and `github-push` in another — the count is stable
  (13) but the name is not, so nothing lines up by name.
- **Census `subject_type`.** Each census population has ONE canonical `subject_type`, fixed here
  and in §6b, not chosen per run: an effect-provability item is a `control`; a gate/test-coverage
  item is a `contract`; a decision-legibility item is an `artifact`; a bounded-context item is an
  `artifact`; an incident/lesson item is a `process`. A whole census that flips descriptor between
  runs (cal5 tagged its gates census `contract`, cal6 `control`) reads as 100% variance on that
  dimension despite identical facts. Pick the value from this list and hold it.

---

## 3. Id allocation (no dimension bands)

Ids are `F-###`, **unique within a run and carrying no dimension meaning.** A finding's
dimension lives in its `dimension:` field, backed by the **filename ↔ dimension** check
(a `findings-03-gates.yaml` finding must be `deterministic-gates` or `unprompted`). The id
number is just an address; it does not encode the dimension, and there is **no per-dimension
budget, no ceiling, and no re-homing to satisfy a band.**

The id encodes no dimension because a fixed per-dimension range is an arbitrary budget a
dense repo overflows, and encoding the dimension in the number would only duplicate the
`dimension` field — ids are renumbered across independent runs anyway, so "read the dimension
off the number" was never reliable. The field is the single source of truth; the validator
enforces it via filename↔dimension.

**Allocation.**
- *Single-context run:* allocate sequentially, `F-001, F-002, …`, in pass order.
- *Parallel run (agents authoring in different files at once):* give each pass file a
  disjoint starting offset purely to avoid collisions while authoring (e.g. 50 or 100 apart)
  — this is a **dispatch convenience, not a schema constraint**, it has no ceiling, and it
  carries no dimension meaning (a collision is renumbered freely; the validator enforces only
  global uniqueness). Or author pass-local and let the merge assign final ids.
- The only hard rules the validator enforces: every id is a well-formed unique `F-###`, every
  `reaches`/`explained_by`/`escapes` resolves, and filename↔dimension holds.

**`unprompted`** is a first-class dimension for a seam-finding no criterion asked for; a
finding with `dimension: unprompted` may live in any `findings-NN-*.yaml` file and takes an
ordinary id (no special range). It is identified by its field, like everything else.

**Existing runs are grandfathered.** Runs authored under the old banded scheme keep their ids
(they are still valid unique `F-###`); nothing is renumbered (same precedent as the frozen
`i-NNN` insight block and the V1 tag — a retro-renumber rewrites history for cosmetics). New
runs allocate as above.

---

## 4. Conditional-required rule (load-bearing)

- `subject_type: effect` ⟹ the `effect` facet is **mandatory**, and within it
  `channel`, `reversibility`, `external`, `gate_type`, `telemetry`, `blast_scope` are
  all required. `fail_mode` is additionally required **whenever `gate_type` is not
  `none`** (a real gate must declare how it fails).
- `subject_type: capability` ⟹ the `capabilities` block with all three booleans
  (`untrusted_input`, `private_data`, `external_effect`) is **mandatory**.
- `escapes` is optional but the security view weights it heavily — attach it to any
  effect whose damage leaves a containment the base records elsewhere as a strength.

This guarantees the halt-and-observability inventory is complete: an effect cannot be
recorded without answering *what stops it, does it leave a trace, and how far does its
damage reach.*

---

## 5. Run directory layout (canonical)

A run directory is named `<slug>-<YYYY-MM-DD>/`. **Where it lives follows the
three-home rule: a run lives with its subject; a fixture lives with its instrument.**

- **Runs live with their subject** — a `runs/<slug>-<date>/` directory inside the
  evaluated repository (assay copied into the target) is the target's own record.
  A separate collection of runs is fine too; the layout below is what matters.
- **Calibration sets and frozen regression pins** — immutable copies under a
  `tests/fixtures/` directory, kept separate from any confidential run data.

A run contains:

```
runs/<slug>-<date>/
├── eval/
│   ├── 00-terrain.md               # Pass 0 — map + effect inventory + slice plan
│   ├── findings-01-legibility.yaml # Pass 1  ┐
│   ├── findings-02-context.yaml    # Pass 2  │ one file per dimension pass,
│   ├── findings-03-gates.yaml      # Pass 3  │ each a YAML list of findings,
│   ├── findings-04-verification.yaml # Pass 4│ ids unique per run (§3)
│   ├── findings-05-delegation.yaml # Pass 5  │
│   ├── findings-06-improvement.yaml# Pass 6  │
│   ├── findings-07-multiplayer.yaml# Pass 7  ┘ (absent in pre-taxonomy runs)
│   ├── findings.yaml               # merged base (all passes; validator's primary input)
│   ├── view-leverage.md            # view — faster/better opportunities
│   ├── view-maturity.md            # view — capability ladder
│   ├── view-security.md            # view — ALWAYS-ON; posture + gate
│   ├── view-security-gate.yaml     # §6 — the security view's machine-readable stage tail
│   ├── maturity-inputs.yaml        # §6b — authored depth / censuses / earned flags
│   ├── censuses.md                 # §6b — census appendix: per-census method + item list
│   ├── view-maturity-grades.yaml   # §6b — GENERATED coverage (maturity.mjs --write)
│   ├── view-axes.md                # Pass 8.5 — the per-axis WALK (compile-axes.mjs)
│   ├── decisions.yaml              # OPTIONAL owner-triage overlay (decisions.mjs); absent = raw base
│   ├── report-prose.yaml           # the report's authored narrative (§6c)
│   └── AI-NATIVE-EVAL.md           # Pass 8 — internal meta-synthesis (operator-facing)
├── INDEX.md                        # Pass 9 — the package front door (compile-package.mjs)
├── handoff/                        # Pass 9 — machine/agent layer (compile-handoff.mjs), self-contained
│   ├── START-HERE.md               #          how to act; the sequence; what is/is not covered
│   ├── REMEDIATION.md              #          every remedy (scanner-verbatim | eval-authored, labeled) + claim-audit + proof
│   ├── FINDINGS.md                 #          the complete projected base: held/open/facts, verbatim + evidence
│   └── plan/NN-*.md                #          one session prompt per roadmap item + per uncovered High-and-above scanner item
├── MAINTAINER-REPORT.{md,pdf}      # Pass 9 — THE LEAD human deliverable (compile-report / render-pdf)
└── candidate-insights.md           # feedback hook — field evidence for framework capture
```

**Every `.md` in a run carries OKF frontmatter** so `npm run check` (the bundle
guardrail) passes. Minimum: `type: doc` plus a `title:`. Hand-authored eval docs
(`00-terrain.md`, `AI-NATIVE-EVAL.md`, `view-*.md`, `censuses.md`,
`candidate-insights.md`) are authored with it. The generated docs get it from their
tools: `compile-report.mjs` prepends it to `MAINTAINER-REPORT.md` (render-pdf renders
from the first `## `, so it never reaches the PDF), and `compile-handoff.mjs` writes
every handoff file with `type: doc` + **`confidential: true`** — honest (they carry the
target's full findings and evidence paths) and, per the guardrail's verbatim/confidential
exemption, what lets `START-HERE.md`'s intra-package links stay **relative** so the
handoff works when copied into the target repo. The shipped report partials
(`templates/*.md`) carry the same frontmatter and are frontmatter-stripped at splice time.

**`findings.yaml` is the merged base** — concatenate the per-dimension pass files in dimension
order under a run header (see `templates/findings.yaml`). Views and both syntheses read
`findings.yaml`; they never edit the base.

**Filename ↔ dimension agreement:** every finding in `findings-NN-<dim>.yaml` must carry
the matching `dimension`, except `dimension: unprompted`, which is permitted in any file.

---

## 6. View tails — the machine-readable sidecars the report compiles from

Severity and grade are **view judgments, not base facts** — the base states *what is*;
the views compute *how urgent* / *how mature*. So each view that feeds a computed report
element emits a small machine-readable sidecar alongside its prose (the only structured
artifacts a view produces). Two exist:

### 6a. `view-security-gate.yaml` — the security view's stage tail

```yaml
# view-security-gate.yaml — computed by the security view, read by tools/compile-report.mjs
gate: beta                      # the earliest stage anything blocks: alpha | beta | prod | clear
exposures:
  - name: fleet-email-abuse     # short slug for the exposure/chain (stable id)
    title: Fleet-wide email abuse   # human display name — what the report renders as the heading
    findings: [F-120, F-121]    # base findings this exposure is composed from
    blocks_stage: beta          # alpha | beta | prod | none
    who: authorized-real-user   # stranger-pre-auth | authorized-real-user | only-at-scale-or-adversarial
    what: irreversible external email, fleet brand/deliverability   # what's at stake (one clause)
    likelihood: high            # from precondition difficulty: trivial→high … exotic→low
    fix: >                      # the single next action (breaks_the_chain / leverage action)
      Add the owner|admin role gate the route already queries for; require recipients to
      belong to the org; add a per-user/day cap.
    unlocks: >                  # forward-leaning: what closing it advances
      Removes the last stranger-triggerable effect abuse; clears email off the beta gate.
```

Vocab for this file (closed, validator-checked): `gate` and `blocks_stage` ∈
{alpha, beta, prod, none/clear}; `who` ∈ {stranger-pre-auth, authorized-real-user,
only-at-scale-or-adversarial}; `likelihood` ∈ {high, moderate, low}. `findings` are
`F-###` ids that must resolve in `findings.yaml`. `title` is required: the report
renders it as the card heading, so it must be a human phrase, not a slug (the slug
stays in `name` as the stable id). Machine tokens (`who`, effect vocab) are translated
for the reader by `tools/display.mjs`; the YAML always keeps the closed vocab.

The four deployment stages (unchanged from METHOD.md §Security view): **alpha** =
reachable by anyone on the internet, demo data ok; **beta** = trusted testers on
live/real data; **prod** = open to strangers / at scale / adversarial. `blocks_stage`
= the *earliest* stage a chain makes unsafe (blocking one implies blocking all above).

### 6b. Maturity coverage — `maturity-inputs.yaml` (authored) → `view-maturity-grades.yaml` (generated)

Maturity is **measured coverage**, not rung words: every score is a fraction with a
denominator, so existence-somewhere never promotes a whole dimension. The model per
dimension:

- **coverage** — the share of a review-enumerated population meeting the dimension's
  bar. `kind: counted` (computed from base fields: `telemetry`, `gate_type`,
  `fail_mode`, the trifecta legs) or `kind: sampled` (from an authored census with
  `met`/`of`/`method` — n and method always stated, and the full item list with
  per-item verdicts + evidence recorded in `eval/censuses.md`, enumerate-before-assess
  so the sample cannot cherry-pick). A dimension with no measure yet
  carries `not_measured:` with the reason instead of a faked number. Every fraction is
  "M of the N the review enumerated", never "of the system".
- **depth** — one authored, judged sentence: how good the *best instance* is, with
  finding ids. Depth can be high while coverage is low; collapsing the two was the old
  inflation.
- **enforced / generative** — earned flags, `false` or `{claim: true, why, evidence}`.
  Enforced: the coverage is itself machine-checked, so a regression is caught
  automatically (e.g. CI runs the gates pre-merge). Generative: the system extends its
  own coverage by default, with AI in the loop. Both require cited evidence; both are
  expected rare.

**The split of authorship (determinism):** the eval authors
`maturity-inputs.yaml` (depth sentences, sampled censuses, flag claims);
`tools/maturity.mjs --write` computes every number and generates
`view-maturity-grades.yaml`. Never hand-edit the generated file — the validator
recomputes the counted measures from the base and **fails on drift** (the enforced
property, applied to this product itself). An `aggregate:` block pools the primary
measures of the measured dimensions; it is a labeled roll-up that moves whenever a new
area gains a measure — the per-dimension numbers are the stable truth.

**Census-augmented run mode (the determinism lever).**
A base sweep lets the analyst record "however many findings I noticed" in the
*observational* dimensions (legibility, context, verification, improvement), which is
where run-to-run finding-level variance concentrates (the effect layer was already
pinned to a fixed channel count by the channel-granularity rule). The census-augmented mode removes that
freedom: for each observational dimension, **enumerate the terrain's population and emit
one finding per item, met-or-not-met** — one per ADR (legibility), per bounded context
(context), per effect channel for provability (verification), per knowledge doc / lesson
(improvement) — with the item's own file as evidence and the census's canonical
`subject_type` (above). Measured on calibration pairs (a repeated run over one frozen
target), this roughly doubled fact-level repeatability and drove the previously
worst-varying dimensions close to full agreement.
The finding set becomes deterministic because both runs walk the same enumerated list and
cite the same per-item paths, rather than each noticing a different subset. Use this mode
when repeatability of the *findings* (not just the verdict) matters; a base sweep remains
fine for a one-off client read.

```yaml
# maturity-inputs.yaml (authored)
dimensions:
  - dimension: improvement-loop
    depth: >                          # judged; cite finding ids
      Where the loop exists it is real: two shipped incidents became permanent checks (F-081, F-082).
    # sampled:                        # optional — supplies coverage for uncounted dimensions
    #   - name: decision-reconstruction
    #     what: "non-obvious decisions reconstructable from files alone"
    #     met: 7
    #     of: 10
    #     method: "sampled 10 decisions listed in the census appendix"
    #     primary: true
    # enforced: { claim: true, why: "...", evidence: [F-044] }   # optional earned flag
```

Validator-checked: `schema: coverage` present (pre-coverage ladder files are rejected
with a regenerate hint); dimensions valid (§2); `pct` equals `met/of`; sampled
coverage states its `method`; counted numbers match recomputation from the base;
every dimension carries a `depth`; flags are `false` or evidenced claims.

### 6c. `report-prose.yaml` — the authored narrative + decision structure

The only free-form surface. It feeds both the PDF (`compile-report.mjs`) and the handoff
package (`compile-handoff.mjs`). Narrative is authored; findings and evidence paths are
spliced from the base, never retyped.

```yaml
target: "…"                 # full target name (masthead + doc titles)
target_short: "Acme"        # short name for running footer + prose + "{{APP}}"
maintainer: "…"
cover: false                # OPTIONAL, default false. false = the report opens on the
                            # dashboard front page (no "Executive summary" heading — the
                            # masthead names it: APP NAME big, "AI-Native Readiness Report"
                            # sub), so a shared PDF's thumbnail shows the compelling part.
                            # true = a plain title page (title + meta only) precedes it, for
                            # a formal leave-behind. The dashboard is ALWAYS one page.
exec_summary:               # the overview MAP. The front page leads with COMPUTED VISUALS
  scale: >                  # (no editorialized verdict line): the instrument panel first
    …                       # (defined-stat row · coverage bars · supervision bar · chips),
  strength: >               # then scale → maturity → gate as ONE unbroken narrative below.
    …                       # The whole front page MUST fit one page for any target regardless
  watch: >                  # of complexity — a hard max-height + zoom-fit enforce it, and the
    …                       # (the renderer owns that lever). Author scale/maturity/gate as
  maturity: >               # flowing paragraphs IN PLAIN LANGUAGE, strength/watch CHIP-LENGTH.
    …                       # Full maturity table with notes = body §1.
  gate: >
    …
operating: prod             # OPTIONAL, legacy: the level of use the app runs at today
                            # (alpha | beta | prod). No longer rendered — the levels-of-use
                            # runway was retired with the safe-to-run verdict; the appendix
                            # presents security exposures as illuminated risks. Kept only so
                            # older report-prose.yaml files still validate; new runs may omit it.
channel_notes:              # one per effect channel: the mechanism the descriptors can't name
  email-send:
    group: outward          # outward | data | read | ai  (sorts "What it can do" rails)
    what: "Sends real email … through Resend …"
strengths:                  # [{title, body}]
  - title: "…"
    body: >
      …
roadmap:                    # each item ALSO carries the decision structure the plan prompts use
  - slug: audit-logs        # the plan filename (handoff/plan/NN-slug.md)
    title: "…"
    body: >                 # the item summary (report §6 + plan "The item")
      …
    findings: [F-160, F-146]  # base ids the plan splices verbatim, with evidence paths
    questions:              # context the read-only eval couldn't see; the agent asks first
      - "…"
    options:                # the "how" decision — the agent presents, never chooses
      - name: "…"
        tradeoff: "…"
    done_when:              # verifiable closure, tied to finding ids the next run re-checks
      - "…"
roadmap_intro: >
  …
key_questions:              # [ "…" ] — folded into body §3 (the questions only your team can answer)
  - >
    …
```

Not validator-enforced (authored prose), but the compilers depend on the shape: `roadmap[]`
items need `slug` + `findings` for the plan files, and every `channel_notes` key must be an
effect `channel` value used in the run. `exec_summary` is the five-part map above (a flat
list or a string still renders, as a fallback, without the paired visuals).
`compile-handoff.mjs` enforces two of these fail-closed: a `roadmap[].findings` id absent
from the projected base halts the compile (drift — findings are spliced, never retyped),
and open gaps with an empty remedy sequence halt it (the machine-side false-green: a
handoff must never read "nothing to do" over live gaps). Roadmap items compile as
**eval-authored** remedies — the second, provenance-labeled voice beside scanner-verbatim
fixes — so a fix-free scanner's open gaps still sequence when the roadmap covers them.
A scanner-fix item whose findings a roadmap item fully covers is **absorbed** into that
authored card (which quotes the fix verbatim) rather than sequenced twice.

**Solution coverage — every unsupervised kind must be accounted for (validator-enforced).**
An *unsupervised kind* is an effect channel with an unguarded halt (irreversible or external,
no working gate) — the population the ES supervision bar counts. Each one must trace to a
remediation or a logged reason, or `validate.mjs` fails closed (the remediation-side analogue
of §6d's fail-closed discovery). Two authored fields close the gap:

- **`roadmap[].covers_channels: [channel-slug, …]`** (optional) — the *pattern-based* coverage.
  A composite fix (for example "put a staged halt on effects") closes a whole class of channels
  by its mechanism, beyond the specific findings it cites as evidence. `findings` is the fix's
  evidence and drives its plan file; `covers_channels` is its reach. A channel named here counts
  as fixed by that roadmap item.
- **`dispositions: [{channel, reason, note}]`** (optional, top-level) — the *explicit reason* a
  kind is deliberately not given a roadmap fix. `reason ∈ {accepted, deferred, out-of-scope}`;
  `note` is required (why). Use it for intake surfaces that are the agent's core function and
  are bounded by the trifecta rather than a per-call gate (web fetch, model inference), or a
  control that is real but out of the current roadmap's scope (supply-chain gating). A
  disposition for a channel that is *not* an unsupervised kind is a non-fatal warning (stale).

### 6d. Attack chains — computed, not authored (`tools/chains.mjs`)

The report's lead risk section (**"The main risks, start to finish"**) is **computed from
the findings graph**, nothing authored. `tools/chains.mjs` walks it:

- **entry** — a `subject_type: capability` finding with `untrusted_input: true` (where
  outside text meets the ability to act).
- **sink** — an effect the entry `reaches` that is an unheld halt (`isHalt`): irreversible
  or external, with no working gate. A guarded effect is not a sink — the chain is cut there.
- **path** — a minimax walk over `reaches`: the route whose *hardest* precondition is as
  easy as possible (the "easiest path's hardest step" rule, computed).
- **difficulty** — the hardest precondition on the path, ranked by a **single owned scale**
  in `chains.mjs` (`prompt-injection` easiest … `zero-day`/`insider`/`physical` hardest).
  Rendered as effort-to-trigger, colored so *easy = worse*.
- **reach** — the worst `blast_scope` at the sink (`fleet`/`cross-tenant` lead).
- **cut** — the gap-polarity control(s) whose failure enables it (`reaches` a sink, or a
  sink is `explained_by` it). This is the fix, derived.

Chains rank by **reach, then ease**, so the widest, easiest chain always leads — no tone,
no per-run judgment (determinism). Entry, sink, and cut render from each finding's
optional `label:` (a short human name), falling back to the channel's human label — so the
sentence stays plain without the model writing it.

**Honesty — the report never claims a chain does not exist, only that none was identified**
(the outputs-are-claims principle). `buildChains` returns four computed states:

- **live** — reaches an unheld halt (a real, open path). Ranked and rendered as the lead.
- **held** — reaches an effect, but every reachable one is currently held (guarded or
  read-only). Shown, with *what holds it*, because that control is load-bearing: if it
  weakens, the path opens. (E.g. a full-trifecta cron whose external call is read-only.)
- **contained** — an untrusted-input surface with `external_effect: false` (confirmed): a
  positive, grounded reason no chain can start there.
- **unresolved** — a chain-critical value that could not be determined: a low-confidence
  finding on a path, a sink we could not confirm is really open, or an effect leg with no
  traced reach (a possible missing edge). Surfaced under the chains as a one-line flag and
  folded into the questions section as items to resolve.

**Confidence propagates.** A chain riding a `plausible`/`unverified` finding renders as
*possible*, hedged, never asserted; an inferred sink is tagged. When there are no live
chains the headline is only what the review can stand behind — "**The report did not
identify a live attack chain**", not "none exists" — followed by the reached-but-limited
paths, each stated as *what the review found* (a control in the way), never as a guarantee.
The chains and the **Questions only your team can answer** open the report together in §3,
so the big items and the big unknowns lead with no jump; the `unresolved` values fold in
there as things to answer.

**Fail-closed discovery** (`validate.mjs`): an unheld-halt effect (a chain sink) **must**
state its `preconditions` — its difficulty is chain-critical and read-only-discoverable, so
absence is an eval defect, not a default. Genuinely-runtime unknowns (is signup open? does
the agent fetch unattended?) are *not* forced; they live as questions and, where they touch
a chain, as `unresolved` items.

---

## 7. What `tools/validate.mjs` enforces

Run: `node tools/validate.mjs <run-dir>` (exits non-zero on any
violation). It checks, and **fails closed** — an input it cannot parse is an error, not
a pass (the run's own CI-1 lesson, applied to the checker):

1. Every finding carries the mandatory keys (§1); `evidence` is present and non-empty.
2. Every closed-vocab field holds an allowed value (§2), including facet sub-fields.
3. Conditional-required facets are present and complete (§4), incl. the `fail_mode`
   rule and the **fail-closed discovery rule** (§6d): an unheld-halt effect — a chain
   sink — must state its `preconditions`, never leave difficulty to default.
4. Ids are unique across the run and well-formed `F-###` (§3) — no dimension-band check;
   the id carries no dimension meaning.
5. Filename ↔ dimension agreement (§5), `unprompted` excepted — the actual source of truth
   for a finding's dimension.
6. Every `F-###` in `reaches` / `explained_by` / `escapes` resolves to a finding.
7. Every `F-###` cited in a view (`view-*.md`), the gate sidecar, and
   `AI-NATIVE-EVAL.md` / `MAINTAINER-REPORT.md` resolves to a base finding — the
   citation-integrity check (a class of bug once caught by hand in a real run).
8. If `view-security-gate.yaml` exists: its vocab (§6a) is valid and its `findings`
   resolve. If `view-maturity-grades.yaml` exists: coverage schema valid (§6b) and the
   counted numbers match recomputation from the base (drift fails closed).
9. If `report-prose.yaml` exists: the **solution-coverage rule** (§6c) — every
   unsupervised kind (an unguarded halt) traces to a roadmap fix (its `findings` or
   `covers_channels`) or a `dispositions` entry, and each disposition has a valid
   `reason` + a `note`. A silent uncovered gap fails closed; a stale disposition warns.
10. **With `--target <repo>` (optional):** every evidence path resolves to a real file
   in the target repo — fail-closed on a cited path that does not exist (a container
   mount alias, a misremembered directory, an evidence-of-absence path). Off without
   the flag so the validator stays portable; run it in-session when the target is
   present. A confirmed-absence finding cites what it inspected, not the missing path.
11. **If the run declares a canon (§8):** `report-prose.yaml`'s `canon:` names a
   `canon/<name>.yaml`. If the file is named but missing, that is an **error**
   (fail-closed — you referenced a contract that is not there). If present, the run's
   effect-channel population is checked against it and any drift is surfaced as
   **advisory warnings** (non-fatal, exit stays 0): a run effect channel not in the
   canon, or a canon channel with no finding. Divergence is surfaced, not blocked,
   because a canon may deliberately lead or lag a single run; closing the drift is a
   canon-maintenance decision, not a per-run gate.

The validator is **zero-dependency** (a minimal YAML reader tuned to this schema),
so it copies into any target repo alongside `METHOD.md`.

---

## 8. The canon — the declared enumeration contract (per target)

The **canonical-descriptors rule** requires them — the effect-channel slugs and the census
`subject_type`s — to be **decided once, not per run**, so two runs of the same target align
by name and the cross-run diff means something. But a rule that says "decide once" is empty
until it says *where the decision lives*. If the only record is the previous run's artifacts,
then honoring the rule collapses into **reusing the last run's answers** — which makes any
enumeration-determinism claim tautological (a calibration measured this: a blind
re-derivation on a byte-identical repo diverged materially in channel count, and the blind
pass caught real effect surfaces a pinned prior run had missed).

The **canon file is that home.** One per target, version-controlled and
human-ratified. It is per-target instance data, so it lives with the target's
repository — `canon/<target>.yaml` beside the tool (or with the target's own record),
and the validator resolves it from there. A run's
terrain **reads** it to fix the population, rather than re-judging the granularity each sweep
or (worse) copying a prior run. The distinction that makes this honest: reusing a **declared
contract** is legitimate (both runs read the same spec, blind to each other's findings);
reusing **last run's findings** is contamination. Determinism is meant to be an emergent
property of a shared rule applied blind — never achieved by copy-forward.

**Shape** (all keys authored; the file is a contract, not generated):

```yaml
target: acme/webapp
canon_version: 1
ratified: "YYYY-MM-DD (name) — <scope decision>"
derived_from: "enumerate.mjs + the enumeration rules; blind (no prior run read), then ratified"
effect_channels:            # one per invocation boundary. Enumerate exhaustively.
  - slug: email-send
    what: <one phrase>
    evidence: [path:line]
ai_surfaces:                # a capability = an LLM call site. A scheduled job's
  - name: ai-chat           #   trifecta-shaped reach is an effect + escapes, NOT a capability.
    evidence: [path:line]
    untrusted_input: true
    private_data: true
    external_effect: false
census_populations:         # the fixed subject_type per census population (§2 table)
  decision-legibility: {subject_type: artifact}
  module: {subject_type: artifact}
  effect-provability: {subject_type: control}
  gates-coverage: {subject_type: contract}
  credential: {subject_type: control}
  incident-lesson: {subject_type: process}
credential_population:      # the runtime secrets the credential census traces; state the rule
  rule: >
    <inclusion rule — which env/config secrets count, what is excluded>
  secrets: [ ... ]
  count: N
```

**Scope default: exhaustive.** Every distinct authored effect surface is its own
channel; merge only true shared-code-path families (e.g. ~20 provider integrations sharing one
`syncUserToDatabase` collapse to one `provider-sync` channel). Reversible internal CRUD is
enumerated by resource, not folded into one catch-all. Halt/supervision denominators
self-filter to irreversible-or-external, so exhaustive scope inflates only the (honest)
effect-provability denominator. A target may ratify a different scope; record it in `ratified:`.

**How a run uses the canon.** Pass 0 terrain reads `canon/<target>.yaml` if it exists and
draws the channel slugs, AI surfaces, and census `subject_type`s from it verbatim (do not
re-derive or pin from a prior run). **If no canon exists yet**, derive the population *blind*
— from `enumerate.mjs` + the enumeration rules, with no prior run in context — and propose a new
canon as a reviewed diff; a run's determinism claim is only worth measuring by a pass that
could not see the prior answer. A run activates the validator check (§7.11) by naming its canon
in `report-prose.yaml`: `canon: <name>` (the `<name>.yaml` under `canon/`).

**Maintenance is a distinct function, not an in-run mechanism** (operator direction). The
canon is revised deliberately — a reviewed diff, when the target's surface changes or the
granularity belief is refined — never negotiated mid-eval. The validator's drift check is
**advisory** for exactly this reason: a run is never blocked by disagreeing with the canon; the
disagreement is surfaced for a human to fold into the next canon revision (or the next run).

**Companion — `tools/enumerate.mjs`:** the determinism scanner (README). It closes the
grep-detectable populations so a base pass assesses a list, not a sample, and its
`--run` coverage gate reports enumerated members no finding cites. Together with the
`--target` check above and the cross-run diff, these are the mechanisms that keep
coverage repeatable rather than dependent on what a given run happened to notice.
