---
produced_by: person
descriptor: d-backup-restore-exercised
date: 2026-09-20
by: platform-eng
commit: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
result: pass
backup: nightly-2026-09-20T02:00Z
target: scratch-restore-02
verified: row count matches
---

Restored the nightly snapshot into a scratch instance, at the packet's
`evidence` pointer location, to confirm repo-census reads exactly it.

```
$ ./ops/restore.sh --snapshot nightly-2026-09-20T02:00Z --target scratch-restore-02
provisioning scratch-restore-02 ... done
restoring nightly-2026-09-20T02:00Z ... done
$ psql scratch-restore-02 -c "select count(*) from users;"
 count
-------
  4102
```

Row counts match. Scratch instance torn down after verification.
