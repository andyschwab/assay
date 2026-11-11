# CONSUMERS.md — what a consumer of assay may rely on

A consumer is anything that pins assay and calls it: a routine, an operator's tooling,
a workflow in another repository. This page is the whole contract. **Anything not on
it is internal and may change in any commit without notice**; a consumer that reads
past it (a module's exports, a block's wording, a file this page does not name) owns
the breakage.

Pin assay to a release tag, `vX.Y.Z` (§ Releases), never to a branch.

## Commands and flags

Each is `node assay.mjs <command>`; `node assay.mjs help` lists every command, and a
command's usage line names its flags. These are the ones a consumer may call:

| Command | What a consumer gets |
| --- | --- |
| `node assay.mjs tools install [--dir <bin>] [--run] [--only <scanner>]` | the pinned external tools, each download checked against its pinned sha256 |
| `node assay.mjs tools verify [--run] [--only <scanner>]` | exit 0 only when every pinned tool is on PATH and answers at its pin |
| `node assay.mjs start --out <run> <target> [--allow-exec]` | a run drawn with every offline instrument, and the target's enumerated populations at `map/raw/enumerate.json`; exit 3 when the tools are not ready, and nothing is written |
| `node assay.mjs lane <scanner> --name <Name> [--head <ref>] [--focus <text>] [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>]` | the read-only seed a judgment scanner's review session starts from; a reviewer whose adapter pins its method by commit is seeded to fetch and read exactly that commit, and to stop when it cannot; a lane with `inputs` (practice-review reads `map/raw/enumerate.json`) is refused without `--inputs-dir`, the directory holding them at the run's own paths |
| `node assay.mjs lane --list [--json]` | every lane, unfilled: `{ lanes: [{ scanner, lane, outputs, inputs, passes }] }`; the built-in scanner's lane carries its passes (the `practice-review-<pass>.yaml` files), every other lane `passes: []`; a seed carries the same `passes` |
| `node assay.mjs ingest <run> --tool <scanner> --raw <file> --exit <code> [--target <root>] [--model <id>]` | a scanner's output turned into findings, its row in the run record flipped to ran |
| `node assay.mjs record <run> <scanner> <ran\|skipped\|failed> [--reason <text>] [--model <id>] [--pass <pass>]` | one scanner's disposition in the run record |
| `node assay.mjs validate <run> [--target <target>] [--lane <scanner>]` | exit 0 only for a run that validates; fails closed |
| `node assay.mjs project <run> [--json]` | the run's projection and chains, read straight off its findings, so it reads a run that validates red: `{ run, axes: { <axis>: n }, unmapped: [{ id, category }], needs_axis: [{ id, category }], chains: { live: n, lead: <entry label> \| null } }`, `axes` the primary findings per axis in the run's roster; an unmapped row is printed and exits 1 |
| `node assay.mjs toolchain <checkout> [--json]` | the checkout's toolchain as fresh-clone reads it, executing nothing: `{ toolchain: { family, manifest, package_manager, lockfile, declared, other_families, database_signals, … } }`, `family` one of `node`, `python`, `go`, `rust`, `ruby`, `jvm`, `none`; for dispatching the fresh-clone measurement of a run drawn without `--allow-exec` |
| `node assay.mjs compile <run> [--target <target>] [--since <prev-run>] [--packet <dir>]` | the measurement and every view, written in one pass |
| `node assay.mjs ratchet <run> (--baseline <file> \| --baseline-ref <ref> --repo <dir>)` | exit non-zero when a met or mixed requirement regresses |
| `node assay.mjs compare <previous> <current> [--json]` | what moved between two measurements (`yardstick.yaml`, or a baseline read the same way): `{ previousVersion, currentVersion, versionChanged, rows: [{ id, classification, previous, current }] }`, `classification` one of `improved`, `regressed`, `unchanged`, `newly-measured`, `no-longer-measured`, `yardstick-only` (`yardstick/README.md`); exits 0 whatever moved, 2 when a measurement cannot be read |
| `node assay.mjs maturity <run> [--write]` | Improve's maturity coverage per dimension; `--write` writes `views/improve/maturity-grades.yaml` (`{ dimensions: [{ dimension, coverage: { pct, met, of, … } \| null, not_measured, … }], aggregate: { pct, met, of, over } }`) |
| `node assay.mjs variance <run> <run> [<run> …] [--json]` | repeatability across runs of one target: `{ pct, union, core, byDimension, byModelPair, descriptors, requirements }`, `pct` the share of the union every run found, `core` the facts every run found, `requirements` `{ pct, decided, agree, divergences: [{ id, statuses }] }`, the share of requirements any run decides whose status every run shares |
| `node assay.mjs routine <repo> --out <run> [--baseline <file>] [--base-ref <git-ref>] [--since <prev-run>] [--packet <dir>] [--handoff <dir>]` | the routine (`routine/README.md`): refuses with exit 3 until the pinned tools are ready, then draws the run with the offline instruments, records every other scanner skipped with its reason, validates, compiles and ratchets against the baseline when one exists; writes the run and its `routine.yaml` (what it did and its `gate`: `held`, `failed`, `skipped`, `not-run`, or `refused` with each tool not ready); exits 0 when the gate held or was skipped, 1 when it failed or did not run, 3 when refused. `node assay.mjs routine <repo> --target-steps --handoff <dir>` is the two-job template's target step |
| `node assay.mjs migrate-run <run> [--write]` | a run an earlier engine drew, brought forward |
| `node assay.mjs yardstick [--floor] [--json]` | the requirements, or the floor (§ The floor) |

A command that cannot do its work exits non-zero and says why; it never prints an
empty result and exits 0.

## The floor

The floor is the requirements Intake reads: the rows of `yardstick/requirements.yaml`
tagged `floor`, each with the harm its gap can do (`yardstick/README.md`). The floor
moves between releases, so a consumer reads it, never names its rows by heart:

```sh
node assay.mjs yardstick --floor --json
# { "floor": true, "requirements": [ { "id", "title", "tier", "topic", "tags", "harm" }, … ] }
```

The rows print in the register's order. A register that does not validate lists
nothing and exits 1.

## The tools action

`.github/actions/tools` is a composite action a workflow that checks assay out calls
instead of copying an install step:

```yaml
- uses: ./<path-to-assay>/.github/actions/tools
  with:
    dir: ''   # optional: where to install; empty for <runner temp>/assay-bin
```

It installs what a run executes (`tools install --run`), verifies each tool at its pin
(`tools verify --run`) and appends the directory to `GITHUB_PATH`. A failed install or
verify fails the step and puts nothing on PATH. Node must already be on PATH. Its one
input is `dir`.

Which tools it installs moves with the assay pin: they are the adopted instruments'
`tool:` blocks, each with a pinned artifact for `linux-x64` and `darwin-arm64` (or a
version-pinned PyPI package); on any other platform the install fails. A review
session's own tools are never among them.

## The branch-cleanup workflow

`.github/workflows/branch-cleanup.yml` is callable as a reusable workflow
(`workflow_call`, one input `dry_run`, default true). The caller runs on its own
`push` to the default branch and on `workflow_dispatch`, pins the workflow to a tag,
and grants `contents: write` and `pull-requests: read`. The header of the file shows
the caller in full and says what it deletes and what it keeps.

## The run layout

A consumer reads a run through these paths; `lib/run-layout.mjs` is the one module
that places them, and `views/README.md` states each data format.

| Path in a run | What it holds |
| --- | --- |
| `map/scanners.yaml` | the run record: each scanner ran, skipped or failed, with its reason, and for a reviewer pinned by commit the method it read (`method: { release, commit }`) |
| `map/findings/<scanner>.yaml` | the findings, one file per scanner (`map/SCHEMA.md`) |
| `map/raw/enumerate.json` | the target's enumerated populations, written by `start` (`map/SCHEMA.md` §6e); the practice-review lane's input |
| `map/effect-triage.yaml` | the practice-review lane's triage of every channel candidate, route handler and effect-site member in `map/raw/enumerate.json`: the effect finding that covers it, or out of scope with the reason (`map/SCHEMA.md` §6e) |
| `yardstick.yaml` | the measurement: each requirement met, unmet, mixed, not measured or not applicable |
| `views/intake.yaml`, `maintain.yaml`, `improve.yaml`, `owner.yaml`, `since.yaml` | each view as data (`views/README.md`); a met row in `intake.yaml` and `maintain.yaml` carries `findings:`, what it was met by, and every `owner.yaml` row carries `seen:`, a met row's cited strengths' observations (#260) |
| `views/improve/chains.json`, `handoff/sequence.json` | Improve's ranked chains and its fix sequence as data |
| `views/improve/candidates.yaml` | the findings no requirement takes, grouped by the `property:` each names, the ones naming none as `unnamed` (`views/README.md`): the run's candidate properties (#264) |
| `views/improve/report.json` | the Improve report's model, labels applied: capabilities with their counts and trace phrases, the chains with each live chain's cuts and, when tentative, its weakest step, every entry naming a finding with its confidence and word, the supervision split with its fixes, the label tables (the confidence words among them) and the how-to text; a renderer of the report reads it with `views/improve/prose.yaml`, `security-gate.yaml` and `maturity-grades.yaml`, and imports nothing |
| `INDEX.md`, `INTAKE.md`, `MAINTAIN.md`, `IMPROVE.md`, `OWNER.md`, `SINCE.md` | the pages, for a person |
| `routine.yaml` | what the routine did, when a routine drew the run (`routine/README.md`) |

## Modules

Two modules are contract, each a small pure function a command would only wrap. No
other export is: a consumer that needs a value no command prints asks for a command.

| Module | What a consumer may import |
| --- | --- |
| `lib/run-layout.mjs` | the functions that place a run's paths (§ The run layout), e.g. `findingsDir(run)`, `chainsDataPath(run)`, `improveReportDataPath(run)` |
| `map/child-env.mjs` | `childEnv(set)`: the allow-listed environment to give a target's own script (`PATH`, `HOME`, `CI`, the network plumbing whose proxy URL carries no credential, and the `npm_config_*` values in `set`), so a session's tokens never reach it; pass it to `spawn` as `env` |

## Releases

A release is a tag `vX.Y.Z` on the default branch, cut by
`.github/workflows/release.yml` when a person dispatches it; nothing else tags. Before
it tags it runs the gate and the trailer check below. Its notes are compiled from the
commit messages since the previous tag (`node lib/release-notes.mjs`): first what a
consumer must change, then every commit.

**The change rule.** A commit that carries this page and touches a file of the surface below carries a
`Consumer:` git trailer saying what a consumer must change, or `Consumer: none, <why>`
when nothing, in the message's last paragraph beside its other trailers (git reads
trailers there only). Those trailers head the release notes. A commit that changes a command,
a flag, an output or a file this page promises edits this page in the same commit, so
the trailer follows. `node lib/release-notes.mjs --check` names any commit since the
last tag that touches the surface without one, and the harness runs it on every push
(`tests/blocks/consumer-contract.mjs`). A squash merge keeps the trailers in its
message.

```surface
CONSUMERS.md
assay.mjs
lib/run-layout.mjs
map/child-env.mjs
views/README.md
yardstick/list.mjs
.github/actions/tools/action.yml
.github/workflows/branch-cleanup.yml
```
