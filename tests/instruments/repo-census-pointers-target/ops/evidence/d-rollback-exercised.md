---
descriptor: d-rollback-exercised
date: 2026-09-20
by: on-call
commit: b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1
result: pass
from: v3.0.0
to: v2.9.9
verified: health check green
---

A decoy transcript at the DEFAULT evidence location (`ops/evidence/`), which
the packet's `evidence` pointer (`ops/nonstandard-evidence`) must never fall
back to. If repo-census reads this file, the "no fallback" rule is broken.

```
$ ./ops/rollback.sh production v2.9.9
rollback complete
```

Health check confirmed green after rollback.
