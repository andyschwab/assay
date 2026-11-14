// The notes routes.
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { notes, feedback } from '../db/schema';

const app = new Hono();

app.delete('/notes/:id', async (c) => {
  await db.update(notes)
    .set({ deletedAt: new Date() })
    .where(eq(notes.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

app.delete('/feedback/:id', async (c) => {
  await db.update(feedback).set({ deletedAt: new Date() }).where(eq(feedback.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

app.post('/notes/:id/purge', async (c) => {
  await db.delete(notes).where(eq(notes.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

app.delete('/notes/:id/everything', async (c) => {
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, Number(c.req.param('id'))));
  await db.delete(feedback).where(eq(feedback.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

export default app;
