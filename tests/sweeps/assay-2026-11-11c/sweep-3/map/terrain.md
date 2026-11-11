---
type: doc
title: "assay at 2b247c0 — terrain (Pass 0)"
---
# Terrain — andyschwab/assay @ 2b247c014b1484d4e1b1512b49b32f708800d92c

Derived blind: no canon exists for this target (`map/canon/README.md` holds only the
directory's contract, no `<target>.yaml`), and no prior run was read. The channel
candidates, route handlers and effect sites come from the given `map/raw/enumerate.json`.
`tests/sweeps/`, `tests/fixtures/*/map/` and every `ANSWERS.yaml` are terrain only and
were never opened.

## The map

- **What it is.** A zero-runtime-dependency Node (>=22) command-line engine that
  evaluates other repositories: draws a map of findings (`map/`), measures it against a
  yardstick (`yardstick/requirements.yaml`) and compiles views (`views/`). One dispatcher,
  `assay.mjs`, spawns one script per command (31 commands, `assay.mjs:18-58`).
- **Size.** 549 tracked files after the exclusions; 228 `.mjs`, 144 `.yaml`, 86 `.md`.
  About 25.8k lines outside `tests/blocks`, `tests/negative`, `tests/instruments`
  (161, 136 and 99 files there). Largest engine files: `map/ingest.mjs` (1282),
  `map/repo-census.mjs` (1300), `map/SCHEMA.md` (1125), `map/scanners/CONTRACT.md` (1061).
- **Languages.** JavaScript ES modules typed by JSDoc and checked by `tsc --noEmit`
  (`tsconfig.json:3-12`). YAML for contracts and adapters. Markdown for method and
  contracts. Small TS/Python files exist only as fixtures (`tests/enumerate-fixture/`,
  `map/scanners/adapters/opengrep/control/`).
- **Build / test / lint entry points** (`package.json:7-15`): `npm test` =
  `node tests/regression.mjs` (block-discovering harness, `tests/README.md`), `npm run
  lint` and `npm run build` = `node lib/check-syntax.mjs`, `npm run typecheck` = `tsc`.
  devDependencies only: `typescript`, `@types/node`.
- **CI** (`.github/workflows/`): `ci.yml` (push to main + every PR; matrix Node 22/24;
  npm ci, lint, typecheck, build, the composite tools action, npm test), `release.yml`
  (workflow_dispatch, tags and publishes a release), `tools-check.yml` (weekly cron,
  opens/comments an issue), `branch-cleanup.yml` (push to main and dispatch/call, deletes
  merged branches). Composite action `.github/actions/tools/action.yml`. No commit or
  push hook in the tree (no `.husky`, `.githooks`, `.pre-commit-config`).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract),
  `CONTRIBUTING.md`, `SECURITY.md`, `RUNBOOK.md`, `CONSUMERS.md`, `map/METHOD.md`,
  `map/SCHEMA.md`, `map/scanners/CONTRACT.md`, `map/scanners/INTAKE.md`,
  `map/scanners/CANDIDATES.md`, `yardstick/README.md`, `views/README.md`,
  `routine/README.md`, `owner/PACKET.md`, `owner/ask-owner.md`, `owner/evidence/README.md`,
  `tests/README.md`, `tests/fixtures/README.md`.
- **Agent-facing files.** `CLAUDE.md`; the review-lane seeds
  `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md`, filled by `map/lane.mjs`; the owner
  prompt `owner/ask-owner.md` (printed by `owner/ask-owner.mjs`);
  `.github/PULL_REQUEST_TEMPLATE.md`. No `.claude/`, `.cursorrules` or MCP config.

## Load-bearing directories

| dir | concern |
|---|---|
| `assay.mjs` | the command dispatcher |
| `lib/` | shared libraries: the strict YAML reader `yaml-min.mjs`, run layout, run data, display, release notes, syntax check |
| `map/` (engine scripts) | validate, enumerate, start, ingest, record, lane, tools, the instruments (fresh-clone, dependency-scan, structure-scan, repo-census), chains, doctrine, census, score, variance, backlog |
| `map/scanners/` | the scanner contract and one adapter YAML per scanner (+ vendored opengrep taint rules and positive control) |
| `map/templates/`, `map/canon/` | run templates; the canon directory contract |
| `yardstick/` | requirements and the measure / compare / ratchet / packet tools |
| `views/` | Intake, Maintain, Owner, Since, compile, floor-fleet |
| `views/improve/` | maturity, axes, report, handoff, sequence, topics + templates |
| `routine/` | the stewarded-repository routine (`run.mjs`) and its workflow template |
| `owner/` | the owner packet contract, the ask-owner prompt, evidence transcript examples |
| `tests/` | the regression harness: `blocks/` (161), `negative/` (44 runs), `instruments/`, `fixtures/`, `enumerate-fixture/` |
| `.github/` | CI, release, tools-check, branch-cleanup, the tools composite action |

## AI surfaces (capability population)

No LLM call site exists in the tree (no model SDK or API host in code; the judgment
scanners are "LLM-driven" and never run by the engine: `map/start.mjs:307`,
`routine/run.mjs:19`). The AI surfaces are the prompts the engine hands to a session a
consumer starts: the **practice-review lane** (`map/scanners/adapters/practice-review/lane.md`)
and the **deep-code-review lane** (`map/scanners/adapters/deep-code-review/lane.md`),
filled by `map/lane.mjs`; and the **owner prompt** (`owner/ask-owner.md`). Each is one
`capability` finding in the delegation pass (the call site is the consumer's; confidence
is set accordingly). Container / agent classes: none launched; the enumerate members
`admin-role branch` and `docker run/create site` are detector patterns in `map/enumerate.mjs`.

## Effect inventory (fixed slugs; one `effect` finding each, delegation pass)

| slug | invocation boundary | evidence to start from |
|---|---|---|
| `migrate-run-write` | `assay migrate-run --write` rewrites/renames a run's files | `map/migrate-run.mjs:100-112` |
| `tools-install` | `assay tools install`: downloads pinned binaries, sha256-checks, writes to a bin dir | `map/tools.mjs:95-135` |
| `tools-check-issue` | `tools-check.yml`: weekly, opens or comments a GitHub issue | `.github/workflows/tools-check.yml:24-35` |
| `release-publish` | `release.yml`: creates tag + GitHub release | `.github/workflows/release.yml:44-50` |
| `branch-cleanup-delete` | `branch-cleanup.yml`: deletes merged branches on push | `.github/workflows/branch-cleanup.yml:106-134` |
| `fresh-clone-exec` | `assay fresh-clone`: runs the target's install/build/test scripts in a shell | `map/fresh-clone.mjs:310` |
| `dependency-scan-audit` | `assay dependency-scan`: runs the target's package manager audit | `map/dependency-scan.mjs:398` |
| `structure-scan-run` | `assay structure-scan`: npm-installs jscpd/knip, knip loads the target's configs | `map/structure-scan.mjs:103,120,189` |
| `start-instruments` | `assay start`: makes the run, runs adapter `run:` binaries over the target | `map/start.mjs:209,270,441,498` |
| `run-ingest-record` | `assay ingest` / `assay record`: write findings and the run record into a run | `map/ingest.mjs:1248-1255`, `map/record.mjs:167` |
| `views-compile` | `assay compile` (+ the per-view commands, measure, maturity --write, backlog --write): writes views, handoff (rmSync of the handoff dir) | `views/compile.mjs:232`, `views/improve/handoff.mjs:604` |
| `baseline-write` | `assay ratchet --write-baseline`: writes the accepted baseline | `yardstick/ratchet.mjs:301-302` |
| `routine-run` | `routine/run.mjs` and the `assay-routine.yml` template: draws a run, uploads it as a workflow artifact | `routine/run.mjs:182-282`, `routine/assay-routine.yml:181-188` |

## Effect triage plan (`map/effect-triage.yaml`)

- `surface: migrate-run.mjs` → the `migrate-run-write` finding.
- `route: …` (6 members): every one lives under `tests/enumerate-fixture/nextjs/`, a planted
  fixture the enumerate tests read; out of scope (no server, no route in the engine).
- `docker control`, `git push`, `message/mail send`: the evidence lines are detector regexes
  in `map/enumerate.mjs` (and terrain notes); out of scope.
- `http write`: lines in the vendored taint rule file `py.yml`; out of scope.
- `http write (js)`: includes `map/tools.mjs:125` (the download in tools install) → the
  `tools-install` finding.
- `shell exec`: the opengrep positive-control fixture `control/app/run.py` and rule text in
  `py.yml`; out of scope (the engine's own shell exec, fresh-clone, has its own finding).

## Frozen census populations (one finding per member)

- **change-gates** (`deterministic-gates`, `contract`): `ci.yml` steps `npm ci`, `npm run
  lint`, `npm run typecheck`, `npm run build`, the tools action, `npm test`, and the job's
  `timeout-minutes`; `release.yml` steps version refusal, `npm ci`, tools action, `npm
  test`, `release-notes --check`; the harness runner's own refusals
  (`tests/regression.mjs`, `tests/harness.mjs`). Excluded: `tools-check.yml` and
  `branch-cleanup.yml` (run on schedule / after merge, not on a change), the routine
  template (a gate for stewarded repositories, not for this one).
- **credential** (`delegation`, `control`): `GITHUB_TOKEN` read by `map/tools.mjs:202`;
  `GH_TOKEN` in `release.yml`, `tools-check.yml`, `branch-cleanup.yml` (one each);
  `FETCH_TOKEN` in `routine/assay-routine.yml`; `ASSAY_READ_TOKEN` (commented) in the routine
  template. Excluded: `ASSAY_TEST_EVALUATOR_TOKEN`/`ASSAY_PLANTED_TOKEN` (inert test
  values), the `*_KEYS` code constants, and every name under `tests/enumerate-fixture`,
  `tests/fixtures`, `tests/instruments`, `tests/negative`.
- **decision-reconstruction** (`artifact-legibility`, `artifact`): D1 a hand-written
  zero-dependency YAML reader instead of a library (`lib/yaml-min.mjs`); D2 ids carry no
  dimension meaning (`map/SCHEMA.md` §3); D3 the routine's two-job split
  (`routine/assay-routine.yml:40-47`); D4 `ASSAY_REF` must be a full SHA; D5 fresh-clone and
  knip only under `--allow-exec`; D6 no history file, the change record is git; D7 the core
  names no scanner (adapters); D8 actions pinned to commit SHAs; D9 branch-cleanup deletes on
  push without a dispatch; D10 JS typed by JSDoc + `tsc --noEmit` rather than TypeScript source.
- **doc-freshness** (`artifact-legibility`, `artifact`): every command and path claim in
  `CLAUDE.md` (the agent contract): the five contract docs it routes to, the three
  commands in "Checks", `tests/golden.json`, `tests/README.md`,
  `tests/blocks/core-names-no-scanner.mjs`, `tests/blocks/no-history-file.mjs`, and
  `npm test` failing closed. Replayed against the code, not run.
- **modules-standalone** (`context-economy`, `artifact`): `lib/`, `map/` engine scripts,
  `map/scanners/`, `yardstick/`, `views/` (top level), `views/improve/`, `routine/`, `owner/`.
- **incidents-became-mechanisms** (`improvement-loop`, `process`): the lessons the tree
  records with their cause: L1 sampled false strength (docker socket, `map/METHOD.md:42`);
  L2 hand-drafted inventory missed channels (`map/METHOD.md:100`, `map/enumerate.mjs:250`);
  L3 canon copy-forward made determinism tautological (`map/METHOD.md:76`); L4 census
  subject_type flipped between runs (`map/SCHEMA.md:189`); L5 the CI-1 lesson, a checker
  that passes what it cannot parse (`map/SCHEMA.md:916`); L6 a map-shaped decisions file read
  as no decisions (`map/validate.mjs:397`); L7 a crash wrote an empty backlog class and
  exited 0 (`map/backlog.mjs:49`); L8 empty `channelCandidates` read as a closed list
  (#269, `map/SCHEMA.md:878`); L9 an unquoted list item parsed as a nested map
  (`owner/evidence/README.md:77`); L10 a handoff that read "nothing to do" over live gaps
  (`views/improve/handoff.mjs:20`).
- **agent-access-surface** (`multiplayer`, `artifact`): the `assay` CLI; the view data
  files (`views/*.yaml`); `yardstick.yaml` measurement; the handoff folder
  (`handoff/sequence.json`, plan prompts); `views/improve/chains.json`; the lane seeds
  (`assay lane --list --json`); the yardstick listing (`assay yardstick --json`); the run
  format (`map/SCHEMA.md`); the owner packet (`owner/PACKET.md`); the tools composite
  action; the reusable `branch-cleanup` workflow; the routine workflow template; the human
  pages (`IMPROVE.md`, `INTAKE.md`, `OWNER.md`, …).

## Slice plan (5–15 reads per pass)

1. **legibility** — `README.md`, `CLAUDE.md`, `map/SCHEMA.md` §3, `lib/yaml-min.mjs`,
   `routine/assay-routine.yml`, `routine/README.md`, `map/start.mjs` head,
   `map/scanners/CONTRACT.md` head, `.github/workflows/*.yml` headers, `tsconfig.json`.
2. **context** — `README.md`, `CLAUDE.md`, `tests/README.md`, the per-directory heads of
   `lib/`, `map/`, `yardstick/`, `views/`, `routine/`, `owner/`; `RUNBOOK.md` (oldest-claim
   spot check); model-tier / spend records (expect none).
3. **gates** — `.github/workflows/ci.yml`, `release.yml`, `.github/actions/tools/action.yml`,
   `tests/regression.mjs`, `tests/harness.mjs`, `lib/check-syntax.mjs`, `package.json`,
   a sample of `tests/blocks/` for tool-on-PATH skips, `tests/golden.json`.
4. **verification** — `map/validate.mjs`, `map/score.mjs`, `map/variance.mjs`,
   `map/tools.mjs` (verify), `map/start.mjs` (envelope), `map/ingest.mjs` (fail-loud),
   `views/improve/handoff.mjs`, `tests/fixtures/README.md` (not its maps).
5. **delegation** — every effect in the inventory, `map/child-env.mjs`, the three lane /
   prompt files, the four workflows, `SECURITY.md`.
6. **improvement** — `CLAUDE.md` "How a change lands", the ten lessons, `tests/blocks/`
   names, `map/backlog.mjs`, `lib/release-notes.mjs`, `CONSUMERS.md`.
7. **multiplayer** — `assay.mjs`, `views/README.md`, `map/lane.mjs`, `owner/PACKET.md`,
   `yardstick/list.mjs`, `.github/actions/tools/action.yml`, `branch-cleanup.yml`,
   `routine/README.md`.

Not read: `tests/sweeps/`, `tests/fixtures/*/map/`, every `ANSWERS.yaml` (blind rule); the
bodies of `tests/negative/*` and `tests/instruments/*` beyond their names; the vendored
opengrep rule bodies.
