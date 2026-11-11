---
type: doc
title: "Terrain: assay at 2b247c0 (practice-review, Pass 0)"
---
# Terrain — assay at 2b247c014b14

Pass 0, breadth only. Derived **blind**: no canon exists for this target
(`map/canon/` holds only its README), no prior run was read, and `tests/sweeps/`,
`tests/fixtures/*/map/` and every `ANSWERS.yaml` are terrain only, never opened or listed.
The effect candidates come from the given enumeration (`map/raw/enumerate.json`).

## What it is

assay is a zero-runtime-dependency Node (>=22) command-line engine that evaluates
*other* repositories: it draws a map (findings with `file:line` evidence), measures it
against a yardstick of requirements, and compiles views (Intake, Maintain, Improve,
Owner, Since) plus an agent handoff. It ships its own method (`map/METHOD.md`), format
(`map/SCHEMA.md`), scanner adapters (`map/scanners/adapters/`), a scheduled routine
template for stewarded repositories (`routine/`), and an owner packet (`owner/`).

## Size and languages (git ls-files, excluding the blind-sweep paths)

549 tracked files: 228 `.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, 11 `.js`,
7 `.ts`, 5 `.sql`. Roughly 70% of files are test material (`tests/blocks` 161,
`tests/negative` 136, `tests/instruments` 99). Largest sources: `map/ingest.mjs` (1282
lines), `map/repo-census.mjs` (1300), `map/scanners/CONTRACT.md` (1061),
`map/SCHEMA.md` (1125), `yardstick/requirements.yaml` (912), `map/METHOD.md` (813),
`map/validate.mjs` (795), `map/fresh-clone.mjs` (695).

## Entry points: build, test, lint, CI

- `package.json`: `test` = `node tests/regression.mjs`; `lint` and `build` = `node
  lib/check-syntax.mjs`; `typecheck` = `tsc -p tsconfig.json`. devDependencies only
  (`typescript`, `@types/node`), pinned exactly.
- CLI: `assay.mjs` dispatches ~33 commands to scripts in `map/`, `yardstick/`, `views/`,
  `routine/`, `owner/` (`assay.mjs:18-58`).
- CI: `.github/workflows/ci.yml` (push to main + every PR; Node 22 and 24; npm ci, lint,
  typecheck, build, the tools action, npm test); `release.yml` (person-dispatched tag +
  GitHub release); `tools-check.yml` (weekly, opens/updates an issue); `branch-cleanup.yml`
  (deletes merged branches); composite action `.github/actions/tools/action.yml`.
- Harness: `tests/regression.mjs` + `tests/harness.mjs` run `tests/blocks/*` (one file per
  block), negative fixtures `tests/negative/`, pinned recall `tests/golden.json`.
- No commit/push hooks are tracked (no `.husky`, no `.pre-commit-config`).

## Load-bearing directories

| dir | role |
|---|---|
| `map/` | engine core: start, validate, ingest, record, enumerate, chains, doctrine, census, effect-triage, variance, score, backlog, project |
| `map/scanners/` | the scanner contract (`CONTRACT.md`), intake, candidates, and one adapter per scanner |
| `map/scanners/adapters/` | adapters (yaml) + lanes (`practice-review/lane.md`, `deep-code-review/lane.md`) + opengrep vendored taint rules and positive control |
| `yardstick/` | requirements (`requirements.yaml`), measure, compare, ratchet, packet |
| `views/` | intake, maintain, owner, since, severity, hotspot, compile |
| `views/improve/` | report, handoff, maturity, axes, sequence, topics, templates |
| `lib/` | `yaml-min.mjs` (the strict reader), run-layout, run-data, display, release-notes, check-syntax |
| `routine/` | `run.mjs` + `assay-routine.yml` (consumer-installed workflow) + README |
| `owner/` | owner packet (`PACKET.md`), ask-owner prompt, evidence templates |
| `tests/` | harness, blocks, negative, instruments, enumerate-fixture, fixtures (non-map parts) |
| `.github/` | 4 workflows, the tools composite action, PR template |

## Docs surface

`README.md` (front door), `CLAUDE.md` (agent contract, 73 lines), `CONTRIBUTING.md`,
`CONSUMERS.md` (consumer contract + `Consumer:` trailer), `RUNBOOK.md`, `SECURITY.md`,
`map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`, `map/scanners/INTAKE.md`,
`map/scanners/CANDIDATES.md`, `yardstick/README.md`, `views/README.md`,
`routine/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`, `tests/README.md`,
`tests/fixtures/README.md`.

## Agent-facing files

`CLAUDE.md`; the two review lanes `map/scanners/adapters/practice-review/lane.md` and
`map/scanners/adapters/deep-code-review/lane.md` (seed bodies `map/lane.mjs` fills in);
`map/METHOD.md` (opened as a session's opening context); `owner/ask-owner.md` (the
owner prompt); `.github/PULL_REQUEST_TEMPLATE.md`.

## AI surfaces (capabilities: an LLM call site)

A grep for model SDKs and API hosts over code and workflows finds **no in-code LLM call
site**: assay calls no model. Its AI surface is the **review-lane session**: a coding-agent
session a consumer starts from `node assay.mjs lane <scanner>` (`map/lane.mjs`), seeded by a
lane body, which reads an untrusted target repository and writes findings. One capability
finding: `review-lane-session` (delegation pass). The weekly/scheduled workflows call no
model.

## Effect inventory (fixed channel slugs; one `effect` finding each, delegation pass)

Invocation boundary = one `assay.mjs` command or one workflow job.

| slug | invocable surface | evidence to start from |
|---|---|---|
| `run-start` | `assay start`: makes a run dir, runs offline instruments | `map/start.mjs` |
| `run-ingest` | `assay ingest`: writes scanner rows into a run | `map/ingest.mjs` |
| `run-record` | `assay record`: rewrites one row of `map/scanners.yaml` under a lock | `map/record.mjs` |
| `run-migrate` | `assay migrate-run --write`: rewrites a run's files in place | `map/migrate-run.mjs` |
| `run-compile` | `assay compile`: writes views, INDEX, IMPROVE, handoff (removes the handoff dir first) | `views/compile.mjs`, `views/improve/handoff.mjs:604` |
| `measure-write` | `assay measure --write` | `yardstick/measure.mjs:585` |
| `maturity-write` | `assay maturity --write` | `views/improve/maturity.mjs:224` |
| `backlog-write` | `assay backlog --write` | `map/backlog.mjs:45` |
| `intake-write` | `assay intake` | `views/intake.mjs` |
| `maintain-write` | `assay maintain` | `views/maintain.mjs` |
| `owner-write` | `assay owner` | `views/owner.mjs` |
| `since-write` | `assay since` | `views/since.mjs` |
| `repo-census-write` | `assay repo-census` | `map/repo-census.mjs` |
| `ratchet-write` | `assay ratchet` (writes a baseline?) | `yardstick/ratchet.mjs` |
| `fresh-clone-exec` | `assay fresh-clone`: executes the target's install/build/test | `map/fresh-clone.mjs` |
| `dependency-scan-exec` | `assay dependency-scan`: runs the target's package manager audit | `map/dependency-scan.mjs` |
| `structure-scan-exec` | `assay structure-scan`: installs jscpd/knip from the registry; knip loads the target's configs | `map/structure-scan.mjs` |
| `tools-install` | `assay tools install`: downloads pinned binaries, sha256-checked | `map/tools.mjs` |
| `routine-run` | `assay routine`: verify, draw, validate, compile, ratchet | `routine/run.mjs` |
| `routine-workflow` | the consumer-installed scheduled workflow | `routine/assay-routine.yml` |
| `release-publish` | `release.yml`: tags and publishes a GitHub release | `.github/workflows/release.yml:50` |
| `branch-delete` | `branch-cleanup.yml`: deletes merged branches | `.github/workflows/branch-cleanup.yml:131` |
| `tools-check-issue` | `tools-check.yml`: opens or comments on an issue | `.github/workflows/tools-check.yml:33` |

### Candidate triage draft (closes `map/raw/enumerate.json`: 1 channel candidate, 6 route handlers, 6 effect-site members)

- `surface: migrate-run.mjs` → `run-migrate`.
- the six `route:` members all sit in `tests/enumerate-fixture/nextjs/`, a detector fixture
  nothing serves → out of scope.
- effect sites: `docker control`, `git push`, `message/mail send` cite only the
  enumerator's own detector regexes (`map/enumerate.mjs`) → out of scope; `http write`
  cites only vendored taint-rule pattern data → out of scope; `shell exec` cites the
  opengrep positive control (inert, never run) and rule data → out of scope; `http write
  (js)` includes a real fetch at `map/tools.mjs:125` → `tools-install`.

## Census populations (frozen here, before assessment)

| census | dimension | subject_type | population |
|---|---|---|---|
| `decision-reconstruction` | artifact-legibility | artifact | D1–D10 below |
| `doc-freshness` | artifact-legibility | artifact | every concrete claim (command, path, count, capability) in `CLAUDE.md` and in `README.md`'s Quickstart block |
| `modules-standalone` | context-economy | artifact | M1–M8 below |
| `change-gates` | deterministic-gates | contract | every step of `ci.yml`'s `test` job and of `release.yml`'s gate steps, plus the tools composite action |
| `effect-provability` | verification | control | every effect channel in the table above |
| `credential` | delegation | control | `GH_TOKEN`, `GITHUB_TOKEN`, `ASSAY_READ_TOKEN`, `FETCH_TOKEN` (the enumerated secrets a running assay or its workflows read; fixture strings, planted test tokens and `*_KEYS` constant lists excluded) |
| `incidents-became-mechanisms` | improvement-loop | process | every lesson recorded as a past failure in `CLAUDE.md`, `README.md`, `RUNBOOK.md`, `map/METHOD.md`, `map/SCHEMA.md`, `routine/README.md` |
| `agent-access-surface` | multiplayer | artifact | every command `assay.mjs` dispatches, plus every machine-readable output format `views/README.md` declares |

Decisions (D): D1 a zero-dependency strict YAML subset reader instead of a YAML library
(`lib/yaml-min.mjs`); D2 finding ids carry no dimension meaning (`map/SCHEMA.md` §3); D3 no
severity in the base and no go/no-go or deploy-stage verdict (`README.md`, `map/SCHEMA.md`
§6a); D4 the core names no external scanner, scanners arrive as adapters (`CLAUDE.md` rule
7); D5 fresh-clone executes the target only under `--allow-exec`; D6 no history file, the
change record is git; D7 every pinned tool download is sha256-checked before it runs
(`map/tools.mjs`); D8 the routine runs the target's steps in a separate job from the
engine's (`routine/assay-routine.yml`); D9 a pinned-score move is a reviewed re-bless of
`tests/golden.json`; D10 the static-analysis instrument runs over a positive control before
the target.

Modules (M): M1 `map/` core scripts; M2 `map/scanners/` (contract + adapters); M3
`yardstick/`; M4 `views/` (non-improve); M5 `views/improve/`; M6 `lib/`; M7 `routine/`;
M8 `owner/`.

## Slice plan (what each pass reads; what it does not)

1. **legibility**: `README.md`, `CLAUDE.md`, `map/SCHEMA.md`, `lib/yaml-min.mjs`,
   `map/tools.mjs`, `routine/README.md`, `routine/assay-routine.yml`, `map/start.mjs`,
   `tests/README.md`, `map/scanners/adapters/opengrep.yaml`, `map/scanners/CONTRACT.md` (by section).
2. **context**: `README.md`, `CLAUDE.md`, each module M1–M8's README/contract and entry
   script, `tests/README.md`; spend-side: any model-tier record (`map/scanners.yaml` template, lanes).
3. **gates**: `.github/workflows/*.yml`, `.github/actions/tools/action.yml`,
   `tests/regression.mjs`, `tests/harness.mjs`, `lib/check-syntax.mjs`, `tsconfig.json`,
   `package.json`, `lib/release-notes.mjs`, `map/validate.mjs` (fail-closed paths).
4. **verification**: the effect scripts' success paths (`map/start.mjs`, `map/ingest.mjs`,
   `map/record.mjs`, `views/compile.mjs`, `routine/run.mjs`, `map/tools.mjs`), `map/variance.mjs`,
   `map/score.mjs`, `tests/golden.json`, `tests/regression.mjs`, opengrep control.
5. **delegation**: every effect channel's script, the four workflows, `routine/assay-routine.yml`,
   `map/lane.mjs`, the two lane bodies, `map/child-env.mjs`, `SECURITY.md`.
6. **improvement**: `CLAUDE.md`, `CONTRIBUTING.md`, `CONSUMERS.md`, `lib/release-notes.mjs`,
   `map/backlog.mjs`, the lessons in METHOD/SCHEMA/RUNBOOK/routine README, `tests/blocks/no-history-file.mjs`.
7. **multiplayer**: `assay.mjs`, `views/README.md`, `map/lane.mjs`, `CONSUMERS.md`,
   `owner/PACKET.md`, `owner/ask-owner.mjs`, `lib/run-data.mjs`.

Not read: the bulk of `tests/blocks/` and `tests/negative/` (sampled only where a gate or
lesson names one), `tests/instruments/` (scanner sample outputs), `tests/sweeps/` and
`tests/fixtures/*/map/` (blind-sweep exclusion), the vendored taint rules beyond their headers.
