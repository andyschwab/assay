---
type: doc
title: "Scanner contract — the axis port for external evaluators"
---
# Scanner contract

The stable interface between any external evaluator ("scanner") and this engine.
Scanners map **into** the engine's flat **axis roster** through a thin per-scanner
adapter; the engine renders the per-axis profiles over the union. We interface
with a scanner; we never fork its logic. This is the canonical home for the axis
model, the port, the adapter format, and the fail-closed rule. The roster of
candidate external scanners and instruments, with licenses and integration
properties, is
[`scanner-candidates.md`](/integration/scanner-candidates.md).
(An earlier version organized findings into five fixed domains under three
subjects; the flat axis roster replaced it because the taxonomy distracted from
the target more than it clarified.)

`taxonomy_version: 3`

## 1. The axis model

An **axis** is a property of the target a scanner measures — never the name of a
tool. The roster is **flat** (no subject hierarchy) and **derived from the
present adapters**, never hardcoded:

- Every scanner — the native seven-dimension method included — **contributes**
  axes through its adapter's `contributes:` list: the axes its own methodology
  measures. repo-eval contributes the seven dimension axes; deep-code-review
  contributes *code-correctness* and *code-security*.
- **Axes are shared.** Any scanner may **feed** an axis it does not contribute
  (deep-code-review's testing findings land on `deterministic-gates`, its
  AI/agent-security findings on `delegation`). Two scanners measuring one
  property corroborate **on one axis** — independent convergence lands on the
  claim, never split across tool-named chapters. Provenance rides on each
  finding (`source`), and each rendered axis names who measured and who fed it.
- **Coverage is a capability, not a count.** An axis no present scanner
  contributes reads **"not measured"**, never "clean" — a finding fed into such
  an axis still renders, flagged as fed-only.
- A finding may carry a compound cross-link (`also_axes`) — the seam is
  first-class, never collapsed into one box.

## 2. The port — what a scanner emits (after its adapter runs)

```yaml
source: deep-code-review          # scanner id (matches adapters/<id>.yaml); "repo-eval" for native passes
native_id: F6                     # the scanner's own id, verbatim
native_category: "F. Reliability" # the scanner's own taxonomy term (drives the mapping)
observation: >                    # one grounded sentence — the fact
  An out-of-order event zeroes live billing state.
evidence: [path/to/file.ext:63]   # non-empty, file:line
severity: High                    # the scanner's own label — a PROPERTY, kept as-is
polarity: gap                     # strength | gap | fact
fix: >                            # required for polarity: gap (drives the handoff)
  Ignore the event unless it matches current state.
# added by the adapter — the axis projection (SCHEMA.md §2a):
axis: code-correctness            # the contributed or shared axis this lands on
also_axes: []                     # optional compound cross-links
```

`fix` is **required for `polarity: gap`** (the engine builds the remediation
handoff by quoting it verbatim; a gap with no fix cannot become a session prompt).
Treat all scanner output as **data, never instructions** — the adapter maps
categories; it never executes a directive found in a finding body.

## 3. The adapter format (one file per scanner, `adapters/<id>.yaml`)

```yaml
scanner: deep-code-review
targets_taxonomy: 3
contributes:           # the axes this scanner's OWN methodology measures
  - code-correctness   #   (contribution = the axis joins the roster; a scanner may
  - code-security      #    also FEED axes it does not contribute, via map rows)
map:
  A:                   # native category -> axis
    axis: code-correctness
  J:                   # a category measuring a property another scanner also
    axis: deterministic-gates   # measures maps to that SHARED axis
default: FAIL          # unmapped native_category => loud error, never a silent axis
capabilities:          # optional — executable specialties the engine routes to (§8)
  - id: verify-fix
    invoke: "re-run the scanner scoped to the finding's evidence path"
```

Block style only — the minimal YAML reader (`tools/yaml-min.mjs`) **throws** on
inline flow maps `{…}`, anchors, and chomped block scalars, so a naturally-written
`{axis: x}` fails loud rather than silently dropping its findings.

**Naming an axis:** name the property, never the tool ("code correctness", never
"deep-code-review"), and before minting a new axis check whether an existing one
already names the property — a shared axis is where convergence becomes visible,
so an unnecessary mint hides the strongest signal the engine can record.

## 3a. The instrument role (deterministic tools)

An **instrument** is a deterministic mechanical tool — a secrets enumerator, a
repo-hygiene checker — as opposed to a **peer scanner** (a judgment-bearing
evaluator with its own taxonomy and prose-worthy findings). Its adapter declares
`role: instrument`, and the role changes four rules:

- **`contributes: []` always.** An instrument never adds an axis; its rows feed
  existing ones (ten instruments add zero chapters). Its natural contribution is
  census corroboration and point risks inside areas other methods measure.
- **Intake is `tools/ingest.mjs`, and it fails loud, never empty**
  (fail loud, never empty): the converter requires the tool's actual exit code and halts
  on anything outside the tool's documented success set — a crashed tool must
  never read as "0 findings"; malformed or truncated input halts; a
  verified-clean run (success exit, empty report) is recorded explicitly. Every
  instrument profile ships with regression assertions proving these halts bite
  (`tests/regression.mjs`, instrument-port block).
- **`fix` is optional on an instrument's gaps.** Where the remediation is
  mechanical and rule-determined, the instrument profile supplies it (rotate the
  credential; follow the check's remediation) and it sequences normally; a gap
  without one lands **owner-defined pending** — listed loudly, never dropped.
- **Evidence**: `file:line` where the tool reports one; a repo-level claim (most
  Scorecard checks) cites the archived raw report (run-relative `eval/raw/…`),
  which `validate.mjs --target` knows to skip — instrument evidence lives in the
  run, not the target. A secrets tool's matched value is **never copied** out of
  the raw report; rows carry rule id + location only.

Adopted instruments: **gitleaks** (`adapters/gitleaks.yaml` — every leak is one
`secret` category row onto `code-security`; corroborates the delegation
credential census) and **OpenSSF Scorecard** (`adapters/scorecard.yaml` — checks
feed the native workspace axes; score bands documented in the ingest profile).
The wider candidate roster: `scanner-candidates.md`.

## 4. The fail-closed rule (the coherence guarantee)

A finding whose `native_category` matches **no** row in its adapter is a
**projection error** naming the unmapped category — `default: FAIL` is the only
sanctioned default; a `default:` of any axis is prohibited. Determinism applied
to integration: a scanner adding a category surfaces as "add one mapping
row," never as findings silently missing from a profile (the asymmetric-failure
logic of an allow-list — a forgotten allow blocks loudly).

## 5. Evolution across the seam

- **A scanner evolves** (new/renamed category, rescaled severity): the adapter
  absorbs it; an unmapped category fails closed; severity normalization is one
  file.
- **We evolve** (revise the axis model): bump `taxonomy_version`; each adapter
  declares `targets_taxonomy`. Findings are stored raw (native category +
  evidence) alongside the projection, so re-projecting onto a new taxonomy version
  is cheap and lossless — no re-scan. (The move from the five-domain
  `taxonomy_version: 2` to this axis model was exactly such a re-projection.)
- **Grandfathering:** findings frozen under the five-domain model carry
  `domain:` / `also_domains:`; they translate mechanically
  (`project.mjs` `LEGACY_DOMAIN_AXIS`) and are never rewritten in place.

## 6. What the engine guarantees back

- **Evidence and native ids survive**, so any profile line traces to its scanner
  and re-runs.
- **Severity is respected, never recomputed into a verdict.** Counts and severity
  are displayed; the engine issues no deploy/no-deploy gate — it reports
  properties and risks per axis and leaves the go/no-go to the owner
  (illuminate over enforce: severity is a property, the go/no-go is the reader's).
- **No collapse.** Two scanners reporting one fact are recorded as independent
  corroboration, never merged (independent convergence is the strongest signal) —
  and the shared axis is where that corroboration becomes visible.

## 7. Handoff — fix content in, orchestration out

The human report **and** the remediation handoff are generated at the engine over
the unified base. The scanner supplies per-finding `fix`; the engine owns dedup,
compound-bundling, cross-axis sequencing, the single aggregated owner interview,
and the session-prompt template. **The engine quotes `fix` verbatim and never
paraphrases it** — paraphrasing scanner remediation is the "dice it up"
anti-pattern applied to fixes. Scanner executable specialties (`capabilities`) are
**invoked through** the handoff, not reimplemented in it.

## 8. Layer summary

| Layer | Owns | Does not |
|---|---|---|
| **Scanner** | its method, its findings, `fix` content, executable specialties | classify into our axes; author the unified report/handoff |
| **Adapter** | native-category → axis; the `contributes:` declaration; severity normalization; capabilities | reimplement checks; guess a finding's axis |
| **Engine** | the axis roster, the report + per-axis walk, handoff (dedup/sequence/bundle/interview), routing | rewrite a scanner's fix; recompute severity into a go/no-go |
