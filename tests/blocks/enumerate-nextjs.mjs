// ── enumerate over a Next.js target (#33): the app-router route handlers and the
// pages-router API routes are the HTTP surface, so each is a live-surface member the
// coverage gate counts; and the secret candidates carry a shape filter, so a `*_KEY` /
// `*_TOKENS` name assigned an identifier or a number is listed apart from the
// credential names, never silently dropped and never mixed into them.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-nextjs';

const ENUMERATE = join(ROOT, 'map', 'enumerate.mjs');

// the printed enumeration, split into its sections by their `── ` headers
function sections(out) {
  const s = {};
  let cur = null;
  for (const l of out.split('\n')) {
    const h = l.match(/^── (\S+)/);
    if (h) { cur = h[1]; s[cur] = []; } else if (cur) s[cur].push(l);
  }
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.join('\n')]));
}

export async function run() {
  const fail = (m) => negFailures.push('enumerate-nextjs: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'nextjs');
  const out = execFileSync(process.execPath, [ENUMERATE, fx], { encoding: 'utf8' });
  const sec = sections(out);

  // route handlers: one member per exported method, the URL without route groups
  const routes = sec['ROUTE'] || '';
  if (!routes) fail('enumerate printed no ROUTE HANDLERS section');
  for (const need of ['GET /api/users/[id]', 'PATCH /api/users/[id]', 'DELETE /api/users/[id]', 'GET /health', 'HEAD /health', 'ANY /api/hooks']) {
    if (!routes.includes(`route: ${need} `) && !routes.includes(`route: ${need}\n`)) fail(`enumerate did not list the route handler "${need}"`);
  }
  if (/POST \/api\/users/.test(routes)) fail('enumerate listed a method the route file does not export');
  if (/dashboard/.test(routes)) fail('a page (app/dashboard/page.tsx) is not a route handler');
  if (/marketing/.test(routes.split('\n').filter((l) => /• /.test(l)).join('\n'))) fail('a route group segment "(marketing)" is not part of the URL');

  // secrets: credential names stay; identifier- and number-valued names move apart
  const creds = sec['SECRETS'] || '';
  for (const need of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ADMIN_PASSWORD', 'LEGACY_API_KEY', 'SEARCH_API_KEY']) {
    if (!creds.includes(`• ${need} `) && !creds.includes(`• ${need}\n`)) fail(`the credential name ${need} must stay a secret candidate`);
  }
  const consts = sec['SECRET-NAMED'] || '';
  if (!consts) fail('enumerate printed no SECRET-NAMED CONSTANTS section (a filtered name must stay visible)');
  for (const name of ['PRO_PRICE_KEY', 'MAX_OUTPUT_TOKENS', 'CACHE_KEY', 'THEME_KEY']) {
    if (new RegExp(`• ${name}\\b`).test(creds)) fail(`${name} holds an identifier or a constant, not a credential; the shape filter must keep it out of the secret candidates`);
    if (!new RegExp(`• ${name}\\b`).test(consts)) fail(`${name} must be listed as a secret-named constant, not dropped`);
  }

  // the coverage gate counts every route file as live surface
  const gaps = (runDir) => {
    const r = spawnSync(process.execPath, [ENUMERATE, runDir.target, '--run', runDir.run, '--json'], { encoding: 'utf8' });
    try { return JSON.parse(r.stdout).coverageGaps; } catch { fail(`--json gate output unparseable (exit ${r.status}): ${String(r.stderr).slice(0, 120)}`); return []; }
  };
  const g = gaps({ target: fx, run: join(fx, 'runs', 'r-2026-01-01') });
  const gapFiles = new Set(g.filter((x) => x.population === 'routeHandlers').map((x) => x.file));
  for (const f of ['src/app/api/users/[id]/route.ts', 'app/(marketing)/health/route.js', 'pages/api/hooks/index.ts']) {
    if (!gapFiles.has(f)) fail(`an uncited route handler file must be a coverage gap: ${f}`);
  }

  // a census or a view that cites a route file by its bracketed/grouped path covers it
  const tmp = join(HERE, 'tmp-enumerate-nextjs'); rmSync(tmp, { recursive: true, force: true });
  cpSync(fx, tmp, { recursive: true });
  const tRun = join(tmp, 'runs', 'r-2026-01-01');
  writeFileSync(join(tRun, 'map', 'censuses.yaml'), 'routes:\n  - evidence: "src/app/api/users/[id]/route.ts:2"\n  - evidence: "app/(marketing)/health/route.js:5"\n  - evidence: "pages/api/hooks/index.ts:4"\n');
  const covered = gaps({ target: tmp, run: tRun }).filter((x) => x.population === 'routeHandlers');
  if (covered.length) fail(`a census citing each route file must cover it (still gaps: ${covered.map((x) => x.file).join(', ')})`);
  rmSync(tmp, { recursive: true, force: true });
}
