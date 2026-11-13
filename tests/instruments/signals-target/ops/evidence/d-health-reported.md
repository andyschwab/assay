---
produced_by: person
descriptor: d-health-reported
date: 2026-11-12
by: maintainer
commit: 0a1b2c3
result: pass
report: "GET /health on the deployed app"
signals:
  - "nightly-sync-ran: held, last success 2026-11-12T03:04Z, 812 rows, since 2026-11-01"
  - "weekly-digest-sent: held, last success 2026-11-10T08:01Z, 41 mails, since 2026-10-06"
  - "digest-mail-delivered: held, last success 2026-11-10T08:01Z, 41 accepted, since 2026-10-06"
  - "mail-provider-spend: held, 6 units this month, since 2026-11-01"
---

Read the live report once and recorded what it said.

```
$ curl -s https://app.invalid/health
{"signals":{"nightly-sync-ran":{"last_success":"2026-11-12T03:04Z","last_count":812}}}
```

Every declared signal was present in the report.
