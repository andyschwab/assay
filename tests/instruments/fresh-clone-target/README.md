# fresh-clone-target

A public known-answer fixture for `tools/fresh-clone.mjs` (the fresh-clone
instrument). It carries no dependencies, so the runner can exercise it in place
(`--no-clone`) without an install. The expected raw document: `test` and `build`
pass; `lint`, `typecheck` and `migrate` are not declared; `install` is not declared
(nothing to install); and of the three README claims below, `npm run deploy` is
**missing** — the fixture's one planted gap.

## Usage

```sh
npm run test
npm run build
npm run deploy
```
