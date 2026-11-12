---
type: doc
title: "flawed-webapp — Pass 0 terrain (practice-review, blind)"
---
# Terrain — flawed-webapp (notesbox)

Derived blind: no canon exists for this target and no prior run was read. Every path below
is relative to the target root `targets/flawed-webapp/`; nothing else in the repository is
under review. Input: `map/raw/enumerate.json` (given; the enumeration ran before this pass).

## Map

- **Language:** JavaScript only, ES modules (`.mjs`), Node >= 20, zero runtime
  dependencies (`package.json:5`, `server.mjs:1`). 12 tracked files, ~280 lines.
- **Shape:** a `node:http` web app, "notesbox": team notes plus an AI assistant that can
  email summaries (`README.md:1-5`).
- **Entry points:** `server.mjs` (the server, `server.mjs:26`); `npm start` is the only
  package script (`package.json:6-8`). No build, no lint, no typecheck, no `test` script.
- **Tests:** `test/smoke.mjs` (one assertion over `authenticate`, `test/smoke.mjs:8-9`).
- **CI / hooks inside the target:** none. (A workflow at the repository root, outside the
  target, runs `test/smoke.mjs`; it is outside the review boundary and cannot be cited.)
  `populations.changeGates` is empty.
- **Docs:** `README.md`; one decision record, `docs/adr/0001-storage-choice.md`.
- **Agent-facing files:** none (no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompts
  directory). The only prompt is built in code (`lib/agent.mjs:11-21`).
- **Directory topology (all of it):** `server.mjs`, `lib/` (agent, auth, db, mailer, sync),
  `routes/` (admin), `config/` (settings), `docs/adr/`, `test/`.

## Populations handed to the passes (closed lists)

### Effect candidates (to Pass 5, delegation — triage in `map/effect-triage.yaml`)

`populations.channelCandidates` is empty (a web app: no CLI, skill or tool-def surface), so
the candidate list is the route handlers plus the effect sites, 8 candidates:

| candidate (exactly as enumerate.json writes it) | evidence | draft disposition |
|---|---|---|
| `route: GET /notes` | server.mjs:30 | read-only: returns the caller's notes, writes nothing |
| `route: POST /notes` | server.mjs:35 | effect `note-create` |
| `route: POST /assistant` | server.mjs:42 | effect `assistant-email-send` |
| `route: POST /sync` | server.mjs:47 | effect `workspace-backup-push` |
| `route: POST /admin/purge` | server.mjs:52 | effect `workspace-purge` |
| `http write (js) @ lib/sync.mjs` | lib/sync.mjs:8 | effect `workspace-backup-push` |
| `message/mail send @ lib/agent.mjs` | lib/agent.mjs:35, :39 | effect `assistant-email-send` |
| `message/mail send @ lib/mailer.mjs` | lib/mailer.mjs:5 | effect `assistant-email-send` |

**Channel slugs (fixed here; authoring draws from this list, never invents):**

- `note-create` — POST /notes writes a note into the in-memory store (`server.mjs:35-39`).
- `assistant-email-send` — the assistant parses a `TOOL:send_email` directive from model
  output and mails the whole note set (`lib/agent.mjs:35-39` → `lib/mailer.mjs:5-8`).
- `workspace-backup-push` — POST /sync posts every note to an external backup URL with a
  bearer key (`lib/sync.mjs:5-13`, `server.mjs:47-49`).
- `workspace-purge` — POST /admin/purge clears every note and every user's note list
  (`routes/admin.mjs:6-10` → `lib/db.mjs:27-31`).

### AI surfaces

One AI context: the assistant, `ask()` in `lib/agent.mjs:33-43`; a prompt built from every
note in the workspace plus the caller's question (`lib/agent.mjs:11-21`), a stub model
(`lib/agent.mjs:27-31`), and an outbound email effect. One `capability` finding (Pass 5).

### Agent / container classes

`populations.containerClasses`: one member, `admin-role branch` (`lib/auth.mjs:12`,
`lib/auth.mjs:16`, `lib/db.mjs:5`). The principal classes to assess separately: a member
token, the admin token, and the *unauthenticated fallback* identity, which is admin
(`lib/auth.mjs:9-12`).

### Census candidates (closed by `map/census-triage.yaml`)

- `credential` (Pass 5) ← `populations.secrets`: `backupApiKey` (config/settings.mjs:6),
  `tokenTable` (lib/db.mjs:13). `secretConstants` is empty.
- `change-gates` (Pass 3) ← `populations.changeGates`: empty → `triage: []`.
- `model-call-telemetry` (Pass 2) ← `populations.modelCalls`: `model call: lib/agent.mjs`
  (lib/agent.mjs:27).

### Judged populations (drawn and frozen here, before assessment)

- **Non-obvious decisions** (Pass 1, `decision-reconstruction`):
  D1 in-memory store behind a narrow interface (`lib/db.mjs:1`, ADR-0001);
  D2 unknown/missing token falls back to a default identity treated as admin (`lib/auth.mjs:9-12`);
  D3 the backup push is fire-and-forget with errors swallowed (`lib/sync.mjs:7-12`);
  D4 the backup API key is a literal in the settings module (`config/settings.mjs:5-6`);
  D5 a zero-dependency `node:http` server, no framework (`server.mjs:1-2`);
  D6 the mail transport is log-only (`lib/mailer.mjs:1-2`);
  D7 POST /sync carries no authorization check (`server.mjs:48`).
- **Doc claims** (Pass 1, `doc-freshness`), the README's concrete claims:
  C1 "4 endpoints" (`README.md:14`); C2 the endpoint list (`README.md:16-19`);
  C3 run with `node server.mjs` (`README.md:24`); C4 `npm run test:all` (`README.md:32`);
  C5 "every endpoint is covered by the smoke suite" (`README.md:35`);
  C6 the assistant "can email summaries to teammates" (`README.md:3-5`, `README.md:18`).
- **Modules** (Pass 2, `modules-standalone`): `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`,
  `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs`
  (8; tests and docs excluded).
- **Ingestion points** (Pass 5, `ingested-content`): I1 note text from POST /notes
  (`server.mjs:36-38`), later concatenated into the prompt (`lib/agent.mjs:12-15`);
  I2 the assistant question from POST /assistant (`server.mjs:43-44`, `lib/agent.mjs:19`);
  I3 model output parsed for a tool directive (`lib/agent.mjs:35`).
- **Incidents / lessons** (Pass 6): none recorded in the tree; the one forward-looking
  marker is a TODO (`config/settings.mjs:5`).
- **Agent-consumable surface** (Pass 7): the HTTP API (5 routes); no agent contract file.

## Slice plan (the whole target is small; every pass may read every file)

| pass | files |
|---|---|
| 1 legibility | README.md, docs/adr/0001-storage-choice.md, the code comments at D1–D7 |
| 2 context | all 8 modules, README.md, package.json |
| 3 gates | package.json, test/smoke.mjs, server.mjs (readBody), lib/auth.mjs |
| 4 verification | test/smoke.mjs, lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs, README.md |
| 5 delegation | server.mjs, lib/*, routes/admin.mjs, config/settings.mjs |
| 6 improvement | config/settings.mjs, docs/adr/, README.md, test/smoke.mjs |
| 7 multiplayer | server.mjs, lib/auth.mjs, lib/db.mjs, lib/agent.mjs, README.md |

Not read: nothing outside `targets/flawed-webapp/`; the target's answer key is never opened.
