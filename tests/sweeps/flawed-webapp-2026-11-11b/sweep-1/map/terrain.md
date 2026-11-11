---
type: doc
title: "flawed-webapp — Pass 0 terrain (blind)"
---
# Pass 0 — Terrain: targets/flawed-webapp at 7f7c89d

Blind derivation: no canon for this target was given or read, and no prior run is in
context. All paths below are relative to `targets/flawed-webapp/`. The planted-answers
sheet in the target directory is excluded from every listing and was never opened.

## The map

- **What it is.** `notesbox` (README.md:1), a team notes HTTP API with an AI assistant
  that answers over the workspace's notes and can email summaries (README.md:3-5).
- **Language and size.** JavaScript (ES modules, `.mjs`) only, Node >= 20 `http`, zero
  dependencies (server.mjs:1, package.json:5). 12 tracked files reviewed (enumerate.json
  counts 13 including the excluded sheet), about 280 lines in all: server.mjs 63,
  lib/ 123 over 5 modules, routes/admin.mjs 11, config/settings.mjs 9, test/smoke.mjs 11,
  README.md 35, one ADR 29, package.json 9.
- **Build / test / lint / CI.** No build step. package.json scripts hold only `start`
  (package.json:6-8); no `test` script, although README.md:32 names `npm run test:all`.
  One test file, test/smoke.mjs (a single assert on `authenticate`). No lint, no
  typecheck, no lockfile (no dependencies). No CI inside the target directory: the
  repository has a root-level workflow, which is outside the target under review and is
  not credited here.
- **Topology (load-bearing).** `server.mjs` (router: five method+path branches,
  server.mjs:30-54) → `lib/auth.mjs` (bearer-token resolution and a default-identity
  fallback), `lib/db.mjs` (in-memory users, notes, token table, `purgeAll`),
  `lib/agent.mjs` (the assistant: prompt build, stub model, tool-directive parse,
  email), `lib/mailer.mjs` (log-only transport), `lib/sync.mjs` (backup push via
  `fetch`), `routes/admin.mjs` (purge handler with `requireAdmin`),
  `config/settings.mjs` (port, backup URL and key, mail from, admin emails).
- **Docs surface.** README.md (intent, endpoint list, run, test), one ADR
  (docs/adr/0001-storage-choice.md). Header comments in each module.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt
  files. The only prompt is inline in lib/agent.mjs:16-20.
- **Identity classes** (enumerate.json `containerClasses`: "admin-role branch"). Three
  principals resolve per request: a `member` (token table, lib/db.mjs:3-4), an `admin`
  (lib/db.mjs:5), and a **default fallback identity** returned for any unknown or missing
  token, with `role: 'admin'` (lib/auth.mjs:9-12). Each class is assessed separately.

## The enumeration input

`map/raw/enumerate.json` was given and read. `channelCandidates`: 0, `routeHandlers`: 0
(the enumerator's route rule is Next.js-shaped; this app routes by hand in server.mjs),
`effectSites`: 1 (`http write (js)` at lib/sync.mjs:8). `secrets` and `secretConstants`
are empty, although a credential-suffixed string constant sits at config/settings.mjs:6
(recorded below by hand). `containerClasses`: 1. The triage closes the one candidate; the
route surface the enumerator missed is enumerated by hand below and still gets findings.

## Effect inventory (fixed channel slugs; the delegation pass uses these verbatim)

Invocation boundary: a route handler or the assistant's tool directive.

| slug | invoked by | effect | evidence |
|---|---|---|---|
| `note-create` | `POST /notes` | inserts a note into the in-memory store | server.mjs:35-40 |
| `assistant-email-send` | `POST /assistant` → model output `TOOL:send_email` | emails every note's text to a model-chosen address | lib/agent.mjs:35-39, lib/mailer.mjs:5-8 |
| `workspace-backup-push` | `POST /sync` | POSTs every note, with a bearer key, to the backup URL | server.mjs:47-50, lib/sync.mjs:5-13 |
| `workspace-purge` | `POST /admin/purge` | clears every note and every user's note list | server.mjs:52-54, routes/admin.mjs:6-10, lib/db.mjs:27-31 |

Read-only, out of the effect inventory: `GET /notes` (server.mjs:30-33).

Pre-assigned effect finding ids (delegation file): F-401 `note-create`, F-402
`assistant-email-send`, F-403 `workspace-backup-push`, F-404 `workspace-purge`.

## AI surfaces (capabilities; one per LLM call site)

| name | call site | untrusted input | private data | external effect |
|---|---|---|---|---|
| `assistant` | lib/agent.mjs:27 (`callModel`, a stub standing in for a model), driven from lib/agent.mjs:33-42 | the user's question (server.mjs:44) and every note's text, authored by any member | every note in the workspace and owner emails (lib/agent.mjs:12-15) | write: email (lib/agent.mjs:39) |

Pre-assigned id: F-405 (delegation file).

## Censuses (populations closed here; one finding per member, canonical subject_type)

| census | pass | subject_type | members (rule) |
|---|---|---|---|
| `decision-reconstruction` | legibility | artifact | D1 in-memory store behind an interface (docs/adr/0001-storage-choice.md, lib/db.mjs:1); D2 unknown token falls back to an admin default identity (lib/auth.mjs:9-12); D3 backup push is fire-and-forget (lib/sync.mjs:7-13); D4 the assistant's tools are a text directive parsed from model output (lib/agent.mjs:18, 35); D5 the backup key lives in the settings module (config/settings.mjs:5-6) |
| `modules-standalone` | context | artifact | every source module: server.mjs, lib/agent.mjs, lib/auth.mjs, lib/db.mjs, lib/mailer.mjs, lib/sync.mjs, routes/admin.mjs, config/settings.mjs (8) |
| `doc-freshness` | context | artifact | every checkable claim in the docs: C1 "4 endpoints" (README.md:14); C2 the endpoint list (README.md:16-19); C3 the run command (README.md:24); C4 the test command (README.md:32); C5 "every endpoint is covered" (README.md:35); C6 the ADR's interface claim (docs/adr/0001-storage-choice.md:14-17); C7 "a restart loses data" (docs/adr/0001-storage-choice.md:22-23) |
| `gates-coverage` | gates | contract | every route handler in server.mjs: GET /notes, POST /notes, POST /assistant, POST /sync, POST /admin/purge (5) |
| `effect-provability` | verification | control | every effect channel above (4) |
| `credential` | delegation | control | the runtime secrets the app holds: the backup API key (config/settings.mjs:6); the session bearer-token table (lib/db.mjs:13-17) (2) |
| `agent-access-surface` | multiplayer | contract | every interface the app exposes: the five routes (5) |

`incidents-became-mechanisms` (improvement): no incident or lesson record exists in the
target, so the population is empty and the census is not measured.

## Slice plan

The target is small enough that every pass may read every file; each pass reads these
first and cites only paths under the target.

1. **Legibility:** README.md, docs/adr/0001-storage-choice.md, the header comments of
   every module, lib/auth.mjs, lib/sync.mjs, lib/agent.mjs, config/settings.mjs.
2. **Context:** README.md, docs/, package.json, server.mjs, each lib/ module,
   routes/admin.mjs, config/settings.mjs. No model-tier choice exists to record (the model
   is a stub).
3. **Gates:** package.json, test/smoke.mjs, server.mjs, lib/auth.mjs, README.md:27-35.
4. **Verification:** test/smoke.mjs, lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs,
   routes/admin.mjs, server.mjs.
5. **Delegation:** server.mjs, lib/auth.mjs, lib/agent.mjs, lib/mailer.mjs,
   lib/sync.mjs, routes/admin.mjs, lib/db.mjs, config/settings.mjs.
6. **Improvement:** README.md, docs/adr/, config/settings.mjs:5, test/smoke.mjs, every
   module's logging lines (lib/mailer.mjs:7, server.mjs:60).
7. **Multiplayer:** server.mjs, lib/auth.mjs, lib/db.mjs, lib/agent.mjs,
   config/settings.mjs, README.md.

Not read: the repository outside `targets/flawed-webapp/` (other fixture targets, the
root workflow), and the excluded answer sheet.
