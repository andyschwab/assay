---
confidential: true
type: doc
title: "Terrain — assay at a17104d"
---
# Terrain — assay (Pass 0, derived blind)

Head `a17104d714ec76259e6d793954371885965f784a` on `main` (commit date 2026-11-15T00:56:40Z), a
shallow clone. No canon for this target exists (`map/canon/` holds only its README), so every
population below is derived blind from the tree and from `map/raw/enumerate.json` (given as an
input, schema `enumerate` version 2). `tests/sweeps/`, `tests/fixtures/*/map/` and every
`ANSWERS.yaml` are terrain only: never opened, and excluded from every listing.

## The map

- **What it is.** A Node (>=22) ES-module command-line engine, `assay.mjs` (`package.json:7`),
  with no runtime dependencies (devDependencies only: `@types/node`, `typescript`). It reads a
  target repository into a map of findings, measures it against a yardstick and compiles views.
- **Size and languages.** 818 tracked files outside the excluded paths: 381 `.mjs`, 181 `.yaml`,
  104 `.md`, 46 `.json`, 26 `.ts`, 21 `.yml`, 14 `.js`, 11 `.py`, 6 `.sql` (the `.ts`, `.py`,
  `.sql` are enumerate fixtures under `tests/`). About 21k lines of engine code under `map/`,
  `views/`, `yardstick/`, `lib/`. 667 of the files are under `tests/`.
- **Load-bearing directories.** `map/` (the scanner method, schema, enumerate, ingest, validate,
  triage, scanner adapters under `map/scanners/adapters/`); `views/` (compile, Improve, Owner,
  Since); `yardstick/` (requirements, measure, ratchet, packet); `lib/` (gate, YAML reader,
  run layout, syntax check, release notes); `owner/` (the owner's packet and evidence pages);
  `routine/` (a CI routine template consumers copy and `routine/run.mjs`); `.github/` (four
  workflows, one composite action, a PR template); `tests/` (`regression.mjs`, `prove-red.mjs`,
  `harness.mjs`, 251 blocks, 160 negative runs, instruments, enumerate fixtures, golden scores).
- **Build / test / lint entry points.** `npm test` → `node tests/regression.mjs`; `npm run gate`
  → `lib/gate.mjs` (tools verify, then test, prove-red, typecheck, lint, passes, release-notes);
  `npm run typecheck` (`tsc`), `npm run lint` and `npm run build` (`lib/check-syntax.mjs`),
  `npm run validate` (`package.json:8-16`).
- **CI.** `.github/workflows/ci.yml` (push to main, pull_request; one job running `npm run gate`),
  `release.yml` (workflow_dispatch; tag and publish), `branch-cleanup.yml` (push, dispatch, call;
  plan then delete merged branches), `tools-check.yml` (schedule, dispatch; opens or updates an
  issue for pins behind upstream); the composite action `.github/actions/tools/action.yml`
  installs the pinned scanners. `routine/assay-routine.yml` is a workflow template shipped for
  consumers, not run here.
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract), `CONTRIBUTING.md`,
  `RUNBOOK.md`, `SECURITY.md`, `CONSUMERS.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/CONTRACT.md`, `INTAKE.md`, `CANDIDATES.md`, `views/README.md`,
  `yardstick/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`, `routine/README.md`,
  `tests/README.md`, `.github/PULL_REQUEST_TEMPLATE.md`.
- **Agent-facing files.** `CLAUDE.md`; the two LLM review lanes' contracts,
  `map/scanners/adapters/practice-review/lane.md` and `map/scanners/adapters/deep-code-review/lane.md`;
  `map/METHOD.md` (a `type: skill` frontmatter); `map/passes.yaml`. No `.cursorrules`, no
  `.claude/` directory, no MCP config.

## AI surfaces

The engine itself makes no model call: `populations.modelCalls` is empty, and a search of the
engine code for provider SDK imports or endpoints finds only enumerate's own detection patterns
(`map/enumerate.mjs:749`, `map/enumerate.mjs:774`). Model output enters the system only through
the review lanes, which a session (not the code) runs and whose findings `map/validate.mjs` checks
and `map/ingest.mjs` ingests (the lane contracts above). No capability finding is expected; any
the passes find is the context pass's to record.

## Effect inventory draft (the candidate list the delegation pass triages)

Candidates: `channelCandidates` (1), `routeHandlers` (1), `effectSites` (24) — 26 in all, each
with the slug the terrain fixes for it. `populations.excluded` (270 members, test and fixture
files) is not a candidate.

| candidate (exactly as enumerate.json writes it) | slug | first look |
|---|---|---|
| `surface: migrate-run.mjs` | `migrate-run` | rewrites a stored run's files in place |
| `route: POST /login` | `login-route-pattern` | cited at `map/effect-signals.mjs:293`, a comment example inside the enumerator; a POST, so in scope by `route-method-writes` |
| `artifact upload (workflow) @ routine/assay-routine.yml` | `routine-run-upload` | the consumer routine uploads its run |
| `git push @ map/effect-scope.mjs` | `git-push-kind-table` | `map/effect-scope.mjs:125` is the `CLIENT_KINDS` table, a string, not a call |
| `github api write (workflow) @ .github/workflows/branch-cleanup.yml` | `branch-cleanup-delete` | deletes merged branches |
| `http write (js) @ map/tools.mjs` | `tools-install` | downloads the pinned scanner binaries |
| `issue/pr write (workflow) @ .github/workflows/tools-check.yml` | `tools-pin-issue` | opens/updates an issue |
| `process spawn (js) @ assay.mjs` | `assay-cli-dispatch` | the CLI spawns its subcommands |
| `process spawn (js) @ lib/check-syntax.mjs` | `check-syntax` | `node --check` over files |
| `process spawn (js) @ lib/gate.mjs` | `gate-run` | runs the gate's steps |
| `process spawn (js) @ lib/release-notes.mjs` | `release-notes` | reads git for notes |
| `process spawn (js) @ map/backlog.mjs` | `backlog-run` | |
| `process spawn (js) @ map/dependency-scan.mjs` | `dependency-scan` | runs a scanner over the target |
| `process spawn (js) @ map/fresh-clone.mjs` | `fresh-clone` | clones and runs the target's own install and tests |
| `process spawn (js) @ map/repo-census.mjs` | `repo-census` | |
| `process spawn (js) @ map/services.mjs` | `services` | starts declared services (containers) for a fresh-clone run |
| `process spawn (js) @ map/start.mjs` | `run-start` | `assay start`: clones, enumerates, runs instruments |
| `process spawn (js) @ map/structure-scan.mjs` | `structure-scan` | |
| `process spawn (js) @ map/sweep-method.mjs` | `sweep-method` | |
| `process spawn (js) @ map/target-identity.mjs` | `target-identity` | reads git identity of the target |
| `process spawn (js) @ map/tools.mjs` | `tools-install` | extracts/verifies the downloaded tools |
| `process spawn (js) @ map/validate.mjs` | `validate-git` | git reads for `--target` |
| `process spawn (js) @ routine/run.mjs` | `routine-run` | |
| `process spawn (js) @ views/compile.mjs` | `compile` | |
| `process spawn (js) @ yardstick/ratchet.mjs` | `ratchet` | |
| `release write (workflow) @ .github/workflows/release.yml` | `release-publish` | tags and publishes a release |

Effects the listing may not name, for the delegation pass to look for: writes of the run directory
by every subcommand (`lib/run-layout.mjs`), `owner/ask-owner.mjs`, `tests/regression.mjs --bless`
rewriting `tests/golden.json`.

## The census candidates (closed lists, `map/census-triage.yaml`)

- **`credential`** (delegation pass, `populations.secrets`, 30 candidates): most cite only test,
  fixture or doc lines; the ones cited from code or config are `ASSAY_READ_TOKEN`, `FETCH_TOKEN`,
  `GH_TOKEN`, `GITHUB_TOKEN` (workflows, routine), and identifier-shaped constants
  `CANDIDATE_KEY`, `ID_RECORD_KEY`, `SERVICE_KEYS`, `TOP_KEYS`. `secretConstants` (17) is no
  census's candidate.
- **`change-gates`** (gates pass, `populations.changeGates`, 21 candidates): 17 CI steps across
  `ci.yml`, `release.yml`, `branch-cleanup.yml`, `tools-check.yml`, and four package scripts
  (`lint`, `test`, `typecheck`, `validate`). Not listed by enumerate and still members if they
  are gates: the `lib/gate.mjs` steps (prove-red, passes, release-notes check) run through
  `npm run gate`.
- **`model-call-telemetry`** (context pass, `populations.modelCalls`): listed empty, so triaged
  `triage: []`.

## Other populations enumerate lists (for the passes that read them)

`socketMounts` (`--cap-add`, `--privileged`, `docker.sock mount`), `containerClasses`
(`admin-role branch`, `docker run/create site`), `egressControls` (`browser URL policy`,
`iptables egress rule`), `contracts` (`__post_init__ validation`, `lockstep test`,
`schema validator`), `reportPaths` (empty). Their evidence is mostly in `map/enumerate.mjs`
pattern tables and `tests/`; the delegation and gates passes confirm which are real.

## Slice plan (what each pass reads; the rest is not read)

- **Pass 1 legibility:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `map/METHOD.md` (headings),
  `map/SCHEMA.md` (headings), `yardstick/README.md`, `views/README.md`, `CONSUMERS.md`,
  `RUNBOOK.md`, the rationale comments at the head of `map/*.mjs` (sampled: `map/validate.mjs`,
  `map/effect-scope.mjs`, `map/ids.mjs`, `lib/yaml-min.mjs`).
- **Pass 2 context:** `CLAUDE.md`, `README.md`, `map/passes.yaml`, `map/passes.mjs`, the
  module heads of `map/`, `views/`, `yardstick/`, `lib/` (one sentence each), `assay.mjs`,
  `lib/run-layout.mjs`, the lane contracts (no model call in code; `modelCalls` empty).
- **Pass 3 gates:** `.github/workflows/*.yml`, `.github/actions/tools/action.yml`,
  `package.json`, `lib/gate.mjs`, `lib/check-syntax.mjs`, `tests/regression.mjs`,
  `tests/prove-red.mjs`, `tests/harness.mjs`, `tests/README.md`, `map/validate.mjs`,
  `lib/yaml-min.mjs`, `tsconfig.json`.
- **Pass 4 verification:** `tests/README.md`, `tests/golden.json`, `tests/prove-red.mjs`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `release.yml`, `lib/release-notes.mjs`,
  `map/variance.mjs`, `map/sweep-method.mjs`, the lane contracts, `map/fresh-clone.mjs`.
- **Pass 5 delegation:** every candidate's evidence line above, `map/tools.mjs`, `map/start.mjs`,
  `map/fresh-clone.mjs`, `map/services.mjs`, `map/child-env.mjs`, `map/migrate-run.mjs`, the four
  workflows, `routine/assay-routine.yml`, `routine/run.mjs`, `map/ingest.mjs`, `SECURITY.md`.
- **Pass 6 improvement:** `CONTRIBUTING.md`, `CLAUDE.md`, `tests/prove-red.mjs`,
  `tests/regression.mjs`, `yardstick/ratchet.mjs`, `map/backlog.mjs`, `owner/`,
  `map/scanners/CANDIDATES.md`, `.github/workflows/tools-check.yml`.
- **Pass 7 multiplayer:** `CONSUMERS.md`, `views/rows.mjs`, `views/README.md`, `owner/PACKET.md`,
  `owner/ask-owner.mjs`, `routine/README.md`, `assay.mjs` (its `--json` outputs), the lane
  contracts.

Not read: the 251 test blocks one by one, `tests/negative/`, `tests/instruments/`,
`tests/enumerate-fixture/` (terrain only; a finding cites them only where a gate reaches them).
