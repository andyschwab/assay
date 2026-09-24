---
descriptor: d-smoke-on-deployed
date: 2026-09-16
by: on-call
commit: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3
result: pass
environment: production
check: https://app.example.test/healthz + a scripted login-and-fetch smoke
---

Ran the smoke check against the deployed production app after the day's
release.

```
$ curl -sf https://app.example.test/healthz
{"status":"ok"}
$ ./ops/smoke.sh production
[1/3] health check ... ok
[2/3] login as smoke-test-user ... ok
[3/3] fetch dashboard ... ok (312ms)
smoke: PASS (3/3)
```

All three steps of the scripted smoke run passed against the live production
deployment, not a staging stand-in.
