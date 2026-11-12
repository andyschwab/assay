Fixture target for `map/enumerate.mjs` (tests/blocks/enumerate-server-routes.mjs). Not run —
read only as a scan target. It plants the HTTP surface of servers that are not Next.js (#272):
a `node:http` server that dispatches on the request's method and path (`nodehttp/`), an
Express app and router (`express/`), and a server whose dispatch enumerate cannot read
(`opaque/`), which is listed by its file. Nothing listens.
