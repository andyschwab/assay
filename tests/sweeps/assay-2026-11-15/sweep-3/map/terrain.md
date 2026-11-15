---
confidential: true
type: doc
title: "Terrain — andyschwab/assay at a17104d"
---
# Terrain (Pass 0) — andyschwab/assay

Head `a17104d714ec76259e6d793954371885965f784a` (branch `main`, committed 2026-11-15, shallow
clone). No canon exists for this target in the tree (`map/canon/README.md` holds the canon
contract only), so every population below is derived blind from the listing and
`map/raw/enumerate.json`; no prior run was read. `tests/sweeps/`, `tests/fixtures/*/map/` and every
`ANSWERS.yaml` are terrain only: excluded from every listing and never opened.

## Map

- **What it is.** assay, an evidence-based repository evaluator: it draws a map (findings) of a
  target, measures it against a yardstick of requirements, and compiles views (Improve, Owner,
  Since). It is itself a CLI plus a method an AI review lane follows (`map/METHOD.md`); the
  repository calls no model itself (`populations.modelCalls` is empty).
- **Languages and size.** 818 tracked files outside the excluded paths (1038 in all). JavaScript
  ES modules dominate (381 `.mjs`, 14 `.js`, 2 `.cjs`), with YAML (181 `.yaml`, 21 `.yml`) and
  Markdown (104). TypeScript (26 `.ts`), Python (11) and SQL (6) appear only under `tests/` as
  enumerate fixtures. About 34k lines outside `tests/`; `tests/` holds 667 of the listed files.
- **Build, test, lint, CI.** `package.json:8-16`: `test` (`tests/regression.mjs`), `gate`
  (`lib/gate.mjs`, the one landing command), `lint` and `build` (`lib/check-syntax.mjs`),
  `typecheck` (`tsc -p tsconfig.json` over JSDoc-typed JS), `validate`, `score`. No runtime
  dependencies; dev dependencies `typescript` and `@types/node` only. Node >=22.
  CI: `.github/workflows/ci.yml` (push to main and every pull request, Node 22 and 24, runs the
  pinned-tools composite action `.github/actions/tools/action.yml` then `npm run gate`),
  `release.yml` (manual dispatch: version check, tests, tag and publish), `branch-cleanup.yml`
  (on push: plan then delete merged branches), `tools-check.yml` (scheduled: open or update an
  issue for pins behind upstream). The routine template `routine/assay-routine.yml` is shipped
  for other repositories to copy.
- **Load-bearing directories.**
  `assay.mjs` (CLI dispatch, the command table at `assay.mjs:21-57`);
  `lib/` (gate, syntax check, release notes, YAML reader `lib/yaml-min.mjs`, run layout and data);
  `map/` (the map engine: `start`, `enumerate`, `validate`, `ingest`, triage, signals, scope,
  doctrine, fresh-clone, dependency-scan, structure-scan, repo-census, variance, score, backlog);
  `map/scanners/` (`CONTRACT.md`, `CANDIDATES.md`, `INTAKE.md`, and `adapters/`, one YAML per
  scanner plus rule packs);
  `yardstick/` (`requirements.yaml`, `measure.mjs`, `ratchet.mjs`, `packet.mjs`, `compare.mjs`);
  `views/` and `views/improve/` (compile, owner, since, report, handoff, maturity, templates);
  `owner/` (the owner packet and prompt); `routine/` (the routine contract, template and runner);
  `.github/` (workflows, composite action, PR template); `tests/` (`regression.mjs`,
  `prove-red.mjs`, 251 files in `tests/blocks/`, `tests/negative/`, `tests/instruments/`,
  `tests/enumerate-fixture/`).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`,
  `RUNBOOK.md`, `SECURITY.md`, `CONSUMERS.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/CONTRACT.md`, `yardstick/README.md`, `views/README.md`, `routine/README.md`,
  `owner/PACKET.md`, `owner/ask-owner.md`, `map/canon/README.md`, the view templates under
  `views/improve/templates/`, `.github/PULL_REQUEST_TEMPLATE.md`.
- **Agent-facing files.** `CLAUDE.md`; the review-lane seeds
  `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md` (rendered by `map/lane.mjs`); `map/METHOD.md`
  (the practice-review skill, OKF frontmatter `type: skill`); `map/passes.yaml`. No
  `.cursorrules`, `AGENTS.md` or MCP config.

## Effect inventory draft (from `map/raw/enumerate.json`)

The candidate list is `populations.channelCandidates` (1), `populations.routeHandlers` (1) and
`populations.effectSites` (24): 26 candidates, handed whole to the delegation pass, which owns the
triage in `map/effect-triage.yaml`. `populations.excluded` (270) is not a candidate. Proposed
fixed channel slugs (the delegation pass may merge candidates that are one invocation into one
finding, keeping these slugs):

| candidate (member, verbatim) | proposed slug | note from the listing |
|---|---|---|
| `surface: migrate-run.mjs` | `run-migrate` | rewrites a stored run with `--write` |
| `route: POST /login` | `login-route-example` | read at `map/effect-signals.mjs:293`, a comment inside the enumerator; the scope rule forces a POST route in |
| `artifact upload (workflow) @ routine/assay-routine.yml` | `routine-artifact-upload` | template copied into stewarded repos |
| `git push @ map/effect-scope.mjs` | `effect-scope-kind-table` | `map/effect-scope.mjs:125`, a string in a kinds table |
| `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | `branch-delete` | deletes merged branches on push |
| `http write (js) @ map/tools.mjs` | `tool-install` | download of pinned tools |
| `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | `tools-pin-issue` | scheduled issue write |
| `process spawn (js) @ assay.mjs` | `cli-dispatch` | runs the subcommand module |
| `process spawn (js) @ lib/check-syntax.mjs` | `syntax-check` | `node --check` |
| `process spawn (js) @ lib/gate.mjs` | `gate-run` | runs the gate steps |
| `process spawn (js) @ lib/release-notes.mjs` | `release-notes-git` | reads git |
| `process spawn (js) @ map/backlog.mjs` | `backlog-git` | |
| `process spawn (js) @ map/dependency-scan.mjs` | `dependency-scan-exec` | runs the target's package manager |
| `process spawn (js) @ map/fresh-clone.mjs` | `fresh-clone-exec` | executes the target's code |
| `process spawn (js) @ map/repo-census.mjs` | `repo-census-spawn` | |
| `process spawn (js) @ map/services.mjs` | `services-start` | starts declared services |
| `process spawn (js) @ map/start.mjs` | `run-start` | draws a run, invoking instruments |
| `process spawn (js) @ map/structure-scan.mjs` | `structure-scan-exec` | installs jscpd/knip from npm |
| `process spawn (js) @ map/sweep-method.mjs` | `sweep-method-git` | |
| `process spawn (js) @ map/target-identity.mjs` | `target-identity-git` | |
| `process spawn (js) @ map/tools.mjs` | `tool-install` | extract and verify of pinned tools |
| `process spawn (js) @ map/validate.mjs` | `validate-git` | commit-citation check |
| `process spawn (js) @ routine/run.mjs` | `routine-run` | |
| `process spawn (js) @ views/compile.mjs` | `compile-views` | |
| `process spawn (js) @ yardstick/ratchet.mjs` | `ratchet-git` | |
| `release write (workflow) @ .github/workflows/release.yml` | `release-publish` | dispatch-only release |

## Censuses Pass 0 hands on

- **Credential** (delegation, `d-credentials-enumerated`): `populations.secrets`, 30 candidates,
  each triaged once in `map/census-triage.yaml` (`census: credential`). Most are inert strings in
  test fixtures or in the docs' examples; the live ones are the workflow and routine tokens
  (`GH_TOKEN`, `GITHUB_TOKEN`, `ASSAY_READ_TOKEN`, `FETCH_TOKEN`) and identifier-named constants
  (`CANDIDATE_KEY`, `ID_RECORD_KEY`, `SERVICE_KEYS`, `TOP_KEYS`). `secretConstants` is no candidate.
- **Change gates** (gates, `d-change-gates-fail-closed`): `populations.changeGates`, 21 candidates
  (17 CI steps across the four workflows, 4 package scripts: `lint`, `test`, `typecheck`,
  `validate`), triaged under `census: change-gates`.
- **Model-call telemetry** (context, `d-model-call-telemetry`): `populations.modelCalls` is empty;
  triaged `triage: []`.
- **Ingested content** (delegation, `d-ingested-content-is-data`): no tool lists it; the pass
  enumerates ingestion points from the code (the target tree enumerate and the instruments read,
  scanner output `ingest` reads, downloaded tool archives, the routine's fetched engine, the
  owner's answers read by `owner/`/`yardstick/packet.mjs`).

## Frozen populations for the census-augmented passes

- **Non-obvious decisions** (legibility, `d-decisions-reconstruct`), D1–D11, one finding each:
  D1 no runtime dependencies and an own YAML reader (`lib/yaml-min.mjs`); D2 plain `.mjs`
  typechecked by `tsc` through JSDoc (`tsconfig.json`); D3 a finding never carries a severity
  (`README.md`, the one rule); D4 the lane/ingest id ranges split at F-10000 (`map/SCHEMA.md` §3);
  D5 the core names no scanner, adapters carry it (`CLAUDE.md` rule 7); D6 the routine's two jobs,
  only one executing the target (`routine/README.md`); D7 `ASSAY_REF` a full SHA, never a branch
  (`routine/assay-routine.yml:4-6`); D8 tool downloads checksum-pinned before execution
  (`map/tools.mjs`, `.github/actions/tools/action.yml`); D9 executing instruments only with
  `--allow-exec` and an allow-listed environment (`map/child-env.mjs`, `assay.mjs:66-67`); D10 the
  Apache-2.0 licence with a NOTICE; D11 the Node 22 and 24 matrix in CI (`.github/workflows/ci.yml:22-24`).
- **Modules** (context, `d-modules-standalone`), M1–M10, one finding each: `assay.mjs`, `lib/`,
  `map/` (its top-level files), `map/scanners/`, `views/` (top level), `views/improve/`,
  `yardstick/`, `owner/`, `routine/`, `.github/actions/tools/`.
- **Doc claims** (legibility, `d-readme-true`): concrete claims sampled from `README.md`,
  `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`; one finding per claim checked.
- **Lessons** (improvement, `d-corrections-become-mechanisms`): the recorded lessons the tree
  names (calibration notes in `map/METHOD.md` and `map/SCHEMA.md`, `tests/prove-red.mjs` entries,
  `CLAUDE.md` "How a change lands"); one finding per lesson.
- **Interfaces** (multiplayer, `d-agent-consumable-surface`): the commands of the table at
  `assay.mjs:21-57` and the data formats other tools read (the finding YAML, `map/censuses.yaml`,
  the triages, `map/scanners.yaml`, `yardstick.yaml`, the view data files, the owner packet, the
  adapter format).

## Slice plan

- **Legibility**: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`, `SECURITY.md`,
  `CONSUMERS.md`, `lib/yaml-min.mjs`, `tsconfig.json`, `routine/README.md`, `map/child-env.mjs`,
  `map/tools.mjs`, `NOTICE`.
- **Context**: `assay.mjs`, `lib/`, heads of `map/*.mjs`, `map/scanners/CONTRACT.md`,
  `views/README.md`, `yardstick/README.md`, `owner/`, `routine/run.mjs`, `.github/actions/tools/`.
- **Gates**: `.github/workflows/*.yml`, `.github/actions/tools/action.yml`, `lib/gate.mjs`,
  `lib/check-syntax.mjs`, `lib/release-notes.mjs`, `tests/regression.mjs`, `tests/prove-red.mjs`,
  `map/validate.mjs`, `tsconfig.json`, `package.json`.
- **Verification**: `tests/regression.mjs`, `tests/prove-red.mjs`, `tests/negative/`,
  `map/score.mjs`, `map/variance.mjs`, `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`,
  `map/METHOD.md` (calibration), `routine/run.mjs`.
- **Delegation**: every candidate's cited file and line; `map/tools.mjs`, `map/child-env.mjs`,
  `map/fresh-clone.mjs`, `map/dependency-scan.mjs`, `map/structure-scan.mjs`, `map/services.mjs`,
  `map/migrate-run.mjs`, `map/ingest.mjs`, `routine/assay-routine.yml`, the four workflows.
- **Improvement**: `CLAUDE.md`, `CONTRIBUTING.md`, `tests/prove-red.mjs`, `map/backlog.mjs`,
  `map/roster.mjs`, `views/improve/tally.mjs`, `.github/workflows/tools-check.yml`.
- **Multiplayer**: `assay.mjs`, `CONSUMERS.md`, `views/rows.mjs`, `map/lane.mjs`,
  `map/scanners/CONTRACT.md`, `owner/`, `routine/README.md`.

**Not read.** `tests/sweeps/`, `tests/fixtures/*/map/` and `ANSWERS.yaml` (excluded by the task);
the opengrep rule packs under `map/scanners/adapters/opengrep/` (data the scanner reads); the
enumerate fixtures under `tests/enumerate-fixture/` beyond what a candidate's triage needs.
