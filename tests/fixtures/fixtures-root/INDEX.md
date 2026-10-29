---
type: doc
title: "fixtures-root — evaluation package"
---

# fixtures-root — evaluation package

One map, one yardstick, four views. No single verdict: one flat axis roster,
each axis its own posture; a requirement is met, unmet, mixed, or not measured
— never priced, never graded pass/fail.

**Scanners:** deep-code-review, repo-census · skipped: dependency-scan (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); fresh-clone (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); gitleaks (path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib)); repo-eval (fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval); structure-scan (fixture run: structure-scan was not executed over this public target) · **23 findings** · run  · raw base (no triage).

**Models of record:** deep-code-review on claude-opus-5-5.

## The four views

- **Intake** _(can this map be carried?)_ — [`INTAKE.md`](INTAKE.md): 11 open · 1 met · 23 to run of the floor requirements.
- **Maintain** _(is it still healthy?)_ — [`MAINTAIN.md`](MAINTAIN.md): 10 open · 1 met · 23 to run of the fleet requirements.
- **Improve** — [`views/improve/axes.md`](views/improve/axes.md): the walk (no `views/improve/prose.yaml` — author it to compile `IMPROVE.md` too).
- **Owner** _(what is true of it, and what do I do first?)_ — [`OWNER.md`](OWNER.md): 11 open · 1 met · 23 could not tell of the floor requirements, in the owner's own register.

## The roster (glance)

- `artifact-legibility` — 3 open · 0 held _(fed only)_
- `context-economy` — 1 open · 0 held _(fed only)_
- `deterministic-gates` — 1 open · 2 held _(fed only)_
- `verification` — 1 open · 0 held _(fed only)_
- `improvement-loop` — 1 open · 0 held _(fed only)_
- `code-correctness` — 3 open · 1 held _(deep-code-review)_
- `code-maintainability` — 1 open · 0 held _(deep-code-review)_
- `code-security` — 8 open · 1 held _(deep-code-review; partially measured — deep-code-review covered this axis partially: B partial (the only routes in the repo are the 5 in targets/flawed-webapp/server.mjs, reviewed in that target's own run and not re-probed (route census in the report lists them). Outside it: the CI workflow's trust surface (pull_request trigger, token permissions, third-party actions) was read in full, see F6 and F7; clean-lib has no network or untrusted-input sink beyond its string argument); N partial (the only runtime config file is targets/flawed-webapp/config/settings.mjs, reviewed in its own run and not opened here. Outside it: git grep -ciE 'process\.env|\.env|secret|apikey|api_key|token' gave 0 hits; CI uses no secrets; .gitignore read (ignores node_modules, logs, run outputs)); Q partial (personal data stores exist only in targets/flawed-webapp (data-store census in the report: user records with emails, notes, the token table, outbound mail and backup egress), reviewed in its own run; erasure through purgeAll is not re-assessed here. Outside it: git grep for email-shaped strings gave 0 hits; minimist is MIT; the public repo has no LICENSE (F9); git history holds no file absent at HEAD, so erasure from the tree is not undone by history))_

_Not measured this run: `artifact-legibility`, `context-economy`, `deterministic-gates`, `verification`, `delegation`, `improvement-loop`, `multiplayer` — repo-eval skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval. Absence of findings is absence of looking, not health._

## The yardstick (glance)

12 of 57 requirements decided by this run (met 1 · unmet 10 · mixed 1 · not applicable 0); 45 not measured, of which 22 are claim-only rows a sidecar decides, never a run. Unmet: `d-personal-data-enumerated`, `d-backup-restore-exercised`, `d-deploy-one-command`, `d-rollback-exercised`, `d-smoke-on-deployed`, `d-architecture-page`, `d-agent-contract`, `d-monitoring-with-alert`, `d-cost-alerts`, `d-runbook`. The full measurement is `yardstick.yaml`.

## The data files

| Artifact | Reader | What it is |
|---|---|---|
| [`views/intake.yaml`](views/intake.yaml) | machine | Intake's floor rows: open, met, to run, not seen. |
| [`views/maintain.yaml`](views/maintain.yaml) | machine | Maintain's fleet rows: open, met, to run, not seen. |
| [`views/owner.yaml`](views/owner.yaml) | machine | Owner's floor and beyond-floor rows, each joined with the owner's risk/fix register, plus what was not looked at. |
| [`views/improve.yaml`](views/improve.yaml) | machine | Every requirement on the yardstick, grouped by topic. |
| [`yardstick.yaml`](yardstick.yaml) | machine, and what a repository's own claims are compared against | The measurement itself: per requirement, what this run decides and how; claim rows read not measured by construction. |
| [`views/improve/axes.md`](views/improve/axes.md) | human, detail | The walk: per-axis properties, risks, seams, the not-measured register, requirements by topic. |
| [`handoff/START-HERE.md`](handoff/START-HERE.md) | machine / agent | How to act, sequenced worst-first. |
| [`handoff/REMEDIATION.md`](handoff/REMEDIATION.md) | machine / agent | The full spine: every actionable gap, verbatim fix, proof step. |
| [`handoff/plan/`](handoff/plan/) | machine / agent | One session prompt per Critical/High item (interview → fix → prove). |

## Appendices — scanner-native reports (provenance, in each scanner's own voice)

- **deep-code-review** — ran; no native report in this run (its port rows in `map/findings/` are the record).
- **dependency-scan** — skipped this run: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib).
- **fresh-clone** — skipped this run: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib).
- **gitleaks** — skipped this run: path-scoped: run per target (tests/fixtures/notesbox, tests/fixtures/cleanlib).
- **repo-eval** — skipped this run: fixture: the root sheet carries no method-pass item; the targets' runs cover repo-eval.
- **structure-scan** — skipped this run: fixture run: structure-scan was not executed over this public target.

_Improve leads with the report; these are the raw scanner voices behind the projection —
listed, never merged (independent convergence is recorded, not collapsed)._

## Regenerate

```
node assay.mjs compile tests/fixtures/fixtures-root
```
Deterministic and re-runnable. Drop `owner/decisions.yaml` to fold in owner triage
(optional; never required — the raw base always compiles).

---
_assay evaluation engine. Run `fixtures-root`._
