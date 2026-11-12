---
type: doc
title: "Terrain — assay at 2b247c0 (practice-review, Pass 0)"
---
# Terrain — assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Derived blind: no prior run, no canon for this target (`map/canon/` holds only its
README), no file under `tests/sweeps/` or `tests/fixtures/*/map/` opened, no `ANSWERS.yaml`
opened. Listings exclude those paths. The enumeration input is
`map/raw/enumerate.json` (given, copied into this run unchanged).

## What it is

assay is a Node (>=22, ESM `.mjs`) command-line engine that evaluates *other* repositories:
it draws a **map** (findings with `file:line` evidence, from instruments and judgment
scanners), measures it against a **yardstick** (`yardstick/requirements.yaml`) and compiles
**views** (Intake, Maintain, Improve, Owner, Since). It runs no server and holds no
database. It calls no model itself: `populations.modelCalls` is empty, and its AI surface
is method text a session a person started runs (the practice-review and deep-code-review
lanes, `map/scanners/adapters/*/lane.md`, printed by `assay lane`).

## Size and languages

605 tracked files outside the excluded paths; ~25k lines outside `tests/`.
228 `.mjs`, 183 `.yaml`, 86 `.md`, 54 `.json`, 11 `.yml`, a handful of `.ts/.js/.sql`
(fixtures). Dev dependencies only: `typescript`, `@types/node` (`package.json:18`).

## Load-bearing directories

| dir | what |
|---|---|
| `assay.mjs` | the CLI dispatcher (command table `assay.mjs:20-56`, `spawnSync` at `assay.mjs:84`) |
| `map/` | instruments, ingest, validate, enumerate, start, lane, triage, chains, METHOD.md, SCHEMA.md |
| `map/scanners/` | the adapter contract (`CONTRACT.md`), candidates, intake; `adapters/*.yaml` per scanner |
| `yardstick/` | requirements, measure, compare, ratchet, packet |
| `views/` | compile and the five views; `views/improve/` report, handoff, maturity, axes |
| `lib/` | yaml-min (the one YAML reader), run-layout, run-data, check-syntax, release-notes |
| `routine/` | the scheduled-routine template (`assay-routine.yml`) and its driver `run.mjs` |
| `owner/` | owner packet, ask-owner prompt, owner evidence pages |
| `tests/` | `regression.mjs` → `harness.mjs`; 161 `blocks/`, 136 `negative/` files, `instruments/`, `fixtures/`, `enumerate-fixture/` |
| `.github/` | 4 workflows (ci, release, branch-cleanup, tools-check), composite action `actions/tools`, PR template |

## Build / test / CI entry points

- `npm test` → `node tests/regression.mjs` (`package.json:9`); `lint` and `build` both →
  `node lib/check-syntax.mjs` (`package.json:10,12`); `typecheck` → `tsc` (`package.json:11`);
  `validate` → `node assay.mjs validate` (`package.json:14`).
- `ci.yml`: push to main + every PR; matrix node 22/24; `npm ci`, lint, typecheck, build,
  tools action, `npm test`; `timeout-minutes: 15`, `contents: read`.
- `release.yml` (dispatch; `contents: write` on the job), `branch-cleanup.yml` (push/dispatch/call;
  plan + delete jobs), `tools-check.yml` (weekly cron; `issues: write`).
- No git hooks directory (no `.husky/`, no `.githooks/`).

## Docs surface

`README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`, `CONSUMERS.md`,
`RUNBOOK.md`, `SECURITY.md`, `map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`,
`map/scanners/CANDIDATES.md`, `map/scanners/INTAKE.md`, `yardstick/README.md`,
`views/README.md`, `routine/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`,
`owner/evidence/*.md`, `tests/README.md`, `map/canon/README.md`, `.github/PULL_REQUEST_TEMPLATE.md`.

## Agent-facing files

`CLAUDE.md`; the two review lanes `map/scanners/adapters/practice-review/lane.md` and
`map/scanners/adapters/deep-code-review/lane.md` (session seed bodies); `map/METHOD.md`
(the practice-review skill, OKF frontmatter `type: skill`); `owner/ask-owner.md` (a prompt
the owner pastes into an assistant); `map/lane.mjs` (fills a lane for a target).

## Container / agent classes

No container image of its own. Execution classes: (a) a person's terminal running the CLI;
(b) CI runners (ci, release, branch-cleanup, tools-check); (c) a stewarded repository's
routine (two jobs, `target` the only one that executes the target, `routine/README.md`);
(d) a review session a person started, seeded by a lane, that executes nothing.
`populations.containerClasses` and `socketMounts` list fixture members only (not channels).

## Effect inventory draft (fixed channel slugs — the passes draw slugs from here)

| slug | invocable surface | what it does |
|---|---|---|
| `fresh-clone-exec` | `assay fresh-clone`, `start --allow-exec` | executes the target's install/build/test (`map/fresh-clone.mjs:310`) |
| `dependency-audit-exec` | `assay dependency-scan` | runs the target's package manager audit in scratch copies (`map/dependency-scan.mjs:398`) |
| `structure-scan-install` | `assay structure-scan` | installs jscpd/knip from the npm registry into scratch, runs them (`map/structure-scan.mjs:103`) |
| `instrument-run` | `assay start` | runs each adopted scanner's binary over the target (`map/start.mjs:209`) |
| `tools-install` | `assay tools install` | downloads pinned tool releases, sha256-checked (`map/tools.mjs`) |
| `run-dir-write` | `start`, `ingest`, `record`, `compile`, `routine` | writes a run directory on local disk |
| `migrate-run-write` | `assay migrate-run --write` | rewrites an earlier run's files in place (`map/migrate-run.mjs`) |
| `routine-artifact-upload` | `routine/assay-routine.yml` | uploads the run directory as a build artifact |
| `release-publish` | `.github/workflows/release.yml` | tags and publishes a GitHub release |
| `branch-delete` | `.github/workflows/branch-cleanup.yml` | deletes merged branches |
| `pin-drift-issue` | `.github/workflows/tools-check.yml` | opens or updates an issue for pins behind upstream |
| `review-artifact-publish` | a review lane's session (`map/scanners/adapters/*/lane.md`) | publishes the review's private Artifact page (added by the delegation pass) |

The delegation pass owns the triage and may split or drop a slug with reason; it draws
slugs from this table.

### Candidate list handed to the delegation pass (effect triage, §6e)

From `map/raw/enumerate.json`, every member exactly as written:
- channelCandidates (1): `surface: migrate-run.mjs`
- routeHandlers (6): `route: ANY /api/hooks`, `route: DELETE /api/users/[id]`,
  `route: GET /api/users/[id]`, `route: GET /health`, `route: HEAD /health`,
  `route: PATCH /api/users/[id]` — all under `tests/enumerate-fixture/nextjs/` (a fixture)
- effectSites (6): `docker control`, `git push`, `http write`, `http write (js)`,
  `message/mail send`, `shell exec`

### Census candidates handed on (§6f)

- `populations.secrets` (21) → delegation pass, census `credential`
- `populations.changeGates` (24) → gates pass, census `change-gates`
- `populations.modelCalls` (0) → context pass, census `model-call-telemetry` (`triage: []`)

## Other populations to close

- **ingestion points** (delegation, `ingested-content`): scanner output read by `map/ingest.mjs`;
  the target tree read by `map/enumerate.mjs`, `map/repo-census.mjs`, `map/structure-scan.mjs`;
  owner answers (`owner/ask-owner.mjs`, `yardstick/packet.mjs`); a lane's inputs read by a review
  session; tool release metadata read by `map/tools.mjs`.
- **interface contracts**: `lib/yaml-min.mjs`, `map/validate.mjs`, `yardstick/packet.mjs`,
  `map/effect-triage.mjs`, `map/census.mjs`.
- **delivery / effect-vs-report paths**: `routine/run.mjs` (writes `routine.yaml`),
  `map/record.mjs` (run record), `map/start.mjs` instrument outcomes.

## Slice plan

- **Pass 1 legibility**: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`,
  `yardstick/README.md`, `views/README.md`, `routine/README.md`, `map/canon/README.md`,
  `lib/yaml-min.mjs` header, `map/doctrine.mjs`, `assay.mjs`.
- **Pass 2 context**: `CLAUDE.md`, `README.md`, `assay.mjs`, `map/lane.mjs`,
  `map/scanners/adapters/practice-review/lane.md`, `map/scanners/CONTRACT.md` (head),
  `map/repo-census.mjs`, `map/ingest.mjs` (head), `views/compile.mjs`, `yardstick/measure.mjs` (head).
- **Pass 3 gates**: `.github/workflows/*.yml`, `.github/actions/tools/action.yml`, `package.json`,
  `lib/check-syntax.mjs`, `tests/regression.mjs`, `tests/harness.mjs`, `tests/README.md`,
  `map/validate.mjs`, `lib/yaml-min.mjs`, a sample of `tests/blocks/` and `tests/negative/`.
- **Pass 4 verification**: `tests/harness.mjs`, `tests/golden.json`, `map/score.mjs`, `map/variance.mjs`,
  `routine/run.mjs`, `map/record.mjs`, `map/start.mjs`, `tests/fixtures/` (outside `*/map/`),
  `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md` "Red, then green".
- **Pass 5 delegation**: `map/fresh-clone.mjs`, `map/dependency-scan.mjs`, `map/structure-scan.mjs`,
  `map/tools.mjs`, `map/start.mjs`, `map/child-env.mjs`, `map/migrate-run.mjs`, `map/ingest.mjs`,
  `routine/assay-routine.yml`, `.github/workflows/{release,branch-cleanup,tools-check}.yml`,
  `map/lane.mjs`, the lanes, `owner/ask-owner.mjs`, `SECURITY.md`.
- **Pass 6 improvement**: `CLAUDE.md` ("How a change lands"), `map/backlog.mjs`, `map/roster.mjs`,
  `views/since.mjs`, `yardstick/ratchet.mjs`, `tests/blocks/` (lesson-named blocks), `map/scanners/CANDIDATES.md`.
- **Pass 7 multiplayer**: `CONSUMERS.md`, `owner/`, `map/lane.mjs`, `views/owner.mjs`, `routine/README.md`,
  `yardstick/packet.mjs`, `map/scanners/CONTRACT.md`.

**Not read:** `tests/sweeps/` and `tests/fixtures/*/map/` (terrain only), any `ANSWERS.yaml`,
and git history beyond the head commit's date.
