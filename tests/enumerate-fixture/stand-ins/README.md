# stand-ins — the model call sites a stand-in makes (#293)

A known-answer target for `enumerate`'s `modelCalls`: a model call site is any place the
application obtains model output, so a local stand-in for a provider call is one.
`tests/blocks/model-call-stand-in.mjs` pins what is listed.

- `lib/agent.mjs` — listed: `callModel`, a stub named for a model call.
- `lib/complete.mjs` — listed: the comment directly above `complete` says it stands in for a model call.
- `app/model.py` — listed: `call_llm`, a wrapper named for one.
- `lib/caller.mjs` — not listed: it calls the stand-in, it does not define one.
- `lib/orm.mjs` — not listed: a function for a database model, under a comment that names no model call.
- `tests/agent.test.mjs` — not listed: a test file.
