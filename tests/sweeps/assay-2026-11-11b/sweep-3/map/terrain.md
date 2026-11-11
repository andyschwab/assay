---
type: doc
title: "assay — terrain (Pass 0), head 2b247c0"
---
# Terrain — assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Blind sweep: no prior run was read. `tests/sweeps/`, `tests/fixtures/*/map/` and every
`ANSWERS.yaml` were excluded from every listing and search and never opened; they are
terrain only (the calibration sets and known-answer sheets). The method was read at
engine tag v0.7.0, which is this same commit.

## Canon

No canon exists for this target: `map/canon/` holds only `README.md` (the directory's
contract), no `<target>.yaml`. The populations below are derived blind, from the
listing (`git ls-files`, the exclusions applied: 549 tracked files) and the enumeration
input `map/raw/enumerate.json` (714 files read by the enumerator, which did not apply the
blind exclusions). They are proposed as a canon in the last section.

## The map

- **What it is.** A zero-dependency Node (>=22, ESM `.mjs`) command line, `assay.mjs`, a
  thin dispatcher (`assay.mjs:84`) over ~31 engine scripts in three layers: `map/` (draw a
  map of a target repository: instruments, ingest, validate), `yardstick/` (measure the
  map against `yardstick/requirements.yaml`), `views/` (Intake, Maintain, Improve, Owner,
  Since; the report and the handoff). `routine/` is the scheduled steward run, `owner/`
  the owner packet and prompt, `lib/` shared helpers (strict YAML reader, run layout).
- **Languages.** 228 `.mjs`, 144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml` (workflows,
  opengrep rules); `.ts/.tsx/.js/.py/.sql` appear only as test fixtures and scanner
  controls. Dev dependencies are TypeScript and `@types/node` only (`package.json`),
  used for `tsc` type checking of JSDoc.
- **Size.** 549 tracked files after exclusions; 425 under `tests/` (161 harness blocks
  in `tests/blocks/`, 136 files of negative runs, 99 instrument fixtures). Non-test
  source and docs about 24.6k lines; largest: `map/repo-census.mjs` (1300),
  `map/ingest.mjs` (1282), `map/SCHEMA.md` (1125), `map/scanners/CONTRACT.md` (1061),
  `yardstick/requirements.yaml` (912), `map/METHOD.md` (813), `map/validate.mjs` (795).
- **Entry points.** `npm test` = `node tests/regression.mjs` (the harness, fails
  closed); `npm run lint` and `build` = `lib/check-syntax.mjs` (`node --check` every
  tracked script); `npm run typecheck` = `tsc -p tsconfig.json`.
- **CI.** `.github/workflows/ci.yml` (push + pull_request; one `test` job: npm ci, lint,
  typecheck, build, the tools action, npm test; actions pinned by sha);
  `release.yml` (workflow_dispatch: tests, release-notes check, `gh release create`);
  `branch-cleanup.yml` (push to default branch + dispatch + workflow_call: deletes
  merged branches; dispatch is a dry run by default); `tools-check.yml` (weekly cron:
  compares tool pins to upstream, opens or comments one issue);
  `.github/actions/tools/action.yml` (composite: installs the pinned tools).
  `routine/assay-routine.yml` is a template a stewarded repository copies (weekly cron,
  `contents: read`).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract),
  `CONTRIBUTING.md`, `RUNBOOK.md`, `CONSUMERS.md`, `SECURITY.md`, `map/METHOD.md`,
  `map/SCHEMA.md`, `map/scanners/{CONTRACT,INTAKE,CANDIDATES}.md`, `map/canon/README.md`,
  `views/README.md`, `yardstick/README.md`, `routine/README.md`, `tests/README.md`,
  `owner/PACKET.md`, `owner/ask-owner.md`, `owner/evidence/*.md`, report partials under
  `views/improve/templates/`.
- **Agent-facing files.** `CLAUDE.md`; the review lanes
  `map/scanners/adapters/practice-review/lane.md` and
  `map/scanners/adapters/deep-code-review/lane.md` (session seed bodies, filled by
  `map/lane.mjs`); `map/METHOD.md` (frontmatter `type: skill`); `owner/ask-owner.md`
  (the owner prompt); `.github/PULL_REQUEST_TEMPLATE.md`.
- **Load-bearing directories.** `map/` (engine core), `map/scanners/adapters/` (one
  adapter per scanner, 13 adapters), `map/scanners/adapters/opengrep/` (taint rules and a
  planted control), `yardstick/`, `views/`, `views/improve/` (report, handoff, axes,
  maturity), `views/improve/templates/`, `lib/`, `routine/`, `owner/`, `tests/blocks/`,
  `tests/negative/`, `tests/instruments/`, `tests/enumerate-fixture/`, `tests/fixtures/`
  (public known-answer targets; their `map/` subtrees excluded), `.github/workflows/`.

## AI surfaces (capabilities)

The invocation-boundary rule: a capability is an LLM call site. A listing for model calls
(`anthropic|openai|messages.create|claude -p`) over the non-test tree finds none: assay
calls no model. Its AI surfaces are the two **review lanes**, seed bodies a consumer's
model session runs from (`map/lane.mjs:4-11`: the session "executes nothing", the consumer
adds the model). Each is recorded as one `capability` finding in the delegation pass:

| slug | file |
|---|---|
| `practice-review-lane` | `map/scanners/adapters/practice-review/lane.md` |
| `deep-code-review-lane` | `map/scanners/adapters/deep-code-review/lane.md` |

## Effect inventory (draft, fixed slugs)

One channel per invocation boundary (the `assay.mjs` command, or the workflow), slugs
fixed here and drawn verbatim by the passes:

| slug | invocation | what it does (from the listing) |
|---|---|---|
| `run-draw` | `assay start` (`map/start.mjs`) | makes a run directory, runs the offline instruments over the target, writes findings and `map/scanners.yaml` |
| `run-record` | `assay record` (`map/record.mjs`) | rewrites one row of `map/scanners.yaml` under a lock |
| `scanner-ingest` | `assay ingest` (`map/ingest.mjs`) | turns a scanner report into findings, raw and coverage files in a run |
| `views-compile` | `assay compile` and the single-view writers (`views/compile.mjs`, `views/intake.mjs`, `maintain.mjs`, `owner.mjs`, `since.mjs`, `views/improve/*.mjs`, `yardstick/measure.mjs --write`) | writes the generated run files: yardstick.yaml, views, IMPROVE.md, handoff/ |
| `backlog-write` | `assay backlog --write` (`map/backlog.mjs`) | writes `map/backlog.yaml` in a run |
| `migrate-run` | `assay migrate-run --write` (`map/migrate-run.mjs`) | renames files and rewrites YAML of a stored run in place |
| `fresh-clone-exec` | `assay fresh-clone` (`map/fresh-clone.mjs`) | executes the target's install/build/lint/typecheck/test/migrate with `shell: true` (`map/fresh-clone.mjs:310`) |
| `dependency-audit` | `assay dependency-scan` (`map/dependency-scan.mjs`) | runs the target's package manager audit from scratch copies (registry egress) |
| `structure-scan-exec` | `assay structure-scan` (`map/structure-scan.mjs`) | npm-installs jscpd/knip into scratch; knip loads the target's tool configs |
| `tools-install` | `assay tools install` (`map/tools.mjs`) | downloads pinned tool binaries (`map/tools.mjs:125`), checksum-verifies, installs to a bin dir |
| `routine-run` | `assay routine` (`routine/run.mjs`) + `routine/assay-routine.yml` | draws, validates, compiles and ratchets a run on a schedule; uploads it as a workflow artifact |
| `branch-delete` | `.github/workflows/branch-cleanup.yml` | deletes merged remote branches of the repository |
| `release-publish` | `.github/workflows/release.yml` | creates the `vX.Y.Z` tag and public GitHub release |
| `tools-check-issue` | `.github/workflows/tools-check.yml` | weekly: opens or comments one issue on the repository |

Read-only commands (stdout only, from the listing; the delegation pass confirms):
`validate`, `lane`, `enumerate`, `project`, `toolchain`, `repo-census`, `variance`,
`score`, `roster`, `yardstick`, `compare`, `ratchet`, `validate-packet`, `ask-owner`.

Correction from the delegation pass: two of those write a file, so the inventory closes at
16 channels. `repo-census-out` (`assay repo-census --out`, `map/repo-census.mjs:1278-1291`)
and `ratchet-baseline-write` (`assay ratchet --write-baseline`, `yardstick/ratchet.mjs:290-303`)
are recorded as effects F-415 and F-416. The verification census (`effect-provability`) was
dispatched over the 14-channel draft and does not hold them; it reads 14 members.

## The enumerated candidate list (from `map/raw/enumerate.json`)

13 candidates: 1 channel candidate, 6 route handlers, 6 effect-site members. Triage is
recorded in `map/effect-triage.yaml` after the delegation pass assigns finding ids.

- `surface: migrate-run.mjs` → the `migrate-run` effect.
- 6 route handlers (`route: ANY /api/hooks`, `DELETE|GET|PATCH /api/users/[id]`,
  `GET|HEAD /health`) → all under `tests/enumerate-fixture/nextjs/`, an inert fixture the
  enumerator's own test reads; out of scope.
- `docker control`, `git push`, `message/mail send` → the cited lines in this tree are
  the enumerator's own detection regexes (`map/enumerate.mjs:178-182`); no call; out of
  scope.
- `http write` → opengrep rule text (`map/scanners/adapters/opengrep/taint/py.yml`); out
  of scope.
- `http write (js)` → opengrep rule text plus one real call, `map/tools.mjs:125`
  (the tool download), and a test block; → the `tools-install` effect.
- `shell exec` → opengrep rule text and the planted control
  `map/scanners/adapters/opengrep/control/app/run.py:6`; out of scope. The real shell
  execution in the tree (`map/fresh-clone.mjs:310`) is not on the list and is recorded
  as `fresh-clone-exec` regardless.

## Other populations (closed lists for the censuses)

- **Credentials** (`credential` census, subject_type `control`). Rule: every secret name
  in `enumerate.json` `secrets` read from the environment or a workflow secret outside
  `tests/`; excluded: names only in tests or fixtures (inert planted strings, CLAUDE.md
  rule 6) and code constants that are not credentials (`DECISION_KEYS`, `TOP_KEYS`,
  `TRIAGE_KEYS`, `POINTER_*`). Members: `GH_TOKEN`, `GITHUB_TOKEN`, `ASSAY_READ_TOKEN`,
  `FETCH_TOKEN` (4).
- **Container classes.** No container is launched by the engine: the enumerated
  `docker run/create site` and `admin-role branch` hits outside tests are the
  enumerator's regexes (`map/enumerate.mjs:232-233`). The execution boundary is the
  host process: the help text tells the operator to run executing scanners in a
  disposable container (`assay.mjs:66-67`).
- **Egress controls.** Enumerated hits are detector patterns; the engine's own egress
  bound is the child-environment allow-list (`map/child-env.mjs`).
- **Contracts.** `map/SCHEMA.md` + `map/validate.mjs`, `lib/run-data.mjs`,
  `lib/yaml-min.mjs`, the lockstep test `tests/blocks/doctrine-lockstep.mjs`.

## Census plan (census-augmented mode, one finding per member)

| dimension | census name | subject_type | membership rule |
|---|---|---|---|
| artifact-legibility | `decision-reconstruction` | artifact | each numbered ground rule in `CLAUDE.md` (rules 1-7): does its rationale reconstruct from files alone |
| context-economy | `modules-standalone` | artifact | each top-level code module dir: `lib/`, `map/`, `map/scanners/`, `yardstick/`, `views/`, `routine/`, `owner/`, `tests/` (8) |
| context-economy | `doc-freshness` | artifact | each root or directory contract doc: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `RUNBOOK.md`, `CONSUMERS.md`, `SECURITY.md`, `views/README.md`, `yardstick/README.md`, `routine/README.md`, `tests/README.md`, `map/canon/README.md` (11) |
| deterministic-gates | `gates-coverage` | contract | each gate step of the `test` job in `.github/workflows/ci.yml` that runs on pull_request: lint, typecheck, build, tools action, npm test (5) |
| verification | `effect-provability` | control | every effect channel above (14) |
| delegation | `credential` | control | the 4 credentials above |
| improvement-loop | `lessons-mechanized` | process | every past failure recorded as measured in `map/METHOD.md` or `map/SCHEMA.md` (phrases "a calibration measured", "a real case", "a prior calibration run", "once shipped", "cal5"), one per distinct lesson |
| multiplayer | `agent-access-surface` | artifact | every command in `assay.mjs`'s `GROUPS` table (31): does it expose an agent-consumable (machine-readable) output |

## Slice plan (what each pass reads)

1. **Legibility:** `CLAUDE.md`, `README.md`, `map/METHOD.md` (ground rules), `map/SCHEMA.md`
   (§2, §8), `CONTRIBUTING.md`, `map/scanners/CONTRACT.md` (head), `tests/blocks/` files
   the rules name, code comments at the head of `map/*.mjs` for rationale.
2. **Context:** `README.md`, `CLAUDE.md`, the 11 contract docs, `assay.mjs`, each module
   dir's README/head comment, `lib/`, spot-check the oldest doc's claims against code.
   Model-tier and spend: `map/scanners.yaml` template, `map/record.mjs`, `map/lane.mjs`.
3. **Gates:** `.github/workflows/*.yml`, `.github/actions/tools/action.yml`,
   `tests/regression.mjs`, `tests/harness.mjs`, `tests/README.md`, `tests/golden.json`,
   a sample of `tests/blocks/` and `tests/negative/`, `lib/check-syntax.mjs`,
   `tsconfig.json`, `map/validate.mjs`, `lib/yaml-min.mjs`.
4. **Verification:** the 14 effect channels' code (above), `map/score.mjs`,
   `map/variance.mjs`, `tests/fixtures/README.md`, `tests/instruments/`, the opengrep
   control (`map/scanners/adapters/opengrep/control/CONTROL.md`), `routine/run.mjs`.
5. **Delegation:** the 14 channels' code, the 4 workflows and the routine template,
   `map/child-env.mjs`, `map/fresh-clone.mjs`, `map/tools.mjs`, the two lanes,
   `map/lane.mjs`, `SECURITY.md`.
6. **Improvement:** `CLAUDE.md` ("How a change lands"), `map/METHOD.md` (feedback hook),
   `map/SCHEMA.md` §5b, `map/backlog.mjs`, `tests/blocks/no-history-file.mjs`,
   `tests/golden.json`, `CONSUMERS.md`, `lib/release-notes.mjs`, `.github/PULL_REQUEST_TEMPLATE.md`.
7. **Multiplayer:** `assay.mjs`, `views/README.md`, `map/lane.mjs`, `owner/`, `CONSUMERS.md`,
   `routine/README.md`, the `--json` paths of each command.

Not read: `tests/sweeps/` and `tests/fixtures/*/map/` (blind rule), the opengrep taint
rule bodies beyond the enumerated lines, the 136 negative-run files beyond a sample.

## Proposed canon (a reviewed diff, not applied)

`canon/assay.yaml` would carry the 14 effect slugs and 2 AI surfaces above, the census
populations and rules in the census plan, and `credential_population` with the 4 secrets
and the rule stated under "Credentials". Scope: exhaustive by invocation boundary; the
view writers fold into one `views-compile` channel because they share the run-writer path
and reversibility.
