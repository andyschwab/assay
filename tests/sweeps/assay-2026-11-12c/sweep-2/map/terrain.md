---
type: doc
title: "Terrain — assay at 2b247c0 (practice-review, Pass 0)"
---
# Terrain — Pass 0 (breadth only)

Target: the assay repository, head `2b247c014b1484d4e1b1512b49b32f708800d92c`
(committed 2026-11-11T14:06:15Z), checked out detached; the sha is on no remote branch
head (reached by its sha), and the clone is shallow. Derived blind: no prior run read, no
canon read. `tests/sweeps/`, `tests/fixtures/*/map/` and every `ANSWERS.yaml` are
terrain only and were never opened or listed by name.

## Canon

No canon is read for this run (the method's canon lives beside the tool, `map/canon/`;
only its `README.md` is in the tree). The populations below are derived blind from the
listing (`map/raw/enumerate.json`) and the invocation-boundary rule. No canon is proposed
from this lane: a review lane writes nothing outside its run.

## Map

- **Size.** 549 tracked files outside the excluded paths; 425 under `tests/`. By
  extension: 228 `.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, a handful of
  `.ts/.js/.tsx/.sql` (all test fixtures). Roughly 13k lines of engine `.mjs` outside
  `tests/`; roughly 3.8k lines of contract prose.
- **Language/runtime.** Node ≥22, ES modules, no runtime dependencies; devDependencies
  `typescript` and `@types/node` only (`package.json`). Typechecked by JSDoc +
  `tsc -p tsconfig.json`.
- **Entry points.** `assay.mjs` (the CLI dispatcher, `bin: assay`); `package.json`
  scripts `test` (`node tests/regression.mjs`), `lint` and `build` (both
  `node lib/check-syntax.mjs`), `typecheck`, `validate`, `score`.
- **CI.** `.github/workflows/ci.yml` (push to main + every PR; matrix Node 22/24;
  lint, typecheck, build, pinned tools via `.github/actions/tools`, `npm test`);
  `release.yml` (version refusal, tests, Consumer-trailer check, `gh release create`);
  `branch-cleanup.yml` (plan + delete merged branches); `tools-check.yml` (weekly cron,
  opens/updates an issue for pins behind upstream). `routine/assay-routine.yml` is a
  workflow *template* shipped for consumers, not run here.
- **Load-bearing directories.**
  - `map/` — the engine: `enumerate.mjs`, `validate.mjs`, `ingest.mjs`, `start.mjs`,
    `lane.mjs`, `record.mjs`, `effect-triage.mjs`, `census.mjs`, `chains.mjs`,
    `variance.mjs`, `score.mjs`, `project.mjs`, `doctrine.mjs`, `decisions.mjs`,
    `child-env.mjs`, `tools.mjs`, `migrate-run.mjs`, and the in-house scanners
    `repo-census.mjs`, `dependency-scan.mjs`, `structure-scan.mjs`, `fresh-clone.mjs`.
  - `map/METHOD.md`, `map/SCHEMA.md` — the method and the finding contract.
  - `map/scanners/` — `CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md` and 12 adapters
    (`adapters/*.yaml`; two LLM lanes: `practice-review/lane.md`,
    `deep-code-review/lane.md`; opengrep's rule pack and planted control).
  - `yardstick/` — `requirements.yaml` (the rows), `README.md` (the contract),
    `measure.mjs`, `packet.mjs`, `ratchet.mjs`, `compare.mjs`, `list.mjs`.
  - `views/` — `compile.mjs`, `intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`,
    `severity.mjs`, `hotspot.mjs`, `floor-fleet.mjs`, `views/improve/*` (report,
    handoff, maturity, axes, sequence, topics, glossary + templates), `views/README.md`.
  - `owner/` — `ask-owner.mjs/.md`, `PACKET.md`, `evidence/` (claim-row evidence
    templates).
  - `lib/` — `yaml-min.mjs` (the strict YAML reader), `run-data.mjs`,
    `run-layout.mjs`, `display.mjs`, `check-syntax.mjs`, `release-notes.mjs`.
  - `routine/` — `run.mjs`, `assay-routine.yml`, `README.md`.
  - `tests/` — `regression.mjs` (the harness), `harness.mjs`, `golden.json`,
    `README.md`; `tests/blocks/` (161 harness blocks), `tests/negative/` (negative
    fixtures), `tests/instruments/` (scanner output samples), `tests/enumerate-fixture/`,
    `tests/fixtures/` (known-answer targets; their `map/` excluded), `tests/sidecar-fixture/`.
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent rules), `RUNBOOK.md`,
  `CONTRIBUTING.md`, `CONSUMERS.md`, `SECURITY.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `yardstick/README.md`, `views/README.md`, `routine/README.md`, `owner/PACKET.md`,
  `owner/ask-owner.md`, `tests/README.md`, `map/scanners/{CONTRACT,INTAKE,CANDIDATES}.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`.
- **Agent-facing files.** `CLAUDE.md`; the two lane prompts
  (`map/scanners/adapters/practice-review/lane.md`,
  `map/scanners/adapters/deep-code-review/lane.md`); `map/METHOD.md` (written as a skill
  with frontmatter). No `.cursorrules`, no `.claude/` settings, no MCP config in the tree.

## AI surfaces (from the listing)

`populations.modelCalls` is empty: the application obtains no model output in code (no
provider SDK, no API call, no local stand-in). The AI work is done by sessions an operator
starts, following the lane prompts; the engine ingests and validates what they write
(`map/lane.mjs`, `map/ingest.mjs`, `map/validate.mjs`). The AI contexts to assess are
therefore the two lane sessions (practice-review, deep-code-review), each a capability
the delegation pass records with its three booleans.

## Ingestion points (no tool lists them; drawn here)

Where outside text enters: the target repository's tree (read by `map/enumerate.mjs`,
`map/repo-census.mjs`, `map/structure-scan.mjs`, `map/dependency-scan.mjs`,
`map/fresh-clone.mjs`); scanner output files (`map/ingest.mjs`); lane-authored findings
(`map/lane.mjs`, `map/validate.mjs`); owner-supplied evidence (`owner/ask-owner.mjs`,
`owner/evidence/`); downloaded tool binaries (`map/tools.mjs`); the routine's
cross-job handoff artifact (`routine/assay-routine.yml`, `routine/run.mjs`). The
delegation pass closes this list in the `ingested-content` census.

## Effect inventory draft (candidate list: `map/raw/enumerate.json`)

The candidate list is `populations.channelCandidates` (1), `populations.routeHandlers` (6)
and `populations.effectSites` (18): 25 candidates, each triaged once by the delegation
pass in `map/effect-triage.yaml`. Fixed channel slugs (the delegation pass draws from
these; it may add a channel the listing does not name):

| candidate(s) | channel slug |
|---|---|
| `surface: migrate-run.mjs` | `run-migrate` |
| `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | `branch-delete` |
| `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | `pin-issue-write` |
| `release write (workflow) @ .github/workflows/release.yml` | `release-publish` |
| `artifact upload (workflow) @ routine/assay-routine.yml` | `routine-artifact-upload` |
| `http write (js) @ map/tools.mjs`, `process spawn (js) @ map/tools.mjs` | `tool-install` |
| `process spawn (js) @ map/fresh-clone.mjs` | `target-install-run` |
| `process spawn (js) @ map/start.mjs` | `scanner-run` |
| `process spawn (js) @ map/structure-scan.mjs` | `structure-scan-install` |
| `process spawn (js) @ map/dependency-scan.mjs`, `map/repo-census.mjs`, `assay.mjs`, `lib/check-syntax.mjs`, `lib/release-notes.mjs`, `map/backlog.mjs`, `views/compile.mjs`, `routine/run.mjs`, `yardstick/ratchet.mjs` | triage per call: read-only git/node subprocesses are out of scope with the reason; any that writes outside the run is an effect |
| the six `route: …` handlers | all under `tests/enumerate-fixture/nextjs/`: a planted enumeration fixture, not the target's surface — out of scope |

## Census candidates handed to passes

- `populations.changeGates` (24) → gates pass, census `change-gates`.
- `populations.secrets` (14) → delegation pass, census `credential`.
- `populations.modelCalls` (0) → context pass, census `model-call-telemetry`, triaged `[]`.

## Slice plan (what each pass reads; what it does not)

- **Legibility:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`,
  `CONSUMERS.md`, `map/METHOD.md` (decision passages), `map/SCHEMA.md` §1–§3,
  `yardstick/README.md`, `views/README.md`, `map/decisions.mjs`, `tests/README.md`.
- **Context:** `README.md` routing, `CLAUDE.md`, `assay.mjs`, `lib/yaml-min.mjs`,
  `lib/run-data.mjs`, `map/` module headers (`enumerate`, `validate`, `ingest`, `start`),
  `views/README.md`, `yardstick/README.md` table of contents.
- **Gates:** `.github/workflows/*.yml`, `.github/actions/tools/action.yml`,
  `package.json`, `tests/regression.mjs`, `tests/harness.mjs`, `lib/check-syntax.mjs`,
  `lib/release-notes.mjs`, `tests/README.md`, a sample of `tests/blocks/` and
  `tests/negative/`, `map/validate.mjs`, `lib/yaml-min.mjs`.
- **Verification:** `tests/golden.json`, `map/score.mjs`, `map/variance.mjs`,
  `tests/README.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `map/fresh-clone.mjs` reporting,
  `routine/run.mjs`, the lane prompts.
- **Delegation (deepest):** each effect candidate's file at its call lines, the four
  workflows, `routine/assay-routine.yml`, `map/tools.mjs`, `map/child-env.mjs`,
  `map/fresh-clone.mjs`, `map/start.mjs`, `map/migrate-run.mjs`, `map/ingest.mjs`,
  `map/lane.mjs`, the two lane prompts, `SECURITY.md`, the secrets' evidence lines.
- **Improvement:** `CLAUDE.md` "How a change lands", `CONTRIBUTING.md`,
  `tests/README.md`, `tests/blocks/` names, `map/backlog.mjs`, `yardstick/ratchet.mjs`,
  issue references in contract docs.
- **Multiplayer:** `assay.mjs` CLI surface and `--json` outputs, `CONSUMERS.md`,
  `routine/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`, `views/README.md`.

Not read: `tests/sweeps/`, `tests/fixtures/*/map/`, any `ANSWERS.yaml` (excluded by the
task); test fixture bodies beyond what a pass's question needs; git history (out of scope
except to timestamp).
