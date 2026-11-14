// The member routes: a removal keeps the row, and an admin can restore it.
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { members } from '../db/schema';

const app = new Hono();

app.delete('/members/:id', async (c) => {
  await db.update(members).set({ removedAt: new Date() }).where(eq(members.id, Number(c.req.param('id'))));
  return c.body(null, 204);
});

app.delete('/teams/:team/members/:id', async (c) => {
  await db.execute(`UPDATE team_members SET removed_at = now() WHERE team_id = $1 AND member_id = $2`);
  return c.body(null, 204);
});

export default app;
