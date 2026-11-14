// The notes surface's limiter: a counting window per caller.
import type { MiddlewareHandler } from 'hono';
const hits = new Map<string, number>();
export const limitWrites: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-forwarded-for') ?? '';
  const n = (hits.get(key) ?? 0) + 1;
  hits.set(key, n);
  if (n > 20) return c.text('slow down', 429);
  await next();
};
