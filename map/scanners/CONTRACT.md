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
[`CANDIDATES.md`](/map/scanners/CANDIDATES.md).

`taxonomy_version: 3`

## 1. The axis model

An **axis** is a property of the target a scanner measures — never the name of a
tool. The roster is **flat** (no subject hierarchy) and **derived from the
present adapters**, never hardcoded:

- Every scanner — the native seven-dimension method included — **contributes**
  axes through its adapter's `contributes:` list: the axes its own methodology
  measures. repo-eval contributes the seven dimension axes; the code reviewer
  contributes *code-correctness*, *code-maintainability* and *code-security*.
- **Axes are shared.** Any scanner may **feed** an axis it does not contribute
  (the code reviewer's testing findings land on `deterministic-gates`, its
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
source: <reviewer>                # scanner id (matches adapters/<id>.yaml); "repo-eval" for native passes
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

**A peer scanner with a machine report comes in through `map/ingest.mjs`** the
way an instrument does, by the format its adapter's `ingest:` names (§3): the
`machine-report` format reads one YAML file per run (`review` / `ground_truth` /
`coverage` / `findings`); `ingest.mjs --tool <reviewer> --raw <file>` converts its rows into the port (native id and
domain letter kept; `title`, `confidence` mapped onto the closed vocab with the
native label beside it, `tag` as `native_tag`, `latent`, `mechanism_unproven`,
`resolves_with`, `prior_native_id` / `prior_status` carried as extension fields)
and archives its per-domain coverage as `map/coverage/<scanner>.yaml` (SCHEMA
§5a). It has no exit code; its fail-loud property is **completeness** — a
`review` header naming the tool the adapter's `ingest.tool` accepts and a `skill_version` at or above the adapter's
`min_version`, a coverage row for every domain in the adapter's
`coverage_domains`, a note on every non-scanned row, a fix on every gap — and
the upstream field rules: a strength row carries no severity, an `unverified` row
names what would settle it (`resolves_with`), a `prior_status` names its
`prior_id`, and a prior finding re-verified `fixed` is filed as a strength.
Anything less halts. A full coverage map with an empty findings list is a
recorded clean run.

## 3. The adapter format (one file per scanner, `adapters/<id>.yaml`)

```yaml
scanner: <reviewer>
targets_taxonomy: 3
role: judgment         # judgment (run by a session; the default) | instrument (§3a)
method: dcr            # optional — the method class a known-answer sheet's detectable_by
                       #   names (map/score.mjs); without one, the scanner id
ingest:                # optional — how map/ingest.mjs reads this scanner's report when
  format: machine-report   #   no built-in profile does: the format,
  tool: <reviewer>     #   the review.tool value a report must carry,
  start_id: 800        #   and the id floor its rows are numbered from
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
handoff:               # optional — how the handoff bundles and proves this scanner's
                        #   remedies (§7); block style only, same as everything below
  unit: finding         # finding (default) | file | scanner — §7
  client_proof: "…"     # a proof the repo's own team can run, no assay — §7
capabilities:          # optional — executable specialties the engine routes to (§8)
  - id: verify-fix
    invoke: "re-run the scanner scoped to the finding's evidence path"
```

Block style only — the minimal YAML reader (`lib/yaml-min.mjs`) **throws** on
inline flow maps `{…}`, anchors, and chomped block scalars, so a naturally-written
`{axis: x}` fails loud rather than silently dropping its findings.

**Naming an axis:** name the property, never the tool ("code correctness", never
the reviewer's name), and before minting a new axis check whether an existing one
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
- **Intake is `map/ingest.mjs`, and it fails loud, never empty**
  (fail loud, never empty): the converter requires the tool's actual exit code and halts
  on anything outside the tool's documented success set — a crashed tool must
  never read as "0 findings"; malformed or truncated input halts; a
  verified-clean run (success exit, empty report) is recorded explicitly. Every
  instrument profile ships with regression assertions proving these halts bite
  (`tests/blocks/instrument-port.mjs`).
- **`fix` is optional on an instrument's gaps.** Where the remediation is
  mechanical and rule-determined, the instrument profile supplies it (rotate the
  credential; follow the check's remediation) and it sequences normally; a gap
  without one lands **owner-defined pending** — listed loudly, never dropped.
- **Evidence**: `file:line` where the tool reports one; a repo-level claim cites
  the archived raw report (run-relative `map/raw/…`), which `validate.mjs
  --target` knows to skip — instrument evidence lives in the run, not the target.
  A secrets tool's matched value is **never copied** out of the raw report; rows
  carry rule id + location only.
- **An adopted instrument runs against the checkout under review, without
  needing a repo-hosting platform's own API.** A tool that needs a remote
  *configuration* API (GitHub's, for Scorecard's checks) is a forever-fail in
  any environment without that reach, and a scanner that cannot run is worse
  than none: every run would have to dispose of it, and its absence reads as
  coverage. Such a tool may be integrated, but not adopted. This is distinct
  from a toolchain's own package registry, which install already needs
  (fresh-clone's `install` step runs `npm ci` against it) — dependency-scan's
  `npm audit` reaches the same registry, not a hosting platform's API, and a
  lockfile it cannot reach is recorded `failed`, never silently skipped.
  This is what **offline** means wherever assay says an instrument runs
  offline: no repo-hosting platform's API; a package registry may be reached.
- **What runs, and with what (#47).** Three adopted instruments execute the
  target's code: fresh-clone runs its install (lifecycle scripts included) and
  its declared scripts; dependency-scan runs its package manager's audit;
  structure-scan's knip step imports the target's own tool configuration files
  (§3e). Every child any of them spawns gets the environment of `map/child-env.mjs` — `PATH`,
  `HOME`, `CI`, the `npm_config_*` values the instrument itself sets and the
  network plumbing (`HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`,
  `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`; #65) — and nothing else: no token,
  cloud key, agent socket or `DATABASE_URL` of the evaluator's reaches the
  target. A proxy URL carrying userinfo (`user:pass@`) is a credential: it is
  dropped, and every step or lockfile row run without it carries `env_note`
  saying which and why. Every audit runs in a scratch directory
  holding only one lockfile and its `package.json`, never in the target's tree,
  so the package manager loads none of the target's own configuration (an
  `.npmrc` naming a registry, a yarn classic `.yarnrc` whose `yarn-path` runs a
  file from the tree, a `.pnpmfile.cjs`). This is not a sandbox — the target's
  scripts still run as the evaluator's user, with their filesystem and network
  — so fresh-clone belongs in a disposable container or VM: `assay start` runs
  it only under `--allow-exec` and otherwise records it `skipped` with that
  reason; the routine, whose checkout is a fresh CI job, always runs it, in a
  job of its own that hands the gate only fresh-clone's raw report
  (`routine/README.md` "Two jobs").
  `tests/instruments/exec-planted` (a planted `.yarnrc` and lifecycle scripts)
  and the harness's `isolation` block pin all of this.

Adopted instruments: **gitleaks** (`adapters/gitleaks.yaml` — every leak is one
`secret` category row onto `code-security`; corroborates the delegation
credential census; git mode reads the history of the repository that
CONTAINS its source, so `assay start` and the routine scan only a
repository's own top level — a subdirectory of a larger checkout is recorded
skipped with that reason, a directory in no repository is scanned in
directory mode, and every reported path is relative to the target; its exit
code must agree with its report, 1 with leaks and 0 with none, or the intake
halts),
**fresh-clone** (`adapters/fresh-clone.yaml`, §3b),
**dependency-scan** (`adapters/dependency-scan.yaml`, §3c), **repo-census**
(`adapters/repo-census.yaml`, §3d), and **structure-scan**
(`adapters/structure-scan.yaml`, §3e). **OpenSSF Scorecard**
(`adapters/scorecard.yaml`) is integrated but not part of the adopted roster:
its checks are remote repository-configuration reads that need direct GitHub
API access at run time, which an offline run does not have. The wider
candidate roster: `map/scanners/CANDIDATES.md`.

### 3b. The fresh-clone instrument (`map/fresh-clone.mjs`)

**What it measures.** Whether the repository is true from a clean checkout — the
reproducibility and verification floor the yardstick asks a scripted
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
step that is not declared is `not-declared`, never `passed`.** The test step also
records `tests: {passed, skipped, failed, total}`, read from the runner's own
summary (vitest, jest, node:test, pytest, go test -v) in the step's whole output,
or `tests: unparsed` when no known summary appears, so a reader knows the skipped
share was not checked; and `test_config` when a vitest / jest / pytest config file
sits beside it. **An exit code of 0 is not the suite having run.**

**Success set.** The runner's exit is `0` when every declared step passed and
every claim is present, `1` when at least one step failed or timed out or a claim
is missing; both are successful runs and `ingest.mjs --tool fresh-clone` accepts
both. A crash of the runner itself exits `2` and halts the intake. The converter
writes one gap row per failed / timed-out step, one per **not-declared** lint,
typecheck, test or migrate (the floor is worded so absence is a gap, not clean),
one per missing README claim (`readme-claim`, evidence `README.md:<line>`),
and one `test` gap (`test:skipped`) when the test step **passed with tests
skipped** — the step stays `passed` (its exit code is honest) and the row states
the share ("passed, but 3 of 5 tests (60%) were skipped in a clean checkout"),
cites the test config (else the manifest) and names what the skipped tests need
(a database, where the tree carries a database signal). A **skipped** step (the
install did not pass, so it was never attempted) is one `<step>-not-run` **fact**
row (`test-not-run`, …), never silence: each fresh-clone requirement names its
steps' facts in `decide.not_measured_when`, so a repository whose install fails
reads `d-tests-execute-core` and `d-lint-typecheck-gate` not measured, never met.
Gap rows carry no severity; the views band them (`views/severity.mjs`): `High`
for a failed or timed-out install / build / test, `Medium` otherwise. A
clean run is the explicit empty `map/findings/fresh-clone.yaml`. Rows carry the
command and exit code only, and the archived `map/raw/fresh-clone.json` drops every
step's output tail and a URL target's userinfo (as `map/raw/dependency-scan.json`
drops a failed audit's stderr tail), so a value a build prints can never reach a
findings base or the uploaded run. Categories land on the
axes the yardstick already homes those floor rows on: install / build / migrate on
`context-economy`, lint / typecheck / test on `deterministic-gates`, `readme-claim`
on `artifact-legibility`; each `<step>-not-run` fact lands beside its step.

**Workspaces.** An npm-workspaces root is not one repository, it is
several: a root that is only a workspaces shell (no scripts, no dependencies, no
lockfile of its own) reads honestly as "six steps not declared" — a distinct
reading from the whole picture, since the apps underneath such a root can still
fail `npm ci` from a clean clone even while the root's own six steps read
not-declared. The runner resolves `workspaces` (an array, or `{packages: [...]}`;
globs `dir/*` and `dir/**`, and a plain path, resolved with zero dependencies) and,
when the root declares none but `apps/*` or `packages/*` exist with their own
`package.json`, treats those as workspaces too. The step plan then runs once per
workspace, in its own directory, **in addition to** the root. Install is the one
step handled specially: when the root carries a lockfile, a workspace installs via
`npm ci --workspace <path>` run from the root (the lockfile covers the whole
tree); when it does not, the workspace's own plan runs in its own directory — which
reproduces the real `EUSAGE` failure npm gives a workspace whose own lockfile
disagrees with a root that has none, and that failure is the honest result,
recorded like any other step failure. **pnpm and yarn roots:** the workspace list
comes from `pnpm-workspace.yaml` when it exists (its `packages:` globs, `!`
exclusions honored; pnpm ignores the package.json field), and the root's own
install already installs every workspace, so a workspace's install reads `covered`
by it (or `skipped` when the root install did not pass). No npm command is ever run
against a pnpm or yarn lockfile, and a workspace with no lockfile of its own runs its
scripts with the root's package manager. **Covered by the root:** a step a workspace
does not declare reads `covered` (with `covered_by: { path, step, command, via }`)
when a root step that **passed** demonstrably reaches it — a recursive root command
(`pnpm -r`, `npm … --workspaces`, `yarn workspaces foreach`, `turbo run`, `nx
run-many`, `lerna run`), a root linter pointed at `.` (lint), or a root test runner
given no path argument (test). Migrate belongs to the package that declares it (the
root, else the first workspace that does). A covered step yields no row; a workspace
script that exists and fails is still its own gap; a root step that failed or does
not reach the tree covers nothing. The root's "no database signal" fact is read
across the whole tree, so a database dependency in any workspace counts.
The document carries this as `workspaces:
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
before workspaces) still converts exactly as it always did.

**What it deliberately does not do.** It never executes a README command beyond
the declared steps it already ran — presence in the tree is what the claim replay
decides, and a `missing` claim is a gap; a `present` one is not proof the command
works. It does not run a migration against a live database, does not attempt a
toolchain family it cannot exercise, and does not read step output into rows.

**Where it runs (#35).** A repository with no root `package.json` and exactly one
directory directly beneath the root holding one (`app/`) is that directory's
project — structure-scan's rule for where knip runs — and `--app <dir>` declares it
instead. The steps run there and the root README's commands are replayed as after
`cd <dir>`; the document records `app: { path, from }`, and ingest cites the app's
files from the repository root (`app/package.json:1`). Ingest also places the root
any instrument names (`target.path`: fresh-clone, dependency-scan, repo-census)
against the run's target (`--target`, else `target:` in `map/scanners.yaml`, which
`assay start` writes): inside it, the evidence is rebased onto the target; neither
the target nor inside it, the rows are kept as written and ingest warns with both
paths, never halts (a component-scoped run over a subtree is normal).

```sh
node assay.mjs fresh-clone <target-dir | git URL> --out fresh-clone.json [--timeout 600] [--no-clone] [--app <dir>]
node assay.mjs ingest <run-dir> --tool fresh-clone --raw fresh-clone.json --exit <its exit code> [--target <run target root>]
```

**A requirement's `decide.category` as a list (`yardstick/requirements.yaml`).**
A `decide.category` in the yardstick may name one native category or a list of
them — two rows one instrument decider must hold jointly, such as fresh-clone's
`[install, build]` for `d-fresh-clone-runs` or `[lint, typecheck]` for
`d-lint-typecheck-gate`. A finding matches the requirement when its
`native_category` is **any** listed value; the requirement reads **met** only when
**every** listed category is met by the single-category rules above (`yardstick/
README.md` has the full decider table). This is the yardstick's own reading of the
same rows the adapter maps one at a time — the adapter's `map:` stays keyed by one
native category each; nothing here widens what a category means to it.

### 3c. The dependency-scan instrument (`map/dependency-scan.mjs`)

**What it measures.** Whether a known vulnerability is present anywhere in the
target's npm dependency graph — the floor the yardstick asks a
dependency scanner to clear (`d-dependencies-known-clean`, decided on its
`critical` category). It walks the tree (skipping `node_modules/` and `.git/`)
for every `package-lock.json` / `npm-shrinkwrap.json` and runs `npm audit
--json` against each, with no install. The walk keeps to the repository's own
files (#100): a git top level is walked over the files it tracks, and any other
directory skips what its own `.gitignore` files exclude (read by git against a
scratch repository, never an enclosing one's rules or the evaluator's global
excludes), so the output of a build fresh-clone ran in place (`dist/`, a
framework's `.next/standalone/`) is never a manifest or a lockfile on the
record. The document's `scope.rule` says which (`tracked`, `gitignore`, or
`all` with a `reason` when git could not be run: the whole tree walked, which
can only add manifests nothing audited, never a clean that was not earned). Every lockfile — npm, pnpm or yarn — is
audited from a scratch directory holding only it and its `package.json`
(`method: scratch-copy`; documents from before #47 also carry `in-place`),
never in the target's tree (§3a, "What runs, and with what").
Every `pnpm-lock.yaml` is audited with `pnpm audit --json` and every yarn classic
`yarn.lock` with `yarn audit --json`, from the lockfile alone; both report npm's v6
advisory objects, recorded in the same rows. When the lockfile's package manager is
not on the runner, or the lockfile is yarn berry (whose `yarn npm audit` this
instrument does not drive yet), the lockfile is `not-run` with the reason: the
instrument's limit, never charged to the target as a gap, and never read as clean.
Each lockfile records its path, its package manager, audit method, the audit's own exit code,
severity counts, dependencies audited, and one advisory row per (advisory id,
package): the id (GHSA when the advisory's url names one, else the npm source
id), the package, its installed version(s) read straight out of the lockfile,
the vulnerable range, severity, whether npm reports a fix available, and the
advisory url.

**Success set.** npm audit's own exit is `0` when a lockfile carries zero
advisories and `1` when it carries any — both are successful AUDITS. Any other
exit code, a timeout, a spawn failure, or output that does not parse into npm's
`vulnerabilities` + `metadata` report shape (an npm *error* document — no
registry reachable is exactly this shape) makes that lockfile `status: failed`,
never clean. The runner's own document `exit` is `0` only when every lockfile
in the tree audited with zero advisories; `1` when any advisory exists, any
lockfile failed, or any lockfile was not run; both are successful RUNS and
`ingest.mjs --tool dependency-scan` accepts both. A crash of the runner itself
exits `2` and halts the intake. The converter writes one gap row per advisory
(`native_category` = its own severity — `critical | high | moderate | low |
info` — which the views band `Critical | High | Medium | Low | Low` respectively
(`views/severity.mjs`; the row itself asserts no severity), evidence
the lockfile at `:1`), one gap (`lockfile-failed`) per failed lockfile, and one
`lockfile-not-audited` **fact** per lockfile nothing audited (failed, or not-run).
That fact holds `d-dependencies-known-clean` at not-measured unless a real critical
advisory decides it: an unaudited lockfile is not a clean one (before the fact
existed, a run whose only lockfile went unaudited read met). A clean run is the
explicit empty `map/findings/dependency-scan.yaml`. Every category lands on
`code-security` — the shared property gitleaks and the code reviewer also feed.
(`lockfile-unsupported` stays mapped for runs frozen before 0.2.0, which filed a
pnpm/yarn lockfile as a gap.)

**What it deliberately does not do.** It never runs `npm install` or otherwise
mutates the tree — the existing lockfile is read as-is. It never audits a
yarn berry lockfile, or a lockfile whose package manager is not on the runner
(each is `not-run` with the reason, never guessed at), and it never infers an
installed version or a fix from anything but the lockfile and the package manager's own audit report.
It needs the npm registry to resolve advisories — the same reach `npm ci`
already needs in fresh-clone's `install` step — never a repo-hosting
platform's own configuration API (§3a); a lockfile it cannot reach is `failed`,
never clean.

```sh
node assay.mjs dependency-scan <target-dir> --out dependency-scan.json [--timeout 300]
node assay.mjs ingest <run-dir> --tool dependency-scan --raw dependency-scan.json --exit <its exit code>
```

### 3d. The repo-census instrument (`map/repo-census.mjs`)

**What it measures.** Four floor rows a run could not decide before except by an
LLM-authored census (`d-architecture-page`, `d-agent-contract`, `d-runbook`,
`d-ci-gate-on-default-branch`), decided deterministically from the tree, read-only,
offline, zero deps, plus six owner-evidence transcript checks (below). Four
tree checks:

- **architecture-page** — ARCHITECTURE.md / docs/ARCHITECTURE.md /
  docs/architecture.md / docs/architecture/*.md (case-insensitive), or a README
  "Architecture" section. `pass` only when it also **names** an external service or
  data store (a heading or line mentioning database / queue / API / service / store
  / bucket / provider, or a mermaid / diagram block) — presence alone is not
  enough. In a **monorepo** (package.json `workspaces`, or `apps/*/package.json`,
  or `packages/*/package.json`) it runs at the root **and** at every app, one check
  per location. A location with no page of its own is **covered by the root**
  (`pass`, citing the root's line) when the root's page passes and names it, by
  its path (`apps/api`) or its scoped package name (`@org/ui`); a bare package
  name is never matched, and a root README counts only its Architecture section.
  A location that has its own page is checked on that page.
- **agent-contract** — AGENTS.md or CLAUDE.md (root and per app, same monorepo
  rule, root cover included: a passing root contract that names the location). `pass` only when it is **present-tense**: no heading matching
  `/^#+\s*(status|history|changelog|todo|backlog)\b/i` and no dated changelog line
  (a line starting with a date like `2026-09-01`, or a `- 2026-…` bullet).
- **runbook** — RUNBOOK.md or RUNBOOKS.md at the root or in docs/, docs/runbook*.md,
  a runbook(s)/ or docs/runbook(s)/ directory (every `.md` in it, read together and
  cited file by file), or a README/doc section headed "Runbook" or "Operations". `pass` only when it carries a heading
  or paragraph for **each** of restart, roll back, rotate (a key/secret/credential),
  and restore (a backup). Presence of the words is what this decides — whether a
  procedure was ever actually **run** is a separate claim, one only the owner's
  evidence can make, said in the observation every time.
- **ci-gate** — every `.github/workflows/*.yml|.yaml`, read with a minimal
  line-based reader (zero deps, no YAML library; handles the common shapes: `on:
  [push, pull_request]`, block-form `on: / push: / branches: [main]`,
  `pull_request:` with no filters). A workflow **gates** when it triggers on
  pull_request (or push to the default branch — `--default-branch`, else `git
  symbolic-ref refs/remotes/origin/HEAD`, else `main`) and runs a step whose
  `run:` invokes a test / lint / typecheck / build command (npm / pnpm / yarn
  test|lint|typecheck|build, `tsc`, `jest`, `vitest`, `pytest`, `go test`, `cargo
  test`, `make test`, `deno test` / `bun test`, `node --test`, or `node` running a
  file in a `test/` / `tests/` directory or named `*.test.*` / `*.spec.*`). It **fails open** — a gap, cited by file:line — when the
  gating job or step carries `continue-on-error: true`, or the step's own `run:`
  script swallows a non-zero exit (a command ending `|| true` / `|| exit 0` /
  `|| :`, or a `set +e` line anywhere in a multi-line block-scalar script,
  disabling errexit for the rest of it); a gate that can fail open is not a gate.

**Success set.** `exit` is `0` when every check reads `pass`, `not-applicable`, or
`not-measured` (the last, owner-evidence-only, means the checkout could not
confirm a transcript's commit either way — never a failure of the tool itself),
`1` when at least one check is a `gap`; both are successful runs and `ingest.mjs
--tool repo-census` accepts both. A crash of the runner itself exits `2` and halts
the intake. The converter writes one gap row per `gap` check and one strength row
per `pass` check (so the axis sees the evidence, not just the absence of a gap); a
`not-measured` check (the six owner-evidence checks only — below) yields a FACT
row in its own `<check>-unverifiable` category, never the check's own category, so
the requirement it decides reads not-measured rather than a silent met; a
`not-applicable` check (the same six, over a tree with no deployment signal —
below) likewise yields a FACT row in its own `<check>-not-applicable` category,
so the requirement reads not-applicable, never met by silence. Rows carry no
severity; the views band every gap `Medium` (`views/severity.mjs`), except a
ci-gate gap from a fail-open step — recorded on the row as the fact `fail_open:
true` — which reads `High`: a gate that can be turned off from inside the
workflow is worse than no gate recorded. Rows carry the
check's own evidence (`file:line`) or, where a check has nothing more specific to
cite (an absent file, an absent workflow directory), a `<location>/:1`-style path
into the target; every row carries at least one.

**What it deliberately does not decide.** Whether a runbook's procedures were ever
actually **run** — only that the words for each are present — stays with the
owner's evidence. Whether a CI check is **required** by branch protection is not
visible from a checked-out tree at all; every ci-gate observation says so. Neither
is inferred, guessed, or defaulted to met.

**The packet's pointers.** With `--packet <dir | manifest.yaml>`, or with no flag
when `<target>/packet/manifest.yaml` exists (the self-describing case — recorded
in the output either way as `packet: { path, auto, pointers_used }`), the
repository's own packet (`owner/PACKET.md` "Pointers" is the one home of the
format) is loaded and validated first; an invalid packet halts this runner with
the validator's own lines, same crash rule, exit `2`. A pointer is then
authoritative, never a hint, for the check(s) it names: `default_branch` beats
discovery (a `--default-branch` flag still beats both); `apps` replaces monorepo
detection for the per-location checks (architecture-page, agent-contract) — an
app path that does not exist is a `gap` for that location, naming it;
`architecture` / `agent_contract` / `runbook` / `evidence` / `workflows` each make
their check read exactly the named path(s) instead of searching, and a pointer to
a missing path is a `gap` naming it, never a silent fallback to discovery. A check
that followed a pointer says so in its observation.

**The six owner-evidence checks**.
Six more floor rows describe things a repository cannot show by itself — a
backup was restored, a rollback ran, a deploy came up as the committed sha, a
smoke check hit the deployed app, a monitoring alert fired and was received,
cost alerts are named per metered account. `repo-census` checks a dated
transcript, named `evidence-<descriptor-id>`
(`d-backup-restore-exercised`, `d-rollback-exercised`, `d-deploy-one-command`,
`d-smoke-on-deployed`, `d-monitoring-with-alert`, `d-cost-alerts`), root only —
**a person who ran the procedure commits it, or a CI job writes it from the
procedure's own output; an agent never writes one** (`produced_by: ci | person`
says which, `owner/evidence/README.md`). It decides the transcript's shape,
freshness, and that its named `commit` resolves in the checkout's history —
never the truth of what it describes, which rests on the named person's or CI
job's attestation in version history. A commit genuinely absent from a real,
full history is a `gap`, naming it; a checkout that cannot say either way (no
`.git`, or too shallow to know) reads `not-measured`, never `pass` — the check
refuses to guess. The format — path, header keys, per-row keys, body minimum,
freshness window — is documented once, at `owner/evidence/README.md`; this is
the one home of it.

**The deployment signal.** The six rows ask for proof about a deployed
application, so they apply only where the tree shows one. Before reading any
transcript, the census walks the whole tree (skipping `.git`, `node_modules`,
`.venv`, `venv`, `__pycache__`) and records every **deployment signal** in the
document's `deployment.signals` (`kind`, `path`, what it is):

- `container` — a `Dockerfile` / `*.dockerfile` / `Containerfile`, or a
  `docker-compose*.yml` / `compose*.yml`;
- `hosting` — a hosting config: `vercel.json`, `now.json`, `netlify.toml`,
  `fly.toml`, `render.yaml`, `railway.json|toml`, `Procfile`, `app.yaml|yml`,
  `app.json`, `heroku.yml`, `firebase.json`, `wrangler.toml|json|jsonc`,
  `amplify.yml`, `apprunner.yaml`, `Dockerrun.aws.json`, `.platform.app.yaml`,
  `cloudbuild.yaml|yml`, `appspec.yml`, `samconfig.toml`;
- `infrastructure` — infrastructure-as-code or a service manifest: `*.tf`,
  `*.tfvars`, `*.bicep`, `Pulumi.yaml|yml`, `serverless.yml|yaml`, `cdk.json`,
  `Chart.yaml`, `kustomization.yaml|yml`, `skaffold.yaml`;
- `deploy-workflow` — a CI config (`.github/workflows/*.yml|yaml`,
  `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`,
  `bitbucket-pipelines.yml`, `Jenkinsfile`) whose text says `deploy`;
- `server` — a server entry point (`server.{js,mjs,cjs,ts,mts,py,go,rb}`,
  `manage.py`, `wsgi.py`, `asgi.py`); a `package.json` with a `start`, `serve`
  or `deploy` script or a web-framework dependency (express, fastify, koa, hapi,
  restify, hono, next, nuxt, NestJS, Remix, SvelteKit, sails, AdonisJS); a
  Python manifest (`requirements*.txt`, `pyproject.toml`, `Pipfile`) naming a web
  framework or server (flask, django, fastapi, starlette, uvicorn, gunicorn,
  aiohttp, tornado, sanic);
- `evidence` — an owner evidence directory (`ops/evidence/` or `docs/evidence/`,
  root) or the packet's `evidence` pointer: the owner already keeps transcripts;
- `unwalked` — a tree past 20000 entries the walk did not finish: not ruled out.

With **no** signal, each of the six checks reads `not-applicable`, citing the
root, its observation naming what was looked for — never `pass`, and the
requirement reads not-applicable, never met. With **any one** signal, every
check is read exactly as above and a missing transcript is a `gap`. The list is
deliberately conservative: any doubt keeps the rows measured. A real service
that deploys from somewhere the tree does not show (a console, another
repository) still reads not-applicable; the signal states what the tree shows,
and widening it is a reviewed change here, never a silent one.

```sh
node assay.mjs repo-census <target-dir> --out repo-census.json [--default-branch main] [--as-of YYYY-MM-DD] [--evidence-max-age 90] [--packet <dir|manifest.yaml>]
node assay.mjs ingest <run-dir> --tool repo-census --raw repo-census.json --exit <its exit code>
```

### 3e. The structure-scan instrument (`map/structure-scan.mjs`)

**What it measures.** How the code is built to be changed, on the shared
`code-maintainability` axis: duplicated blocks, unused files / exports /
dependencies, files named as abandoned, and how often each file changes. Two
tools do the first two and the instrument does the rest from the tree:

- **jscpd** (MIT) — duplicated blocks, its JSON reporter, run over the
  checkout's source only: `--format` names the code languages (JavaScript,
  TypeScript, JSX / TSX, Python, Go, Ruby, Java, Kotlin, Rust, PHP, C#, Swift,
  CSS / SCSS, SQL, shell, Vue, Svelte) and `--ignore` drops lockfiles
  (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), generated migration
  snapshots (`**/migrations/meta/**`), minified files and `dist/`, `build/`,
  `.next/`, `coverage/`, `vendor/`, `__snapshots__/`, `node_modules/` and
  `.git/`, because a clone pair in a lockfile, a data file, a prose page or
  generated output is not the claim a `duplicate` row makes. Test and fixture
  directories stay in scope, flagged on the row. It only reads files.
- **knip** (ISC) — unused files, exports, types, enum / namespace / class
  members and dependencies, its JSON reporter, run in the checkout. It imports
  the target's own tool configuration files (`vite.config.*`,
  `eslint.config.*`, …) to find entry points, which runs the target's code, so
  it runs only where fresh-clone may (§3a, "What runs, and with what"): `assay
  start` passes `--no-exec` unless given `--allow-exec`, and knip then reads
  `skipped` with that reason. The two-job routine template runs structure-scan
  in its target job, the one job that executes the target, after fresh-clone's
  install there, and hands the report to the gate job, which never runs it
  (#128). knip runs at the root when it holds a `package.json`, else in the one
  directory directly beneath it that does (an application kept whole in
  `app/`, #119), its rows' paths written relative to the repository root and
  `knip.root` recording where it ran; with no such directory, or more than one,
  knip reads `not-applicable`, the candidates named, never clean. Those configuration files import the
  target's dependencies, so knip needs them installed (#118): with
  `node_modules` at the root it runs in place (the routine runs structure-scan
  after fresh-clone's in-place install); with none, dependencies declared and a
  lockfile naming the package manager (`package-lock.json` → `npm ci`,
  `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`, `yarn.lock` → `yarn
  install --frozen-lockfile`, each with `--ignore-scripts`), they install into a
  scratch copy of the tree, never into the target, and knip runs there; that
  package manager absent from PATH or its install failing reads knip `skipped`
  with the reason. With no lockfile knip runs in place, and a configuration
  file it cannot load for a module that is not installed reads `skipped`, the
  module named. A failure with the dependencies present stays `failed`; either
  reason keeps the first three `ERROR:` lines knip printed, not only its last.
- **stale artifacts** — every tracked file (`git ls-files`, else a walk
  skipping `node_modules/` and `.git/`) whose last token before the extension
  is `old` (`x_old.ts`, `x-old.ts`, `x.old.js`, `x.old`; never a word inside a
  name, as in `retire_old_roles.sql`), named `*.bak` or `*.orig`, with a copy
  suffix (`x copy.js`, `x-copy 2.js`, `Copy of x`), or a `*-vN*` beside a
  higher `-vM` of the same name in the same directory. A file under a
  `migrations/` directory is never a stale artifact, whatever its name: a
  migration's name is history by design.
- **churn** — commits touching each file in the last 90 days (`git log
  --since=90.days.ago --format= --name-only --relative`), or, with a shallow
  checkout or no history, the fact `history: shallow | none`, never a guess.

Both tools are installed **at run time** from the npm registry, at the
versions pinned in `TOOLS`, into a private scratch directory (`npm install
--prefix <scratch> --ignore-scripts`), with the allow-listed environment of
`map/child-env.mjs`, and removed afterward; neither is ever a dependency of
assay. The registry is the reach fresh-clone's install already needs (§3a,
"offline"). Each tool's record in the document carries the version it ran.

**Success set.** jscpd is run with no `--threshold` or `--exit-code`, so its
findings never change its exit: `0` is its one success. knip exits `0` clean
and `1` with issues; both are successes. Any other exit, a timeout, or a report
that does not parse into its shape reads that tool `failed`, with the exit in
the reason; npm absent from PATH, or an install that fails (no registry
reach), reads it `skipped`, with the reason. The runner's own `exit` is `0`
when every tool ran (or is not-applicable) and nothing was found, `1` when
anything was found or any tool did not run; both are successful runs and
`ingest.mjs --tool structure-scan` accepts both, checking the document's exit
agrees with its content. A crash of the runner itself exits `2` and halts.

**Rows.** One `duplicate` gap per clone pair (evidence: both copies' first
lines; `detail.lines` and `detail.tokens`), one `unused` gap per unused item
(`file:line` where knip gives one, else `:1`; `detail.kind` and `detail.name`;
a file, export, type or member row says `unconfigured: true` when the run
recorded no knip configuration in the target, `tools.knip.config: null` — knip
then cannot see a module reached by path, #121),
one `stale-artifact` gap per stale file (`detail.pattern`). Every such row's
`detail` carries `churn_90d` (for a pair, the larger of its two files) or
`history: shallow | none`; a pair whose two copies both sit under a test path
(a `test`, `tests`, `__tests__`, `spec`, `specs`, `e2e`, `fixtures`,
`__fixtures__` or `__mocks__` directory, or a `*.test.*` / `*.spec.*` file)
also says `test: true`, so a view or a row can treat it apart. A jscpd that ran
yields one `duplicate-statistics` fact whose `detail` records its totals over
the source it read (`lines`, `duplicated_lines`, `percentage`, `sources`): the
denominator, never a severity; a jscpd report without them reads jscpd
`failed`. A tool `skipped` or `failed` yields one fact, `duplicate-not-run` or
`unused-not-run`, citing the archived raw report and saying which and why; a
tree with no `package.json` for knip to run in yields one `unused-not-applicable`
fact, carrying the reason. So a tool
that did not run never reads as zero rows, and a run record's
`structure-scan: ran` means the instrument ran, with each tool's own
disposition on these facts and in the archive. Rows carry no severity (the
views band; until they do, these gaps are unrated) and no code: the document
drops jscpd's duplicated `fragment`, and ingest drops it again from
`map/raw/structure-scan.json`, which keeps both tools' reports otherwise. A
clean run is the explicit `map/findings/structure-scan.yaml` holding that
statistics fact alone.

**What it deliberately does not do.** It measures no cycles and no complexity
(madge and lizard are listed second-line in `CANDIDATES.md`), asserts no
threshold on any count, and never runs knip where the target's code may not run.

```sh
node assay.mjs structure-scan <target-dir> --out structure-scan.json [--timeout 300] [--no-exec]
node assay.mjs ingest <run-dir> --tool structure-scan --raw structure-scan.json --exit <its exit code>
```

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
`map/scanners.yaml`**, one row per adopted scanner — `ran`, `skipped` with a
reason, or `failed` with the error (`SCHEMA.md` §5a). `validate.mjs` rejects a
run without it, a skip without a reason, a `ran` with no rows and no explicit
empty file, and rows from a scanner recorded as not run; `views/compile.mjs`
validates before it compiles anything. Every renderer then names a scanner that
did not run with its recorded reason. An integration that can be omitted
without a recorded decision reads as coverage; this is what makes "not
measured" a statement rather than a default.

**A scanner's own coverage qualifies the axis.** Where a scanner reports
per-domain coverage (`map/coverage/<scanner>.yaml`), an axis it contributes is fully
measured only where every mapped domain was scanned; a partial or skipped domain
makes the axis **partially measured**, said in words with the scanner's note, in
the walk, the index, and the report. The scanner's taxonomy can grow (the code
reviewer's 1.60 added T and W); `default: FAIL` catches a new letter loudly and the
fix is one mapping row. The adapter's `min_version` is the oldest report ingest
accepts; `verified_against` is the release last checked against the adapter.

**Not-adopted is a recorded decision, never a deletion.** An adapter that carries
`adopted: false` (with a `retired:` note stating why) leaves the roster a run
must dispose of, without adding to the not-measured registry, but stays loadable
so a run that carries its rows still projects.

## 5. Evolution across the seam

- **A scanner evolves** (new/renamed category, rescaled severity): the adapter
  absorbs it; an unmapped category fails closed; severity normalization is one
  file.
- **We evolve** (revise the axis model): bump `taxonomy_version`; each adapter
  declares `targets_taxonomy`. Findings are stored raw (native category +
  evidence) alongside the projection, so re-projecting onto a new taxonomy version
  is cheap and lossless — no re-scan.

## 6. What the engine guarantees back

- **Evidence and native ids survive**, so any profile line traces to its scanner
  and re-runs.
- **Severity is respected, never recomputed into a verdict.** Counts and severity
  are displayed; the engine issues no deploy/no-deploy gate — it reports
  properties and risks per axis and leaves the go/no-go to the owner
  (illuminate over enforce: severity is a property, the go/no-go is the reader's).
  Likewise stage and urgency: a scanner's `not-applicable` is an observation, and
  what is demanded now is a reader's lens above the measurement; the engine takes
  no stage input (`yardstick/README.md`, "Stage and urgency are a reader's lens").
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

**The sequence** (one numbering, shared by the handoff's items 1..N and the
report's §6, `views/improve/sequence.mjs`): the reviewer's own roadmap
(`views/improve/prose.yaml` `roadmap:`), in authored order, leads; then one
**triage** item per scanner that declares `handoff.triage: true`, covering every
open gap from that scanner the roadmap did not absorb; then every remaining
scanner-fix remedy, grouped per its adapter's declared `handoff.unit`, worst
severity first. No adapter is named in the engine's sequencing code — every
scanner is treated the same way by its own declared unit.

**An adapter's optional `handoff:` block** (block style only, same as `map:` and
`capabilities:` above) tells the engine how to bundle and prove that scanner's
remedies, never how to classify them:

- `unit:` — how open gaps from this scanner become ONE remedy: `finding`
  (default — today's dedupe by identical verbatim `fix`), `file` (one remedy per
  evidence file, every open gap in it — a lockfile with ten advisories is one
  remedy, not ten), or `scanner` (one remedy for the whole scanner's remaining
  open gaps).
- `triage: true` — this scanner's remedy is a read-first bucket (confirm what is
  live before fixing anything — gitleaks): sequenced right after the roadmap,
  always gets a session prompt, and implies `unit: scanner`.
- `client_proof:` — one plain sentence: a proof the repository's OWN team can
  run, with the repository's OWN tools, no assay. May use `{paths}` (the
  remedy's evidence files, `:line` stripped, deduped) and `{dirs}` (their parent
  directories). A scanner with none declared reads "no proof you can run without
  assay is declared for `<scanner>`" — never silence. This is **Your proof**;
  the engine's own `capabilities.verify-fix` (re-running the scanner) is **Our
  re-check** — every remedy carries both.

A finding of Critical severity, or a triage item, sitting outside the roadmap is
**loud, never silent**: the handoff prints a stderr note naming the ids and
their sequence numbers, and `START-HERE.md` carries the same fact in one line.

## 8. Layer summary

| Layer | Owns | Does not |
|---|---|---|
| **Scanner** | its method, its findings, `fix` content, executable specialties | classify into our axes; author the unified report/handoff |
| **Adapter** | native-category → axis; the `contributes:` declaration; severity normalization; capabilities | reimplement checks; guess a finding's axis |
| **Engine** | the axis roster, the report + per-axis walk, handoff (dedup/sequence/bundle/interview), routing | rewrite a scanner's fix; recompute severity into a go/no-go |
