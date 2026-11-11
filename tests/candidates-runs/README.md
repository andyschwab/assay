# tests/candidates-runs — the cross-run tally's fixture runs (#265)

Four small runs that `tests/blocks/candidates-across-runs.mjs` copies, measures and tallies
(`node assay.mjs candidates`). Their targets are inert `example.org` identities, never a real
repository; their findings are planted, each a practice-review fact no requirement takes,
most naming a `property:`.

| Run | identity | drawn | properties |
| --- | --- | --- | --- |
| `alpha-1` | `https://example.org/fixtures/alpha.git` | 2026-01-10 | release-signing, backup-push, one unnamed |
| `alpha-2` | `git@example.org:fixtures/alpha` (the same target over ssh) | 2026-02-10 | release-signing, backup-push, audit-log-retained |
| `beta-1` | `https://example.org/fixtures/mono#services/beta` | 2026-03-10 | release-signing, changelog-kept, one unnamed |
| `unstated` | none | none | changelog-kept |

Over all but `unstated`, release-signing is on two independent targets (proposed) and the
rest on one (held); the saturation series is +2, +1, +1. `unstated` is refused until
`--target` and `--date` state what it does not.
