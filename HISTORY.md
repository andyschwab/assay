# HISTORY — assay

Append-only dated log. The contracts (`README.md`, `CLAUDE.md`, `map/SCHEMA.md`,
`map/METHOD.md`, `map/scanners/CONTRACT.md`) describe the present; this file
records how it got that way. Client names, run data, and calibration records
stay in the private deployments that produced them — entries here carry only
what the public engine learned.

- **2026-08-18 — initial public release** (`40b5b17`, Apache-2.0). The engine
  extracted from the private framework that grew it: the seven-dimension method
  (`METHOD.md`), the finding schema + validator, the axis-roster projection with
  per-scanner adapters (peer + instrument roles), the compilers (report, walk,
  handoff, package, PDF), the determinism instruments (enumerate, variance,
  score, backlog, canon), and the public regression harness pinned on the
  known-answer fixtures ([assay-fixtures](https://github.com/andyschwab/assay-fixtures):
  notesbox 100% recall, cleanlib 0 false positives). Roughly a dozen real
  evaluations shaped the method before release; their lessons ride in the
  harness as permanent invariants.
- **2026-08-18 — field fixes from the first all-integrations run** (PR #1). The
  maturity ladder gains a row for every native dimension so an authored census
  can never be silently dropped (multiplayer was); variance gains **descriptor
  agreement** — repeatability measured at the layer every shipped number is
  computed from, with a direction-of-drift signal separating target change from
  judgment drift.
- **2026-08-18 — coverage-gate fixes + tool-def detector** (`8317068`). The
  enumerate coverage gate skips a run's own artifacts (self-reference) and
  accepts `--exclude` for declared harness dirs; the channel-candidate scan
  detects in-code agent tool-definition tables and remote MCP toolsets (a
  calibration run had hand-derived 24 channels the scan missed) and skips test
  files wholesale.
- **2026-08-18 — consolidation** (`45c8ccb`). One findings loader (per-pass
  first, fail closed — variance's old private loader skipped unparseable files
  and mis-read the loss as variance), one doctrine home (`map/doctrine.mjs`:
  the gate rule, severity rank, fix-spine grouping, CLI idiom — previously
  restated in up to four files, now pinned in lockstep by the harness), one
  axis-label map (`display.mjs` AXIS_META). Extraction residue removed. A pure
  refactor: goldens untouched, frozen-base recompiles byte-identical.
- **2026-08-18 — deliberate fixes** (`9c3b159`). Score matching by full path
  (basename collisions closed); channel labels authored per run
  (`channel_notes.label`) instead of a dictionary in engine source;
  `--json` modes exit non-zero on violations (the exit is the verdict);
  the naming boundary applied (assay = the engine; repo-eval = the built-in
  scanner only); confidentiality became a run-level setting, never an engine
  default.
- **2026-08-18 — the shell hardened** (v0.2.0). CI runs the harness on every
  push and PR; `.env` ignored; PR template with a mandatory verification
  section; this history file; release tagging adopted (a deliberate engine
  change is a tag consumers can pin).
- **2026-09-15 — the run manifest; Scorecard retired from the adopted roster.**
  A full package had shipped over a repo-eval-only base with the queued code
  scanner never invoked and nothing recording the omission: the "not measured"
  line was honest but nothing forced a decision, and the index had also listed a
  five-day-old sibling run's native report beside it. Now every run carries
  `eval/scanners.yaml` — one row per adopted scanner: ran, skipped with a reason,
  or failed with the error (SCHEMA §5a, scanner-contract §4a). `validate.mjs`
  fails closed on a missing manifest, a skip without a reason, a `ran` with no
  rows and no explicit empty file, and rows from a scanner recorded as not run;
  `compile-package.mjs` validates before compiling anything; the walk, index,
  report, and handoff name a scanner that did not run with its recorded reason;
  appendices come from this run only. Adapters gain `adopted: false` (retirement
  as a recorded decision, still projectable for frozen rows); Scorecard is the
  first retiree — its checks need direct GitHub API access at run time, and an
  adopted instrument must run offline against the checkout. Four negative
  fixtures and a run-manifest invariant block pin all of it (confirmed red with
  the rule weakened); fixture runs carry manifests; goldens untouched.
- **2026-09-15 — the deep-code-review machine report, consumed; adapter A–W.**
  deep-code-review 1.72 emits a machine report (one YAML per run: findings with
  stable ids, a coverage row per domain, ground truth, prior-run linkage).
  `ingest.mjs` gains a peer-scanner profile for it: no exit code, so
  completeness is the fail-loud property (a row for every domain in the
  adapter's new `coverage_domains`, a note on every non-scanned row, a fix on
  every gap); rows keep the scanner's own labels beside the mapped ones
  (`title`, `native_confidence`, `latent`, `mechanism_unproven`,
  `prior_native_id` / `prior_status`); the coverage is archived as
  `eval/coverage-<scanner>.yaml` and the walk, index, and report read it so an
  axis is **partially measured** where the scanner said it looked partially.
  The validator checks the sidecar (complete, noted, scanner recorded as ran).
  The adapter gains upstream 1.71's S (→ improvement-loop), T (→
  code-security), and W (→ code-correctness); `default: FAIL` had made the
  first S/T/W row a loud halt. A fictional sample report, a negative fixture,
  and a `dcr-machine-report` invariant block pin it; goldens untouched.
- **2026-09-22 — the descriptor register (v0) and its projection.** A second
  projection beside the axis roster: `yardstick/requirements.yaml` holds 55
  descriptors, stack-neutral requirements each naming the mechanism that decides
  it (facet, census, instrument, claim), extracted from four lists that already
  existed (a takeover floor, a fleet contract, a template's guarantee manifest, a
  foundation template's universal rules) plus a takeover evaluation, every row
  sourced. `yardstick/measure.mjs` projects a run onto it and writes
  `eval/view-descriptors.yaml`: met / unmet / mixed / not-measured, prose never
  read, instrument rows gated by the run manifest and the scanner's own coverage,
  claim rows always not-measured from a run because only a sidecar asserts them.
  The sidecar's format is defined, its checker is not yet. Harness gains a
  descriptor block (register validity, each decider on a synthetic base, the
  manifest and coverage gates); goldens untouched; the axis views unchanged.
- **2026-09-22 — the register read is part of every package.** `compile-package.mjs`
  runs `descriptors.mjs --write` after validating; `INDEX.md` carries a register
  glance and links `eval/view-descriptors.yaml`; the report states the read once
  in its coverage section (decided / met / unmet / mixed / not measured, the
  claim-only rows named as the sidecar's to make); `validate.mjs` recomputes
  every status and mechanism from the base, the manifest, the censuses and the
  scanner coverage and fails on drift. A negative fixture (`descriptors-drift`:
  a claim-only row hand-edited to met) pins it. Goldens untouched; the axis
  projection still leads the package — the flip to descriptors leading is the
  next, reviewed, breaking release.
- **2026-09-22 — the fresh-clone instrument.** `map/fresh-clone.mjs`
  clones the target to scratch, detects the node toolchain, runs the declared
  install / build / lint / typecheck / test / migrate steps (migrate only through
  a `DATABASE_URL`-free dry form) and replays the README's command claims for
  presence; exit 0 / 1 are runs, 2 is a crash. `ingest.mjs` gains the profile
  (`findings-94-fresh-clone.yaml`, ids from F-900): a failed or timed-out step,
  a not-declared lint / typecheck / test / migrate, or a missing README claim is
  one gap row; rows carry command and exit code, never output.
  `adapters/fresh-clone.yaml` is adopted (instrument, contributes nothing;
  install / build / migrate → context-economy, lint / typecheck / test →
  deterministic-gates, readme-claim → artifact-legibility), so every fixture
  manifest and the template gain a disposition row. A public fixture
  (`tests/instruments/fresh-clone-target`) and a `fresh-clone` harness block pin
  the runner, the converter's halts, the clean-run empty file and the
  projection. The register's floor rows keep their kinds; the re-kind to
  `instrument: fresh-clone` is a later change. Goldens untouched.
- **2026-09-24 — the dependency-scan instrument.** `map/dependency-scan.mjs`
  finds every `package-lock.json` / `npm-shrinkwrap.json` in the tree (skipping
  `node_modules`/`.git`) and runs `npm audit --json` against each, no install; a
  workspace member whose effective root carries no lockfile of its own (npm's
  `ENOLOCK`) is retried from a scratch copy of just that member's package.json +
  lockfile (`method: scratch-copy`, vs `in-place`). `pnpm-lock.yaml` / `yarn.lock`
  are recorded `not-supported`, never clean. Exit 0 / 1 (zero vs. any advisory) are
  runs, 2 is a crash; any other exit or a report that does not parse into npm's
  `vulnerabilities` + `metadata` shape (a network-unreachable audit looks exactly
  like this) makes that lockfile `failed`, never clean. `ingest.mjs` gains the
  profile (`findings-95-dependency-scan.yaml`, ids from F-950): one gap per
  advisory (category = its own severity), one `lockfile-failed` gap per failed
  lockfile, one `lockfile-unsupported` gap per unsupported one.
  `adapters/dependency-scan.yaml` is adopted (instrument, contributes nothing; all
  seven categories → code-security), so every fixture manifest and the template
  gain a disposition row. `d-dependencies-known-clean` re-kinds from `claim` to
  `instrument: dependency-scan` on its `critical` category alone — a run with
  high/moderate/low/info advisories and zero critical rows still reads met,
  narrower than the row's title. A `dependency-scan` harness block (synthetic
  documents; no real `npm audit` invoked) pins the converter's rows, its halts,
  the clean-run empty file, the projection, and the three descriptor reads.
  Goldens untouched.
- **2026-09-24 — the fresh-clone runner goes workspace-aware, and the
  register learns list categories.** The defect: on a
  real monorepo the root `package.json` is a bare npm-workspaces shell —
  no scripts, no dependencies, no lockfile — so the runner read it as "six steps
  not declared, exit 0" while the apps that actually mattered each failed `npm
  ci` from a clean clone (a workspace's own lockfile resolves against the
  workspaces root, which has none: `EUSAGE`); the per-app results people had
  only existed because a human ran the runner once per app. `map/fresh-
  clone.mjs` now resolves `workspaces` (an array, `{packages: [...]}`, globs
  `dir/*` / `dir/**`, plain paths — zero deps) and, when the root declares none
  but `apps/*` / `packages/*` exist with their own manifest, treats those as
  workspaces too; the step plan runs once per workspace in its own directory, in
  addition to the root. Install is the one step rebased: when the root carries a
  lockfile, a workspace installs via `npm ci --workspace <path>` run from the root;
  otherwise its own plan runs in its own directory, which reproduces the real
  `EUSAGE` honestly instead of masking it. The document gains `workspaces:
  [{path, toolchain, steps, readme, readme_claims}]`; `exit` is 1 when the root
  or any workspace has a failed/timed-out step or a missing claim; a workspace-
  free repo still emits exactly today's document plus `workspaces: []`. The
  `fresh-clone` ingest profile emits the same per-step and per-claim gap rows
  per workspace, `native_id` prefixed by the workspace path
  (`apps/x:install:failed`), evidence scoped to the workspace's own manifest or
  README, `native_category` left as the plain closed step name so the adapter
  map is untouched; a pre-workspaces document with no `workspaces` key still converts
  exactly as before. Separately, `decide.category` on a register `instrument`
  row may now be a list — two categories one decider holds jointly — reading
  met only when every listed category is independently met by the single-
  category rules (`validateRegistry` rejects an empty list). Four of the
  fresh-clone floor rows are re-kinded from `claim` onto it:
  `d-fresh-clone-runs` (`[install, build]`), `d-tests-execute-core` (`test`),
  `d-lint-typecheck-gate` (`[lint, typecheck]`), `d-schema-versioned`
  (`migrate` — no database signals in the tree means no migrate row, which
  reads met: nothing to migrate). `d-readme-true` stays a census; every other
  register row is untouched. A public fixture
  (`tests/instruments/fresh-clone-monorepo` — a `workspaces: ["apps/*"]` root
  with no scripts/deps/lockfile, `apps/good` passing, `apps/bad` failing its
  build offline and deterministically in place of a real `npm ci` EUSAGE) and
  two harness blocks (`fresh-clone-workspaces`, `descriptor-list-category`) pin
  the new behavior; the existing `fresh-clone` block and its fixture are
  unchanged. Goldens untouched.
- **2026-09-24 — the repo-census instrument, and four floor rows a run can now
  decide without an LLM.** `map/repo-census.mjs` reads a checkout,
  read-only, zero deps, no network: an architecture page present and naming an
  external service or data store (root and per app in a monorepo — package.json
  `workspaces`, or `apps/*` / `packages/*`); an agent contract (AGENTS.md or
  CLAUDE.md, same monorepo rule) present and present-tense (no status/history/
  changelog/todo/backlog heading, no dated changelog line); a runbook carrying a
  heading or paragraph for restart, roll back, rotate a key/secret/credential,
  and restore from backup (presence of the words only — whether a procedure was
  ever run stays a sidecar claim); and a CI gate — a `.github/workflows/*.yml`
  that triggers on pull_request or push to the default branch and runs a
  test/lint/typecheck/build step with no step failing open (`continue-on-error:
  true` is a gap, High; whether the check is *required* by branch protection is
  not visible from the tree, said in every observation). Exit 0 / 1 are runs, 2
  is a crash. `ingest.mjs` gains the profile (`findings-96-repo-census.yaml`,
  ids from F-960): one gap row per `gap` check, one strength row per `pass`
  check (so the axis sees the evidence, not just the absence of a gap);
  `not-applicable` yields nothing. `adapters/repo-census.yaml` is adopted
  (instrument, contributes nothing; architecture-page / runbook →
  artifact-legibility, agent-contract → improvement-loop where the register
  homes d-agent-contract, ci-gate → deterministic-gates), so every fixture
  manifest and the template gain a disposition row. `d-architecture-page`,
  `d-agent-contract`, `d-runbook`, and `d-ci-gate-on-default-branch` (the last
  previously `kind: census`) are re-kinded to `instrument: repo-census` in this
  same change — the four floor rows the register could only read `claim` /
  `census` for before. A public fixture (`tests/instruments/repo-census-target`,
  a tiny monorepo) and a `repo-census` harness block pin the runner, the
  converter's halts, the all-pass strength-only conversion, the projection, and
  the descriptor reads (met on an all-pass `ran` manifest, not-measured with the
  reason when skipped). Goldens untouched.
- **2026-09-24 — the owner-evidence transcript check, six more floor rows a run
  can now decide.**
  `map/repo-census.mjs` gains six checks, named `evidence-<descriptor-id>`,
  root only: a dated YAML-frontmatter transcript at `ops/evidence/<id>.md` (or
  `docs/evidence/<id>.md`), for `d-backup-restore-exercised`,
  `d-rollback-exercised`, `d-deploy-one-command`, `d-smoke-on-deployed`,
  `d-monitoring-with-alert`, `d-cost-alerts` — six things a repository cannot
  show by itself. `pass` only when the file is present, its frontmatter carries
  `descriptor` (must equal the file's id), `date`, `by` (a role or handle — an
  email-shaped value is a gap), `commit` (7–40 hex), `result: pass`, the keys
  named per row (`owner/evidence/README.md`, the one home of the format),
  the date is fresh (`--evidence-max-age`, default 90 days, from `--as-of`,
  default today UTC — recorded in the document), and the body carries a fenced
  code block and at least 5 non-empty lines; the body itself never enters the
  document past those counts. Every observation, pass or gap, says the check
  verifies the transcript's shape and freshness, never the truth of what it
  describes — that rests on the named person's attestation in version history.
  `ingest.mjs`'s `repo-census` profile accepts the six check names
  (`native_category: evidence-<descriptor-id>`, `Medium` severity, a strength
  row on pass, a gap row otherwise); `adapters/repo-census.yaml` maps each to
  the axis the register homes its re-kinded row on (none of the six carried an
  `axis:` of their own, so each took its nearest tier-mate's, noted inline).
  The category names carry no colon, so the adapter's minimal YAML reader needs
  no special case. The six rows re-kind from `claim` to
  `instrument: repo-census` in the same change. A fixture addition under
  `tests/instruments/repo-census-target/ops/evidence/` (one passing transcript,
  four with one planted defect each, one absent) extends the `repo-census`
  harness block; the fixture's new checks widen its own counts (6 checks/6 rows
  → 12/12), asserted explicitly, nothing else moved. Goldens untouched.
- **2026-09-24 — private material removed from the public tree.** Register
  sources that named an evaluated repository now read `takeover-eval/`,
  `template-eval/` and `foundation/`, and the prefixes are defined in
  `yardstick/README.md`. Comments, tests, fixtures and this file no longer name
  evaluated repositories, and pointers into the private deployment's issue
  tracker are gone. No behaviour changed; goldens untouched.
- **2026-09-24 — one map, one yardstick, three views.** The engine is laid out
  as what it does: `map/` draws the map (the finding format, the built-in
  method, the scanners and instruments, validation), `yardstick/` holds the
  requirements and measures a map against them (`eval/yardstick.yaml`), and
  `views/` writes Intake (`INTAKE.md`, `eval/intake.yaml`), Maintain
  (`MAINTAIN.md`, `eval/maintain.yaml`) and Improve (`IMPROVE.md`,
  `eval/improve.yaml`, the axis walk, the handoff) from that one measurement in
  one `compile`. `owner/` carries what only an owner can supply: the evidence
  transcript format and the custody questions. `node assay.mjs <command>` is the
  one command line. Register rows are requirements; each carries a topic (an
  axis, or custody, reproducibility or operability). PDF rendering, its
  stylesheet and fonts left the engine: branded output belongs to whoever
  publishes. Readers accept the earlier file names (`view-descriptors.yaml`,
  `MAINTAINER-REPORT.md`, `view-*`); writers use only the new ones. Goldens
  untouched.
- **2026-09-24 — clean layers, no legacy.** A run is now laid out exactly as
  the engine that produces it: `map/` (`scanners.yaml`, `findings/<scanner>.yaml`
  and `findings/repo-eval-<pass>.yaml`, `coverage/<scanner>.yaml`, `censuses.yaml`,
  `backlog.yaml`, `terrain.md`, `native/<scanner>.md`, `raw/`), `yardstick.yaml`
  at the run root, `views/` (`intake.yaml`, `maintain.yaml`, `improve.yaml`,
  `improve/{axes.md,leverage.md,maturity.md,maturity-grades.yaml,security.md,
  security-gate.yaml,prose.yaml}`), and `owner/decisions.yaml`. One module,
  `lib/run-layout.mjs`, now owns the path of every run artifact. The readers
  that accepted an earlier file name (`lib/legacy-name.mjs`) are gone — a run
  either matches this layout or it does not validate — and every retired
  vocabulary the readers still tolerated goes with it: the five-domain
  `domain:`/`also_domains:` translation, the `gate:`/`blocks_stage:` stage
  scale on the exposures sidecar, and the `AI-NATIVE-EVAL.md` citation check.
  The yardstick's own names now say what they are: `loadRegistry` →
  `loadYardstick`, `validateRegistry` → `validateYardstick`,
  `projectDescriptors` → `measureRun` — "descriptor" now names only a finding's
  structured facets (reversibility, gate_type, blast_scope, …), never a
  requirement row. Every test fixture moved with its history intact; the
  regression tests that existed only to pin a retired fallback are removed
  with the fallback they pinned. Public deployments migrate their live runs
  file-by-file against the old → new path table in the migration commits.
  Goldens untouched.
- **2026-09-24 — the packet, and the one prompt that fills it.** A repository's
  `packet/manifest.yaml` states what is true of it in the yardstick's terms
  (`owner/PACKET.md`). `owner/ask-owner.md` is the one prompt an owner pastes into
  the AI they built with: it reads the code first, asks about a dozen plain
  questions, never takes a secret or a name, and ends with the manifest in one
  block. `validate-packet` checks what comes back and says how to fix each
  problem; `measure --packet` copies it into the run and decides the claim-only
  requirements from it (`basis: owner`), and a claim the map contradicts is
  recorded, never merged. Tested with simulated owners on an invented app; the
  parser now reads a flow list on the line below its key, and yes/no fields
  accept `unsure`. The custody questions file is retired: the prompt carries them.
- **2026-09-28 — the packet gains `pointers:`.** An optional top-level
  `pointers:` map (`owner/PACKET.md` "Pointers") says where a repository keeps
  what the yardstick asks about — its default branch, its apps, its
  architecture page(s), agent contract(s), runbook, owner-evidence directory,
  workflows directory, build/install/test commands, and canon file — so a
  scanner can read the repository the way it says it is laid out instead of
  guessing. Every pointer is optional; `validate-packet` refuses an unknown
  pointer key, an absolute or `..`-bearing path, a URL in place of a path, a
  wrongly-shaped `apps`/`architecture`/`agent_contract`, and an implausible
  `default_branch`, one plain line each.
- **2026-09-28 — repo-census reads the packet's pointers.** With `--packet
  <dir|manifest.yaml>`, or automatically when `<target>/packet/manifest.yaml`
  exists, `map/repo-census.mjs` (now 0.3.0) loads and validates the packet first
  — an invalid one halts the runner with the validator's own lines, exit 2 —
  then treats each pointer as authoritative, never a hint: `apps` replaces
  monorepo detection outright (a named app that does not exist is a gap naming
  it); `architecture` / `agent_contract` / `runbook` / `evidence` /
  `workflows` make their check read exactly the named path(s), never falling
  back to discovery; `default_branch` beats discovery (a `--default-branch`
  flag still wins over both). The output records `packet: { path, auto,
  pointers_used }`, and a check that followed a pointer says so in its
  observation. `target.remote` (`git remote get-url origin`, userinfo
  stripped) is now recorded alongside `target.path` and `target.head`.
  `map/scanners/CONTRACT.md` §3d and the module's own header describe the
  pointers; the format itself stays at `owner/PACKET.md`.
- **2026-09-28 — the owner prompt's pre-fill speaks plainly.** `ask-owner
  --run`'s `{{WHAT_WE_FOUND}}` block never prints `target.path` (a local
  filesystem path) any more — it names the run's own packet, then
  repo-census's recorded `target.remote` (userinfo stripped), then falls back
  to naming just the commit when that is all that is known. The credential and
  external-systems lines are now plain sentences (singular/plural said right,
  internal effect-channel slugs turned into words) instead of census counts
  and internal slugs; personal-data lines drop the "met of N" census framing.
  A new `--found <file>` flag lets a steward replace the whole block with
  their own write-up — a leading YAML frontmatter block is stripped first,
  since some repositories require one on every markdown file — swept for the
  same secret/email shapes `validate-packet` refuses and for a stray `{{` of
  its own. `owner/ask-owner.md`'s template gains an optional `pointers:`
  section, filled only from paths the AI actually opened.
- **2026-09-28 — comparing two measurements: `since` and `ratchet`.**
  `yardstick/compare.mjs` is a new pure core, `compare(previous, current)`, over
  two documents shaped like `yardstick.yaml`: every requirement id classifies as
  `improved`, `regressed`, `unchanged`, `newly-measured`, `no-longer-measured` or
  `yardstick-only`, on a total order (`met > mixed > unmet`) that deliberately
  puts `not-measured` off the scale — a status leaving the measured scale is a
  loss, never a lateral move. `node assay.mjs ratchet <run> --baseline
  <baseline.yaml>` fails the moment a `met`/`mixed` baseline row gets worse or
  drops off the scale, or a baseline row is absent from the current measurement
  entirely; `--write-baseline` writes the reviewed snapshot from a run, but never
  commits it — a named steward does that themselves (`yardstick/README.md`). The
  same module's `fingerprintFinding`/`compareFindings` match findings across two
  independent runs by `(scanner, dimension-or-category, evidence file paths with
  the line stripped)` — never by `id`, which carries no meaning across runs
  (`map/SCHEMA.md` §3) — for the new Since view: `node assay.mjs since <run>
  --previous <prev-run>` and `compile <run> --since <prev-run>` write
  `views/since.yaml` and `SINCE.md` (`views/README.md`), leading with
  regressions and improvements, ending with findings new and "no longer found"
  — never "fixed": absence of a finding is absence of re-detection, not proof
  the fact is gone. Goldens untouched.
- **2026-09-28 — the routine a stewarded repository runs.** `routine/` is a
  GitHub Actions workflow template (`assay-routine.yml`) a steward copies into
  the stewarded repository, plus the zero-dep driver it calls
  (`routine/run.mjs`) — the same driver a steward runs locally, so CI and a
  terminal take the identical path. It runs the offline instruments
  (`repo-census`, `fresh-clone`, `dependency-scan`; `gitleaks` when its binary
  is present), records `repo-eval` and `deep-code-review` skipped every time
  ("not run by the routine; a steward session runs them"), validates, compiles
  — folding in a committed `packet/` when one exists — then ratchets against
  `packet/baseline.yaml` when that file is committed, printing a visible
  warning rather than silence when it is not. The template pins every action by
  full commit SHA (`actions/checkout` 11bd71901bbe5b1630ceea73d27597364c9af683
  = v4.2.2, `actions/setup-node` 49933ea5288caeca8642d1e84afbd3f7d6820020 =
  v4.4.0, `actions/upload-artifact` ea165f8d65b6e75b540449e92b4886f43607fa02 =
  v4.6.2 — all three verified live against `git ls-remote` at the time of
  writing), carries `permissions: contents: read` and nothing more, and takes
  `ASSAY_REF` as a full commit SHA, never a branch. `--since` is deliberately
  not wired into the template: identifying and downloading a prior **scheduled**
  run's artifact needs the Actions API's `actions: read` permission, which the
  template does not add (`routine/README.md` says why) — a steward who wants it
  runs the driver locally against two kept run directories. Goldens untouched.
- **2026-09-28 — deep-code-review re-checked against 1.471.0.** The machine-report
  spec (`references/machine-report.md`) has not changed since it landed upstream
  in 1.128.0, and the domain map is still A–T and W, so the adapter's mapping
  stands; the "1.71 / 1.72" citations were wrong (T and W arrived in 1.60.0, the
  machine report in 1.128.0) and are corrected throughout. The adapter records
  the contract as data: `min_version: "1.128.0"` (ingest halts on an older
  report, and on a report whose header does not name the tool and a
  `skill_version`) and `verified_against: "1.471.0"`. Ingest now enforces the
  spec's field rules it had let through — no severity on a strength row,
  `resolves_with` on every `unverified` row (carried into the port beside
  `native_tag`), a `prior_status` only with its `prior_id`, a prior finding
  re-verified `fixed` filed as a strength — and the `verify-fix` capability
  names the upstream `PRIOR` re-verification mode. The fictional sample moves to
  1.471.0 with an `unverified` row; eight negative assertions pin the new halts.
  Goldens untouched.
- **2026-09-28 — the known-answer fixtures measure the offline instruments.**
  Running fresh-clone, dependency-scan and repo-census over
  [assay-fixtures](https://github.com/andyschwab/assay-fixtures) showed the
  fixtures had fallen behind the engine: the clean-lib control read twelve
  false positives the moment the instruments ran (real absences — no lint
  script, no runbook — that its contract predated), P-05 was recoverable by
  fresh-clone's README replay but not credited to it, and the repo-root sheet
  depended only on the retired Scorecard. It also surfaced three engine
  defects, fixed separately: repo-census cited `:1` (no path) at the root and
  validate let it through; the census did not count `node test/…` as a CI
  gate; and `score` decided which methods ran from rows present, so an
  instrument that ran clean and missed read out of scope. The answer sheets
  gain an `instruments:` list (matched by check name + polarity, standing
  facts that keep a control a control), `score` reads the run record and
  grades them, and the vendored runs carry the instruments' real output: notesbox
  12/12, cleanlib 5/5 with 0 false positives, and a new `fixtures-root` run
  (repo-census over the fixture repository, 10/10 in scope; Scorecard-only
  branch protection and dcr-only action pinning read out of scope). Goldens
  re-blessed for exactly those additions.
- **2026-09-28 — an all-clean run measures and compiles.** A product review
  found a check that looked at nothing never reads "met" — and, sharpening
  that same honesty rule, found the inverse defect: a run where every
  instrument ran clean (every `map/findings/*.yaml` the explicit empty list,
  a complete run manifest) crashed `measure` with "no findings", so the one
  case that most deserves a clean bill of health could not even compile one.
  `yardstick/measure.mjs`'s `projectRun` now refuses only the truly empty case
  — no findings **and** no manifest; zero findings **with** a manifest is a
  real, valid measurement (CLAUDE.md rule 3: a clean run with an explicit run
  record measures). `views/improve/axes.mjs`, `views/improve/handoff.mjs` and
  `views/improve/report.mjs` carried the identical guard (each is invoked
  unconditionally, or near it, by `compile`) and are fixed the same way.
  Verified end to end: a synthetic all-clean run now validates green and
  `compile` writes INDEX/INTAKE/MAINTAIN/axes/handoff with zero crashes; the
  genuinely empty case (no findings, no manifest) still throws. Goldens
  untouched — no fixture's recall changed.
- **2026-09-28 — ci-gate: a gate that can fail open through its own shell
  script, not only `continue-on-error: true`.** A gate that can fail open is
  not a gate; `map/repo-census.mjs`'s workflow reader caught the GitHub
  Actions declaration but not the identical outcome reached in plain shell —
  a `run:` command ending `|| true`, `|| exit 0` or `|| :`, or a `set +e` line
  anywhere in a multi-line block-scalar script (disabling errexit for every
  line after it, including a gate command on a later line). `parseSteps` now
  captures a block-scalar `run: |` script's full body with real line numbers
  and checks every line for either shape; a hit is cited at its own line, not
  the step's first line, so `set +e` on line one of a script whose actual test
  command is on line two still points at line one. A literal
  `continue-on-error: true` citation is unchanged. Tested each shape (inline
  and block) end to end through `repo-census`, plus a clean multi-line script
  that must not gap. `map/scanners/CONTRACT.md` §3d and
  `yardstick/requirements.yaml`'s `d-ci-gate-on-default-branch` check text
  name the shell shapes explicitly. Goldens untouched.
- **2026-09-28 — fresh-clone: an undeclared build reads unmet, the same as an
  undeclared lint, typecheck or test gate.** `d-fresh-clone-runs` decides on
  `[install, build]` jointly, but only `build` quietly read "met" when the
  package declared no build script at all — lint, typecheck and test already
  treated their own absence as a gap (`FC_FLOOR_STEPS`). `build` now joins
  that list in `map/ingest.mjs`; an undeclared build emits a gap row exactly
  like an undeclared lint or typecheck, and `d-fresh-clone-runs` reads unmet
  rather than met on a package with no build step. `install` is unaffected —
  "no dependencies and no lockfile" stays a genuine, non-gap absence, the one
  case fresh-clone's own planner already treats as legitimately nothing to
  install. `yardstick/requirements.yaml`'s `d-fresh-clone-runs` check text
  says so explicitly. Rows changed: only `d-fresh-clone-runs`, for any run
  whose target declares no build script (no committed run in this repository
  was affected — the scored fixtures' fresh-clone rows carry no
  install/build gap either way). Goldens untouched.
- **2026-09-28 — a `not-applicable` status, decided only by evidence, never a
  packet claim.** A product review found assay reporting `met` where nothing
  was measured — a tree with no database read `d-schema-versioned` met by
  silence, and a packet claim of `not-applicable` on a claim-only row read
  `met` too, the identical laundering in a different place. `not-applicable`
  joins `met | unmet | mixed | not-measured` in `yardstick/measure.mjs`'s
  `STATUSES`, and everywhere a status is defined, validated, counted or
  rendered follows: `validateYardstick`, `compare.mjs`'s `classify` (off the
  ranked scale, the same way `not-measured` is), `ratchet.mjs`'s gate,
  `since.mjs`, `views/floor-fleet.mjs` (Intake/Maintain's shared row builder),
  `views/improve/topics.mjs`, the axis walk and report summary lines, and
  `views/compile.mjs`'s glance line. A `facet`/`census`/`instrument` row can
  now declare `decide.not_applicable_when: <fact-category>` (and
  symmetrically `not_measured_when`, for dependency-scan's "nothing to audit"
  case): the name of a `polarity: fact` row the same scanner records when it
  looked for something and found none, which decides the status only when the
  row's own category carries no rows this run — real evidence always governs
  over the condition. `d-schema-versioned` is wired to it:
  `map/ingest.mjs`'s fresh-clone converter now emits a `no-database-signal`
  fact row instead of silently skipping the migrate check, and the
  requirement reads not-applicable, never met, with no database signal
  anywhere. Separately, `yardstick/packet.mjs`'s `decideGenericClaim` stops
  mapping a packet's `not-applicable` claim to `met` — a requirement that does
  not apply was not satisfied — and now maps it to `not-applicable` (a
  claim-kind row's only decider is the owner, so this is the owner's call, not
  a run's). Ratchet: to/from not-applicable is never a failure either
  direction (a requirement that stops applying was not held and broken) but
  is reported in a new `changed` list, distinct from `improved`/`failures`.
  Intake and Maintain gain a "Not applicable" section, listed separately and
  never counted as met. `yardstick/README.md` and `views/README.md` document
  all of it; `owner/PACKET.md`'s claim-mapping table is corrected. Goldens
  untouched.
- **2026-09-28 — database detection knows Supabase and Drizzle.**
  `map/fresh-clone.mjs`'s database-signal detection (the evidence
  `d-schema-versioned`'s not-applicable status now rests on) gains
  `supabase/migrations/`, `supabase/config.toml`, `@supabase/supabase-js`,
  `@supabase/ssr`, a bare `drizzle/` migrations folder, `drizzle-kit`, and the
  common `migrations/*.sql` shape under `db/` or `sql/` (matched by content —
  actual `.sql` files present — not just the directory's existence). A
  Supabase project often carries no ORM dependency at all, only the client
  package and a migrations folder, so it needed its own signals rather than
  an implied one from the generic ORM list. "Database present, no migrate
  step declared" already read unmet through `FC_FLOOR_STEPS` (`migrate` was
  already floor-gated before this change; `build` joined it two commits ago)
  — Supabase now reaches that same path instead of the no-database branch, so
  it reads unmet, never met. Verified end to end: a synthetic Supabase-shaped
  repo (a `@supabase/supabase-js` dependency and
  `supabase/migrations/0001_init.sql`, no migrate script) reads
  `d-schema-versioned` unmet; a repo with zero database signals anywhere
  reads not-applicable. Goldens untouched.
- **2026-09-28 — dependency-scan: dependencies with no lockfile are not
  "clean".** A repository with a `package.json` declaring real dependencies
  and no lockfile at all (npm, pnpm, or yarn) enumerated zero lockfiles, so
  `d-dependencies-known-clean` read met — zero audited is not the same fact as
  zero advisories found, but nothing recorded the difference.
  `map/dependency-scan.mjs` now enumerates every `package.json` in the tree
  (`findManifests`) and checks each one with real dependencies for a lockfile
  covering it (`isCoveredByLockfile`, walking up to the scan root the same way
  `npm ci` resolves): an uncovered manifest lands in the document's new
  `manifests: [{path, status: "no-lockfile"}]`, and makes the exit 1, same as
  an unsupported lockfile. Zero `package.json` files anywhere in the tree
  (`noManifest: true`) is the distinct fact that there is no dependency graph
  to speak of. `map/ingest.mjs` converts each into a `polarity: fact` row
  (`no-lockfile` / `no-manifest`, never a gap — this is not itself a known
  vulnerability); `yardstick/requirements.yaml`'s `d-dependencies-known-clean`
  reads `not_measured_when: no-lockfile` (not-measured, "no lockfile: nothing
  to audit") and `not_applicable_when: no-manifest` (not-applicable), through
  the same evidence-condition mechanism `d-schema-versioned` uses — a real
  critical advisory always governs over either fact. Test fixtures: a manifest
  with dependencies and no lockfile anywhere up its own directory tree reads
  not-measured; a manifest covered by an ancestor's lockfile reads clean; a
  tree with zero `package.json` anywhere reads not-applicable and exits 0 (not
  a failure). Goldens untouched.
- **2026-09-28 — owner-evidence transcripts say who produced them, and their
  commit is real.** Two gaps in the owner-evidence contract (`owner/evidence/
  README.md`, `map/repo-census.mjs`): nothing said who could write a
  transcript (an agent could have, and nothing would have caught it), and
  nothing checked that the `commit` a transcript names is real — a made-up
  hex string passed the shape check as readily as a genuine sha. Every
  transcript now carries `produced_by: ci | person` (required): `ci`
  additionally requires `run` (the CI run's id or URL); `person`'s
  requirement is `by`, already mandatory. `repo-census` checks the named
  `commit` resolves in the checkout's history (`git cat-file -e
  <sha>^{commit}`); a commit it cannot find, in a real full-history checkout,
  is a **gap**, naming it. A checkout that cannot say either way — no `.git`
  at all, or a shallow clone where the commit may simply sit outside the
  fetched depth — reads **not-measured**, never `pass`: `map/ingest.mjs`
  converts it to a `polarity: fact` row in its own `<check>-unverifiable`
  category (never the check's own — that would let an instrument's
  zero-rows-means-met default silently pass it again), and the six
  evidence-based requirements in `yardstick/requirements.yaml` each declare
  `not_measured_when: evidence-<id>-unverifiable`, the same evidence-condition
  mechanism `d-schema-versioned` and `d-dependencies-known-clean` use.
  `owner/evidence/README.md` says plainly, in its own section: evidence comes
  from running the procedure — a person who ran it commits the transcript, or
  a CI job writes it from the procedure's real output; an agent never writes
  one. `map/ingest.mjs`'s remedy text for an evidence gap says the same:
  "Run the procedure; a person or CI writes this file from its real output —
  an agent must never write it." `map/scanners/CONTRACT.md` §3d documents
  both changes. The six example transcripts in `owner/evidence/` and the
  fixture transcripts under `tests/instruments/` gain `produced_by`
  (`d-deploy-one-command` and `d-smoke-on-deployed` as `ci`, with a `run`;
  the rest as `person`). Tested end to end against real git repositories: a
  real, resolvable commit passes; a plausible-but-absent commit gaps, naming
  it; no `.git` at all and a shallow clone both read not-measured, never a
  gap, and the requirement they decide reads not-measured, never met.
  Goldens untouched.
- **2026-09-28 — the no-regression gate reads the accepted baseline from the
  base branch, never from the change it gates.** A pull request's own working
  tree could edit `packet/baseline.yaml` — the very file its gate holds against
  — and the routine used to read that copy unconditionally. `ratchet` gains
  `--baseline-ref <git-ref> --repo <dir>`, reading `packet/baseline.yaml` with
  `git show <ref>:packet/baseline.yaml` in that repository instead of a file on
  disk (`catGitFile`/`loadBaselineFromRef`, `yardstick/ratchet.mjs`).
  `routine/run.mjs` gains `--base-ref <ref>`: on a pull request (the workflow
  template now fetches the base branch and passes `--base-ref
  origin/${{ github.base_ref }}`) the baseline comes from that ref, never the
  working tree, and when the working tree's own `packet/baseline.yaml` differs
  from the base ref's copy at all, the routine says so plainly — "this change
  edits the accepted baseline; the gate holds against the default branch's
  copy; a steward accepts a new baseline in its own reviewed change." A
  schedule or `workflow_dispatch` run (no base ref) reads the working tree's
  committed copy exactly as before. Goldens untouched.
- **2026-09-28 — installation makes the gate binding.** A red job nobody is
  required to look at is not a gate. `routine/README.md`'s install steps now
  say to make the `routine` job a required status check on the default branch
  (GitHub runs a pull request's own copy of the workflow regardless of whether
  its job passes — nothing blocks the merge until a branch rule says this job
  is required) and to add `CODEOWNERS` entries for `packet/` and
  `.github/workflows/` naming the steward team, so a change to the baseline or
  the workflow itself needs a steward's review. The template gains a `push`
  trigger on the default branch (a pull request only measures the change; this
  is what measures merged main the same day rather than waiting for the next
  weekly schedule) and a commented-out, disabled-by-default step that installs
  `gitleaks` from a pinned release, verified against its published sha256
  before it is ever executed — copied in and uncommented, never an unpinned
  `curl | sh`. Goldens untouched.
- **2026-09-28 — a contradicted claim is visible under stewardship, not just at
  intake.** Maintain (`views/maintain.mjs`) gains the same "Contradicted
  claims" section and `contradictions:` list Intake already carried — moved to
  the shared `joinContradictions` in `views/floor-fleet.mjs` so both read it
  the same way — because a steward's routines, not just an intake read, are
  where a repository's own packet claiming `satisfied` against a run-decided
  `unmet` row must not go unseen. `ratchet` (landed alongside the
  `--baseline-ref` change above) now fails the run whenever its measurement
  carries ANY contradiction, checked every time regardless of whether a
  baseline was given at all — there is no `--allow-contradictions`; a claim the
  run itself disproves is always a failure under stewardship. Each failure
  line names the requirement, that the owner claimed it satisfied, and what
  the run found instead. Documented in `yardstick/README.md` and
  `views/README.md`. Goldens untouched.
- **2026-09-28 — Intake gains "What the owner told us."** Most of what a
  repository's own packet (`owner/manifest.yaml`, `owner/PACKET.md`) says about
  itself appeared nowhere before this: `views/intake.mjs` now reduces the
  run's copied packet to a fact-only `owner:` block in `views/intake.yaml` and
  a "What the owner told us" section in `INTAKE.md` — accounts (counts,
  personal vs organisational, transferable yes/no/unknown, one line per
  account), credentials (count, where they live, never-rotated count,
  readers), people (who can build/deploy/restore, whether restore was ever
  done), data (personal data held, what it leaves via), money (monthly per
  provider, alerts), handover, notes, and the answered date/by/via — assay
  issues no verdict on any of it. A role list the packet never spoke to reads
  `null` ("unknown"); one the owner explicitly emptied (`[]`, "nobody can" per
  `owner/PACKET.md`'s own convention) renders "nobody" — every other unknown
  renders as the literal word "unknown", never dropped. With no packet at all,
  the section reads "No owner's packet yet: the owner prompt (`assay.mjs
  ask-owner`) collects these." `custody.credentials` also informs
  `d-credentials-enumerated`, but only as a trailing note on whichever list the
  run itself put that row in ("… (the owner listed N credentials)") — it never
  changes the row's run-decided status. Caught in review before landing: the
  packet's `handover` field lives under `custody:`, not the top level —
  reading `packet.handover` silently produced "unknown" for every packet that
  correctly followed `owner/PACKET.md`; fixed to `custody.handover`, pinned by
  a test asserting the exact fixture text. Documented in `views/README.md`.
  Goldens untouched.
- **2026-09-28 — `validate-packet` accepts a reply still wrapped for chat, and
  refuses a name where `answered.by` wants a role.** An owner's own AI
  (`owner/ask-owner.md`'s whole design) often hands a reply back with prose
  around the actual YAML; `loadPacket` now takes the first ` ```yaml ` or
  ` ``` ` fenced block's content before parsing when the reply carries one,
  discarding the chatter, and reads the text as-is when there is no fence —
  still parsed defensively, nothing in or around the fence ever executed or
  trusted (`yardstick/packet.mjs unwrapChatReply`). `validatePacket` also
  refuses `answered.by` written as a person's name rather than a role: two or
  more Title Case words with no recognizable role word ("Dana Reyes"), or a
  name followed by a parenthetical role ("Dana Reyes (founder)") — a role
  PHRASE like "Lead Engineer" still validates, since one of its own words is a
  role word. One plain line: "answered.by: write a role (for example
  founder), not a name." Documented in `owner/PACKET.md`. Goldens untouched.
- **2026-09-28 — a run says its own outcome: `routine.yaml`.** `routine/run.mjs`
  now writes `<run>/routine.yaml` — what fired, which commit and engine it ran,
  where the baseline came from, and whether the gate held — as the last step
  before every return, including a failed or skipped gate, and (best effort)
  when validate or compile fails before a measurement even exists (`gate:
  not-run`). A fleet collector reading only the uploaded run artifact now knows
  the outcome without the CI logs. `failures` is scraped from the ratchet
  subprocess's own stderr lines (its `evaluateRatchet` output, verbatim, minus
  the summary line) rather than re-run in-process. `lib/run-layout.mjs` gains
  `routinePath`; `map/repo-census.mjs` exports its existing `gitHead`/
  `gitRemote` so the record reuses the same "is this dir a repo root" check
  fixtures rely on, rather than letting git's upward discovery resolve to an
  enclosing repo. Documented in `routine/README.md`. Goldens untouched.
- **2026-09-28 — starting a run takes no guesswork: `assay start` and `assay
  record`.** The instrument sequencing that lived in `routine/run.mjs`
  (`runAssayInstrument`, `runGitleaks`, `toScannersYaml`, `engineCommit`, and a
  new `drawOfflineMap`) moved to `map/start.mjs`, parametrized so the routine's
  own reasons (`NOT_RUN_BY_ROUTINE`, its gitleaks-absent line) and its
  `fresh-clone --no-clone` stay byte-identical; `routine/run.mjs` now imports
  and re-exports them. `node assay.mjs start --out <run> [<target>]` makes the
  run folder, runs every instrument assay can run offline (repo-census,
  fresh-clone, dependency-scan, gitleaks when present), and records every
  other adopted scanner (derived from `map/scanners/adapters/`, never
  hard-coded) skipped with a plain reason naming how to record it — with no
  target, every adopted scanner is recorded skipped, so a run whose instruments
  run elsewhere still starts with a valid record. Unlike the routine,
  `assay start` runs fresh-clone in its DEFAULT clone mode: a person's own
  checkout is not a fresh CI checkout, and running in place would install into
  their working tree and measure uncommitted state. `node assay.mjs record
  <run> <scanner> ran|skipped|failed [--reason] [--model]` (`map/record.mjs`,
  `setScannerRow`) sets one row directly — a line-level edit that leaves every
  other row and the file's own comments untouched; `ingest` now calls the same
  function after a successful ingest, flipping that scanner's row to `ran`
  (keeping an existing `model:`) so a report landing IS the record updating
  itself. `validate.mjs`'s manifest errors now name the exact `record`/`start`
  command that fixes them. Goldens untouched.
- **2026-09-28 — one sequence for the handoff and the report; adapter-declared
  bundling and proofs.** The handoff's items and the report's §6 roadmap used
  to disagree about what comes first — a run could bury the reviewer's own
  roadmap behind dozens of uncovered High-and-above scanner items, and fold
  every gitleaks hit into one unrated item with no session prompt. Extracted
  the sequencing into `views/improve/sequence.mjs`, imported by both
  `handoff.mjs` and `report.mjs`: the roadmap now leads (always, items 1..R),
  then one **triage** item per scanner that declares `handoff.triage: true`
  (gitleaks — a read-first bucket, confirmed live before anything is rotated
  or purged), then every remaining scanner-fix remedy grouped per its
  adapter's declared `handoff.unit` (`finding` — today's dedupe by identical
  fix — `file`, or `scanner`; dependency-scan now bundles one remedy per
  lockfile instead of one per advisory). A Critical finding or a triage item
  outside the roadmap is loud, never silent: a stderr note and a
  START-HERE.md line name it and its item number. Every remedy now carries
  two proofs — **Your proof** (the adapter's declared `client_proof`, run
  with the repository's own tools, no assay) and **Our re-check** (the next
  assay run, as before); every session prompt also carries a standing guard
  against reaching outside the checkout. A triage or file-grouped bundle
  summarizes per evidence file instead of inlining every hit.
  `map/scanners/CONTRACT.md` §7 documents the `handoff:` block; every adopted
  adapter (plus repo-eval and the retired scorecard, for completeness) now
  declares a `client_proof`. Goldens untouched (the recall fixtures carry no
  roadmap or `handoff:`-bearing findings at the scale this changed); a new
  synthetic-run test (`tests/regression.mjs`, block `sequence`) pins the
  ordering, the bundling, the dual proofs, the guard line, and the stderr
  note, and was proved to fail on the prior code (git-stashed) before being
  trusted.
- **2026-09-29 — negative fixtures prove their own check (#39).** The harness
  asserted only that a negative fixture failed, never which check failed it, and
  `descriptors-drift` had drifted into failing sixteen ways (fifteen stale
  mechanism rows from before the register moved those requirements to
  instruments), so removing the check it was built for would have left it red.
  Each `NEGATIVE` entry now names the violation it must produce, and the harness
  fails when that violation is missing or when anything else fires beside it;
  `descriptors-drift` is regenerated so the claim row is its only drift. Four
  checks that had no fixture gain one: `evidence-not-in-target` (the loop can now
  pass `--target`), `solution-coverage-gap`, `counted-drift`, and
  `sampled-drift`. The last exposed a real hole: validate re-derived counted
  maturity rows from the base but never re-derived sampled rows from
  `map/censuses.yaml`, so a sample hand-inflated in the generated file (7/10 →
  10/10, aggregate re-pooled) validated clean. It no longer does; `bad-aggregate`
  gains the census its sampled row names. Every new check was confirmed red with
  its rule disabled.
