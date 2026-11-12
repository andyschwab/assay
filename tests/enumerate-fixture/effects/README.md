Fixture target for `map/enumerate.mjs` (tests/blocks/enumerate-effect-sites.mjs). Not run —
read only as a scan target. `lib/sync.mjs` makes two kinds of effect call (an http write and a
git push) and `lib/backup.mjs` a third http write, so the effect-site members are keyed per file:
one triage entry closes one file's calls of one kind (#272). `lib/mailer.mjs` and `lib/alerts.mjs`
plant the mail and message sends (#272). Every host is reserved (`.invalid`) and nothing runs.
