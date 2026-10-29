---
type: doc
title: "Axis walk (deep-code-review + repo-census)"
---
# Axis walk — tests/fixtures/fixtures-root

_No single safe-to-run verdict: one flat axis roster, each axis its own posture.
Severity is a property; the go/no-go is the reader's._

**Scanners:** deep-code-review, repo-census · skipped: dependency-scan (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); fresh-clone (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); gitleaks (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); repo-eval (fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval); structure-scan (fixture run: structure-scan was not executed over this public target) · **23 findings** · **severity:** 1 High · 14 Medium · 3 Low · 1 Nit · 4 unrated (the built-in scanner carries no severity).

**Start here** — the Critical & High across every axis:
- F-1000 _(High)_ [code-security] — targets/lockfiles/app resolves minimist 1.2.5. npm audit on a scratch install reports 1 critical (GHSA-xvch-5gv4-984h, affects 1.0.0 - 1.2.5… `package-lock.json:15`

**The roster** _(an axis no present scanner measures is "not measured", never "clean")_:
- `artifact-legibility` ← **(no present scanner measures this axis)** · fed by repo-census
- `context-economy` ← **(no present scanner measures this axis)** · fed by repo-census
- `deterministic-gates` ← **(no present scanner measures this axis)** · fed by deep-code-review, repo-census
- `verification` ← **(no present scanner measures this axis)** · fed by repo-census
- `improvement-loop` ← **(no present scanner measures this axis)** · fed by repo-census
- `code-correctness` ← deep-code-review
- `code-maintainability` ← deep-code-review
- `code-security` ← deep-code-review · fed by repo-census · **partially measured**
- _not measured this run:_ `artifact-legibility`, `context-economy`, `deterministic-gates`, `verification`, `delegation`, `improvement-loop`, `multiplayer` _(repo-eval skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval)_

## Artifact legibility — is the knowledge in reviewable artifacts?

_Measured by no present scanner; fed by repo-census._

> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by repo-census and are real, but they are not a measure of the axis.

**Requirements on this topic** _(0 met · 1 unmet · 0 mixed · 2 not measured · 0 not applicable)_:
- d-readme-true _(not-measured)_ — The README is true for this application, measured by running it, not by reading it
- d-decisions-reconstruct _(not-measured)_ — Non-obvious decisions reconstruct their rationale from the files alone
- d-architecture-page _(unmet)_ — One page shows the parts, the data flow, and the external services

**3 findings** — 0 held · 3 open · 0 facts.

**Risks open** _(severity-ranked)_:
- F-960 _(Medium)_ [repo-census] — No architecture page found (checked ARCHITECTURE.md, docs/ARCHITECTURE.md, docs/architecture.md, docs/architecture/*.md, and a README "Architecture" section) — nothing shows the parts, the data flow, and the external services. `:1`
- F-962 _(Medium)_ [repo-census] — No runbook found (checked RUNBOOK.md, docs/RUNBOOK.md, docs/runbook*.md, and a README/doc "Runbook" or "Operations" section). Presence of the words is what this decides; whether a procedure was ever run is a separate, sidecar claim. `:1`
- F-969 _(Medium)_ [repo-census] — No evidence transcript found for d-cost-alerts (checked ops/evidence/d-cost-alerts.md, docs/evidence/d-cost-alerts.md). `.:1`

_Posture: 3 open · 0 held · worst: F-960 Medium._

## Context economy — can a bounded context reach competence fast?

_Measured by no present scanner; fed by repo-census._

> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by repo-census and are real, but they are not a measure of the axis.

**Requirements on this topic** _(0 met · 0 unmet · 0 mixed · 2 not measured · 0 not applicable)_:
- d-model-call-telemetry _(not-measured)_ — Every model call emits a structured record with tier, spend, and outcome
- d-modules-standalone _(not-measured)_ — A bounded context can load one module alone with something to read and something to run

**1 findings** — 0 held · 1 open · 0 facts.

**Risks open** _(severity-ranked)_:
- F-965 _(Medium)_ [repo-census] — No evidence transcript found for d-rollback-exercised (checked ops/evidence/d-rollback-exercised.md, docs/evidence/d-rollback-exercised.md). `.:1`

_Posture: 1 open · 0 held · worst: F-965 Medium._

## Deterministic gates — what verifies a change cheaply and loudly?

_Measured by no present scanner; fed by deep-code-review, repo-census._

> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by deep-code-review, repo-census and are real, but they are not a measure of the axis.

**Requirements on this topic** _(1 met · 0 unmet · 0 mixed · 6 not measured · 0 not applicable)_:
- d-effects-gated _(not-measured)_ — Every irreversible or outward effect runs behind a gate that holds
- d-gates-fail-closed _(not-measured)_ — No gate is open when a dependency it needs is absent
- d-tests-execute-core _(not-measured)_ — Tests exist, run on a clean machine, and execute their core
- d-ci-gate-on-default-branch _(met)_ — A CI check on the default branch runs the gates and fails closed
- d-guards-bite _(not-measured)_ — Every shipped check carries a negative fixture that fails when the check is disabled
- d-lint-typecheck-gate _(not-measured)_ — Lint and typecheck gates exist and pass
- d-effect-sites-tested _(not-measured)_ — The code paths that produce effects are exercised by tests

**3 findings** — 2 held · 1 open · 0 facts.

**Properties to preserve** _(don't regress these)_:
- F-1010 — Seven exact-output assertions, including the type guard. CI runs them on push and on pull_request. Changing the separator in a scratch worktree made the suite exit 1. `slugify.test.mjs:7`
- F-963 — At least one workflow gates on pull_request or push to the default branch (main) and runs a test/lint/typecheck/build step, with no gate step failing open. Branch protection (whether this check is required to merge) is not visible from the … `ci.yml:1`

**Risks open** _(severity-ranked)_:
- F-967 _(Medium)_ [repo-census] — No evidence transcript found for d-smoke-on-deployed (checked ops/evidence/d-smoke-on-deployed.md, docs/evidence/d-smoke-on-deployed.md). `.:1`

_Posture: 1 open · 2 held · worst: F-967 Medium._

## Verification affordances — can a change demonstrate itself beyond pass/fail?

_Measured by no present scanner; fed by repo-census._

> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by repo-census and are real, but they are not a measure of the axis.

**Requirements on this topic** _(0 met · 0 unmet · 0 mixed · 8 not measured · 0 not applicable)_:
- d-effects-traced _(not-measured)_ — Every irreversible or outward effect leaves a durable record
- d-effects-provable _(not-measured)_ — Every effect can prove it happened, deterministically, from outside the AI
- d-contract-test-per-vendor _(not-measured)_ — Every external system reached has a recorded contract test against its sandbox
- d-change-carries-verification _(not-measured)_ — Every change lands with its own verification stated
- d-model-qualification _(not-measured)_ — Model and tier choices are recorded with rationale and re-qualified when models ship
- d-calibration-harness _(not-measured)_ — Any skill or rubric the application relies on is hardened by measurement, not assumed repeatable
- d-ai-feature-evals _(not-measured)_ — Shipped AI features carry evals for answer quality
- d-independent-review _(not-measured)_ — Non-trivial work is reviewed by a context that did not produce it before it merges

**1 findings** — 0 held · 1 open · 0 facts.

**Risks open** _(severity-ranked)_:
- F-968 _(Medium)_ [repo-census] — No evidence transcript found for d-monitoring-with-alert (checked ops/evidence/d-monitoring-with-alert.md, docs/evidence/d-monitoring-with-alert.md). `.:1`

_Posture: 1 open · 0 held · worst: F-968 Medium._

## Improvement loop — do corrections compound?

_Measured by no present scanner; fed by repo-census._

> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by repo-census and are real, but they are not a measure of the axis.

**Requirements on this topic** _(0 met · 1 unmet · 0 mixed · 1 not measured · 0 not applicable)_:
- d-agent-contract _(unmet)_ — An agent contract exists, is present-tense, and is the home for house rules
- d-corrections-become-mechanisms _(not-measured)_ — Recorded lessons become durable mechanisms rather than notes

**1 findings** — 0 held · 1 open · 0 facts.

**Risks open** _(severity-ranked)_:
- F-961 _(Medium)_ [repo-census] — No AGENTS.md or CLAUDE.md found. `:1`

_Posture: 1 open · 0 held · worst: F-961 Medium._

## Code correctness — does it compute the right thing, reliably?

_Measured by deep-code-review._

**Requirements on this topic** _(0 met · 0 unmet · 0 mixed · 1 not measured · 0 not applicable)_:
- d-one-home-per-fact _(not-measured)_ — Each fact the system relies on has one authoritative home, in docs and in code

**4 findings** — 1 held · 3 open · 0 facts.

**Properties to preserve** _(don't regress these)_:
- F-1011 — A non-string argument throws a TypeError instead of being coerced, and a test pins it. `index.mjs:18`

**Risks open** _(severity-ranked)_:
- F-1001 _(Medium)_ [deep-code-review] — ACCENTS has 16 entries and leaves out ì î ò ô õ ù û ý ÿ å ã æ ø ß. fold() maps any letter missing from it to a separator. Run at start_sha: 'Crème brûlée' gives 'creme-br-lee', "Côte d'Ivoire" gives 'c-te-d-ivoire', 'São Paulo' gives 's-o-p… `index.mjs:3`
- F-1002 _(Medium)_ [deep-code-review] — fold() returns a space for non-ASCII letters, and trim() then removes all of them. slugify('日本') and slugify('Привет') both return ''. The ADR says non-Latin scripts 'collapse to hyphens' and that slugs end up in URLs and primary keys. In f… `index.mjs:8`
- F-1006 _(Low)_ [deep-code-review] — ci.yml has no top-level permissions block, so GITHUB_TOKEN gets the repository default. That default may be write on push events in this public repo. No job sets timeout-minutes, and there is no concurrency group to cancel superseded runs. … `ci.yml:6`

_Posture: 3 open · 1 held · worst: F-1001 Medium._

## Code maintainability — can the next change land without fighting the code?

_Measured by deep-code-review._

**Requirements on this topic** _(0 met · 0 unmet · 0 mixed · 2 not measured · 0 not applicable)_:
- d-no-drifting-duplicates _(not-measured)_ — No block of code is carried in two copies that can drift apart
- d-no-dead-code _(not-measured)_ — No file, export, dependency or abandoned copy remains that nothing uses

**1 findings** — 0 held · 1 open · 0 facts.

**Risks open** _(severity-ranked; within a severity, the history was not read (a shallow or absent git history), so these rows are not ordered by change frequency)_:
- F-1009 _(Nit)_ [deep-code-review] — The comment on fold() says it returns '' when a character has no ASCII base. The code returns ' ', and the slug's separator collapsing depends on that space. `index.mjs:5`

_Posture: 1 open · 0 held · worst: F-1009 Nit._

## Code security — safe against a human adversary?

_Measured by deep-code-review; fed by repo-census._

> **Partially measured** — deep-code-review covered this axis partially: B partial (the only routes in the repo are the 5 in targets/flawed-webapp/server.mjs, reviewed in that target's own run and not re-probed (route census in the report lists them). Outside it: the CI workflow's trust surface (pull_request trigger, token permissions, third-party actions) was read in full, see F6 and F7; clean-lib has no network or untrusted-input sink beyond its string argument); N partial (the only runtime config file is targets/flawed-webapp/config/settings.mjs, reviewed in its own run and not opened here. Outside it: git grep -ciE 'process\.env|\.env|secret|apikey|api_key|token' gave 0 hits; CI uses no secrets; .gitignore read (ignores node_modules, logs, run outputs)); Q partial (personal data stores exist only in targets/flawed-webapp (data-store census in the report: user records with emails, notes, the token table, outbound mail and backup egress), reviewed in its own run; erasure through purgeAll is not re-assessed here. Outside it: git grep for email-shaped strings gave 0 hits; minimist is MIT; the public repo has no LICENSE (F9); git history holds no file absent at HEAD, so erasure from the tree is not undone by history). Findings below are real; absence of findings in the unscanned part is absence of looking.

**Requirements on this topic** _(0 met · 1 unmet · 0 mixed · 4 not measured · 0 not applicable)_:
- d-secrets-out-of-history _(not-measured)_ — No secret lives in the tree or its history, and every leaked key has been rotated
- d-routes-authorized _(not-measured)_ — Every route that touches data is behind server-side authorization
- d-tenant-isolation-in-data-layer _(not-measured)_ — Scoping is enforced in the data layer, not only in the UI
- d-dependencies-known-clean _(not-measured)_ — No known-critical dependency vulnerability is present
- d-personal-data-enumerated _(unmet)_ — Personal data held is enumerated, and nothing is stored the product never needed

**9 findings** — 1 held · 8 open · 0 facts.

**Properties to preserve** _(don't regress these)_:
- F-1012 — The app lockfile records a resolved URL and a sha512 integrity value. npm ci verified the hash on install. `package-lock.json:16`

**Risks open** _(severity-ranked)_:
- F-1000 _(High)_ [deep-code-review] — targets/lockfiles/app resolves minimist 1.2.5. npm audit on a scratch install reports 1 critical (GHSA-xvch-5gv4-984h, affects 1.0.0 - 1.2.5). Dependabot's fix PR #3 (to 1.2.6) was closed without merging, and CI runs no audit, so nothing bl… `package-lock.json:15`
- F-1003 _(Medium)_ [deep-code-review] — Both jobs set node-version '20'. Node 20 stopped getting security fixes on 2026-04-30, so the gate tests a runtime nobody supports. No package.json declares engines, so the supported range is not stated anywhere. This container runs Node 22… `ci.yml:17`
- F-1004 _(Medium)_ [deep-code-review] — targets/lockfiles/legacy/package-lock.json ends at line 8, inside the packages object. JSON.parse fails and npm ci exits 1 with EUSAGE. So the minimist 1.2.8 the manifest declares is never locked, and no scanner can confirm it. The README s… `package-lock.json:8`
- F-1005 _(Medium)_ [deep-code-review] — actions/checkout@v4 and actions/setup-node@v4 are each used twice. Whoever controls a tag can move it, so the code CI executes can change without any commit to this repository. No dependabot.yml or renovate config exists to keep SHA pins cu… `ci.yml:14`
- F-964 _(Medium)_ [repo-census] — No evidence transcript found for d-backup-restore-exercised (checked ops/evidence/d-backup-restore-exercised.md, docs/evidence/d-backup-restore-exercised.md). `.:1`
- F-966 _(Medium)_ [repo-census] — No evidence transcript found for d-deploy-one-command (checked ops/evidence/d-deploy-one-command.md, docs/evidence/d-deploy-one-command.md). `.:1`
- F-1007 _(Low)_ [deep-code-review] — The workflow runs two test scripts and nothing else. No linter or formatter is declared anywhere, nothing runs npm audit, and targets/lockfiles is in no job. So the F1 advisory and the F5 broken lockfile never turn CI red, and a green CI sa… `ci.yml:10`
- F-1008 _(Low)_ [deep-code-review] — The repository is public on GitHub, but git ls-files shows no LICENSE, COPYING or SECURITY file, and no package.json has a license field. With no licence, the default is all rights reserved: others cannot legally reuse the fixtures. `package.json:4`

_Posture: 8 open · 1 held · worst: F-1000 High._

## Custody

_No scanner measures `custody` as an axis; its requirements ride on the yardstick alone._

**Requirements on this topic** _(0 met · 0 unmet · 0 mixed · 2 not measured · 0 not applicable)_:
- d-accounts-enumerated _(not-measured)_ — Every account the application depends on is enumerated with an owner and a transfer path
- d-bus-factor _(not-measured)_ — More than one person can build, deploy, and recover the application

## Reproducibility

_No scanner measures `reproducibility` as an axis; its requirements ride on the yardstick alone._

**Requirements on this topic** _(0 met · 0 unmet · 1 mixed · 3 not measured · 0 not applicable)_:
- d-fresh-clone-runs _(not-measured)_ — It installs, builds, and runs from the README on a clean machine
- d-config-declared _(not-measured)_ — Configuration is declared once and nothing environment-specific is hardcoded
- d-dependencies-pinned _(mixed)_ — Dependencies and the toolchain are pinned, and CI actions by commit
- d-schema-versioned _(not-measured)_ — The schema is versioned and migrations replay from empty

## Operability

_No scanner measures `operability` as an axis; its requirements ride on the yardstick alone._

**Requirements on this topic** _(0 met · 7 unmet · 0 mixed · 8 not measured · 0 not applicable)_:
- d-backup-restore-exercised _(unmet)_ — Backups exist and a restore has been performed
- d-deploy-one-command _(unmet)_ — One documented command deploys, and what runs is what is committed
- d-rollback-exercised _(unmet)_ — A rollback path exists and has been exercised
- d-smoke-on-deployed _(unmet)_ — A smoke check proves the deployed application comes up and the main path works
- d-errors-reach-a-person _(not-measured)_ — Errors and logs reach somewhere a person looks
- d-monitoring-with-alert _(unmet)_ — Uptime or smoke monitoring exists with an alert route that has been tested
- d-cost-alerts _(unmet)_ — Cost alerts exist on every metered account from day one
- d-runbook _(unmet)_ — A one-page runbook covers restart, roll back, rotate a key, restore
- d-health-read _(not-measured)_ — One command reports the whole foundation green or red with a reason
- d-every-run-terminates _(not-measured)_ — Every automated run ends red or green with a reason, never hangs
- d-backlog-is-issues _(not-measured)_ — The backlog is the repository's issues, labelled by need-by, kind, and size, and the merge empties it
- d-foundation-asks-swept _(not-measured)_ — Asks of the platform owner are marked at the code site and swept before they go stale
- d-template-partition-synced _(not-measured)_ — The template-owned partition is declared, synced from the template, and guarded on both sides
- d-template-currency _(not-measured)_ — The application knows which template version it carries and when it is behind
- d-red-main-stops-work _(not-measured)_ — A red run on the default branch is the work now, before anything else merges

# Not measured this run

_Known axes whose measuring scanner did not run. Absence of findings there is
absence of looking, not health. The candidate roster for filling an axis is
`map/scanners/CANDIDATES.md` in the assay engine._

- **`artifact-legibility`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`context-economy`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`deterministic-gates`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`verification`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`delegation`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`improvement-loop`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).
- **`multiplayer`** — measured by repo-eval (skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval).

# Remediation spine (summary)

_Every actionable gap with a fix, grouped by axis then severity, quoting each scanner's
fix verbatim. Deduped across findings that share a fix. This is the human summary; the
machine-actionable version — with evidence paths and a proof step per fix — is `handoff/REMEDIATION.md`._

## artifact-legibility
**Medium:**
- F-960 [repo-census] — Add a page (ARCHITECTURE.md, docs/ARCHITECTURE.md, or a README "Architecture" section) that names every external service and data store the target depends on (database, queue, API,…
- F-962 [repo-census] — Add the missing procedure(s) to the runbook (RUNBOOK.md, docs/RUNBOOK.md, or a README/doc "Runbook"/"Operations" section) — a heading or paragraph for restart, roll back, rotate a …
- F-969 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-cost-alerts.md (or docs/evidence/d-cost-alerts.md) per owner/evidence/README.md — the required frontmatter keys, a bo…

## context-economy
**Medium:**
- F-965 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-rollback-exercised.md (or docs/evidence/d-rollback-exercised.md) per owner/evidence/README.md — the required frontmat…

## deterministic-gates
**Medium:**
- F-967 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-smoke-on-deployed.md (or docs/evidence/d-smoke-on-deployed.md) per owner/evidence/README.md — the required frontmatte…

## verification
**Medium:**
- F-968 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-monitoring-with-alert.md (or docs/evidence/d-monitoring-with-alert.md) per owner/evidence/README.md — the required fr…

## improvement-loop
**Medium:**
- F-961 [repo-census] — Make the agent contract (AGENTS.md or CLAUDE.md) present-tense: move any Status / History / Changelog / Todo / Backlog section and dated changelog lines to a separate, co-located h…

## code-correctness
**Medium:**
- F-1001 [deep-code-review] — Complete the table for the Latin-1 Supplement letters (à-ÿ, with ß to 'ss', æ to 'ae', ø to 'o', å to 'a'). This keeps the ADR's no-normalize decision. Add assertions for 'Crème br…
- F-1002 [deep-code-review] — Decide the contract and pin it with a test: either throw (or return null) when the slug would be empty, so callers must supply a fallback key, or document that '' is a possible res…
**Low:**
- F-1006 [deep-code-review] — Add a top-level 'permissions: contents: read', 'timeout-minutes: 5' on each job, and a concurrency group keyed on the workflow and ref with cancel-in-progress true.

## code-maintainability
**Nit:**
- F-1009 [deep-code-review] — Change the comment to "or a space (a separator) if it has none".

## code-security
**High:**
- F-1000 [deep-code-review] — If the fixture must keep the vulnerable pin, record the acceptance where a gate can read it (an audit allowlist entry scoped to this path, with an expiry). Otherwise bump to minimi…
**Medium:**
- F-1003 [deep-code-review] — Set node-version to a supported LTS (22 or 24), or read it from a committed .nvmrc. Add "engines": {"node": "&gt;=22"} to each target's package.json.
- F-1004 [deep-code-review] — Regenerate the lockfile with npm install --package-lock-only. If the truncation is the fixture's point, rename the file or mark it in .gitattributes so a tool reading it knows it i…
- F-1005 [deep-code-review] — Pin each action to a full 40-character commit SHA with the version as a trailing comment, and add .github/dependabot.yml with a github-actions ecosystem entry to bump the pins.
- F-964 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-backup-restore-exercised.md (or docs/evidence/d-backup-restore-exercised.md) per owner/evidence/README.md — the requi…
- F-966 [repo-census] — Commit a fresh, complete, passing transcript at ops/evidence/d-deploy-one-command.md (or docs/evidence/d-deploy-one-command.md) per owner/evidence/README.md — the required frontmat…
**Low:**
- F-1007 [deep-code-review] — Add a job that runs npm audit --audit-level=high in each target with a lockfile (the F1 acceptance goes in an allowlist), and a lint step (eslint or node --check) over targets/*/**…
- F-1008 [deep-code-review] — Add a root LICENSE (for example MIT) and a license field in each package.json, if reuse is intended.

