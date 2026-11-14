// The admin app: one limiter for every route, its call written across lines.
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';

const app = new Hono();

app.use(
  rateLimiter({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (c) => c.req.header('x-forwarded-for') ?? '',
  }),
);

app.post('/admin/reindex', async (c) => {
  await fetch('https://search.example.invalid/reindex', { method: 'POST' });
  return c.json({ ok: true });
});

export default app;
