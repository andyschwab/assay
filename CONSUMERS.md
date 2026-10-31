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
| `node assay.mjs start --out <run> <target> [--allow-exec]` | a run drawn with every offline instrument; exit 3 when the tools are not ready, and nothing is written |
| `node assay.mjs lane <scanner> --name <Name> [--head <ref>] [--focus <text>] [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>]` | the read-only seed a judgment scanner's review session starts from |
| `node assay.mjs ingest <run> --tool <scanner> --raw <file> --exit <code> [--target <root>] [--model <id>]` | a scanner's output turned into findings, its row in the run record flipped to ran |
| `node assay.mjs record <run> <scanner> <ran\|skipped\|failed> [--reason <text>] [--model <id>] [--pass <pass>]` | one scanner's disposition in the run record |
| `node assay.mjs validate <run> [--target <target>] [--lane <scanner>]` | exit 0 only for a run that validates; fails closed |
| `node assay.mjs compile <run> [--target <target>] [--since <prev-run>] [--packet <dir>]` | the measurement and every view, written in one pass |
| `node assay.mjs ratchet <run> (--baseline <file> \| --baseline-ref <ref> --repo <dir>)` | exit non-zero when a met or mixed requirement regresses |
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
| `map/scanners.yaml` | the run record: each scanner ran, skipped or failed, with its reason |
| `map/findings/<scanner>.yaml` | the findings, one file per scanner (`map/SCHEMA.md`) |
| `yardstick.yaml` | the measurement: each requirement met, unmet, mixed, not measured or not applicable |
| `views/intake.yaml`, `maintain.yaml`, `improve.yaml`, `owner.yaml`, `since.yaml` | each view as data |
| `views/improve/chains.json`, `handoff/sequence.json` | Improve's ranked chains and its fix sequence as data |
| `INDEX.md`, `INTAKE.md`, `MAINTAIN.md`, `IMPROVE.md`, `OWNER.md`, `SINCE.md` | the pages, for a person |
| `routine.yaml` | what the routine did, when a routine drew the run (`routine/README.md`) |

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
views/README.md
yardstick/list.mjs
.github/actions/tools/action.yml
.github/workflows/branch-cleanup.yml
```
