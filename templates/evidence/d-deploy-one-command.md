---
descriptor: d-deploy-one-command
date: 2026-09-14
by: platform-eng
commit: c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2
result: pass
command: npm run deploy:prod
deployed_sha: c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2
---

Ran the one documented deploy command from a clean checkout at the commit above
and confirmed the deployed app reports that same commit.

```
$ npm run deploy:prod
> build
> upload dist/ to prod bucket
> promote prod-2026-09-14t1 -> prod
deploy complete: prod is now serving prod-2026-09-14t1
$ curl -s https://app.example.test/version
{"commit":"c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"}
```

The `/version` endpoint's reported commit matches the commit this transcript is
filed under — what ran is what was committed.
