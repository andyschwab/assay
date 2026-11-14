// ── rate_limit read on Hono-style routes, where the route's own module states it (#315 slice 3;
// map/effect-signals.mjs, map/effect-signals.yaml routes) ──
// Over tests/enumerate-fixture/signals-hono:
//  1. `app.use('/api/*', <listed limiter>)` covers a route under /api (a trailing `/*` is the mount's
//     prefix), and not a route outside it; an `app.use(` whose limiter call sits on the lines below
//     it covers every route after it;
//  2. a route's own middleware argument imported from a module whose file name says it limits
//     (`../middleware/rate-limit`) is rate_limit yes, at the import and the route;
//  3. a handler that calls a limiter the tree defines under a limiting name is rate_limit yes, at
//     the import and the call; so is a route whose own options configure a listed limiter plugin
//     (`config: { rateLimit: { … } }`), at the plugin's import and the option;
//  4. a route with none of these, or whose options turn the limiter off, carries no signal, never a no;
//  5. the readings come from the data file: with `limit` and `throttle` gone from
//     limiter_path_words and `throttle` from limiter_words, (2) and (3) carry nothing.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'signals-hono-limiter';

const FIXTURE = join(HERE, 'enumerate-fixture', 'signals-hono');
function listed(root) {
  const r = spawnSync(process.execPath, [join(root, 'map', 'enumerate.mjs'), FIXTURE, '--json'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout).populations.routeHandlers;
}

export async function run() {
  const fail = (m) => negFailures.push('signals-hono-limiter: ' + m);
  const routes = listed(ROOT);
  if (!routes) { fail('enumerate over the Hono fixture failed'); return; }
  const of = (m) => routes.find((c) => c.member === m);
  const rl = (m) => ((of(m) || {}).signals || []).find((s) => s.question === 'rate_limit');
  const show = (m) => JSON.stringify((of(m) || {}).signals);

  const api = rl('route: POST /api/messages');
  if (!api || api.supports !== 'yes' || api.evidence.join() !== 'src/app.ts:3,src/app.ts:6' || api.marker !== 'limiter: rateLimiter') fail(`(1) app.use('/api/*', limiter) covers a route under /api (got ${show('route: POST /api/messages')})`);
  const multi = rl('route: POST /admin/reindex');
  if (!multi || multi.evidence.join() !== 'src/admin.ts:3,src/admin.ts:7') fail(`(1) an app.use( whose limiter call is written across lines covers every route after it (got ${show('route: POST /admin/reindex')})`);
  if (!of('route: POST /health/ping') || of('route: POST /health/ping').signals.length) fail(`(1) a route outside the mount path carries no signal (got ${show('route: POST /health/ping')})`);
  const own = rl('route: POST /notes');
  if (!own || own.evidence.join() !== 'src/routes/notes.ts:3,src/routes/notes.ts:8' || own.marker !== 'limiter: limitWrites') fail(`(2) a route's own middleware from a limiting module is rate_limit yes (got ${show('route: POST /notes')})`);
  const call = rl('route: POST /notes/:id/share');
  if (!call || call.evidence.join() !== 'src/routes/notes.ts:4,src/routes/notes.ts:14' || call.marker !== 'limiter: checkThrottle') fail(`(3) a handler that calls a tree-defined limiter is rate_limit yes (got ${show('route: POST /notes/:id/share')})`);
  const opt = rl('route: POST /accounts/login');
  if (!opt || opt.evidence.join() !== 'src/accounts.ts:3,src/accounts.ts:10' || opt.marker !== 'limiter: route option rateLimit') fail(`(3) a route whose own options configure the listed limiter plugin is rate_limit yes, at the plugin's import and the option (got ${show('route: POST /accounts/login')})`);
  if (!of('route: POST /accounts/logout') || of('route: POST /accounts/logout').signals.length) fail(`(4) a route whose options turn the limiter off carries no signal (got ${show('route: POST /accounts/logout')})`);
  if (!of('route: POST /notes/:id/pin') || of('route: POST /notes/:id/pin').signals.length) fail(`(4) a route with no limiter carries no signal, never a no (got ${show('route: POST /notes/:id/pin')})`);
  if (routes.some((c) => c.signals.some((s) => s.supports === 'no'))) fail('(4) no route carries a no');

  // (5) the words are data
  const tmp = mkdtempSync(join(tmpdir(), 'assay-signals-hono-'));
  try {
    const root = join(tmp, 'engine');
    for (const d of ['map', 'lib', 'yardstick']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
    const yp = join(root, 'map', 'effect-signals.yaml');
    const y = readFileSync(yp, 'utf8').replace('limiter_path_words: [limit, throttle]', 'limiter_path_words: [no-such-word]').replace('limiter_words: [ratelimit, rate_limit, limiter, throttle]', 'limiter_words: [ratelimit, rate_limit, limiter]');
    writeFileSync(yp, y);
    const r2 = listed(root);
    if (!r2) fail('(5) enumerate with the words removed failed');
    else {
      const sig = (m) => (r2.find((c) => c.member === m) || { signals: [] }).signals.length;
      if (sig('route: POST /notes') || sig('route: POST /notes/:id/share') || !sig('route: POST /api/messages')) fail(`(5) with the words gone from the data file, the tree-defined readings carry nothing and the listed module still reads (${JSON.stringify(r2.map((c) => [c.member, c.signals.length]))})`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
