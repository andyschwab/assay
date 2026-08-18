# CLAUDE.md — working in the assay repo

This repository is **assay**, an evidence-based repository-evaluation engine.
`README.md` is the front door; `METHOD.md` is the built-in scanner method;
`SCHEMA.md` is the authoritative finding format.

## Ground rules for the engine

1. **The base states what is; the views compute how good/bad/urgent.** A finding
   records a fact with `file:line` evidence. It never asserts a severity or a
   priority — those are computed from the descriptors by the views. Keep that
   split intact.
2. **No claim without evidence.** Every finding cites real file paths and line
   numbers. `tools/validate.mjs` fails closed; run it before compiling anything.
3. **Fail loud, never empty.** A tool that errored must never read as "0
   findings"; an unmapped scanner category halts the projection; a verified-clean
   instrument run is recorded explicitly. Do not add a check that can fail silently
   into a positive signal.
4. **Axes are property-named, never tool-named**, and shared — two scanners
   measuring one property corroborate on one axis. An axis no present scanner
   measures reads "not measured", never "clean".
5. **No confidential material.** This is a public repo: no client data, no run
   history, no real credentials. Fixtures are the public known-answer targets
   only. Anything shaped like a secret in `tests/` is an inert planted string.

## Checks

```sh
npm test                       # the regression harness (fails closed)
node tools/validate.mjs <run>  # validate a findings base
node tools/score.mjs <run> --answers <target>/ANSWERS.yaml   # grade recall
```

A change to a tool that moves a pinned score is a **reviewed** re-bless of
`tests/golden.json` in the same commit — never a silent drift. A unit or negative
assertion that fails is always a real regression, never re-blessed.
