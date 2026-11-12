---
type: doc
title: Terrain — flawed-webapp (notesbox) at 7f7c89d
---
# Terrain — flawed-webapp (notesbox)

Target: `targets/flawed-webapp/` of the fixtures repository at `7f7c89d823153c702c207b1f36c6c2ce26217ceb`
(branch `main`, committed 2026-10-30, shallow clone). Every path below is relative to the target.
No canon exists for this target: the populations below are derived blind, from the listing
(`git ls-files`) and the enumeration input `map/raw/enumerate.json` (13 files), with no prior run in context.

## The map

- **Language**: JavaScript, ES modules (`.mjs`), 11 source/config files, ~190 lines; Markdown docs, 2 files, ~65 lines. Rough size: 12 tracked files, 281 lines. Zero runtime dependencies (`package.json` declares none; `server.mjs:1` says Node >= 20 `http`).
- **Entry points**: `server.mjs` (a `node:http` server, five method+path routes, `server.mjs:26-57`); `npm start` → `node server.mjs` (`package.json:7`). No build step.
- **Test / lint / CI**: one test file, `test/smoke.mjs` (one assertion on `authenticate`); `package.json` has no `test` script and no `test:all` script although `README.md:32` names `npm run test:all`. No lint, no typecheck, no hooks, no CI configuration inside the target. (A CI workflow at the fixtures repository's root runs `test/smoke.mjs`; it sits outside the target and is not under review — not cited.)
- **Directory topology** (all load-bearing dirs): `lib/` (store, auth, assistant, mail, backup sync), `routes/` (admin purge), `config/` (central settings, including a literal credential), `docs/adr/` (one decision record), `test/` (smoke).
- **Docs surface**: `README.md` (endpoints, running, testing), `docs/adr/0001-storage-choice.md`.
- **Agent-facing files**: none — no CLAUDE.md, AGENTS.md, .cursorrules, skills or prompt files. The application itself has one AI surface (the assistant, `lib/agent.mjs`).
- **Harness text**: `README.md:7-10`, `lib/agent.mjs:4-7` and `test/smoke.mjs:1-3` carry fixture-harness notes in a voice outside the app's own; passes judge the code's behaviour, cite these lines only as what they are, and never treat them as the maintainers' documentation.

## Effect inventory (draft, closed against `map/raw/enumerate.json`)

Candidates: `channelCandidates` is empty (a web app with no CLI/skill/tool-def surface), so the
route handlers and effect sites are the list the triage closes (8 candidates). Fixed channel slugs
(the delegation pass draws slugs from here, never invents one):

| channel slug | invocation boundary | candidates it closes |
|---|---|---|
| `note-create` | `POST /notes` → `notes.set` (`server.mjs:35-39`) | `route: POST /notes` |
| `assistant-email-send` | `POST /assistant` → `ask` → `sendEmail` (`server.mjs:42-44`, `lib/agent.mjs:33-42`, `lib/mailer.mjs:5-8`) | `route: POST /assistant`, `message/mail send @ lib/agent.mjs`, `message/mail send @ lib/mailer.mjs` |
| `workspace-backup-push` | `POST /sync` → `pushBackup` → `fetch` (`server.mjs:47-49`, `lib/sync.mjs:5-13`) | `route: POST /sync`, `http write (js) @ lib/sync.mjs` |
| `workspace-purge` | `POST /admin/purge` → `handlePurge` → `purgeAll` (`server.mjs:52-53`, `routes/admin.mjs:6-11`, `lib/db.mjs:27-31`) | `route: POST /admin/purge` |
| (read-only) | `GET /notes` (`server.mjs:30-33`) | `route: GET /notes` — candidate for out of scope: reads, writes nothing |

**AI surfaces**: one capability (the assistant AI context, `lib/agent.mjs:11-43`): untrusted input (the request's `question`, and every member's note text), private data (all workspace notes and owner emails, `lib/agent.mjs:12-15`), outward write (`sendEmail`). One model call site: the local stub `callModel` (`lib/agent.mjs:27-31`).

**Agent / principal classes**: member (token-resolved, `lib/db.mjs:2-6,13-17`), admin (`role: 'admin'`, `lib/auth.mjs:15-17`), and the unauthenticated fallback identity, which is admin (`lib/auth.mjs:9-12`). Each assessed separately.

## Populations handed to the passes (enumerate before assess)

- **credential** (delegation; `populations.secrets`): `backupApiKey` (`config/settings.mjs:6`), `tokenTable` (`lib/db.mjs:13`). `secretConstants`: none.
- **change-gates** (gates; `populations.changeGates`): listed empty — no CI step, hook or check script in the target.
- **model-call-telemetry** (context; `populations.modelCalls`): `model call: lib/agent.mjs` (`lib/agent.mjs:27`).
- **ingested-content** (delegation): I1 `POST /notes` body `text`, stored and later placed in the model prompt (`server.mjs:36-38`, `lib/agent.mjs:12-15`); I2 `POST /assistant` body `question`, placed in the model prompt (`server.mjs:43-44`, `lib/agent.mjs:19`).
- **decision-reconstruction** (legibility; frozen before assessment): D1 in-memory store behind the `lib/db.mjs` interface (`docs/adr/0001-storage-choice.md`, `lib/db.mjs:1`); D2 unknown/missing token falls back to a default admin identity (`lib/auth.mjs:9-12`); D3 backup API key held as a literal in config (`config/settings.mjs:5-6`); D4 backup push is fire-and-forget with errors swallowed (`lib/sync.mjs:7-12`); D5 zero dependencies, bare `node:http` (`server.mjs:1-2`); D6 log-only mail transport (`lib/mailer.mjs:1-7`); D7 `POST /sync` carries no authorization check (`server.mjs:48`).
- **doc-freshness** (legibility; every concrete doc claim): C1 "4 endpoints" (`README.md:14`); C2 the endpoint list (`README.md:16-19`); C3 run command `node server.mjs` (`README.md:24`); C4 `npm run test:all` (`README.md:32`); C5 "Every endpoint is covered by the smoke suite" (`README.md:35`); C6 the assistant "can email summaries" (`README.md:4-5,18`); C7 the store interface `lookup`, `notes` map, `purgeAll` and "nothing above `lib/` changes" (`docs/adr/0001-storage-choice.md:14-17`); C8 a restart loses data (`docs/adr/0001-storage-choice.md:22`).
- **modules-standalone** (context; module population): `server.mjs`, `lib/agent.mjs`, `lib/auth.mjs`, `lib/db.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `config/settings.mjs`.
- **agent-access-surface** (multiplayer): the five routes `GET /notes`, `POST /notes`, `POST /assistant`, `POST /sync`, `POST /admin/purge`.
- **incidents-became-mechanisms** (improvement): no lesson, incident, postmortem or lessons file is recorded in the target; the population is empty.
- **Network-egress controls, interface contracts, report paths**: enumerate lists none; `lib/sync.mjs:13` returns `{ok: true}` without awaiting the push (an effect-vs-report path for the verification pass).

## Slice plan

The target is 281 lines: every pass reads the whole tree (12 files), nothing is sampled, nothing is left unread.

| pass | files it centres on |
|---|---|
| 1 legibility | `README.md`, `docs/adr/0001-storage-choice.md`, the decision sites D1–D7 |
| 2 context | the 8 modules, `lib/agent.mjs` (model call), `README.md` |
| 3 gates | `package.json`, `test/smoke.mjs`, `README.md:27-35`, `server.mjs:11-19` (input parsing) |
| 4 verification | `test/smoke.mjs`, `lib/sync.mjs`, `lib/mailer.mjs`, `lib/agent.mjs` |
| 5 delegation | `server.mjs`, `lib/auth.mjs`, `lib/agent.mjs`, `lib/mailer.mjs`, `lib/sync.mjs`, `routes/admin.mjs`, `lib/db.mjs`, `config/settings.mjs` |
| 6 improvement | `docs/adr/`, `config/settings.mjs:5`, `test/`, `README.md` |
| 7 multiplayer | `server.mjs` routes, `README.md:12-19`, `lib/db.mjs`, `lib/agent.mjs:11-21` |

Not read: anything outside `targets/flawed-webapp/`, and the target's answer file (never opened).
