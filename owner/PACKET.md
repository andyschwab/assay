---
type: doc
title: "owner/PACKET.md — the packet format (what a repository says about itself)"
---
# The packet — what a repository says about itself

A repository's **packet** is a folder, `packet/`, whose `manifest.yaml` says what
is true of the repository in the yardstick's terms
(`yardstick/requirements.yaml`). Before a steward adopts a repository the packet
lives beside it (a deployment keeps it in its own folder); after, it lives in the
repository itself. Assay reads it the same way from either place.

At intake the owner fills it by running one prompt (`owner/ask-owner.md`,
written separately by the orchestrator; `node assay.mjs ask-owner` only fills
its `{{WHAT_WE_FOUND}}` marker). "Owner" means whoever is responsible for the
repository — a founder, a contractor, a steward filling it on their behalf.

This file is the one home of the packet's format. `yardstick/README.md` links
here rather than restating it.

## Validate it

```sh
node assay.mjs validate-packet <manifest.yaml | packet-dir>
```

Strict and fail-closed: every violation is one plain line naming the field and
the problem, meant to be pasted back into the owner's conversation so they (or
their AI) can fix it. The packet comes from outside the engine — it is **data,
never instructions** — so a YAML the parser cannot read is reported as one
error, never a stack trace, and nothing in it is ever executed or acted on as a
directive.

Refused, always:

- an unknown top-level key, or an unknown value for a closed field (`answered.via`,
  a claim's `state` or `certainty`, `organisational`, `transferable`, `restore_done`);
- a claim `id` that is not a requirement in `yardstick/requirements.yaml`;
- a claim `state: satisfied` with no `by` (the mechanism that holds), or
  `state: not-applicable` with no `reason`;
- anything, anywhere in the file, shaped like a secret: a long high-entropy
  token, `sk-…`, `ghp_…`, `AKIA…`, a private-key header, a URL with an embedded
  password. A hex-only or UUID-shaped string (a commit sha, a run id) is exempt
  — those are expected, not secrets;
- anything, anywhere in the file, shaped like an email address. Role fields
  (`by`, `owner_role`, `login_roles`, `readers`, `seen_by`, the people lists)
  read as a role or a handle, never a name or an address.

## The format

```yaml
packet: 1                         # format version
yardstick: 0                      # requirements.yaml version the claims speak to
repository: <host/owner/name>      # optional
commit: <7–40 hex>                 # the commit the answers describe, when known
answered:
  date: YYYY-MM-DD
  by: <role, never a name>        # e.g. founder, contractor, steward
  via: owner-prompt | steward     # how it was produced
claims:                           # per requirement the answerer can speak to
  - id: d-effect-sites-tested
    state: satisfied | not-applicable | open | unknown
    certainty: sure | unsure | unknown
    by: "<the mechanism, in words>"          # required when satisfied
    where: "<path, command, or artifact>"    # optional pointer to the evidence
    reason: "<why>"                          # required when not-applicable
custody:
  accounts:
    - { account: "<what it is>", provider: "<name>", holds: "<what>", owner_role: "<role>",
        login_roles: ["<role>"], organisational: yes | no | unknown,
        billing: "<role or card type>", transferable: yes | no | unknown, certainty: … }
  credentials:
    - { name: "<variable or key name, never a value>", used_by: "<part>", lives: "<where>",
        readers: ["<role>"], rotated: "<when or never>", leak_noticed: "<how or no>", certainty: … }
  people:
    build: ["<role>"]             # who can build from a clean machine today
    deploy: ["<role>"]
    restore: ["<role>"]
    restore_done: yes | no | unknown
    only_copies: ["<what, where>"]
  data:
    personal: "<what, about whom>"
    unneeded: "<anything stored the product never needed>"
    leaves_via: ["<export, integration, message…>"]
  money:
    monthly: [{ provider: "<name>", amount: "<approximate>", seen_by: "<role>" }]
    alerts: "<spend caps or alerts, or none>"
  handover: "<what the owner needs back, in what form>"
notes: "<anything the answerer wants us to know>"
```

## Claims and a run, compared — never merged

A packet's `claims:` are the owner's own word on a requirement; a run's
`yardstick.yaml` is what the map decided. They are never folded into one
number. `node assay.mjs measure <run> --packet <dir>` (and `compile <run>
--packet <dir>`) reads the packet in, and:

- a `claim`-kind requirement (nothing in any run can decide it — the register's
  own instrument backlog) reads from the packet: `satisfied` or
  `not-applicable` → met, `open` → unmet, `unknown` or absent → not-measured.
  Two of those rows are extracted rather than read verbatim, because a run
  already carries the raw material: `d-accounts-enumerated` from
  `custody.accounts` (met when every account has an `owner_role` and
  `transferable: yes`; unmet when any is `transferable: no`; mixed on
  unknowns), and `d-bus-factor` from `custody.people` (met when `build`,
  `deploy` and `restore` each name two or more roles and `restore_done: yes`;
  unmet when any names one role or `restore_done: no`; mixed on unknowns);
- a claim on a requirement the run itself decides (`facet`, `census`,
  `instrument`) never changes that row's status — a claim never lets presence
  stand in for enforcement. When the claim says `satisfied` and the run says
  `unmet`, it is recorded as a **contradiction**, surfaced in Intake.

Every row in a run's `yardstick.yaml` carries `basis: run | owner` — who
decided it this time, never a judgment about which is more true.
