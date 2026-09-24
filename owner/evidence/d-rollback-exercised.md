---
descriptor: d-rollback-exercised
date: 2026-09-12
by: on-call
commit: b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1
result: pass
from: v2.14.0
to: v2.13.3
verified: health check green, error rate back to baseline
---

Exercised the rollback path against staging: deployed v2.14.0, then rolled back
to the last known-good release and confirmed the app recovered.

```
$ ./ops/deploy.sh staging v2.14.0
deployed v2.14.0 to staging
$ ./ops/rollback.sh staging v2.13.3
rolling back staging: v2.14.0 -> v2.13.3
redeployed v2.13.3 (52s)
$ curl -sf https://staging.example.test/healthz
{"status":"ok","version":"v2.13.3"}
```

Error rate in the staging dashboard returned to baseline within two minutes of
the rollback completing.
