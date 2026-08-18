---
type: doc
title: "assay report partial — Key concepts (In plain terms)"
---

A few ideas run through the whole report.

Everything starts from findings. A finding is one plain fact about the code, with a file
and line to back it and an id like `F-###` so you can track it over time. A finding never
says good or bad; it says what is. Three lenses turn those facts into judgment: one asks
where effort pays off, one rates how mature each area is, one looks at security. The report
does not call things critical; it works out how bad a problem is from the facts, then ranks
it by how hard it would really be to exploit. That keeps the fear out.

Security findings are presented as risks, not a verdict: each says what it is, who could
trigger it, and how likely, ranked most-likely first. The report issues no deploy/no-deploy
judgment — it shows the risks and leaves the call to the owner.

Most security findings describe an action the system can take, such as sending mail or
deleting data. For each one, four questions matter: what it does, what stops it, whether it
leaves a trace, and how far the damage can spread. The point where an action becomes
irreversible, and a person should stop and confirm, is the halt. One idea comes up around
the AI: a context is dangerous when it holds all three of untrusted input (text from outside
you did not write), private data, and the power to act. Hold any two and you are safe. That
is the trifecta, and holding a powerful agent to two on purpose is a real safety margin.

The terms below define each word precisely.
