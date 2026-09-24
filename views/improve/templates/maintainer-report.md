---
type: doc
title: "assay maintainer report — structural template"
---
<!--
  assay maintainer report TEMPLATE. Do not edit per-run.
  views/improve/report.mjs assembles a run's IMPROVE.md from this template +
  map/findings/ + views/improve/security-gate.yaml + views/improve/maturity-grades.yaml +
  views/improve/prose.yaml + the shipped partials (concepts.md, method.md, glossary.yaml).
  This is the HUMAN briefing: light and scannable, and it issues no
  deploy/no-deploy verdict. Branded/styled rendering, where a downstream deployment
  wants it, lives outside this repo. The actionable remediation (verbatim fixes + proof steps) and
  the per-item session prompts live in the engine's companion handoff/ package, Appendix D.
  {{...}} markers are replaced by the compiler; HTML comments below are section source-rules
  and are stripped from the output.
-->
# AI-Native Readiness Report — {{TARGET}}

**Prepared for:** {{MAINTAINER}}  ·  **Date:** {{DATE}}  ·  **Run:** `{{RUN_ID}}`

## Executive summary
<!-- SOURCE: views/improve/prose.yaml exec_summary (five-part map: scale, strength, watch,
     maturity, gate), rendered as plain prose paragraphs in that order, followed by the
     computed stat strip below. -->
{{PROSE:exec_summary}}

{{COMPILE:snapshot_stats}}

## 1. Maturity, area by area
<!-- SOURCE: views/improve/maturity-grades.yaml (computed) for the native areas, then the axis
     projection (computed) for any scanner-contributed areas + the not-measured honesty
     line. Areas are property-named and shared: a scanner measuring the same property
     lands in the same area, recorded separately. The exec summary carries the compact
     preview. -->
{{COMPILE:maturity}}

{{COMPILE:scanner_axes}}

## 2. Strengths worth keeping
<!-- SOURCE: views/improve/prose.yaml strengths[]. -->
{{PROSE:strengths}}

## 3. The main risks, and the questions only you can answer
<!-- SOURCE: the findings base (map/findings/) graph (computed by map/chains.mjs) + views/improve/prose.yaml
     key_questions[]. The lead: the computed chains, then the open questions, together, so
     the big items and the big unknowns open the report with no jump. -->
{{COMPILE:chains}}

### Questions only your team can answer
{{PROSE:key_questions}}

## 4. What {{APP}} can do
<!-- SOURCE: the findings base effect channels + views/improve/prose.yaml channel_notes (computed).
     Full machine detail in the walk (views/improve/axes.md). -->
{{COMPILE:capabilities}}

## 5. Security risks
<!-- SOURCE: views/improve/security-gate.yaml exposures (computed). The security exposures as
     illuminated risks, most-likely first — each a decision (fix / accept / investigate),
     never a deploy verdict. -->
{{COMPILE:security_risks}}

## 6. Prioritized roadmap
<!-- SOURCE: views/improve/prose.yaml roadmap[]. Each item has a matching session prompt in handoff/plan/. -->
{{PROSE:roadmap_intro}}

{{PROSE:roadmap}}

## 7. Requirements by topic
<!-- SOURCE: the yardstick's measurement (yardstick.yaml), grouped by topic
     (views/improve.yaml, computed by views/improve/topics.mjs) — every requirement on
     the yardstick exactly once, joined to the yardstick for title/tier/check. A topic
     with no requirements today still reads as measured, never silently clean. -->
{{COMPILE:requirements_by_topic}}

## Appendix A — In plain terms
<!-- SOURCE: views/improve/templates/concepts.md (the primer) + views/improve/templates/glossary.yaml (core + concepts).
     The plain-language reference: the ideas the report runs on, then the terms it uses. -->
{{COMPILE:concepts}}

{{COMPILE:glossary}}

## Appendix B — The maturity areas, explained
<!-- SOURCE: views/improve/templates/maturity-guide.md (shipped boilerplate). ELI5 on the six areas: what
     each means, why it matters, and how the number is worked out. Generic across targets;
     the run's actual numbers are the computed §1 table. -->
{{COMPILE:maturity_guide}}

## Appendix C — Method & scope
<!-- SOURCE: views/improve/templates/method.md (shipped boilerplate). -->
{{COMPILE:method}}

## Appendix D — The handoff package
<!-- SOURCE: computed from views/improve/prose.yaml roadmap[]. What's in handoff/ and how to use it. -->
{{COMPILE:handoff_guide}}

{{COMPILE:colophon}}
