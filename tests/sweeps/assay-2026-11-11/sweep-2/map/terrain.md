---
confidential: true
type: doc
title: "assay — Pass 0 terrain (practice-review, head 4b81665)"
---
# Terrain — assay at 4b81665

Target: `andyschwab/assay`, branch `main`, head `4b81665457efa1435da9420028738acdfdcb1832`
(commit date 2026-11-02T13:41:33Z), full history fetched (not shallow, 440 commits reachable).
Derived **blind**: no prior run and no answer sheet was opened. `tests/sweeps/` and
`tests/fixtures/*/map/` exist (earlier runs of this method and answer sheets) and are recorded
here as terrain only; no pass reads them.

## Canon

No canon exists for this target: `map/canon/` holds only `README.md`. The populations below are
derived blind from a listing (find/grep over `git ls-files`) under the invocation-boundary rule.
`node assay.mjs enumerate` was **not run** (this lane executes nothing); the consumer runs it and
the coverage gate. The list below is the analyst's listing-derived stand-in for its CHANNEL
CANDIDATES. This terrain proposes the channel list as a canon draft (`canon/assay.yaml`) for review.

## Map

- **What it is.** A zero-dependency Node (>=22, ESM `.mjs`) CLI that maps a repository
  (findings), measures the map against a yardstick of requirements, and writes views
  (Intake, Maintain, Improve, Owner, Since). `package.json:1-20`, `assay.mjs:1-85`.
- **Languages / proportions** (tracked files, 639): 220 `.mjs` (14.7k lines outside `tests/`,
  12.3k in `tests/`), 222 `.yaml`, 90 `.md`, 53 `.json`, 11 `.yml`; small `.js/.py/.ts/.sql`
  only as fixtures and taint-rule controls.
- **Entry points.** `assay.mjs` (command dispatcher, 30 commands in 4 groups, `assay.mjs:18-58`);
  `npm test` = `tests/regression.mjs`; `npm run lint`/`build` = `lib/check-syntax.mjs`;
  `npm run typecheck` = `tsc -p tsconfig.json` (devDeps: typescript, @types/node only).
- **CI.** `.github/workflows/ci.yml` (push to main + every PR; read-only token; Node 22 and 24;
  lint, typecheck, build, pinned tools, `npm test`); `release.yml` (person-dispatched tag +
  GitHub release); `tools-check.yml` (weekly cron, opens/comments an issue); `branch-cleanup.yml`
  (reusable, dry-run default, deletes merged branches); composite action `.github/actions/tools`.
  `routine/assay-routine.yml` is a **template** a consumer copies, not a workflow of this repo.
- **Load-bearing directories.** `map/` (instruments, validator, method, schema, chains,
  doctrine), `map/scanners/` (CONTRACT + adapters, 12 adapter YAMLs, 2 lanes), `yardstick/`
  (requirements.yaml + measure/compare/ratchet/packet), `views/` (intake/maintain/owner/since,
  `views/improve/` report, handoff, axes, maturity), `lib/` (yaml-min, run-data, run-layout,
  display, check-syntax, release-notes), `routine/` (run.mjs + template + README), `owner/`
  (packet + ask-owner prompt + evidence guides), `tests/` (`blocks/` 155 harness blocks,
  `negative/` 43 negative fixtures, `instruments/`, `enumerate-fixture/`, `sidecar-fixture/`,
  `fixtures/`, `sweeps/`, `golden.json`).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent spec), `CONSUMERS.md`,
  `CONTRIBUTING.md`, `RUNBOOK.md`, `SECURITY.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/{CONTRACT,INTAKE,CANDIDATES}.md`, `views/README.md`, `yardstick/README.md`,
  `routine/README.md`, `owner/PACKET.md`, `owner/evidence/*.md`, `tests/README.md`,
  `views/improve/templates/*.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (frontmatter `type: skill`);
  lanes `map/scanners/adapters/practice-review/lane.md`, `.../deep-code-review/lane.md`
  (seeded by `map/lane.mjs`); `owner/ask-owner.md` (a prompt an owner pastes into their own AI
  tool); generated `handoff/plan/NN-*.md` session prompts (`views/improve/handoff.mjs`);
  `.github/PULL_REQUEST_TEMPLATE.md`.
- **Size.** ~27k lines of `.mjs`; largest modules `map/repo-census.mjs` (1300),
  `map/ingest.mjs` (1282), `map/validate.mjs` (750), `map/fresh-clone.mjs` (695).

## AI surfaces (capability = an LLM call site)

A grep for model SDKs / API hosts / CLI model invocations over every non-test source finds **no
LLM call site in code** (the only hits are a comment in `map/enumerate.mjs:274-275`, a secret
regex in `yardstick/packet.mjs:122`, and yardstick prose). The engine calls no model. The AI
surfaces it **defines** run in a model session someone else starts:

| surface | defined at | untrusted input | private data | external effect |
|---|---|---|---|---|
| `lane-practice-review` (review session seed) | `map/lane.mjs:1-30`, `map/scanners/adapters/practice-review/lane.md` | target repo text | target code | publishes one private Artifact (write) |
| `lane-deep-code-review` | `map/scanners/adapters/deep-code-review/lane.md` | target repo + instrument output | target code | publishes one private Artifact (write) |
| `ask-owner-prompt` | `owner/ask-owner.md`, `owner/ask-owner.mjs` | owner's repo (in their tool) | owner's repo | reply comes back as data, checked by `validate-packet` |
| `handoff-plan-prompts` | `views/improve/handoff.mjs` (plan/NN-*.md) | scanner text fenced as data | target findings | prompts say never deploy/send |

## Effect inventory (channel slugs fixed here; one `effect` finding each)

Invocation boundary = one `assay` command or one workflow. Writes into a run directory the
operator named are internal and reversible unless noted.

| slug | invoked as | evidence |
|---|---|---|
| `start-run` | `assay start` — creates the run, runs offline instruments, writes manifest | `map/start.mjs:205`, `map/start.mjs:266`, `map/start.mjs:469` |
| `fresh-clone-exec` | `assay fresh-clone` — EXECUTES target install/build/test/migrate in a shell | `map/fresh-clone.mjs:310` |
| `dependency-scan-exec` | `assay dependency-scan` — runs target's package manager audit (network) | `map/dependency-scan.mjs:398` |
| `structure-scan-exec` | `assay structure-scan` — npm-installs jscpd/knip, runs knip over target configs | `map/structure-scan.mjs:103`, `map/structure-scan.mjs:189` |
| `tools-install` | `assay tools install` — downloads pinned binaries, sha256-checks, writes bin dir | `map/tools.mjs:125`, `map/tools.mjs:130` |
| `repo-census-write` | `assay repo-census --out` | `map/repo-census.mjs:1291` |
| `ingest-write` | `assay ingest` — writes findings + raw + coverage into a run | `map/ingest.mjs:1251-1255` |
| `record-write` | `assay record` — rewrites one manifest row under a lock | `map/record.mjs:167` |
| `migrate-run-write` | `assay migrate-run --write` — rewrites/renames run files in place | `map/migrate-run.mjs:102-103` |
| `backlog-write` | `assay backlog --write` | `map/backlog.mjs:178` |
| `measure-write` | `assay measure` — writes `yardstick.yaml` | `yardstick/measure.mjs:490` |
| `ratchet-baseline-write` | `assay ratchet --write` — writes a baseline file | `yardstick/ratchet.mjs:302` |
| `compile-views` | `assay compile` (and `intake`/`maintain`/`owner`/`since`/`maturity` alone) — writes views, IMPROVE.md, handoff (deletes and rewrites `handoff/`) | `views/compile.mjs:56`, `views/improve/handoff.mjs:604`, `views/improve/report.mjs:459` |
| `routine-run` | `assay routine` — verifies tools, draws, validates, compiles, ratchets; writes run + routine.yaml | `routine/run.mjs:199`, `routine/run.mjs:236` |
| `release-publish` | `release.yml` (workflow_dispatch) — creates tag + GitHub release | `.github/workflows/release.yml:50` |
| `tools-check-issue` | `tools-check.yml` (weekly cron) — opens or comments an issue | `.github/workflows/tools-check.yml:33-35` |
| `branch-delete` | `branch-cleanup.yml` (reusable) — deletes merged branches when dry_run is off | `.github/workflows/branch-cleanup.yml:131` |
| `tools-action-path` | `.github/actions/tools` — installs tools, appends to `GITHUB_PATH` | `.github/actions/tools/action.yml:29-31` |
| `routine-artifact-upload` | consumer template `routine/assay-routine.yml` — uploads the run as a workflow artifact | `routine/assay-routine.yml:181-186` |

**Out of scope (read-only, no effect):** `validate`, `enumerate`, `project`, `toolchain`,
`variance`, `score`, `roster`, `lane`, `yardstick`, `compare`, `validate-packet`, `ask-owner`
(prints only), `ci.yml` (read-only token, runs tests). `map/chains|capabilities|supervision|decisions.mjs`
are libraries, not commands (`assay.mjs:16-17`).

## Credential population (enumerate-before-assess)

Rule: every secret/token the code or a workflow reads from the environment or `secrets.*`.
1. `github.token` → `GH_TOKEN` in `release.yml:45` (contents: write, job-scoped).
2. `github.token` → `GH_TOKEN`/`GITHUB_TOKEN` in `tools-check.yml:19-20` (issues: write).
3. `github.token` → `GH_TOKEN` in `branch-cleanup.yml:61` (plan job, read) and `:112` (delete job, contents: write).
4. `github.token` → `FETCH_TOKEN` in `routine/assay-routine.yml:110` (consumer template, contents: read).
5. `GITHUB_TOKEN` read by `map/tools.mjs:202` (optional bearer for release-metadata reads).
6. `ASSAY_READ_TOKEN` (commented-out consumer secret, `routine/assay-routine.yml:65`, `:124`).
Child processes running target code get an allow-listed env (`map/child-env.mjs:10-38`).
Count: 6.

## Container / agent classes

No containers are defined. Execution classes: (a) operator's shell running the CLI; (b) child
processes running **target code** (fresh-clone, dependency-scan, structure-scan/knip) under
`childEnv()`; (c) GitHub Actions runners per workflow; (d) model review sessions (lanes) started by
a consumer. Assess each separately.

## Populations for censuses (closed lists)

- **decision-reconstruction** (artifact): 10 non-obvious choices — zero-dep YAML reader
  (`lib/yaml-min.mjs`); ids carry no dimension (SCHEMA §3); child env allow-list
  (`map/child-env.mjs`); no deploy verdict / stage scale (SCHEMA §6a); core names no scanner
  (CLAUDE.md rule 7); canon file (SCHEMA §8); target-exec only under `--allow-exec`
  (`map/start.mjs`); routine reads baseline from the base branch on PRs
  (`routine/assay-routine.yml:97-104`); release only by person dispatch (`release.yml:1-8`); lanes
  execute nothing (`map/lane.mjs:4-11`).
- **modules-standalone** (artifact): `map/`, `map/scanners/`, `yardstick/`, `views/`, `lib/`, `routine/`, `owner/` (7).
- **gates-coverage** (contract): ci.yml steps on pull_request — lint, typecheck, build, tools install+verify, `npm test` (5).
- **effect-provability** (control): every channel above (19).
- **credential** (control): the 6 above.
- **incidents-became-mechanisms** (process): lessons named in contract docs with an issue
  number that point to a pinning test block (sample from `CLAUDE.md`, `tests/blocks/`).
- **agent-access-surface** (artifact): CLI `--json` outputs, lane seeds, handoff
  (`sequence.json`, plan prompts), `chains.json`, the packet prompt.
- **doc-freshness** (artifact): README, CLAUDE.md, RUNBOOK, CONSUMERS, views/README, yardstick/README, routine/README.

## Slice plan (what each pass reads; nothing under `tests/sweeps/` or `tests/fixtures/*/map/`)

1. **legibility** — README.md, CLAUDE.md, map/SCHEMA.md §3/§6a/§8, map/child-env.mjs, map/start.mjs head, routine/assay-routine.yml, release.yml header, map/lane.mjs head, lib/yaml-min.mjs head, map/scanners/CONTRACT.md.
2. **context** — README.md, CLAUDE.md, assay.mjs, views/README.md, yardstick/README.md, RUNBOOK.md, CONSUMERS.md, tests/README.md, module heads, docs vs code spot-checks.
3. **gates** — ci.yml, package.json, tsconfig.json, lib/check-syntax.mjs, tests/regression.mjs, tests/harness.mjs, tests/README.md, tests/blocks/ (listing + 5–10 blocks), tests/negative/ (listing), map/validate.mjs.
4. **verification** — map/start.mjs, map/ingest.mjs, map/record.mjs, map/fresh-clone.mjs, map/tools.mjs (sha256), map/score.mjs, map/variance.mjs, routine/run.mjs, views/improve/handoff.mjs, tests/golden.json.
5. **delegation** — every channel's site above, map/child-env.mjs, the four workflows + action, routine template, map/lane.mjs + both lanes, owner/ask-owner.*, views/improve/handoff.mjs fencing, SECURITY.md.
6. **improvement** — CLAUDE.md, CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md, lib/release-notes.mjs, CONSUMERS.md, tests/blocks (issue-cited), map/backlog.mjs, tools-check.yml.
7. **multiplayer** — assay.mjs (`--json` surfaces), map/lane.mjs, views/README.md, lib/run-data.mjs, views/improve/handoff.mjs, map/decisions.mjs, owner/PACKET.md, CONSUMERS.md, routine/README.md.

**Not reading:** `tests/sweeps/**`, `tests/fixtures/**/map/**`, any `ANSWERS.yaml` (prior runs and
answer sheets, by rule); opengrep taint rule bodies; most of the 155 harness blocks (sampled by name).
