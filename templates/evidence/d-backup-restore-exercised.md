---
descriptor: d-backup-restore-exercised
date: 2026-09-10
by: platform-eng
commit: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
result: pass
backup: nightly-2026-09-10T02:00Z
target: scratch-restore-01
verified: row count matches (users 41,208; orders 118,442)
---

Restored the nightly snapshot into a scratch instance to confirm it is usable,
not just present.

```
$ ./ops/restore.sh --snapshot nightly-2026-09-10T02:00Z --target scratch-restore-01
provisioning scratch-restore-01 ... done
restoring nightly-2026-09-10T02:00Z ... done (14m02s)
$ psql scratch-restore-01 -c "select count(*) from users;"
 count
-------
 41208
$ psql scratch-restore-01 -c "select count(*) from orders;"
 count
--------
 118442
```

Row counts match the source database captured at snapshot time. Scratch instance
torn down after verification; no data retained.
