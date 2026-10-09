// ── core-names-no-scanner: scanners are data, operators are consumers (#147) ──
// CLAUDE.md rule 7. (a) No file of the core names an external scanner: what the
// core needs to know about one (its role, its ingest format and the tool value it
// accepts, its scoring method) is read off its adapter. The scanner ids come from
// the adapters directory, adopted and retired alike; a scanner the core itself
// implements (map/<id>.mjs, or the method map/METHOD.md names) is the core's own and
// is exempt. (b) No file outside HISTORY.md, SECURITY.md and the fixtures names an
// operator or an integration's project. The operator's organisation and repository
// names are held as SHA-256 digests of the lowercased word, so this public file
// does not name them either.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'core-names-no-scanner';

const CORE = ['map', 'yardstick', 'views', 'lib', 'routine'];
const NOT_CORE = (f) => f.startsWith('map/scanners/adapters/') || f === 'map/scanners/CANDIDATES.md';

// Known residue, each entry the files an external scanner is still named in and
// why: the list may only shrink, and an entry that no longer holds fails (stale).
const PENDING = {
  // the yardstick binds a requirement to the scanner whose native category decides it
  // (decide.scanner); moving that binding is a yardstick contract change, not #147's
  'deep-code-review': ['yardstick/requirements.yaml'],
  // instruments with a built-in conversion profile in ingest.mjs (and gitleaks' runner in
  // start.mjs and the routine): the same move to adapter fields, not yet made
  gitleaks: ['map/SCHEMA.md', 'map/ingest.mjs', 'map/scanners/CONTRACT.md', 'map/start.mjs', 'map/templates/scanners.yaml',
    'routine/README.md', 'routine/assay-routine.yml', 'routine/run.mjs', 'views/improve/handoff.mjs', 'views/severity.mjs',
    'yardstick/README.md', 'yardstick/requirements.yaml'],
  scorecard: ['map/ingest.mjs', 'map/scanners/CONTRACT.md', 'views/severity.mjs'],
};

const OPERATOR_WORDS = ['perun'];
const OPERATOR_DIGESTS = [
  'f1aca8defd722d9a056b1a7c26007e4abaa60fdd5fc948c1d400ca58941da655',
  '8275a2bcaf0ec5ca798d4292ef1dad3f89bb98eb0196bdc723e4b0996d98fb5c',
];
const SELF = 'tests/blocks/core-names-no-scanner.mjs';
// Known residue for (b), stale-checked like PENDING: the branch-cleanup workflow reads
// the automation identity's secret by its name; renaming the secret is a workflow and
// settings change outside #147.
const OPERATOR_PENDING = ['.github/workflows/branch-cleanup.yml'];

const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => {
  const p = join(dir, n);
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p];
});

export async function run() {
  const fail = (m) => negFailures.push('core-names-no-scanner: ' + m);

  // (a) the scanner ids, read from the adapters directory
  const adir = join(ROOT, 'map', 'scanners', 'adapters');
  const ids = readdirSync(adir).filter((f) => f.endsWith('.yaml')).map((f) => parseYaml(readFileSync(join(adir, f), 'utf8')).scanner).filter(Boolean);
  const method = (readFileSync(join(ROOT, 'map', 'METHOD.md'), 'utf8').match(/^name:\s*(\S+)/m) || [])[1];
  const own = (id) => id === method || existsSync(join(ROOT, 'map', id + '.mjs'));
  const external = ids.filter((id) => !own(id));
  if (!external.includes('deep-code-review')) fail(`the external scanners read from the adapters must include deep-code-review (got ${external.join(', ')})`);
  for (const id of Object.keys(PENDING)) if (!ids.includes(id)) fail(`PENDING names ${id}, which no adapter declares`);
  const files = CORE.flatMap(walk).map((p) => p.split('\\').join('/')).filter((f) => !NOT_CORE(f));
  for (const id of external) {
    const re = new RegExp(`(?<![\\w-])${id.replace(/[-]/g, '\\-')}(?![\\w-])`);
    const naming = files.filter((f) => re.test(readFileSync(join(ROOT, f), 'utf8')));
    const allowed = PENDING[id] || [];
    for (const f of naming) if (!allowed.includes(f)) fail(`${f} names the scanner ${id}; the core reads what it needs off adapters/${id}.yaml (CLAUDE.md rule 7)`);
    for (const f of allowed) if (!naming.includes(f)) fail(`PENDING lists ${f} for ${id}, which no longer names it: remove the entry`);
  }

  // (b) no operator or integration project is named outside the history, the security
  // contact and the fixtures
  let tracked;
  try { tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'); }
  catch (e) { fail(`git ls-files failed: ${e.message}`); return; }
  const skip = (f) => f === 'HISTORY.md' || f === 'SECURITY.md' || f === SELF || f.startsWith('tests/fixtures/') || f === 'package-lock.json';
  const digest = (w) => createHash('sha256').update(w).digest('hex');
  const named = new Set();
  for (const f of tracked.filter((x) => x && !skip(x))) {
    const p = join(ROOT, f);
    if (!existsSync(p) || statSync(p).size > 4_000_000) continue;
    const buf = readFileSync(p);
    if (buf.includes(0)) continue;   // binary
    const words = new Set(buf.toString('utf8').toLowerCase().split(/[^a-z0-9]+/));
    if ([...words].some((w) => OPERATOR_WORDS.includes(w) || OPERATOR_DIGESTS.includes(digest(w)))) named.add(f);
  }
  for (const f of named) if (!OPERATOR_PENDING.includes(f)) fail(`${f} names an operator or an integration's project; a consumer is named on its row, phrased for any operator (CLAUDE.md rule 7)`);
  for (const f of OPERATOR_PENDING) if (!named.has(f)) fail(`OPERATOR_PENDING lists ${f}, which no longer names an operator: remove the entry`);
}
