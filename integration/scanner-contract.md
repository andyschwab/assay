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

**A peer scanner with a machine report comes in through `tools/ingest.mjs`** the
way an instrument does. deep-code-review 1.72+ writes one YAML file per run
(`review` / `ground_truth` / `coverage` / `findings`); `ingest.mjs --tool
deep-code-review --raw <file>` converts its rows into the port (native id and
domain letter kept; `title`, `confidence` mapped onto the closed vocab with the
native label beside it, `latent`, `mechanism_unproven`, `prior_native_id` /
`prior_status` carried as extension fields) and archives its per-domain coverage
as `eval/coverage-<scanner>.yaml` (SCHEMA §5a). It has no exit code; its fail-loud
property is **completeness** — a coverage row for every domain in the adapter's
`coverage_domains`, a note on every non-scanned row, a fix on every gap — and
anything less halts. A full coverage map with an empty findings list is a
recorded clean run.

## 3. The adapter format (one file per scanner, `adapters/<id>.yaml`)

```yaml
scanner: deep-code-review
targets_taxonomy: 3
contributes:           # the axes this scanner's OWN methodology measures
  - code-correctness   #   (contribution = the axis joins the roster; a scanner may
  - code-security      #    also FEED axes it does not contribute, via map rows)
coverage_domains: [A, B, …]   # optional: the scanner's full taxonomy, when it reports
                              #   per-domain coverage — ingest and validate require a row per entry
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
- **Evidence**: `file:line` where the tool reports one; a repo-level claim cites
  the archived raw report (run-relative `eval/raw/…`), which `validate.mjs
  --target` knows to skip — instrument evidence lives in the run, not the target.
  A secrets tool's matched value is **never copied** out of the raw report; rows
  carry rule id + location only.
- **An adopted instrument runs offline, against the checkout under review.** A
  tool that needs a remote API at run time is a forever-fail in any environment
  without that reach, and a scanner that cannot run is worse than none: every run
  would have to dispose of it, and its absence reads as coverage. Such a tool may
  be integrated, but not adopted.

Adopted instruments: **gitleaks** (`adapters/gitleaks.yaml` — every leak is one
`secret` category row onto `code-security`; corroborates the delegation
credential census) and **fresh-clone** (`adapters/fresh-clone.yaml`, below).
**OpenSSF Scorecard** (`adapters/scorecard.yaml`) is
integrated but **retired from the adopted roster** (2026-09-15): its checks are
remote repository-configuration reads that need direct GitHub API access at run
time. The wider candidate roster: `scanner-candidates.md`.

### 3b. The fresh-clone instrument (`tools/fresh-clone.mjs`)

**What it measures.** Whether the repository is true from a clean checkout — the
reproducibility and verification floor the descriptor register asks a scripted
fresh-clone run to prove (`d-fresh-clone-runs`, `d-tests-execute-core`,
`d-lint-typecheck-gate`, `d-schema-versioned`, `d-readme-true`). It clones the
target into a scratch directory (`git clone --depth 1`; `--no-clone` runs in place
for fixtures and CI checkouts), detects the toolchain from what is present
(package.json + lockfile kind; engines / `.nvmrc` / `.tool-versions` recorded as
the declared toolchain; a second family such as pyproject is recorded
`not-supported`, never half-run), runs the declared steps **install, build, lint,
typecheck, test, migrate** (the package scripts of those names; install when
dependencies or a lockfile are declared; migrate only through a
`DATABASE_URL`-free dry form — `migrate:dry` / `migrate:check` / `migrate:status`
/ `--dry-run` — because the runner carries no database), and replays the README's
command claims: every fenced-block line starting `npm run <script>`, `npm test`,
`npx <bin>`, `node <file>` or `make <target>` is a claim, `present` when the
script / binary / file / target exists in the tree, else `missing`. Each step
records its command, exit code, duration, the last 40 lines of output and one of
the closed statuses `passed | failed | not-declared | timed-out | skipped`. **A
step that is not declared is `not-declared`, never `passed`.**

**Success set.** The runner's exit is `0` when every declared step passed and
every claim is present, `1` when at least one step failed or timed out or a claim
is missing; both are successful runs and `ingest.mjs --tool fresh-clone` accepts
both. A crash of the runner itself exits `2` and halts the intake. The converter
writes one gap row per failed / timed-out step, one per **not-declared** lint,
typecheck, test or migrate (the floor is worded so absence is a gap, not clean),
and one per missing README claim (`readme-claim`, evidence `README.md:<line>`);
`High` for a failed or timed-out install / build / test, `Medium` otherwise. A
clean run is the explicit empty `findings-94-fresh-clone.yaml`. Rows carry the
command and exit code only — the output tail stays in `eval/raw/fresh-clone.json`,
so a value a build prints can never reach a findings base. Categories land on the
axes the register already homes those floor rows on: install / build / migrate on
`context-economy`, lint / typecheck / test on `deterministic-gates`, `readme-claim`
on `artifact-legibility`.

**Workspaces (#127).** An npm-workspaces root is not one repository, it is
several: a root that is only a workspaces shell (no scripts, no dependencies, no
lockfile of its own) reads honestly as "six steps not declared" — that used to be
mistaken for the whole picture while the apps underneath it failed `npm ci` from a
clean clone. The runner resolves `workspaces` (an array, or `{packages: [...]}`;
globs `dir/*` and `dir/**`, and a plain path, resolved with zero dependencies) and,
when the root declares none but `apps/*` or `packages/*` exist with their own
`package.json`, treats those as workspaces too. The step plan then runs once per
workspace, in its own directory, **in addition to** the root. Install is the one
step handled specially: when the root carries a lockfile, a workspace installs via
`npm ci --workspace <path>` run from the root (the lockfile covers the whole
tree); when it does not, the workspace's own plan runs in its own directory — which
reproduces the real `EUSAGE` failure npm gives a workspace whose own lockfile
disagrees with a root that has none, and that failure is the honest result,
recorded like any other step failure. The document carries this as `workspaces:
[{ path, toolchain, steps, readme, readme_claims }]` beside the root's existing
fields, unchanged; `exit` is `1` when the root **or any workspace** has a failed or
timed-out step or a missing claim. A workspace-free repo emits `workspaces: []`
and nothing else about the document changes. `ingest.mjs` emits the same per-step
and per-claim gap rows for each workspace as it does for the root, with
`native_id` prefixed by the workspace path (`apps/x:install:failed`) so two
workspaces failing the same step never collide, and evidence scoped to the
workspace's own manifest or README (`apps/x/package.json:1`, `apps/x/README.md:12`)
— `native_category` stays the plain, closed step name (`install`, `build`, …,
`readme-claim`) the adapter map below already knows, so a workspace row projects
exactly like a root row. A document with no `workspaces` key at all (a runner from
before #127) still converts exactly as it always did.

**What it deliberately does not do.** It never executes a README command beyond
the declared steps it already ran — presence in the tree is what the claim replay
decides, and a `missing` claim is a gap; a `present` one is not proof the command
works. It does not run a migration against a live database, does not attempt a
toolchain family it cannot exercise, and does not read step output into rows.

```sh
node tools/fresh-clone.mjs <target-dir | git URL> --out fresh-clone.json [--timeout 600] [--no-clone]
node tools/ingest.mjs <run-dir> --tool fresh-clone --raw fresh-clone.json --exit <its exit code>
```

**Descriptor category as a list (`registry/descriptors.yaml`, #123).** A
`decide.category` in the register may name one native category or a list of them
— two rows one instrument decider must hold jointly, such as fresh-clone's
`[install, build]` for `d-fresh-clone-runs` or `[lint, typecheck]` for
`d-lint-typecheck-gate`. A finding matches the descriptor when its
`native_category` is **any** listed value; the descriptor reads **met** only when
**every** listed category is met by the single-category rules above (`registry/
README.md` has the full decider table). This is a register-side reading of the
same rows the adapter maps one at a time — the adapter's `map:` stays keyed by one
native category each; nothing here widens what a category means to it.

## 4. The fail-closed rule (the coherence guarantee)

A finding whose `native_category` matches **no** row in its adapter is a
**projection error** naming the unmapped category — `default: FAIL` is the only
sanctioned default; a `default:` of any axis is prohibited. Determinism applied
to integration: a scanner adding a category surfaces as "add one mapping
row," never as findings silently missing from a profile (the asymmetric-failure
logic of an allow-list — a forgotten allow blocks loudly).

## 4a. The run manifest (absence is recorded, never inferred)

The fail-closed rule above covers a finding the engine cannot place. Its
complement covers a scanner the run never invoked: **every run carries
`eval/scanners.yaml`**, one row per adopted scanner — `ran`, `skipped` with a
reason, or `failed` with the error (`SCHEMA.md` §5a). `validate.mjs` rejects a
run without it, a skip without a reason, a `ran` with no rows and no explicit
empty file, and rows from a scanner recorded as not run; `compile-package.mjs`
validates before it compiles anything. Every renderer then names a scanner that
did not run with its recorded reason. An integration that can be omitted
without a recorded decision reads as coverage; this is what makes "not
measured" a statement rather than a default.

**A scanner's own coverage qualifies the axis.** Where a scanner reports
per-domain coverage (`coverage-<scanner>.yaml`), an axis it contributes is fully
measured only where every mapped domain was scanned; a partial or skipped domain
makes the axis **partially measured**, said in words with the scanner's note, in
the walk, the index, and the report. The scanner's taxonomy can grow (deep-code-
review 1.71 added S, T, W); `default: FAIL` catches a new letter loudly and the
fix is one mapping row.

**Retirement is a recorded decision, never a deletion.** An adapter that carries
`adopted: false` (with a `retired:` note) leaves the roster a run must dispose
of and no longer widens the not-measured registry, but stays loadable so frozen
runs that carry its rows still project.

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
