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
  read as a role or a handle, never a name or an address;
- `answered.by` written as a person's name rather than a role: two or more
  Title Case words with no recognizable role word among them ("Dana Reyes"),
  or a name followed by a parenthetical role ("Dana Reyes (founder)") — a role
  PHRASE ("Lead Engineer") is fine, since one of its own words is a role word.
  One plain line: "answered.by: write a role (for example founder), not a
  name."

## A reply still wrapped for chat

`validate-packet` (and every reader that calls `loadPacket`) accepts a reply
still wrapped the way an owner's own AI hands it back: prose before and after,
the actual YAML fenced in a ` ``` ` or ` ```yaml ` code block. The first fenced
block's content is what gets parsed — everything outside it, the surrounding
chatter, is discarded before validation ever runs. With no fence at all, the
text is read as-is, exactly as before. This is still defensive parsing of
untrusted data: nothing inside or outside the fence is ever executed or
treated as an instruction.

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
        login_roles: ["<role>"], organisational: yes | no | unsure | unknown,
        billing: "<role or card type>", transferable: yes | no | unsure | unknown, certainty: … }
  credentials:
    - { name: "<variable or key name, never a value>", used_by: "<part>", lives: "<where>",
        readers: ["<role>"], rotated: "<when or never>", leak_noticed: "<how or no>", certainty: … }
  people:
    build: ["<role>"]             # who can build from a clean machine today
    deploy: ["<role>"]
    restore: ["<role>"]
    restore_done: yes | no | unsure | unknown
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

## Pointers

An optional top-level `pointers:` map says where *this* repository keeps what
the yardstick asks about, so a scanner reads it the way it says it is laid out
instead of guessing. The first reader is `repo-census` (`map/repo-census.mjs`):
when a pointer names a path, that check reads exactly that path and never
falls back to discovery. Every pointer is optional and the whole section is
optional; paths are always relative to the repo root, never absolute, never
`..`, never a URL.

```yaml
pointers:                              # where this repository keeps what the yardstick asks about; paths relative to the repo root
  default_branch: main
  apps: [apps/web, services/worker]    # the deployable units, when not just the root
  architecture: docs/architecture.md   # one path or a list (root and per-app pages)
  agent_contract: CLAUDE.md            # one path or a list
  runbook: ops/RUNBOOK.md
  evidence: ops/evidence               # the directory holding the owner-evidence transcripts (owner/evidence/README.md)
  workflows: .github/workflows         # where CI is defined
  install: "npm ci"                    # the commands, as words; assay never executes packet text during validation
  build: "npm run build"
  test: "npm test"
  canon: packet/canon.yaml             # the declared enumeration contract (map/canon/README.md), when the repository carries one
```

`validate-packet` refuses, one plain line each: an unknown key under
`pointers`; a path that is absolute, contains `..`, or contains a URL scheme;
a non-string where a string is expected; `apps`/`architecture`/`agent_contract`
that is neither a string nor a list of strings; a `default_branch` that is not
a plausible git ref name. `install`/`build`/`test` are free-text commands, in
words, never executed and never path-checked — assay never executes packet
text.

## Claims and a run, compared — never merged

A packet's `claims:` are the owner's own word on a requirement; a run's
`yardstick.yaml` is what the map decided. They are never folded into one
number. `node assay.mjs measure <run> --packet <dir>` (and `compile <run>
--packet <dir>`) reads the packet in, and:

- a `claim`-kind requirement (nothing in any run can decide it — the register's
  own instrument backlog) reads from the packet: `satisfied` → met,
  `not-applicable` → not-applicable (never met — a requirement that does not
  apply was not satisfied), `open` → unmet, `unknown` or absent → not-measured.
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
