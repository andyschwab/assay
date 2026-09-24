---
descriptor: d-cost-alerts
date: 2026-09-20
by: finance-eng
commit: f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5
result: pass
accounts:
  - "anthropic: $500/month -> platform on-call"
  - "gcp-prod: $2,000/month -> platform on-call"
  - "gcp-staging: $200/month -> platform eng lead"
---

Confirmed a budget alert exists on every metered account, each with a named
recipient, by reading the billing console's alert configuration.

```
$ ./ops/billing-alerts.sh list
account       threshold     recipient
anthropic     $500/month    platform on-call
gcp-prod      $2,000/month  platform on-call
gcp-staging   $200/month    platform eng lead
```

Three metered accounts in use this quarter; all three carry a configured
threshold and a named recipient, matching the frontmatter above.
