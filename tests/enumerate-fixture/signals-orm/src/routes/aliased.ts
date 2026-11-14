// An admin route, the table imported through the tree's path alias.
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes } from '@/db/schema';

const app = new Hono();

app.delete('/admin/notes/:id', async (c) => {
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

export default app;
