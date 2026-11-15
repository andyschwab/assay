---
confidential: true
type: doc
title: flawed-webapp terrain (Pass 0)
---
# Terrain — targets/flawed-webapp at 7f7c89d

Derived blind: no canon for this target was read, and no prior run was in context. Every path
below is relative to `targets/flawed-webapp/`. The enumeration (`map/raw/enumerate.json`,
version 2, 13 files counted) was given as input and is the source of every candidate list here.

## The map

- **What it is:** `notesbox`, a small team-notes HTTP API with an AI assistant that can email
  summaries (README.md:1-5). Node ES modules, zero dependencies, `node:http` (server.mjs:1-3,
  package.json:1-9). One language (JavaScript, `.mjs`), about 230 lines of code across 9 source
  files, plus README.md, one ADR and one test file.
- **Build / test / lint entry points:** package.json declares one script, `start`
  (package.json:6-8). No `test`, `test:all`, lint or typecheck script; no lockfile; no
  dependencies. The README tells the reader to run `npm run test:all` (README.md:32), which
  package.json does not declare. One test file, `test/smoke.mjs`, a plain-node assert script.
- **CI / hooks inside the reviewed tree:** none. Enumerate lists `changeGates` empty. (Outside
  the reviewed tree, the fixture repository has its own workflow; it is not under review, not
  cited and not counted.)
- **Directory topology (all of it):**
  - `server.mjs` — the HTTP server and the whole route dispatch (server.mjs:26-57).
  - `lib/` — `agent.mjs` (assistant: prompt build, stub model, tool-directive parse, email),
    `auth.mjs` (bearer-token resolve with a default-admin fallback), `db.mjs` (in-memory users,
    notes, token table, purge), `mailer.mjs` (log-only mail transport), `sync.mjs` (backup push).
  - `routes/admin.mjs` — the purge handler behind `requireAdmin`.
  - `config/settings.mjs` — central settings, including a backup API key literal.
  - `docs/adr/0001-storage-choice.md` — the one decision record.
  - `test/smoke.mjs` — the one test.
- **Docs surface:** README.md (endpoints, running, testing), the ADR. No architecture page.
- **Agent-facing files:** none (no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt
  files). The one prompt is inline in code (lib/agent.mjs:16-20).
- **AI surfaces (from the listing):** one model call site, `model call: lib/agent.mjs`, a local
  stub `callModel` (lib/agent.mjs:27-31) called in place of a provider. One AI context: the
  `ask` path (lib/agent.mjs:33-43), where the user's question and every workspace note from every
  user meet in one prompt (lib/agent.mjs:11-20) and the reply's `TOOL:send_email` line drives an
  email (lib/agent.mjs:35-39).
- **Container / agent classes:** one process. Enumerate lists one distinct class, the
  `admin-role branch`: the default identity `authenticate` returns for a missing or unknown
  token carries `role: 'admin'` (lib/auth.mjs:9-12), and `requireAdmin` reads the role
  (lib/auth.mjs:15-16). Assess the admin class separately from the member class.

## Effect inventory draft (the candidate list the delegation pass triages)

`channelCandidates` is empty (a web app). The candidate list is the 5 `routeHandlers` plus the 3
`effectSites` (8 candidates); `excluded` is empty. Channel slugs are fixed here; authoring draws
them from this table.

| candidate (exactly as enumerate writes it) | first reading | channel slug |
|---|---|---|
| `route: GET /notes` | reads: filters notes by owner, calls no write site (server.mjs:30-33) | — (likely out of scope, `route-reads-only`) |
| `route: POST /notes` | writes a note into the in-memory store (server.mjs:35-39) | `note-create` |
| `route: POST /assistant` | runs `ask`, which may send an email (server.mjs:42-45, lib/agent.mjs:33-43) | `assistant-email-send` |
| `message/mail send @ lib/agent.mjs` | the `sendEmail(to, subject, body)` call driven by model output (lib/agent.mjs:39) | `assistant-email-send` |
| `message/mail send @ lib/mailer.mjs` | the mail transport the call reaches; log-only in this build by its own comment (lib/mailer.mjs:1-8) | `assistant-email-send` |
| `route: POST /sync` | pushes every note to the backup service, no authorization check (server.mjs:47-50) | `backup-push` |
| `http write (js) @ lib/sync.mjs` | the `fetch` POST to the backup URL with a bearer key, errors swallowed (lib/sync.mjs:8-12) | `backup-push` |
| `route: POST /admin/purge` | clears every note of every user behind `requireAdmin` (server.mjs:52-54, routes/admin.mjs:6-10, lib/db.mjs:27-31) | `workspace-purge` |

No candidate carries a signal (every `signals` list is empty).

## Closed census candidates (handed to their owning passes)

- `credential` (delegation, `populations.secrets`): `backupApiKey` (config/settings.mjs:6),
  `tokenTable` (lib/db.mjs:13). `secretConstants` is empty.
- `change-gates` (gates, `populations.changeGates`): empty — triaged `triage: []`.
- `model-call-telemetry` (context, `populations.modelCalls`): `model call: lib/agent.mjs`
  (lib/agent.mjs:27).

## Populations the terrain enumerates and freezes (one finding per member)

- **Non-obvious decisions (legibility, `decision-reconstruction`):**
  D1 in-memory store behind a narrow interface (lib/db.mjs:1, docs/adr/0001-storage-choice.md);
  D2 default identity treated as admin when the token is missing or unknown (lib/auth.mjs:9-12);
  D3 the backup API key kept as a literal in settings (config/settings.mjs:5-6);
  D4 the backup push fired without awaiting, its errors swallowed (lib/sync.mjs:7-13);
  D5 a zero-dependency `node:http` server with hand-rolled dispatch (server.mjs:1-3);
  D6 email driven by a plain-text `TOOL:send_email` directive parsed from the model's reply
  (lib/agent.mjs:18, lib/agent.mjs:35);
  D7 `POST /sync` served with no authorization check (server.mjs:48).
- **Doc claims (legibility, `doc-freshness`):** C1 "The API exposes 4 endpoints" (README.md:14);
  C2 the four listed endpoints and their purposes (README.md:16-19); C3 running with
  `node server.mjs` (README.md:24); C4 `npm run test:all` runs the full suite (README.md:32);
  C5 "Every endpoint is covered by the smoke suite" (README.md:35); C6 the assistant emails
  summaries "to teammates" (README.md:3-5, README.md:18).
- **Modules (context, `modules-standalone`):** server.mjs, lib/agent.mjs, lib/auth.mjs,
  lib/db.mjs, lib/mailer.mjs, lib/sync.mjs, routes/admin.mjs, config/settings.mjs (8). The test
  file and the docs are not modules.
- **Interfaces (multiplayer, `agent-access-surface`):** the 5 routes above. No CLI, tool,
  screen or data format is offered.
- **Ingestion points (delegation, `ingested-content`):** the `POST /notes` body text, stored and
  later placed in every assistant prompt (server.mjs:36-38, lib/agent.mjs:12-15); the
  `POST /assistant` question, placed in the prompt (server.mjs:43-44, lib/agent.mjs:19).
- **Lessons (improvement, `incidents-became-mechanisms`):** none found by listing — no incident
  note, postmortem, lessons file or fix naming a cause. An absence, recorded outside the census.
- **Backlog records (improvement context `backlog-records`):** the `TODO` in
  config/settings.mjs:5; the deferred-persistence note in docs/adr/0001-storage-choice.md:22-23.
- **Interface contracts:** none (no schema validator, no lockstep test); request bodies are
  parsed with a silent fallback to `{}` (server.mjs:16).
- **Network-egress controls:** none in the tree.
- **Delivery / effect-vs-report paths:** `pushBackup` returns `{ ok: true }` without awaiting
  the fetch (lib/sync.mjs:8-13); `sendEmail` returns `{ sent: true }` after a log line
  (lib/mailer.mjs:7-8); the assistant reports `emailed: to` (lib/agent.mjs:40).

## Slice plan

The target is small enough that every pass reads every source file it needs; nothing is left
unread. Per pass:

- **1 Legibility:** README.md, docs/adr/0001-storage-choice.md, and the decision sites D1-D7
  (lib/db.mjs, lib/auth.mjs, config/settings.mjs, lib/sync.mjs, server.mjs, lib/agent.mjs,
  routes/admin.mjs, package.json).
- **2 Context:** the 8 modules, test/smoke.mjs (which module it imports), README.md as the entry
  doc, lib/agent.mjs for the model call.
- **3 Gates:** package.json, test/smoke.mjs, server.mjs (body parse), lib/auth.mjs, README.md.
- **4 Verification:** test/smoke.mjs, lib/sync.mjs, lib/mailer.mjs, lib/agent.mjs, server.mjs.
- **5 Delegation:** server.mjs, lib/agent.mjs, lib/auth.mjs, lib/db.mjs, lib/mailer.mjs,
  lib/sync.mjs, routes/admin.mjs, config/settings.mjs.
- **6 Improvement:** every file, for lessons and backlog records; README.md and the ADR.
- **7 Multiplayer:** server.mjs, README.md, lib/agent.mjs, lib/db.mjs, lib/auth.mjs.

Not read by any pass: `ANSWERS.yaml` (never opened).
