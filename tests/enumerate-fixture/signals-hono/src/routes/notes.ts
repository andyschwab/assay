// The notes routes.
import { Hono } from 'hono';
import { limitWrites } from '../middleware/rate-limit';
import { checkThrottle } from '../middleware/guards';

const app = new Hono();

app.post('/notes', limitWrites, async (c) => {
  await fetch('https://store.example.invalid/notes', { method: 'POST', body: await c.req.text() });
  return c.json({ ok: true }, 201);
});

app.post('/notes/:id/share', async (c) => {
  await checkThrottle(c);
  await fetch('https://mail.example.invalid/share', { method: 'POST' });
  return c.json({ ok: true });
});

app.post('/notes/:id/pin', async (c) => {
  await fetch(`https://store.example.invalid/notes/${c.req.param('id')}/pin`, { method: 'POST' });
  return c.json({ ok: true });
});

export default app;
