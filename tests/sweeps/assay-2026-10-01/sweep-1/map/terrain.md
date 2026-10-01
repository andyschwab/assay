---
type: doc
title: "Terrain — assay at c30912c (blind sweep 1)"
---
# Terrain — assay at c30912c

Pass 0 of `map/METHOD.md` over the target tree (a `git archive` of commit
c30912c, no `.git`, no history). Breadth only; the slices below are what the
seven passes read.

**Blind-run exclusions.** Per the sweep's own rules this pass did not open
`HISTORY.md`, anything under `tests/sweeps/`, or any `ANSWERS*` sheet under
`tests/fixtures/`. Their existence is known from a listing only; no finding
cites their content.

## The map

- **What it is.** A zero-dependency Node (>=20) command-line engine,
  `assay.mjs`, dispatching to ~40 `.mjs` scripts (about 16.5k lines of
  `.mjs`, of which `tests/regression.mjs` is 5,034). One devDependency set
  (TypeScript, `@types/node`) for `npm run typecheck`. 341 files.
- **Languages.** JavaScript (ESM `.mjs`) for all code; Markdown and YAML for
  contracts, the yardstick (`yardstick/requirements.yaml`, 826 lines), adapters,
  fixtures and templates.
- **Entry points.** `assay.mjs` (command dispatcher); `package.json` scripts:
  `test` (`tests/regression.mjs`), `lint` and `build` (both
  `lib/check-syntax.mjs`), `typecheck` (`tsc -p tsconfig.json`).
- **CI.** `.github/workflows/ci.yml`: push to main + pull_request, Node 20 and
  22, `npm ci`, lint, typecheck, build, pinned gitleaks install, `npm test`.
  Actions pinned to commit SHAs, `permissions: contents: read`.
- **Load-bearing directories.** `map/` (finding format, method, scanners,
  instruments, validator, projection, chains, variance, record/ingest/start),
  `map/scanners/` (contract + adapters), `yardstick/` (requirements, measure,
  ratchet, compare, packet), `views/` (intake, maintain, owner, since, compile)
  and `views/improve/` (report, handoff, axes, maturity, sequence), `owner/`
  (packet format, ask-owner prompt, evidence transcript format), `routine/`
  (GitHub Actions template + driver), `lib/` (yaml-min, run-layout, run-data,
  display, check-syntax), `tests/` (harness, negative fixtures, instrument
  fixtures, scored fixtures, sweep sets).
- **Docs surface.** `README.md` (front door), `CLAUDE.md` (agent contract),
  `CONTRIBUTING.md`, `RUNBOOK.md`, `SECURITY.md`, `HISTORY.md` (not read),
  `map/METHOD.md`, `map/SCHEMA.md`, `map/scanners/CONTRACT.md`,
  `map/scanners/CANDIDATES.md`, `map/canon/README.md`, `yardstick/README.md`,
  `views/README.md`, `routine/README.md`, `owner/PACKET.md`,
  `owner/ask-owner.md`, `owner/evidence/README.md`, `tests/fixtures/README.md`.
- **Agent-facing files.** `CLAUDE.md`; `map/METHOD.md` (frontmatter `type:
  skill`, the repo-eval scanner method an agent session executes);
  `owner/ask-owner.md` (a prompt an owner pastes into their own AI); the
  handoff plan prompts `views/improve/handoff.mjs` generates.
- **Canon.** `map/canon/` ships empty (README only). No canon for this target:
  the populations below are derived blind.

## Effect inventory (derived from `node assay.mjs enumerate`, then triaged)

`enumerate` returned **zero CHANNEL CANDIDATES**: assay has no in-code agent
tool table, no MCP toolset, no `bin/` beyond `assay.mjs`, and no LLM call site.
Its EFFECT CALL SITES hits (docker control, git push, mail send at
`map/enumerate.mjs:80,116-118,165`) are the detector's own regex patterns, not
effects: out of scope (self-reference). The invocable surface is therefore the
CLI commands and the routine workflow's steps. Channels, one per invocation
boundary, fixed slugs:

| slug | invocation | note |
|---|---|---|
| `fresh-clone-exec` | `assay fresh-clone`, `assay start --allow-exec` | runs the target's install, lifecycle scripts, build, lint, typecheck, test, migrate-dry on the evaluator's machine |
| `dependency-audit` | `assay dependency-scan`, `assay start` (default) | runs npm/pnpm/yarn audit from a scratch copy; sends the lockfile to the registry |
| `routine-target-exec` | `routine/run.mjs --target-steps` in the routine's `target` job | runs a pull request's own install and tests in CI |
| `routine-artifact-upload` | the routine's two `actions/upload-artifact` steps | publishes the handoff (1 day) and the run (90 days) as workflow artifacts |
| `baseline-write` | `assay ratchet --write-baseline` | writes a baseline file to disk; a steward commits it |
| `run-write` | `start`, `ingest`, `record`, `compile` | writes the run directory |

Out of scope, with reason: the gate job's base-branch `git fetch` (a read with
the job token), `ask-owner` (prints a prompt to stdout), every view/page writer
(folded into `run-write`), `validate`, `score`, `variance`, `enumerate`,
`measure` (read-only or local-only computation).

**AI surfaces (capabilities).** No LLM call site exists in code. Three
LLM-driven surfaces exist by design, outside the engine: the repo-eval agent
session that executes `map/METHOD.md`; the coding-agent session that executes a
handoff plan prompt; and the owner's own AI answering `owner/ask-owner.md`
(recorded under multiplayer, not as an engine capability).

## Closed populations

- **Container / agent classes:** the operator's local machine (`start`,
  instruments); the routine `target` job (executes the change); the routine
  `routine` gate job (never executes the change); the repo-eval agent session;
  the handoff-executing agent session. Each assessed separately.
- **Credentials:** `ASSAY_READ_TOKEN` (optional routine secret, commented out);
  the gate job's `github.token` as `FETCH_TOKEN`; the evaluator's own
  environment (stripped by `map/child-env.mjs`). Enumerate's other SECRETS hits
  are constant names (`*_KEYS`) or planted/illustrative values in tests and
  docs (`ASSAY_PLANTED_TOKEN`, `API_KEY`, `EMAIL_SEND_API_KEY`,
  `STRIPE_SECRET_KEY`): out of scope by `CLAUDE.md` rule 6.
- **Network-egress controls:** none at the network layer; the env allow-list
  and the scratch-copy audit are the controls; enumerate's iptables/URL-policy
  hits are detector patterns.
- **Interface contracts:** `map/validate.mjs`, `lib/yaml-min.mjs` (throws),
  `lib/run-data.mjs` checkers, `yardstick/packet.mjs` validator, adapter
  `default: FAIL`, ingest success sets.
- **Effect-vs-report paths:** `routine.yaml` gate record; instrument exit-code
  success sets; fresh-clone test counts; the routine handoff report.

## Slice plan

1. **Legibility** — README.md, CLAUDE.md, map/SCHEMA.md §3, routine/README.md,
   map/start.mjs (gitleaks rationale), map/scanners/CONTRACT.md §3a,
   CANDIDATES.md, yardstick/README.md, map/canon/README.md.
2. **Context** — CLAUDE.md, README.md layout, assay.mjs, lib/run-layout.mjs,
   tests/regression.mjs size, METHOD/SCHEMA length, SCHEMA §5 vs
   views/improve/handoff.mjs (freshness spot-check), scanners.yaml model/spend
   fields, map/variance.mjs.
3. **Gates** — .github/workflows/ci.yml, package.json, lib/check-syntax.mjs,
   tsconfig.json, tests/regression.mjs (negative fixtures, doctrine lockstep,
   ci-workflow block), tests/golden.json, map/validate.mjs, map/doctrine.mjs.
4. **Verification** — tests/fixtures/README.md, tests/golden.json,
   map/variance.mjs + the sweep gate block in the harness, map/start.mjs
   (ingest success sets, handoff), map/fresh-clone.mjs, routine/run.mjs
   (routine.yaml), routine/README.md, owner/evidence/README.md.
5. **Delegation** — map/child-env.mjs, map/fresh-clone.mjs, map/dependency-scan.mjs,
   map/start.mjs, routine/assay-routine.yml, routine/run.mjs, routine/README.md,
   yardstick/ratchet.mjs, map/record.mjs, views/improve/handoff.mjs, map/METHOD.md.
6. **Improvement** — CLAUDE.md, CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md,
   tests/regression.mjs (issue-cited blocks), map/backlog.mjs, SCHEMA §5b,
   METHOD feedback hook, routine.yaml record.
7. **Multiplayer** — views/README.md, lib/run-data.mjs, views/improve/handoff.mjs,
   owner/PACKET.md, owner/ask-owner.md, map/record.mjs lock, map/validate.mjs
   decisions rule, routine/README.md artifact visibility.

**Not read:** the bodies of `views/*.mjs` page renderers beyond the lines cited,
`yardstick/requirements.yaml` row by row, `map/repo-census.mjs` and
`map/ingest.mjs` beyond their headers, the fixture targets under `tests/`.
