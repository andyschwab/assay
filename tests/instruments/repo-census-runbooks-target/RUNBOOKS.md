# RUNBOOKS

Operational procedures for repo-census-runbooks-target. The file is named
RUNBOOKS.md (plural), which repo-census must find (issue #28). It covers all
four procedures; the block derives a variant without the fourth section.

## Deploy

Deploy by tagging a release; CI builds and ships the image.

### Roll back

To roll back a bad release, redeploy the previous image tag and confirm the
health check goes green.

## Backups and restore

Nightly backups land in the storage bucket. To restore from a backup, pick the
snapshot and load it into a fresh database.

## Secrets

To rotate a secret, generate a new credential in the vault, update the
deployment's environment, and redeploy; then revoke the old key.

## Restart

To restart the service, redeploy the current image; it comes back up clean.

## Logs and health

Logs stream to the platform console; the health endpoint is /healthz.
