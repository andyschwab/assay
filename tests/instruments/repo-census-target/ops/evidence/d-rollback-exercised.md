---
descriptor: d-rollback-exercised
date: 2026-09-12
by: on-call@example.com
commit: b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1
result: fail
from: v2.14.0
to: v2.13.3
verified: health check stayed red
---

Attempted rollback failed.

```
$ ./ops/rollback.sh staging v2.13.3
error: image not found
```

Filed as fail per capture-is-frictionless; will retry.
