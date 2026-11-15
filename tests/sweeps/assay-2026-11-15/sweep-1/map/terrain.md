---
confidential: true
type: doc
title: "assay — Pass 0 terrain (practice-review, blind)"
---
# Terrain — andyschwab/assay @ a17104d714ec76259e6d793954371885965f784a

Derived blind: no prior run read, no canon read (`map/canon/` holds only its README; no
`canon/assay.yaml` exists beside the tool). `tests/sweeps/`, `tests/fixtures/*/map/` and every
`ANSWERS.yaml` were excluded from every listing and never opened. The enumeration
(`map/raw/enumerate.json`, enumerate schema version 2) was given as an input; nothing in the
target was run.

## Checkout

- branch `main` (the head is `origin/main`), sha `a17104d714ec76259e6d793954371885965f784a`,
  committed 2026-11-15T00:56:40Z; a shallow clone (bounded fetch, depth 3000).

## Map

- **What it is.** assay, a Node (ESM, `>=22`) command-line engine that draws an evidence map of a
  target repository, measures it against a yardstick of requirements and compiles views
  (`README.md`, `CLAUDE.md`). Zero runtime dependencies; dev-only `typescript` and `@types/node`
  (`package.json`). License Apache-2.0.
- **Size.** 818 tracked files outside the excluded paths; ~34k lines outside `tests/`. 381 `.mjs`,
  181 `.yaml`, 104 `.md`, 46 `.json`, 26 `.ts`, 21 `.yml`, 14 `.js`, 11 `.py`, 6 `.sql` (the `.ts`,
  `.py`, `.sql` files are test fixtures under `tests/enumerate-fixture/` and a scanner control).
- **Entry points.** `assay.mjs` (a dispatcher over 30 commands, each a script under `map/`,
  `yardstick/`, `views/`, `owner/`, `routine/`); `package.json` scripts `test`
  (`tests/regression.mjs`), `gate` (`lib/gate.mjs`), `lint`/`build` (`lib/check-syntax.mjs`),
  `typecheck` (`tsc`), `validate`, `score`.
- **CI.** `.github/workflows/ci.yml` (push to main, pull_request: `npm ci`, the tools action,
  `npm run gate`, matrix node 22/24); `release.yml` (workflow_dispatch: version check, tests,
  Consumer-trailer check, tag and publish); `branch-cleanup.yml` (push: plan then delete merged
  branches); `tools-check.yml` (schedule: open or update an issue for pins behind upstream);
  composite action `.github/actions/tools/action.yml`. A routine template for consumers ships at
  `routine/assay-routine.yml` (schedule, dispatch, pull_request, push).
- **Load-bearing directories.** `map/` (the map: start, enumerate, validate, ingest, triage,
  instruments fresh-clone / dependency-scan / structure-scan / repo-census, variance, score);
  `map/scanners/` (CONTRACT.md, adapters/ for checkov, deep-code-review, dependency-scan,
  fresh-clone, gitleaks, opengrep, osv-scanner, practice-review, repo-census, scorecard,
  structure-scan, zizmor); `yardstick/` (requirements.yaml, measure, compare, ratchet, packet);
  `views/` (compile, owner, since, rows) and `views/improve/` (report, handoff, maturity, axes,
  sequence); `owner/` (ask-owner, PACKET.md, evidence/); `routine/` (run.mjs, template, README);
  `lib/` (yaml-min, gate, check-syntax, release-notes, run-data, run-layout, display);
  `tests/` (regression.mjs runner, harness.mjs, prove-red.mjs, blocks/ 251 files, negative/ 160,
  instruments/ 116, enumerate-fixture/ 113, fixtures/, candidates-runs/, mapping/, golden.json).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`,
  `CONSUMERS.md`, `RUNBOOK.md`, `SECURITY.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/CONTRACT.md`, `CANDIDATES.md`, `INTAKE.md`, `yardstick/README.md`,
  `views/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`, `owner/evidence/README.md`,
  `routine/README.md`, `tests/README.md`, `.github/PULL_REQUEST_TEMPLATE.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (opened as the opening context of a
  coding-agent session, README Quickstart); the lane seeds `map/scanners/adapters/practice-review/lane.md`
  and `map/scanners/adapters/deep-code-review/lane.md`, filled by `map/lane.mjs`; the adapter
  `map/scanners/adapters/deep-code-review.yaml`. No model is called by the code: the judgment
  scanners run in a session a person starts, outside the engine.

## Effect inventory draft (closed by the enumeration: 26 candidates)

`populations.channelCandidates` (1), `populations.routeHandlers` (1) and `populations.effectSites`
(24), taken together as the candidate list for the delegation pass; 270 members under
`populations.excluded` (test and fixture files) are not candidates. One fixed channel slug per
candidate group (the invocation boundary); the delegation pass draws its slugs from here:

| candidate (as enumerate.json writes it) | channel slug |
|---|---|
| `surface: migrate-run.mjs` | `run-migrate` |
| `route: POST /login` | `enumerated-route-post-login` (the cited line is a code comment) |
| `artifact upload (workflow) @ routine/assay-routine.yml` | `routine-artifact-upload` |
| `git push @ map/effect-scope.mjs` | `enumerated-git-push-pattern` (the cited line is a pattern table) |
| `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | `branch-cleanup-delete` |
| `http write (js) @ map/tools.mjs` and `process spawn (js) @ map/tools.mjs` | `tools-install` |
| `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | `tools-check-issue` |
| `process spawn (js) @ assay.mjs` | `cli-dispatch` |
| `process spawn (js) @ lib/check-syntax.mjs` | `syntax-check` |
| `process spawn (js) @ lib/gate.mjs` | `gate-run` |
| `process spawn (js) @ lib/release-notes.mjs` | `release-notes` |
| `process spawn (js) @ map/backlog.mjs` | `backlog-compute` |
| `process spawn (js) @ map/dependency-scan.mjs` | `dependency-scan` |
| `process spawn (js) @ map/fresh-clone.mjs` | `fresh-clone-exec` |
| `process spawn (js) @ map/repo-census.mjs` | `repo-census` |
| `process spawn (js) @ map/services.mjs` | `services-start` |
| `process spawn (js) @ map/start.mjs` | `run-start` |
| `process spawn (js) @ map/structure-scan.mjs` | `structure-scan` |
| `process spawn (js) @ map/sweep-method.mjs` | `sweep-method` |
| `process spawn (js) @ map/target-identity.mjs` | `target-identity` |
| `process spawn (js) @ map/validate.mjs` | `validate-run` |
| `process spawn (js) @ routine/run.mjs` | `routine-run` |
| `process spawn (js) @ views/compile.mjs` | `views-compile` |
| `process spawn (js) @ yardstick/ratchet.mjs` | `ratchet` |
| `release write (workflow) @ .github/workflows/release.yml` | `release-publish` |

Container / agent classes: the enumeration's `containerClasses` and `socketMounts` members cite
`map/enumerate.mjs` pattern tables and test fixtures only; the engine launches no container of its
own (fresh-clone's isolation is the operator's, `README.md` Quickstart). Egress controls and
contracts likewise cite pattern tables (`map/enumerate.mjs:542-576`). `reportPaths` and
`modelCalls` are empty.

## Populations the passes close (frozen before assessment)

- **change-gates** (gates pass): the 21 `populations.changeGates` candidates.
- **credential** (delegation pass): the 30 `populations.secrets` candidates (`secretConstants`,
  17, are not candidates).
- **model-call-telemetry** (context pass): `populations.modelCalls` is empty; triaged `triage: []`.
- **decision-reconstruction** (legibility pass), the non-obvious decisions, frozen:
  D1 zero runtime dependencies (`assay.mjs:8`, `package.json`); D2 a hand-written YAML subset
  reader that refuses ambiguous input (`lib/yaml-min.mjs:1`); D3 fresh-clone executes the target
  only under `--allow-exec` (`map/start.mjs:15`); D4 two finding-id ranges, lane below F-10000 and
  ingest at or above (`map/ids.mjs`); D5 the core names no external scanner, scanners arrive as
  adapters (`CLAUDE.md:34`); D6 no history file, the change record is git (`CLAUDE.md:70`); D7
  pinned, checksum-verified tool downloads (`map/tools.mjs:120`); D8 a `Consumer:` trailer on every
  contract change, checked at release (`CONTRIBUTING.md:44`); D9 the base never asserts severity,
  the views compute it (`README.md`); D10 one landing-gate command shared by CI and contributors
  (`lib/gate.mjs:1`, `.github/workflows/ci.yml:1`); D11 the consumer routine runs on push and pull
  request as well as schedule (`routine/assay-routine.yml:16`); D12 tests run each block in its
  own process, a bounded pool (`tests/regression.mjs:15`).
- **doc-freshness** (legibility pass): the concrete claims (a command, a count, a path, a
  capability) in `README.md` (Quickstart and Layout) and `CLAUDE.md` (Checks, How a change lands),
  oldest doc first; one finding per claim, 10–16 claims.
- **modules-standalone** (context pass), the module population, frozen (sampled deliberately:
  central, newest-looking, instrument, view, one stale corner): M1 `assay.mjs`; M2
  `lib/yaml-min.mjs`; M3 `lib/gate.mjs`; M4 `map/validate.mjs`; M5 `map/enumerate.mjs`; M6
  `map/ingest.mjs`; M7 `map/start.mjs`; M8 `map/fresh-clone.mjs`; M9 `map/effect-triage.mjs`; M10
  `map/repo-census.mjs`; M11 `yardstick/measure.mjs`; M12 `views/compile.mjs`; M13
  `views/improve/handoff.mjs`; M14 `owner/ask-owner.mjs`; M15 `routine/run.mjs`. Not read: the
  other ~45 `map/` scripts, `views/improve/*` beyond handoff.
- **incidents-became-mechanisms** (improvement pass): every lesson the repository records — the
  "lesson" and "calibration measured" passages in `map/METHOD.md`, `map/SCHEMA.md`, `CLAUDE.md`,
  `lib/yaml-min.mjs`'s fail-closed lesson, the red proofs `tests/prove-red.mjs` names; one finding
  per lesson, 8–14 lessons.
- **ingested-content** (delegation pass): each place outside text enters: the target tree read by
  enumerate / repo-census / structure-scan, scanner reports read by `map/ingest.mjs`, release
  metadata fetched by `map/tools.mjs`, owner answers and evidence read by `owner/ask-owner.mjs`
  and `yardstick/packet.mjs`, the target's text handed to a review session through
  `map/lane.mjs`.
- **agent-access-surface** (multiplayer pass), the interfaces, frozen: the 30 `assay.mjs`
  commands (start, validate, ingest, record, lane, tools, migrate-run, enumerate, project,
  toolchain, fresh-clone, dependency-scan, structure-scan, repo-census, variance, score, backlog,
  roster, yardstick, measure, compare, ratchet, validate-packet, ask-owner, routine, compile,
  owner, since, maturity, candidates) and the formats other tools read: the run directory
  (`map/SCHEMA.md`), the measurement `yardstick.yaml` (`yardstick/README.md`), the consumer rows
  API (`views/rows.mjs`), the scanner adapter format (`map/scanners/CONTRACT.md`), the owner
  packet (`owner/PACKET.md`), the tools composite action (`.github/actions/tools/action.yml`) and
  the routine template (`routine/assay-routine.yml`).

## Slice plan (what each pass reads)

1. **Legibility** — `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, the D1–D12 sites, the code each
   claim names. Not read: `views/README.md` past its opening.
2. **Context** — M1–M15 (head comment, imports, a test importing each under `tests/blocks/`),
   `README.md` Layout, `CLAUDE.md`, `map/scanners/adapters/*/lane.md`, `map/lane.mjs`.
3. **Gates** — the four workflows, `.github/actions/tools/action.yml`, `lib/gate.mjs`,
   `lib/check-syntax.mjs`, `tests/regression.mjs`, `tests/harness.mjs`, `tests/prove-red.mjs`,
   `tsconfig.json`, `package.json`, `map/validate.mjs` (fail-closed), `tests/negative/` listing.
4. **Verification** — `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `release.yml`
   trailer step, `map/score.mjs`, `map/variance.mjs`, `tests/golden.json`, `tests/fixtures/`
   (outside `*/map/`), `lib/gate.mjs` exit lines, the practice-review and deep-code-review lanes.
5. **Delegation** — every candidate's cited file and line, the workflows' `on:` and
   `permissions:`, `map/tools.mjs`, `map/fresh-clone.mjs`, `map/services.mjs`, `map/start.mjs`,
   `map/structure-scan.mjs`, `map/dependency-scan.mjs`, `map/migrate-run.mjs`, `routine/`,
   `map/ingest.mjs`, `map/lane.mjs`, `owner/ask-owner.mjs`, the secrets' cited files.
6. **Improvement** — `map/METHOD.md`/`map/SCHEMA.md` lesson passages, `tests/prove-red.mjs`,
   `map/backlog.mjs`, `CLAUDE.md`, `CONTRIBUTING.md`, `map/scanners/CANDIDATES.md`,
   `tests/blocks/no-history-file.mjs`, any TODO blocks.
7. **Multiplayer** — `assay.mjs`, `README.md`, `CONSUMERS.md`, `views/rows.mjs`,
   `map/scanners/CONTRACT.md`, `owner/PACKET.md`, `routine/README.md`, the action.

Id blocks (disjoint, SCHEMA.md §3): legibility F-001–F-099, context F-100–F-199, gates
F-200–F-299, verification F-300–F-399, delegation F-400–F-599, improvement F-600–F-699,
multiplayer F-700–F-799.
