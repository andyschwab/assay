---
type: doc
title: Terrain — assay at 2b247c0
---
# Terrain — assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Pass 0, derived blind: no prior run of this target was read, and no canon exists for it
(`map/canon/` holds only its `README.md`). Breadth only, from `git ls-files`, the manifests,
the CI configs and the entry docs. The listing excluded `tests/sweeps/`, `tests/fixtures/*/map/`
and every `ANSWERS.yaml`; those paths are terrain only and were never opened.

## Map

- **What it is.** assay, a Node.js (ESM `.mjs`, Node >= 22) command-line engine that evaluates a
  repository: it draws a map (findings) of a target, measures it against a yardstick of
  requirements, and writes views. One CLI dispatcher, `assay.mjs`, maps ~35 subcommands onto
  scripts (`assay.mjs:18-58`). No runtime npm dependencies; dev dependencies are `typescript` and
  `@types/node` only (`package.json:18`). Its own YAML reader is `lib/yaml-min.mjs`.
- **Size.** 714 files per the enumeration (`files`); 549 tracked files outside the blind paths.
  By extension: 228 `.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, 11 `.js`, 7 `.ts`,
  5 `.sql`. Non-test source and docs ~25k lines; `tests/` holds 425 of the 549 files.
- **Languages.** JavaScript (ESM, JSDoc-typed, checked by `tsc -p tsconfig.json`) overwhelmingly;
  YAML for contracts, adapters, the yardstick; Markdown for the method and contracts. Python, TS,
  SQL appear only as fixtures or scanner rule text.
- **Build / test / lint entry points** (`package.json:8-15`): `npm test` → `node tests/regression.mjs`
  (block runner over `tests/blocks/*.mjs`, 161 files); `npm run lint` and `npm run build` →
  `node lib/check-syntax.mjs` (a `node --check` over every tracked JS file); `npm run typecheck`
  → `tsc`; `npm run validate` → `assay validate`.
- **CI** (`.github/`): `workflows/ci.yml` (push to main + PRs, Node 22/24 matrix, lint, typecheck,
  build, the tools composite action, `npm test`); `workflows/release.yml` (tag + GitHub release,
  contents: write); `workflows/branch-cleanup.yml` (reusable; deletes merged branches, dry-run by
  default); `workflows/tools-check.yml` (opens/updates an issue for tool pins behind upstream);
  `actions/tools/action.yml` (composite: install + verify pinned tools); `PULL_REQUEST_TEMPLATE.md`.
  A consumer template workflow lives at `routine/assay-routine.yml`.
- **Directory topology (load-bearing).**
  - `assay.mjs` — the CLI dispatcher.
  - `lib/` (6) — shared: `yaml-min.mjs` (strict YAML subset reader), `run-data.mjs`, `run-layout.mjs`,
    `display.mjs`, `check-syntax.mjs`, `release-notes.mjs`.
  - `map/` (56) — the map layer: `METHOD.md` (practice-review method), `SCHEMA.md` (finding format),
    `validate.mjs`, `ingest.mjs` (1282 lines), `enumerate.mjs`, `start.mjs`, `lane.mjs`, `record.mjs`,
    `project.mjs`, `score.mjs`, `variance.mjs`, `backlog.mjs`, `migrate-run.mjs`, `effect-triage.mjs`,
    `census.mjs`, `decisions.mjs`, `doctrine.mjs`, `chains.mjs`, `capabilities.mjs`, `supervision.mjs`,
    instrument drivers (`fresh-clone.mjs`, `repo-census.mjs` 1300 lines, `structure-scan.mjs`,
    `dependency-scan.mjs`, `tools.mjs`, `toolchain.mjs`, `child-env.mjs`), `canon/`, `templates/`.
  - `map/scanners/` (24) — `CONTRACT.md` (adapter contract, 1061 lines), `INTAKE.md`, `CANDIDATES.md`,
    `adapters/*.yaml` (12 adapters) plus opengrep rule packs and lane docs.
  - `yardstick/` (7) — `requirements.yaml` (the rows), `README.md` (contract), `measure.mjs`,
    `compare.mjs`, `ratchet.mjs`, `packet.mjs`, `list.mjs`.
  - `views/` (22) — `README.md`, `compile.mjs`, `intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`,
    `severity.mjs`, `floor-fleet.mjs`, `hotspot.mjs`; `views/improve/` (13): `report.mjs`, `handoff.mjs`,
    `axes.mjs`, `maturity.mjs`, `sequence.mjs`, `topics.mjs`, `glossary.mjs`, templates.
  - `owner/` (10) — `PACKET.md`, `ask-owner.md`, `ask-owner.mjs`, `evidence/` (owner-claim templates).
  - `routine/` (3) — `README.md`, `assay-routine.yml` (consumer CI template), `run.mjs`.
  - `tests/` — `regression.mjs`, `harness.mjs`, `golden.json`, `README.md`; `blocks/` (161),
    `negative/` (136 files of malformed runs), `instruments/` (99), `enumerate-fixture/` (14),
    `fixtures/` (known-answer targets; their `map/` dirs and `ANSWERS.yaml` are blind), `sidecar-fixture/`.
- **Docs surface.** `README.md` (front door, 250 lines: architecture, quickstart, layout),
  `CLAUDE.md` (agent contract), `CONTRIBUTING.md`, `CONSUMERS.md` (consumer contract + trailer rule),
  `RUNBOOK.md`, `SECURITY.md`, `map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`,
  `yardstick/README.md`, `views/README.md`, `routine/README.md`, `owner/PACKET.md`, `tests/README.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (opened as an agent session's context);
  `map/scanners/adapters/practice-review/lane.md`, `map/scanners/adapters/deep-code-review/lane.md`
  (lane seeds); `map/lane.mjs` (renders lanes); `owner/ask-owner.md` (owner prompt). No `.cursorrules`,
  no in-code tool-definition table, no MCP config.

## AI surfaces

The enumeration's `populations.modelCalls` is empty, and no provider SDK import or model API
host appears in the non-test tree: the code calls no model. The AI work happens in sessions a
consumer starts, seeded by the lane docs (`map/lane.mjs`, `map/scanners/adapters/*/lane.md`) and
recorded afterwards (`map/record.mjs`, `--pass`/`--spend`). There is therefore no capability
finding to write unless a pass finds a call site the listing missed.

## Effect inventory draft (candidate list for the delegation pass)

The candidate list is `map/raw/enumerate.json`'s `channelCandidates` (1), `routeHandlers` (6) and
`effectSites` (6), 13 candidates, each to be triaged once in `map/effect-triage.yaml`:

| candidate (verbatim) | first read |
|---|---|
| `surface: migrate-run.mjs` | rewrites and renames a stored run's files in place under `--write` (`map/migrate-run.mjs:24`) |
| `route: ANY /api/hooks`, `route: DELETE /api/users/[id]`, `route: GET /api/users/[id]`, `route: GET /health`, `route: HEAD /health`, `route: PATCH /api/users/[id]` | all under `tests/enumerate-fixture/nextjs/`: a fixture the enumerator's own test reads, not a served route |
| `docker control`, `git push`, `message/mail send` | detection regexes in `map/enumerate.mjs:180-182`, not calls |
| `http write`, `http write (js)`, `shell exec` | opengrep taint-rule text and a planted control fixture under `map/scanners/adapters/opengrep/`; `http write (js)` also names `map/tools.mjs:125`, the tool download |

Effects the listing does not name, still findings (fixed channel slugs; authoring draws from these):

| slug | surface | first read |
|---|---|---|
| `migrate-run` | `assay migrate-run --write` | in-place rewrite/rename of a run's files |
| `tool-install` | `assay tools install`, `.github/actions/tools` | downloads pinned binaries, sha256-checked, onto PATH (`map/tools.mjs:125`) |
| `fresh-clone-exec` | `assay fresh-clone`, `start --allow-exec` | runs the target's install/build/test via a shell (`map/fresh-clone.mjs:310`) |
| `dependency-audit` | `assay dependency-scan` | runs the target's package manager audit, which sends lockfile data to a registry (`map/dependency-scan.mjs:275`, `:398`) |
| `structure-scan-install` | `assay structure-scan` | `npm install` of jscpd/knip into scratch, then runs knip over the target (`map/structure-scan.mjs:103`, `:189`) |
| `run-write` | `assay start`, `ingest`, `record`, `compile` | writes the run directory |
| `release-publish` | `.github/workflows/release.yml` | creates a tag and a GitHub release (`release.yml:46-50`) |
| `branch-delete` | `.github/workflows/branch-cleanup.yml` | deletes merged branches when `dry_run` is off (`branch-cleanup.yml:131`) |
| `issue-upsert` | `.github/workflows/tools-check.yml` | creates or comments on an issue (`tools-check.yml:32-35`) |
| `routine-artifact-upload` | `routine/assay-routine.yml` | uploads the run as a workflow artifact; workflow token is read-only (`assay-routine.yml:33`) |

Container / agent classes: the enumeration names `docker run/create site` and `admin-role branch`;
both point at `map/enumerate.mjs` detection patterns (and blind fixture paths), not at a launch the
engine makes. Execution classes the engine does have: the local CLI user; CI job `ci.yml/test`
(read token); `release.yml/release` (contents: write); `branch-cleanup.yml/delete` (contents:
write); `tools-check.yml/check` (issues: write); the consumer's routine (read token,
`assay-routine.yml:33`). Assess each separately.

## Census candidates handed to passes

- **change-gates → gates pass**: `populations.changeGates`, 24 candidates (20 CI steps across
  `ci.yml`, `release.yml`, `branch-cleanup.yml`, `tools-check.yml`; 4 package scripts: `lint`, `test`,
  `typecheck`, `validate`). Each triaged once in `map/census-triage.yaml`.
- **credential → delegation pass**: `populations.secrets`, 21 candidates (`ADMIN_PASSWORD`, `API_KEY`,
  `ASSAY_PLANTED_TOKEN`, `ASSAY_READ_TOKEN`, `ASSAY_TEST_EVALUATOR_TOKEN`, `BACKUP_API_KEY`,
  `DECISION_KEYS`, `EMAIL_SEND_API_KEY`, `FETCH_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, `LEGACY_API_KEY`,
  `POINTER_COMMAND_KEYS`, `POINTER_KEYS`, `POINTER_PATH_KEYS`, `POINTER_PATH_OR_LIST_KEYS`,
  `SEARCH_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TOP_KEYS`, `TRIAGE_KEYS`).
  `secretConstants` (4) is no candidate.
- **model-call-telemetry → context pass**: `populations.modelCalls`, empty: triaged `triage: []`.

## Frozen populations for the observational censuses

- **Non-obvious decisions (legibility, `decision-reconstruction`, subject_type artifact)**, frozen:
  D1 no runtime dependencies and an in-house strict YAML subset reader (`lib/yaml-min.mjs`);
  D2 a base finding never carries a severity or priority; D3 finding ids carry no dimension;
  D4 fresh-clone executes target code only under `--allow-exec`; D5 external tools are pinned and
  sha256-verified before execution; D6 the core names no external scanner (adapters only);
  D7 no history file — the change record is git; D8 a moved pinned score is a reviewed re-bless of
  `tests/golden.json`; D9 a contract change carries a `Consumer:` trailer; D10 CI actions pinned to
  commit SHAs; D11 an undecided requirement reads not measured, never met; D12 plain `.mjs` with JSDoc
  types checked by `tsc`, no build step.
- **Doc claims (legibility, `doc-freshness`, subject_type artifact)**: every command and path in
  `README.md` "Quickstart" and "Layout", and every command in `CLAUDE.md` "Checks".
- **Modules (context, `modules-standalone`, subject_type artifact)**, frozen: `assay.mjs`; `lib/`;
  `map/validate.mjs`; `map/ingest.mjs`; `map/enumerate.mjs`; `map/start.mjs`; `map/fresh-clone.mjs`;
  `map/repo-census.mjs`; `map/structure-scan.mjs`; `map/dependency-scan.mjs`; `map/tools.mjs`;
  `map/scanners/` (adapters); `yardstick/`; `views/` (incl. `views/improve/`); `owner/`; `routine/`.
- **Lessons (improvement, `incidents-became-mechanisms`, subject_type process)**: every lesson a file
  records with its cause (contract-doc paragraphs naming a calibration measurement or past failure,
  code comments citing an issue for a fix), sampled from `CLAUDE.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `yardstick/README.md`, `tests/blocks/` headers; the pass freezes its list in its method line.
- **Interfaces (multiplayer, `agent-access-surface`)**: the ~35 CLI subcommands (`assay.mjs:18-58`)
  grouped by family, the run-directory file formats, `yardstick.yaml`, the owner packet, the
  composite action, the reusable branch-cleanup workflow, the routine template.
- **Ingestion points (delegation, `ingested-content`, subject_type control)**: scanner reports read
  by `map/ingest.mjs`; the target tree read by `enumerate`/`repo-census`/`structure-scan`; the target's
  code executed by `fresh-clone`; lane inputs and collected review outputs; tool downloads.

## Slice plan (5–15 files per dimension)

- **Legibility**: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CONSUMERS.md`, `map/SCHEMA.md`
  (§3, §8), `lib/yaml-min.mjs` head, `map/fresh-clone.mjs` head, `map/tools.mjs` head,
  `tests/blocks/core-names-no-scanner.mjs`, `tests/blocks/no-history-file.mjs`, `.github/workflows/ci.yml`.
- **Context**: `assay.mjs`, the head comment of each module in the frozen list, `views/README.md`,
  `yardstick/README.md` opening, `map/scanners/CONTRACT.md` opening.
- **Gates**: `.github/workflows/*.yml`, `.github/actions/tools/action.yml`, `package.json`,
  `lib/check-syntax.mjs`, `tests/regression.mjs`, `tests/harness.mjs`, `tests/blocks/ci-workflow.mjs`,
  `tests/blocks/consumer-contract.mjs`, `lib/release-notes.mjs`, `map/validate.mjs`, `tests/negative/`.
- **Verification**: `tests/README.md`, `tests/golden.json`, `map/score.mjs`, `map/variance.mjs`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `routine/run.mjs`, `map/tools.mjs` verify, `map/start.mjs`.
- **Delegation**: `map/migrate-run.mjs`, `map/tools.mjs`, `map/fresh-clone.mjs`, `map/child-env.mjs`,
  `map/dependency-scan.mjs`, `map/structure-scan.mjs`, `map/start.mjs`, `map/ingest.mjs`, `map/lane.mjs`,
  the four workflows, `routine/assay-routine.yml`, `SECURITY.md`, `.gitleaksignore`.
- **Improvement**: `CLAUDE.md` "How a change lands", `map/backlog.mjs`, `map/roster.mjs`,
  `tests/blocks/` headers, `map/METHOD.md` "Feedback hook", `owner/evidence/README.md`.
- **Multiplayer**: `assay.mjs`, `CONSUMERS.md`, `map/lane.mjs`, `routine/README.md`, `owner/PACKET.md`,
  `views/README.md`, `.github/workflows/branch-cleanup.yml` header.

Not read: the 12 adapter YAMLs beyond what a pass needs, the opengrep rule packs (scanner rule text),
the bulk of `tests/negative/` and `tests/instruments/` (fixtures), and every blind path above.
