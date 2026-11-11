---
type: doc
title: "assay: terrain (Pass 0) at 2b247c0"
---
# Terrain: assay at 2b247c014b1484d4e1b1512b49b32f708800d92c

Blind derivation. No prior run was read. `tests/sweeps/`, `tests/fixtures/*/map/` and every
`ANSWERS.yaml` were excluded from every listing and never opened. No canon exists for this
target: `map/canon/` holds only `README.md` ("This directory ships empty"), so the populations
below are derived blind and are proposed as the first canon (a reviewed diff, not made here).

## What it is

assay is a zero-dependency Node (>=22, ESM) command-line engine that evaluates other
repositories: it draws a map of findings (`map/`), measures it against a yardstick of
requirements (`yardstick/`), and writes four views plus Since (`views/`). It runs no server and
keeps no database (README.md:42). One dispatcher, `assay.mjs`, spawns 31 command scripts
(assay.mjs:18-58). The built-in judgment scanner (practice-review, `map/METHOD.md`) and the
peer code reviewer run in LLM sessions a person starts, seeded by `map/lane.mjs` from the lane
files under `map/scanners/adapters/*/lane.md`; the code itself calls no model.

## Size and languages

549 tracked files after the exclusions (~25k lines outside `tests/`). By extension: 228 `.mjs`,
144 `.yaml`, 86 `.md`, 37 `.json`, 11 `.yml`, 11 `.js`, 7 `.ts`, 5 `.sql`. `tests/` is 425 files
(161 harness blocks under `tests/blocks/`, 136 negative fixtures, 99 instrument inputs). Runtime
dependencies: none; devDependencies `typescript` and `@types/node` only (package.json:18).

## Build, test, lint, CI

- `npm test` = `node tests/regression.mjs` (fail-closed harness: blocks, negatives, golden scores).
- `npm run lint` and `npm run build` = `node lib/check-syntax.mjs`; `npm run typecheck` = `tsc`.
- CI: `.github/workflows/ci.yml` (push to main + every pull_request; Node 22 and 24 matrix;
  `contents: read`; actions pinned by SHA; installs the pinned tools via
  `.github/actions/tools`, then lint, typecheck, build, test).
- `release.yml` (workflow_dispatch only; gate, then `gh release create`),
  `tools-check.yml` (weekly cron; opens/comments an issue), `branch-cleanup.yml` (on push to the
  default branch; deletes merged branches).
- `routine/assay-routine.yml` is a template a stewarded repository copies; `routine/run.mjs` its driver.

## Load-bearing directories

| dir | role |
|---|---|
| `map/` | the map: start, ingest, record, validate, enumerate, chains, doctrine, census, instruments (fresh-clone, dependency-scan, structure-scan, repo-census), tools, migrate-run, lane, variance, score, backlog; METHOD.md + SCHEMA.md |
| `map/scanners/` | CONTRACT.md, INTAKE.md, CANDIDATES.md, one adapter per scanner (`adapters/*.yaml`), two lanes, vendored opengrep taint rules |
| `yardstick/` | requirements.yaml (59 requirements), measure, compare, ratchet, packet, README contract |
| `views/` | compile, intake, maintain, owner, since, severity, hotspot, floor-fleet; README data formats |
| `views/improve/` | report, handoff, axes, maturity, sequence, topics, glossary, templates |
| `lib/` | yaml-min (strict reader), run-layout, run-data, display, release-notes, check-syntax |
| `routine/` | run.mjs, the workflow template, README contract |
| `owner/` | PACKET.md, ask-owner, evidence transcript templates |
| `tests/` | regression.mjs, harness.mjs, blocks/, negative/, instruments/, enumerate-fixture/, sidecar-fixture/, fixtures/ (excluding their map/) |
| `.github/` | 4 workflows, the tools composite action, PR template |

## Docs surface

README.md (front door), CLAUDE.md (agent contract, 73 lines), CONTRIBUTING.md, SECURITY.md,
RUNBOOK.md, CONSUMERS.md, map/METHOD.md, map/SCHEMA.md, map/scanners/CONTRACT.md, INTAKE.md,
CANDIDATES.md, yardstick/README.md, views/README.md, routine/README.md, owner/PACKET.md,
owner/ask-owner.md, owner/evidence/README.md, tests/README.md, map/canon/README.md.

## Agent-facing files

CLAUDE.md; map/METHOD.md (frontmatter `type: skill`, the practice-review method); the two lane
seeds (`map/scanners/adapters/practice-review/lane.md`, `.../deep-code-review/lane.md`);
owner/ask-owner.md (owner prompt); `.github/PULL_REQUEST_TEMPLATE.md`. No `.claude/`, no
`.cursorrules`, no MCP config.

## Effect inventory (derived from the listing: enumerate.json + a write/exec/network grep of the non-test tree)

The candidate list is `map/raw/enumerate.json`: 1 channel candidate, 6 route handlers, 6
effect-site kinds (13 members). The route handlers are all inside `tests/enumerate-fixture/`
(planted inputs the enumerate tests read; assay serves nothing). The effect-site members
`docker control`, `git push`, `message/mail send` cite only the detector's own regex table
(map/enumerate.mjs:180-182, :85, :232); `http write` and most of `http write (js)` and
`shell exec` cite the vendored opengrep taint-rule YAML (sink patterns, data) and the opengrep
positive-control fixture. The real effects of those kinds are in code the listing did not flag
by that kind (fresh-clone's `shell: true` exec at map/fresh-clone.mjs:310; the tools download at
map/tools.mjs:125). The channels, one per invocation boundary (one command or one workflow job),
each with its fixed slug and its fixed delegation finding id:

| id | slug | invocation | what it does |
|---|---|---|---|
| F-401 | run-start | `assay start` (map/start.mjs) | makes a run dir, copies the target to scratch, runs the offline instruments' binaries, writes enumerate.json and scanners.yaml |
| F-402 | fresh-clone-exec | `assay fresh-clone` (map/fresh-clone.mjs) | clones the target and executes its install/build/lint/typecheck/test/migrate scripts through a shell |
| F-403 | dependency-scan-exec | `assay dependency-scan` | runs the target's package manager audit from scratch copies; reaches the registry |
| F-404 | structure-scan-exec | `assay structure-scan` | npm-installs jscpd/knip into scratch; knip loads the target's tool configs |
| F-405 | repo-census-report | `assay repo-census` | reads the checkout, writes its JSON report (`--out`) |
| F-406 | run-ingest | `assay ingest` | writes findings, raw archive, coverage sidecar into a run |
| F-407 | run-record | `assay record` | rewrites one row of map/scanners.yaml under a lock file |
| F-408 | run-migrate | `assay migrate-run --write` | renames files and rewrites flow lists in a stored run |
| F-409 | views-compile | `assay compile` and its sub-views (intake, maintain, owner, since, maturity --write, measure --write; report, handoff, axes, topics) | writes every view, the index and yardstick.yaml into the run; handoff removes and rewrites `handoff/` |
| F-410 | backlog-write | `assay backlog --write` | writes map/backlog.yaml |
| F-411 | ratchet-baseline-write | `assay ratchet` (write mode) | writes a baseline file |
| F-412 | tools-install | `assay tools install` | downloads pinned tool archives, checks sha256, writes executables into a bin dir |
| F-413 | routine-run | `assay routine` (routine/run.mjs) | verifies tools, draws the run, records, validates, compiles, ratchets; writes routine.yaml |
| F-414 | ci-release | release.yml | tags the default branch and publishes a GitHub release (person-dispatched) |
| F-415 | ci-branch-cleanup | branch-cleanup.yml | deletes merged branches on every push to the default branch |
| F-416 | ci-tools-pin-issue | tools-check.yml | weekly: opens or comments on a GitHub issue |
| F-417 | routine-artifact-upload | routine/assay-routine.yml (template, in the consumer's repo) | uploads the run directory as a workflow artifact readable by anyone who can read the repo's runs |

Read-only commands (no effect): validate, enumerate, project, toolchain, variance, score, roster,
yardstick, compare, validate-packet, ask-owner, lane (prints a seed), tools verify/check (reads
release metadata). A pass that finds an effect this table lacks records it with a new slug.
The delegation pass added one: F-424 `lane-artifact-publish` (the one private page each review
lane publishes), which the listing does not name; it is outside the candidate list, so the triage
does not carry it.

### Triage of the candidate list (written to map/effect-triage.yaml)

- `surface: migrate-run.mjs` → F-408.
- the six `route:` members → out of scope (test fixture, never served).
- `docker control`, `git push`, `message/mail send` → out of scope (detector regex table only; no such call in the tree).
- `http write` → out of scope (taint-rule sink patterns, data).
- `http write (js)` → F-412 (the one live outbound fetch, map/tools.mjs:125; the rest are rule patterns and a test).
- `shell exec` → F-402 (the tree's live shell exec is fresh-clone; the listed lines are rule patterns and the inert positive-control fixture).

## AI surfaces

In-code LLM call sites: **0** (grep for model clients finds none; map/start.mjs:307 and
routine/run.mjs:19 state the judgment scanners are never run by the code). The AI surface is
the review session a lane seeds (2 lanes: practice-review, deep-code-review); the delegation pass
records each as a `capability` finding (F-418 practice-review lane, F-419 deep-code-review lane)
with its trifecta legs read from the lane text.

## Container / agent classes

No container is launched by the code (`docker run/create site` members are regex lines in
map/enumerate.mjs). Execution classes: (a) the operator's local process; (b) the instrument
children (fresh-clone, dependency-scan, structure-scan) under the child-env allow-list
(map/child-env.mjs); (c) CI jobs (ci, release, tools-check, branch-cleanup plan/delete);
(d) the routine template's two jobs (target executes the change; routine never does); (e) the
LLM review session. Each is assessed separately.

## Credential population

Enumerated 21 secret-named candidates + 4 secret-named constants. Rule: a runtime credential is
a secret the shipped code, workflow or template reads at run time. Members (4): `GH_TOKEN`,
`GITHUB_TOKEN` (workflows), `ASSAY_READ_TOKEN`, `FETCH_TOKEN` (routine template / RUNBOOK).
Excluded: planted test strings and fixture names (`ADMIN_PASSWORD`, `API_KEY`,
`ASSAY_PLANTED_TOKEN`, `ASSAY_TEST_EVALUATOR_TOKEN`, `BACKUP_API_KEY`, `EMAIL_SEND_API_KEY`,
`LEGACY_API_KEY`, `SEARCH_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: tests/,
fixtures, or an example line in owner/ask-owner.md); key-name list constants
(`DECISION_KEYS`, `POINTER_*_KEYS`, `TOP_KEYS`, `TRIAGE_KEYS`); and the 4 secret-named constants.

## Census populations (census-augmented mode; one finding per member)

- **decision-reconstruction** (legibility, `artifact`): D1 zero-dependency strict YAML reader
  (lib/yaml-min.mjs); D2 ids carry no dimension meaning; D3 the routine's two jobs; D4 knip only
  under --allow-exec; D5 the child-env allow-list; D6 sha256-pinned tool installs; D7
  branch-cleanup on push, not a schedule; D8 no history file; D9 the core names no scanner;
  D10 release only by workflow_dispatch.
- **modules-standalone** (context, `artifact`): M1 map/ core, M2 map/scanners/, M3 yardstick/,
  M4 views/ (top), M5 views/improve/, M6 lib/, M7 routine/, M8 owner/, M9 tests/ harness.
- **gates-coverage** (gates, `contract`): every step of the one pull_request job in ci.yml
  (lint, typecheck, build, tools action, test) plus the release gate.
- **effect-provability** (verification, `control`): every channel F-401..F-417.
- **credential** (delegation, `control`): the 4 credential members above.
- **lessons-mechanized** (improvement, `process`): each CLAUDE.md rule (ground rules 1-7, the
  re-bless rule, red-then-green, engine learnings to issues, change record is git) and whether a
  mechanism holds it.
- **agent-access-surface** (multiplayer, `artifact`): I1 Intake, I2 Maintain, I3 Improve, I4
  Owner, I5 Since, I6 handoff/, I7 chains.json, I8 lane seeds, I9 enumerate --json, I10 project --json.

## Slice plan (what each pass reads; ids by offset)

| pass | ids | slice |
|---|---|---|
| 1 legibility | F-001+ | README.md, CLAUDE.md, map/SCHEMA.md §3/§8, routine/README.md, map/child-env.mjs, map/tools.mjs, branch-cleanup.yml, release.yml, lib/yaml-min.mjs, tests/blocks/no-history-file.mjs, core-names-no-scanner.mjs |
| 2 context | F-101+ | README.md, CLAUDE.md, each module's README/contract, assay.mjs, file sizes, cross-module imports, oldest-doc spot check |
| 3 gates | F-201+ | ci.yml, release.yml, package.json, tests/regression.mjs, harness.mjs, a sample of blocks, tests/negative, map/validate.mjs, lib/yaml-min.mjs, tsconfig.json |
| 4 verification | F-301+ | each effect channel's code, fixtures, opengrep positive control, map/variance.mjs, map/score.mjs, tests/golden.json |
| 5 delegation | F-401+ (F-401..F-419 fixed above; extra from F-420) | each channel's code, child-env.mjs, the workflows, the routine template, the lanes, SECURITY.md |
| 6 improvement | F-501+ | CLAUDE.md, CONTRIBUTING.md, tests/README.md, the blocks pinning each rule, lib/release-notes.mjs, CONSUMERS.md, map/backlog.mjs |
| 7 multiplayer | F-601+ | views/README.md, the view scripts, handoff.mjs, map/lane.mjs, routine/README.md, owner/ |

Not read: the large instrument implementations line by line (ingest.mjs, repo-census.mjs) beyond
the sites the passes cite; the negative fixtures' contents beyond a sample; anything under the
excluded paths.
