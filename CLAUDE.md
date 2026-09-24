# CLAUDE.md — working in the assay repo

This repository is **assay**. It draws a map of a repository, measures the map
against a yardstick of requirements, and writes three views (Intake, Maintain,
Improve). `README.md` is the front door. `map/SCHEMA.md` is the authoritative
finding format, `map/METHOD.md` the built-in scanner, `yardstick/README.md` the
requirements contract, and `views/README.md` the views' data formats.

## Ground rules

1. **The map states what is; the views compute how good, bad or urgent.** A
   finding records a fact with `file:line` evidence. It never asserts a severity,
   a priority, a price or a verdict. Views compute severity from the finding's
   descriptors; nothing in assay prices work or decides whether to take a
   repository on.
2. **No claim without evidence.** Every finding cites real file paths and line
   numbers. `node assay.mjs validate` fails closed; run it before compiling.
3. **Fail loud, never empty.** A tool that errored never reads as "0 findings";
   an unmapped scanner category halts the projection; a clean instrument run is
   recorded explicitly; a scanner that did not run is recorded in the run record
   (`map/scanners.yaml`) as skipped or failed with a reason, and nothing compiles
   without one. A requirement no run decided reads not measured, never met.
4. **Every view reads the same measurement.** Views take the yardstick's
   measurement of one map (`yardstick.yaml`); a view never reaches around it
   to decide a requirement on its own. `node assay.mjs compile` writes them all
   in one pass.
5. **Axes and topics are property-named, never tool-named**, and shared: two
   scanners measuring one property corroborate on one axis. An axis no present
   scanner measures reads not measured, never clean.
6. **No confidential material.** This is a public repository: no client or
   target names, no run history, no real credentials, no links into private
   repositories. Fixtures are the public known-answer targets only; anything
   shaped like a secret in `tests/` is an inert planted string.

## Checks

```sh
npm test                                            # the regression harness (fails closed)
node assay.mjs validate <run>                       # validate a map
node assay.mjs score <run> --answers <target>/ANSWERS.yaml   # grade recall
```

A change that moves a pinned score is a **reviewed** re-bless of
`tests/golden.json` in the same commit, never a silent drift. A unit or negative
assertion that fails is always a real regression, never re-blessed.
