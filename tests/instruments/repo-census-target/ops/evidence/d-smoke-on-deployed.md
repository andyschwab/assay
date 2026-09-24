---
descriptor: d-smoke-on-deployed
date: 2026-01-01
by: on-call
commit: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3
result: pass
environment: production
check: https://app.example.test/healthz
---

Old smoke run from the start of the year.

```
$ curl -sf https://app.example.test/healthz
ok
```

Stale by design for the test.
