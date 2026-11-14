// The v2 notes routes, through the model client.
import { Hono } from 'hono';
import { prisma } from '../db/client';

const app = new Hono();

app.delete('/v2/notes/:id', async (c) => {
  await prisma.note.update({
    where: { id: Number(c.req.param('id')) },
    data: { deletedAt: new Date() },
  });
  return c.body(null, 204);
});

export default app;
