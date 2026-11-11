---
confidential: true
type: doc
title: "flawed-webapp (notesbox) — Pass 0 terrain"
---
# Pass 0 — Terrain: targets/flawed-webapp (notesbox)

## Checkout

- Repository: `andyschwab/assay-fixtures`, reviewed subtree `targets/flawed-webapp/` only.
- Head: `7f7c89d823153c702c207b1f36c6c2ce26217ceb` (detached; contained in `origin/main`),
  commit date 2026-10-30T15:12:42-06:00. Clone is shallow (bounded fetch, depth 3000).
- Method read at engine `4b81665` (`map/METHOD.md`, `map/SCHEMA.md`).
- Evidence paths in every pass are repo-relative to the checkout root
  (`targets/flawed-webapp/...`). Nothing outside `targets/flawed-webapp/` is evidence;
  the fixture repository's own `.github/workflows/` and sibling targets are out of scope.
  `ANSWERS.yaml` was not opened.

## Canon

No canon exists for this target: the engine's `map/canon/` holds only its README at
4b81665. The population below is therefore **derived blind** (no prior run in context),
from a full `git ls-files` listing plus the invocation-boundary rule. `enumerate` was not
run (this lane executes nothing); because the target is 12 files / 281 lines, every file
was read and the listing below is the complete population, not a sample. A proposed canon
is at the end of this file, as a diff for review.

## Map

- **Languages:** JavaScript (ES modules, `.mjs`) 9 files / 217 lines; Markdown 2 files
  (README, one ADR); `package.json`. Zero dependencies (`targets/flawed-webapp/package.json:1-9`),
  Node `http` only (`targets/flawed-webapp/server.mjs:1-3`).
- **Rough size:** 12 tracked files, 281 lines.
- **Build / test / lint / CI:** one script, `start` (`targets/flawed-webapp/package.json:6-8`).
  No `test` script, no lint, no typecheck config, no CI inside the target. README claims
  `npm run test:all` and full endpoint coverage (`targets/flawed-webapp/README.md:29-35`);
  the only test file is `targets/flawed-webapp/test/smoke.mjs` (one assertion, line 9).
- **Directory topology (all load-bearing dirs):**
  - `server.mjs` — HTTP router; all five routes (`server.mjs:26-57`).
  - `lib/` — `auth.mjs` (bearer→user, fallback identity), `db.mjs` (in-memory users,
    notes, token table, purge), `agent.mjs` (AI assistant + tool directive),
    `mailer.mjs` (log-only mail transport), `sync.mjs` (backup push).
  - `routes/admin.mjs` — purge handler behind `requireAdmin`.
  - `config/settings.mjs` — port, backup URL, a literal backup API key, mail-from, admins.
  - `docs/adr/` — `0001-storage-choice.md`.
  - `test/` — `smoke.mjs`.
- **Docs surface:** `README.md` (purpose, endpoints, run, test), one ADR. No CONTRIBUTING,
  no architecture doc beyond the ADR.
- **Agent-facing files:** none (no CLAUDE.md / AGENTS.md / .cursorrules / skills / agent
  configs). The only prompt is in code: `targets/flawed-webapp/lib/agent.mjs:16-20`.

## Populations (closed lists; each pass assesses every member)

### HTTP route handlers (5)

| route | handler | evidence |
|---|---|---|
| `GET /notes` | inline, owner-filtered read | `targets/flawed-webapp/server.mjs:30-33` |
| `POST /notes` | inline, `notes.set` | `targets/flawed-webapp/server.mjs:35-40` |
| `POST /assistant` | `ask()` | `targets/flawed-webapp/server.mjs:42-45` |
| `POST /sync` | `pushBackup()` | `targets/flawed-webapp/server.mjs:47-50` |
| `POST /admin/purge` | `handlePurge()` | `targets/flawed-webapp/server.mjs:52-54` |

Every route runs after `authenticate(req)` (`server.mjs:27`), which never fails: an unknown
or missing token returns a default identity with `role: 'admin'`
(`targets/flawed-webapp/lib/auth.mjs:9-12`). README lists 4 endpoints
(`README.md:14-19`); the router has 5 (purge undocumented in README; its handler comment
says `DELETE` while the router matches `POST`, `routes/admin.mjs:5` vs `server.mjs:52`).

### Effect channels (CHANNEL CANDIDATES, derived from the listing)

No CLI, no skill, no `name`+`input_schema` tool table, no MCP toolset. The invocable surface
is the route + effect-lib topology, plus one text-protocol tool directive the model can emit
(`TOOL:send_email`, `lib/agent.mjs:18,35`). Fixed slugs (draw these verbatim):

| slug | what | invocation boundary | evidence |
|---|---|---|---|
| `note-create` | write a note into the in-memory store | `POST /notes` | `targets/flawed-webapp/server.mjs:35-40` |
| `email-send` | send an email whose body is every note in the workspace, to a model-chosen address | `TOOL:send_email` directive parsed in `ask()` → `sendEmail` | `targets/flawed-webapp/lib/agent.mjs:35-39`, `targets/flawed-webapp/lib/mailer.mjs:5-8` |
| `backup-push` | POST the full note set, with a bearer key, to the backup service | `POST /sync` → `pushBackup()` | `targets/flawed-webapp/server.mjs:47-50`, `targets/flawed-webapp/lib/sync.mjs:5-13` |
| `workspace-purge` | clear every note and every user's note list | `POST /admin/purge` → `purgeAll()` | `targets/flawed-webapp/routes/admin.mjs:6-10`, `targets/flawed-webapp/lib/db.mjs:27-31` |

Out of scope as effects (triaged, read-only): `GET /notes` (owner-filtered read,
`server.mjs:30-33`); the model call (a local stub, no network, `lib/agent.mjs:27-31`) —
it is the AI surface below, not an effect; `server.listen` (`server.mjs:59-61`).

### AI surfaces (capabilities = LLM call sites) (1)

| name | evidence | untrusted_input | private_data | external_effect |
|---|---|---|---|---|
| `assistant` | `targets/flawed-webapp/lib/agent.mjs:11-42` | true — the user's question plus every note body, which any caller (including the fallback identity) can write | true — every note of every user, labeled with owner email (`agent.mjs:12-15`) | write — the parsed `TOOL:send_email` reaches `email-send` (`agent.mjs:35-39`) |

### Container / agent classes (1)

One process, one principal class: the HTTP server (`server.mjs:26`). No container, cron,
webhook or admin-process class exists in the target. The admin role is a field on a user
record, not a separate process (`lib/db.mjs:5`, `lib/auth.mjs:12`).

### Credentials / secrets (2)

| item | shape | where | read from env? |
|---|---|---|---|
| `backup-api-key` | vendor-prefixed token-shaped string literal (about 40 chars), used as a Bearer credential | `targets/flawed-webapp/config/settings.mjs:5-6`, used at `targets/flawed-webapp/lib/sync.mjs:10` | no — literal in source, with a TODO to move it |
| `session-token-table` | three static bearer tokens mapped to user ids | `targets/flawed-webapp/lib/db.mjs:13-17` | no — literal in source |

Value is never reproduced in any run file.

### Network-egress controls (0)

None in the target: `fetch(settings.backupUrl, …)` (`lib/sync.mjs:8`) has no allowlist or
policy; the mailer is log-only (`lib/mailer.mjs:6-7`).

### Interface contracts (2)

- The storage interface named by ADR-0001 (`lookup`, the `notes` map surface, `purgeAll`)
  (`docs/adr/0001-storage-choice.md:14-17`; implemented `lib/db.mjs:19-31`). No test pins it.
- Request bodies: `readBody` swallows a JSON parse error into `{}`
  (`server.mjs:11-19`); no schema validation on any route.

### Delivery / effect-vs-report paths (3)

- `pushBackup` returns `{ ok: true }` without awaiting the fetch; failures swallowed
  (`lib/sync.mjs:8-13`).
- `sendEmail` returns `{ sent: true }` from a log-only transport (`lib/mailer.mjs:5-8`);
  `ask()` reports `emailed: to` (`lib/agent.mjs:40`).
- `purgeAll` returns `{ purged: true }` synchronously after clearing (`lib/db.mjs:27-31`).

### Census populations (proposed rules)

| census | subject_type | rule | members |
|---|---|---|---|
| `decision-reconstruction` | artifact | every non-obvious design choice visible in code or docs: the ADR plus each in-code choice a newcomer would ask "why?" about | ADR-0001 storage; auth fallback-to-admin; log-only mailer; fire-and-forget backup; literal API key; text-protocol tool directive |
| `modules-standalone` | artifact | every source module under `lib/`, `routes/`, `config/` plus `server.mjs` | 8 modules |
| `doc-freshness` | artifact | every claim in README.md checkable against code | endpoint count/list; run command; test command; coverage claim |
| `effect-provability` | control | every effect channel above | 4 |
| `gates-coverage` | contract | every route handler plus the storage interface | 5 routes + 1 interface |
| `credential` | control | every credential in the credential table above | 2 |
| `incidents-became-mechanisms` | process | every recorded incident or lesson under the target | 0 found (no incident log, no CHANGELOG, no agent spec) |
| `agent-access-surface` | artifact | every capability × whether an agent can consume it | 5 routes + assistant |

## Slice plan

The target is small enough that no sampling is needed: **every pass reads all 12 files.**
Emphasis per pass:

1. Legibility — `docs/adr/0001-storage-choice.md`, `README.md`, the code comments in
   `lib/auth.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `config/settings.mjs`, `lib/agent.mjs`.
2. Context — `README.md` against `server.mjs` and `package.json`; module boundaries across
   `lib/`, `routes/`, `config/`; model-tier/spend (`lib/agent.mjs`).
3. Gates — `package.json`, `test/smoke.mjs`, `server.mjs` (body parsing), `lib/auth.mjs`,
   `routes/admin.mjs`.
4. Verification — `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs:33-42`, `test/smoke.mjs`.
5. Delegation — all four channels, the assistant capability, `lib/auth.mjs`,
   `config/settings.mjs`, `lib/db.mjs`.
6. Improvement — `README.md`, ADR, TODO markers (`config/settings.mjs:5`), absence of agent
   spec / lesson log / telemetry.
7. Multiplayer — routes as the agent surface, `lib/db.mjs` (shared vs per-user state),
   `lib/agent.mjs` (cross-user reads), `lib/auth.mjs` (who acts as whom).

Not read: anything outside `targets/flawed-webapp/` (out of scope by the engagement).

## Proposed canon (reviewed diff; not ratified)

```yaml
target: andyschwab/assay-fixtures#targets/flawed-webapp
canon_version: 1
ratified: "unratified — proposed by a blind run 2026-11-11; exhaustive scope"
derived_from: "full file listing + the enumeration rules; blind (no prior run read)"
effect_channels:
  - slug: note-create
    what: POST /notes writes a note
    evidence: [targets/flawed-webapp/server.mjs:35]
  - slug: email-send
    what: model-emitted TOOL:send_email sends all notes to an address
    evidence: [targets/flawed-webapp/lib/agent.mjs:39]
  - slug: backup-push
    what: POST /sync pushes all notes to the backup service with a bearer key
    evidence: [targets/flawed-webapp/lib/sync.mjs:8]
  - slug: workspace-purge
    what: POST /admin/purge clears every note
    evidence: [targets/flawed-webapp/lib/db.mjs:27]
ai_surfaces:
  - name: assistant
    evidence: [targets/flawed-webapp/lib/agent.mjs:33]
    untrusted_input: true
    private_data: true
    external_effect: true
census_populations:
  decision-reconstruction:
    subject_type: artifact
    rule: >
      the ADR under docs/adr/ plus each in-code design choice a newcomer would ask why about
  modules-standalone:
    subject_type: artifact
    rule: >
      every .mjs module under lib/, routes/, config/ plus server.mjs; tests excluded
  effect-provability:
    subject_type: control
    rule: >
      every effect channel this canon lists
  gates-coverage:
    subject_type: contract
    rule: >
      every route handler in server.mjs plus the ADR-0001 storage interface
  credential:
    subject_type: control
    rule: >
      every secret credential_population lists
  incidents-became-mechanisms:
    subject_type: process
    rule: >
      every incident or lesson recorded in the target (none exist)
credential_population:
  rule: >
    every credential the app presents or accepts: outbound API keys and inbound bearer tokens
  secrets: [backup-api-key, session-token-table]
  count: 2
```
