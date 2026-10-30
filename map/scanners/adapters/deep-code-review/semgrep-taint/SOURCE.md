---
type: doc
title: "The code reviewer's bundled taint rules, vendored"
---
# The code reviewer's bundled taint rules, vendored

`js.yml` and `py.yml` are the code reviewer's own generic taint rules (SQL and command
injection, path traversal, SSRF, unsafe deserialization and eval, XSS, open redirect),
copied from
`andyschwab/deep-code-review` at `eb65de235d6ded92348bece9f73e3eebae58bf7a`
(`.claude/skills/deep-code-review/templates/semgrep-taint/`), under its MIT licence
(`LICENSE` beside this file). One change: each rule id's leading namespace is `taint.`
(`taint.js.sqli`, `taint.py.command-injection`, …); the rules themselves are unchanged.

assay runs them before the review (`before_review` in `../../deep-code-review.yaml`,
`map/scanners/CONTRACT.md` §3g, #201), so the review session reads their results and
executes nothing. A target's own `.semgrep.yml` or `.semgrep` takes their place, as the
reviewer reads it. The registry pack the reviewer adds by default is never run here: its
rules are not redistributable. To update them, copy the two files from a later release and
change the commit above in the same reviewed change.
