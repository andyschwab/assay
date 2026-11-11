---
confidential: true
type: doc
title: "assay at 4b81665: terrain (Pass 0)"
---
# Terrain: andyschwab/assay at 4b81665

Read-only lane. Nothing was executed: `node assay.mjs enumerate` was **not run** (this lane
executes nothing), so its CHANNEL CANDIDATES were reproduced by hand from a `git ls-files`
listing plus a grep of the non-test tree for the same effect patterns `map/enumerate.mjs`
scans for (`spawnSync`/`execFileSync`/`fetch`/`rmSync`/`writeFileSync`, `gh issue|release|api`,
`git push`, `bin/` CLIs, tool-definition tables, MCP toolsets). The consumer should run
`enumerate <target>` and `enumerate --run` for the mechanical list and the coverage gate.

**Canon:** none. `map/canon/` holds only `README.md` ("ships empty"), so the populations below
were derived **blind**: no prior run, sweep, fixture map or `ANSWERS.yaml` was opened. The
populations here are proposed as a first canon (`canon/assay.yaml`) for a reviewed diff.

## 1. Shape and size

- 639 tracked files. `tests/` holds 517 of them (harness blocks, negative fixtures, instrument
  fixtures, frozen runs and sweep sets). Outside `tests/`: ~24.4k lines.
- Languages: JavaScript ES modules (`*.mjs`, 220 files; zero runtime dependencies), YAML (222:
  adapters, requirements, fixtures), Markdown (90: contracts), JSON (53, mostly fixtures).
  A handful of `.ts/.tsx/.py/.sql/.js` live only inside `tests/` fixture targets and the
  opengrep control set.
- Runtime: Node >= 22 (`package.json:17`). Dev deps only: `typescript`, `@types/node`.

## 2. Entry points, build, test, CI

- CLI: `assay.mjs` (bin `assay`, `package.json:7`) is a thin dispatcher (`assay.mjs:18-58`) over
  ~30 commands grouped Map / Yardstick / Routine / Views.
- `npm test` = `node tests/regression.mjs` (the harness; blocks under `tests/blocks/`, ~170
  files, one block per file). `npm run lint` and `build` = `lib/check-syntax.mjs`
  (`node --check` over every tracked JS file). `npm run typecheck` = `tsc -p tsconfig.json`.
- CI: `.github/workflows/ci.yml` (push to main + every PR; matrix Node 22/24; lint, typecheck,
  build, pinned tools via `.github/actions/tools`, then `npm test`; `contents: read`;
  SHA-pinned actions; 15 min timeout).
- Other workflows: `tools-check.yml` (weekly cron; opens/comments an issue),
  `release.yml` (`workflow_dispatch`; tags and publishes a release), `branch-cleanup.yml`
  (on push to default + dispatch + `workflow_call`; deletes merged branches).
- Shipped template for consumers: `routine/assay-routine.yml` (two-job routine) driven by
  `routine/run.mjs`.

## 3. Load-bearing directories

| dir | what |
|---|---|
| `map/` | the map layer: `METHOD.md`, `SCHEMA.md`, `validate.mjs`, `ingest.mjs`, `start.mjs`, `record.mjs`, `enumerate.mjs`, `chains.mjs`, `doctrine.mjs`, `project.mjs`, instruments (`fresh-clone.mjs`, `dependency-scan.mjs`, `structure-scan.mjs`, `repo-census.mjs`), `tools.mjs`, `lane.mjs`, `variance.mjs`, `score.mjs`, `backlog.mjs` |
| `map/scanners/` | `CONTRACT.md` (scanner contract), `INTAKE.md`, `CANDIDATES.md`, `adapters/*.yaml` (11 adapters; scorecard `adopted: false`), lanes (`practice-review/lane.md`, `deep-code-review/lane.md`), vendored opengrep taint rules |
| `map/canon/` | per-target canon home (empty) |
| `map/templates/` | `findings.yaml`, `scanners.yaml` templates |
| `yardstick/` | `requirements.yaml` (911 lines), `measure.mjs`, `compare.mjs`, `ratchet.mjs`, `packet.mjs`, `list.mjs`, `README.md` |
| `views/` | `compile.mjs`, `intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`, `improve/` (report, handoff, axes, maturity, sequence, topics, templates), `README.md` |
| `lib/` | `yaml-min.mjs` (zero-dep YAML reader), `run-data.mjs`, `run-layout.mjs`, `display.mjs`, `release-notes.mjs`, `check-syntax.mjs` |
| `routine/` | `run.mjs`, `assay-routine.yml`, `README.md` |
| `owner/` | `PACKET.md`, `ask-owner.md`, `ask-owner.mjs`, `evidence/` (6 owner-evidence templates) |
| `tests/` | `regression.mjs`, `harness.mjs`, `golden.json`, `blocks/`, `negative/`, `instruments/`, `enumerate-fixture/`, `fixtures/` (frozen runs + known-answer targets), `sweeps/` (blind sweep sets) |
| `.github/` | 4 workflows, the `tools` composite action, PR template |

## 4. Docs surface

Root: `README.md` (front door, 248 lines), `CLAUDE.md` (agent contract, 73), `CONSUMERS.md`
(what a consumer may rely on), `RUNBOOK.md` (release, re-bless, restart, rollback, token
rotation, restore), `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `NOTICE`. Contract docs:
`map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`, `map/scanners/INTAKE.md`,
`yardstick/README.md`, `views/README.md`, `routine/README.md`, `tests/README.md`,
`owner/PACKET.md`. No ADR directory; rationale lives inline in contracts, code comments and
issue references (`#NNN`).

## 5. Agent-facing files (AI surfaces)

No in-code LLM call site exists: no model SDK import, no HTTP call to a model API, no
tool-definition table (`name` + `input_schema`), no MCP toolset (grep of the non-test tree).
By the invocation-boundary rule there is therefore **no in-repo capability**. The AI
surfaces are prompt artifacts a consumer feeds to a session someone else starts:

| surface | file | notes |
|---|---|---|
| `lane-practice-review` | `map/scanners/adapters/practice-review/lane.md` | seed body for a review session (reads an untrusted target, publishes one artifact) |
| `lane-deep-code-review` | `map/scanners/adapters/deep-code-review/lane.md` | seed body for a code-review session (fetches the reviewer's method at a pinned commit) |
| `lane-seed` command | `map/lane.mjs` | fills a lane for a target; prints JSON (no effect) |
| `ask-owner-prompt` | `owner/ask-owner.md`, `owner/ask-owner.mjs` | owner prompt, prefilled from a run; printed |
| agent contract | `CLAUDE.md` | rules for agents working in the repo |
| method | `map/METHOD.md` (frontmatter `type: skill`) | the practice-review method a session follows |

The delegation pass records the two lane sessions as `capability` findings (their reach is
defined by the lane text, the session itself runs outside this repo), with confidence
reflecting that.

## 6. Effect inventory (channel slugs fixed here; passes draw from this list)

Invocation boundary = the command or workflow a person or agent invokes.

**Operator-run CLI channels**

| slug | invocable | effect | evidence |
|---|---|---|---|
| `fresh-clone-exec` | `assay fresh-clone`, `start --allow-exec` | executes the target's install/build/lint/test/migrate in a scratch clone, `shell: true`, allow-listed env | `map/fresh-clone.mjs:310`, `map/child-env.mjs:28` |
| `dependency-scan-audit` | `assay dependency-scan` | runs the target's package manager `audit` from scratch copies; sends lockfile contents to the registry | `map/dependency-scan.mjs:398`, `:275` |
| `structure-scan-tools` | `assay structure-scan` | `npm install` jscpd/knip into scratch from the registry; knip loads the target's tool configs (exec), `--no-exec` skips it | `map/structure-scan.mjs:103`, `:120`, `:189` |
| `tools-install` | `assay tools install` | downloads pinned binaries (sha256-checked) or PyPI packages via uv/pip, writes a bin dir | `map/tools.mjs:98-135` |
| `instrument-run` | `assay start` (and routine) | runs each adopted instrument's bin over the target / a scratch copy | `map/start.mjs:205`, `:266` |
| `run-start` | `assay start` | creates a run dir, writes `map/scanners.yaml` and instrument findings | `map/start.mjs` |
| `run-ingest` | `assay ingest` | writes findings/coverage/native/raw files into a run | `map/ingest.mjs` |
| `run-record` | `assay record` | rewrites one row of `map/scanners.yaml` under a lock file | `map/record.mjs:150-170` |
| `run-migrate` | `assay migrate-run --write` | rewrites an older run's files in place | `map/migrate-run.mjs` |
| `run-compile` | `assay compile` (+ `maturity --write`, `backlog --write`, `measure --write`) | writes views, `IMPROVE.md`, `handoff/` (removes and rewrites `handoff/`), generated sidecars | `views/compile.mjs:56`, `views/improve/handoff.mjs:604` |
| `routine-run` | `assay routine` / `routine/run.mjs` | the whole routine: verify tools, draw, record, validate, compile, ratchet; writes the run + `routine.yaml` | `routine/run.mjs` |

**Repository automation channels (GitHub Actions)**

| slug | trigger | effect | evidence |
|---|---|---|---|
| `tools-check-issue` | weekly cron + dispatch | opens or comments one issue when a pin is behind | `.github/workflows/tools-check.yml:33-35` |
| `release-publish` | `workflow_dispatch` on default branch | creates a tag + GitHub release after the gate passes | `.github/workflows/release.yml:50` |
| `branch-delete` | push to default, dispatch, `workflow_call` | deletes merged branches via REST, re-reading each tip first | `.github/workflows/branch-cleanup.yml:131` |
| `routine-artifact-upload` | consumer's copy of the routine template | uploads the run as a workflow artifact (90 days), the handoff (1 day) | `routine/assay-routine.yml:78-82`, `:184-188` |

**Out of scope (read-only; triaged, no effect finding):** `validate`, `enumerate`, `project`,
`toolchain`, `variance`, `score`, `roster`, `yardstick`, `compare`, `ratchet`,
`validate-packet`, `ask-owner`, `lane` (all print or exit non-zero), `tools check`/`verify`
(network read of release metadata, `map/tools.mjs:202`), `ci.yml` (read-only token),
`repo-census` (reads git + files), `lib/release-notes.mjs` (reads git).

**Credentials population (for the credential census):** the per-run `github.token` in
`tools-check.yml` (`issues: write`), `release.yml` (`contents: write`), `branch-cleanup.yml`
(delete job `contents: write`), `routine/assay-routine.yml` (`FETCH_TOKEN`, read); the optional
`ASSAY_READ_TOKEN` secret (`routine/assay-routine.yml:65`, commented out); `GITHUB_TOKEN` read
from env by `map/tools.mjs:202` for release-metadata reads; proxy URLs with userinfo, which
`map/child-env.mjs:17-24` treats as credentials and drops. Count: 4 (github.token as one
secret held per workflow, ASSAY_READ_TOKEN, the env GITHUB_TOKEN tools reads, proxy userinfo).

**Container / agent classes:** no containers launched (no `docker run`, no socket mount). Agent
classes: the operator's own shell (all CLI channels), GitHub Actions jobs (per-job token
scopes), the consumer's routine jobs (`target` executes the change; `routine` never does), and
the lane review sessions (outside the repo).

**Interface contracts:** `map/SCHEMA.md` + `map/validate.mjs` (findings), `lib/run-data.mjs`
(chains/sequence/backlog schemas), adapters per `map/scanners/CONTRACT.md`, `yardstick/requirements.yaml`
+ `yardstick/packet.mjs`, `CONSUMERS.md` + `tests/blocks/consumer-contract.mjs`,
`tests/blocks/doctrine-lockstep.mjs`.

**HTTP routes:** none. **Network-egress controls:** `map/child-env.mjs` (allow-listed env),
sha256 pins in adapters' `tool:` blocks.

## 7. Slice plan (5-15 files each; tests/sweeps and tests/fixtures/*/map are not opened)

1. **Legibility:** `README.md`, `CLAUDE.md`, `map/METHOD.md`, `map/SCHEMA.md`,
   `map/scanners/CONTRACT.md`, `routine/README.md`, `yardstick/README.md`, `views/README.md`,
   `map/doctrine.mjs`, `map/child-env.mjs`, `routine/assay-routine.yml`.
2. **Context:** `README.md`, `CLAUDE.md`, `CONSUMERS.md`, `tests/README.md`, `map/canon/README.md`,
   `assay.mjs`, `map/project.mjs`, `lib/yaml-min.mjs`, `map/ingest.mjs` (size), `map/repo-census.mjs`
   (size), `map/scanners/adapters/practice-review.yaml`, `views/README.md`.
3. **Gates:** `package.json`, `.github/workflows/ci.yml`, `tests/regression.mjs`, `tests/harness.mjs`,
   `tests/README.md`, `tests/golden.json` (shape only), `lib/check-syntax.mjs`, `tsconfig.json`,
   `map/validate.mjs`, a sample of `tests/blocks/*.mjs` and `tests/negative/` listing,
   `.github/PULL_REQUEST_TEMPLATE.md`.
4. **Verification:** `map/score.mjs`, `map/variance.mjs`, `map/backlog.mjs`, `map/enumerate.mjs`,
   `tests/blocks/fixture-recall.mjs`, `tests/blocks/sweep-gate.mjs`, `map/fresh-clone.mjs`
   (report paths), `map/start.mjs` (instrument report paths), `views/improve/handoff.mjs`, the
   `tests/fixtures` and `tests/sweeps` listings only.
5. **Delegation:** every channel in §6 at its evidence, `map/child-env.mjs`, `map/tools.mjs`,
   `.github/workflows/*.yml`, `.github/actions/tools/action.yml`, `routine/assay-routine.yml`,
   `routine/run.mjs`, both lanes, `SECURITY.md`, `RUNBOOK.md`.
6. **Improvement:** `CLAUDE.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
   `tests/blocks/no-history-file.mjs`, `map/backlog.mjs`, `lib/release-notes.mjs`,
   `.github/workflows/release.yml`, `map/scanners/INTAKE.md`, `map/roster.mjs`, `RUNBOOK.md`.
7. **Multiplayer:** `CONSUMERS.md`, `views/README.md`, `lib/run-data.mjs`, `map/lane.mjs`,
   `owner/PACKET.md`, `owner/ask-owner.mjs`, `map/decisions.mjs`, `map/record.mjs` (lock),
   `views/owner.mjs`, `assay.mjs` (`--json` surfaces), `.github/actions/tools/action.yml`.

Not read: anything under `tests/sweeps/` and `tests/fixtures/*/map/`, any `ANSWERS.yaml`, git
history beyond the head's own date.
