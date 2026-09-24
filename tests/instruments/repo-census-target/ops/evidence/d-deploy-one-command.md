---
descriptor: d-deploy-one-command
date: 2026-09-14
by: platform-eng
commit: c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2
result: pass
command: npm run deploy:prod
deployed_sha: 000aaa1111bbb2222ccc3333ddd4444eee5555f
---

Deploy ran but the reported sha does not match.

```
$ curl -s https://app.example.test/version
{"commit":"000aaa1111bbb2222ccc3333ddd4444eee5555f"}
```

Investigating drift.
