# Security

## Reporting

Report a security problem in this repository to **hi@andyschwab.link**. Say which
file and line, what you observed, and how to reproduce it; a planted string in
`tests/` is inert by this repository's contract (`CLAUDE.md`, rule 6) and is not
a finding.

This address is the owner's. If the repository moves to the sead-ai
organisation, this line changes with it; the file at the head of `main` is the
one that holds.

## What to expect

- An acknowledgement.
- A fix as a reviewed change that cites the report, with a `HISTORY.md` entry,
  the way every change here lands (`CLAUDE.md` § How a change lands).
- No public disclosure before the fix is on `main`; the report is credited there
  if you want it to be.

## What this repository holds

assay is a public evaluation engine. It carries no client material, no run
history and no real credentials (`CLAUDE.md`, rule 6). Its instruments execute
the code of the repository they evaluate; what that means for where to run them
is in `README.md` and `map/METHOD.md`.
