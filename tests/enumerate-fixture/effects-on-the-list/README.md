Fixture target for `map/enumerate.mjs` (tests/blocks/enumerate-effects-on-the-list.mjs, #298). Not
run: read only as a scan target, and every command it names is inert text.

- `lib/jobs.mjs` and `lib/cp-module.cjs` start Node subprocesses (a destructured `spawnSync`, a
  module `cp.execSync`): each is one `process spawn (js)` member. `lib/query.mjs` calls a regex's
  `.exec(` and a database's `exec(` and names no `child_process`: no member.
- `.github/workflows/release.yml` writes outside the runner in every workflow kind the enumerator
  reads (a release, a `gh api` DELETE written over two lines and a `gh api` field, which gh sends as a
  POST, an issue comment, an artifact upload, a deploy action, a `git push`), beside reads that list
  nothing (`gh api` GET, `gh issue list`, a download, a step named for a write, a commented write).
  `.github/workflows/read-only.yml` only reads. `ci/template.yml` is a workflow template outside
  `.github/workflows` that opens a pull request.
- `lib/patterns.mjs` is a pattern table and its tests: lines that read for a call and make none.
- `map/scanners/adapters/opengrep/taint/` and `…/control/` sit at the paths an adapter in this engine
  declares as its rule pack and planted control: data a scanner reads, never listed.
  `map/scanners/adapters/opengrep/helper.py` sits beside them, under no declared directory, and is.
