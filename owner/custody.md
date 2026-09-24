---
type: doc
title: "The custody questions — what only a repository's owner can answer"
---
# The custody questions

Three floor requirements cannot be decided from a repository: every account the
application depends on has an owner and a transfer path (`d-accounts-enumerated`),
more than one person can build, deploy and recover it (`d-bus-factor`), and the
transfer half of every credential's boundary (`d-credentials-enumerated`). A run
reports them as **to run, decided by the owner** in the Intake view. The owner
answers the questions below; the answers are the owner's claims for those rows.

Pre-fill what the map already shows (the accounts and credentials the code
reaches, the stores that hold personal data, where data leaves), so the owner
confirms and corrects instead of starting blank. Roles go in the answers, never
people's names. A credential's value never appears here: where it lives is the
answer.

`node assay.mjs ask-owner --run <run>` prints the owner prompt with that
pre-fill already done from the sources a run can read reliably (`owner/PACKET.md`
Phase 3); the owner's answers land in a **packet** (`/owner/PACKET.md`), which
`node assay.mjs measure <run> --packet <dir>` folds into the measurement.

## Accounts

One row per account the application depends on. The obvious one is often the one
on a personal card.

| Account | Provider | What it holds | Owner (role) | Who can log in (roles) | Personal or organisational? | Billing on | Can it be transferred? |
|---|---|---|---|---|---|---|---|
| Source repository | | | | | | | |
| CI and build | | | | | | | |
| Hosting | | | | | | | |
| Domain and DNS | | | | | | | |
| Database | | | | | | | |
| Object storage | | | | | | | |
| Email or SMS sending | | | | | | | |
| Payments | | | | | | | |
| Model APIs (one row per vendor) | | | | | | | |
| Other third-party APIs | | | | | | | |
| Analytics | | | | | | | |
| Error tracking and logs | | | | | | | |

## Credentials

One row per secret the application uses.

| Credential | Used by | Where it lives | Who can read it (roles) | Rotated when? | Would a leak be noticed, and how? |
|---|---|---|---|---|---|

## People and machines

- Who can build the application from a clean machine today?
- Who can deploy it, and from where: a laptop or CI?
- Who can restore it from a backup? Has anyone done it?
- Is there an only copy of anything: a laptop, a personal drive, a browser session?

## Data

- What personal data does the application hold, and about whom?
- Is anything stored that the product never needed?
- Where does data leave the application: exports, integrations, messages?

## Money

- What is the monthly bill per provider, and who sees it?
- Is there a spend cap or alert on any metered account?

## Handover

- If the people running it stepped away in a year, what would the owner need back, and in what form?
