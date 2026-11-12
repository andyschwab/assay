import http from 'node:http';

const send = (res, code, obj) => { res.writeHead(code); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/notes') return send(res, 200, []);
  if (req.method === 'POST' && url.pathname === '/notes') return send(res, 201, {});
  if ('DELETE' === req.method && url.pathname === '/admin/purge') return send(res, 200, {});
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  return send(res, 404, {});
});

export { server };
