---
type: doc
title: flawed-webapp terrain (Pass 0)
---
# Terrain — flawed-webapp (notesbox) at 7f7c89d

Derived blind: no canon for this target was read and no prior run is in context. Every
path below is relative to the target root (`targets/flawed-webapp/` of the checkout).

## The map

- **What it is.** `notesbox`, a team notes HTTP API with an AI assistant that answers over
  the workspace's notes and can email summaries (README.md:1-5; package.json:2-3).
- **Languages and size.** JavaScript ES modules only (`"type": "module"`, package.json:5):
  9 `.mjs` files, 2 Markdown docs, 1 manifest; 281 lines in all. Zero dependencies
  (package.json has no `dependencies`; server.mjs:1 says Node >= 20 `http`).
- **Entry points.** `node server.mjs` (README.md:23-25; package.json:7 `start`). The only
  package script is `start`; there is no `test`, `lint` or `build` script (package.json:6-8).
- **Tests.** One file, `test/smoke.mjs`, a single assertion on `authenticate`
  (test/smoke.mjs:8-9). No script, hook or CI job runs it. README.md:32 names
  `npm run test:all`, which package.json does not define.
- **CI / hooks.** None inside the target: no `.github/`, no hook directory, no lint or type
  config. (The checkout's own `.github/` sits at the repository root, outside the target,
  and is not under review.)
- **Directory topology (all of it).** `server.mjs` (router, 5 routes); `lib/` (agent, auth,
  db, mailer, sync); `routes/admin.mjs`; `config/settings.mjs`; `docs/adr/` (one ADR);
  `test/` (one smoke file); `README.md`; `package.json`.
- **Docs surface.** README.md (endpoints, running, testing); docs/adr/0001-storage-choice.md
  (in-memory store behind an interface). Code comments carry most rationale. The README's
  lines 7-10 are a fixture notice, not the app's voice; the passes read README.md from line
  12 on as the app's docs.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt
  files. The one prompt is built in code (lib/agent.mjs:11-21).

## Routes (the HTTP surface, read from server.mjs; the enumeration listed none)

| route | handler | auth | effect |
|---|---|---|---|
| `GET /notes` | server.mjs:30-33 | `authenticate` (server.mjs:27) | read-only |
| `POST /notes` | server.mjs:35-40 | `authenticate` | in-memory write (note-create) |
| `POST /assistant` | server.mjs:42-45 → lib/agent.mjs:33 | `authenticate` | model call; may send email |
| `POST /sync` | server.mjs:47-50 → lib/sync.mjs:5 | none beyond `authenticate` (server.mjs:48) | outbound HTTP push |
| `POST /admin/purge` | server.mjs:52-54 → routes/admin.mjs:6 | `requireAdmin` (routes/admin.mjs:7) | deletes all notes |

`authenticate` returns a default identity with `role: 'admin'` for an unknown or missing
token (lib/auth.mjs:9-12), so every route runs as admin for an anonymous caller.

## Effect inventory (draft; fixed channel slugs — authoring draws these, never invents one)

The candidate list is `map/raw/enumerate.json`: `channelCandidates` [] , `routeHandlers` [],
`effectSites` [`http write (js)` → lib/sync.mjs:8]. The delegation pass triages each
candidate in `map/effect-triage.yaml`. Effects the listing does not name are still findings.

| slug | invocable surface | call site | notes |
|---|---|---|---|
| `backup-push` | `POST /sync` → `pushBackup` | lib/sync.mjs:8-12 | external; ships every note with a hardcoded bearer key; fire-and-forget, errors swallowed (lib/sync.mjs:12), reports `ok: true` regardless (lib/sync.mjs:13). Covers effect-site `http write (js)`. |
| `assistant-email-send` | `POST /assistant` → `ask` → `sendEmail` | lib/agent.mjs:35-39; lib/mailer.mjs:5-8 | external, irreversible; recipient and subject come from the model's output; body is every note in the workspace (lib/agent.mjs:38). Fixture transport logs only (lib/mailer.mjs:6-7). |
| `workspace-purge` | `POST /admin/purge` → `handlePurge` → `purgeAll` | routes/admin.mjs:6-11; lib/db.mjs:27-31 | irreversible delete of every note; gate `requireAdmin`, which the default-admin fallback defeats. (Route comment says DELETE, server routes POST: routes/admin.mjs:5 vs server.mjs:52.) |
| `note-create` | `POST /notes` | server.mjs:35-40 | in-memory write by the caller; stored text later enters the model prompt. |

## AI surfaces (from a listing: the one prompt-building and model-call site)

- **assistant** — lib/agent.mjs:27-31 `callModel` (a stub standing in for a model call,
  lib/agent.mjs:4-7, 23-26), fed by `buildPrompt` (lib/agent.mjs:11-21). Untrusted input:
  the caller's question and every user's note text. Private data: all notes with owner
  emails. External effect: write (email via the TOOL directive, lib/agent.mjs:35-39).
  `populations.modelCalls` is empty (no provider SDK); the stub is still the census member.

## Container / agent classes (enumerated)

- `admin-role branch` (enumerate `containerClasses`): the default fallback identity is admin
  (lib/auth.mjs:12), the `requireAdmin` check (lib/auth.mjs:15-17), the seeded admin user
  (lib/db.mjs:5). Assess apart from the member class (lib/db.mjs:3-4).
- member (lib/db.mjs:3-4): role `member`, token-mapped (lib/db.mjs:13-17).

## Census candidates handed to the passes (SCHEMA.md §6f)

- `populations.secrets` → delegation (`credential`): **empty** → `triage: []`. Members the
  listing does not name still go in the census: the hardcoded `backupApiKey`
  (config/settings.mjs:5-6) and the hardcoded session token table (lib/db.mjs:13-17).
  `secretConstants` is also empty.
- `populations.changeGates` → gates (`change-gates`): **empty** → `triage: []`.
- `populations.modelCalls` → context (`model-call-telemetry`): **empty** → `triage: []`;
  the stub call site lib/agent.mjs:27 is a member outside the list.
- Ingested content (delegation, `ingested-content`): request bodies (server.mjs:11-18);
  note text into the prompt (lib/agent.mjs:12-15); the question into the prompt
  (lib/agent.mjs:19); the model's output parsed as a directive (lib/agent.mjs:35).

## Slice plan (the whole target is 281 lines; every pass may read all 12 files)

| pass | read first |
|---|---|
| 1 legibility | README.md, docs/adr/0001-storage-choice.md, comments in lib/*.mjs, config/settings.mjs:1 |
| 2 context | server.mjs, lib/*.mjs, routes/admin.mjs, config/settings.mjs, README.md |
| 3 gates | package.json, test/smoke.mjs, server.mjs:11-18 (body parse), lib/auth.mjs, README.md:27-35 |
| 4 verification | test/smoke.mjs, lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs, README.md:27-35 |
| 5 delegation | server.mjs, lib/agent.mjs, lib/auth.mjs, lib/db.mjs, lib/sync.mjs, lib/mailer.mjs, routes/admin.mjs, config/settings.mjs |
| 6 improvement | docs/adr/, README.md, comments carrying TODOs or lessons (config/settings.mjs:5) |
| 7 multiplayer | lib/db.mjs, lib/agent.mjs:11-21, lib/auth.mjs, server.mjs:30-33 |

Not read: the checkout outside `targets/flawed-webapp/`; git history.
