# fresh-clone-lone-app

A known-answer fixture for where fresh-clone runs (#35): an application kept whole in
`app/` (its `package.json` there, none at the root), the shape apps built from a common
starter kit take. The commands below are written as a reader replays them after
`cd app`: build and test exist in `app/package.json`, deploy does not.

```sh
npm run build
npm test
npm run deploy
```
