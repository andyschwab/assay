---
type: doc
title: "What is true of fixtures-root, 2026-10-29"
---

# What is true of fixtures-root, 2026-10-29

11 open, 1 met, 23 could-not-tell floor requirements of 35. The most pressing open group is about whether something destructive could happen unnoticed (safety).

## Fix in this order

### 1. Personal data held is enumerated, and nothing is stored the product never needed

What could happen: Without a written list of what personal information the app stores (names, emails, notes, locations), you cannot tell people what you hold about them, cannot delete it properly if asked, and are more likely to be keeping things you never actually needed.

Where: `targets/clean-lib/package.json:4`

What to do: Have your AI list every place personal data is stored in the app, and remove anything that is not actually used.

How to know it is fixed: a personal-data census over stores and schemas; the scanner's privacy domain clean

### 2. Backups exist and a restore has been performed

What could happen: If backups exist but nobody has ever restored from one, you do not actually know they work; the first time you find out is the day you need them and they fail.

Where: `.:1`

What to do: Take a backup, restore it into a throwaway copy of the app, confirm the data is really there, and write down what you did.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-backup-restore-exercised.md naming the backup, the scratch instance restored into, and the data check that verified it; whether the restore truly happened rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 3. Dependencies and the toolchain are pinned, and CI actions by commit

What could happen: If the exact versions of the tools and packages the app depends on are not locked, the app you test today may not be the app that actually gets built or deployed tomorrow; an update nobody chose can quietly change behavior.

Where: `targets/lockfiles/app/package-lock.json:15`, `targets/lockfiles/app/package.json:7`, `.github/workflows/ci.yml:17`, `.github/workflows/ci.yml:26`, `targets/lockfiles/legacy/package-lock.json:8`, `targets/lockfiles/legacy/package.json:7`, `.github/workflows/ci.yml:14`, `.github/workflows/ci.yml:15`, `.github/workflows/ci.yml:23`, `.github/workflows/ci.yml:24`, `.github/workflows/ci.yml:10`, `.github/workflows/ci.yml:18`, `targets/lockfiles/app/package-lock.json:16`, `targets/lockfiles/app/package-lock.json:17`

What to do: Have your AI confirm every dependency and the automated setup use pinned, exact versions rather than 'latest'.

How to know it is fixed: a lockfile honoured by CI, a toolchain version declared, actions pinned by SHA

### 4. One documented command deploys, and what runs is what is committed

What could happen: If deploying takes more than one documented step, or what gets deployed is not provably the same code that is committed, you cannot be sure the live app matches what you or anyone else reviewed.

Where: `.:1`

What to do: Have your AI write one documented command or button that deploys the app, and confirm the deployed version matches exactly what is committed.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-deploy-one-command.md naming the one deploy command and the deployed build's reported sha, which must equal the transcript's own commit (else a gap); whether the deploy truly ran rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 5. A rollback path exists and has been exercised

What could happen: If you have never actually gone back to a previous version, a bad release can leave the app broken for everyone with no proven way back, exactly when you are under the most pressure to fix it fast.

Where: `.:1`

What to do: Deploy a small change, then roll it back to the previous version using your documented process, and confirm the app still works afterward.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-rollback-exercised.md naming the from/to versions and the check run afterward; whether the rollback truly happened rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 6. A smoke check proves the deployed application comes up and the main path works

What could happen: If nothing actually checks that the live, deployed app comes up and its main feature works, a broken deploy can sit there unnoticed until a real user hits it.

Where: `.:1`

What to do: Set up a simple check that hits the live app after every deploy and confirms the main path works, and run it once now.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-smoke-on-deployed.md naming the environment and the check run against it; whether the smoke check truly ran rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 7. One page shows the parts, the data flow, and the external services

What could happen: Without one page showing what the app is made of and what outside services it talks to, a new person, or a new AI session, has to reverse-engineer that from scratch every time, and easily misses an outside service that matters.

Where: `./:1`

What to do: Have your AI write one page naming the app's parts, how data flows between them, and every outside service it depends on.

How to know it is fixed: the repo census, an architecture page present (root and per app in a monorepo) naming at least one external service or data store; a full match against every effect channel the inventory found stays a sidecar claim

### 8. An agent contract exists, is present-tense, and is the home for house rules

What could happen: Without one clear, current page of house rules for anyone, human or AI, working on the app, habits and decisions drift, and each new session or person re-guesses the rules instead of following them.

Where: `./:1`

What to do: Have your AI write one present-tense page stating the house rules for working on this app, and keep it current rather than a history log.

How to know it is fixed: the repo census, AGENTS.md or CLAUDE.md present (root and per app in a monorepo) with no status/history/changelog/todo/backlog heading and no dated changelog line; dated evidence it is used stays a sidecar claim

### 9. Uptime or smoke monitoring exists with an alert route that has been tested

What could happen: Without a check that watches whether the app is actually up, and an alert proven to reach a real person, the app can go down and stay down until a user happens to notice and tell you.

Where: `.:1`

What to do: Set up an uptime or health check with an alert to a person, then deliberately trigger it once and confirm the alert arrives.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-monitoring-with-alert.md naming the monitor and carrying the alert-fired and alert-received timestamps (received not before fired); whether the alert truly fired and was received rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 10. Cost alerts exist on every metered account from day one

What could happen: A hosting plan, database, or AI provider with no spending limit or alert means a bug, a loop, or someone else using a leaked key can run up a bill far larger than expected before anyone notices.

Where: `.:1`

What to do: On every account the app pays for, turn on a spending alert with a threshold and a recipient, today.

How to know it is fixed: the repo census, a fresh, complete, passing transcript at ops/evidence/d-cost-alerts.md listing at least one account, each naming the account, its threshold, and its recipient; whether the alerts truly exist in the billing console rests on the named person's attestation in version history, not on this check; the commit it names must resolve in the checkout's history, else a gap — a shallow checkout that cannot confirm this reads not-measured, never pass; with no deployment signal anywhere in the tree (map/scanners/CONTRACT.md §3d) the census records that it looked and found none, and the requirement reads not-applicable — never met

### 11. A one-page runbook covers restart, roll back, rotate a key, restore

What could happen: Without a written page covering how to restart the app, undo a bad release, replace a leaked key, and restore from backup, an outage becomes a from-scratch investigation instead of following steps that already exist.

Where: `./:1`

What to do: Have your AI write one page covering how to restart, roll back, replace a key, and restore from backup.

How to know it is fixed: the repo census, the runbook present with a heading or paragraph for restart, roll back, rotate a key/secret/credential, and restore from backup; each procedure having been run once stays the owner's evidence

## Could not tell

- **Every account the application depends on is enumerated with an owner and a transfer path?** claim-only: decided by the owner, never inferred from a run What would tell: the owner's packet (owner/ask-owner.md), one row per account (host, cloud, domain, data, mail, payments, model APIs, analytics, error tracking), each with an owner role and a transfer path
- **Every credential is enumerated and its boundary confirmed.** no census named credentials-below-boundary \| credential-boundary \| credential in map/censuses.yaml What would tell: the credential census, one row per secret, boundary traced not guessed
- **More than one person can build, deploy, and recover the application?** claim-only: decided by the owner, never inferred from a run What would tell: an author census from history plus one deploy and one restore from a second machine
- **No secret lives in the tree or its history, and every leaked key has been rotated.** gitleaks skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: gitleaks over the full history exits clean; each prior leak has a rotation recorded
- **Every route that touches data is behind server-side authorization.** deep-code-review B: category B partial: the only routes in the repo are the 5 in targets/flawed-webapp/server.mjs, reviewed in that target's own run and not re-probed (route census in the report lists them). Outside it: the CI workflow's trust surface (pull\_request trigger, token permissions, third-party actions) was read in full, see F6 and F7; clean-lib has no network or untrusted-input sink beyond its string argument What would tell: a route census where every data route names its check; the code scanner's application-security domain clean
- **Scoping is enforced in the data layer, not only in the UI.** deep-code-review T: category T not-applicable: no multi-tenant deployment outside flawed-webapp What would tell: every scoped table carries its policy; the scanner's multi-tenancy domain clean
- **No known-critical dependency vulnerability is present.** dependency-scan skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: dependency-scan (npm, pnpm or yarn audit over every lockfile in the tree) reports no critical advisory; a manifest with dependencies and no lockfile covering it, or a lockfile nothing audited (the audit failed, or its package manager was not on the runner), reads not-measured, never clean; no package.json anywhere in the tree reads not-applicable
- **Every irreversible or outward effect runs behind a gate that holds.** no effect findings in the base What would tell: the effect inventory shows zero halt-class effects without a gate that holds (doctrine.mjs); one authenticated person's own recorded act (gate_type initiated-by-person) holds, an unattended job doing the same write does not
- **Every irreversible or outward effect leaves a durable record.** no effect findings in the base What would tell: the effect inventory shows zero halt-class effects with no telemetry
- **No gate is open when a dependency it needs is absent.** no effect findings in the base What would tell: zero gated effects with fail_mode open or unterminated, each counted apart; a gate whose secret or tool is missing goes red, never green, and a gate check that never finishes is no verdict
- **No single AI context holds untrusted input, private data, and an outward effect at once.** no capability findings in the base (no AI surface enumerated) What would tell: no capability finding holds all three legs and reaches an effect with no gate that holds
- **It installs, builds, and runs from the README on a clean machine.** fresh-clone skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: the fresh-clone install and build steps both read passed from a clean checkout (map/fresh-clone.mjs), root and every workspace; an undeclared build reads unmet, the same as an undeclared lint or test gate — absence is not a pass
- **Configuration is declared once and nothing environment-specific is hardcoded.** deep-code-review N: category N partial: the only runtime config file is targets/flawed-webapp/config/settings.mjs, reviewed in its own run and not opened here. Outside it: git grep -ciE 'process\\.env\|\\.env\|secret\|apikey\|api\_key\|token' gave 0 hits; CI uses no secrets; .gitignore read (ignores node\_modules, logs, run outputs) What would tell: the env example is complete against the code's reads; the scanner's config domain clean
- **The schema is versioned and migrations replay from empty.** fresh-clone skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: the fresh-clone migrate step replays from an empty database on a clean checkout; with no database signal (file or dependency — Prisma, Knex, TypeORM, Supabase, Drizzle, a raw db/sql migrations folder, …) anywhere in the tree, fresh-clone records that it looked and found none, and the requirement reads not-applicable — never met, nothing was measured; a database signal with no migrate step declared reads unmet, never met
- **Tests exist, run on a clean machine, and execute their core.** fresh-clone skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: the fresh-clone test step reads passed, never merely not-declared, from a clean checkout; a suite that skips its core when a variable is unset is unmet
- **Lint and typecheck gates exist and pass.** fresh-clone skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib) What would tell: the fresh-clone lint and typecheck steps both read passed from a clean checkout; never the raw output
- **The code paths that produce effects are exercised by tests?** claim-only: decided by the owner, never inferred from a run What would tell: each effect channel's driver has a test that exercises the site where the effect is decided
- **The README is true for this application, measured by running it, not by reading it.** no census named doc-freshness in map/censuses.yaml What would tell: concrete doc claims replayed in the fresh-clone run
- **Non-obvious decisions reconstruct their rationale from the files alone.** no census named decision-reconstruction \| decision-rationale \| patch-rationale in map/censuses.yaml What would tell: the decision census, n decisions frozen before assessment
- **A bounded context can load one module alone with something to read and something to run.** no census named modules-standalone \| module-standalone \| module-loadability \| control-plane-modules-standalone in map/censuses.yaml What would tell: the module census
- **No block of code is carried in two copies that can drift apart.** structure-scan skipped: fixture run: structure-scan was not executed over this public target What would tell: structure-scan ran its duplication pass and found no clone pair of 50 tokens or more; a pass that was skipped or failed reads not-measured with its reason, never met
- **No file, export, dependency or abandoned copy remains that nothing uses.** structure-scan skipped: fixture run: structure-scan was not executed over this public target What would tell: structure-scan ran its unused-code pass and found no unused dependency, and no unused file, export, type or member where the target carries a knip configuration naming its entry points (without one, knip cannot see a module reached by path, so those rows stay in the map flagged unconfigured and never decide this), and its tree pass found no tracked file named as abandoned; an unused-code pass that was skipped or failed reads not-measured with its reason, and a tree with no package.json reads not-applicable, unless a stale file was found
- **Errors and logs reach somewhere a person looks.** deep-code-review M: category M partial: the only service code that would log is targets/flawed-webapp, reviewed in its own run. Outside it: one console.log in the clean-lib test (targets/clean-lib/test/slugify.test.mjs:15), appropriate for a test; CI has no failure notification beyond GitHub's default; nothing unattended runs outside flawed-webapp What would tell: an error sink configured and one induced error observed arriving

## Holds

- **A CI check on the default branch runs the gates and fails closed.** repo-census ran and reported no ci-gate rows (1 strength row(s))

## Beyond the floor

_The same measurement, for the 22 requirements beyond the floor — what a steward's routines watch, and the AI-operating layer._

### Open

_Nothing open._

### Could not tell

- **Ingested content is stored verbatim, rendered escaped, and never acted on as instructions** — claim-only: decided by the owner, never inferred from a run What would tell: every table holding outside text carries its provenance trio; no code path executes a directive read from content
- **Every channel through which an AI surface produces effects is enumerated in a declared canon** — claim-only: decided by the owner, never inferred from a run What would tell: a canon file names the channels, AI surfaces, and census subject types; the run reads it rather than re-deriving
- **AI involvement is disclosed to the audience's norms, structurally where the audience requires it** — claim-only: decided by the owner, never inferred from a run What would tell: each outward channel names its disclosure mechanism or records why none is needed
- **Every shipped check carries a negative fixture that fails when the check is disabled** — claim-only: decided by the owner, never inferred from a run What would tell: the self-test flips red when any one check is weakened
- **Every effect can prove it happened, deterministically, from outside the AI** — no effect findings in the base What would tell: effects with a structured or audited record, of all effects
- **Every external system reached has a recorded contract test against its sandbox** — claim-only: decided by the owner, never inferred from a run What would tell: one contract test per vendor; the null adapter every spec runs on
- **Every change lands with its own verification stated** — claim-only: decided by the owner, never inferred from a run What would tell: the PR template's verification section is mandatory and CI refuses an empty one
- **Every model call emits a structured record with tier, spend, and outcome** — claim-only: decided by the owner, never inferred from a run What would tell: one record per call in a machine-readable sink; spend metered per work class
- **Model and tier choices are recorded with rationale and re-qualified when models ship** — claim-only: decided by the owner, never inferred from a run What would tell: a qualification record per model in use, dated, with the re-qualification trigger named
- **Any skill or rubric the application relies on is hardened by measurement, not assumed repeatable** — claim-only: decided by the owner, never inferred from a run What would tell: a frozen input run blind n times with the divergence disposed into named classes
- **Shipped AI features carry evals for answer quality** — claim-only: decided by the owner, never inferred from a run What would tell: an eval config present and run in CI for each AI feature; a dynamic scanner is the eventual instrument
- **Non-trivial work is reviewed by a context that did not produce it before it merges** — claim-only: decided by the owner, never inferred from a run What would tell: the review step present in the contract and evidenced on merged PRs
- **Each fact the system relies on has one authoritative home, in docs and in code** — claim-only: decided by the owner, never inferred from a run What would tell: a docs guard refuses a second account of a list; in code, one store per remembered fact (a duplicated block of code is d-no-drifting-duplicates, which structure-scan decides)
- **Every capability is reachable by an agent through an API or format contract, not only a human UI** — no census named agent-access-surface \| agent-consumable-surface in map/censuses.yaml What would tell: the interface census, interfaces consumable by an agent of all interfaces
- **Recorded lessons become durable mechanisms rather than notes** — no census named incidents-became-mechanisms \| incident-lesson \| lessons-mechanized in map/censuses.yaml What would tell: the incident census, lessons that became a mechanism of lessons recorded
- **One command reports the whole foundation green or red with a reason** — claim-only: decided by the owner, never inferred from a run What would tell: the doctor script, same output shape on every application
- **Every automated run ends red or green with a reason, never hangs** — claim-only: decided by the owner, never inferred from a run What would tell: every job declares a timeout; a stall is a red check in minutes
- **The backlog is the repository's issues, labelled by need-by, kind, and size, and the merge empties it** — claim-only: decided by the owner, never inferred from a run What would tell: no list file carries rows; every PR closes the issues it finishes; the label set is the shared one
- **Asks of the platform owner are marked at the code site and swept before they go stale** — claim-only: decided by the owner, never inferred from a run What would tell: the marker sweep runs with a staleness threshold and goes red past it
- **The template-owned partition is declared, synced from the template, and guarded on both sides** — claim-only: decided by the owner, never inferred from a run What would tell: the sync manifest present; the guard test red on a template-owned file edited locally
- **The application knows which template version it carries and when it is behind** — claim-only: decided by the owner, never inferred from a run What would tell: a template commit stamp, a sync check that exits non-zero on drift, a currency line in the health read
- **A red run on the default branch is the work now, before anything else merges** — claim-only: decided by the owner, never inferred from a run What would tell: the contract states it; the default branch's latest runs are green at every merge

### Holds

_Nothing met yet._

## What was not looked at

- **dependency-scan** — skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)
- **fresh-clone** — skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)
- **gitleaks** — skipped: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)
- **repo-eval** — skipped: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval
- **structure-scan** — skipped: fixture run: structure-scan was not executed over this public target

---
_assay evaluation engine. Run `fixtures-root`._
