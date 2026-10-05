# structure-target

A planted known-answer target for the structure-scan instrument
(`tests/blocks/structure-scan.mjs`): `src/billing.js` and `src/invoice.js` carry
one duplicated block, `src/format.js` exports `formatLegacy`, which nothing
imports, and `src/invoice.js.bak` is a stale copy.
