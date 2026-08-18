# canon/ — the declared enumeration contract (per target)

One file per evaluated target (`<target>.yaml`), declaring the target's
effect-channel population, AI surfaces, census `subject_type`s, and credential
population. Authoritative spec — the why (a declared contract vs. copying a prior
run), how a run reads it, and the maintenance discipline: `SCHEMA.md` §8.

A canon exists so two runs of the same target enumerate the *same* populations
and their cross-run diff means something. The rule is decide-once: the canon is
the home of that decision, version-controlled and human-ratified. Reusing a
declared contract (both runs read the same spec, blind to each other's findings)
is legitimate; reusing a prior run's *findings* is contamination — determinism is
meant to be an emergent property of a shared rule applied blind, never achieved by
copy-forward.

A run activates the validator's canon drift-check by naming its canon in
`report-prose.yaml` (`canon: <name>`), resolved as `canon/<name>.yaml` here (or
beside the target's own record). A run with no canon yet derives the population
blind and proposes a new canon as a reviewed diff.

This directory ships empty; a target's canon is authored when it is first
evaluated.
