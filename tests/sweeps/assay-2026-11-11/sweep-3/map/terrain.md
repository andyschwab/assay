---
confidential: true
type: doc
title: "assay — Pass 0 terrain (practice-review, 4b81665)"
---
# Terrain — assay at 4b81665

Target: `andyschwab/assay`, branch `main` (detached at its head), head
`4b81665457efa1435da9420028738acdfdcb1832`, committed 2026-11-02T13:41:33Z; the
checkout is shallow. Method read at engine `4b81665` (the same commit).

**Canon.** `map/canon/` holds only `README.md`; there is no `canon/assay.yaml`. The
populations below are derived **blind**: from listings (`git ls-files`, grep over
spawn/exec, fs-write, fetch/curl, `gh`/`git` and `process.env` sites, workflow
`${{ secrets.* }}`/`github.token` sites), with no prior run in context.
`assay enumerate` was **not run** (this lane executes nothing); the listing greps
stand in for its CHANNEL CANDIDATES, and the consumer may run the coverage gate.
The channel list here is proposed as the first canon draft.

**Not read, by rule.** `tests/sweeps/` (earlier blind runs of this method over this
repository) and `tests/fixtures/*/map/` (earlier runs and answer sheets), and every
`ANSWERS.yaml`, are terrain only: listed, never opened.

## Map

- **Size.** 639 tracked files: 517 under `tests/`, 122 elsewhere (~24.4k lines
  outside `tests/`). Languages: JavaScript ES modules (`.mjs`, 54 files outside
  tests, Node ≥ 22, zero runtime dependencies), Markdown contracts (34), YAML (16
  `.yaml` adapters/requirements/templates + 8 `.yml` workflows and opengrep rules),
  one `.py` and one `.js` (opengrep positive-control files).
- **Entry point.** `assay.mjs` — a thin dispatcher (`spawnSync(node, script)`) over
  ~30 commands grouped Map / Yardstick / Routine / Views.
- **Build / test / lint.** `package.json`: `test` = `node tests/regression.mjs`
  (harness over `tests/blocks/*.mjs`, 155 block files, pinned `tests/golden.json`),
  `lint` and `build` = `lib/check-syntax.mjs` (`node --check` every tracked JS),
  `typecheck` = `tsc -p tsconfig.json` (JSDoc types; devDeps typescript +
  @types/node only, `package-lock.json`).
- **CI** (`.github/workflows/`): `ci.yml` (push to main + every PR; node 22/24
  matrix; npm ci, lint, typecheck, build, install pinned tools via
  `.github/actions/tools`, `npm test`; read-only token); `tools-check.yml` (weekly
  cron; reads upstream releases, opens/comments one issue; `issues: write`);
  `release.yml` (workflow_dispatch by a person; tests, Consumer-trailer check,
  `gh release create`; `contents: write`); `branch-cleanup.yml` (on every push to
  main + dispatch + workflow_call; deletes merged branches via REST).
  `routine/assay-routine.yml` is a **template** for stewarded repositories (not run
  here): two jobs, target (executes the target's code) and routine (validate,
  compile, ratchet; required check).
- **Load-bearing directories.**
  - `map/` — the map layer: `METHOD.md`, `SCHEMA.md`, `validate.mjs`, `start.mjs`,
    `ingest.mjs`, `record.mjs`, `enumerate.mjs`, `chains.mjs`, `doctrine.mjs`,
    `capabilities.mjs`, `supervision.mjs`, `project.mjs`, `lane.mjs`, `tools.mjs`,
    instruments (`fresh-clone.mjs`, `dependency-scan.mjs`, `structure-scan.mjs`,
    `repo-census.mjs`), `variance.mjs`, `score.mjs`, `backlog.mjs`, `roster.mjs`.
  - `map/scanners/` — `CONTRACT.md` (scanner contract), `INTAKE.md`,
    `CANDIDATES.md`, `adapters/*.yaml` (11 adapters: practice-review,
    deep-code-review, gitleaks, fresh-clone, dependency-scan, repo-census,
    structure-scan, zizmor, osv-scanner, checkov, opengrep; two carry `lane.md`
    session seeds; opengrep vendors taint rules + a positive control).
  - `yardstick/` — `requirements.yaml` (911 lines, the requirements), `README.md`
    (contract), `measure.mjs`, `compare.mjs`, `ratchet.mjs`, `packet.mjs`, `list.mjs`.
  - `views/` — `README.md`, `compile.mjs`, `intake/maintain/owner/since.mjs`,
    `improve/` (`report.mjs`, `handoff.mjs`, `axes.mjs`, `maturity.mjs`,
    `sequence.mjs`, templates).
  - `owner/` — `PACKET.md`, `ask-owner.md`/`.mjs`, `evidence/` (claim templates).
  - `routine/` — `README.md`, `run.mjs`, `assay-routine.yml`.
  - `lib/` — `yaml-min.mjs` (the strict reader), `run-data.mjs`, `run-layout.mjs`,
    `display.mjs`, `release-notes.mjs`, `check-syntax.mjs`.
  - `tests/` — `harness.mjs`, `regression.mjs`, `golden.json`, `blocks/` (155),
    `negative/` (fail-closed fixtures), `instruments/` (instrument fixtures and
    shims), `enumerate-fixture/`, `sidecar-fixture/`, `fixtures/` (known-answer
    targets; `*/map/` unread), `sweeps/` (unread).
- **Docs surface.** `README.md` (front door, architecture), `CLAUDE.md` (agent
  contract), `CONSUMERS.md` (consumer contract + `Consumer:` trailer),
  `CONTRIBUTING.md`, `RUNBOOK.md`, `SECURITY.md`, `NOTICE`/`LICENSE`, the contract
  docs above, `.github/PULL_REQUEST_TEMPLATE.md`. No `docs/adr/` directory:
  decisions live in contract docs, code header comments citing issue numbers
  (`#NN`), and git.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (frontmatter `type: skill`,
  the built-in scanner as an agent skill); lanes
  `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md` (seed bodies for review
  sessions, filled by `map/lane.mjs`); `owner/ask-owner.md` (owner prompt);
  `views/improve/handoff.mjs` output (`handoff/plan/NN-*.md`, session prompts
  for a target's maintainer). No `.cursorrules`, no `.claude/` settings, no MCP config.

## AI surfaces (a capability = an LLM call site)

A grep for model SDKs/endpoints (`anthropic`, `openai`, `messages.create`,
`claude-`) hits only pattern tables (`map/enumerate.mjs`, `map/repo-census.mjs`,
`yardstick/packet.mjs`): **assay holds no in-code LLM call site.** Every model step
runs in a session a person starts outside the repository, seeded by a file here.
The AI surfaces are therefore the seeds and contracts that shape those sessions:

| surface | evidence | shape |
|---|---|---|
| `practice-review-lane` | `map/scanners/adapters/practice-review/lane.md` | review session over an untrusted target; read-only; publishes one artifact |
| `deep-code-review-lane` | `map/scanners/adapters/deep-code-review/lane.md` | external code-review session seeded from here |
| `lane-seed` | `map/lane.mjs` | fills a lane with target name/head/focus (prompt assembly) |
| `handoff-plan-prompts` | `views/improve/handoff.mjs` | session prompts that act in a target repo; scanner text fenced as data |
| `ask-owner-prompt` | `owner/ask-owner.md`, `owner/ask-owner.mjs` | owner-interview prompt prefilled from a run |
| `repo-agent-contract` | `CLAUDE.md` | sessions working in this repository |

The delegation pass decides which, if any, is a `capability` finding (trifecta legs).

## Effect inventory (channel slugs fixed here; one per invocation boundary)

| slug | invoked as | what | evidence |
|---|---|---|---|
| `run-dir-write` | `start`, `ingest`, `record`, `migrate-run --write`, `compile` and view scripts, `maturity --write`, `measure --write`, `backlog --write` | writes the run directory (local, reversible) | `map/start.mjs`, `map/ingest.mjs`, `map/record.mjs`, `views/compile.mjs` |
| `instrument-run` | `start` (adapters' `run:` blocks) | runs pinned scanner binaries (gitleaks, zizmor, osv-scanner, checkov, opengrep) over the target; osv-scanner fetches the OSV database over the network | `map/start.mjs:205`, `map/start.mjs:266`, `map/scanners/adapters/osv-scanner.yaml:27` |
| `fresh-clone-exec` | `fresh-clone`, `start --allow-exec`, routine target job | executes the target's install/lifecycle scripts/build/test/migrate with a shell | `map/fresh-clone.mjs:310` |
| `dependency-audit` | `dependency-scan` | runs the target's package manager audit from scratch copies; reaches the registry | `map/dependency-scan.mjs:275`, `map/dependency-scan.mjs:398` |
| `structure-scan-exec` | `structure-scan` | installs jscpd/knip from npm into scratch; knip loads the target's tool configs (under `--allow-exec`) | `map/structure-scan.mjs:103`, `map/structure-scan.mjs:189` |
| `tools-install` | `tools install`, `.github/actions/tools` | downloads pinned binaries (curl, sha256-checked) or pip-installs from PyPI into a bin dir | `map/tools.mjs:91`, `map/tools.mjs:110` |
| `tools-check-issue` | `tools-check.yml` (weekly cron) | opens or comments one GitHub issue on this repository | `.github/workflows/tools-check.yml:33` |
| `branch-delete` | `branch-cleanup.yml` (every push to main; reusable) | deletes merged branch refs via the REST API | `.github/workflows/branch-cleanup.yml:131` |
| `release-publish` | `release.yml` (person-dispatched) | creates a tag and a GitHub release | `.github/workflows/release.yml:50` |
| `routine-artifact-upload` | `routine/assay-routine.yml` (template, in stewarded repos) | uploads handoff and run as workflow artifacts; the ratchet fails the required check | `routine/assay-routine.yml:78`, `routine/assay-routine.yml:184` |

**Out of scope as effects (read-only or print-only), triaged:** `tools check`
(reads release metadata, `map/tools.mjs:202`), `validate`, `enumerate`, `project`,
`toolchain`, `score`, `variance`, `roster`, `yardstick`, `compare`,
`validate-packet`, `lane` (prints JSON), `ask-owner` (prints a prompt),
`repo-census` (git reads on the target; its findings land via `run-dir-write`),
`lib/release-notes.mjs` (git reads), `ratchet` (reads; its exit code is the gate
the routine channel carries).

## Other enumerated populations

- **Container / agent classes.** Local operator process (CLI); CI `test` job;
  `tools-check` job (`issues: write`); `release` job (`contents: write`);
  `branch-cleanup` plan job (read) and delete job (`contents: write`); routine
  template `target` job (executes target code, no token persisted) and `routine`
  job (`github.token` via env for one fetch); instrument child processes
  (`map/child-env.mjs` allow-list); review sessions seeded by lanes (outside the repo).
- **Credentials / secrets** (enumerated before assessed): `GITHUB_TOKEN` read by
  `map/tools.mjs:202`; `github.token` in `tools-check.yml:19-20`,
  `branch-cleanup.yml:61,112`, `release.yml:45`, `routine/assay-routine.yml:110`
  (`FETCH_TOKEN`); `secrets.ASSAY_READ_TOKEN` (commented, template,
  `routine/assay-routine.yml:65,124`); proxy URL userinfo (dropped,
  `map/child-env.mjs:19`). `ASSAY_REF` is a commit pin, not a secret. Planted
  secret-shaped strings under `tests/` are inert by rule (`CLAUDE.md` rule 6,
  `.gitleaksignore`).
- **HTTP route handlers.** None (no server; `README.md` "Not a service").
- **Network-egress controls.** `map/child-env.mjs` (allow-listed env, proxy userinfo
  dropped); sha256 pins in adapters' `tool:` blocks (`map/tools.mjs`); no
  firewall/egress policy (none expected: a CLI).
- **Interface contracts.** `map/SCHEMA.md` + `map/validate.mjs`; `lib/yaml-min.mjs`;
  `lib/run-data.mjs` (chains/sequence/backlog schemas); `map/scanners/CONTRACT.md` +
  adapters; `yardstick/requirements.yaml` + `yardstick/README.md`; `views/README.md`;
  `CONSUMERS.md` + `lib/release-notes.mjs --check`; `owner/PACKET.md` +
  `yardstick/packet.mjs`.
- **Delivery / effect-vs-report paths.** `map/scanners.yaml` run manifest (ran /
  skipped / failed + reason); instrument rows (`map/start.mjs`); routine handoff
  (`routine/run.mjs`); `tools verify`; release and branch-cleanup jobs' re-reads.

## Slice plan (what each pass reads; 5–15 items each)

1. **Legibility** — `README.md`, `CLAUDE.md`, `map/METHOD.md`, `map/SCHEMA.md`,
   `map/scanners/CONTRACT.md`, `yardstick/README.md`, `views/README.md`,
   `routine/README.md`, `CONSUMERS.md`, header comments of `map/child-env.mjs`,
   `map/doctrine.mjs`, `map/chains.mjs`, `lib/yaml-min.mjs`. Census:
   decision-reconstruction (sample ~10 non-obvious decisions).
2. **Context** — `README.md`, `CLAUDE.md`, `assay.mjs`, `tests/README.md`,
   `RUNBOOK.md`, `map/scanners/INTAKE.md`, the contract docs' sizes, module
   boundaries of `map/ lib/ views/ yardstick/ owner/ routine/`; model-tier / spend
   recording (`map/record.mjs`, `map/roster.mjs`, `map/variance.mjs`). Census:
   modules-standalone, doc-freshness.
3. **Gates** — `.github/workflows/ci.yml`, `package.json`, `tsconfig.json`,
   `lib/check-syntax.mjs`, `tests/harness.mjs`, `tests/regression.mjs`,
   `tests/README.md`, `tests/golden.json`, a sample of `tests/blocks/` and
   `tests/negative/`, `map/validate.mjs`, `lib/yaml-min.mjs`. Census: gates-coverage.
4. **Verification** — `map/start.mjs`, `map/scanners.yaml` template
   (`map/templates/`), `map/ingest.mjs`, `map/tools.mjs` (verify), `routine/run.mjs`,
   `map/score.mjs`, `map/variance.mjs`, `map/backlog.mjs`, opengrep positive
   control, `tests/instruments/`. Census: effect-provability (one per channel above).
5. **Delegation** — every channel above; `map/child-env.mjs`, `map/fresh-clone.mjs`,
   `map/dependency-scan.mjs`, `map/structure-scan.mjs`, `map/tools.mjs`,
   `map/start.mjs`, the four workflows, `routine/assay-routine.yml`, the two lanes,
   `map/lane.mjs`, `views/improve/handoff.mjs` (fencing), `SECURITY.md`. Census: credential.
6. **Improvement** — `CLAUDE.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
   METHOD "Feedback hook", `map/backlog.mjs`, `tests/blocks/no-history-file.mjs`,
   `tests/golden.json` re-bless rule, `map/roster.mjs`, `lib/release-notes.mjs`,
   issue references (`#NN`) in code. Census: incidents-became-mechanisms.
7. **Multiplayer** — `README.md` roles, `CONSUMERS.md`, `views/README.md`,
   `owner/`, `map/lane.mjs` + lanes, `views/improve/handoff.mjs`,
   `lib/run-data.mjs`, `yardstick/list.mjs --json`, `map/project.mjs --json`,
   `map/decisions.mjs`. Census: agent-access-surface.

**Not read:** the bodies of most `tests/blocks/*.mjs` beyond the samples each pass
names; opengrep taint rule bodies; `yardstick/requirements.yaml` beyond what a pass
cites; `tests/sweeps/` and `tests/fixtures/*/map/` (by rule).
