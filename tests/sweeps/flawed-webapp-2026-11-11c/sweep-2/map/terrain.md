---
type: doc
title: "flawed-webapp (notesbox) — Pass 0 terrain"
---
# Pass 0 — Terrain: notesbox (`targets/flawed-webapp/`)

Every path below is relative to the target root. Derived blind: no canon exists for this
target (no `canon/` in the engine at v0.8.0) and no prior run was read. The enumeration
input `map/raw/enumerate.json` was given and read; nothing was executed.

## Map

- **What it is.** "notesbox", a small team-notes HTTP API with an AI assistant that answers
  questions over the workspace's notes and can email summaries (`README.md:1-5`).
- **Language and size.** JavaScript (ES modules, `.mjs`), Node >= 20, zero dependencies
  (`server.mjs:1`, `package.json:1-9`). 12 reviewable files, about 280 lines.
- **Topology (the load-bearing files).**
  - `server.mjs` — the HTTP server and the only router: five routes dispatched inline
    (`server.mjs:30-54`), authentication resolved on every request (`server.mjs:27`).
  - `lib/auth.mjs` — bearer-token authentication and the admin check (`lib/auth.mjs:5-17`).
  - `lib/db.mjs` — the in-memory store: users, notes, the token table, `purgeAll`
    (`lib/db.mjs:2-31`).
  - `lib/agent.mjs` — the AI assistant: prompt build, stub model call, tool-directive parse,
    email send (`lib/agent.mjs:11-43`).
  - `lib/mailer.mjs` — outbound mail (log-only in this build, `lib/mailer.mjs:1-9`).
  - `lib/sync.mjs` — the backup push to an outside service (`lib/sync.mjs:5-14`).
  - `routes/admin.mjs` — the admin purge handler (`routes/admin.mjs:6-11`).
  - `config/settings.mjs` — central settings, including an inline backup API key
    (`config/settings.mjs:2-9`).
  - `test/smoke.mjs` — the one test file (`test/smoke.mjs:1-11`).
- **Build / test / lint / CI.** `package.json` declares only `start` (`package.json:6-8`); no
  test, lint or typecheck script. No CI workflow, hook or config-driven check inside the
  target tree. The README names `npm run test:all` (`README.md:32`), which `package.json` does
  not define. The repository root above the target is out of scope for this review.
- **Docs surface.** `README.md` (endpoints, running, testing) and one ADR,
  `docs/adr/0001-storage-choice.md`.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompts files.
  The only prompt is built in code (`lib/agent.mjs:16-20`).

## The enumeration input (map/raw/enumerate.json)

- `channelCandidates`: empty. `routeHandlers`: empty (the router is a hand-written
  `http.createServer` dispatcher, not a framework route file, so the listing sees none).
- `effectSites`: one member, `http write (js)` (`lib/sync.mjs:8`).
- `containerClasses`: one member, `admin-role branch` (`lib/auth.mjs:12`, `lib/auth.mjs:16`,
  `lib/db.mjs:5`); assessed in the delegation pass as its own class.
- `secrets`, `secretConstants`, `egressControls`, `contracts`, `reportPaths`: empty. The
  listing did not name the inline key at `config/settings.mjs:6`; the credential census
  below enumerates it from reading the tree.

Since the listing has no channel candidates and no route handlers, the invocable surface is
the route + effect-lib topology read from `server.mjs:30-54`; the triage closes the one
listed candidate, and the passes record every effect below regardless.

## Effect inventory (fixed slugs; one finding each, in the delegation pass)

| id | channel | invoked by | sink |
|---|---|---|---|
| F-501 | `email-send` | `POST /assistant` → `ask` (`server.mjs:42-44`) | `sendEmail` (`lib/agent.mjs:39`, `lib/mailer.mjs:5-8`) |
| F-502 | `backup-push` | `POST /sync` (`server.mjs:47-49`) | `fetch` POST to the backup URL (`lib/sync.mjs:8-12`) |
| F-503 | `workspace-purge` | `POST /admin/purge` (`server.mjs:52-53`) | `purgeAll` (`routes/admin.mjs:8`, `lib/db.mjs:27-31`) |
| F-504 | `note-create` | `POST /notes` (`server.mjs:35-39`) | `notes.set` (`server.mjs:38`) |

`GET /notes` (`server.mjs:30-33`) is read-only and is not an effect.

**AI surfaces (capabilities).** One LLM call site: `ai-assistant`, `callModel` over a prompt
built from every note in the workspace plus the caller's question (`lib/agent.mjs:11-34`),
whose output is parsed for a `TOOL:send_email` directive that sends mail
(`lib/agent.mjs:35-39`). Recorded as capability F-505 in the delegation pass.

**Container / identity classes.** member (token-resolved), admin (token-resolved `u3`), and
the unauthenticated fallback identity, which is admin (`lib/auth.mjs:12`). Each is assessed
separately in delegation.

## Effect triage

`map/effect-triage.yaml` closes the one candidate: `http write (js)` → F-502 (`backup-push`).

## Censuses (populations frozen here, before assessment)

Id offsets per pass file (a dispatch convenience only): legibility F-100, context F-200,
gates F-300, verification F-400, delegation F-500, improvement F-600, multiplayer F-700.

1. **change-gates** (deterministic-gates, `contract`). Every check the target runs on a change
   before it lands or ships. Inside the target: no CI job, no hook, no config-driven check;
   the one check that exists is the smoke test file `test/smoke.mjs`, which no script runs.
   Population: 1 member (the smoke suite).
2. **credential** (delegation, `control`). Every secret the running app reads:
   (a) the backup API key, inline at `config/settings.mjs:6`, read at `lib/sync.mjs:10`;
   (b) the bearer-token table, inline at `lib/db.mjs:13-17`, read at `lib/db.mjs:21`.
   Population: 2 members.
3. **doc-freshness** (context-economy, `artifact`). Every concrete claim in the README:
   C1 "4 endpoints" (`README.md:14`); C2 `GET /notes` lists your notes (`README.md:16`);
   C3 `POST /notes` creates a note (`README.md:17`); C4 `POST /assistant` asks the assistant,
   which can email (`README.md:18`); C5 `POST /sync` pushes to backup (`README.md:19`);
   C6 `node server.mjs` runs it (`README.md:24`); C7 `npm run test:all` runs the suite
   (`README.md:32`); C8 every endpoint is covered by the smoke suite (`README.md:35`).
   Population: 8 members.
4. **modules-standalone** (context-economy, `artifact`). Every source module: `server.mjs`,
   `lib/agent.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`,
   `routes/admin.mjs`, `config/settings.mjs`. Population: 8 members.
5. **decision-reconstruction** (artifact-legibility, `artifact`). Non-obvious decisions:
   D1 in-memory store behind a narrow interface (`lib/db.mjs:1`, ADR-0001);
   D2 an unknown or missing token falls back to a default admin identity (`lib/auth.mjs:9-12`);
   D3 the backup API key held inline in config (`config/settings.mjs:5-6`);
   D4 the backup push is fire-and-forget with errors swallowed (`lib/sync.mjs:7-12`);
   D5 `POST /sync` carries no authorization check (`server.mjs:48`);
   D6 the mailer is log-only (`lib/mailer.mjs:1-2`);
   D7 zero dependencies, raw `node:http` (`server.mjs:1-2`).
   Population: 7 members.
6. **effect-provability** (verification, `control`). One per effect channel above: F-501..F-504's
   channels. Population: 4 members.
7. **agent-access-surface** (multiplayer, `artifact`). Every interface offered a caller: the
   five HTTP routes `GET /notes`, `POST /notes`, `POST /assistant`, `POST /sync`,
   `POST /admin/purge`. Population: 5 members.
8. **incidents-became-mechanisms** (improvement-loop, `process`). No lesson, incident,
   postmortem or lessons file is recorded in the tree (the one TODO at `config/settings.mjs:5`
   is a plan, excluded). Population: 0 members; no census row is written, and the
   improvement pass records the absence as a finding.

## Slice plan

The target is small enough that every pass reads all 12 files; each pass's focus:

- **Legibility:** `docs/adr/0001-storage-choice.md`, `README.md`, the comments carrying
  rationale in `lib/*.mjs`, `server.mjs`, `config/settings.mjs`; census 5.
- **Context:** `README.md`, every module; censuses 3 and 4; model-tier and spend records
  (`lib/agent.mjs`).
- **Gates:** `package.json`, `test/smoke.mjs`, `README.md:27-35`; census 1; interface
  contracts at the HTTP boundary (`server.mjs:11-19`).
- **Verification:** `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `routes/admin.mjs`,
  `server.mjs`, `test/smoke.mjs`; census 6.
- **Delegation:** every effect and the capability above, `lib/auth.mjs`, `lib/db.mjs`,
  `config/settings.mjs`; census 2; the identity classes.
- **Improvement:** agent-spec files (none), `README.md`, the ADR, TODOs, any telemetry the app
  emits by design (`lib/mailer.mjs:7`, `server.mjs:60`).
- **Multiplayer:** `server.mjs` routes, `README.md:12-19`, `lib/db.mjs` (shared vs per-user
  state), `lib/agent.mjs` (whose notes the assistant reads); census 7.

Not read: anything outside `targets/flawed-webapp/`, and the answer sheet, which is never
opened.
