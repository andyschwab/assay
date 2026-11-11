---
type: doc
title: "assay — Pass 0 terrain (practice-review, head 2b247c0)"
---
# Terrain — andyschwab/assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Derived blind: no prior run read, no canon exists (`canon/` is absent at the root; `map/canon/README.md` describes the
convention only, and no `canon/<target>.yaml` for this target was found). The population below is derived from a
listing (`git ls-files`, excluding `tests/sweeps/`, `tests/fixtures/*/map/` and every `ANSWERS.yaml`) and from the
run's `map/raw/enumerate.json`. This terrain is a proposed canon, not a ratified one.

## The map

- **What it is.** assay: an evidence-based repository evaluator. A run draws a *map* (findings with `file:line`
  evidence, `map/`), measures it against a *yardstick* of requirements (`yardstick/`), and writes *views* (Intake,
  Maintain, Improve, Owner, Since; `views/`). One dispatcher CLI, `assay.mjs`, spawns one engine script per command
  (`assay.mjs:18-56`, `assay.mjs:83`).
- **Languages and size.** 549 tracked files in the listing above (the enumeration counted 714 with the excluded sets).
  JavaScript ES modules for Node >= 22 (228 `.mjs`, roughly 15k lines outside `tests/`), typed with JSDoc and checked by
  `tsc`; 144 YAML, 86 Markdown, 37 JSON. Zero runtime dependencies; devDependencies are `typescript` and `@types/node`
  only (`package.json:19`).
- **Build / test / lint.** `npm test` = `node tests/regression.mjs` (161 blocks under `tests/blocks/`, the negative runs
  under `tests/negative/` (136 tracked files), instrument inputs under `tests/instruments/`, pinned scores `tests/golden.json`);
  `npm run lint` and `build` = `lib/check-syntax.mjs`; `npm run typecheck` = `tsc -p tsconfig.json`.
- **CI.** `.github/workflows/ci.yml` (push to main + every PR; lint, typecheck, build, pinned tools, `npm test`, Node 22
  and 24), `release.yml` (person-dispatched tag + GitHub release), `tools-check.yml` (weekly cron, opens/comments an
  issue), `branch-cleanup.yml` (deletes merged branches on push to the default branch). Composite action
  `.github/actions/tools/action.yml`. A stewarded-repo workflow template lives in `routine/assay-routine.yml`.
- **Load-bearing directories.**
  `map/` (the map: start, ingest, record, validate, enumerate, effect-triage, census, chains, doctrine, the instruments
  fresh-clone / dependency-scan / structure-scan / repo-census / tools), `map/scanners/` (CONTRACT, INTAKE, CANDIDATES,
  `adapters/*.yaml`, the two lane seeds, the vendored opengrep taint rules and their positive control), `yardstick/`
  (requirements.yaml, measure, ratchet, compare, packet), `views/` and `views/improve/` (compile, intake, maintain,
  owner, since, report, handoff, axes, maturity, templates), `lib/` (yaml-min, run-data, run-layout, display,
  release-notes, check-syntax), `owner/` (PACKET.md, ask-owner, evidence templates), `routine/` (README, run.mjs, the
  workflow template), `tests/` (harness, blocks, negative, instruments, fixtures, enumerate-fixture, sidecar-fixture).
- **Docs surface.** Root: README.md (250 lines, front door), CLAUDE.md (agent contract, 73), RUNBOOK.md, CONTRIBUTING.md,
  CONSUMERS.md, SECURITY.md. Contracts: `map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md` (1061 lines),
  `yardstick/README.md`, `views/README.md`, `routine/README.md`, `tests/README.md`, `owner/PACKET.md`.
- **Agent-facing files.** `CLAUDE.md`; the two review-lane seeds `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md`, filled by `map/lane.mjs`; `.github/PULL_REQUEST_TEMPLATE.md`.
  No `.cursorrules`, no `.claude/` directory, no in-code LLM call site (a grep for model SDK calls over the non-test
  code finds none).

## Effect inventory (channel slugs fixed here; passes draw slugs from this list only)

One channel per invocation boundary (SCHEMA §2). Reversible internal writes into a run directory are grouped by
resource (the run's map records vs. its compiled views).

| slug | invocation | what it does | anchor |
|---|---|---|---|
| `run-draw` | `assay start` | creates a run dir, copies the target to scratch, runs every offline instrument binary, writes raw + findings + `scanners.yaml` | `map/start.mjs:206-217`, `map/start.mjs:270` |
| `fresh-clone-exec` | `assay fresh-clone` (and `start --allow-exec`) | clones the target and EXECUTES its install, lifecycle scripts, build, lint, typecheck, test, migrate with `shell: true` | `map/fresh-clone.mjs:310` |
| `dependency-audit` | `assay dependency-scan` | runs the target's package manager `audit` over scratch copies of each lockfile (registry egress) | `map/dependency-scan.mjs:398` |
| `structure-scan-exec` | `assay structure-scan` | `npm install`s jscpd and knip into scratch, runs them; knip loads the target's tool configs | `map/structure-scan.mjs:103`, `map/structure-scan.mjs:120` |
| `tools-install` | `assay tools install` / `.github/actions/tools` | downloads pinned scanner binaries, checks sha256, installs them into a bin dir | `map/tools.mjs:125-130` |
| `run-map-write` | `assay ingest`, `record`, `backlog --write`, `maturity --write` | writes findings / run record / backlog / grades into a run | `map/ingest.mjs`, `map/record.mjs` |
| `run-views-write` | `assay compile` (+ intake, maintain, owner, since, measure) | writes `yardstick.yaml`, views, IMPROVE.md, handoff into a run | `views/compile.mjs:56` |
| `migrate-run-write` | `assay migrate-run --write` | renames and rewrites stored run files in place | `map/migrate-run.mjs:103` |
| `routine-run` | `assay routine` (`routine/run.mjs`) | verifies tools, draws, records, validates, compiles, ratchets; writes run + routine.yaml; `--target-steps` writes a handoff | `routine/run.mjs` |
| `routine-workflow` | `routine/assay-routine.yml` copied into a stewarded repo | two jobs: `target` executes the repo's code, uploads a handoff artifact; `routine` gates | `routine/assay-routine.yml:48-86` |
| `branch-cleanup-delete` | `.github/workflows/branch-cleanup.yml` | deletes merged branch refs via the REST API; on push with no person dispatch | `.github/workflows/branch-cleanup.yml:131` |
| `release-publish` | `.github/workflows/release.yml` | tags `vX.Y.Z` and publishes a public GitHub release | `.github/workflows/release.yml:50` |
| `tools-check-issue` | `.github/workflows/tools-check.yml` | weekly: opens an issue or comments on it | `.github/workflows/tools-check.yml:33-35` |

Read-only surfaces (no effect finding): `validate`, `enumerate`, `project`, `toolchain`, `score`, `variance`, `roster`,
`yardstick`, `compare`, `ratchet`, `validate-packet`, `ask-owner` (prints), `lane` (prints a seed), `ci.yml` (contents:
read; runs the gate).

## AI surfaces (capabilities)

No LLM call site exists in the code. The AI surfaces are the two review-lane seeds a consumer's session runs on:

- `practice-review-lane` — `map/scanners/adapters/practice-review/lane.md` (reads an untrusted target, holds its
  confidential contents, publishes an artifact).
- `deep-code-review-lane` — `map/scanners/adapters/deep-code-review/lane.md`.

## Censuses (closed populations; one finding per member, canonical subject_type)

| census name | dimension (pass) | subject_type | members |
|---|---|---|---|
| `decision-reconstruction` | artifact-legibility | artifact | D1 ids carry no dimension (`map/SCHEMA.md` §3) · D2 routine runs as two jobs (`routine/assay-routine.yml:40`) · D3 zero-dependency minimal YAML reader (`lib/yaml-min.mjs`) · D4 fresh-clone only under `--allow-exec` (`map/start.mjs`) · D5 branch-cleanup deletes on push without dispatch (`.github/workflows/branch-cleanup.yml:1`) · D6 tool downloads sha256-pinned before execution (`map/tools.mjs`) · D7 the base asserts no severity / no deploy verdict (`README.md`) · D8 a new harness block is a new file only (`tests/README.md`) · D9 canon is a declared contract, never a copied prior run (`map/SCHEMA.md` §8) · D10 the routine reads its baseline from the base branch, not the PR (`routine/assay-routine.yml:97`) |
| `modules-standalone` | context-economy | artifact | `map/` · `map/scanners/` · `views/` · `views/improve/` · `yardstick/` · `lib/` · `owner/` · `routine/` · `tests/` |
| `doc-freshness` | context-economy | artifact | README.md · CLAUDE.md · RUNBOOK.md · CONTRIBUTING.md · CONSUMERS.md · SECURITY.md · routine/README.md · views/README.md · yardstick/README.md · tests/README.md |
| `gates-coverage` | deterministic-gates | contract | every job in `.github/workflows/`: ci/test · release/release · tools-check/check · branch-cleanup/plan · branch-cleanup/delete |
| `effect-provability` | verification | control | every effect channel above (13) |
| `credential` | delegation | control | the runtime credentials the enumeration lists that a workflow or routine actually holds: `GH_TOKEN` · `GITHUB_TOKEN` · `FETCH_TOKEN` · `ASSAY_READ_TOKEN`. Excluded: planted test strings and fixture names (`ADMIN_PASSWORD`, `API_KEY`, `ASSAY_PLANTED_TOKEN`, `ASSAY_TEST_EVALUATOR_TOKEN`, `BACKUP_API_KEY`, `EMAIL_SEND_API_KEY`, `LEGACY_API_KEY`, `SEARCH_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and code constants named `*_KEYS` (`DECISION_KEYS`, `POINTER_*_KEYS`, `TOP_KEYS`, `TRIAGE_KEYS`) |
| `incidents-became-mechanisms` | improvement-loop | process | the ten rules `CLAUDE.md` states: ground rules 1-7 and the three "How a change lands" bullets |
| `agent-access-surface` | multiplayer | artifact | the views a run writes: Intake · Maintain · Improve · Owner · Since · the handoff |

## Effect-channel triage (candidates from `map/raw/enumerate.json`)

13 candidates: 1 channel candidate, 6 route handlers, 6 effect-site kinds. The route handlers all sit in
`tests/enumerate-fixture/nextjs/`, an inert fixture the enumeration tests read. The effect-site kinds `docker control`,
`git push`, `message/mail send`, `http write` and `shell exec` cite the enumeration's own regex table, the vendored
taint rules and the opengrep positive control (inert, "nothing imports or runs them",
`map/scanners/adapters/opengrep/control/CONTROL.md`), not call sites. `http write (js)` includes `map/tools.mjs:125`,
the tools download, and maps to `tools-install`. `surface: migrate-run.mjs` maps to `migrate-run-write`. The
enumeration does not detect Node `spawnSync` call sites, so the execution channels above (`fresh-clone-exec`,
`dependency-audit`, `structure-scan-exec`, `run-draw`) are recorded from the listing although no candidate names them.

## Slice plan

- **Pass 1 legibility:** README.md, map/SCHEMA.md §3/§8, routine/README.md, routine/assay-routine.yml, lib/yaml-min.mjs,
  map/start.mjs, branch-cleanup.yml header, map/tools.mjs header, tests/README.md, CLAUDE.md.
- **Pass 2 context:** README.md, CLAUDE.md, the module directories' headers, the ten docs, package.json, tsconfig.json.
  Spend side: map/scanners/adapters/*/lane.md, map/lane.mjs, map/record.mjs (model/spend fields).
- **Pass 3 gates:** .github/workflows/*.yml, tests/regression.mjs, tests/harness.mjs, tests/golden.json, a sample of
  tests/blocks/ and tests/negative/, lib/check-syntax.mjs, tsconfig.json, map/validate.mjs.
- **Pass 4 verification:** map/start.mjs, map/fresh-clone.mjs, map/dependency-scan.mjs, map/structure-scan.mjs,
  map/tools.mjs, routine/run.mjs, the workflows, opengrep control, map/variance.mjs, map/score.mjs.
- **Pass 5 delegation:** every channel's file, map/child-env.mjs, the workflows' permissions, lane.md files,
  routine/assay-routine.yml, SECURITY.md.
- **Pass 6 improvement:** CLAUDE.md, CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md, the test blocks each rule names,
  lib/release-notes.mjs, CONSUMERS.md, map/backlog.mjs.
- **Pass 7 multiplayer:** views/README.md, views/*.mjs, views/improve/handoff.mjs, lib/run-data.mjs, owner/,
  CONSUMERS.md, map/lane.mjs.

Not read: `tests/sweeps/` and `tests/fixtures/*/map/` (terrain only, excluded from every listing), every `ANSWERS.yaml`,
`package-lock.json`, the vendored taint rules' bodies beyond the cited lines.
