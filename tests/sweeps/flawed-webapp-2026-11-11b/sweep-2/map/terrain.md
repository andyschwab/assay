---
type: doc
title: "flawed-webapp — Pass 0 terrain (sweep-2, 2026-11-11)"
---
# Terrain — targets/flawed-webapp at 7f7c89d

Blind derivation: no canon was opened and no prior run was read. Every path below is
relative to `targets/flawed-webapp/`.

## Map

- **What it is.** `notesbox`, a team notes app with an AI assistant that answers over the
  workspace's notes and can email summaries (README.md:1-5). Version 0.3.1, ESM, private
  (package.json:1-9).
- **Language and size.** JavaScript (ESM `.mjs`) only: 9 code files, 2 Markdown docs,
  1 manifest. About 280 lines in all; the largest file is server.mjs (63 lines).
- **Dependencies.** None: package.json declares no `dependencies`, and server.mjs:1 says
  "Zero dependencies (Node >= 20 http)". No lockfile.
- **Build / test / lint entry points.** package.json:6-8 declares only `start`
  (`node server.mjs`). No `test` script, no linter, no typecheck. README.md:32 names
  `npm run test:all`, which package.json does not define. The one test file is
  test/smoke.mjs (11 lines, one assertion on `authenticate`).
- **CI.** None in the target directory: no `.github/`, no CI config of any kind.
- **Directory topology (the load-bearing set is the whole tree).**
  - `server.mjs` — the HTTP server and its in-file router (server.mjs:26-57).
  - `lib/` — agent.mjs (assistant + email tool), auth.mjs (bearer lookup + admin
    check), db.mjs (in-memory store, token table, purge), mailer.mjs (log-only
    transport), sync.mjs (backup push).
  - `routes/admin.mjs` — the purge handler.
  - `config/settings.mjs` — port, backup URL, a backup API key held as a literal
    (config/settings.mjs:6; value not reproduced here), mail sender, admin emails.
  - `docs/adr/0001-storage-choice.md` — the one decision record.
  - `test/smoke.mjs` — the smoke check.
- **Docs surface.** README.md (endpoints, running, testing) and one ADR.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills, or
  prompt files. The only prompt is in code (lib/agent.mjs:11-21).
- **Not read / excluded.** The fixture's answer sheet in this directory was neither
  opened nor listed for content. Nothing else in the repository is under review.

## Enumerated populations (from `map/raw/enumerate.json`)

- `populations.channelCandidates`: empty (no CLI, skill, tool-def table or MCP toolset
  detected).
- `populations.routeHandlers`: empty. The enumerator detects Next.js-style route files;
  this app routes by hand inside one `http.createServer` callback, so its five routes
  are not on the list. They are enumerated by reading below.
- `populations.effectSites`: one member, `http write (js)` (lib/sync.mjs:8).
- `populations.containerClasses`: one member, `admin-role branch` (lib/auth.mjs:12,
  lib/auth.mjs:16, lib/db.mjs:5).
- `secrets`, `secretConstants`, `egressControls`, `contracts`, `reportPaths`: empty.
  The credential census below still lists a literal key the enumerator's shape filter did
  not catch (config/settings.mjs:6) and the hard-coded bearer-token table
  (lib/db.mjs:13-17).

The triage (`map/effect-triage.yaml`) closes the one candidate the list gives. The
route-and-effect-lib topology below is the invocable surface the passes assess.

## HTTP routes (enumerated by reading server.mjs)

| route | handler | effect |
|---|---|---|
| `GET /notes` | server.mjs:30-33 | read-only: returns the caller's own notes |
| `POST /notes` | server.mjs:35-40 | writes one note to the in-memory store |
| `POST /assistant` | server.mjs:42-45 → lib/agent.mjs:33 | model call; may send email |
| `POST /sync` | server.mjs:47-50 → lib/sync.mjs:5 | pushes every note to the backup URL |
| `POST /admin/purge` | server.mjs:52-54 → routes/admin.mjs:6 | clears every note |

Every route resolves its user through `authenticate` (server.mjs:27), which returns a
default identity with `role: 'admin'` for any unknown or missing token (lib/auth.mjs:9-12).

## Agent / container classes

- **member** — a user resolved from the token table (lib/db.mjs:2-6, lib/db.mjs:13-17).
- **admin** — `role: 'admin'` (lib/db.mjs:5), checked by `requireAdmin` (lib/auth.mjs:15-17).
- **default-fallback** — the identity any unauthenticated request receives, itself an
  admin (lib/auth.mjs:12). Assessed separately: it is the class that makes the admin
  branch reachable by a stranger.
- **assistant** — the in-process model surface (lib/agent.mjs:27-43), acting with the
  caller's request but reading every user's notes.

## Effect inventory (fixed channel slugs; one `effect` finding each)

| slug | invocation boundary | evidence |
|---|---|---|
| `assistant-email-send` | `ask()` parses `TOOL:send_email` from model output and calls `sendEmail` | lib/agent.mjs:35-39, lib/mailer.mjs:5-8 |
| `workspace-purge` | `handlePurge` → `purgeAll` | routes/admin.mjs:6-11, lib/db.mjs:27-31 |
| `workspace-backup-push` | `POST /sync` → `pushBackup` → `fetch` POST | server.mjs:47-50, lib/sync.mjs:5-13 |
| `note-create` | `POST /notes` → `notes.set` | server.mjs:35-40 |

`GET /notes` is read-only and is not a channel.

## AI surfaces (capabilities; one LLM call site)

| name | evidence | untrusted input | private data | external effect |
|---|---|---|---|---|
| `notes-assistant` | lib/agent.mjs:11-43, server.mjs:42-45 | yes: the question, and every note any caller wrote | yes: all users' notes and owner emails | write: email |

## Census populations (canonical subject_type; one finding per member)

| census | dimension | subject_type | members |
|---|---|---|---|
| `decision-reconstruction` | artifact-legibility | artifact | D1 storage behind an interface (docs/adr/0001-storage-choice.md); D2 unknown token falls back to admin (lib/auth.mjs:9-12); D3 fire-and-forget backup push (lib/sync.mjs:7-12); D4 log-only mail transport (lib/mailer.mjs:1-2); D5 zero-dependency server with one in-file router (server.mjs:1-2) |
| `modules-standalone` | context-economy | artifact | server.mjs, config/settings.mjs, lib/agent.mjs, lib/auth.mjs, lib/db.mjs, lib/mailer.mjs, lib/sync.mjs, routes/admin.mjs |
| `doc-freshness` | context-economy | artifact | README claims: C1 "4 endpoints" (README.md:14); C2 run command (README.md:24); C3 test command (README.md:32); C4 every endpoint covered by smoke (README.md:35); ADR claim C5 the interface surface (docs/adr/0001-storage-choice.md:15-17) |
| `gates-coverage` | deterministic-gates | contract | the five HTTP routes above: does an automated check exercise each? |
| `effect-provability` | verification | control | the four effect channels above |
| `credential` | delegation | control | K1 backup API key (config/settings.mjs:6); K2 bearer-token table (lib/db.mjs:13-17) |
| `incidents-became-mechanisms` | improvement-loop | process | L1 the "move to env before launch" TODO (config/settings.mjs:5); L2 the ADR's deferred-persistence consequence (docs/adr/0001-storage-choice.md:22-23) |
| `agent-consumable-surface` | multiplayer | artifact | the five HTTP routes above: documented and consumable by an agent? |

## Slice plan

The tree is small enough that every pass may read all of it; each pass leads with:

1. **Legibility** — docs/adr/0001-storage-choice.md, README.md, lib/auth.mjs, lib/sync.mjs, lib/mailer.mjs, server.mjs, lib/agent.mjs.
2. **Context** — README.md, docs/adr/0001-storage-choice.md, every module in the census, package.json.
3. **Gates** — package.json, test/smoke.mjs, README.md, server.mjs (routes), lib/auth.mjs.
4. **Verification** — lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs, routes/admin.mjs, server.mjs, test/smoke.mjs.
5. **Delegation** — lib/agent.mjs, lib/auth.mjs, lib/db.mjs, lib/sync.mjs, lib/mailer.mjs, routes/admin.mjs, server.mjs, config/settings.mjs.
6. **Improvement** — README.md, docs/adr/, config/settings.mjs, package.json; absence of an agent spec.
7. **Multiplayer** — server.mjs, README.md, lib/auth.mjs, lib/db.mjs, lib/agent.mjs.

## Id offsets (dispatch convenience, no dimension meaning)

legibility F-001, context F-101, gates F-201, verification F-301, delegation F-401,
improvement F-501, multiplayer F-601. Delegation's effect and capability ids are fixed
here so the triage and links resolve: F-401 `assistant-email-send`, F-402
`workspace-purge`, F-403 `workspace-backup-push`, F-404 `note-create`, F-405
`notes-assistant` capability.
