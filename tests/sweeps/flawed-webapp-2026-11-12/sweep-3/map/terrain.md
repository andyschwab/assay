---
type: doc
title: "flawed-webapp (notesbox) — Pass 0 terrain"
---
# Terrain — targets/flawed-webapp at 7f7c89d

Derived blind: no canon for this target was read, no prior run was in context. Every path below is
relative to `targets/flawed-webapp/`. The scope listing excludes `ANSWERS.yaml` (never opened).

## The map

- **What it is.** `notesbox`, a team notes HTTP API with an AI assistant that can email summaries
  (`README.md:1-5`, `package.json:2`). Version 0.3.1, private, ESM, zero dependencies.
- **Size.** 12 files, 281 lines: JavaScript (`.mjs`) 8 files / 198 lines; Markdown 2 files / 64
  lines (`README.md`, `docs/adr/0001-storage-choice.md`); JSON 1 file / 9 lines (`package.json`).
  No lockfile, no dependency manifest entries.
- **Entry points.** `server.mjs` (node:http server, one dispatcher over five routes,
  `server.mjs:26-57`); the only npm script is `start` (`package.json:6-8`).
- **Build / test / lint / CI.** No build, no lint, no typecheck config, no CI workflow, no hooks
  inside the target. One test file, `test/smoke.mjs` (one assertion, `test/smoke.mjs:8-9`), wired
  to no script; the README's `npm run test:all` (`README.md:32`) names a script `package.json` does
  not define.
- **Directory topology (all of it).** `server.mjs` (routing), `lib/` (`db.mjs` store and sessions,
  `auth.mjs` authentication, `agent.mjs` the AI assistant, `mailer.mjs` outbound mail, `sync.mjs`
  backup push), `routes/admin.mjs` (purge), `config/settings.mjs` (central settings),
  `docs/adr/` (one ADR), `test/` (smoke).
- **Docs surface.** `README.md` (endpoints, running, testing), `docs/adr/0001-storage-choice.md`
  (in-memory store behind an interface). Code-header comments in every module.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills, prompts directory or
  agent config in the target.
- **AI surface.** One: the assistant in `lib/agent.mjs` — a prompt built from the user's question
  and every workspace note (`lib/agent.mjs:11-21`), a stub model call (`lib/agent.mjs:27-31`, no
  provider SDK or API), and a `TOOL:send_email` directive parsed from the model's output that
  sends mail (`lib/agent.mjs:35-39`).

## Enumerated populations (map/raw/enumerate.json, the given input)

`populations.channelCandidates`: empty. `populations.routeHandlers`: empty (the handlers are
`if` branches in one `createServer` callback, a shape enumerate does not list).
`populations.effectSites`: one member, `http write (js)` (`lib/sync.mjs:8`).
`populations.secrets`, `secretConstants`, `changeGates`, `modelCalls`: empty.
`populations.containerClasses`: one member, `admin-role branch` (`lib/auth.mjs:12`,
`lib/auth.mjs:16`, `lib/db.mjs:5`). The populations below that the listing does not name are
still members: the triage closes the list, it does not bound the passes.

### Effect-triage candidate list (handed to the delegation pass)

| candidate (as enumerate.json writes it) | population | draft triage |
|---|---|---|
| `http write (js)` | effectSites | effect `backup-push` |

### Census candidates (handed to the owning passes)

| census | candidates | owner |
|---|---|---|
| `credential` (`populations.secrets`) | none listed | delegation |
| `change-gates` (`populations.changeGates`) | none listed | gates |
| `model-call-telemetry` (`populations.modelCalls`) | none listed | context |

Members the listing misses, found by reading: a hardcoded backup API key in
`config/settings.mjs:6` (credential); hardcoded bearer session tokens in `lib/db.mjs:13-17`
(credential); the stub model call in `lib/agent.mjs:27-34` (model call site).

## Effect inventory draft (fixed channel slugs)

| slug | invocable surface | where | draft shape |
|---|---|---|---|
| `assistant-email-send` | the assistant's `TOOL:send_email` directive, via `POST /assistant` | `lib/agent.mjs:35-39`, `lib/mailer.mjs:5-8` | external, irreversible, no gate between parse and send |
| `backup-push` | `POST /sync` → `pushBackup` | `server.mjs:47-50`, `lib/sync.mjs:5-13` | external HTTP write of every note, no authorization check |
| `workspace-purge` | `POST /admin/purge` → `handlePurge` → `purgeAll` | `server.mjs:52-54`, `routes/admin.mjs:6-10`, `lib/db.mjs:27-31` | internal, irreversible delete of all notes, behind `requireAdmin` |
| `note-create` | `POST /notes` | `server.mjs:35-40` | internal write to the in-memory store |

`GET /notes` (`server.mjs:30-33`) is read-only.

## Other populations

- **HTTP routes** (read from `server.mjs`): `GET /notes`, `POST /notes`, `POST /assistant`,
  `POST /sync`, `POST /admin/purge`, plus the 404 fallthrough.
- **Agent / principal classes**: member (`lib/db.mjs:3-4`), admin (`lib/db.mjs:5`), and the
  unauthenticated fallback identity, which is admin (`lib/auth.mjs:9-12`). Assess each separately.
- **Credentials**: `backupApiKey` (`config/settings.mjs:6`), the session token table
  (`lib/db.mjs:13-17`).
- **Ingestion points**: `POST /notes` body text (`server.mjs:36-38`), `POST /assistant` question
  (`server.mjs:43-44`); both reach the model prompt (`lib/agent.mjs:12-19`); the model's output is
  parsed for a directive (`lib/agent.mjs:35`).
- **Network-egress controls**: none in the target.
- **Interface contracts**: the ADR's storage interface (`docs/adr/0001-storage-choice.md:14-17`);
  `readBody` swallows malformed JSON (`server.mjs:16`).
- **Effect-vs-report paths**: `pushBackup` returns `ok: true` without awaiting the fetch
  (`lib/sync.mjs:8-13`); `sendEmail` returns `sent: true` from a log-only transport
  (`lib/mailer.mjs:6-8`).
- **Doc claims** (README): 4 endpoints (`README.md:14`), the endpoint list (`README.md:16-19`),
  `node server.mjs` (`README.md:24`), `npm run test:all` (`README.md:32`), every endpoint covered
  by the smoke suite (`README.md:35`).
- **Non-obvious decisions**: in-memory store behind an interface (ADR-0001); unauthenticated
  fallback to an admin identity (`lib/auth.mjs:9-12`); backup key in source (`config/settings.mjs:5-6`);
  fire-and-forget backup push (`lib/sync.mjs:7`); `/sync` with no authorization check
  (`server.mjs:48`); a stub model and a log-only mailer in the build (`lib/agent.mjs:4-7`,
  `lib/mailer.mjs:1-2`); the assistant reads every note in the workspace (`lib/agent.mjs:12`).
- **Modules (bounded contexts)**: `server.mjs`, `lib/db.mjs`, `lib/auth.mjs`, `lib/agent.mjs`,
  `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs`.
- **Lessons recorded**: none found as incident notes; a `TODO` (`config/settings.mjs:5`) and the
  ADR's deferred-persistence consequence (`docs/adr/0001-storage-choice.md:22-23`) are plans, not lessons.

## Slice plan

The target is 12 files; every pass reads the whole tree (each file is under 65 lines), so nothing
is sampled and nothing is left unread. Per dimension, the files that carry its weight:

- **Legibility**: `README.md`, `docs/adr/0001-storage-choice.md`, module header comments, `lib/auth.mjs`, `config/settings.mjs`, `lib/sync.mjs`, `server.mjs`.
- **Context**: all eight modules, `README.md`, `lib/agent.mjs` (the model call).
- **Gates**: `package.json`, `test/smoke.mjs`, `server.mjs` (`readBody`), `lib/db.mjs` (interface).
- **Verification**: `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `README.md:27-35`.
- **Delegation**: `server.mjs`, `lib/auth.mjs`, `lib/agent.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `lib/db.mjs`, `config/settings.mjs`.
- **Improvement**: `docs/adr/`, `config/settings.mjs:5`, `test/smoke.mjs` header, `README.md`.
- **Multiplayer**: `server.mjs` routes, `README.md:12-19`, `lib/auth.mjs`, `lib/agent.mjs:12`, `lib/db.mjs`.

Not read: anything outside `targets/flawed-webapp/` (out of scope), git history.
