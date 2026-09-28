# repo-census-pointers-target

A public known-answer fixture for `map/repo-census.mjs` reading a packet's
`pointers:` (owner/PACKET.md "Pointers"). Its `packet/manifest.yaml` is
auto-picked-up (no `--packet` flag needed) and points at every non-default
location this fixture deliberately uses instead of the discovered ones:

- `architecture: [docs/nonstandard/ARCH.md, apps/web/ARCHITECTURE.md]` — a
  list, root then the one app pointers.apps names.
- `agent_contract: OPERATOR.md` — a non-default name, root only.
- `runbook: docs/nonstandard/RUNBOOK-custom.md`.
- `evidence: ops/nonstandard-evidence` — deliberately NOT `ops/evidence`,
  which also carries a (decoy) `d-rollback-exercised.md` the pointer must
  never fall back to.
- `workflows: .github/ci-workflows` — deliberately NOT `.github/workflows`,
  which also carries a decoy fail-open workflow the pointer must ignore.
- `default_branch: trunk` — with no `--default-branch` flag and no `.git`
  here, discovery alone would default to `main`.
- `apps: [apps/web, apps/ghost]` — `apps/web` exists, `apps/ghost` does not
  (the fixture's planted "app path that does not exist" gap).
