# structure-lone-app

A known-answer fixture for where structure-scan points knip (#119): an application kept
whole in `app/` (its `package.json` and `package-lock.json` there, none at the root), the
shape apps built from a common starter kit take. `app/src/util.js` exports
`unusedHelper` at line 3, which nothing imports. knip runs in `app/`, after its
dependencies install into a scratch copy of `app/` (#118), and the unused export reads at
`app/src/util.js:3`.
