// The notes API.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { db } from './db.mjs';

const app = express();
const writeCap = rateLimit({ windowMs: 60_000, limit: 20 });

app.post('/notes', writeCap, async (req, res) => {
  await db.query('INSERT INTO notes (body) VALUES ($1)', [req.body.text]);
  res.status(201).end();
});

app.post('/feedback', async (req, res) => {
  await db.query('INSERT INTO feedback (body) VALUES ($1)', [req.body.text]);
  res.status(201).end();
});

app.delete('/notes/:id', async (req, res) => {
  await db.query('UPDATE notes SET deleted_at = now() WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.delete('/feedback/:id', async (req, res) => {
  await db.query('DELETE FROM feedback WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default app;
