---
type: doc
title: flawed-webapp terrain (Pass 0)
---
# Terrain — targets/flawed-webapp at 7f7c89d

Derived blind: no prior run and no canon in context (none exists beside the target), from a
listing of the target and `map/raw/enumerate.json`. Every path below is relative to
`targets/flawed-webapp/`.

## The map

- **What it is.** `notesbox`, a team notes HTTP API with an AI assistant that answers over
  the workspace's notes and can email summaries (README.md:1-5). Fixture notice at
  README.md:7-10.
- **Language and size.** JavaScript (ES modules, `.mjs`) only, plus Markdown and one
  `package.json`. 12 files, 281 lines: 9 code files (172 lines), 2 Markdown docs (64 lines),
  `package.json` (9 lines). Zero dependencies (package.json:1-9 declares none; server.mjs:1).
- **Entry points.** `server.mjs` (a `node:http` server, server.mjs:26-57, listens at
  server.mjs:59-61); `npm start` is the only script (package.json:6-8).
- **Build / test / lint.** No build, no lint, no typecheck. One test file, `test/smoke.mjs`
  (11 lines), wired to no script: `package.json` has only `start`; README.md:31-35 names
  `npm run test:all`, which does not exist. No CI config, no hooks inside the target
  (`populations.changeGates` is empty). The repository root has a `.github/workflows/ci.yml`;
  it sits outside the target and is not reviewed.
- **Topology (every directory).**
  - `server.mjs` — routing and request parsing, the one HTTP dispatcher.
  - `lib/` — `auth.mjs` (bearer-token auth with a fallback identity), `db.mjs` (in-memory
    store, session token table, `purgeAll`), `agent.mjs` (the AI assistant: prompt build, a
    stub model, tool-directive parse, email), `mailer.mjs` (log-only mail transport),
    `sync.mjs` (backup push over HTTP).
  - `routes/admin.mjs` — the admin purge handler.
  - `config/settings.mjs` — central settings, a literal API key among them.
  - `docs/adr/0001-storage-choice.md` — the one ADR.
  - `test/smoke.mjs` — the one test.
- **Docs surface.** README.md (endpoints, running, testing), one ADR. No architecture page.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills, prompts
  directory or agent config. The only prompt is built in code (lib/agent.mjs:11-21).
- **Container / agent classes.** One process class, the `node server.mjs` process
  (`populations.containerClasses` lists one); no Dockerfile, no admin or cron class.
- **Network-egress controls, interface contracts, report paths.** None listed by enumerate
  (`egressControls`, `contracts`, `reportPaths` empty). No schema validation at any
  interface (server.mjs:11-19 parses JSON and swallows a parse error into `{}`).

## AI surfaces

One model call site: `callModel` in lib/agent.mjs:27-31, a local stub standing in for a
provider call, reached by `ask` (lib/agent.mjs:33-43) from `POST /assistant`
(server.mjs:42-45). Its prompt joins every note of the workspace, each owner's email, and the
user's question (lib/agent.mjs:11-21); its output is parsed for `TOOL:send_email` and the email
sent with every note's text as the body (lib/agent.mjs:35-39). One capability finding (the
assistant), owned by the delegation pass.

## Effect inventory (draft) — the candidate list the delegation pass triages

The listing has no channel candidates (a web app). The candidate list is its 5 route handlers
and 3 effect-site members, written exactly as `map/raw/enumerate.json` writes them:

| candidate | evidence | draft disposition | channel slug |
|---|---|---|---|
| `route: GET /notes` | server.mjs:30 | read-only: returns the caller's notes, writes nothing | — |
| `route: POST /notes` | server.mjs:35 | effect: writes a note into the store | `note-create` |
| `route: POST /assistant` | server.mjs:42 | effect: the assistant's email send | `assistant-email-send` |
| `route: POST /sync` | server.mjs:47 | effect: pushes all notes to the backup service | `backup-push` |
| `route: POST /admin/purge` | server.mjs:52 | effect: deletes every note | `workspace-purge` |
| `http write (js) @ lib/sync.mjs` | lib/sync.mjs:8 | effect | `backup-push` |
| `message/mail send @ lib/agent.mjs` | lib/agent.mjs:35, lib/agent.mjs:39 | effect | `assistant-email-send` |
| `message/mail send @ lib/mailer.mjs` | lib/mailer.mjs:5 | effect (the transport the assistant invokes; no other caller) | `assistant-email-send` |

Fixed channel slugs (one finding each, the invocation boundary): `note-create`,
`assistant-email-send`, `backup-push`, `workspace-purge`. The delegation pass confirms or
corrects each disposition and records `map/effect-triage.yaml`.

## Census candidates handed to their passes (`map/census-triage.yaml`)

- `credential` (delegation pass, `populations.secrets`): `backupApiKey`
  (config/settings.mjs:6), `tokenTable` (lib/db.mjs:13). `secretConstants` is empty.
- `change-gates` (gates pass, `populations.changeGates`): empty, triaged `triage: []`.
- `model-call-telemetry` (context pass, `populations.modelCalls`):
  `model call: lib/agent.mjs` (lib/agent.mjs:27).

## Populations each pass closes

- **Ingested content** (delegation, `ingested-content`): the request body of `POST /notes`
  (note text, stored and later concatenated into the prompt) and of `POST /assistant` (the
  question), both through `readBody` (server.mjs:11-19); the model's output, parsed for a
  directive (lib/agent.mjs:35).
- **Non-obvious decisions** (legibility): ADR-0001 in-memory store; the fallback admin identity
  (lib/auth.mjs:9-12); fire-and-forget backup push (lib/sync.mjs:7-12); zero dependencies
  (server.mjs:1); the unauthenticated `/sync` (server.mjs:48).
- **Doc claims** (legibility): README.md:14 (4 endpoints), :16-19 (the endpoint list), :24
  (`node server.mjs`), :32 (`npm run test:all`), :35 (every endpoint covered by smoke);
  ADR-0001 claims (interface `lookup`, `notes`, `purgeAll`); config/settings.mjs:1 ("see README
  for environment notes"); routes/admin.mjs:5 (`DELETE /admin/purge`).
- **Modules** (context): server.mjs, lib/auth.mjs, lib/db.mjs, lib/agent.mjs, lib/mailer.mjs,
  lib/sync.mjs, routes/admin.mjs, config/settings.mjs.
- **Lessons recorded** (improvement): none observed beyond a TODO (config/settings.mjs:5), a plan
  not a lesson; the pass confirms.
- **Agent-consumable surface** (multiplayer): the five routes, all JSON over HTTP.

## Slice plan (every file is read; the target is 281 lines)

| pass | reads |
|---|---|
| 1 legibility | README.md, docs/adr/0001-storage-choice.md, the header comments of every code file |
| 2 context | every code file (module boundaries and imports), README.md, lib/agent.mjs for the model call |
| 3 gates | package.json, test/smoke.mjs, server.mjs:11-19 (input parsing), lib/auth.mjs |
| 4 verification | test/smoke.mjs, lib/sync.mjs (effect vs report), lib/mailer.mjs, lib/agent.mjs |
| 5 delegation | server.mjs, lib/*.mjs, routes/admin.mjs, config/settings.mjs, `map/raw/enumerate.json` |
| 6 improvement | README.md, docs/adr/, code comments (TODOs, fixture notes), package.json |
| 7 multiplayer | server.mjs, lib/auth.mjs, lib/db.mjs, lib/agent.mjs |

Not read: anything outside `targets/flawed-webapp/` (the sibling targets, the repository's
root CI), which is not under review.
