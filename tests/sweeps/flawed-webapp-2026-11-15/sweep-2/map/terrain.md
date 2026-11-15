---
confidential: true
type: doc
title: "flawed-webapp — terrain (Pass 0, blind)"
---
# Terrain — flawed-webapp (notesbox)

Derived blind: no canon exists for this target in the engine checkout, and no prior run was in
context. Every path below is relative to `targets/flawed-webapp/`. The planted-answers file is
excluded from every listing and is never cited.

## Checkout

- repository: andyschwab/assay-fixtures, branch `main` (origin/main contains the head), checked out detached
- head: `7f7c89d823153c702c207b1f36c6c2ce26217ceb`, committed 2026-10-30T15:12:42-06:00
- shallow: yes (bounded fetch, `--depth=3000`)
- method: andyschwab/assay at `a17104d714ec76259e6d793954371885965f784a` (`map/METHOD.md`, `map/SCHEMA.md`, `map/passes.yaml`, `yardstick/requirements.yaml`)
- enumeration input: `map/raw/enumerate.json` (schema enumerate v2, 13 files, given; not re-run)

## The map

- **Languages:** JavaScript (Node ES modules, `.mjs`) only; Markdown docs. 12 tracked files, ~280 lines.
- **Size:** tiny. Every file is read whole by the pass that owns it.
- **Build / test / lint entry points:** `package.json:6-8` declares one script, `start` (`node server.mjs`). No test, lint or typecheck script. `test/smoke.mjs` exists but no script, hook or CI runs it. README claims `npm run test:all` (`README.md:32`), which `package.json` does not define.
- **CI / hooks:** none inside the target (no `.github/`, no hook config, no lint/typecheck config). `populations.changeGates` is empty.
- **Dependencies:** none (`package.json` has no `dependencies`; `server.mjs:1` states zero dependencies, `node:http`).
- **Agent-facing files:** none (no CLAUDE.md, AGENTS.md, .cursorrules, skills or agent configs). The one AI surface is the in-app assistant (`lib/agent.mjs`), whose model call is a local stub (`lib/agent.mjs:27`).
- **Docs surface:** `README.md` (endpoints, running, testing), `docs/adr/0001-storage-choice.md` (one ADR, not linked from the README).

### Directory topology (load-bearing)

| path | role |
|---|---|
| `server.mjs` | `node:http` server; the whole route dispatch (5 routes, `server.mjs:30-54`) |
| `lib/auth.mjs` | bearer-token authentication; unknown token falls back to an admin identity (`lib/auth.mjs:12`) |
| `lib/db.mjs` | in-memory store: users, notes, token table, `purgeAll` |
| `lib/agent.mjs` | the AI assistant: prompt over all notes + user question, stub model, `TOOL:send_email` directive parse → `sendEmail` |
| `lib/mailer.mjs` | outbound mail (log-only transport in this build) |
| `lib/sync.mjs` | backup push of all notes to an external URL with a bearer key |
| `routes/admin.mjs` | admin purge handler |
| `config/settings.mjs` | settings, including a literal backup API key |
| `docs/adr/` | decision records (one) |
| `test/` | one smoke script (not wired to any runner) |

### Container / agent classes

One process class (the server). Enumerate lists one distinct agent class: the **admin-role branch**
(`lib/auth.mjs:12`, `lib/auth.mjs:16`, `lib/db.mjs:5`): any request with an unknown or missing token
is resolved to `{ id: 'default', role: 'admin' }`. Assess the admin class separately from the member
class: an admin-only privilege (the purge) is reachable by every unauthenticated caller.

## Effect inventory draft (closed candidate list: `populations.channelCandidates` + `routeHandlers` + `effectSites`)

`channelCandidates` is empty (a web app with no CLI/skill/tool-def surface), so the invocable surface
is the route + effect-site topology. 8 candidates; `populations.excluded` is empty.

| candidate (as enumerate writes it) | where | draft channel slug | draft scope |
|---|---|---|---|
| `route: GET /notes` | `server.mjs:30` | — | read-only: filters notes by owner, calls no write site (`route-reads-only`) |
| `route: POST /notes` | `server.mjs:35` | `note-create` | in: method writes (`server.mjs:38`) |
| `route: POST /assistant` | `server.mjs:42` | `assistant-email-send` | in: method writes; handler reaches `sendEmail` via `ask` (`lib/agent.mjs:39`) |
| `message/mail send @ lib/agent.mjs` | `lib/agent.mjs:39` | `assistant-email-send` | client call reached at run time from `server.mjs:44` |
| `message/mail send @ lib/mailer.mjs` | `lib/mailer.mjs:5` | `assistant-email-send` | client call; its one importer is `lib/agent.mjs:9` |
| `route: POST /sync` | `server.mjs:47` | `workspace-backup-push` | in: method writes; calls `pushBackup` |
| `http write (js) @ lib/sync.mjs` | `lib/sync.mjs:8` | `workspace-backup-push` | client call reached at run time from `server.mjs:49` |
| `route: POST /admin/purge` | `server.mjs:52` | `workspace-purge` | in: method writes; calls `purgeAll` (`lib/db.mjs:27`) |

Fixed channel slugs (draw from these, never invent): `note-create`, `assistant-email-send`,
`workspace-backup-push`, `workspace-purge`. The delegation pass owns the triage, the scope clauses,
the checklist answers and the descriptors; this table is the draft it starts from.

No candidate carries a signal (every `signals` list is empty).

## AI surfaces

| surface | evidence | note |
|---|---|---|
| assistant AI context (`ask`) | `lib/agent.mjs:33-43` | untrusted input (the question, and every member's note text) + private data (all workspace notes, owners' emails) + outward write (email via the parsed `TOOL:send_email` directive) in one context — the trifecta candidate (`capability` finding, delegation pass) |
| model call site | `lib/agent.mjs:27` | local stub standing in for a provider call (`model call: lib/agent.mjs`) |
| outward AI output | `lib/agent.mjs:39`, `config/settings.mjs:7` | the emailed summary sent from `assistant@…`; and the assistant's answer returned by `POST /assistant` |

## Census candidate hand-offs (closed by `map/census-triage.yaml`, SCHEMA §6f)

| census | owner pass | candidates (`populations.<name>`) |
|---|---|---|
| `credential` | delegation | `secrets`: `backupApiKey` (`config/settings.mjs:6`), `tokenTable` (`lib/db.mjs:13`) |
| `change-gates` | gates | `changeGates`: empty → `triage: []` |
| `model-call-telemetry` | context | `modelCalls`: `model call: lib/agent.mjs` (`lib/agent.mjs:27`) |

## Populations the terrain freezes (census-augmented: one finding per member)

- **Non-obvious decisions** (legibility, `decision-reconstruction`), frozen before assessment:
  - D1 in-memory store behind a narrow interface, SQLite deferred — `docs/adr/0001-storage-choice.md`, `lib/db.mjs:1`
  - D2 unknown/missing token falls back to a default admin identity — `lib/auth.mjs:9-12`
  - D3 backup API key held as a literal in config — `config/settings.mjs:5-6`
  - D4 backup push is fire-and-forget, errors swallowed — `lib/sync.mjs:7-12`
  - D5 zero-dependency `node:http` server with hand dispatch — `server.mjs:1-2`, `package.json`
  - D6 `POST /sync` carries no authorization check — `server.mjs:47-49`
  - D7 log-only mail transport in this build — `lib/mailer.mjs:1-2`, `lib/mailer.mjs:6`
  - D8 assistant prompt carries every member's notes, not the asker's — `lib/agent.mjs:11-20`
- **Doc claims** (legibility, `doc-freshness`): README's endpoint count (`README.md:14`), endpoint list (`README.md:16-19`), run command (`README.md:24`), test command (`README.md:32`), coverage claim (`README.md:35`), capability claim (`README.md:3-5`).
- **Modules** (context, `modules-standalone`): `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs` (8; `test/` excluded).
- **Interfaces** (multiplayer, `agent-access-surface`): the 5 HTTP routes (`server.mjs:30`, `:35`, `:42`, `:47`, `:52`).
- **Ingestion points** (delegation, `ingested-content`; no tool lists them): `POST /notes` body `text` stored then handed to the model (`server.mjs:36-38`, `lib/agent.mjs:12-15`); `POST /assistant` body `question` handed to the model (`server.mjs:43-44`, `lib/agent.mjs:19`).
- **Lessons** (improvement, `incidents-became-mechanisms`): none recorded in the target (no postmortem, lessons file or incident note). An absence: a finding outside the census.
- **Change gates** (gates): none. An absence: a finding outside the census; `test/smoke.mjs` is a test nothing runs as a gate, not a member.

## Slice plan

| pass | reads |
|---|---|
| 1 legibility | `README.md`, `docs/adr/0001-storage-choice.md`, the D1–D8 sites, `package.json`, `server.mjs` (route count) |
| 2 context | the 8 modules, `README.md` (routing a stranger), `lib/agent.mjs` (model call) |
| 3 gates | `package.json`, `test/smoke.mjs`, `server.mjs:11-19` (body parse), `lib/auth.mjs`, `lib/db.mjs` (interfaces), `lib/agent.mjs:35` (directive parse) |
| 4 verification | `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `README.md:27-35` |
| 5 delegation | `server.mjs`, `lib/agent.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `lib/db.mjs`, `lib/auth.mjs`, `routes/admin.mjs`, `config/settings.mjs`, `map/raw/enumerate.json` |
| 6 improvement | `README.md`, `docs/adr/0001-storage-choice.md`, `config/settings.mjs:5`, `test/smoke.mjs`, `package.json` |
| 7 multiplayer | `server.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/agent.mjs` |

Not read: anything outside `targets/flawed-webapp/` (the rest of the fixtures repository is not under
review). Enumerate's `containerClasses` entry also cites the planted-answers file; that citation is
not followed and not reproduced.
