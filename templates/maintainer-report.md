---
type: doc
title: "assay maintainer report — structural template"
---
<!--
  assay maintainer report TEMPLATE. Do not edit per-run.
  tools/compile-report.mjs assembles a run's MAINTAINER-REPORT.md from this template +
  eval/findings.yaml + eval/view-security-gate.yaml + eval/view-maturity-grades.yaml +
  eval/report-prose.yaml + the shipped partials (concepts.md, method.md, glossary.yaml).
  tools/render-pdf.mjs then styles it: the cover carries the "how to read" panel
  (templates/howto.md); the exec summary renders as a dashboard (with a compact maturity
  ladder); the body gets the full maturity ladder, the capability status-rail, and the
  security-risk cards. This is the HUMAN briefing: light and scannable, and it issues no
  deploy/no-deploy verdict. The actionable remediation (verbatim fixes + proof steps) and
  the per-item session prompts live in the engine's companion handoff/ package, Appendix D.
  {{...}} markers are replaced by the compiler; HTML comments below are section source-rules
  and are stripped from the output.
-->
# AI-Native Readiness Report — {{TARGET}}

**Prepared for:** {{MAINTAINER}}  ·  **Date:** {{DATE}}  ·  **Run:** `{{RUN_ID}}`

## Executive summary
<!-- SOURCE: report-prose.yaml exec_summary (five-part map) + computed stat strip. In the PDF
     this renders as a one-page dashboard: each paragraph paired with its visual (stat strip,
     strength and watch callouts, a compact maturity ladder). -->
{{PROSE:exec_summary}}

{{COMPILE:snapshot_stats}}

## 1. Maturity, area by area
<!-- SOURCE: view-maturity-grades.yaml (computed) for the native areas, then the axis
     projection (computed) for any scanner-contributed areas + the not-measured honesty
     line. Areas are property-named and shared: a scanner measuring the same property
     lands in the same area, recorded separately. The exec summary carries the compact
     preview. -->
{{COMPILE:maturity}}

{{COMPILE:scanner_axes}}

## 2. Strengths worth keeping
<!-- SOURCE: report-prose.yaml strengths[]. -->
{{PROSE:strengths}}

## 3. The main risks, and the questions only you can answer
<!-- SOURCE: findings.yaml graph (computed by tools/chains.mjs) + report-prose.yaml
     key_questions[]. The lead: the computed chains, then the open questions, together, so
     the big items and the big unknowns open the report with no jump. -->
{{COMPILE:chains}}

### Questions only your team can answer
{{PROSE:key_questions}}

## 4. What {{APP}} can do
<!-- SOURCE: findings.yaml effect channels + report-prose.yaml channel_notes (computed).
     The PDF renders this as a status-rail list. Full machine detail in the walk (view-axes.md). -->
{{COMPILE:capabilities}}

## 5. Security risks
<!-- SOURCE: view-security-gate.yaml exposures (computed). The security exposures as
     illuminated risks, most-likely first — each a decision (fix / accept / investigate),
     never a deploy verdict. -->
{{COMPILE:security_risks}}

## 6. Prioritized roadmap
<!-- SOURCE: report-prose.yaml roadmap[]. Each item has a matching session prompt in handoff/plan/. -->
{{PROSE:roadmap_intro}}

{{PROSE:roadmap}}

## Appendix A — In plain terms
<!-- SOURCE: templates/concepts.md (the primer) + templates/glossary.yaml (core + concepts).
     The plain-language reference: the ideas the report runs on, then the terms it uses. -->
{{COMPILE:concepts}}

{{COMPILE:glossary}}

## Appendix B — The maturity areas, explained
<!-- SOURCE: templates/maturity-guide.md (shipped boilerplate). ELI5 on the six areas: what
     each means, why it matters, and how the number is worked out. Generic across targets;
     the run's actual numbers are the computed §1 table. -->
{{COMPILE:maturity_guide}}

## Appendix C — Method & scope
<!-- SOURCE: templates/method.md (shipped boilerplate). -->
{{COMPILE:method}}

## Appendix D — The handoff package
<!-- SOURCE: computed from report-prose.yaml roadmap[]. What's in handoff/ and how to use it. -->
{{COMPILE:handoff_guide}}

{{COMPILE:colophon}}
