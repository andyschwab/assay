# Pending for assay-fixtures (assay #17)

Files this repository's change needs in the public
[assay-fixtures](https://github.com/andyschwab/assay-fixtures) repository, which a
change here cannot push to. **The parent applies them to the fixtures repository**;
once that lands, this directory can go in a follow-up change (the
`dependency-scan-fixture` harness block reads it until then).

Apply as `targets/lockfiles/` in assay-fixtures, dropping the `.pending` suffix:

| here | in assay-fixtures |
|---|---|
| `targets/lockfiles/README.md` | `targets/lockfiles/README.md` |
| `targets/lockfiles/ANSWERS.yaml` | `targets/lockfiles/ANSWERS.yaml` |
| `targets/lockfiles/app/package.json.pending` | `targets/lockfiles/app/package.json` |
| `targets/lockfiles/app/package-lock.json.pending` | `targets/lockfiles/app/package-lock.json` |
| `targets/lockfiles/legacy/package.json.pending` | `targets/lockfiles/legacy/package.json` |
| `targets/lockfiles/legacy/package-lock.json.pending` | `targets/lockfiles/legacy/package-lock.json` |

The fixtures repository's own README lists its targets; add `lockfiles` there.

Why `.pending`: GitHub's dependency graph parses any file named `package-lock.json`.
Under its real name the minimist 1.2.5 lockfile would raise a Dependabot alert (and a
security-update pull request) on **this** repository, and the truncated one a parse
error. In assay-fixtures the alert is expected: the target exists to carry a known
advisory, so dismiss it there as "used in tests", and do not let a security update
bump it (it would erase the answer).

`ANSWERS.yaml` here is byte-identical to the frozen copy at
`tests/fixtures/lockfiles/ANSWERS.yaml`; the harness checks that. The stored run in
`tests/fixtures/lockfiles/` is dependency-scan's real output over these files, laid
out as `targets/lockfiles` (`node assay.mjs dependency-scan` then
`node assay.mjs ingest`).
