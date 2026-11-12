const express = require('express');
const notes = require('./routes/notes');

const app = express();
app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/login', (req, res) => res.json({}));
app.use('/notes', notes);
// a setting, not a route: no path
app.set('trust proxy', 1);
app.get('env');
module.exports = app;
