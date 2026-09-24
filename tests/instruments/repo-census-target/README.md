# repo-census-target

A public known-answer fixture for `map/repo-census.mjs` (the repo-census
instrument). A tiny monorepo with one workspace app, `apps/one`, which carries
no docs at all — the fixture's monorepo gap: the architecture-page and
agent-contract checks must gap for `apps/one` while passing at the root.

## Architecture

This service is a thin API in front of a Postgres database. Requests come in
over HTTP, are validated, and are read from or written to the database; no
other external service is called.

## Usage

```sh
npm test
```
