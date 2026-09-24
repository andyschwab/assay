---
type: doc
title: "assay report partial — Method & scope"
---

**How this was produced.** The review runs in stages. A terrain pass maps the code and
lists every way the system can act in the world. Then six passes record findings, one per
dimension, reading the delegation dimension deepest because that is where security lives.
Every finding cites a file and line. Nothing rests on "codebases like this usually."

**Facts and judgment stay apart.** The evidence base records what is. It may note that an
action is irreversible and has nothing to stop it. It will not call that critical. Severity,
and priority come from the views. They are computed from the
facts: how reversible the action is, whether it leaves the system, how far the damage
spreads, and how hard it is to trigger. Keeping the two apart stops a hopeful tone from
hiding a real risk.

**Security risks.** The security view surfaces each exposure as a decision, not a verdict:
what it is, who could trigger it, how likely, and how to fix it. The report ranks them by
likelihood and issues no deploy/no-deploy judgment — it presents the risks and leaves the
call to the owner.

**Scope.** The review is read-only. It cannot see runtime configuration, deploy settings,
or anything outside the repository. Each finding carries a confidence. Confirmed means
verified in the code. Plausible means strongly inferred. Unverified means not proven. "I
confirmed there is no gate" is kept separate from "I did not find one." Anything the review
could not settle from the code is raised as a question for the team, not guessed.

**Order.** A self-review leads with strengths, then the coverage gap. A security engagement
leads with exposure. Same facts, different order for the reader.
