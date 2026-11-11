---
type: doc
title: "flawed-webapp (notesbox) terrain, Pass 0"
---
# Terrain: targets/flawed-webapp at 7f7c89d

Every path below is relative to `targets/flawed-webapp/`. Blind derivation: no canon
exists for this target and no prior run was read. The fixture's answer sheet was
neither opened nor searched.

## The map

- **What it is.** "notesbox", a small team-notes HTTP API with an AI assistant that
  answers over workspace notes and can email summaries (`README.md:1-5`).
- **Language and size.** JavaScript (ES modules, `.mjs`) only, plus two Markdown docs
  and `package.json`. 12 files reviewed, 281 lines. Zero dependencies: Node's own
  `http` (`server.mjs:1-3`, `package.json:1-9`).
- **Entry points.** `server.mjs` (the HTTP server and the whole route table,
  `server.mjs:26-57`); `npm start` runs it (`package.json:6-8`).
- **Build / test / lint.** No build, lint or typecheck. One test file,
  `test/smoke.mjs`, with no npm script that runs it (`package.json:6-8` has only
  `start`). The README names `npm run test:all` (`README.md:32`), which no script
  defines.
- **CI.** None inside the target. The fixtures repository's own workflow, outside the
  target and outside this review's scope, runs `node targets/flawed-webapp/test/smoke.mjs`
  on push and pull request; it is noted here because it is the one change gate the
  smoke suite passes through, and it cannot be cited as evidence (it is not under the
  target).
- **Directories (all load-bearing).** `lib/` (agent, auth, db, mailer, sync),
  `routes/` (admin), `config/` (settings), `docs/adr/` (one ADR), `test/` (smoke).
- **Docs surface.** `README.md` (endpoints, running, testing),
  `docs/adr/0001-storage-choice.md` (the storage decision). Header comments on every
  module.
- **Agent-facing files.** None: no CLAUDE.md, AGENTS.md, .cursorrules, skills or
  prompt files. The one prompt is built in code (`lib/agent.mjs:11-21`).

## Populations from the enumeration (`map/raw/enumerate.json`)

Given, not run. `channelCandidates`: 0. `routeHandlers`: 0 (the enumerator's route
rules target framework routers; this app dispatches by `if` on method and path inside
one `createServer` callback, so its five routes are not on the list). `effectSites`: 1,
`http write (js)` at `lib/sync.mjs:8`. `secrets`: 0. `secretConstants`: 0.
`containerClasses`: 1, `admin-role branch` (`lib/auth.mjs:12`, `lib/auth.mjs:16`,
`lib/db.mjs:5`). The triage closes the one effect-site member; the routes the
enumerator missed are still findings (an effect the list does not name is still a
finding).

## Effect inventory (fixed channel slugs; the delegation pass uses these verbatim)

Derived from the route table `server.mjs:30-56` plus the effect-site listing, one per
invocation boundary:

| slug | invocation | what it does |
|---|---|---|
| `notes-create` | `POST /notes`, `server.mjs:35-40` | writes a note into the in-memory store |
| `assistant-email-send` | `POST /assistant` → `ask` → `sendEmail`, `lib/agent.mjs:33-41`, `lib/mailer.mjs:5-8` | emails the full workspace note text to a model-chosen recipient |
| `workspace-backup-push` | `POST /sync` → `pushBackup`, `server.mjs:47-50`, `lib/sync.mjs:5-13` | POSTs every note to the backup service with a bearer key |
| `admin-purge` | `POST /admin/purge` → `handlePurge` → `purgeAll`, `server.mjs:52-54`, `routes/admin.mjs:6-11`, `lib/db.mjs:27-31` | deletes every note and every user's note list |

Read-only, not an effect: `GET /notes` (`server.mjs:30-33`).

**AI surfaces (capabilities = LLM call sites).** One: the assistant,
`lib/agent.mjs:27-43` (a stub model standing in for a real call). Its prompt joins the
caller's question with every workspace note from every user (`lib/agent.mjs:11-20`),
and the model's output is parsed for a `TOOL:send_email` line that sends
(`lib/agent.mjs:35-39`).

**Container / agent classes.** One process, two identity classes: member and admin
(`lib/db.mjs:2-6`), plus the unauthenticated fallback identity, which is admin
(`lib/auth.mjs:9-12`). Assess the admin class separately.

**Credentials.** Enumeration found none by env read; by reading: the backup API key is
a literal in `config/settings.mjs:6` (value never reproduced in any output), and the
session bearer tokens are a literal table in `lib/db.mjs:13-17`.

## Census populations (frozen before assessment)

- `doc-freshness` (artifact-legibility, `artifact`): every concrete README / ADR claim:
  C1 "4 endpoints" `README.md:14`; C2 `GET /notes` lists your notes `README.md:16`;
  C3 `POST /notes` creates `README.md:17`; C4 `POST /assistant` can email
  `README.md:18`; C5 `POST /sync` pushes to backup `README.md:19`; C6 `node server.mjs`
  runs it `README.md:24`; C7 `npm run test:all` runs the suite `README.md:32`; C8 every
  endpoint is covered by the smoke suite `README.md:35`; C9 the ADR's interface
  (`lookup`, `notes` map, `purgeAll`) is what `lib/db.mjs` exports
  `docs/adr/0001-storage-choice.md:14-17`.
- `decision-reconstruction` (artifact-legibility, `artifact`): D1 in-memory store behind
  an interface (`lib/db.mjs:1`); D2 unauthenticated requests fall back to a default
  admin identity (`lib/auth.mjs:9-12`); D3 backup key held as a literal in config
  (`config/settings.mjs:5-6`); D4 fire-and-forget backup push, errors swallowed
  (`lib/sync.mjs:7-12`); D5 `POST /sync` has no authorization check
  (`server.mjs:47-50`); D6 mail transport is log-only (`lib/mailer.mjs:1-8`); D7 zero
  dependencies, Node `http` only (`server.mjs:1-2`).
- `modules-standalone` (context-economy, `artifact`): `server.mjs`, `lib/agent.mjs`,
  `lib/auth.mjs`, `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`,
  `config/settings.mjs`.
- `change-gates` (deterministic-gates, `contract`): every check a change passes through
  that lives in the target: G1 the smoke suite `test/smoke.mjs`. No hook, lint,
  typecheck or config-driven check exists in the target.
- `effect-provability` (verification, `control`): the four effect channels above.
- `credential` (delegation, `control`): K1 backup API key (`config/settings.mjs:6`);
  K2 the session bearer-token table (`lib/db.mjs:13-17`).
- `incidents-became-mechanisms` (improvement-loop, `process`): recorded lessons. None
  found in the listing (no incidents, postmortems, changelog or lessons file); the pass
  confirms or finds members.
- `agent-access-surface` (multiplayer, `artifact`): every interface: the five routes
  `GET /notes`, `POST /notes`, `POST /assistant`, `POST /sync`, `POST /admin/purge`.

## Slice plan

The target is 281 lines, so every pass may read every file; each pass's focus:

1. legibility: `README.md`, `docs/adr/0001-storage-choice.md`, module headers, the
   D-list sites.
2. context: every module for standalone load; README routing; no agent contract; no
   model-tier record (`lib/agent.mjs`).
3. gates: `package.json`, `test/smoke.mjs`, `README.md:27-35`, absence of
   lint/typecheck/schema at `server.mjs:11-19` (body parsing).
4. verification: `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `test/smoke.mjs`,
   the four channels' success reports.
5. delegation: `lib/agent.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/sync.mjs`,
   `routes/admin.mjs`, `server.mjs`, `config/settings.mjs`.
6. improvement: absence of an agent spec, TODOs (`config/settings.mjs:5`), the ADR as
   the one durable decision home, no telemetry.
7. multiplayer: route table, README endpoint list, per-user vs workspace scope in
   `lib/agent.mjs` and `server.mjs:31`, `routes/admin.mjs:5` vs `server.mjs:52`.

Not read: nothing in the target was skipped; everything outside `targets/flawed-webapp/`
is out of scope.
