# Contributing

- Read `CLAUDE.md` first: the ground rules, the checks, and how a change lands.
- Run `npm test` before opening a pull request. It is the regression harness and
  it fails closed; `npm run lint` and `npm run typecheck` run in CI beside it.
- A new assertion is confirmed red with its rule reverted before it is trusted,
  and the change's `HISTORY.md` entry says so (`CLAUDE.md` § How a change lands).
- A change that moves a pinned score re-blesses `tests/golden.json` in the same
  commit, with the reason. A failing unit or negative assertion is never
  re-blessed.
- A gap in the method, a scanner, the yardstick or a contract is an issue on
  this repository's tracker, stated with public evidence only.
- Fill in the pull request template: what changed, and the evidence it is
  verified.
- Security problems go to the address in `SECURITY.md`, not to an issue.
