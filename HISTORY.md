# HISTORY — assay

Append-only dated log. The contracts (`README.md`, `CLAUDE.md`, `SCHEMA.md`,
`METHOD.md`, `integration/scanner-contract.md`) describe the present; this file
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
  and mis-read the loss as variance), one doctrine home (`tools/doctrine.mjs`:
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
  projection beside the axis roster: `registry/descriptors.yaml` holds 55
  descriptors, stack-neutral requirements each naming the mechanism that decides
  it (facet, census, instrument, claim), extracted from four lists that already
  existed (a takeover floor, a fleet contract, a template's guarantee manifest, a
  foundation template's universal rules) plus a takeover evaluation, every row
  sourced. `tools/descriptors.mjs` projects a run onto it and writes
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
- **2026-09-22 — the fresh-clone instrument (#120).** `tools/fresh-clone.mjs`
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
  `instrument: fresh-clone` is #123. Goldens untouched.
- **2026-09-24 — the dependency-scan instrument (#121).** `tools/dependency-scan.mjs`
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
- **2026-09-24 — the fresh-clone runner goes workspace-aware (#127), and the
  register learns list categories (#123, fresh-clone half).** The defect: on a
  real monorepo (Scout) the root `package.json` is a bare npm-workspaces shell —
  no scripts, no dependencies, no lockfile — so the runner read it as "six steps
  not declared, exit 0" while the apps that actually mattered each failed `npm
  ci` from a clean clone (a workspace's own lockfile resolves against the
  workspaces root, which has none: `EUSAGE`); the per-app results people had
  only existed because a human ran the runner once per app. `tools/fresh-
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
  map is untouched; a pre-#127 document with no `workspaces` key still converts
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
