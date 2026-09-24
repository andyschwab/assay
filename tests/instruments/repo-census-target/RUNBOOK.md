# RUNBOOK

Operational procedures for repo-census-target. The fixture's one planted gap:
there is no restore procedure below.

## Restart

To restart the service, redeploy the current image; it comes back up clean
within thirty seconds.

## Roll back

To roll back a bad release, redeploy the previous image tag and confirm the
health check goes green.

## Rotate a credential

To rotate the database credential, generate a new secret in the vault, update
the deployment's environment, and redeploy; the old secret can then be revoked.
