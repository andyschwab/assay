// The account routes, on a server whose rate-limit plugin reads each route's own options.
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

const app = Fastify();
await app.register(rateLimit, { global: false });

app.post('/accounts/login', {
  config: {
    rateLimit: { max: 5, timeWindow: '15 minutes' },
  },
}, async (request, reply) => {
  await fetch('https://idp.example.invalid/login', { method: 'POST' });
  return reply.send({ ok: true });
});

app.post('/accounts/logout', { config: { rateLimit: false } }, async (request, reply) => {
  await fetch('https://idp.example.invalid/logout', { method: 'POST' });
  return reply.send({ ok: true });
});
