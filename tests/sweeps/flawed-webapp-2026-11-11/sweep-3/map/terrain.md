---
confidential: true
type: doc
title: "flawed-webapp — Pass 0 terrain"
---
# Terrain — flawed-webapp (notesbox) at 7f7c89d

**Scope.** The repository under review is `targets/flawed-webapp/` of `andyschwab/assay-fixtures`
at `7f7c89d823153c702c207b1f36c6c2ce26217ceb` (branch `main`, committed 2026-10-30T15:12:42-06:00,
shallow clone). Every evidence path in this run is relative to `targets/flawed-webapp/`. Nothing
outside that directory is evidence; `ANSWERS.yaml` is the answer sheet and was not opened.

**Canon.** None. The engine's `map/canon/` holds only its README (no `flawed-webapp.yaml`), so the
populations below are derived blind (METHOD Pass 0): from a listing and a grep of the tree, with no
prior run in context. This terrain is the proposed first canon (a reviewed diff, not ratified here).

**Commands not run.** This lane executes nothing: `node assay.mjs enumerate` was not run. Its
CHANNEL CANDIDATES were reproduced by hand from a file listing plus a grep for exported functions,
`fetch(`, `console.log`, `writeHead`, `process.env` and `TOOL:` across every `.mjs` file. The
consumer may run `enumerate --run` as the coverage gate.

## Map

| | |
|---|---|
| Size | 12 files, 281 lines (excluding the answer sheet) |
| Languages | JavaScript ES modules (`.mjs`, 9 files, ~217 lines); Markdown (2 files, 64 lines); JSON (1) |
| Dependencies | none: `package.json` has no `dependencies`; server is Node's `node:http` |
| Build | none. `npm start` → `node server.mjs` (`package.json:7`) |
| Test | `test/smoke.mjs` (11 lines, one assertion). No `test` script in `package.json`; README names `npm run test:all` (`README.md:32`), which does not exist |
| Lint / typecheck | none |
| CI | none inside the target. (The fixtures repository has a workflow at its root; it is outside the scope and was not read.) |
| Docs | `README.md` (app voice below a fixture notice), `docs/adr/0001-storage-choice.md` (one ADR) |
| Agent-facing files | none: no CLAUDE.md, AGENTS.md, .cursorrules, skills or agent config. The only prompt is in code (`lib/agent.mjs:16-20`) |
| Config | `config/settings.mjs` (port, backup URL, a hardcoded backup API key, mail-from, admin emails) |
| Env reads | none: no `process.env` anywhere |

**Directory topology** (all load-bearing; the tree is small enough to read whole):
`server.mjs` (router), `lib/` (auth, db, agent, mailer, sync), `routes/` (admin), `config/`,
`docs/adr/`, `test/`.

## Populations (closed lists)

### HTTP route handlers (5) — `server.mjs`
| Route | Handler | Evidence |
|---|---|---|
| `GET /notes` | inline, filters by `user.id` | `server.mjs:30-33` |
| `POST /notes` | inline, `notes.set` | `server.mjs:35-40` |
| `POST /assistant` | `ask()` in `lib/agent.mjs` | `server.mjs:42-45` |
| `POST /sync` | `pushBackup()` in `lib/sync.mjs` | `server.mjs:47-50` |
| `POST /admin/purge` | `handlePurge()` in `routes/admin.mjs` | `server.mjs:52-54` |

Every request first passes `authenticate()` (`server.mjs:27`; `lib/auth.mjs:5-13`).

### Effect channels (canonical slugs — passes draw from this list, never invent)
| Slug | Invocation boundary | Mechanism | Evidence |
|---|---|---|---|
| `email-send` | the assistant's `TOOL:send_email` directive, parsed from model output | `sendEmail()` (log-only transport in this build; comment says production posts to a mail relay) | `lib/agent.mjs:35-39`, `lib/mailer.mjs:5-8` |
| `backup-push` | `POST /sync` | `pushBackup()` → `fetch(settings.backupUrl)` with bearer key, full note set | `server.mjs:47-50`, `lib/sync.mjs:5-13` |
| `note-create` | `POST /notes` | in-memory `notes.set` | `server.mjs:35-40` |
| `workspace-purge` | `POST /admin/purge` | `purgeAll()` clears every note and every user's note list | `routes/admin.mjs:6-11`, `lib/db.mjs:27-31` |

Out of scope as effects (read-only, triaged): `GET /notes` (reads the caller's notes,
`server.mjs:30-33`); the assistant's text answer (returned to the caller, `lib/agent.mjs:40-42`);
`server.listen` boot log (`server.mjs:59-61`).

### AI surfaces (capabilities = LLM call sites) — 1
| Name | Call site | Untrusted input | Private data | External effect |
|---|---|---|---|---|
| `assistant` | `callModel(buildPrompt(user, question))` (`lib/agent.mjs:34`); the model is a stub (`lib/agent.mjs:27-31`) | user question + every note in the workspace, authored by any user (`lib/agent.mjs:12-19`) | all workspace notes and owner emails (`lib/agent.mjs:12-15`) | write: email (`lib/agent.mjs:35-39`) |

### Credentials (census: `credential`) — 2
No site reads the environment. Values are not reproduced in this run.
| Item | Shape | Where defined | Where used |
|---|---|---|---|
| `backup-api-key` | high-entropy token with a vendor-style prefix, literal in source, `TODO: move to env` | `config/settings.mjs:5-6` | bearer header, `lib/sync.mjs:10` |
| `session-tokens` | static bearer-token table (three short literal tokens mapped to users) | `lib/db.mjs:13-17` | `lib/auth.mjs:6-7`, `lib/db.mjs:20-24` |

### Container / agent classes
None: no Dockerfile, compose, or deployment manifest. One process class (the Node server).
Principal classes in the code: member, admin (`lib/db.mjs:2-6`), and the synthetic fallback
identity (`lib/auth.mjs:12`).

### Network-egress controls
None found: one outbound `fetch` (`lib/sync.mjs:8`), no allow-list or URL policy.

### Interface contracts
The ADR's storage interface (`lookup`, the `notes` map surface, `purgeAll`; `docs/adr/0001-storage-choice.md:14-17`)
— implemented in `lib/db.mjs`, pinned by no test or schema. Request bodies are parsed without a
schema (`server.mjs:11-19`).

### Delivery / effect-vs-report paths (3)
`pushBackup` returns `{ ok: true }` without awaiting the fetch (`lib/sync.mjs:8-13`); `sendEmail`
returns `{ sent: true }` unconditionally (`lib/mailer.mjs:8`); `ask` reports `emailed: to`
(`lib/agent.mjs:40`).

### Decisions (census: `decision-reconstruction`) — candidates
ADR-0001 in-memory store behind an interface; the auth fallback identity; the log-only mailer;
the fire-and-forget backup push; zero dependencies.

### Modules (census: `modules-standalone`) — 7
`server.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/agent.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`
(`config/settings.mjs` is data).

### Docs (census: `doc-freshness`) — 2
`README.md`, `docs/adr/0001-storage-choice.md`.

### Lessons / incidents (census: `incidents-became-mechanisms`) — 0
No incident log, changelog, or lessons file in the tree.

## Proposed census subject_types (SCHEMA §2, fixed)
`decision-reconstruction`: artifact · `modules-standalone`: artifact · `effect-provability`: control ·
`gates-coverage`: contract · `credential`: control · `incidents-became-mechanisms`: process ·
`doc-freshness`: artifact · `agent-access-surface`: artifact.

## Slice plan (the tree is 281 lines: every pass may read all of it; these are each pass's focus)
1. **Legibility** — `README.md`, `docs/adr/0001-storage-choice.md`, header comments of every `.mjs`, `lib/auth.mjs`, `lib/sync.mjs`.
2. **Context** — `README.md` (oldest claims vs code), `package.json`, `server.mjs`, each module's boundary, `lib/agent.mjs` (model tier / spend).
3. **Gates** — `test/smoke.mjs`, `package.json`, `README.md:27-35`, `server.mjs`, `lib/db.mjs` (interface), `server.mjs:11-19` (body parsing).
4. **Verification** — `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `test/smoke.mjs`; one finding per effect channel for provability.
5. **Delegation** — every effect channel above (one `effect` finding each), the `assistant` capability, `lib/auth.mjs`, `routes/admin.mjs`, `config/settings.mjs`, `lib/db.mjs`.
6. **Improvement** — `README.md`, ADR, `config/settings.mjs:5` (TODO), absence of an agent spec / lesson store; telemetry by design (`console.log` sites).
7. **Multiplayer** — routes as the agent-consumable surface, `lib/db.mjs` (shared vs per-user state), `lib/agent.mjs` (cross-user reads), `lib/auth.mjs` (who acts as whom).

Not read: nothing in scope was skipped.
