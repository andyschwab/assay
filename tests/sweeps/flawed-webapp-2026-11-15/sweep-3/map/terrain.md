---
confidential: true
type: doc
title: "flawed-webapp — terrain (Pass 0)"
---
# Terrain — flawed-webapp (notesbox)

Target: `targets/flawed-webapp/` of the fixtures repository at 7f7c89d8, read as its own root
(every path below is relative to it). Derived blind: no canon exists for this target and no prior
run was in context. Nothing in the tree was executed.

## The map

- **Language and size.** JavaScript (ESM `.mjs`) only: 8 source modules, 1 test file, 1
  `package.json`, 2 Markdown docs; 281 lines in all. Zero dependencies (`package.json:1-9` declares
  none; `server.mjs:1` says Node >= 20 `node:http`).
- **Entry points.** `server.mjs` (an `http.createServer` dispatch, `server.mjs:26-57`); the one
  package script is `start` (`package.json:7`). No `test`, `lint` or `test:all` script exists,
  though the README tells a reader to run `npm run test:all` (`README.md:32`).
- **CI, hooks, config checks.** None inside the target: no workflow, no hook, no lint or typecheck
  config (`populations.changeGates` is empty). The repository root carries a workflow of its own,
  outside the target and not under review.
- **Topology (load-bearing).** `server.mjs` (routing), `lib/` (auth, db, agent, mailer, sync),
  `routes/admin.mjs` (purge handler), `config/settings.mjs` (settings incl. a literal key),
  `test/smoke.mjs` (one assertion), `docs/adr/` (one decision record).
- **Docs surface.** `README.md` (endpoints, running, testing), `docs/adr/0001-storage-choice.md`.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt files.
  The only prompt is built in code (`lib/agent.mjs:11-21`).
- **AI surface.** One model call site, a local stand-in (`callModel`, `lib/agent.mjs:27-31`),
  called by `ask` (`lib/agent.mjs:33-43`), reached from `POST /assistant` (`server.mjs:42-45`).
  Its prompt holds every user's notes (`lib/agent.mjs:12-15`) and the caller's question
  (`lib/agent.mjs:19`); its output is parsed for a `TOOL:send_email` directive that sends mail
  (`lib/agent.mjs:35-39`). One AI context: `assistant` (capability finding, delegation pass).

## Effect inventory draft (candidates from `map/raw/enumerate.json`)

`channelCandidates` is empty (a web app); the route handlers and effect sites are the list the
triage closes. Fixed channel slugs (draw from these, never invent):

| candidate (exactly as enumerate writes it) | proposed channel slug | note |
|---|---|---|
| `route: GET /notes` | — | method reads; handler calls no listed write site (`server.mjs:30-33`) |
| `route: POST /notes` | `note-create` | inserts into the in-memory store (`server.mjs:35-40`) |
| `route: POST /assistant` | `assistant-send-email` | handler calls `ask`, which reaches `sendEmail` (`server.mjs:44`, `lib/agent.mjs:39`) |
| `route: POST /sync` | `backup-push` | handler calls `pushBackup` (`server.mjs:47-50`) |
| `route: POST /admin/purge` | `workspace-purge` | handler calls `purgeAll` (`server.mjs:52-54`, `routes/admin.mjs:6-11`) |
| `message/mail send @ lib/agent.mjs` | `assistant-send-email` | the tool directive's send (`lib/agent.mjs:39`) |
| `message/mail send @ lib/mailer.mjs` | `assistant-send-email` | the transport `sendEmail`; its one caller is the assistant (`lib/mailer.mjs:5-9`) |
| `http write (js) @ lib/sync.mjs` | `backup-push` | fire-and-forget `fetch` POST with a bearer key (`lib/sync.mjs:8-12`) |

`populations.excluded` is empty.

## Census candidates handed to the passes

- `populations.secrets` → delegation pass (`credential`): `backupApiKey` (`config/settings.mjs:6`,
  read at `lib/sync.mjs:10`), `tokenTable` (`lib/db.mjs:13-17`, read at `lib/db.mjs:21`).
- `populations.changeGates` → gates pass (`change-gates`): empty, `triage: []`.
- `populations.modelCalls` → context pass (`model-call-telemetry`): `model call: lib/agent.mjs`.
- `populations.containerClasses` → delegation pass: `admin-role branch` — the unknown-token
  fallback identity is an admin (`lib/auth.mjs:9-12`), the admin check (`lib/auth.mjs:15-17`), the
  admin user row (`lib/db.mjs:5`). Assess the member and admin classes separately.

## Populations enumerated for the observational censuses (frozen before assessment)

- **Non-obvious decisions** (legibility, `decision-reconstruction`): D1 in-memory store behind a
  module interface (`lib/db.mjs:1`, `docs/adr/0001-storage-choice.md`); D2 an unknown or missing
  token falls back to an admin identity (`lib/auth.mjs:9-12`); D3 the backup push is
  fire-and-forget, errors swallowed (`lib/sync.mjs:7-12`); D4 the mail transport only logs
  (`lib/mailer.mjs:1-8`); D5 the backup key is a literal in code (`config/settings.mjs:5-6`); D6
  zero dependencies, raw `node:http` (`server.mjs:1-3`); D7 `POST /sync` carries no authorization
  check (`server.mjs:48`); D8 the assistant's prompt holds every user's notes, not the caller's
  (`lib/agent.mjs:12-15`).
- **Doc claims** (legibility, `doc-freshness`): the README's endpoint count (`README.md:14`), its
  endpoint list (`README.md:16-19`), the run command (`README.md:24`), the test command
  (`README.md:32`), the coverage claim (`README.md:35`), the email capability (`README.md:4`,
  `README.md:18`); the ADR's interface claim (`docs/adr/0001-storage-choice.md:14-17`) and its
  persistence consequence (`docs/adr/0001-storage-choice.md:22-23`).
- **Modules** (context, `modules-standalone`): `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`,
  `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs`.
  Only `lib/auth.mjs` is imported by a test (`test/smoke.mjs:5`).
- **Ingestion points** (delegation, `ingested-content`): the note body of `POST /notes`
  (`server.mjs:36-38`), later read into the assistant's prompt (`lib/agent.mjs:12-15`); the
  question of `POST /assistant` (`server.mjs:43-44`, `lib/agent.mjs:19`).
- **Interfaces** (multiplayer, `agent-consumable-surface`): the five routes above.
- **Lessons** (improvement, `incidents-became-mechanisms`): none recorded — no incident note,
  postmortem, lessons file or fix naming a cause. That is an absence, recorded outside the census.
- **Backlog records** (improvement context): the TODO at `config/settings.mjs:5`; the ADR's
  deferred persistence (`docs/adr/0001-storage-choice.md:22-23`).
- **Second accounts** (legibility context): the route list in the README beside the dispatch in
  `server.mjs`; the admin purge's method in a comment (`routes/admin.mjs:5`) beside the dispatch
  (`server.mjs:52`); the ADR's interface list beside `lib/db.mjs`.

## Slice plan

The whole target is 12 files and 281 lines, so every pass reads all of it; nothing is sampled
and nothing is left unread. Per pass, the files it centres on:

| pass | files |
|---|---|
| 1 legibility | `README.md`, `docs/adr/0001-storage-choice.md`, the files each decision and claim cites |
| 2 context | the 8 modules, `test/smoke.mjs`, `lib/agent.mjs` for the model call |
| 3 gates | `package.json`, `test/smoke.mjs`, `README.md:27-35`, `server.mjs:11-19` (body parsing) |
| 4 verification | `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `README.md` |
| 5 delegation | `server.mjs`, `lib/*.mjs`, `routes/admin.mjs`, `config/settings.mjs` |
| 6 improvement | `config/settings.mjs`, `docs/adr/0001-storage-choice.md`, `README.md`, `test/smoke.mjs` |
| 7 multiplayer | `README.md`, `server.mjs`, `lib/auth.mjs`, `lib/agent.mjs`, `lib/db.mjs` |

Not read: the repository outside `targets/flawed-webapp/`, and any `ANSWERS.yaml`.
