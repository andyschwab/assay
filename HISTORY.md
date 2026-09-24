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
- **2026-09-24 — the repo-census instrument, and four floor rows a run can now
  decide without an LLM (#122).** `tools/repo-census.mjs` reads a checkout,
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
  (instrument, contributes nothing; architecture-page / agent-contract / runbook
  → artifact-legibility, ci-gate → deterministic-gates), so every fixture
  manifest and the template gain a disposition row. `d-architecture-page`,
  `d-agent-contract`, `d-runbook`, and `d-ci-gate-on-default-branch` (the last
  previously `kind: census`) are re-kinded to `instrument: repo-census` in this
  same change — the four floor rows the register could only read `claim` /
  `census` for before. A public fixture (`tests/instruments/repo-census-target`,
  a tiny monorepo) and a `repo-census` harness block pin the runner, the
  converter's halts, the all-pass strength-only conversion, the projection, and
  the descriptor reads (met on an all-pass `ran` manifest, not-measured with the
  reason when skipped). Goldens untouched.
