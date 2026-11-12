Fixture target for `map/enumerate.mjs` (tests/blocks/enumerate-credentials.mjs). Not run —
read only as a scan target. It plants credentials named in any case (#292): a camelCase key in a
settings object, a token table, a lowerCamel and a snake_case credential assigned a literal, and an
object holding a value of secret shape (a URL with an embedded password). Beside them are the
precision cases: credential-suffixed names holding lists of identifier strings (secret-named
constants, not credentials), and names that are no credential (a word that only ends in "key",
a bare plural, an empty password, a name read from the environment, a name in a comment or a
string). Every value is inert: the hosts are reserved (`.invalid`) and no value grants anything.
