---
type: doc
title: "flawed-webapp — Pass 0 terrain (blind)"
---
# Terrain — targets/flawed-webapp at 7f7c89d

Blind derivation: no canon exists for this target and no prior run was read. Every path
below is relative to `targets/flawed-webapp/`. Inputs: the tree listing (11 files,
ANSWERS.yaml excluded and never opened) and `map/raw/enumerate.json`.

## Map

- **What it is.** "notesbox", a small team-notes HTTP API with an AI assistant that answers
  over the workspace's notes and can email summaries (README.md:1-5).
- **Language.** JavaScript (ES modules, `.mjs`) only; Node >= 20 built-in `http`, zero
  dependencies (server.mjs:1-3, package.json:5).
- **Size.** 11 files, about 280 lines: 8 source modules, 1 test, 1 README, 1 ADR,
  package.json.
- **Entry points.** `node server.mjs` / `npm start` (package.json:6-7, README.md:23-25).
  No `test` script in package.json; README names `npm run test:all` (README.md:32), which
  package.json does not define.
- **Tests.** `test/smoke.mjs`, one assertion on `authenticate` (test/smoke.mjs:8-9).
- **CI.** None inside the target tree. The repository root's workflow (outside the target,
  so not citable here) runs `node targets/flawed-webapp/test/smoke.mjs` on push and pull
  request; the target's own gate population is therefore the smoke suite.
- **Lint / typecheck.** None.
- **Docs.** README.md (endpoints, running, testing), docs/adr/0001-storage-choice.md.
- **Agent-facing files.** None (no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompts
  files). The only prompt is inline in lib/agent.mjs:16-20.

## Directory topology (all of it)

| path | concern |
|---|---|
| server.mjs | HTTP server and the route table (5 routes) |
| lib/auth.mjs | bearer-token authentication, admin check, default-identity fallback |
| lib/db.mjs | in-memory users, notes, token table, `purgeAll` |
| lib/agent.mjs | the AI assistant: prompt build, stub model, tool-directive parse, email |
| lib/mailer.mjs | outbound mail (log-only transport in this build) |
| lib/sync.mjs | backup push to an external backup service |
| routes/admin.mjs | the purge handler |
| config/settings.mjs | port, backup URL, backup API key, mail-from, admin emails |
| test/smoke.mjs | the smoke suite |
| docs/adr/ | one ADR (storage choice) |

## Identity classes (assessed separately)

`enumerate.json` lists one container/agent class, `admin-role branch`. The classes here:
an authenticated **member** (token resolves to a member user, lib/db.mjs:3-4), an
authenticated **admin** (lib/db.mjs:5), and the **default identity** any request with an
unknown or missing token receives, which carries `role: 'admin'` (lib/auth.mjs:9-12).
Delegation assesses each class on its own; the default identity must not hide behind the
admin class.

## Effect inventory (channel slugs fixed here)

Candidate list from `map/raw/enumerate.json`: `channelCandidates` 0, `routeHandlers` 0
(the server is a raw `http.createServer` dispatch the route enumerator does not detect),
`effectSites` 1 (`http write (js)`, lib/sync.mjs:8). The invocable surface is therefore the
route + effect-lib topology read from server.mjs:30-56. Channels, one per invocation
boundary:

| slug | invocation | effect | evidence |
|---|---|---|---|
| `notes-create` | POST /notes | writes a note into the in-memory store | server.mjs:35-39 |
| `assistant-email-send` | POST /assistant, model emits `TOOL:send_email` | sends all notes' text by email to a model-chosen address | lib/agent.mjs:33-41, lib/mailer.mjs:5-8 |
| `backup-push` | POST /sync | POSTs every note to the backup service with the backup API key | server.mjs:47-50, lib/sync.mjs:5-14 |
| `workspace-purge` | POST /admin/purge | clears every note and every user's note list | server.mjs:52-54, routes/admin.mjs:6-11, lib/db.mjs:27-31 |

Read-only: GET /notes (server.mjs:30-33), out of the effect inventory.

Triage of the enumerated candidates (`map/effect-triage.yaml`): `http write (js)` is the
backup push, covered by the `backup-push` effect finding.

## AI surfaces

One LLM call site: `notes-assistant` (lib/agent.mjs:27-42; the model is a stub, the shape is
real). Untrusted input: the caller's question and every user's note text in one prompt
(lib/agent.mjs:11-20). Private data: all notes across users. External effect: write
(email).

## Censuses (populations frozen before assessment)

Ids are pre-assigned so the passes run in parallel; each pass writes one finding per member.

- **decision-reconstruction** (artifact-legibility, subject_type `artifact`): every
  non-obvious decision a newcomer would question.
  - D1 in-memory store behind a narrow interface (lib/db.mjs:1) — F-101
  - D2 unknown/missing token falls back to a default identity with admin role (lib/auth.mjs:9-12) — F-102
  - D3 backup API key held as a literal in config (config/settings.mjs:5-6) — F-103
  - D4 backup push fired without awaiting, errors swallowed (lib/sync.mjs:7-12) — F-104
  - D5 zero dependencies, raw node http (server.mjs:1-2) — F-105
  - D6 mail transport is log-only (lib/mailer.mjs:1-2) — F-106
  - D7 the assistant's prompt carries every user's notes, not the caller's (lib/agent.mjs:11-15) — F-107
  - D8 POST /sync carries no authorization check (server.mjs:48) — F-108
- **doc-freshness** (artifact-legibility, subject_type `artifact`): every concrete claim in
  README.md.
  - C1 "The API exposes 4 endpoints" (README.md:14) — F-111
  - C2 `GET /notes` lists your notes (README.md:16) — F-112
  - C3 `POST /notes` creates a note (README.md:17) — F-113
  - C4 `POST /assistant` asks the assistant, can email (README.md:18) — F-114
  - C5 `POST /sync` pushes the workspace to backup (README.md:19) — F-115
  - C6 run with `node server.mjs` (README.md:24) — F-116
  - C7 `npm run test:all` runs the full suite (README.md:32) — F-117
  - C8 every endpoint is covered by the smoke suite (README.md:35) — F-118
- **modules-standalone** (context-economy, subject_type `artifact`): every source module.
  server.mjs F-201, lib/agent.mjs F-202, lib/auth.mjs F-203, lib/db.mjs F-204,
  lib/mailer.mjs F-205, lib/sync.mjs F-206, routes/admin.mjs F-207,
  config/settings.mjs F-208.
- **change-gates** (deterministic-gates, subject_type `contract`): every check a change
  passes through: the smoke suite test/smoke.mjs — F-301.
- **effect-provability** (verification, subject_type `control`): every effect channel above.
  notes-create F-401, assistant-email-send F-402, backup-push F-403, workspace-purge F-404.
- **credential** (delegation, subject_type `control`): every secret the running app reads.
  backup API key (config/settings.mjs:6, read at lib/sync.mjs:10) — F-506; the bearer token
  table (lib/db.mjs:13-17, read at lib/auth.mjs:7) — F-507.
- **agent-access-surface** (multiplayer, subject_type `contract`): every interface a caller
  reaches. GET /notes F-701, POST /notes F-702, POST /assistant F-703, POST /sync F-704,
  POST /admin/purge F-705.
- **incidents-became-mechanisms** (improvement-loop): no lesson, incident, postmortem or
  lessons file is recorded in the tree; the population is empty and the census is not
  listed (a census with no members never reads met). The improvement pass records the
  absence as a finding.

Effect findings: notes-create F-501, assistant-email-send F-502, backup-push F-503,
workspace-purge F-504; capability notes-assistant F-505.

## Slice plan

The tree is small enough that every pass reads all of it; each pass reads its slice first.

| pass | slice |
|---|---|
| 1 legibility | README.md, docs/adr/0001-storage-choice.md, the comments at the decisions above |
| 2 context | every module, README.md, docs/adr/, package.json |
| 3 gates | test/smoke.mjs, package.json, server.mjs, lib/auth.mjs |
| 4 verification | lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs, routes/admin.mjs, test/smoke.mjs |
| 5 delegation | server.mjs, lib/auth.mjs, lib/agent.mjs, lib/mailer.mjs, lib/sync.mjs, lib/db.mjs, routes/admin.mjs, config/settings.mjs |
| 6 improvement | README.md, docs/adr/, config/settings.mjs, package.json |
| 7 multiplayer | server.mjs, README.md, lib/agent.mjs, lib/db.mjs, lib/auth.mjs |

Not read: nothing in the target is skipped. Outside the target (the other fixtures, the
repository root) is out of scope.
