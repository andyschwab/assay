---
type: doc
title: "Terrain: assay at c30912c (blind sweep 3)"
---
# Terrain — assay at c30912c

Target: this repository as a tree (`git archive` of c30912c), not a checkout. Every
evidence path below is relative to the target's root. No canon exists for this target
(`map/canon/README.md:21` says the directory ships empty), so the populations below are
derived blind, from `node assay.mjs enumerate` plus the enumeration rules, with no prior
run in context.

**Blind-sweep exclusions (not read):** `HISTORY.md`, `tests/sweeps/` (every set) and every
`tests/fixtures/*/ANSWERS*`. Findings that would need HISTORY.md content cite the files
that point to it instead.

## Map

- **Size:** 341 files; ~16.5k lines of `.mjs` engine code plus a 5,034-line regression
  harness (`tests/regression.mjs`). 248 of the files are under `tests/` (fixtures,
  negative fixtures, instrument samples).
- **Languages:** JavaScript ES modules (`.mjs`, Node >= 20, zero runtime dependencies),
  YAML (requirements, adapters, findings), Markdown (contracts). TypeScript is a dev-only
  dependency used for `checkJs` (`tsconfig.json`).
- **Entry points:** `assay.mjs` (one dispatcher over every command); `package.json`
  scripts `test`, `lint`, `typecheck`, `build`.
- **CI:** `.github/workflows/ci.yml` — Node 20 and 22 matrix: `npm ci`, lint (node
  --check), typecheck (tsc), build, pinned+checksummed gitleaks install, `npm test`.
- **Load-bearing dirs:** `map/` (method, schema, validator, instruments, ingest,
  projection), `map/scanners/` (contract + adapters), `yardstick/` (requirements +
  measurement + ratchet + packet), `views/` and `views/improve/` (the five views,
  report, handoff), `owner/` (packet format, ask-owner prompt, evidence format),
  `routine/` (GitHub Actions template + driver), `lib/` (yaml reader, run layout),
  `tests/` (harness, negative fixtures, instrument fixtures, scored fixtures).
- **Docs surface:** `README.md` (front door), `CLAUDE.md` (agent contract),
  `CONTRIBUTING.md`, `SECURITY.md`, `RUNBOOK.md`, `map/METHOD.md`, `map/SCHEMA.md`,
  `map/scanners/CONTRACT.md`, `map/scanners/CANDIDATES.md`, `yardstick/README.md`,
  `views/README.md`, `routine/README.md`, `owner/PACKET.md`, `owner/evidence/README.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `HISTORY.md` (not read).
- **Agent-facing files:** `CLAUDE.md`; `map/METHOD.md` (a skill with frontmatter, the
  repo-eval method an agent session runs); `owner/ask-owner.md` (a prompt an owner pastes
  into their own AI); the compiled `handoff/plan/NN-*.md` session prompts
  (`views/improve/handoff.mjs`).

## Effect inventory (fixed slugs)

`enumerate` returned **0 CHANNEL CANDIDATES** (no `bin/` CLIs, skills or tool tables it
detects). The invocable surface is therefore the `assay.mjs` command table
(`assay.mjs:18-46`) plus the routine's two CI jobs. Each command that writes or reaches
outside is a channel; read-only commands are out of scope below.

| slug | what | evidence |
|---|---|---|
| `fresh-clone-exec` | `assay fresh-clone` runs the target's install (lifecycle scripts), build, lint, typecheck, test, migrate scripts on the evaluator's machine | `map/fresh-clone.mjs:388-390` |
| `dependency-audit` | `assay dependency-scan` runs npm/pnpm/yarn audit against the registry from a scratch copy of each lockfile + package.json | `map/dependency-scan.mjs:84-92`, `:232`, `:355` |
| `gitleaks-scan` | start/routine run the gitleaks binary over the target's history | `map/start.mjs:116-146` |
| `repo-census-scan` | `assay repo-census` reads the tree and runs read-only git commands | `map/repo-census.mjs:609`, `:968` |
| `run-start` | `assay start` creates a run directory and its record | `map/start.mjs:250-309` |
| `scanner-ingest` | `assay ingest` writes a scanner's rows + flips its manifest row | `map/ingest.mjs` |
| `scanner-record` | `assay record` sets one manifest row under a lock | `map/record.mjs:116` |
| `package-compile` | `assay compile` (and the single-view commands) write views, index and handoff into the run | `views/compile.mjs:68-72` |
| `baseline-write` | `assay ratchet --write-baseline` writes or overwrites a baseline file | `yardstick/ratchet.mjs:290` |
| `routine-target-exec` | routine CI job `target` runs the stewarded repo's own install/tests | `routine/assay-routine.yml:47-81` |
| `run-artifact-upload` | routine CI job `routine` uploads the whole run as a 90-day artifact | `routine/assay-routine.yml:188-195` |

**Out of scope (read-only or print-only):** `validate`, `enumerate`, `score`, `variance`,
`validate-packet`, `ratchet` without `--write-baseline` (exit code only), `ask-owner`
(prints a prompt to stdout; the owner pastes it elsewhere), the base-branch `git fetch`
in the routine (a read with the job token). `maturity --write`, `backlog --write` and
`measure --write` write generated files into the run with the same reach as
`package-compile` and are counted under it.

**AI surfaces (capabilities):** the engine has no LLM call site in code (no model SDK or
HTTP client in any `.mjs`). Two documented agent contexts consume engine text:
the repo-eval session that `map/METHOD.md` drives over a target, and the session a
`handoff/plan/NN-*.md` prompt is pasted into.

## Populations (closed lists)

- **Container / agent classes:** evaluator's own machine (start / CLI); routine `target`
  job (executes the change); routine `routine` job (gate, never executes the change);
  repo-eval agent session; handoff-plan agent session.
- **Credentials:** `ASSAY_READ_TOKEN` (optional secret, commented out in the template),
  the job's `github.token` passed as `FETCH_TOKEN` in one step; the evaluator's own
  environment (dropped by `map/child-env.mjs`). Every other enumerate hit is a planted
  test string or a constant name (`*_KEYS`).
- **Network-egress controls:** none enforced in code; `child-env` drops proxy and token
  variables only. The enumerate hits for iptables / URL policy are detector patterns in
  `map/enumerate.mjs`, not controls.
- **Interface contracts:** `map/validate.mjs` (finding schema), `yardstick/packet.mjs`
  (packet), `lib/run-data.mjs` (chains.json / sequence.json), the adapter format
  (`map/project.mjs`), the run manifest.
- **Effect-vs-report paths:** instrument exit-code → ingest success sets; fresh-clone test
  counts; routine.yaml written on every path.

## Slice plan

1. Legibility: `CLAUDE.md`, `README.md`, `map/SCHEMA.md` §2-§3, `map/scanners/CONTRACT.md`
   §3a, `map/start.mjs`, `routine/assay-routine.yml`, `tests/regression.mjs` comment refs.
2. Context: `README.md`, `CLAUDE.md`, `map/METHOD.md` size/structure, `tests/regression.mjs`
   size, `assay.mjs`, `map/scanners.yaml` model fields (`map/record.mjs`).
3. Gates: `.github/workflows/ci.yml`, `package.json`, `lib/check-syntax.mjs`,
   `tests/regression.mjs` (negative fixtures, golden), `map/validate.mjs`, `tsconfig.json`.
4. Verification: `tests/regression.mjs` (scored fixtures, sweep gate code — not the set),
   `map/variance.mjs`, `map/score.mjs`, `map/start.mjs` ingest path, `routine/README.md`.
5. Delegation: `map/fresh-clone.mjs`, `map/dependency-scan.mjs`, `map/child-env.mjs`,
   `map/start.mjs`, `routine/assay-routine.yml`, `views/improve/handoff.mjs`, `yardstick/ratchet.mjs`.
6. Improvement: `CLAUDE.md`, `CONTRIBUTING.md`, `map/METHOD.md` feedback hook, `map/backlog.mjs`,
   `.github/PULL_REQUEST_TEMPLATE.md`, `map/record.mjs`.
7. Multiplayer: `views/README.md`, `lib/run-data.mjs`, `map/decisions.mjs`, `owner/PACKET.md`,
   `routine/README.md`, `views/improve/handoff.mjs`.

Not read: the scored fixture targets' contents beyond names, the six `owner/evidence/*.md`
formats beyond their names, `map/scanners/CANDIDATES.md` in depth.
