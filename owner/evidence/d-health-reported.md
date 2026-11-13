---
produced_by: person
descriptor: d-health-reported
date: 2026-09-18
by: platform-eng
commit: e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4
result: pass
report: "GET https://app.example.test/health on the deployed app"
signals:
  - "nightly-sync-ran: held, last success 2026-09-18T03:04Z, 812 rows, since 2026-09-01"
  - "weekly-digest-sent: held, last success 2026-09-15T08:01Z, 41 mails, since 2026-08-04"
  - "mail-provider-spend: held, 6 units this month, since 2026-09-01"
---

Read the live health report once, after the nightly sync, and checked every
declared signal was present with a state.

```
$ curl -s https://app.example.test/health | jq '.signals | keys'
["mail-provider-spend", "nightly-sync-ran", "weekly-digest-sent"]
$ curl -s https://app.example.test/health | jq '.signals["nightly-sync-ran"]'
{ "state": "held", "last_success": "2026-09-18T03:04Z", "last_count": 812, "since": "2026-09-01" }
```

Every signal the application declares appeared in the report, each with its
last success, last count and the date it has held since.
