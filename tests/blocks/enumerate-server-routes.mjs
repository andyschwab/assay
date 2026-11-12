// ── route handlers beyond Next.js: node:http and Express-style dispatch (#272) ──
// routeHandlers once read only Next.js app/pages routes, so a node:http server (a known-answer
// web app dispatches its five routes on req.method and url.pathname) listed none of its routes
// and the effect triage never named them. It now reads:
//  1. a node:http dispatch: one member per route, `route: POST /admin/purge`, the method and
//     path compared on one line in a file that calls createServer, in either order; a path with
//     no method compared reads ANY;
//  2. an Express app and router: `app.<method>(path, …)` and `router.<method>(path, …)`, one
//     member per call, `all` reading ANY; a call with no path (a setting) is no route;
//  3. a createServer file whose dispatch it cannot read is listed anyway (`route: ? <file>`).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-server-routes';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-server-routes: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'servers');
  const doc = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--json'], { encoding: 'utf8' }));
  const routes = new Map(doc.populations.routeHandlers.map((m) => [m.member, m]));
  const want = {
    'route: GET /notes': ['nodehttp/server.mjs:7'],
    'route: POST /notes': ['nodehttp/server.mjs:8'],
    'route: DELETE /admin/purge': ['nodehttp/server.mjs:9'],
    'route: ANY /health': ['nodehttp/server.mjs:10'],
    'route: GET /health': ['express/app.js:5'],
    'route: POST /login': ['express/app.js:6'],
    'route: GET /:id': ['express/routes/notes.js:3'],
    'route: DELETE /:id': ['express/routes/notes.js:4'],
    'route: ANY /export': ['express/routes/notes.js:5'],
    'route: ? opaque/server.mjs': ['opaque/server.mjs:4'],
  };
  for (const [member, evidence] of Object.entries(want)) {
    const m = routes.get(member);
    if (!m) { fail(`enumerate must list the route "${member}" (got ${[...routes.keys()].join(', ') || 'none'})`); continue; }
    if (JSON.stringify(m.evidence) !== JSON.stringify(evidence)) fail(`"${member}" must cite ${evidence.join(', ')} (got ${m.evidence.join(', ')})`);
    if (!m.gateable) fail(`"${member}" is live surface the coverage gate counts`);
  }
  const extra = [...routes.keys()].filter((k) => !(k in want));
  if (extra.length) fail(`enumerate listed routes the fixture does not serve: ${extra.join(', ')}`);
}
