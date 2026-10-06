# structure-stale-target

A planted known-answer target for structure-scan's stale-name pass (#120),
read with no tools on PATH so only the tree pass runs.

Stale: `src/routes_old.ts` beside `src/routes.ts`, and `src/handler.old.js`
beside `src/handler.js` — `old` as the last token before the extension.

Not stale: everything under `packages/db/migrations/` — `0015_retire_old_roles.sql`,
`0016_roles_old.sql`, and `seed-v1.sql` beside `seed-v2.sql` — because a
migration's name is history by design, whatever it says; and
`scripts/retire_old_roles.sql`, where `old` is a word inside the name, not a
suffix.
