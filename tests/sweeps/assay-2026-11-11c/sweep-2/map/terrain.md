---
type: doc
title: "assay at 2b247c0: terrain (Pass 0)"
---
# Terrain: assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Derived blind: no prior run of this target was read, and no canon exists for it
(`map/canon/README.md` says the directory ships empty, and it holds no `<target>.yaml`).
So the populations below are derived from the listing and `map/raw/enumerate.json`, and
this terrain is the proposal a canon would be ratified from. `tests/sweeps/`,
`tests/fixtures/*/map/` and every `ANSWERS.yaml` are terrain only: they were listed and
never opened.

## What it is

assay is a zero-runtime-dependency Node (>=22) command-line engine for evaluating a
repository. It draws a map of findings (`map/`), measures it against a yardstick of
requirements (`yardstick/requirements.yaml`), and writes views (`views/`): Intake,
Maintain, Improve, Owner, plus Since. It runs no server and keeps no database. Its
only store is a run directory on disk. It runs no model. The two judgment scanners
(`practice-review`, `deep-code-review`) run in coding-agent sessions an operator
opens, seeded by `map/lane.mjs` from the lane files beside their adapters.

## Size and languages

549 tracked files outside the excluded paths (425 under `tests/`). By extension: 228
`.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, 11 `.js`, 7 `.ts`, 5 `.sql`.
About 25k lines outside `tests/`. The largest modules: `map/repo-census.mjs` (1300),
`map/ingest.mjs` (1282), `map/validate.mjs` (795), `map/fresh-clone.mjs` (695),
`views/improve/handoff.mjs` (619), `yardstick/measure.mjs` (590). The largest docs:
`map/SCHEMA.md` (1125), `map/scanners/CONTRACT.md` (1061), `yardstick/requirements.yaml`
(912), `map/METHOD.md` (813).

## Entry points: build, test, lint, CI

- `package.json`: `test` = `node tests/regression.mjs`; `lint` and `build` both =
  `node lib/check-syntax.mjs`; `typecheck` = `tsc -p tsconfig.json`. devDependencies:
  `typescript`, `@types/node` only. `package.json` declares version `0.3.0`.
- `assay.mjs`: the CLI dispatcher, about 37 commands in four groups.
- `tests/regression.mjs` + `tests/harness.mjs`: 161 blocks under `tests/blocks/`
  discovered by filename; `tests/golden.json` pins scores; 136 files of negative
  fixtures under `tests/negative/`; instrument inputs under `tests/instruments/`.
- CI, `.github/workflows/`:
  - `ci.yml`: push to main and pull_request; matrix Node 22 and 24; steps `npm ci`,
    `npm run lint`, `npm run typecheck`, `npm run build`, `./.github/actions/tools`,
    `npm test`; timeout 15m; `contents: read`.
  - `release.yml`: workflow_dispatch only, default branch only; refuses a malformed
    or existing version, `npm ci`, tools action, `npm test`,
    `node lib/release-notes.mjs --check`, then `gh release create`.
  - `tools-check.yml`: weekly cron; reads upstream releases; opens or comments one issue.
  - `branch-cleanup.yml`: push to main/master, dispatch, workflow_call; plans and
    deletes merged branches.
  - `.github/actions/tools/action.yml`: composite action, installs and verifies the
    pinned tools and appends them to PATH.
- No commit or push hook is configured (no `.husky/`, no hook config in `package.json`).
- `routine/assay-routine.yml`: a GitHub Actions template another repository copies.
  It is not a gate on this repository.

## Load-bearing directories

| dir | role |
|---|---|
| `map/` | finding format (`SCHEMA.md`), method (`METHOD.md`), validate, ingest, record, start, enumerate, chains, census, doctrine, migrate-run, lane, tools, instruments (fresh-clone, dependency-scan, structure-scan, repo-census) |
| `map/scanners/` | the scanner contract (`CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md`) and 12 adapters, plus vendored opengrep taint rules and a positive control |
| `yardstick/` | requirements, measure, compare, ratchet, packet, list |
| `views/`, `views/improve/` | compile, intake, maintain, owner, since; report, handoff, axes, maturity, sequence, templates |
| `lib/` | yaml-min (the strict reader), run-layout, run-data, display, release-notes, check-syntax |
| `owner/` | the owner packet format, ask-owner prompt, six evidence-transcript formats |
| `routine/` | the scheduled-routine template and its driver `run.mjs` |
| `tests/` | the regression harness, negative fixtures, instrument inputs, enumerate fixtures (`tests/enumerate-fixture/`), sidecar fixture |
| `.github/` | four workflows, one composite action, a pull-request template |

## Docs surface

Root: `README.md` (front door, the one rule), `CLAUDE.md` (agent contract),
`CONTRIBUTING.md`, `CONSUMERS.md`, `RUNBOOK.md`, `SECURITY.md`, `LICENSE`, `NOTICE`.
Contracts: `map/SCHEMA.md`, `map/METHOD.md`, `map/scanners/CONTRACT.md`,
`yardstick/README.md`, `views/README.md`, `routine/README.md`, `owner/PACKET.md`,
`tests/README.md`, `map/canon/README.md`. Report partials under `views/improve/templates/`.

## Agent-facing files

`CLAUDE.md`; `map/METHOD.md` (frontmatter `type: skill`, the practice-review method);
the lane seeds `map/scanners/adapters/practice-review/lane.md` and
`map/scanners/adapters/deep-code-review/lane.md`; `owner/ask-owner.md` (a prompt an
owner pastes into their own AI); `.github/PULL_REQUEST_TEMPLATE.md`. No `.cursorrules`,
no agent config, no MCP config.

## AI surfaces

No model call site exists in the code: no SDK, no API client, no LLM endpoint. The AI
surfaces are the two review lanes the engine defines and seeds, whose model call happens
in an operator's session outside the engine:

- `practice-review-lane`: `map/METHOD.md` + `map/scanners/adapters/practice-review/lane.md`,
  seeded by `map/lane.mjs`. Reads an untrusted target repository.
- `deep-code-review-lane`: `map/scanners/adapters/deep-code-review/lane.md`, seeded by
  `map/lane.mjs`. Reads an untrusted target repository.
- `ask-owner-prompt`: `owner/ask-owner.md` filled by `owner/ask-owner.mjs`. A prompt
  the owner runs in their own AI; the engine only prints it.

## Effect inventory (fixed channel slugs; the delegation pass draws from these)

Invocation boundary = one CLI command or one workflow job the operator or a schedule
starts.

| slug | what | where |
|---|---|---|
| `run-draw` | `assay start` creates a run directory and runs every offline instrument into it | `map/start.mjs` |
| `run-ingest` | `assay ingest` writes a scanner's rows, raw report and coverage into a run, flips its record row | `map/ingest.mjs` |
| `run-record` | `assay record` sets one scanner row in `map/scanners.yaml` under a lock | `map/record.mjs` |
| `run-compile` | `assay compile` (and measure/maturity/backlog `--write`) writes the views, yardstick.yaml and handoff into a run | `views/compile.mjs` |
| `run-migrate` | `assay migrate-run --write` renames files and rewrites flow lists in an existing run | `map/migrate-run.mjs` |
| `target-exec` | `fresh-clone` runs the target's own install, lifecycle scripts, build, lint, typecheck, test, migrate | `map/fresh-clone.mjs` |
| `package-audit` | `dependency-scan` runs the target's package manager audit against a registry from scratch copies | `map/dependency-scan.mjs` |
| `structure-tools-install` | `structure-scan` npm-installs jscpd and knip into scratch; knip loads the target's tool configs | `map/structure-scan.mjs` |
| `tools-install` | `assay tools install` downloads pinned binaries (sha256-checked) or pip/uv-installs PyPI tools into a bin dir | `map/tools.mjs` |
| `tools-issue` | weekly workflow opens or comments a GitHub issue on this repository | `.github/workflows/tools-check.yml` |
| `branch-delete` | branch-cleanup deletes merged branches on this repository | `.github/workflows/branch-cleanup.yml` |
| `release-publish` | release workflow creates a tag and a GitHub release | `.github/workflows/release.yml` |
| `routine-artifact-upload` | the routine template runs a stewarded repository's code (target job) and uploads the run as an Actions artifact | `routine/assay-routine.yml`, `routine/run.mjs` |

## Enumerated candidates (`map/raw/enumerate.json`) and the triage plan

- channelCandidates (1): `surface: migrate-run.mjs` → `run-migrate`.
- routeHandlers (6): all six live under `tests/enumerate-fixture/nextjs/`, a fixture the
  enumerate tests read, never served. Out of scope: test fixture, not a route of this
  application.
- effectSites (6): `docker control`, `git push`, `message/mail send` cite only
  `map/enumerate.mjs` pattern lines (and excluded sweep files): detector regexes, not
  calls. `http write` and `shell exec` cite vendored opengrep taint-rule patterns and the
  opengrep positive-control fixture (`map/scanners/adapters/opengrep/control/app/run.py`),
  which assay scans and never runs. `http write (js)` cites taint-rule patterns, one test
  block and `map/tools.mjs:125`, the binary download of `tools-install`.

## Populations closed for the censuses (frozen before assessment)

- **credential** (delegation, `control`): every secret the running engine or its own
  workflows read: `GITHUB_TOKEN` (`map/tools.mjs:202`, `tools-check.yml`), `GH_TOKEN`
  (`branch-cleanup.yml`, `release.yml`, `tools-check.yml`), `FETCH_TOKEN`
  (`routine/assay-routine.yml:110`), `ASSAY_READ_TOKEN` (`routine/assay-routine.yml:65`,
  commented, optional). Excluded: constant names a credential-suffix regex caught
  (`DECISION_KEYS`, `POINTER_*_KEYS`, `TOP_KEYS`, `TRIAGE_KEYS`), every name under
  `tests/` (planted inert strings: `ASSAY_PLANTED_TOKEN`, `ASSAY_TEST_EVALUATOR_TOKEN`,
  the enumerate fixture's), and fixture manifests.
- **change-gates** (deterministic-gates, `contract`): one member per CI step or
  config-driven check a change passes before it lands or ships: ci.yml `npm ci`,
  `npm run lint`, `npm run typecheck`, `npm run build`, `./.github/actions/tools`,
  `npm test`; release.yml version refusal, `npm ci`, tools action, `npm test`,
  `release-notes --check`. No hooks exist.
- **decision-reconstruction** (artifact-legibility, `artifact`), ten decisions:
  D1 a hand-written YAML reader (`lib/yaml-min.mjs`) instead of a YAML library;
  D2 TypeScript dev-only, checkJs over `.mjs`, no build output;
  D3 `npm run build` is the same syntax check as `npm run lint`;
  D4 finding ids carry no dimension meaning;
  D5 no history file; the change record is git;
  D6 the core names no scanner; scanners arrive as adapters;
  D7 the routine splits into a target job and a gate job;
  D8 the routine pins `ASSAY_REF` to a full SHA, never a branch;
  D9 code-executing instruments run only under `--allow-exec`, with an allow-listed child env;
  D10 `package.json` declares version 0.3.0 while releases are tagged by the release workflow.
- **modules-standalone** (context-economy, `artifact`): `lib/`, `map/` (core scripts),
  `map/scanners/` (contract + adapters), `yardstick/`, `views/`, `views/improve/`,
  `owner/`, `routine/`, `.github/`. Excluded: `tests/`, prose docs.
- **doc-freshness** (context-economy, `artifact`): concrete claims in `README.md` and
  `CLAUDE.md` of a command, a count, a path or a capability; the context pass lists the
  ones it replays, one finding each.
- **agent-access-surface** (multiplayer, `artifact`): the CLI; the finding format
  (run `map/findings/`); views data files; `handoff/` + `sequence.json`; `chains.json`;
  the yardstick (`requirements.yaml`, `yardstick --json`); the owner packet; the
  ask-owner prompt; the routine template; the reusable branch-cleanup workflow; the
  composite tools action; the lane seeds (`lane --list --json`); the adapter contract;
  the rendered pages (`INTAKE.md`, `IMPROVE.md`, ...).
- **incidents-became-mechanisms** (improvement-loop, `process`), lessons the tree records:
  L1 blind re-derivation diverged from a pinned run (`map/METHOD.md:76`);
  L2 hand-drafted effect inventory missed channels (`map/METHOD.md:100`);
  L3 a sampled false strength, docker socket (`map/METHOD.md:116`);
  L4 a package shipped with a queued scanner never run (`map/SCHEMA.md:365`);
  L5 the CI-1 lesson, unparsable input read as a pass (`map/SCHEMA.md:916`);
  L6 census subject_type flipped between runs (`map/SCHEMA.md:189`);
  L7 an empty channel list read as closed for a web app (`map/SCHEMA.md:878`, #269);
  L8 harness scratch directories (`.gitignore:12`, #216);
  L9 planted secret values hit by a history scan (`.gitleaksignore`);
  L10 a read-only outward leg counted as a write (`map/SCHEMA.md:264`, #172).
- **effect-provability** (verification, `control`): one per effect channel above.

## Slice plan

| pass | reads |
|---|---|
| 1 legibility | README.md, CLAUDE.md, map/SCHEMA.md §3, lib/yaml-min.mjs, tsconfig.json, package.json, lib/check-syntax.mjs, routine/README.md, map/child-env.mjs, RUNBOOK.md, CONSUMERS.md |
| 2 context | README.md, CLAUDE.md, assay.mjs, tests/README.md, module heads under lib/ map/ yardstick/ views/ owner/ routine/, CONTRIBUTING.md |
| 3 gates | .github/workflows/*, .github/actions/tools/action.yml, package.json, tests/regression.mjs, tests/harness.mjs, lib/check-syntax.mjs, lib/release-notes.mjs, a sample of tests/blocks/ |
| 4 verification | map/validate.mjs, tests/golden.json, map/score.mjs, map/variance.mjs, map/tools.mjs, map/start.mjs, map/record.mjs, map/ingest.mjs |
| 5 delegation | map/fresh-clone.mjs, map/child-env.mjs, map/dependency-scan.mjs, map/structure-scan.mjs, map/tools.mjs, map/migrate-run.mjs, map/lane.mjs, the four workflows, routine/ |
| 6 improvement | CLAUDE.md, CONTRIBUTING.md, the lessons above and the blocks that hold them, map/backlog.mjs |
| 7 multiplayer | CONSUMERS.md, views/README.md, map/lane.mjs, owner/, routine/README.md, map/scanners/CONTRACT.md |

Not read: `tests/sweeps/` and `tests/fixtures/*/map/` (excluded), the vendored opengrep
rules beyond the lines the enumeration cites, most of `tests/negative/` and
`tests/instruments/`.
