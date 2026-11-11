---
type: doc
title: "flawed-webapp (notesbox) — Pass 0 terrain"
---
# Pass 0 — Terrain: notesbox (`targets/flawed-webapp/`)

Head `7f7c89d823153c702c207b1f36c6c2ce26217ceb` (detached, `origin/main`), commit date
2026-10-30T15:12:42-06:00, shallow clone. Every path below is relative to
`targets/flawed-webapp/`. Derived blind: no canon was read (the method clone was opened
only at `map/METHOD.md` and `map/SCHEMA.md`), no prior run was in context, and no
answer sheet was opened. This terrain proposes the population below as a canon draft.

## Map

- **What it is.** "notesbox", a small team-notes HTTP API with an AI assistant that
  answers over the workspace's notes and can email summaries (`README.md:1-5`).
- **Language.** JavaScript ES modules only (`package.json:5`, `"type": "module"`),
  zero dependencies, Node `http` (`server.mjs:1-3`). 12 reviewable files, 281 lines.
- **Build / test / lint / CI.** One npm script, `start` (`package.json:6-8`). No `test`,
  `test:all`, lint or typecheck script. One test file, `test/smoke.mjs` (11 lines, one
  assertion). No CI inside the target; the host repository's `.github/` is outside this
  review's scope and was not read.
- **Topology (all load-bearing dirs).**
  - `server.mjs` — the HTTP entry point; all five routes dispatch here (`server.mjs:26-57`).
  - `lib/` — `agent.mjs` (assistant: prompt build, stub model, tool-directive parse,
    email send), `auth.mjs` (bearer-token auth + `requireAdmin`), `db.mjs` (in-memory
    users/notes/sessions + `purgeAll`), `mailer.mjs` (log-only transport), `sync.mjs`
    (backup push over `fetch`).
  - `routes/admin.mjs` — the purge handler.
  - `config/settings.mjs` — central settings, including a credential literal (line 6).
  - `docs/adr/0001-storage-choice.md` — the only decision record.
  - `test/smoke.mjs` — the only test.
- **Docs surface.** `README.md` (endpoints, running, testing) and one ADR.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt
  files. The only prompt is inline in code (`lib/agent.mjs:16-19`).
- **Size.** Tiny; every file is read in full by every pass.

## Enumerated input (`map/raw/enumerate.json`)

Given, not run here. `channelCandidates: []`, `routeHandlers: []` (the enumerator's route
rule did not match this hand-rolled `node:http` dispatcher), `effectSites` one member
(`http write (js)`, `lib/sync.mjs:8`), `secrets: []`, `secretConstants: []`,
`containerClasses` one member (`admin-role branch`). As METHOD.md says for a web app with
no channel candidates, the invocable surface is the route + effect-lib topology; the routes
are enumerated here by hand from `server.mjs`.

## Routes (the HTTP surface, enumerated from `server.mjs`)

| route | handler | effect |
|---|---|---|
| `GET /notes` | `server.mjs:30-33` | read-only (own notes) — out of scope as an effect |
| `POST /notes` | `server.mjs:35-40` | writes the in-memory store → `notes-create` |
| `POST /assistant` | `server.mjs:42-45` → `lib/agent.mjs:33-43` | LLM call site (capability) + email → `assistant-email-send` |
| `POST /sync` | `server.mjs:47-50` → `lib/sync.mjs:5-14` | outbound HTTP POST of every note → `backup-push` |
| `POST /admin/purge` | `server.mjs:52-54` → `routes/admin.mjs:6-11` → `lib/db.mjs:27-31` | clears the store → `workspace-purge` |

Every route resolves its user through `authenticate` (`server.mjs:27`), which returns an
admin-role default identity for any unknown or missing token (`lib/auth.mjs:9-12`).

## Effect inventory (fixed slugs — passes draw these, never invent)

Pre-allocated ids in the delegation file so other passes can link to them:

| id | slug | invocation | sink |
|---|---|---|---|
| F-401 | `notes-create` | `POST /notes` | `server.mjs:38` |
| F-402 | `assistant-email-send` | `POST /assistant` (model-emitted `TOOL:send_email`) | `lib/agent.mjs:39`, `lib/mailer.mjs:5-8` |
| F-403 | `backup-push` | `POST /sync` | `lib/sync.mjs:8-12` |
| F-404 | `workspace-purge` | `POST /admin/purge` | `lib/db.mjs:27-31` |

AI surface (capability, one LLM call site): **F-405 `assistant`** — `lib/agent.mjs:27-34`.
The prompt mixes the caller's question and every user's note text (`lib/agent.mjs:12-19`),
so untrusted input (the caller, and any note author) meets private data (all notes) and
an outbound write (email).

## Effect triage (closes the enumerated list)

One candidate in the three populations: `http write (js)` → F-403 (`backup-push`). The
other three effects are not on the enumerated list and are still findings (the triage
closes the list; it does not bound the passes).

## Other populations (closed lists)

- **Agent/identity classes** — member (`lib/db.mjs:3-4`), admin (`lib/db.mjs:5`), and the
  unauthenticated default identity with role admin (`lib/auth.mjs:12`). Assessed separately
  by delegation.
- **Credentials** — one: `backupApiKey`, a provider-prefixed key literal in source
  (`config/settings.mjs:6`), used as a bearer header (`lib/sync.mjs:10`). The enumerator's
  `secrets` and `secretConstants` both came back empty; this is a hand enumeration. Session
  bearer tokens are fixed literals in `lib/db.mjs:13-17` (demo token table) — recorded as
  the session store, not as a runtime secret.
- **Egress controls** — none in the target.
- **Interface contracts** — the ADR-0001 storage interface (`docs/adr/0001-storage-choice.md:14-17`);
  no schema validation at any route (`server.mjs:11-19` parses JSON and swallows errors).
- **Delivery / effect-vs-report paths** — `pushBackup` returns `{ok: true}` without awaiting
  the fetch and swallows errors (`lib/sync.mjs:8-13`); `sendEmail` returns `{sent: true}`
  from a log-only transport (`lib/mailer.mjs:6-8`).

## Census populations (census-augmented mode: one finding per member)

| census (dimension) | subject_type | members |
|---|---|---|
| `decision-reconstruction` (legibility) | artifact | D1 in-memory store behind an interface (ADR-0001); D2 unauthenticated fallback to an admin default identity (`lib/auth.mjs:9-12`); D3 fire-and-forget backup push (`lib/sync.mjs:7-12`); D4 zero-dependency server delegating to lib/routes (`server.mjs:1-2`); D5 backup key held in source (`config/settings.mjs:5-6`); D6 log-only mail transport (`lib/mailer.mjs:1-2,6`) |
| `modules-standalone` (context) | artifact | every module: `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs` |
| `doc-freshness` (context) | artifact | every checkable README claim: R1 "4 endpoints" (`README.md:14-19`); R2 run with `node server.mjs` (`README.md:24`); R3 `npm run test:all` (`README.md:32`); R4 "every endpoint is covered by the smoke suite" (`README.md:35`) |
| `gates-coverage` (gates) | contract | every route handler (the five above): is a test that fails on a regression present? |
| `effect-provability` (verification) | control | every effect channel: `notes-create`, `assistant-email-send`, `backup-push`, `workspace-purge` |
| `credential` (delegation) | control | `backupApiKey` (`config/settings.mjs:6`) |
| `agent-access-surface` (multiplayer) | contract | every route handler (the five above): agent-consumable and documented? |

Improvement-loop has no enumerable lesson/incident population in the target (no
incidents dir, no agent spec); it is reported by depth only.

## Slice plan

The whole target is 281 lines; every pass reads every file. Emphasis per pass:

1. Legibility — `docs/adr/0001-storage-choice.md`, `README.md`, the rationale comments in
   `lib/*.mjs`, `config/settings.mjs`, `server.mjs:1-2`.
2. Context — `README.md` vs `server.mjs`/`package.json`/`test/`, every module's imports,
   the ADR interface vs `lib/db.mjs` exports and their importers; model-tier/spend records.
3. Gates — `package.json`, `test/smoke.mjs`, `server.mjs:11-19` (input contracts).
4. Verification — `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `test/smoke.mjs`.
5. Delegation (deepest) — `lib/auth.mjs`, `lib/agent.mjs`, `lib/sync.mjs`, `lib/db.mjs`,
   `routes/admin.mjs`, `server.mjs`, `config/settings.mjs`.
6. Improvement — absence of agent spec / lessons home; `config/settings.mjs:5` TODO;
   `test/smoke.mjs:1-3`; telemetry by design (`lib/mailer.mjs:7`).
7. Multiplayer — the five routes as the agent access surface, the shared notes store,
   the authority domains of the assistant and the default identity.

Not read: anything outside `targets/flawed-webapp/` (the host repository's CI, README and
the other targets), by scope.
