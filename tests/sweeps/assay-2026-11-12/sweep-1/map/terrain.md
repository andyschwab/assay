---
type: doc
title: "Terrain — assay at 2b247c0 (practice-review Pass 0)"
---
# Terrain — assay at 2b247c0

Pass 0, breadth only, derived blind (no prior run read; `tests/sweeps/`, `tests/fixtures/*/map/`
and every `ANSWERS.yaml` excluded from every listing). Target: `andyschwab/assay`, detached at
`2b247c014b1484d4e1b1512b49b32f708800d92c` (commit date 2026-11-11T14:06:15Z, shallow clone;
no remote branch head names the commit). Method read at engine `147a394`.

## Canon

None. `map/canon/README.md:23` says the directory ships empty and no `canon/assay*.yaml` exists, so
the populations below are derived blind; the slugs fixed here are this run's proposal for a canon.

## The map

- **Size.** 549 tracked files outside the excluded sets; ~25k lines outside `tests/`.
  425 files under `tests/` (161 harness blocks, 136 negative fixtures, 99 instrument fixtures).
- **Languages.** JavaScript ES modules (`.mjs`, 228 files) on Node >= 22 (`package.json:17`),
  JSDoc-typed and checked by `tsc` (`tsconfig.json`); YAML contracts (144) and Markdown docs (86).
  Zero runtime dependencies (`package.json:18` devDependencies only: `@types/node`, `typescript`).
- **Entry points.** `assay.mjs` (the CLI dispatcher: one command → one script, `assay.mjs:17-58`);
  `package.json` scripts `test` (`node tests/regression.mjs`), `lint` and `build`
  (`lib/check-syntax.mjs`), `typecheck` (`tsc`), `validate`.
- **CI.** `.github/workflows/ci.yml` (push to main + PR; Node 22/24 matrix; lint, typecheck, build,
  tools action, `npm test`); `release.yml` (dispatch: tag + GitHub release); `tools-check.yml`
  (weekly: opens/updates an issue for pins behind upstream); `branch-cleanup.yml` (reusable +
  dispatch: deletes merged branches, dry-run by default); composite action `.github/actions/tools`.
  No commit hooks in the tree.
- **Load-bearing directories.**
  `map/` (the map: `start`, `validate`, `ingest`, `enumerate`, `record`, `lane`, `tools`,
  `fresh-clone`, `dependency-scan`, `structure-scan`, `repo-census`, `variance`, `score`, `backlog`,
  `migrate-run`; `METHOD.md`, `SCHEMA.md`);
  `map/scanners/` (`CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md`, 12 adapters under `adapters/`);
  `yardstick/` (`requirements.yaml`, `measure`, `compare`, `ratchet`, `packet`, `README.md`);
  `views/` (`compile`, `intake`, `maintain`, `owner`, `since`, `floor-fleet`, `improve/*`);
  `owner/` (`ask-owner`, `PACKET.md`, `evidence/`); `routine/` (`run.mjs`, `assay-routine.yml`,
  `README.md`); `lib/` (`yaml-min`, `run-data`, `run-layout`, `display`, `release-notes`,
  `check-syntax`); `tests/` (`regression.mjs`, `harness.mjs`, `blocks/`, `negative/`,
  `instruments/`, `fixtures/` (excluded `map/`), `enumerate-fixture/`, `golden.json`).
- **Docs surface.** `README.md` (front door, architecture, quickstart, layout), `CLAUDE.md` (agent
  contract), `CONSUMERS.md` (consumer contract), `RUNBOOK.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `views/README.md`, `yardstick/README.md`, `routine/README.md`, `owner/PACKET.md`,
  `map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`, `tests/README.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (a `type: skill` method, the practice-review
  scanner); lane seeds `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md`, rendered by `map/lane.mjs`.

## AI surfaces (from the listing)

`populations.modelCalls` is empty: no file in the tree calls a model through a provider SDK or API.
The AI contexts are the two **review lanes** whose seed bodies `map/lane.mjs` renders for a model
session a consumer starts (practice-review, deep-code-review); the model, its tier and its spend are
the consumer's, recorded back through `record --pass`/`--spend`. `map/METHOD.md` and `CLAUDE.md`
are agent-facing instruction surfaces, not call sites.

## Effect inventory draft (fixed slugs; the delegation pass writes one `effect` finding each)

Candidate list = `populations.channelCandidates` (1) + `routeHandlers` (6) + `effectSites` (6) of
`map/raw/enumerate.json`; triaged by the delegation pass in `map/effect-triage.yaml`.

| slug | invocable surface | where |
|---|---|---|
| `migrate-run` | `assay migrate-run <run> --write` rewrites a stored run's files | `map/migrate-run.mjs` (candidate `surface: migrate-run.mjs`) |
| `run-write` | `start` / `ingest` / `record` / `compile` write into a run directory | `map/start.mjs`, `map/ingest.mjs`, `map/record.mjs`, `views/compile.mjs` |
| `fresh-clone-exec` | `fresh-clone --allow-exec` installs, builds, tests the target (shell) | `map/fresh-clone.mjs:310` |
| `dependency-audit` | `dependency-scan` runs the target's package manager `audit` (registry egress) | `map/dependency-scan.mjs:275`, `:398` |
| `structure-scan-install` | `structure-scan` installs jscpd/knip from the npm registry and runs knip over the target's config | `map/structure-scan.mjs:103`, `:120`, `:189` |
| `tools-install` | `tools install` downloads pinned binaries, checksum-verified, onto PATH | `map/tools.mjs:125`, `.github/actions/tools/action.yml` |
| `branch-delete` | `branch-cleanup.yml` delete job (`gh api -X DELETE refs/heads/…`) | `.github/workflows/branch-cleanup.yml:131` |
| `release-publish` | `release.yml` tag + `gh release create` | `.github/workflows/release.yml:50` |
| `tools-pin-issue` | `tools-check.yml` opens or comments an issue | `.github/workflows/tools-check.yml:33`, `:35` |
| `routine-artifact-upload` | the routine template uploads the run as an Actions artifact | `routine/assay-routine.yml:78`, `:184` |

Route handlers (all six) live under `tests/enumerate-fixture/nextjs/` (an enumerate test fixture,
never served). Effect-site members `docker control`, `git push`, `message/mail send` cite only
`map/enumerate.mjs` pattern tables (and excluded sweep files); `http write`, `http write (js)`,
`shell exec` cite opengrep taint-rule YAML and a scanner control fixture. The delegation pass judges
each.

## Closed populations handed to passes

- **credential census** (delegation, `d-credentials-enumerated`): `populations.secrets`, 21 names.
- **change-gates census** (gates, `d-change-gates-fail-closed`): `populations.changeGates`, 24
  members (20 CI steps, 4 package scripts). No hooks exist.
- **model-call-telemetry census** (context, `d-model-call-telemetry`): `populations.modelCalls`,
  empty — triaged `triage: []`.
- **container / agent classes**: no container is launched by the engine (`containerClasses` and
  `socketMounts` cite only `map/enumerate.mjs` pattern tables and fixtures); the execution classes are
  the local CLI user, the CI runner (read-only token), the two write-token jobs (release,
  branch-delete, tools-pin-issue) and a consumer's review-lane session.
- **ingestion points** (delegation, `d-ingested-content-is-data`), frozen: I1 scanner reports
  ingested (`map/ingest.mjs`); I2 the target tree read by `enumerate`/`repo-census`/`toolchain`;
  I3 the owner packet (`yardstick/packet.mjs`, `owner/`); I4 a review lane's collected outputs
  (`map/lane.mjs`, `validate --lane`); I5 the run's authored decisions (`map/decisions.mjs`);
  I6 target text carried into the handoff (`views/improve/handoff.mjs`).
- **decisions** (legibility, `d-decisions-reconstruct`), frozen D1–D10: D1 zero runtime
  dependencies; D2 a hand-written strict YAML subset reader (`lib/yaml-min.mjs`); D3 scanners only
  as adapters, core names none; D4 no history file, git is the record; D5 actions pinned to commit
  SHAs; D6 target-executing scanners only behind `--allow-exec`; D7 `tsc` over JSDoc `.mjs`, no TS
  source; D8 `tests/golden.json` re-blessed only in a reviewed commit; D9 the routine splits the
  change's code and its gate into two jobs; D10 Node >= 22 with a 22/24 CI matrix.
- **modules** (context, `d-modules-standalone`), frozen M1–M14: `assay.mjs`; `lib/`;
  `map/validate.mjs`; `map/enumerate.mjs`; `map/ingest.mjs`; `map/start.mjs`; `map/fresh-clone.mjs`;
  `map/repo-census.mjs`; `map/scanners/` (adapters + CONTRACT); `yardstick/`; `views/improve/`;
  `views/` (other views); `owner/`; `routine/`.
- **doc claims** (legibility, `d-readme-true`): the concrete command/path/count claims in
  `README.md`, `CLAUDE.md` and `CONSUMERS.md`, enumerated by that pass before assessment.
- **lessons** (improvement, `d-corrections-become-mechanisms`): the lessons the docs record (the
  "a calibration measured…" passages, CLAUDE.md's rules that name a guard), enumerated by that pass.
- **interfaces** (multiplayer, `d-agent-consumable-surface`): the CLI commands (`assay.mjs` GROUPS),
  the run file formats (SCHEMA), the lane seed, the floor JSON, the tools action, the routine
  workflow, the branch-cleanup reusable workflow, the packet.

## Slice plan (what each pass reads; what it does not)

1. **Legibility** — `README.md`, `CLAUDE.md`, `CONSUMERS.md`, `CONTRIBUTING.md`, the files behind
   D1–D10 (`package.json`, `lib/yaml-min.mjs`, `tests/blocks/core-names-no-scanner.mjs`,
   `tests/blocks/no-history-file.mjs`, `.github/workflows/ci.yml`, `routine/README.md`).
2. **Context** — `README.md` (routing), `assay.mjs`, each module M1–M14's head comment, `tsconfig.json`.
3. **Gates** — `.github/workflows/*.yml`, `.github/actions/tools/action.yml`, `package.json`,
   `lib/check-syntax.mjs`, `tests/regression.mjs`, `tests/harness.mjs`, `tests/README.md`,
   `tests/blocks/negative-fixtures.mjs`, `tests/blocks/ci-workflow.mjs`, `map/validate.mjs` (head).
4. **Verification** — `tests/golden.json`, `tests/blocks/fixture-recall.mjs`, `map/score.mjs`,
   `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md` ("How a change lands"), `map/record.mjs`,
   `routine/run.mjs`, `map/start.mjs`.
5. **Delegation** — the effect inventory's files above, `map/child-env.mjs`, `map/ingest.mjs`,
   `map/lane.mjs`, `yardstick/packet.mjs`, `RUNBOOK.md`, `SECURITY.md`, `routine/assay-routine.yml`.
6. **Improvement** — `CLAUDE.md`, `map/backlog.mjs`, `map/variance.mjs`, `map/METHOD.md` (lessons),
   `RUNBOOK.md`, `tests/blocks/` names.
7. **Multiplayer** — `CONSUMERS.md`, `assay.mjs`, `map/lane.mjs`, `.github/actions/tools/action.yml`,
   `routine/README.md`, `owner/PACKET.md`, `yardstick/list.mjs`.

Not read: `tests/sweeps/` and `tests/fixtures/*/map/` (terrain only), any `ANSWERS.yaml`, the
opengrep taint rule bodies beyond the lines the enumeration cites, and git history.
