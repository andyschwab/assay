---
type: doc
title: "templates/evidence/ — the owner-evidence transcript format"
---
# templates/evidence/ — the owner-evidence transcript format

Six floor rows describe things a repository cannot show by itself: a backup was
restored, a rollback ran, a deploy came up as the committed sha, a smoke check hit
the deployed app, a monitoring alert fired and was received, and cost alerts are
named per metered account. Nothing in a checkout can prove any of that — so the
owner commits a dated transcript instead, and `tools/repo-census.mjs`
(scanner-contract §3d) checks its **shape and freshness**, deterministically, the
same way it checks an architecture page or a runbook. This file is the one home of
the format; nowhere else restates
it — `SCHEMA.md`, `integration/scanner-contract.md` §3d, and
`registry/descriptors.yaml` all link here instead.

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

## The header (YAML frontmatter)

Five keys every row's transcript carries:

| Key | Meaning |
|---|---|
| `descriptor` | must equal the file's descriptor id — a transcript filed under the wrong name is a gap |
| `date` | `YYYY-MM-DD`, the date the procedure was run |
| `by` | a role or handle (`platform-eng`, `on-call`, `@alice`) — **not** an email address; the check rejects anything shaped like one |
| `commit` | 7–40 hex characters, the commit the procedure was run against |
| `result` | `pass` or `fail` — a `fail` transcript is filed (capture is frictionless) but always reads a gap; a floor row is never re-blessed by a transcript that says it failed |

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
pass`, and the date is fresh. That is **all** it means. The tool has no way to
confirm the backup was actually restored, the rollback actually ran, or the
alert actually fired — that rests entirely on the named person's attestation,
carried in version history (who committed the file, when, against what
commit). A passing transcript is evidence a human is willing to put their name
to, dated and versioned; it is not independent proof. Every `pass` observation
says this explicitly, the same way `runbook` and `ci-gate` name what they do not
decide (branch-protection enforcement, whether a procedure was ever run).

## Example transcripts in this directory

`d-backup-restore-exercised.md`, `d-rollback-exercised.md`,
`d-deploy-one-command.md`, `d-smoke-on-deployed.md`,
`d-monitoring-with-alert.md`, `d-cost-alerts.md` — one passing example per row,
fictional values throughout. Copy one to `ops/evidence/<id>.md` in a target
repository, replace every value, and re-run:

```sh
node tools/repo-census.mjs <target-dir> --out repo-census.json
```
