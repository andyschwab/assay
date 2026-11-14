// A relay: one route reports its status, one sends.
import express from 'express';
const app = express();
app.get('/relay/status', (req, res) => res.json({ ok: true }));
app.post('/relay/send', async (req, res) => res.json(await fetch('https://relay.example.invalid/send', { method: 'POST' })));
export default app;
