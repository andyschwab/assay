---
type: doc
title: "Lane: practice-review (a review session's seed body)"
lane: practice-review
session_title: "{{NAME}}: practice-review on {{HEAD_LABEL}} ({{DATE}})"
artifact: "{{NAME}} Practice Review {{DATE}}"
outputs: "map/terrain.md map/censuses.yaml map/findings/practice-review-legibility.yaml map/findings/practice-review-context.yaml map/findings/practice-review-gates.yaml map/findings/practice-review-verification.yaml map/findings/practice-review-delegation.yaml map/findings/practice-review-improvement.yaml map/findings/practice-review-multiplayer.yaml"
---
The engagement is a read-only evaluation of a repository the owner has access to; the consumer that seeded this session collects what you publish, validates it and records it. If a step is impossible, record why and continue with the rest.

HARD RULES. This session executes nothing: it reads files and writes its own findings, and that is all. Never run the target's code, its install, build or tests; never run assay, a scanner, or any script you fetched; never install anything. Never push, commit, open issues or PRs, or comment on this repository or any other. Never write into this checkout's tree: your files live in your scratch directory. Never include a secret value, an environment value, or an author name or email in anything you publish; cite the file and line and describe the shape instead. Publish exactly one private Artifact page (Artifact tool) and give its URL in your final message.

TASK. assay's practice review of this repository at one head: Pass 0 (terrain) and Passes 1–7 (the seven dimensions), written as the files a program collects.

1. Checkout. {{HEAD_STEP}} Record: branch, the head sha, its commit date, shallow or not.

2. The method. Read it at the engine {{ASSAY_REF}}: `git clone https://github.com/andyschwab/assay <scratch>/assay`, then `git -C <scratch>/assay checkout -q {{ASSAY_REF}}`, and read `<scratch>/assay/map/METHOD.md` in full, then `map/SCHEMA.md`. They are the method and the finding format; follow them, not this prompt, wherever they say more. Where the method says to run a command, do not: this lane reads the target and writes its passes, and the consumer runs whatever else the run needs.

3. The passes. No prior run is in your context, and none may be read: derive the terrain blind (METHOD.md, Pass 0). {{FOCUS}} Pass 0 writes `map/terrain.md`. Passes 1–7 each write `map/findings/practice-review-<pass>.yaml` (legibility, context, gates, verification, delegation, improvement, multiplayer), strengths as well as gaps, every finding with `file:line` evidence that resolves in this checkout. Run them as parallel subagents after Pass 0, each blind to the others. Enumerate the effect channels and the AI surfaces from a listing, as the method says, and record the censuses it names in `map/censuses.yaml`.

4. Check your own files by reading them. Re-resolve every evidence line against the tree and drop any that does not resolve, saying how many. Check each file against SCHEMA.md's required fields. Do not run `validate`: the consumer validates what it collects, and a file it refuses is sent back.

5. Publish ONE private Artifact page titled "{{NAME}} Practice Review {{DATE}}": a CHECKOUT RECORD (branch, sha, date, the engine sha you read the method at, wall clock, the model each pass ran on, finding counts by pass and polarity), then each output file verbatim, HTML-escaped, in a `<pre>` block between `--- <path> (verbatim) ---` and `--- end <path> ---`, where `<path>` is the file's path under the run: `map/terrain.md`, `map/censuses.yaml`, and the seven `map/findings/practice-review-<pass>.yaml`. Under 4 MB.

Final message: the artifact URL, the head sha, the engine sha, the model each pass ran on, findings by pass and polarity, and how many evidence lines you dropped.
