// The admin routes, every one behind the admin limiter.
import { Router } from 'express';
import { adminThrottle } from './limits.mjs';
import { db } from './db.mjs';

export const adminRouter = Router();
adminRouter.use(adminThrottle);

adminRouter.post('/admin/purge', async (req, res) => {
  await db.query('DELETE FROM notes WHERE deleted_at < now() - interval \'30 days\'');
  res.status(204).end();
});
