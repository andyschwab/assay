---
descriptor: d-monitoring-with-alert
date: 2026-09-18
by: platform-eng
commit: e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4
result: pass
monitor: uptime check on https://app.example.test/healthz, 1min interval
alert_fired: 2026-09-18T03:04:11Z
alert_received: 2026-09-18T03:04:47Z
---

Exercised the alert route end to end by taking the health check endpoint down
in staging under a maintenance window and confirming the page route caught it.

```
$ ./ops/maintenance.sh start staging --break healthz
staging healthz now returns 503
[monitor] 2026-09-18T03:04:11Z FIRING: healthz-down (staging)
[pager] 2026-09-18T03:04:47Z delivered to on-call-rotation (ack pending)
$ ./ops/maintenance.sh end staging
staging healthz restored
[monitor] 2026-09-18T03:06:02Z RESOLVED: healthz-down (staging)
```

The alert fired within a minute of the induced outage and reached the on-call
rotation 36 seconds later.
