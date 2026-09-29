# pnpm monorepo fixture

A fresh-clone regression fixture shaped like a pnpm workspace: gates run once at the root
(`eslint .`, `vitest run`, `pnpm -r typecheck`), migrations are declared at the root, and
the packages declare only what is theirs. `packages/failing` declares its own test, which
fails; `packages/scratch` is excluded by `pnpm-workspace.yaml`.
