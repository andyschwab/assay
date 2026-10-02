// ── .github/workflows/ci.yml: the engine's own CI holds the template's invariants ──
// The invariants the block above holds the shipped template to (SHA pins, contents:
// read, timeout-minutes on every job) hold on the engine's own workflow too, with the
// same pins the template uses; it runs every Node major package.json's engines floor
// declares up to the current one, and runs the static gates package.json declares.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'ci-workflow';

export async function run() {
  const fail = (m) => negFailures.push('ci-workflow: ' + m);
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const lines = yml.split('\n');
  const pins = (text) => new Map([...text.matchAll(/uses:\s*([^\s@#]+)@([^\s#]+)/g)].map((m) => [m[1], m[2]]));
  const templatePins = pins(readFileSync(join(ROOT, 'routine', 'assay-routine.yml'), 'utf8'));
  const ciPins = pins(yml);
  if (!ciPins.size) fail('ci.yml must use at least one action');
  for (const [action, ref] of ciPins) {
    if (!/^[0-9a-f]{40}$/.test(ref)) fail(`${action}@${ref} is not pinned to a 40-hex commit SHA`);
    else if (templatePins.has(action) && templatePins.get(action) !== ref) fail(`${action} is pinned to ${ref}, the routine template to ${templatePins.get(action)} — one engine, one pin`);
  }

  const permIdx = lines.findIndex((l) => /^permissions:\s*$/.test(l));
  if (permIdx === -1) fail('ci.yml must declare a top-level permissions: block');
  else {
    const block = [];
    for (let i = permIdx + 1; i < lines.length && /^\s{2}\S/.test(lines[i]); i++) block.push(lines[i].trim().split('#')[0].trim());
    const nonEmpty = block.filter(Boolean);
    if (nonEmpty.length !== 1 || nonEmpty[0] !== 'contents: read') fail(`permissions must be exactly "contents: read" (got ${JSON.stringify(nonEmpty)})`);
  }

  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobs = [];
  if (jobsIdx !== -1) for (let i = jobsIdx + 1; i < lines.length; i++) { const m = lines[i].match(/^\s{2}(\S[^:]*):\s*$/); if (m) jobs.push({ name: m[1], line: i }); }
  if (!jobs.length) fail('ci.yml must declare at least one job');
  for (let j = 0; j < jobs.length; j++) {
    const body = lines.slice(jobs[j].line, j + 1 < jobs.length ? jobs[j + 1].line : lines.length);
    if (!body.some((l) => /^\s{4}timeout-minutes:\s*\d+/.test(l))) fail(`job "${jobs[j].name}" has no timeout-minutes`);
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const floor = Number((String(pkg.engines?.node || '').match(/>=\s*(\d+)/) || [])[1]);
  const matrix = (yml.match(/node-version:\s*\[([^\]]*)\]/) || [])[1];
  const versions = matrix ? matrix.split(',').map((v) => Number(v.trim().replace(/['"]/g, ''))) : [];
  if (!floor) fail(`package.json must declare an engines.node ">=N" floor (got ${JSON.stringify(pkg.engines)})`);
  else if (!versions.includes(floor)) fail(`ci.yml's node-version matrix must include the declared floor ${floor} (got ${JSON.stringify(versions)})`);
  if (!versions.includes(22)) fail(`ci.yml's node-version matrix must include 22 (got ${JSON.stringify(versions)})`);
  if (!/node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/.test(yml)) fail('setup-node must take node-version from the matrix');

  // CI runs the gitleaks-present branch of the harness (issue #51): it installs the
  // exact release the routine template's optional step pins, checked against the
  // same sha256, before npm test — never an unpinned binary, never left out.
  const tplYml = readFileSync(join(ROOT, 'routine', 'assay-routine.yml'), 'utf8');
  const pinOf = (text, key) => (text.match(new RegExp(`${key}:\\s*'([^']+)'`)) || [])[1];
  const installIdx = lines.findIndex((l) => /^\s*-\s*name:\s*Install gitleaks/.test(l));
  const testIdx = lines.findIndex((l) => /^\s*-?\s*run:\s*npm test\s*$/.test(l));
  if (installIdx === -1) fail('ci.yml must install gitleaks (an enabled "Install gitleaks" step), so CI runs the harness with the binary present');
  else {
    if (testIdx !== -1 && installIdx > testIdx) fail('ci.yml must install gitleaks before npm test');
    for (const k of ['GITLEAKS_VERSION', 'GITLEAKS_SHA256']) {
      if (!pinOf(yml, k) || pinOf(yml, k) !== pinOf(tplYml, k)) fail(`ci.yml's ${k} must equal the routine template's (got ${pinOf(yml, k)}, template ${pinOf(tplYml, k)}) — one engine, one pin`);
    }
    if (!/sha256sum -c/.test(yml)) fail('ci.yml must check the gitleaks download against its sha256 before executing it');
  }

  for (const s of ['lint', 'typecheck', 'build', 'test']) {
    if (typeof pkg.scripts?.[s] !== 'string') fail(`package.json must declare a "${s}" script`);
    const cmd = s === 'test' ? 'npm test' : `npm run ${s}`;
    if (!lines.some((l) => (l.match(/^\s*(?:-\s*)?run:\s*(.*?)\s*$/) || [])[1] === cmd)) fail(`ci.yml must run "${cmd}"`);
  }
}
