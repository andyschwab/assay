# signals-hono — the enumerate fixture for #315 slice 3's Hono readings

Routes on Hono-style apps, each limited (or not) in a way the route's own module states:

- `src/app.ts`: `app.use('/api/*', rateLimiter(...))` from a listed module covers every route
  under `/api`; `/health/ping` sits outside it.
- `src/admin.ts`: `app.use(` with the listed limiter's call on the lines below it, no path: every
  route on the app after it.
- `src/accounts.ts`: a route whose own options configure the listed rate-limit plugin
  (`config: { rateLimit: { … } }`), and one whose options turn it off (`rateLimit: false`).
- `src/routes/notes.ts`: a route that names `limitWrites` as its own middleware, imported from
  `../middleware/rate-limit` (a module whose file name says it limits); a route that calls
  `checkThrottle(c)` in its handler (a limiter the tree defines under a limiting name); a route
  with neither.

Nothing here runs; enumerate reads it.
