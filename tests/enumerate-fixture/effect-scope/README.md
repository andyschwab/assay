# effect-scope — a planted target for the closed scope rule (#315)

Four shapes lanes parted on, each planted once:

- `src/clients/billing.mjs` — an HTTP write in a client module (a candidate; its clause is the lane's);
- `src/clients/billing.contract-test.mjs` — the same write in a contract test (out by construction:
  listed under `excluded`, never offered);
- `.github/workflows/deploy.yml` — a package publish in a workflow (in by construction);
- `server.mjs` — a read-only `GET` route and a `POST` route.

Every address is a placeholder; nothing here runs.
