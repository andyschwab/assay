---
type: doc
title: "Terrain — assay at 2b247c0 (practice-review, Pass 0)"
---
# Terrain — Pass 0

Target: the assay repository (public), checked out detached at
`2b247c014b1484d4e1b1512b49b32f708800d92c` (commit date 2026-11-11T14:06:15Z; no branch
head contains it; shallow fetch, 326 commits reachable). Derived **blind**: no canon exists
for this target in the tree (`map/canon/README.md` names none for it), no prior run was read,
and `tests/sweeps/`, `tests/fixtures/*/map/` and every `ANSWERS.yaml` were excluded from every
listing and never opened. They are terrain only: committed sweep sets and known-answer maps.

## Map

- **Size.** 717 tracked files; 549 outside the excluded areas. Of those, `tests/` holds 425,
  `map/` 56, `views/` 22, `owner/` 10, `yardstick/` 7, `lib/` 6, `.github/` 6, `routine/` 3,
  plus 11 root files.
- **Languages.** Node ESM JavaScript (`.mjs`, 228 files) with no runtime dependencies
  (`package.json:18`: devDependencies `typescript` and `@types/node` only, for
  `tsc -p tsconfig.json`). YAML (155 `.yaml`/`.yml`) carries the contracts, adapters,
  fixtures and the yardstick. Markdown (86) is the contract docs. A few `.ts`/`.tsx`/`.py`/`.sql`
  files are inert enumerate fixtures and scanner controls.
- **Entry points.** `assay.mjs` is a thin dispatcher (`assay.mjs:84` spawns one engine script
  per command, table at `assay.mjs:18-58`). `package.json:8-16`: `test` →
  `node tests/regression.mjs`; `lint` and `build` → `node lib/check-syntax.mjs`; `typecheck` →
  `tsc`; `validate` → `node assay.mjs validate`.
- **CI and automation** (`.github/workflows/`): `ci.yml` (push to main and every PR; node 22
  and 24; npm ci, lint, typecheck, build, the pinned-tools composite action, `npm test`);
  `release.yml` (dispatched; tags and publishes a GitHub release after the gate);
  `tools-check.yml` (weekly; opens or comments on an issue when a pinned scanner tool is
  behind upstream); `branch-cleanup.yml` (plans then deletes merged branches);
  `.github/actions/tools/action.yml` (composite: install, verify, put pinned tools on PATH).
  `routine/assay-routine.yml` is a workflow template shipped for consumers (two jobs:
  target steps + routine; uploads artifacts).
- **Load-bearing directories.**
  - `map/` — the map: `start.mjs`, `validate.mjs`, `enumerate.mjs`, `ingest.mjs`,
    `effect-triage.mjs`, `census.mjs`, `chains.mjs`, `project.mjs`, `variance.mjs`,
    `score.mjs`, `backlog.mjs`, `lane.mjs`, `record.mjs`, `tools.mjs`, `migrate-run.mjs`;
    the instruments that execute a target (`fresh-clone.mjs`, `dependency-scan.mjs`,
    `structure-scan.mjs`) and read one (`repo-census.mjs`, `toolchain.mjs`); the contracts
    `METHOD.md`, `SCHEMA.md`, `passes.yaml`.
  - `map/scanners/` — `CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md`, and `adapters/` (one YAML
    per scanner: checkov, deep-code-review, dependency-scan, fresh-clone, gitleaks, opengrep,
    osv-scanner, practice-review, repo-census, scorecard, structure-scan, zizmor; the two
    judgment lanes' `lane.md`; opengrep's taint rule pack and planted control).
  - `yardstick/` — `requirements.yaml` (the requirement rows), `measure.mjs`, `compare.mjs`,
    `ratchet.mjs`, `packet.mjs`, `list.mjs`, `README.md`.
  - `views/` — `compile.mjs`, `intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`,
    `severity.mjs`, `floor-fleet.mjs`, `hotspot.mjs`, `improve/` (report, handoff, axes,
    maturity, sequence, topics, glossary, templates), `README.md`.
  - `lib/` — `yaml-min.mjs` (the one YAML reader), `run-data.mjs`, `run-layout.mjs`,
    `display.mjs`, `release-notes.mjs`, `check-syntax.mjs`.
  - `owner/` — `PACKET.md`, `ask-owner.md`/`.mjs`, `evidence/` (owner-evidence templates).
  - `routine/` — `run.mjs`, `assay-routine.yml`, `README.md`.
  - `tests/` — `regression.mjs` + `harness.mjs` (runner), `blocks/` (161 block files),
    `negative/` (44 malformed runs), `instruments/`, `fixtures/` (public known-answer targets;
    their `map/` excluded), `enumerate-fixture/` (inert trees enumerate is tested against),
    `sidecar-fixture/`, `golden.json` (pinned scores); `sweeps/` excluded.
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`,
  `CONSUMERS.md` (consumer contract), `RUNBOOK.md`, `SECURITY.md`, `NOTICE`, `LICENSE`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/CONTRACT.md`, `yardstick/README.md`, `views/README.md`, `routine/README.md`,
  `owner/PACKET.md`, `tests/README.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (the practice-review skill, frontmatter
  `type: skill`); `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md` (review-lane seeds `assay lane` fills);
  `owner/ask-owner.md` (an owner prompt); `views/improve/handoff.mjs` (writes an agent-ready
  remediation handoff); `.github/PULL_REQUEST_TEMPLATE.md`.

## AI surfaces (from a listing)

- **Model calls:** `populations.modelCalls` is empty. A search of the code outside `tests/`
  for provider SDKs or API hosts found no call: the engine obtains no model output itself.
  The judgment scanners (practice-review, deep-code-review) run in a consumer's model session
  seeded by `map/lane.mjs`; the engine reads only their written files (`validate`, `ingest`).
- **Ingested outside content:** the target tree (read by `enumerate.mjs`, `repo-census.mjs`,
  `toolchain.mjs`, `structure-scan.mjs`), scanner output files (`ingest.mjs` turns them into
  findings), review-lane outputs (validated by `validate.mjs`), owner answers (`packet.mjs`),
  and upstream release metadata (`tools.mjs check`).

## Effect inventory draft (from `map/raw/enumerate.json`, not memory)

The candidate list is `populations.channelCandidates` (1) + `routeHandlers` (6) +
`effectSites` (18) = **25 candidates**, handed whole to the delegation pass, which triages
each in `map/effect-triage.yaml`. Fixed channel slugs, drawn by the delegation pass:

| slug | candidate(s) | what it is |
|---|---|---|
| `migrate-run-write` | `surface: migrate-run.mjs` | rewrites a run's files in place with `--write` |
| `release-publish` | `release write (workflow) @ .github/workflows/release.yml` | tags and publishes a GitHub release |
| `branch-delete` | `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | deletes merged branches on the repository |
| `pin-drift-issue` | `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | opens or comments on an issue |
| `routine-artifact-upload` | `artifact upload (workflow) @ routine/assay-routine.yml` | a consumer's workflow uploads the handoff and run |
| `tool-install` | `http write (js) @ map/tools.mjs`, `process spawn (js) @ map/tools.mjs` | downloads pinned tool binaries, writes and executes them |
| `fresh-clone-exec` | `process spawn (js) @ map/fresh-clone.mjs` | executes a target's install, build and tests |
| `dependency-scan-exec` | `process spawn (js) @ map/dependency-scan.mjs` | runs a target's package manager audit |
| `structure-scan-exec` | `process spawn (js) @ map/structure-scan.mjs` | installs jscpd/knip from the registry; knip loads the target's configs |
| `run-orchestration` | `process spawn (js) @ map/start.mjs`, `@ routine/run.mjs` | spawns the instruments over a run (decide whether its effects are its children's) |

The remaining process-spawn sites (`assay.mjs`, `lib/check-syntax.mjs`,
`lib/release-notes.mjs`, `map/backlog.mjs`, `map/repo-census.mjs`, `views/compile.mjs`,
`yardstick/ratchet.mjs`) are to be read and triaged: an internal dispatch or a read-only
`git`/`node --check` invocation is out of scope with that reason. The six route handlers are
all under `tests/enumerate-fixture/nextjs/` (inert fixture trees enumerate is tested
against); the delegation pass confirms and triages them.

## Census candidates (from `map/raw/enumerate.json`), handed to their owning pass

- `credential` ← `populations.secrets` (14) → delegation pass. Several are inert planted strings
  in tests (`CLAUDE.md:32`); the live ones are workflow tokens (`GH_TOKEN`, `GITHUB_TOKEN`)
  and the routine template's (`ASSAY_READ_TOKEN`, `FETCH_TOKEN`).
- `change-gates` ← `populations.changeGates` (24) → gates pass.
- `model-call-telemetry` ← `populations.modelCalls` (0) → context pass; triaged `triage: []`.

Other populations listed (handed for context, no triage file): `containerClasses` (2),
`socketMounts` (3), `egressControls` (2), `contracts` (3): every member's evidence sits in
`map/enumerate.mjs`'s own pattern table or in fixtures, so none is a container, mount or
egress control the engine itself runs; the delegation and gates passes confirm.

## Slice plan (what each pass reads; what it does not)

- **Pass 1 legibility:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CONSUMERS.md`,
  `map/METHOD.md` (decisions only), `yardstick/README.md`, `views/README.md`,
  `map/scanners/CONTRACT.md`, `routine/README.md`, `owner/PACKET.md`. Decisions censused from
  the contract docs' stated rationale; README claims checked against the tree.
- **Pass 2 context:** `assay.mjs`, `README.md`, `CLAUDE.md`, `tests/README.md`, `lib/yaml-min.mjs`,
  `lib/run-data.mjs`, `map/validate.mjs` (imports), `map/ingest.mjs` (size), `views/compile.mjs`;
  bounded contexts = the top-level module dirs (`map/`, `map/scanners/`, `yardstick/`,
  `views/`, `owner/`, `routine/`, `lib/`). Model-call census: empty population.
- **Pass 3 gates:** the four workflows, `.github/actions/tools/action.yml`,
  `routine/assay-routine.yml`, `package.json`, `tests/regression.mjs`, `tests/harness.mjs`,
  `lib/check-syntax.mjs`, `lib/release-notes.mjs`, `tests/golden.json`, a sample of
  `tests/negative/` and `tests/blocks/` (names + headers).
- **Pass 4 verification:** `tests/blocks/` (sample), `tests/fixtures/` (READMEs only),
  `map/score.mjs`, `map/variance.mjs`, `yardstick/ratchet.mjs`, `tests/golden.json`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `map/start.mjs` (the instrument record).
- **Pass 5 delegation:** every effect-site file above, `map/tools.mjs`, `map/child-env.mjs`,
  `map/fresh-clone.mjs`, `map/start.mjs`, `routine/run.mjs`, `routine/assay-routine.yml`, the
  four workflows, `map/migrate-run.mjs`, `map/lane.mjs`, `map/ingest.mjs`, `SECURITY.md`,
  `RUNBOOK.md`, and each secret's citing lines.
- **Pass 6 improvement:** `CLAUDE.md` (how a change lands), `map/backlog.mjs`,
  `yardstick/ratchet.mjs`, `tests/blocks/` (names: which lessons became blocks),
  `.github/workflows/tools-check.yml`, `map/roster.mjs`, `CONTRIBUTING.md`.
- **Pass 7 multiplayer:** `README.md` (roles), `CONSUMERS.md`, `owner/`, `routine/README.md`,
  `map/lane.mjs`, `assay.mjs` (`--json` surfaces), `views/README.md`, `CONTRIBUTING.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`.

**Not read:** `tests/sweeps/` and `tests/fixtures/*/map/` (excluded by rule), every
`ANSWERS.yaml`, the opengrep taint rule packs (data), `package-lock.json`, `LICENSE`.
