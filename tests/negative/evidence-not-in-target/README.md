Negative fixture: validate with `--target target/`. Every finding cites a file that exists in
`target/` except `lib/sync.mjs` (cited by F-053 and F-031), which the target does not have —
validate must refuse citations the target cannot resolve. `target/` holds inert stubs only.
