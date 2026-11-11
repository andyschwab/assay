---
confidential: true
type: doc
title: "flawed-webapp — Pass 0 terrain"
---
# Terrain — targets/flawed-webapp (notesbox)

Target: `andyschwab/assay-fixtures`, subtree `targets/flawed-webapp/` only, at head
`7f7c89d823153c702c207b1f36c6c2ce26217ceb` (detached; branch `main`; shallow clone).
Evidence paths below and in every pass are repo-relative to the target subtree
(`targets/flawed-webapp/`). Nothing outside the subtree is evidence. `ANSWERS.yaml`
in the subtree is the answer sheet and is excluded from the review (not opened).

## Canon

No canon exists for this target (the engine's `map/canon/` at 4b81665 ships only its
README). The populations below are derived **blind**: from a file listing of the subtree
and the invocation-boundary rule, with no prior run in context. `node assay.mjs
enumerate` was **not run** (this lane executes nothing); the listing below stands in for
its CHANNEL CANDIDATES. The proposed canon (effect channels, AI surfaces, census
populations) is the effect inventory and census plan here, for a reviewed diff.

## Map

- **Size:** 11 files reviewed, 281 lines total (excluding `ANSWERS.yaml`).
- **Languages:** JavaScript ES modules (`.mjs`), 7 source files (~197 lines), 1 test
  file (11 lines); Markdown, 2 files (README, one ADR); JSON, 1 manifest.
- **Runtime:** Node >= 20 `node:http`, zero dependencies (`server.mjs:1`,
  `package.json:1-9` has no `dependencies` and no lockfile).
- **Build / test / lint entry points:** `package.json:6-8` defines only `start`
  (`node server.mjs`). No `test`, no `test:all` (the README claims `npm run test:all`,
  `README.md:32`). One test file, `test/smoke.mjs` (one assertion, `test/smoke.mjs:8-9`).
  No lint config, no typecheck, no formatter.
- **CI:** none inside the subtree (no workflow, no hook). The fixture repository's root
  `.github/` is outside the review scope and is not evidence.
- **Docs surface:** `README.md` (endpoints, run, test), `docs/adr/0001-storage-choice.md`
  (one ADR). Inline header comments in every module.
- **Agent-facing files:** none (no CLAUDE.md, AGENTS.md, .cursorrules, skills, prompt
  files). The only prompt is built in code: `lib/agent.mjs:11-21`.
- **Fixture markers in the target's own text:** `README.md:7-10`, `lib/agent.mjs:4-7`,
  `test/smoke.mjs:1-3` carry fixture notes. They are part of the tree and may be cited
  as what the files say; they are not a substitute for reading the code.

### Directory topology (all load-bearing; the tree is small)

| dir / file | role |
|---|---|
| `server.mjs` | HTTP entry; the whole route table (`server.mjs:26-57`) |
| `routes/admin.mjs` | admin purge handler |
| `lib/auth.mjs` | bearer-token authentication + `requireAdmin` |
| `lib/db.mjs` | in-memory store: users, notes, session token table, `purgeAll` |
| `lib/agent.mjs` | AI assistant: prompt build, stub model, tool-directive parse, email |
| `lib/mailer.mjs` | outbound mail (log-only transport in this build) |
| `lib/sync.mjs` | backup push to an external URL with a bearer key |
| `config/settings.mjs` | central settings (port, backup URL, backup key, mail-from) |
| `test/` | smoke suite |
| `docs/adr/` | decision records |

## Populations (enumerated, closed lists)

### HTTP route handlers (from `server.mjs:26-57`, the only router)

| # | method + path | handler | evidence |
|---|---|---|---|
| R1 | GET /notes | inline, filters notes by `user.id` | `server.mjs:30-33` |
| R2 | POST /notes | inline, writes a note | `server.mjs:35-40` |
| R3 | POST /assistant | `ask` (lib/agent.mjs) | `server.mjs:42-45` |
| R4 | POST /sync | `pushBackup` (lib/sync.mjs) | `server.mjs:47-50` |
| R5 | POST /admin/purge | `handlePurge` (routes/admin.mjs) | `server.mjs:52-54` |
| — | fallthrough 404 | inline | `server.mjs:56` |

The README lists 4 endpoints (`README.md:14-19`); the router has 5. The admin handler's
comment names `DELETE /admin/purge` (`routes/admin.mjs:5`); the router matches `POST`.

### Effect channels (invocation boundary = the route + effect-lib function it drives)

No CLI, skill, or tool-definition table exists, so the invocable surface is the route +
effect-lib topology (METHOD Pass 0). Fixed slugs; every pass draws from these:

| slug | what | entry → effect site | reversibility (draft) | external (draft) |
|---|---|---|---|---|
| `note-create` | create a note in the store | `server.mjs:35-40` → `server.mjs:38` | reversible | false |
| `assistant-email-send` | assistant emails all workspace notes to an address taken from model output | `server.mjs:42-45` → `lib/agent.mjs:35-40` → `lib/mailer.mjs:5-8` | irreversible | true |
| `backup-push` | POST the full note set to the backup service with a bearer key | `server.mjs:47-50` → `lib/sync.mjs:5-13` | irreversible | true |
| `workspace-purge` | clear all notes and every user's note list | `server.mjs:52-54` → `routes/admin.mjs:6-11` → `lib/db.mjs:27-31` | irreversible (in-memory, no backup restore path) | false |

Out of scope as effects (read-only): R1 `GET /notes` (`server.mjs:30-33`); the assistant's
prompt build reads every note (`lib/agent.mjs:12-15`), recorded as the capability's
private-data leg, not as an effect. Server listen/log (`server.mjs:59-61`) is not an
authored effect channel.

### AI surfaces (a capability = an LLM call site)

| name | call site | untrusted input | private data | external effect |
|---|---|---|---|---|
| `assistant` | `lib/agent.mjs:27-31` (stub `callModel`), invoked from `lib/agent.mjs:34` | the user's question (`server.mjs:44`) and every note's text from all users (`lib/agent.mjs:12-15`) | all users' notes and owner emails (`lib/agent.mjs:12-15`) | write: `sendEmail` (`lib/agent.mjs:39`) |

One AI surface. The model call is a stub (`lib/agent.mjs:4-7`, `lib/agent.mjs:23-31`);
the shape (prompt over untrusted + private, output parsed for a tool directive) is real code.

### Container / agent classes

One process class: the single HTTP server (`server.mjs:26`, `server.mjs:59-61`). No
container files, no cron, no webhook receiver, no worker. Principal classes inside it:
authenticated member, authenticated admin, and the **unauthenticated fallback identity**
(`lib/auth.mjs:9-12`, role admin). Each is assessed separately in delegation.

### Credentials / secrets (enumerate-before-assess)

| # | credential | where it lives | where it is read |
|---|---|---|---|
| C1 | backup service API key (`backupApiKey`) | literal in source, `config/settings.mjs:5-6` | `lib/sync.mjs:10` |
| C2 | session bearer tokens (3) | literal token table, `lib/db.mjs:13-17` | `lib/auth.mjs:6-7`, `lib/db.mjs:20-24` |

No environment read exists anywhere in the subtree (no `process.env`); `config/settings.mjs:1`
says values are read at boot and points to README environment notes that do not exist.
Values are not reproduced in any run file.

### Network-egress controls

None. The only egress is `fetch(settings.backupUrl, …)` (`lib/sync.mjs:8-12`) and the
mailer's (log-only) transport (`lib/mailer.mjs:5-8`). No URL policy, no allowlist.

### Interface contracts

- `lib/db.mjs` interface named by ADR-0001 (`docs/adr/0001-storage-choice.md:14-17`):
  `lookup`, the `notes` map, `purgeAll`. No test pins it.
- The assistant's tool-directive grammar `TOOL:send_email <to> <subject>`
  (`lib/agent.mjs:18`, parsed `lib/agent.mjs:35`). No schema, no validation of `to`.
- Request bodies: `readBody` swallows JSON parse errors to `{}` (`server.mjs:16`).

### Delivery / effect-vs-report paths

| path | reports | evidence |
|---|---|---|
| `backup-push` | `{ ok: true, pushed: N }` before the fetch resolves; errors swallowed | `lib/sync.mjs:8-13` |
| `assistant-email-send` | `{ emailed: to }` from a log-only transport that returns `{ sent: true }` | `lib/agent.mjs:39-40`, `lib/mailer.mjs:5-8` |
| `workspace-purge` | `{ purged: true }` unconditionally | `lib/db.mjs:27-30` |
| `note-create` | `201 { id }` | `server.mjs:37-39` |

### Decisions (legibility census population)

Non-obvious design choices found in the tree (enumerated from code comments + docs):

| # | decision | stated where |
|---|---|---|
| D1 | in-memory store behind a narrow interface, SQLite later | `docs/adr/0001-storage-choice.md:12-17`, `lib/db.mjs:1` |
| D2 | unknown/missing token falls back to a default admin identity | `lib/auth.mjs:9-12` |
| D3 | `/sync` carries no authorization check | `server.mjs:48` |
| D4 | backup push is fire-and-forget, errors swallowed | `lib/sync.mjs:7`, `lib/sync.mjs:12` |
| D5 | assistant emails on a model-emitted tool line with no confirm | `lib/agent.mjs:1-2`, `lib/agent.mjs:35-39` |
| D6 | mailer is log-only in this build | `lib/mailer.mjs:1-2`, `lib/mailer.mjs:6` |
| D7 | zero-dependency, `node:http` only | `server.mjs:1-2` |
| D8 | the backup key is in source "until launch" | `config/settings.mjs:5` |

### Modules (context census population)

`server.mjs`, `routes/admin.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/agent.mjs`,
`lib/mailer.mjs`, `lib/sync.mjs`, `config/settings.mjs` — 8 modules.

### Docs (freshness population)

`README.md` claims: endpoint count (`README.md:14`), endpoint list (`README.md:16-19`),
run command (`README.md:24`), test command (`README.md:32`), coverage claim (`README.md:35`).
ADR-0001 claims (`docs/adr/0001-storage-choice.md:14-17`). Inline claims:
`lib/db.mjs:1` (SQLite adapter), `config/settings.mjs:1` (environment notes),
`routes/admin.mjs:5` (DELETE), `lib/sync.mjs:7` (VPC relay).

### Lessons / incident records (improvement population)

None: no CHANGELOG, incidents dir, postmortem, agent spec, or lessons file in the subtree.
The census is empty; the one durable-decision home is `docs/adr/` (one record).

## Slice plan (the tree is 281 lines; every pass may read all of it)

| pass | primary slice |
|---|---|
| 1 legibility | `docs/adr/0001-storage-choice.md`, `README.md`, header comments of every module; decisions D1–D8 |
| 2 context | `README.md`, `package.json`, the 8 modules, ADR; doc-freshness claims above; model-tier / spend (`lib/agent.mjs`) |
| 3 gates | `package.json`, `test/smoke.mjs`, `README.md:27-35`, `server.mjs` (central module), `lib/auth.mjs` |
| 4 verification | `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs`, `lib/db.mjs:27-31`, delivery paths above |
| 5 delegation | every effect channel, the `assistant` surface, C1–C2, the three principal classes: `server.mjs`, `lib/*.mjs`, `routes/admin.mjs`, `config/settings.mjs` |
| 6 improvement | `docs/adr/`, `README.md`, absence of agent spec / lessons home; telemetry by design (`lib/mailer.mjs:7`, `server.mjs:60`) |
| 7 multiplayer | `server.mjs` route table (agent-access surface), `lib/db.mjs` (shared substrate), `lib/agent.mjs` (authority domains), `lib/auth.mjs` |

Not read: `ANSWERS.yaml` (answer sheet), everything outside `targets/flawed-webapp/`.
