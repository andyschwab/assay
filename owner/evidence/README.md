---
type: doc
title: "owner/evidence/ — the owner-evidence transcript format"
---
# owner/evidence/ — the owner-evidence transcript format

Six floor rows describe things a repository cannot show by itself: a backup was
restored, a rollback ran, a deploy came up as the committed sha, a smoke check hit
the deployed app, a monitoring alert fired and was received, and cost alerts are
named per metered account. Nothing in a checkout can prove any of that — so a
CI job writes a dated transcript from the procedure's real output, or a person
who ran the procedure commits one themselves (never an agent — see below), and
`map/repo-census.mjs` (`CONTRACT.md` §3d) checks its **shape, freshness, and
commit** deterministically, the same way it checks an architecture page or a
runbook. This file is the one home of the format; nowhere else restates
it — `SCHEMA.md`, `map/scanners/CONTRACT.md` §3d, and
`yardstick/requirements.yaml` all link here instead.

This directory holds one example transcript per row, fictional throughout (no real
names, emails, hostnames, or account ids) — copy the shape, not the values.

## The path

One file per row, at the repository root:

```
ops/evidence/<descriptor-id>.md
```

`docs/evidence/<descriptor-id>.md` is also accepted; `ops/` wins when both exist.
The six ids: `d-backup-restore-exercised`, `d-rollback-exercised`,
`d-deploy-one-command`, `d-smoke-on-deployed`, `d-monitoring-with-alert`,
`d-cost-alerts`.

## Evidence comes from running the procedure

A transcript is the record of a real procedure that really ran: **a CI job
writes it from the procedure's own output**, or **a person who ran the
procedure commits it themselves**. There is no third way. An agent — Claude,
another model, a coding assistant — **never writes a transcript**, because an
agent did not restore the backup, run the rollback, or watch the alert fire; it
has nothing to attest to. `produced_by` (below) names which of the two real
producers wrote this one, and `map/repo-census.mjs` checks what it can: the
transcript's shape, freshness, and that its named commit actually resolves in
the checkout's history. It cannot check who actually wrote the file — that is
what committing it under a real identity, in version history, is for.

## The header (YAML frontmatter)

Six keys every row's transcript carries:

| Key | Meaning |
|---|---|
| `produced_by` | `ci` or `person` — who produced this transcript from the procedure's real output (never an agent; see above). `ci` additionally requires `run` (below); `person`'s requirement is `by`, already listed next |
| `descriptor` | must equal the file's descriptor id — a transcript filed under the wrong name is a gap |
| `date` | `YYYY-MM-DD`, the date the procedure was run |
| `by` | a role or handle (`platform-eng`, `on-call`, `@alice`) — **not** an email address; the check rejects anything shaped like one |
| `commit` | 7–40 hex characters, the commit the procedure was run against — **must resolve in the checkout's history** (`git cat-file -e <sha>^{commit}`); one that does not is a gap, naming it. A shallow checkout that cannot confirm the commit either way (it may simply sit outside the fetched depth) reads **not-measured**, never pass — the check refuses to guess |
| `result` | `pass` or `fail` — a `fail` transcript is filed (capture is frictionless) but always reads a gap; a floor row is never re-blessed by a transcript that says it failed |

`produced_by: ci` also requires:

| Key | Meaning |
|---|---|
| `run` | the CI run's id or URL (a string) — which run produced this transcript |

Plus the keys named per row below, so the transcript names what was actually
proven, not just that something ran:

| Row | Keys | What they name |
|---|---|---|
| `d-backup-restore-exercised` | `backup`, `target`, `verified` | which backup; the scratch instance restored into; the data check that confirmed it (a row count, a checksum) |
| `d-rollback-exercised` | `from`, `to`, `verified` | the versions or shas rolled back between; the check run afterward |
| `d-deploy-one-command` | `command`, `deployed_sha` | the one command; the version the deployed app reports — this **must equal `commit`**, else a gap (what ran is not what is committed) |
| `d-smoke-on-deployed` | `environment`, `check` | which environment; the command or URL exercised |
| `d-monitoring-with-alert` | `monitor`, `alert_fired`, `alert_received` | the monitor; two ISO timestamps — `alert_received` must not precede `alert_fired` |
| `d-cost-alerts` | `accounts` | a YAML list of at least one entry, each a string naming account, threshold, and recipient — `"anthropic: $500/month -> platform on-call"` — **quote every entry**; an unquoted `word: word` list item parses as a nested map, not a string |

## The body

Below the closing `---`, the transcript itself: at least one fenced code block
and at least 5 non-empty lines in total. A shorter body is a stub, and a stub is
a gap. The body can hold whatever operational detail the procedure produced — a
command's real output, a dashboard URL, a ticket link — because **the tool never
reads the body past a line count and a fenced-block check**; it does not enter
the findings document, so nothing a transcript's body carries can leak through a
compiled report.

## Freshness

`date` must not be in the future and must be no older than the freshness window
— 90 days by default, `--evidence-max-age <days>` to change it — measured from
`--as-of <YYYY-MM-DD>` (default: today, UTC). A transcript this repo trusted
last quarter goes stale on its own; nothing re-blesses it. Re-running the
procedure and committing a fresh transcript is the only way to keep the row
`pass`.

## What the tool decides, and what it does not

`pass` means: the file is present at the expected path, its frontmatter is
complete and well-formed, its per-row keys are present and valid, `result:
pass`, its `commit` resolves in the checkout's history, and the date is fresh.
That is **all** it means. The tool has no way to confirm the backup was
actually restored, the rollback actually ran, or the alert actually fired —
that rests entirely on the named person's or CI job's attestation, carried in
version history (who or what committed the file, when, against what commit).
A passing transcript is evidence a human — or a CI job acting on the
procedure's real output — is willing to put a name to, dated and versioned; it
is not independent proof, and it is never an agent's own word (see "Evidence
comes from running the procedure" above). Every `pass` observation says this
explicitly, the same way `runbook` and `ci-gate` name what they do not decide
(branch-protection enforcement, whether a procedure was ever run). A checkout
that cannot resolve the commit at all — no `.git`, or too shallow to say either
way — reads **not-measured**, never pass: the requirement it decides reads
not-measured too, never met by a check that could not look.

## Example transcripts in this directory

`d-backup-restore-exercised.md`, `d-rollback-exercised.md`,
`d-deploy-one-command.md`, `d-smoke-on-deployed.md`,
`d-monitoring-with-alert.md`, `d-cost-alerts.md` — one passing example per row,
fictional values throughout. Copy one to `ops/evidence/<id>.md` in a target
repository, replace every value, and re-run:

```sh
node assay.mjs repo-census <target-dir> --out repo-census.json
```
