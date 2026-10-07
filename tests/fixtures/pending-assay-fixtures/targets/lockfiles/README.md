# lockfiles

A fixture target for assay's dependency-scan instrument (assay #17). It is not an
application: two planted lockfiles give the instrument something to find. Do not fix
them; `ANSWERS.yaml` is the known-answer sheet.

- `app/package-lock.json` pins minimist 1.2.5, which carries a known critical advisory.
- `legacy/package-lock.json` is truncated on purpose, so no package manager can read it.
