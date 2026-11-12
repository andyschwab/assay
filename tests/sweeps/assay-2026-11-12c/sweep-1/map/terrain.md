---
type: doc
title: "Terrain: assay at 2b247c0 (practice-review, Pass 0)"
---
# Terrain: assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Derived blind: no canon exists for this target (`map/canon/README.md` holds only the
canon contract, no `<target>.yaml`), no prior run was read, and `tests/sweeps/`,
`tests/fixtures/*/map/` and every `ANSWERS.yaml` were excluded from every listing.

## The map

- **What it is.** A Node (>=22) command-line engine, ES modules, no runtime dependencies
  (`package.json:17-18`: devDependencies `@types/node`, `typescript` only). One entry,
  `assay.mjs`, dispatches subcommands to scripts under `map/`, `yardstick/`, `views/`,
  `owner/`, `routine/` by spawning `node <script>` (`assay.mjs:84`). It runs no server and
  keeps no database (`README.md`, "What assay is not").
- **Size.** 549 tracked files in the listing (714 in the enumeration, which counts the
  excluded sweep and fixture maps too); ~25k lines outside `tests/`. By extension: 228
  `.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, 11 `.js`, 7 `.ts`.
- **Languages.** JavaScript (ESM, JSDoc-typed, checked by `tsc -p tsconfig.json`), YAML
  (contracts, adapters, the yardstick, fixtures), Markdown (contract docs). A little
  Python/JS under `map/scanners/adapters/opengrep/control/` is a planted scanner control,
  data, not code the engine runs.

### Build / test / lint entry points

| Script | Command | Where |
|---|---|---|
| test | `node tests/regression.mjs` | `package.json:9` |
| lint | `node lib/check-syntax.mjs` (node --check over every module) | `package.json:10` |
| typecheck | `tsc -p tsconfig.json` | `package.json:11` |
| build | `node lib/check-syntax.mjs` (same as lint) | `package.json:12` |
| validate | `node assay.mjs validate` | `package.json:14` |

### CI (`.github/workflows/`)

- `ci.yml` — push to main and every pull request; Node 22 and 24 matrix; npm ci, lint,
  typecheck, build, the tools composite action (`.github/actions/tools/action.yml`), `npm test`.
- `release.yml` — refuses a malformed/existing version, runs the suite, checks every
  contract change carries a `Consumer:` trailer, tags and publishes a GitHub release.
- `branch-cleanup.yml` — on push to the default branch, plans and deletes merged branches.
- `tools-check.yml` — weekly; opens or comments an issue when pinned scanner tools fall
  behind upstream.
- `routine/assay-routine.yml` — a workflow template a stewarded repository copies; not run
  here.

### Directory topology (the load-bearing dirs)

| Dir | What it holds |
|---|---|
| `map/` | the map layer: `METHOD.md` (built-in scanner), `SCHEMA.md` (finding format), `validate.mjs`, `enumerate.mjs`, `ingest.mjs`, `start.mjs`, `record.mjs`, `project.mjs`, `chains.mjs`, `census.mjs`, `effect-triage.mjs`, `variance.mjs`, `lane.mjs`, `tools.mjs` |
| `map/scanners/` | `CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md`, and `adapters/` (one YAML per scanner, two lanes) |
| `map/` instruments | `fresh-clone.mjs`, `dependency-scan.mjs`, `repo-census.mjs`, `structure-scan.mjs` |
| `yardstick/` | `requirements.yaml` (the rows), `README.md` (contract), `measure.mjs`, `compare.mjs`, `ratchet.mjs`, `packet.mjs`, `list.mjs` |
| `views/` | `compile.mjs`, `intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`, `improve/` (report, handoff, axes, maturity, sequence), `README.md` |
| `owner/` | `PACKET.md`, `ask-owner.md`, `ask-owner.mjs`, `evidence/` (owner transcript templates) |
| `routine/` | `README.md`, `assay-routine.yml`, `run.mjs` |
| `lib/` | `yaml-min.mjs` (the one YAML reader), `run-data.mjs`, `run-layout.mjs`, `display.mjs`, `check-syntax.mjs`, `release-notes.mjs` |
| `tests/` | `regression.mjs` + `harness.mjs`; `blocks/` (161 files, one invariant each); `negative/` (136 negative fixtures); `instruments/` (99, instrument fixtures and shims); `enumerate-fixture/` (14, planted Next.js/target trees); `fixtures/` (known-answer targets; their `map/` excluded here); `sidecar-fixture/`; `golden.json` |

### Docs surface

`README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`, `RUNBOOK.md`,
`SECURITY.md`, `CONSUMERS.md` (the consumer contract), `map/METHOD.md`, `map/SCHEMA.md`,
`map/scanners/CONTRACT.md`, `map/scanners/INTAKE.md`, `map/scanners/CANDIDATES.md`,
`yardstick/README.md`, `views/README.md`, `routine/README.md`, `owner/PACKET.md`,
`owner/ask-owner.md`, `owner/evidence/README.md`, `tests/README.md`, `tests/fixtures/README.md`,
`map/canon/README.md`, `views/improve/templates/*.md`.

### Agent-facing files and AI surfaces (from the listing)

- `CLAUDE.md` — the agent contract.
- `.github/PULL_REQUEST_TEMPLATE.md` — "How this is verified" section.
- Two **review lanes**, the seed bodies of LLM review sessions the engine hands to a
  consumer: `map/scanners/adapters/practice-review/lane.md`,
  `map/scanners/adapters/deep-code-review/lane.md`, rendered by `map/lane.mjs`.
- `map/METHOD.md` — a rubric an agent session follows (the practice-review scanner).
- **Model calls: none.** `populations.modelCalls` is empty, and a listing of non-test code
  for provider SDKs or HTTP APIs finds none: the engine itself never obtains model output.
  Every LLM step is a session a person or consumer starts with a lane (`map/lane.mjs:4-11`);
  the engine validates and ingests what the session publishes (`map/ingest.mjs`,
  `map/validate.mjs`). So the AI contexts are the lane sessions, outside this code.
- **Ingested outside text.** The engine reads an arbitrary target tree (enumerate,
  instruments), scanner outputs (`map/ingest.mjs`), a review session's published report
  (deep-code-review machine report through ingest), owner evidence transcripts
  (`owner/ask-owner.mjs`), and a prior run (`views/since.mjs`).

## Effect inventory draft (closed candidate list, `map/raw/enumerate.json`)

25 candidates: 1 channel candidate, 6 route handlers, 18 effect-site members. Slugs are
fixed here; the delegation pass triages every candidate.

| Candidate (exactly as enumerate.json writes it) | Draft slug / disposition |
|---|---|
| `surface: migrate-run.mjs` | `run-migrate` (rewrites a stored run in place) |
| `route: ANY /api/hooks` | fixture: `tests/enumerate-fixture/nextjs/` (planted target, not served) |
| `route: DELETE /api/users/[id]` | fixture (as above) |
| `route: GET /api/users/[id]` | fixture (as above) |
| `route: GET /health` | fixture (as above) |
| `route: HEAD /health` | fixture (as above) |
| `route: PATCH /api/users/[id]` | fixture (as above) |
| `artifact upload (workflow) @ routine/assay-routine.yml` | `routine-artifact-upload` |
| `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | `branch-delete` |
| `http write (js) @ map/tools.mjs` | `tools-install` (downloads pinned tool binaries) |
| `process spawn (js) @ map/tools.mjs` | `tools-install` |
| `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | `tools-check-issue` |
| `release write (workflow) @ .github/workflows/release.yml` | `release-publish` |
| `process spawn (js) @ map/fresh-clone.mjs` | `fresh-clone-exec` (runs the target's install/build/test) |
| `process spawn (js) @ map/start.mjs` | `instrument-run` (runs adapters' external scanners) |
| `process spawn (js) @ map/structure-scan.mjs` | `structure-scan-exec` (npm installs jscpd/knip, runs them) |
| `process spawn (js) @ map/dependency-scan.mjs` | `dependency-audit` (package-manager audit over lockfiles) |
| `process spawn (js) @ assay.mjs` | likely out of scope: the CLI dispatcher spawns its own scripts |
| `process spawn (js) @ lib/check-syntax.mjs` | likely out of scope: `node --check`, read-only |
| `process spawn (js) @ lib/release-notes.mjs` | likely out of scope: git reads |
| `process spawn (js) @ map/backlog.mjs` | likely out of scope: runs own tools with `--json` |
| `process spawn (js) @ map/repo-census.mjs` | likely out of scope: git reads |
| `process spawn (js) @ routine/run.mjs` | likely out of scope: spawns the assay CLI (its effects are the instruments') |
| `process spawn (js) @ views/compile.mjs` | likely out of scope: spawns own view scripts into the run dir |
| `process spawn (js) @ yardstick/ratchet.mjs` | likely out of scope: git show / rev-parse reads |

Effects the list may not name, for the delegation pass to look at: `ingest` and `record`
writes into a run directory, `ask-owner.mjs`, the lane seeds (`map/lane.mjs`, writes nothing
outward), the routine's own push/PR triggers.

## Other enumerated populations

- **Secrets** (`populations.secrets`, 14, to the delegation pass for `credential`):
  ADMIN_PASSWORD, API_KEY, ASSAY_PLANTED_TOKEN, ASSAY_READ_TOKEN, ASSAY_TEST_EVALUATOR_TOKEN,
  BACKUP_API_KEY, EMAIL_SEND_API_KEY, FETCH_TOKEN, GH_TOKEN, GITHUB_TOKEN, LEGACY_API_KEY,
  SEARCH_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Most cite only `tests/` fixtures;
  ASSAY_READ_TOKEN, FETCH_TOKEN (routine template), GH_TOKEN, GITHUB_TOKEN (workflows,
  `map/tools.mjs`) are read by code that runs. `secretConstants` (11) are no census's candidates.
- **Change gates** (`populations.changeGates`, 24, to the gates pass for `change-gates`):
  20 CI steps across `ci.yml`, `release.yml`, `branch-cleanup.yml`, `tools-check.yml`, and
  4 package scripts (`lint`, `test`, `typecheck`, `validate`). No hooks.
- **Model calls** (`populations.modelCalls`, 0, to the context pass for
  `model-call-telemetry`): empty, triaged `triage: []`.
- **Container classes / socket mounts / egress controls / contracts:** every member cites
  `map/enumerate.mjs` pattern tables, `map/METHOD.md`, or `tests/` fixtures; the engine
  launches no container. Contracts: `lockstep test` (`tests/blocks/doctrine-lockstep.mjs`)
  and the schema validator (`map/validate.mjs`).
- **Route handlers:** all six are in `tests/enumerate-fixture/nextjs/`, a planted target.

## Slice plan (what each pass reads; what it does not)

- **Pass 1 legibility:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`,
  `CONSUMERS.md`, `map/SCHEMA.md` §1–3, `yardstick/README.md`, `views/README.md`,
  `routine/README.md`, `package.json`; decisions enumerated from them (ESM no-deps, the one
  YAML reader, lanes execute nothing, fresh-clone only under `--allow-exec`, routine never
  writes, SHA-pinned ASSAY_REF, property-named axes, no history file, golden re-bless).
- **Pass 2 context:** `map/` module headers, `lib/`, `yardstick/`, `views/` (one module per
  concern), `assay.mjs` routing, `tsconfig.json`; the model-call census (empty).
- **Pass 3 gates:** `.github/workflows/*.yml`, `.github/actions/tools/action.yml`,
  `package.json`, `lib/check-syntax.mjs`, `tests/regression.mjs`, `tests/harness.mjs`,
  `tests/README.md`, a sample of `tests/blocks/` and `tests/negative/`, `map/validate.mjs`,
  `lib/yaml-min.mjs`.
- **Pass 4 verification:** `tests/golden.json`, `tests/fixtures/README.md`, `map/score.mjs`,
  `map/variance.mjs`, `.github/PULL_REQUEST_TEMPLATE.md`, the release workflow's trailer
  check, `routine/run.mjs` (routine.yaml), `map/record.mjs`.
- **Pass 5 delegation:** every effect candidate's file above, `map/child-env.mjs`,
  `map/fresh-clone.mjs`, `map/start.mjs`, `map/tools.mjs`, the four workflows,
  `routine/assay-routine.yml`, `map/ingest.mjs`, `map/lane.mjs`, `owner/ask-owner.mjs`,
  `SECURITY.md`.
- **Pass 6 improvement:** `CLAUDE.md` "How a change lands", `tests/blocks/` names (one per
  lesson), `tests/negative/`, `map/scanners/CANDIDATES.md`, `.github/workflows/tools-check.yml`,
  issue references (`#NNN`) in code headers, `yardstick/ratchet.mjs`.
- **Pass 7 multiplayer:** `assay.mjs` subcommands (the CLI surface), `CONSUMERS.md`,
  `views/README.md` data files, `.github/actions/tools/action.yml`,
  `routine/assay-routine.yml` (reusable surfaces), `map/lane.mjs`, `owner/`.

Not read: `tests/sweeps/` and `tests/fixtures/*/map/` (excluded by the blind rule), the
bodies of most of the 136 negative fixtures and 99 instrument fixtures (sampled by name),
`package-lock.json`, `LICENSE`, `NOTICE`.
