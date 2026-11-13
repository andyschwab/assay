// A dependency-free Postgres client for this fixture: the simple-query protocol over trust
// auth, enough to run a migration and a query. Not a general client.
import net from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function query(url, sql) {
  const u = new URL(url);
  const user = decodeURIComponent(u.username || 'postgres');
  const database = u.pathname.slice(1) || user;
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(u.port || 5432), u.hostname);
    const params = Buffer.from(`user\0${user}\0database\0${database}\0\0`);
    const head = Buffer.alloc(8); head.writeInt32BE(8 + params.length, 0); head.writeInt32BE(196608, 4);
    sock.write(Buffer.concat([head, params]));
    let buf = Buffer.alloc(0), sent = false, error = null;
    const rows = [];
    sock.on('error', reject);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 5) {
        const type = String.fromCharCode(buf[0]);
        const len = buf.readInt32BE(1);
        if (buf.length < 1 + len) break;
        const body = buf.subarray(5, 1 + len);
        buf = buf.subarray(1 + len);
        if (type === 'R' && body.readInt32BE(0) !== 0) { sock.destroy(); return reject(new Error('the fixture client speaks trust auth only')); }
        if (type === 'E') error = new Error(body.toString().split('\0').filter((f) => f.startsWith('M')).map((f) => f.slice(1))[0] || 'server error');
        if (type === 'D') {
          const row = []; let o = 2;
          for (let i = 0; i < body.readInt16BE(0); i++) { const n = body.readInt32BE(o); o += 4; row.push(n < 0 ? null : body.subarray(o, o + n).toString()); if (n > 0) o += n; }
          rows.push(row);
        }
        if (type === 'Z') {
          if (!sent) {
            sent = true;
            const q = Buffer.from(sql + '\0');
            const h = Buffer.alloc(5); h.write('Q'); h.writeInt32BE(4 + q.length, 1);
            sock.write(Buffer.concat([h, q]));
          } else {
            const x = Buffer.alloc(5); x.write('X'); x.writeInt32BE(4, 1);
            sock.end(x);
            return error ? reject(error) : resolve(rows);
          }
        }
      }
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
  const cmd = process.argv[2];
  if (cmd === 'roles') await query(url, 'create role app_migrator');
  else if (cmd === 'migrate') {
    const dir = new URL('./migrations/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) { await query(url, readFileSync(new URL(f, dir), 'utf8')); console.log(`applied ${f}`); }
  } else { console.error(`unknown command ${cmd}`); process.exit(2); }
}
