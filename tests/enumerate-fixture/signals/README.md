# signals — the enumerate fixture for #315 slice 3

A small target whose tree states some checklist answers outright, and leaves others unstated:

- `.github/workflows/release.yml`: a manual dispatch, a job-level `environment:` and a
  `permissions:` block, around a release write. Three signals.
- `.github/workflows/nightly.yml`: a push, and no environment or permissions. One signal:
  `person_act` no.
- `.github/workflows/docs.yml`: a manual dispatch and a push. The push starts it with no one's
  act, so `person_act` no: a path that waits for no person decides.
- `scripts/prune.mjs`: a dry run by default, `--apply` to write. A `second_act` signal.
- `scripts/sync.mjs`: writes whenever it runs. No signal.
- `src/server.mjs`: one route behind a listed limiter, one behind none; a soft delete.
- `src/admin.mjs`: a router that applies a limiter the tree defines (`src/limits.mjs`) by name.

Nothing here runs; enumerate reads it.
