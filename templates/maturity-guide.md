---
type: doc
title: "repo-eval — the maturity areas, explained (report partial)"
---
The maturity section scores six areas. This appendix says what each one means, why it matters for running software with AI in the loop, and how the number is worked out.

None of these is a letter grade or a level. Each area is a **percentage over a real list**. We take a population from the codebase that can be counted (every secret, every skill, every recorded incident), and we measure the share of that list that clears the area's bar. It is a number over a real denominator, not an impression. A small, honest count beats a confident guess: where a whole area could not be measured, the report says so instead of showing a made-up number.

### How each area is scored

- **Coverage** is the headline percentage: how much of the counted list meets the bar. If we walked the whole list it is marked *counted*; if the list was large and we walked a stated sample it is marked *sampled*, with the size and method shown.
- **Depth** is one sentence on the best example found. High depth over low coverage reads "the team knows how; it just is not everywhere yet." Low coverage is not the same as not knowing how.
- **Enforced** means the coverage is itself machine-checked, so a slip is caught automatically. Tests that run on every merge are the usual example.
- **Generative** means the system extends its own coverage, with AI in the loop. This is the frontier, and it is expected to be empty for now.

The per-area percentages are the stable truth. The pooled figure at the foot of the maturity table only rolls them up, and it moves whenever a new area gains a measure.

### The six areas

**Artifact legibility — can you tell *why* the code is the way it is, from the files alone?**
An AI agent has only the files. If the reasoning behind a choice lives in someone's head or a chat thread, the agent cannot use it and will guess. This area counts the consequential decisions whose rationale can be reconstructed from the repo itself.

**Context economy — can an agent load just what it needs, without dragging in everything?**
A bounded, single-purpose piece of the codebase is quick and safe for an agent to load. A tangled one pulls the whole system along with it, which is slow and error-prone. This area counts how many of the modules or skills stand on their own.

**Deterministic gates — do machine checks catch mistakes before they ship?**
A test, type-check, or schema that fails loudly is a rule the AI cannot talk its way past. A check that only a human remembers to run is skippable, and under time pressure it gets skipped. This area counts how many of the system's actions or changes a test actually covers. Whether those checks run automatically at merge time is the *enforced* flag.

**Verification — can you *prove* what happened, not just trust a report?**
An agent saying "done" is a claim. A durable, structured record of what it actually did is proof. As AI makes the doing cheap, proving it was done right becomes the real limit. This area counts how many of the system's actions leave a durable, machine-readable record. An ordinary text log you have to read by hand is how you investigate a problem, not how you verify an action, so it does not clear the bar.

**Delegation — when the AI acts, is it safely bounded?**
The dangerous shape is an agent that takes in untrusted content, *and* can act, *and* reaches outside the company. That combination is called the trifecta, and any two of the three is far safer than all three. On top of that: which secrets the agent can read, and whether an irreversible action has a human at the moment it fires. This area counts how many of the AI surfaces stay inside a safe capability budget, and traces whether the real secrets sit below the boundary the model can reach.

**Improvement loop — when something breaks, does the fix become permanent?**
A one-off fix that lives in a person's memory tends to recur. A fix wired into a check, a rule, or a test cannot recur the same way. This area counts how many of the recorded incidents became a durable mechanism rather than a note someone hopes to remember.
