---
type: doc
title: "flawed-webapp — Pass 0 terrain (practice-review, blind)"
---
# Terrain — targets/flawed-webapp (notesbox)

Derived blind: no prior run and no canon in context; every path is relative to
`targets/flawed-webapp/`. The planted-answers file of the fixture repository is outside the
review and was never opened or listed.

## The map

- **Size**: 12 files under review (the enumeration counted 13 including the excluded answers
  file). ~230 lines total.
- **Languages**: JavaScript ES modules (`.mjs`) only, 9 source/test files; Markdown 2; JSON 1.
- **Runtime**: Node ≥ 20, zero dependencies (`server.mjs:1`, `package.json:1-9` has no
  `dependencies`).
- **Entry points**: `server.mjs` (HTTP server, `node:http`); `package.json:7` defines only
  `start`. No `test`, `lint`, `test:all` script.
- **CI / hooks / config-driven checks**: none. No `.github/`, no hook directory, no lint or
  typecheck config in the target. `populations.changeGates` is empty.
- **Tests**: `test/smoke.mjs` (one assertion on `authenticate`), wired to no script.
- **Docs surface**: `README.md` (endpoints, running, testing), `docs/adr/0001-storage-choice.md`
  (one ADR). No agent contract file (no CLAUDE.md, AGENTS.md, .cursorrules, prompts dir).
- **Agent-facing / AI surfaces**: one — the in-code assistant `lib/agent.mjs` (prompt built at
  `lib/agent.mjs:11-21`, a stub model at `lib/agent.mjs:27-31`, tool-directive parse and send at
  `lib/agent.mjs:33-42`). No provider SDK or HTTP model API is called (`populations.modelCalls`
  is empty).
- **Load-bearing directories**: `lib/` (agent, auth, db, mailer, sync), `routes/` (admin),
  `config/` (settings), `test/`, `docs/adr/`.

## Agent / container classes (enumerated: `populations.containerClasses`)

- **admin-role branch** (`lib/auth.mjs:12`, `lib/auth.mjs:16`, `lib/db.mjs:5`): the admin role is
  held by the seeded ops user AND by the fallback identity `authenticate` returns for any
  missing or unknown token (`lib/auth.mjs:9-12`). Assess separately from the member class:
  every unauthenticated caller is the admin class.
- **member** (`lib/db.mjs:3-4`): token-bound users.

## Effect inventory draft (channel slugs fixed here; Pass 5 draws them from this list)

Candidate list (`map/raw/enumerate.json`): `channelCandidates` [] · `routeHandlers` [] ·
`effectSites` 1 member: **`http write (js)`** (`lib/sync.mjs:8`). Every candidate is triaged
by Pass 5 in `map/effect-triage.yaml`.

| slug | where | on the list? | note |
|---|---|---|---|
| `backup-push` | `lib/sync.mjs:5-14`, route `server.mjs:47-50` | yes: `http write (js)` | POSTs every note to an external backup URL with a bearer key; fire-and-forget, errors swallowed |
| `assistant-send-email` | `lib/agent.mjs:35-40` → `lib/mailer.mjs:5-9`, route `server.mjs:42-45` | no | model-output-directed email of all notes to any address |
| `workspace-purge` | `lib/db.mjs:27-31` via `routes/admin.mjs:6-11`, route `server.mjs:52-54` | no | clears every note and user note list; admin check reachable by the fallback admin identity |
| `note-create` | `server.mjs:35-40` | no | in-memory write of a caller's note (internal, reversible) |

The route handlers live inline in one `http.createServer` callback (`server.mjs:26-57`), a
shape the enumeration did not list (`routeHandlers` is empty); the four effects above are the
invocation boundaries.

## AI surfaces (capability)

- **assistant** (`lib/agent.mjs:33`): untrusted user question (`server.mjs:43-44`) and other
  users' note text, all workspace notes across owners (`lib/agent.mjs:12-15`), and an outward
  write (email, `lib/agent.mjs:39`). One capability finding (Pass 5).

## Enumerated populations, frozen before assessment

Candidate populations handed out (from `map/raw/enumerate.json`):

- `populations.secrets` → Pass 5 (`credential`): **empty**. Not on the list but a member of the
  census: the backup service key held as a literal in `config/settings.mjs:6` (TODO at
  `config/settings.mjs:5`), read at `lib/sync.mjs:10`. Never quote its value.
- `populations.changeGates` → Pass 3 (`change-gates`): **empty**.
- `populations.modelCalls` → Pass 2 (`model-call-telemetry`): **empty**. The stub
  `callModel` (`lib/agent.mjs:27-31`) stands where a provider call would be.

Populations the terrain draws (no tool lists them):

- **Non-obvious decisions** (Pass 1, `decision-reconstruction`):
  D1 in-memory store behind a module interface (`lib/db.mjs:1`, ADR-0001);
  D2 missing/unknown token falls back to an admin identity (`lib/auth.mjs:9-12`);
  D3 backup key as a source literal (`config/settings.mjs:5-6`);
  D4 backup push fire-and-forget, errors swallowed, success returned (`lib/sync.mjs:7-13`);
  D5 log-only mail transport (`lib/mailer.mjs:1-2`, `lib/mailer.mjs:6`);
  D6 the model is a stub that follows TOOL lines (`lib/agent.mjs:4-7`, `lib/agent.mjs:23-26`);
  D7 zero-dependency server with routes inline (`server.mjs:1-2`);
  D8 `/sync` served with no authorization check (`server.mjs:47-49`).
- **Doc claims** (Pass 1, `doc-freshness`), oldest doc first: ADR interface surface
  (`docs/adr/0001-storage-choice.md:14-17`); ADR restart-loses-data
  (`docs/adr/0001-storage-choice.md:22`); README endpoint count "4" (`README.md:14`); README
  endpoint list (`README.md:16-19`); README assistant can email (`README.md:18`); README run
  command (`README.md:24`); README test command `npm run test:all` (`README.md:32`); README
  "every endpoint is covered by the smoke suite" (`README.md:35`).
- **Modules** (Pass 2, `modules-standalone`): `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`,
  `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs`.
- **Ingestion points** (Pass 5, `ingested-content`): note text via `POST /notes`
  (`server.mjs:35-38`), later placed in the prompt (`lib/agent.mjs:12-14`); the assistant
  question via `POST /assistant` (`server.mjs:42-44`, `lib/agent.mjs:19`).
- **Interfaces** (Pass 7, `agent-access-surface`): `GET /notes` (`server.mjs:30`),
  `POST /notes` (`server.mjs:35`), `POST /assistant` (`server.mjs:42`), `POST /sync`
  (`server.mjs:47`), `POST /admin/purge` (`server.mjs:52`).
- **Lessons** (Pass 6, `incidents-became-mechanisms`): none recorded in the tree (no
  postmortem, incident note, lessons file or cause-naming fix); the census is empty.
- Context-list populations seen: backlog records (`config/settings.mjs:5`,
  `docs/adr/0001-storage-choice.md:22-23`); outward AI output (assistant email,
  `lib/agent.mjs:39`); AI feature (assistant answer, `lib/agent.mjs:33-42`); model in use (the
  stub, `lib/agent.mjs:27`); second accounts (the purge route's method, `routes/admin.mjs:5` vs
  `server.mjs:52`; the endpoint list, `README.md:14-19` vs `server.mjs:30-54`).

## Slice plan (each pass reads its slice; the target is small enough to read whole)

| pass | reads |
|---|---|
| 1 legibility | `README.md`, `docs/adr/0001-storage-choice.md`, `package.json`, `server.mjs`, `lib/*.mjs`, `config/settings.mjs`, `routes/admin.mjs`, `test/smoke.mjs` |
| 2 context | every module above, `README.md`, `package.json` |
| 3 gates | `package.json`, `test/smoke.mjs`, `server.mjs`, `lib/auth.mjs`, `lib/agent.mjs` (interfaces), the absence of CI/hook config |
| 4 verification | `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `README.md` |
| 5 delegation | `server.mjs`, `lib/*.mjs`, `routes/admin.mjs`, `config/settings.mjs`, `map/raw/enumerate.json` |
| 6 improvement | `README.md`, `docs/adr/0001-storage-choice.md`, `config/settings.mjs`, `test/smoke.mjs`, `lib/mailer.mjs` |
| 7 multiplayer | `server.mjs`, `README.md`, `lib/db.mjs`, `lib/agent.mjs`, `lib/auth.mjs` |

Not read: nothing in the target is skipped. Outside the target: the rest of the fixture
repository, by the review's scope.

## Id offsets (parallel authoring)

legibility F-100 · context F-200 · gates F-300 · verification F-400 · delegation F-500 ·
improvement F-600 · multiplayer F-700.
