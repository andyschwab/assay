// The API app: every /api route behind the shared limiter.
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';

const app = new Hono();
app.use('/api/*', rateLimiter({ windowMs: 60_000, limit: 100, keyGenerator: (c) => c.req.header('x-forwarded-for') ?? '' }));

app.post('/api/messages', async (c) => {
  await fetch('https://relay.example.invalid/messages', { method: 'POST', body: await c.req.text() });
  return c.json({ ok: true });
});

app.post('/health/ping', async (c) => c.json({ ok: true }));

export default app;
