# test-files-by-convention

A public, self-contained fixture for `tests/blocks/test-files-by-convention.mjs` (#333). Each file
makes one placeholder write; the block reads which of them `enumerate` offers and which it lists
under `excluded`. Every endpoint is a reserved `.invalid` name.

- runtime, offered: `src/adapters/test-media.ts` and `src/jobs/test-cleanup.ts` (a `test-` name
  is no TypeScript runner's convention; no module imports the job), `src/fixtures/seed.ts` and `pkg/test_hooks.py` (test-shaped paths a runtime module
  imports), `src/index.ts` and `pkg/app.py`;
- tests, excluded: `src/foo.test.ts`, `src/bar.spec.js`, `src/__tests__/baz.ts`,
  `pkg/test_thing.py`, `cmd/thing_test.go`, `src/fixtures/unused.ts`.
