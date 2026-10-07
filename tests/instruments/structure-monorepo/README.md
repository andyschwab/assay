# structure-monorepo

A known-answer fixture for structure-scan's knip step (#118): a pnpm workspace whose
root `vitest.config.ts` imports `vitest/config`, a dependency that is declared but not
installed (no `node_modules`). knip loads that config to find entry points, so it can
only read this tree once the dependencies are installed.
