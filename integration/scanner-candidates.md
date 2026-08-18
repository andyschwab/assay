---
type: doc
title: "Scanner & instrument candidates — the integration roster"
---
# Scanner & instrument candidates

The roster of external evaluators that could plug into the engine, with the
properties that decide whether and how each plugs in. Survey verified against
public sources 2026-08-18; license and maintenance facts are dated snapshots and
re-verification precedes any adoption decision.

Two distinct roles organize the roster; both are defined in
`/integration/scanner-contract.md` (the peer port in §2–3,
the instrument role in §3a):

- **Peer scanner** — a judgment-bearing evaluator with its own taxonomy and
  prose-worthy findings. Few exist; each carries an adapter, lands findings in
  the shared base, and keeps a native appendix. deep-code-review is the model.
- **Instrument** — a deterministic mechanical tool that enumerates or verifies a
  population (secrets, dependencies, hygiene checks). Its output is repeatable
  by construction (deterministic, enumerate-before-assess) and feeds the
  measured-coverage layer the way `tools/enumerate.mjs` does today — an
  instrument thickens denominators and risk lists in existing report areas; it
  never adds a chapter. An instrument earns its place only
  by demonstrating it fails loud — a tool that errors into "0 findings" lowers
  total assurance.

## Adopted

| Scanner | Role | Adapter | Notes |
|---|---|---|---|
| repo-eval (native) | peer scanner | `adapters/repo-eval.yaml` | The seven dimension passes; dogfooded as one scanner |
| deep-code-review | peer scanner | `adapters/deep-code-review.yaml` | LLM skill, own A–R taxonomy, per-finding severity + verbatim fixes; contributes the two code axes |
| Gitleaks | instrument | `adapters/gitleaks.yaml` | Integrated via `tools/ingest.mjs` (w-assay-02): every leak → one `secret` row onto code-security; converter validated against a live v8.24.3 run; secrets never copied out of the raw report |
| OpenSSF Scorecard | instrument | `adapters/scorecard.yaml` | Integrated via `tools/ingest.mjs` (w-assay-02): 19 checks mapped onto the native workspace axes, score-banded polarity/severity; first live run pending a target repo in-session (needs GitHub API reach) |

## Core instrument candidates (license-clean, best coverage per integration cost)

| Tool | License | Output | Feeds | Notes (verified 2026-08-18) |
|---|---|---|---|---|
| [Trivy](https://github.com/aquasecurity/trivy) | Apache-2.0 | SARIF, JSON | code-security | Four scanners in one adapter: dependency vulns, IaC misconfig, containers, secrets; severity + fixed-version data. Its own release infra was compromised twice in Mar 2026 — pin release hashes |
| [Opengrep](https://github.com/opengrep/opengrep) | LGPL-2.1 | SARIF, JSON | code-security, code-correctness | The vendor-consortium Semgrep CE fork (Jan 2025), built for redistribution; cross-function taint, 12 languages. Rule curation is the real cost — Semgrep's registry rules were relicensed non-redistributable Dec 2024 |
| [mcp-scan / Snyk Agent Scan](https://github.com/invariantlabs-ai/mcp-scan) | Apache-2.0-family | JSON | product-ai-safety | The only maintained scanner for MCP/agent-config attack surface: tool poisoning, shadowing, rug pulls, injection in tool descriptions; 15+ risk categories. Vendor-owned since the Snyk acquisition (Jun 2025); v0.4.13 Apr 2026 |
| [Agentic Radar](https://github.com/splx-ai/agentic-radar) | Apache-2.0 | HTML + JSON | product-ai-safety | Static agent-workflow topology for LangGraph / CrewAI / OpenAI Agents SDK / AutoGen / n8n; OWASP LLM Top 10 mapping; component-level more than file:line. Young — expect adapter churn |
| Ruff / ESLint (inverted mode) | MIT | SARIF (Ruff native; ESLint via formatter) | deterministic-gates, code-correctness | Full lint output is noise; the honest uses are (a) bug-prone rule families only, or (b) inverted into one gates-census read: "the repo's own lint gate exists and passes" |

## Second-line candidates

| Tool | License | Output | Feeds | Notes |
|---|---|---|---|---|
| [osv-scanner v2](https://github.com/google/osv-scanner) | Apache-2.0 | SARIF (severity since v2.0.0), JSON | code-security | Leaner deps-only alternative to Trivy; Google provenance; guided-remediation subcommand |
| Bandit (Python) / gosec (Go) | Apache-2.0 | SARIF | code-security | Language-scoped security lint; B###/G### taxonomy with CWE; adopt when a target's language mix warrants |
| [Checkov](https://github.com/bridgecrewio/checkov) | Apache-2.0 | SARIF, JSON | code-security | Deeper IaC policy set than Trivy's; graph-based; overlaps Trivy — one of the two suffices per run |
| ModelAudit (Promptfoo, MIT) / ModelScan (Protect AI, Apache-2.0) | MIT / Apache-2.0 | JSON | code-security / product-ai-safety boundary | Model-artifact files in-repo (pickle/H5/ONNX deserialization payloads); category still immature — 2025 picklescan-bypass CVEs |
| Agent-readiness scorers ([kodus/agent-readiness](https://github.com/kodustech/agent-readiness), agent-ready, AgentLint) | MIT / unclear | JSON | workspace-legibility | 2025–26 vintage, very young, presence-checks only (does CLAUDE.md exist), never truth-checks (is it accurate). Watch, don't adopt |

## Dynamic tier (tests a running model or app — a different scanner class)

These need credentials and a live target; they produce per-probe results at repo
granularity, never file:line. They are the realistic path to real
`product-ai-quality` coverage (`w-toolchain-27`).

| Tool | License | Notes |
|---|---|---|
| [garak](https://github.com/NVIDIA/garak) (NVIDIA) | Apache-2.0 | Probes a live LLM endpoint: injection, jailbreak, leakage; v0.15.0 (May 2026) adds multi-turn GOAT + agent-breaker probes. Very active |
| [promptfoo](https://github.com/promptfoo/promptfoo) | MIT | Evals + red-team (50+ vuln types); its config lives in the target repo, so config-presence is itself a static quality signal. **Acquired by OpenAI Mar 2026; OSS future unclear — hold until it clarifies** |
| Giskard | Apache-2.0 | Agent testing / RAG evaluation; v3 rewrite is beta and v2 unmaintained — an integration-risky window |

## Excluded, with reasons

| Tool | Reason |
|---|---|
| CodeQL | Strongest deep-semantic SAST, but the CLI terms restrict scanning to OSI-licensed codebases / GitHub OSS CI — unusable against private client repos |
| TruffleHog v3 | AGPL-3.0 — copyleft risk if the engine is ever offered as a service; its verified-credential probing also phones out, which the eval's egress posture disallows by default |
| dependency-review-action | Requires GitHub PR context; not a repo-local scanner |

## What no OSS tool covers (the differentiation map)

- **Workspace truth**: nothing verifies that agent-facing docs are *accurate* —
  that documented commands run, that described structure matches reality. The
  readiness scorers check presence, not truth. This is repo-eval's home ground.
- **Static product-AI quality**: no tool statically assesses whether shipped AI
  features carry evals/grounding; the nearest proxy (eval-config presence) is a
  check written in-house.
- **Injection-chain statics**: treating the LLM as an untrusted taint edge
  (source-tool → model → sink-tool reachability) exists only as prototypes;
  Agentic Radar's topology map is the nearest building block. The `reaches`
  graph + `tools/chains.mjs` already compute this from LLM-pass findings.
- **License-clean deep semantic SAST**: CodeQL's capability under an Apache
  license does not exist; Opengrep's taint analysis is the practical ceiling.

## Normalization facts that constrain any integration

- SARIF is a *location* lingua franca, not a normalization layer: `level` is
  only error/warning/note, richer severities ride per-tool property bags, and
  taxonomies differ per tool — so per-scanner severity/category adapters remain
  necessary even for SARIF inputs (every prior-art aggregator — MegaLinter,
  DefectDojo, SonarQube — ended at hand-maintained per-tool mapping tables).
  This is the existing adapter-per-scanner design, confirmed rather than
  replaced.
- SARIF's `fix` object is rarely populated; most instruments emit no `fix`. The
  contract resolves this with the instrument role's relaxed fix rule
  (scanner-contract §3a): a rule-determined remediation ships in the ingest
  profile and sequences normally; a gap without one lands owner-defined pending,
  listed loudly, never dropped.
