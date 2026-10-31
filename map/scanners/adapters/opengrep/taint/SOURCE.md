---
type: doc
title: "The static-analysis instrument's taint rules, vendored"
---
# The static-analysis instrument's taint rules, vendored

`js.yml` and `py.yml` are generic taint rules (SQL and command injection, path traversal,
SSRF, unsafe deserialization and eval, XSS, open redirect) for JavaScript, TypeScript and
Python, copied from
`andyschwab/deep-code-review` at `eb65de235d6ded92348bece9f73e3eebae58bf7a`
(`.claude/skills/deep-code-review/templates/semgrep-taint/`), under its MIT licence
(`LICENSE` beside this file). One change: each rule id is `<language>-<property>`
(`js-sqli`, `py-command-injection`, …), so the id is the native category the adapter maps;
the rules themselves are unchanged.

The opengrep instrument runs them (`run.rules` in `../../opengrep.yaml`,
`map/scanners/CONTRACT.md` §3a, #232), after its positive control (`../control/`) has fired.
A target's own rule file (`run.rules.repo`) runs beside them; it never takes their place,
because these are the rules that decide `d-untrusted-input-checked`. No registry pack is
ever run: its rules are not redistributable (`map/scanners/CANDIDATES.md`). To update them,
copy the two files from a later release, keep the ids above, and change the commit above in
the same reviewed change.
