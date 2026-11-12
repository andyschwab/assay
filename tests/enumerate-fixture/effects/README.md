Fixture target for `map/enumerate.mjs` (tests/blocks/enumerate-effect-sites.mjs). Not run —
read only as a scan target. `lib/sync.mjs` makes two kinds of effect call (an http write and a
git push) and `lib/backup.mjs` a third http write, so the effect-site members are keyed per file:
one triage entry closes one file's calls of one kind (#272). `lib/mailer.mjs`, `lib/alerts.mjs` and
`lib/digest.py` plant mail and message sends, defined and called (#272), beside in-process
`notify` and socket `send` calls that are not one. Every host is reserved (`.invalid`) and nothing runs.
