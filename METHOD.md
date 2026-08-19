---
type: skill
name: repo-eval
description: "Cold-start an AI-native evaluation of a repository: a neutral evidence base (findings) projected through per-scanner adapters onto a flat, scanner-contributed axis roster, and compiled into the package — the maintainer report (the lead), a per-axis walk, and an agent-ready remediation handoff. repo-eval is the built-in scanner (seven dimension passes → leverage/maturity/security views); external scanners overlay in on shared, property-named axes."
---
# repo-eval — AI-native codebase evaluation

You evaluate a repository for **AI-native maturity**: how well it supports
inference as a core capability — an environment where AI work is legible,
verifiable, and safely delegable. This SKILL is repo-eval's own scanner method;
its findings are then projected onto the flat axis roster
(`integration/scanner-contract.md`) and compiled into the package (Pass 8.5 +
Pass 9 — the lead deliverable). The scanner method runs in two layers:

1. A **neutral evidence base** — findings against the seven artifact dimensions (enumerated in Passes 1-7 below), recorded as
 *facts with structured descriptors and evidence*. The base **never asserts a
 severity or a priority**; it records what is.
2. Three **views** that compile the same base into different judgments —
 **leverage** (faster/better/reordered), **maturity** (measured coverage per dimension +
 judged depth), and
 **security** (always-on; exposures ranked by likelihood, no deploy verdict) —
 reconciled by a **meta-synthesis** into one roadmap.

The one rule that makes this work: **the base states *what is*; the views compute
*how good / how bad / how urgent*.** A base finding may say "this effect is
irreversible and has no gate"; it may not say "critical." Severity and priority are
view outputs, computed from the
descriptors. This keeps the evidence honest and reusable, and stops a
strengths-first framing from muting a critical finding (the failure this
architecture exists to prevent).

## Ground rules

- **History is out of scope.** Evaluate the repo as it stands. Never mine git
 history; `git log` is off-limits except to timestamp staleness.
- **Every finding is a claim with evidence.** Cite file paths + line numbers. No
 invented metrics, no "codebases like this usually…". If you didn't observe it,
 it's a `confidence: unverified` finding or a question — never a fact.
- **Confirmed vs. not-found are different.** "I confirmed no gate exists" and "I
 didn't find a gate" are distinct — carry it in `confidence`, never blur them.
- **No strength over an un-enumerated population.** A confirmed *strength* asserted
 across a population must name the enumerated population it covers (via a census or
 the effect/AI-surface inventory), never a sampled instance. A sampled-and-wrong
 strength actively reassures and is worse than a silent gap: a prior calibration run
 recorded "no docker-socket mount, blast capped to one user" because it inspected
 the per-user container and never the admin one — certifying safety over a class it
 never looked at. Enumerate the class before you certify the class.
- **Scale by staging, not heroics.** Never hold a large repo in one context. Run
 the passes below; each reads the prior artifacts plus a bounded slice and
 writes its own. If you are an agent team, base passes parallelize; if one
 context, run them sequentially and drop each slice after writing its findings
 so your working set stays small (terrain + current slice + accumulating base).
- **Illumination is real but the ordering is owned.** Strengths are first-class
 findings and every view names them. But *ordering* serves the view's purpose:
 the maturity/leverage views lead with strengths (a team should feel seen, then
 stretched); the **security view leads with exposure** (a buried critical
 finding is a liability). Illumination-first is a choice, not a view from
 nowhere — own it per view.

## Pass 0 — Terrain (one pass, breadth only)

Map without reading deeply: languages and proportions; build/test/lint entry
points and CI; directory topology (the 10–20 load-bearing dirs); docs surface;
agent-facing files (CLAUDE.md, .cursorrules, agent configs, skills, prompts);
rough size. Use listings, manifests, configs — not file-by-file reading.

**First, check for a canon** (`SCHEMA.md` §8). If the target has one — at
`canon/<target>.yaml` beside the tool (or with the target's own record) — **read it and draw the effect-channel
slugs, AI surfaces, and census `subject_type`s from it verbatim** — the canon is the
declared enumeration contract, decided once, so the terrain reads it rather than
re-judging the populations or (never) copying a prior run's findings. Name it in
`report-prose.yaml` (`canon: <name>`) to activate the validator's drift check (§7.11).
**If no canon exists yet**, derive the population **blind** — from the scan + the
invocation-boundary rule (a capability is an LLM call site; a scheduled job's
trifecta reach is an effect, not a capability), with **no prior run in context** — and
propose a new canon as a reviewed diff. A determinism claim is only worth measuring by a
pass that could not see the prior answer; a terrain that pins the last run's channel list
makes the reproduction tautological (a calibration measured this: a blind re-derivation
on a byte-identical repo diverged materially in channel count and caught real surfaces a
pinned prior run had missed). Canon *maintenance* is a distinct reviewed function, never negotiated mid-eval.

Additionally, **derive the effect inventory from a listing, not from memory**: run
`node tools/enumerate.mjs <target>` and take its **CHANNEL
CANDIDATES** section — the agent's invocable surface (the `bin/` CLIs, the
effect-bearing skills, the delivery/integration surfaces, the **in-code agent
tool-definition table** — `tool:` entries, one per `name`+`input_schema` def, the
most common agentic shape — and remote **MCP toolsets**) — as the candidate channel
list, plus the `effectSites` call sites. Triage every candidate to either an `effect`
finding (in the delegation pass) or an explicit out-of-scope note (read-only tools land
here) — do not hand-draft a short list from memory. (When the scan returns no CHANNEL
CANDIDATES — a web app with no CLI/skill/tool-def surface — the invocable surface is the
route + effect-lib topology; the canon records the resulting channel list so the next run
does not re-derive it.) This is why: a calibration measured that every effect
channel a single run missed (`master-image-rebuild`, `webhook-inbound`, `meeting-audio`)
was one the hand-drafted inventory forgot, and each is in the enumerated candidate list.
The channels through which a system produces effects — sends, writes, deletes, deploys,
spends, drives a browser, runs a shell, calls external APIs — are then complete by
construction.

Write `eval/00-terrain.md`: the map, the effect-inventory draft, and your slice
plan — for each dimension, which 5–15 files/dirs you'll actually read. On a huge
repo, sample deliberately (most-central module, newest module, one stale corner)
and note what you're *not* reading.

**Enumerate the populations, do not just sample them — this is what makes coverage
deterministic.** An evaluation is only as repeatable as the populations it *closes*.
Wherever a pass samples a sub-population (which secret? which container class? which
contract?) coverage varies from run to run and the run can even certify a false
strength over an un-inspected class (a real case: one run recorded "no
docker-socket mount" because it inspected only the per-user container, never the
admin one). So the terrain must **enumerate every population a pass will assess and
force one finding (or one census row) per item**, not a representative sample. The
populations that leak when left implicit — enumerate each as a closed list:

- **effect channels** (already forced by the effect-facet rule) — one `effect`
 finding each.
- **container / agent classes** (per-user, admin, cron, webhook) — assess each
 class *separately*; an admin-only privilege must never hide behind the common class.
- **credentials / secrets** — the credential census (below), enumerate-before-assess.
- **network-egress controls** (iptables/DOCKER-USER rules, metadata blocks, URL policy).
- **interface contracts** (frozen dataclasses / schema validators / lockstep tests).
- **delivery / effect-vs-report paths** (every place a job reports success — verify
 the effect, not the return code).

Run **`node tools/enumerate.mjs <target>`** at terrain time: it
mechanically lists the grep-detectable members of these populations so the passes
assess a closed list. After the base is merged, run it again with
`--run <run-dir>` for the **coverage gate** — which enumerated live-surface members
no finding cites; verdict each or record why it is out of scope. And when a **prior
run of the same target exists**, diff the new base against it (matching on *fact*,
not id) and re-verify any prior-only fact — a cheap, deterministic completeness
check that recovers real misses (see
a frozen calibration set).

**Every `.md` file you author in a run** (`00-terrain.md`, `view-*.md`,
`AI-NATIVE-EVAL.md`, `censuses.md`, `candidate-insights.md`) opens with OKF
frontmatter so the bundle guardrail (`npm run check`) passes — `type: doc` plus a
`title:`. The generated docs (report + handoff) get theirs from the tools; see
`SCHEMA.md` §5.

## Passes 1–7 — Base observation (each dimension emits FINDINGS, not verdicts)

Each pass reads terrain + its slice and appends findings to `eval/findings.yaml`
in the schema below. Note both strengths and gaps; "this dimension is healthy" is
a valid result. Do **not** grade or rank here — that's the views' job.

1. **Artifact legibility** — is knowledge in reviewable artifacts or in heads/
 chat? Decision records, design docs near the code they govern, READMEs that
 explain intent. Test: pick one non-obvious design choice and reconstruct its
 rationale from files alone.
2. **Context economy** — can a bounded context reach competence fast? Entry-point
 docs that route a stranger; progressive disclosure; module boundaries that let
 a task load one subsystem; docs freshness (spot-check the oldest doc's claims
 against code — stale canon is worse than none). And the same economy on the
 spend side (one bounded-resource discipline, two
 meters): are model-tier choices recorded with rationale, is inference spend
 metered per work class, is there any re-qualification when models ship —
 or is tier choice a standing assumption nobody re-measures?
3. **Deterministic gates** — the machinery that verifies changes cheaply and
 loudly: tests (fast enough to be used), typecheck, lint, CI; schemas/contracts
 at interfaces so agents fail loudly not silently. Test: if an agent introduced
 a subtle regression in the central module, what catches it, and *when* (pre-
 commit? manual? never)?
4. **Verification affordances** — beyond pass/fail: can a change demonstrate
 itself (runnable examples, fixtures, observability)? Probe integrations for the
 **effects-vs-reports** shape: do jobs verify *effects* or trust return codes/
 success reports (a half-reliable integration that reports success while the
 effect drops is worse than a missing one)? Probe the **decay condition**: does
 anything check output *regardless of how fluent it reads*, not just checks a
 reviewer remembers to run? Probe for a **calibration harness**: does the repo
 harden any skill or rubric by measuring it — freezing an input, running it
 blind N times, disposing the divergence into named classes — or is
 repeatability assumed rather than checked?
5. **Delegation surface** (the security-critical dimension — read deepest). For
 every effect channel, record an `effect` finding with its reversibility,
 whether it leaves the trust boundary, its gate, and its telemetry. Probe:
 - **Credential boundary** — is the secret held *below the prompt boundary* (the
 model calls an authored function set with the credential injected out-of-
 band), or does the agent see raw keys / emit raw platform calls on full
 scopes?
 - **Capability budget / trifecta** — does any one agent/session/context
 co-hold untrusted-input + private-data + external-effect, or is it bounded to
 two-of-three? Record the agent as a `capability` finding with the three
 booleans. (This is the generator of most kill-chains — get it right.)
 - **The halt** — are destructive/external effects (deploy, publish, migrate,
 spend, send, delete) gated at explicit narrow points a human actually holds,
 at the *irreversible boundary* (not ceremony at every step)? Do irreversible
 ops exist only in staged form (draft-not-send, quarantine-not-delete)? Is the
 confirming act real (does the reviewer see enough to decide) or a reflexive
 click?
 - **Identity clarity under breadth** — for each connector/tool surface, can you
 say *who is acting as whom*? Per-identity scoping and a stated role, or
 ambient access installed by default across an unbounded surface? Breadth is
 not the defect; ambiguity of actor is, plus the complexity cost of a surface
 nobody can damage-control. A wide surface with clear identity and per-role
 access is a pass; a narrow one where every call runs as the same opaque
 principal is not.
 - **Promotion path out of a scope** — where capability is scoped (per user,
 per room, per tenant), is there a sanctioned way for a capability to graduate
 beyond its scope, with a gate on the promotion? Scoping bounds blast radius
 and fragments leverage in the same move, so a system with scopes and no
 promotion path has bought the safety and paid the whole cost; record the
 absence as a finding rather than crediting the scoping alone
.
 - **Composition** — where a wrapper/policy gates calls, does it reason over the
 data-flow graph (what values, from what provenance, reach which call), or
 only per-call permission? Individually-allowed calls that chain into harm are
 a finding, not a pass.
 - **Observability of effects** — does each effect emit a durable, machine-
 parseable record you could build a trigger/halt around? An ungated effect
 that is *also* untraced is the worst quadrant — you cannot gate what you
 cannot observe (record `telemetry: none`).
 - **Blast scope** — for each effect/credential, does its damage stay within one
 user/tenant, or does it escape to the fleet / cross-tenant? (A shared secret
 or a cross-tenant reach is a different severity class — record `blast_scope`.)
 - **Modality match** — controls match the modality:
 automation gets output QC, augmentation gets collaboration checkpoints,
 agency gets behavioral specs + monitoring + pre-release verification. A
 control designed for the wrong modality is a finding.
 - **Authorship** — the halt covers *authorization*; does
 anything cover *authorship*? Disclosure of AI involvement matched to the
 audience's norms, structural where the audience requires it (a bot
 visibly joining the call, not a footnote after the fact).
6. **Improvement loop** — do corrections compound? Is there an agent spec
 (CLAUDE.md or equivalent) accumulating the team's taste and rules? Do review
 comments / lessons have a durable home? Test: where would "we never do X here"
 get written so it sticks — and is that mechanism *used* (dated evidence) or
 aspirational? Two further probes:
 - **Impact self-measurement** — does the system know what it's worth?
 Impact fields on shipped work, before/after records, its own delta
 legible without a study.
 - **Instrumentation-readiness** — does the artifact emit structured
 usage/outcome records *by its own design*? Building telemetry into an
 app is ordinary engineering within the maintainer's control: absence
 scores **here**, never deferred to whoever operates the org's rails
 (the AI Ready boundary — a missing rail is an artifact finding, an
 unused rail is an org finding outside this eval's scope).
7. **Multiplayer** — shared context + agent access (taxonomy dimension 7). Can multiple
 people and agents share context here, and does the system expose an
 agent-consumable surface rather than only a human UI?
 - **Agent access surface** — enumerate interfaces × consumable-by-agent:
 which capabilities exist only behind a human UI, and which expose
 APIs, handoff formats, or format contracts an agent can consume?
 Usage/outcome telemetry endpoints are part of this surface and must
 aggregate at the population level by construction.
 - **Shared substrate** — context stores × shared / private /
 consent-governed: consolidated and reachable, or scattered and
 bespoke per integration? Is a shared scope (room, channel, project)
 a *principal* with its own memory and permissions, or is all durable
 state per-user?
 - **Authority domains** (the four questions,
 asked per effect channel and per context read): acting **as** (whose
 authority — per-user vs ambient grants), acting **within** (which
 shared space governs it, who sees the result), acting **on** (what
 may be touched), acting **from** (do context entries carry origin
 labels for the reads that produced them?). Deliberate overlap with
 delegation's credential probes: record each finding once, under the
 dimension whose question surfaced it.
 - **Consent semantics** — is sharing a conscious act or automatic
 surfacing? Any privileged-reader asymmetry
 (an admin who can read content) disclosed structurally rather than
 discovered?

## The finding schema (base layer)

> **`SCHEMA.md` is authoritative.** It holds the full field spec, the closed
> vocabularies, the **id allocation**, the **canonical run layout**, and
> the security view's machine-readable stage tail — so you never reconstruct
> conventions by reading a prior run. `tools/validate.mjs` enforces all of it and
> **fails closed**; run it before compiling the views (see "Validate & compile"
> below). The block here is the working reference; if it and `SCHEMA.md` ever
> disagree, `SCHEMA.md` wins.

One finding per object in a per-dimension `eval/findings-NN-<dim>.yaml` file (merged
into `eval/findings.yaml`; ids unique within the run, `SCHEMA.md` §3). Lean
neutral core + facets attached only when relevant.

```yaml
- id: F-023 # stable across re-runs (lets a later run diff "still open?")
 dimension: delegation # …|artifact-legibility|context-economy|deterministic-gates
 # |verification|improvement-loop|multiplayer| unprompted
 polarity: gap # strength | gap | fact (views read this oppositely)
 subject_type: effect # effect | control | artifact | contract | process | capability
 observation: > # ONE grounded sentence — the fact, not the interpretation
 The agent sends email as the user with no draft/confirm step.
 evidence: [path:line, path:line] # mandatory
 confidence: confirmed # confirmed | plausible | unverified
 effect: # REQUIRED when subject_type == effect
 channel: gmail-send
 reversibility: irreversible # reversible | reversible-with-window | irreversible
 external: true # does the effect leave the trust boundary?
 gate_type: none # deterministic-halt | staged-reversible | scope-bound |
 # rate-throttle | disclosure-only | external-halt | none
 fail_mode: closed # open | closed — how the gate behaves if a dependency is absent.
 # A `fail_mode: open` gate is gate_type:none under that condition
 # (e.g. an egress hook that allows everything if `jq` is missing).
 # Required whenever gate_type is not none.
 telemetry: unstructured # none | unstructured | structured-event | audited
 blast_scope: tenant # user | tenant | fleet | cross-tenant
 capabilities: # REQUIRED when subject_type == capability
 untrusted_input: true
 private_data: true
 external_effect: true
 preconditions: [prompt-injection] # what an attacker needs (controlled list, below)
 reaches: [F-055] # findings reachable from here in one context (feeds kill-chain)
 explained_by: [F-090] # links UP to a systemic finding (feeds fan-out)
 escapes: [F-081] # this effect's damage pierces the containment/ceiling that these
 # strength findings establish (e.g. reaches the host or fleet
 # despite per-tenant isolation) — makes "escapes the ceiling"
 # computable, not narrated; the security view weights it heavily
```

**Conditional-required rule (load-bearing):** effect/capability facets are not
globally required, but *if `subject_type: effect`* the `effect` facet
(reversibility, external, gate_type, telemetry, blast_scope) is **mandatory**
(`fail_mode` additionally required whenever `gate_type` is not `none` — a real gate
must declare how it fails), and *if `subject_type: capability`* the three
`capabilities` booleans are mandatory. `escapes` is optional but the security view
weights it heavily — attach it to any effect whose damage leaves a containment the
base records elsewhere as a strength.
This guarantees the halt-and-observability inventory is complete — an effect
cannot be recorded without answering "what stops it? does it leave a trace? how
far does its damage reach?"

**Controlled vocabularies** (keep closed — comparability depends on it):

| Field | Values |
|---|---|
| dimension | artifact-legibility · context-economy · deterministic-gates · verification · delegation · improvement-loop · multiplayer · **unprompted** |
| polarity | strength · gap · fact |
| subject_type | effect · control · artifact · contract · process · capability |
| confidence | confirmed · plausible · unverified |
| reversibility | reversible · reversible-with-window · irreversible |
| gate_type | deterministic-halt · staged-reversible · scope-bound · rate-throttle · disclosure-only · external-halt · none |
| telemetry | none · unstructured · structured-event · audited |
| blast_scope | user · tenant · fleet · cross-tenant |
| fail_mode | open · closed (how a gate behaves when a dependency is absent; open ⇒ gate_type:none under that condition) |
| preconditions | prompt-injection · stolen-credential · malicious-dependency · network-position · insider · zero-day · physical |

(`escapes` is a link, not an enum — a list of the strength-finding ids whose
containment this effect pierces; see the schema example.)

**Precondition → difficulty** (the anti-alarm dial): prompt-injection = trivial;
stolen-credential / malicious-dependency = moderate; network-position / insider =
hard; zero-day / physical = exotic.

`unprompted` is a first-class dimension: findings no criterion asked for
(a cross-cutting systemic gap, a novel strength) land here and are `reaches`/
`explained_by`-linkable, so seam-findings are not stranded.

## The views (each reads `findings.yaml`, writes its own artifact; never edits the base)

### Leverage view → `eval/view-leverage.md`
Read gaps as opportunities. For each, estimate leverage on **all three** axes —
*faster* (whose hours does closing it save?), *better* (what becomes possible
that isn't today? — including work that ships at all where the fixed overhead
currently prevents it), and *reordered* (does closing it change the shape or
order of the process itself — a check cheap enough to move earlier, a handoff
that disappears — rather than speeding any step?). Any axis may be "none";
never merge them — a cost-only estimate is blind to the other two, and a
duration-inside-the-existing-shape estimate is blind to the third. Order by
leverage per unit of verification cost, strengths noted first.

### Maturity view → `eval/view-maturity.md` + `eval/maturity-inputs.yaml`
Maturity is **measured coverage, not rung words** (SCHEMA §6b): for each dimension,
the share of a review-enumerated population meeting that dimension's bar. Existence
somewhere is not existence everywhere — one excellent artifact never promotes a
dimension, because every claim needs a denominator. Percentages are primary; there
is no binning.

- **Counted measures come free** from the effect/capability fields the passes
 already record (`telemetry`, `gate_type`, `fail_mode`, trifecta legs) —
 `tools/maturity.mjs` computes them. Improvement-loop and verification ride the
 effects census; deterministic-gates rides the halts; delegation rides the AI
 surfaces.
- **Sampled censuses** cover what has no counted field: artifact-legibility (sample
 n non-obvious decisions, count how many reconstruct from files alone),
 context-economy (module census: loadable standalone; instruction files vs their
 stated budget), delegation's credential census. State n, method, and the item
 list; record results in `maturity-inputs.yaml`. Until a census runs, the
 dimension reads `not_measured` — an honest gap beats a judged grade.
- **A census outranks a blind pass on its own axis.** Where a delegation pass's
 blind claim about a secret's boundary disagrees with the credential census, the
 **census wins** — it traced the actual strip, the blind pass guessed. (In the
 a calibration, both blind sweeps flagged a "fleet-shared key exfil" that the
 census had already traced as stripped below the boundary; the census-correct answer
 is the one that ships.) Same for the module census over a blind coupling claim.
- **Census-augmented run mode = the repeatability lever (`SCHEMA.md` §6b).**
 When run-to-run repeatability of the *findings* matters (not just the verdict), emit
 the observational dimensions as **one finding per enumerated population item**
 (one per ADR / bounded context / effect-provability channel / knowledge doc), each
 with the item's own file as evidence and the census's **canonical `subject_type`**
 (`SCHEMA.md` §2 — decide it once, never re-choose per run). On a
 calibration this ~doubled fact-level repeatability (48% → 78%). A base sweep stays
 fine for a one-off client read.
- **Author depth separately**: one judged sentence per dimension on how good the
 *best instance* is, with finding ids. High depth over low coverage is a finding
 in itself ("the team knows how; the work is doing it everywhere").
- **Earned flags** (`enforced`, `generative`) only with cited evidence — e.g.
 enforced requires something *running* the checks automatically (CI pre-merge),
 not the checks existing.

Write the prose reading in `view-maturity.md`, then run
`node tools/maturity.mjs <eval-dir> --write` to generate
`view-maturity-grades.yaml`. Never hand-edit the generated file; the validator
recomputes the counted numbers and fails on drift. This is a *capability* measure —
keep it distinct from the security view's *exposure* ladder; a dimension can measure
high here and carry a critical exposure.

### Security view (ALWAYS-ON) → `eval/view-security.md`
Run the frame stack in order; lead the artifact with the posture headline.

1. **Trifecta screen** — find every `capability` finding holding ≥2 legs; note
 which effects it `reaches`. Identifies the dangerous surface(s).
2. **Halt inventory** — table every `effect` finding: channel · reversibility ·
 external · gate_type · fail_mode · telemetry · blast_scope. Flag each that is
 (irreversible OR external) AND gate_type ∈ {none, disclosure-only}. **Treat a
 gate with `fail_mode: open` as `gate_type: none` under its failure condition** —
 flag it as an effective-none and name the triggering condition (e.g. "missing
 `jq` → hook allows all"). Separately flag `telemetry: none` effects (no trigger
 can be built on them yet).
3. **Kill-chains** — for each flagged surface, compose from an untrusted-input
 entry (a capability with `untrusted_input: true`) through `reaches` to the
 worst reachable irreversible/external ungated effect. Difficulty = the easiest
 path's hardest precondition (min over paths of the max-difficulty step) →
 likelihood. State each **matter-of-factly**; a chain needing exotic
 preconditions is recorded but ranks low (this is how alarmism is handled —
 likelihood, not suppression). Give each a one-line **`breaks_the_chain`**: the
 single next action (add a staged-reversible or deterministic-halt gate; or fix
 the telemetry seam first if the effect is untraced).
4. **Posture** — the cross-cutting judgment no single finding carries ("effect
 determinism is near-zero / strong on X, absent on Y"). This is the headline.
5. **Detectability** — from telemetry: an ungated + untraced effect is least
 addressable (needs decomposition before a gate can exist). Observability is
 upstream of gating.
6. **Blast-radius** — note strengths that cap the ceiling (isolation) vs. what is
 unbounded within it. Any effect carrying an `escapes:` link (or
 `blast_scope: fleet|cross-tenant`) pierces an otherwise-strong ceiling — its
 blast is the *escaped* scope (host/fleet), not its per-tenant scope, so it
 dominates the posture and usually sets the gate. A system whose security story
 is "isolation caps the blast" has its severity decided by the handful of
 effects that escape that isolation — surface them first.

**Severity is computed from the evidence, never asserted — and it drives no deploy
verdict** (safe-to-run is retired; the report presents risks, not a go/no-go — and
that retirement covers the old alpha/beta/prod stage scale too, not only the rendered
verdict: assigning a deployment stage per exposure is a small risk-tolerance decision
that belongs to the reader). Each exposure carries the PROPERTIES the reader decides
from, stated separately and never composited into a tier:

- **WHO can trigger it** — `who`: an unauthenticated stranger · an authorized real
  user · only at scale or adversarial. Reach is the sharpest single property.
- **WHAT is at stake** — the composed findings' facets (reversibility · external ·
  blast_scope); say it in one clause (`what`).
- **HOW LIKELY** — `likelihood`, from precondition difficulty (trivial→high …
  exotic→low), discounted by confidence (a `plausible` exposure states so).

Show the who × stakes × likelihood read for each exposure; order most-likely first.
An exposure the analyst judges lower-priority watch material is labeled
`standing_watch: true`, with the reason stated — a labeled judgment, never a tier.

**Emit the machine-readable exposures tail.** Alongside the prose, the security view
writes `eval/view-security-gate.yaml` (`SCHEMA.md` §6a — filename historic): one
`exposure` per chain/exposure with its `findings`, `who`, `likelihood`, optional
`standing_watch`, the one-line `fix` (breaks_the_chain / leverage action), and what
it `unlocks`. This is the only structured artifact a view produces; the maintainer
report's exposures section (Pass 9) compiles from it, so severity stays computed in
the view layer, never asserted in the base.

## Validate before compiling anything downstream

Once the per-dimension pass files exist and are merged into `eval/findings.yaml`, run the
guardrail: `node tools/validate.mjs <run-dir>`. It is
zero-dependency and **fails closed** — schema, closed vocab, conditional facets, the
`fail_mode` rule, filename↔dimension agreement, link resolution,
and **view/report citation-integrity** (every `F-###` a view or report cites must
resolve). Green is the gate: don't compile views or the report on an unvalidated base.
Re-run it after the views and after Pass 9 (it then also checks the gate sidecar and
the report's citations).

When the target repo is available in-session (it usually is), run it with
`--target <target-repo>` too: it verifies **every evidence path resolves to a real
file** in the target, failing closed on a cited path that does not exist — the
"agent cited a plausible path it never opened" class. A confirmed-*absence* finding
("no CI") must cite what it *did* inspect (the human-run gate that exists instead),
not the missing path, and state the absence in the observation.

## Pass 8 — Meta-synthesis → `eval/AI-NATIVE-EVAL.md`

Reconcile the three views into one document (reads only the view artifacts):

1. **Snapshot** — five sentences: what the repo is, standout strength, binding
 constraint, the maturity coverage numbers in one line, and the lead security
 exposure (the most likely, widest-reach open risk — a property, not a verdict). If a dimension measures high
 *and* carries a critical exposure, say both — do not let one average the other.
2. **Strengths worth stealing** — 3–7, each written so another team could copy it.
3. **One roadmap** — interleave all three views' items in a shared currency:
 sort by security urgency first (likelihood, then who can trigger it — the
 chain ranking already orders reach × difficulty), then leverage
 (faster/better/reordered) × likelihood × damage, then addressability (cheapest-to-verify
 first — telemetry-blind effects sort behind the telemetry fix). The first item
 should be doable in under a day and visibly pay off. Flag any item whose payoff
 depends on another landing first.
4. **Key questions** — what only the owning team can answer (the `confidence:
 plausible/unverified` findings and the "couldn't determine from the repo"
 list). Real questions, not rhetorical gap-pointing.

Ordering note: for a **security-purpose** engagement, lead the whole document
with the security posture + gate verdict, *then* strengths. For a **self-eval /
adoption** engagement, lead with strengths. Same evidence, owned ordering.

`AI-NATIVE-EVAL.md` is the **internal** synthesis (dense, operator-facing, cites every
finding). The **external, maintainer-facing** deliverable is Pass 9.

## Pass 8.5 — The walk (per-axis profiles) → `eval/view-axes.md`

The detail layer under the axis model (`integration/scanner-contract.md`):
`node tools/compile-axes.mjs <run-dir> [--base <dir>]...` projects the base
through each scanner's adapter onto the **flat axis roster** — the seven native
dimension axes plus each peer scanner's contributed axes (deep-code-review adds
*code-correctness* and *code-security*), **property-named and shared**, so two
scanners measuring one property corroborate in one section. Each axis carries its
measured-by line (who measures, who feeds), properties to preserve,
severity-ranked risks (with `file:line`), and a posture line. The delegation axis
leads with the computed attack-chain. A severity census + start-here head the
walk; compounds cross-list via `also_axes`; unclassified findings get their own
section. There is **no single safe-to-run verdict** — each axis carries its own
posture (severity is a property, the go/no-go is the
reader's). An axis no present scanner `contributes:` reads **"not measured"**,
never "clean" — a fed-only axis renders its findings but is flagged as not a
measure. The projection is **fail-closed** (unmapped category halts, in
`validate` too). The deduped, severity-banded remediation spine seeds the
**scanner-verbatim voice** of the Pass 9 handoff, quoting each fix verbatim,
never rewritten.

## Pass 9 — The package (engine deliverable)

One command assembles the whole deliverable over the projected base:
`node tools/compile-package.mjs <run-dir>`. Three readers, one bundle
(`INDEX.md` is the front door):

- **`MAINTAINER-REPORT.{md,pdf}`** — **the lead human deliverable**: the report
 chassis (below), authored narrative over computed structure, area by area over
 the whole axis roster. Compiled only when the run carries its authored inputs
 (`eval/report-prose.yaml`); a raw base still gets the walk + handoff, and the
 INDEX says which lead is present.
- **`handoff/`** — the machine/agent layer (`tools/compile-handoff.mjs`), the report's
 computed-structure + authored-narrative split applied to the machine side. Two
 provenance-labeled voices populate the remediation spine: **scanner-verbatim** fixes
 (quoted exactly, never rewritten — scanner contract §7) and **eval-authored** remedies
 (the `report-prose.yaml` roadmap — title/body/questions/options/done_when — joined to
 its findings and spliced with their verbatim observations + evidence; a scanner item
 whose findings a roadmap item fully covers is absorbed into that card, never sequenced
 twice). An open gap with
 neither is **owner-defined pending**: listed loudly, never dropped, never sequenced.
 Files, designed **self-contained** (the folder ships alone into the target repo):
 `START-HERE.md` (the sequence — uncovered High-and-above scanner items first, then
 roadmap in authored order, then the remaining scanner fixes by severity — and what is
 NOT covered), `REMEDIATION.md` (every remedy with its
 **claim-audit block**: verbatim observation + evidence `file:line` + proof step from
 the scanner's `verify-fix` capability), `FINDINGS.md` (the complete projected base —
 established/open/facts — so any claim can be audited before acting), and `plan/NN-*.md`
 (one session prompt per roadmap item and per uncovered High-and-above scanner item —
 the trailing lower-severity scanner fixes stay in `REMEDIATION.md` — each prompt:
 confirm claims → interview → choose →
 implement → prove). Scanner text is **fenced as data-not-instructions** (untrusted
 target repo); authored prose is the eval agent's own voice, unfenced and labeled.
 Two fail-closed gates: roadmap ids missing from the base halt (drift), and open gaps
 with an empty sequence halt (the machine-side false-green — a handoff must never read
 "nothing to do" over live gaps).
- **`INDEX.md`** — the front door: the roster at a glance (per-axis open/held
 counts + the not-measured honesty line), the artifact table, and the
 **scanner-native appendices** (deep-code-review's own report) — listed as
 provenance, in each scanner's own voice, never merged.

**Decisions are an optional overlay, never a gate** (`tools/decisions.mjs`). The raw
base always compiles the full package. If — and only if — an owner triages, they drop
`eval/decisions.yaml` (accept/fix/investigate/snooze + reason + who/when, root's own
decision model) and every compiler folds it in: an accepted gap leaves the open count
and reads **accepted** (waived), distinct from **held** (earned); a snooze reappears
at expiry. The interview may never happen, and the package never waits for it.

### The report (the lead human deliverable)

The maintainer report is **the package's lead**: the chassis every scanner's
findings render into, area by area over the whole axis roster — the native
measured-coverage areas first, then each scanner-contributed area with its own
severity read, then the not-measured honesty line (an axis whose measuring
scanner did not run is stated, never silently absent). It is generated when the
run carries its authored inputs (`report-prose.yaml`, `maturity-inputs.yaml`),
via the tools below. The engine issues no go/no-go, and the report carries no
safe-to-run verdict either:
its security section presents exposures as **illuminated risks** (a decision to fix,
accept, or investigate), most-likely first. It is **two paired artifacts for two
audiences**, from one authored surface:

- **`MAINTAINER-REPORT.pdf`** — the **human briefing**. Light and scannable (a dozen-odd
 pages), organized maturity-and-strengths first, then the security risks — never a report
 card and never a deploy verdict. The
 cover carries the *How to read this report* panel (no table of contents — it isn't
 clickable, and section headers navigate a short doc fine), so the **executive summary is
 page 1 by default** (the cover is off unless `cover: true`, so a shared PDF's thumbnail
 shows the compelling part). The front page has **no "Executive summary" heading and no
 editorialized verdict line** — a compact masthead names it (the **app name is the big line**,
 "AI-Native Readiness Report" the subheading, the app's descriptor below), then the report
 leads straight into **computed visuals**: the defined-stat row (three numbers each with its
 meaning), the coverage bars beside the supervision bar, the best-trait/watch chips — then the
 scale/maturity/security **narrative below**. Nothing LLM-authored is the first critical thing;
 the numbers are. **The front page must fit one page for any target regardless of complexity**,
 and the renderer *enforces* it: the exec section carries a hard `max-height` (one page's content
 box) with `overflow: hidden`, so it can never spill to page 2; a fit pass first zoom-scales the
 ES down to a readable floor, and only if that is not enough does it drop trailing rows of the
 enumerable lists (coverage areas, oversight kinds) and append a **"+N more (see …)"** note so the
 dropped count is never silently lost — the prose paragraphs are never truncated, and a still-over
 case prints a review warning rather than clipping quietly. `cover: true` prepends a plain title page (title +
 meta only, no content) for a formal leave-behind; *How to read this report* lives in Appendix A
 either way, never on the cover. **The body sections run maturity + positives first, then
 the security items — matching the left→right ES flow (coverage/strength on the left, risk on
 the right) and how a maintainer wants to experience the report.** In order: **§1 Maturity,
 area by area** (the **full coverage table** — bar, percent, met-of count, what-was-measured
 microcopy, and the depth sentence per area, closing with the labeled aggregate and the
 enforced/generative frontier line, the ES preview expanded); **§2 Strengths worth keeping**;
 **§3 The main risks, and the questions only you can answer** (the computed chains, then the
 open questions); **§4 What `<target>` can do**, rendered as a **status-rail list** (one row
 per kind of action, grouped by reach with per-group counts, a red rail + ▲ on the unguarded
 ones — the effect inventory made the visual, answering "what can this thing actually do?");
 **§5 Security risks** (the exposures as decisions — fix / accept / investigate — most-likely
 first, no deploy verdict); **§6
 Prioritized roadmap**; then short appendices (*In plain terms* = the concepts primer + a core
 glossary, *Method & scope*, *the handoff package*). ELI5 is a **voice property**, not a
 component: the prose glosses each technical term in-sentence on first use, so a non-engineer
 is never stranded. No count-of-findings charts — every visual encodes *state* (coverage level,
 measured coverage, guarded/unguarded), never a count dressed up as a score — a coverage
 percent is a measured fraction with its denominator shown, not a score. **The main-risks
 section is "The main risks, start to finish": the attack chains, computed by
 `tools/chains.mjs` from the `reaches` graph and ranked by reach-then-ease, never authored.**
 The widest, easiest chain (for a security-critical target, the fleet-compromise chain) sorts to
 the top on its own; a target whose untrusted-input surfaces hold no effect leg computes to zero
 chains and the section says so honestly. That is how a chained, remote-triggerable exploit gets
 the lead deterministically instead of being flattened into one calm card (the
 base proposes the edges as evidence-backed facts, the computation disposes which chain leads).
 **The section never claims a chain does not exist**: it says none was
 *identified*, and computes four states — **live** (open path, the lead), **held** (reaches an
 effect but a control holds it today, shown with what holds it, because that control is
 load-bearing), **contained** (a surface confirmed to hold no power to act), and **unresolved**
 (a chain-critical value it could not determine — a `plausible` finding on a path, an unsure sink,
 an untraced effect leg — flagged under the chains and folded into the questions). Confidence
 propagates: a chain riding a non-confirmed finding renders *possible*, hedged. **The language never
 claims more than the review found**: with no live chain the headline is "the report did not identify a
 live attack chain" (not "none exists"), and a reached-but-limited path is stated as *what the review
 found* in the way, never as a guarantee. **The chains and "Questions only your team can answer" open
 together in §3** (the questions folded up out of their own section) so the big items and the big
 unknowns lead with no jump, and the executive summary owns its own page (a break after it). And
 `validate.mjs` **fails closed** on a chain sink with no `preconditions` — its difficulty must
 be discoverable, so its absence is an eval defect to go fix, not a silent default.

The machine/agent layer is the **engine handoff** (above), over the unified base; this
report is the human lead alone. Voice is plain and direct:
short sentences, no em-dashes in prose (they read as machine-written). Shipped partials
(`templates/howto.md`, `concepts.md`, `method.md`, `glossary.yaml`) cost nothing per run.
Templatized to keep quality high and variability low; the split is **tables computed, story
authored**:

1. **Author the prose** into `eval/report-prose.yaml`. Write it so a vibe-coder is never lost:
 gloss each technical term in-sentence the first time it appears (ELI5 in the voice, not in
 a sidebar). Keys:
 - Narrative keys: `target`, `target_short`, `maintainer`, `strengths[]`, `roadmap_intro`,
 `key_questions[]`, and `exec_summary` as the **five-part map** `{scale, strength, watch,
 maturity, gate}` (SCHEMA §6c). Author `scale`/`maturity`/`gate` as flowing paragraphs —
 they render as the ES's unbroken narrative — and `strength`/`watch` **chip-length**
 (one tight sentence or two), since they render side by side inside the instrument
 panel, not as prose. Keep the five-part shape and keep it all tight — the ES must fit
 one page.
 - `operating:` — legacy, no longer rendered (the levels-of-use runway was retired with
 the safe-to-run verdict; see `SCHEMA.md` §6c). Kept only so older `report-prose.yaml`
 files still validate; new runs may omit it.
 - `channel_notes:` — one `{group, what}` per effect channel, naming the real mechanism
 (Resend, Nango, Stripe) the read-only descriptors can't. `group ∈ {outward, data, read,
 ai}` sorts the *What it can do* section.
 - `roadmap[]` — each item carries the authored **decision structure** the plan prompts
 compile from: `slug` (the plan filename), `title`, `body`, `findings[]` (base ids the
 prompt splices verbatim with evidence paths), `questions[]` (context the eval couldn't
 see), `options[]` (`{name, tradeoff}` — the agent asks, never chooses), `done_when[]`
 (closure tied to finding ids the next run re-checks).
 - Every gate-view exposure needs a human `title:` alongside its slug `name:` — validator
 rejects a missing one; `tools/display.mjs` translates the remaining machine vocab.
 - **Cover every unsupervised kind (solution-coverage, `SCHEMA.md` §6c).** Each unguarded
 halt must trace to a roadmap fix — its `findings`, or a `covers_channels: [slug]` on the
 composite item that closes it by pattern — or to a `dispositions:` entry (`{channel,
 reason, note}`) that logs why it is deliberately not fixed. `validate.mjs` fails closed on
 a silent gap. The ES shows the count; this is what makes the report's "the rest is in
 Security risks" honest — nothing is silently unaddressed.
2. **Compile the Markdown:** `node tools/compile-report.mjs <run-dir>`.
 It merges `templates/maintainer-report.md` + `findings.yaml` (the computed capability
 section) + `view-security-gate.yaml` (the coverage gap) + `view-maturity-grades.yaml`
 (generated from `maturity-inputs.yaml` by `tools/maturity.mjs --write`)
 (the full ladder) + your prose → `MAINTAINER-REPORT.md`, the PDF's content source of truth. Deterministic and
 re-runnable: fix a finding, re-validate, recompile — prose is never clobbered. Re-run
 `validate.mjs` first (it checks the report's citations).
 (The handoff is built by the engine's `compile-handoff.mjs`, not here.)
3. **Render the appendix PDF:** `node tools/render-pdf.mjs <run-dir>`.
 It renders the Markdown through `markdown-it` + `templates/report.css` (a brand-neutral
 print design system: a clean cover carrying only the title, the *How to
 read* panel, and the meta block — no verdicts and no running header/footer; every score
 and visual lives in the ES — then the **one-page exec dashboard** (paired
 paragraph/visual blocks including the denominator strip, the mini coverage panel, and the
 supervision bar), the full maturity coverage table, the **capability status-rail list**, the coverage-gap
 blockers as scannable **cards**, professional tables, a
 closing colophon plate) and prints via headless **Chromium**
 to `MAINTAINER-REPORT.pdf`. Typography is vendored in `templates/fonts/` (Source Serif 4 +
 Source Sans 3, OFL) so the render never depends on system fonts. The cover carries no
 header/footer: it is printed on its own and joined to the numbered body by poppler's
 `pdfunite` (without poppler the whole doc prints in one pass, header/footer on the cover).
 Presentation only — the Markdown stays the content source. **Verify it**: render the pages
 to images (`pdftoppm`) or pass `--png` / `--html`, and *look* before sending.
 Publishing/sending the PDF is the halt — a human sends it.

 > Rendering (`render-pdf.mjs`) is a framework-side finishing step, not one of the
 > portable zero-dep tools: it needs `markdown-it`, Playwright's Chromium, and (for
 > the clean cover) poppler-utils. The base tools (`validate.mjs`,
 > `compile-axes.mjs`, `compile-handoff.mjs`, `project.mjs`, `decisions.mjs`) stay
 > zero-dependency and copy cleanly into any target repo.

**The package is the deliverable.** `compile-package.mjs` assembles it;
`MAINTAINER-REPORT.pdf` is what you send a human, `handoff/` is what they (or you) paste
into a Claude session to close the gaps, and the scanner-native appendices ride along as
provenance. Sending any of it is the halt — a human sends it.

## Scoring against known answers (the calibration lever)

When the target is a **fixture with a known-answer sheet** (the public
[assay-fixtures](https://github.com/andyschwab/assay-fixtures) targets, each with an
`ANSWERS.yaml` of planted defects + strengths), grade the run:
`node tools/score.mjs <run-dir> --answers <target>/ANSWERS.yaml`. It reports **recall**
(planted items recovered, scoped to the methods that ran) and, on a control target,
the **false-positive** count. This is how the engine's coverage is measured rather than
asserted: a projection change that
misfiles a finding shows as a *mis-homed* item and drops recall, caught by the pinned
`tests/regression.mjs` recall floor. A scored run authored by the same agent that wrote
the answers proves the pipeline and the recall floor, not blind determinism — a blind
run (fresh context, answers unseen) is the separate measurement that earns the
repeatability claim.

## Feedback hook — the run's second output

Every evaluation is field evidence, and it produces **two** outputs: the client
result (report + handoff) and a **method backlog** for the engine itself — the
determinism/coverage gaps the run exposed in the *rubric*, not the target.

**The close-out sort is explicit — two subjects, two rails, checked before the run
ends.** Everything actionable the run produced goes to exactly one home: an action on
the **target repo** belongs in the handoff (a sequenced remedy, or the pending list
with its claim block — never only in prose); a learning about **the engine or its
tooling** belongs upstream, in the assay project. Neither rail may silently absorb the
other's items — a toolchain rail that stays healthy while the target-action rail
starves is the failure mode this sort exists to catch.

- **Generate the computed half:**
 `node tools/backlog.mjs <run-dir> --target <repo> --prior <prior-run> --write` →
 `eval/backlog-computed.yaml` (un-enumerated-population + evidence-inaccuracy +
 coverage-divergence items, composed from `enumerate.mjs --run` and
 `validate.mjs --target` and the prior diff). Curate it with the authored classes a
 tool cannot compute (a sampled false strength, a mis-sized severity band, a
 granularity drift, a tooling gap).

Also write 2–5 notes — one idea each — for anything that surprised you: a strength
shape the dimensions didn't anticipate, a dimension that failed to discriminate, a
descriptor the schema lacked, a repo behavior that contradicts the method's
expectations. If nothing surprised you, say so — that too is a data point about the
rubric.
