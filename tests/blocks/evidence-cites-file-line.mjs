// ── every evidence entry cites a file and a line, each refused on its own (#321) ──
// CLAUDE.md rule 2: no claim without evidence, and validate fails closed. The negative fixture
// tests/negative/evidence-not-path-line holds two citations that are not path:line, a bare file
// (F-001) and a map (F-002), and its README says validate must reject both. negative-fixtures
// reads the run red when either is refused, so a validator that came to accept a bare file kept
// it green: the mutation list (tests/prove-red.mjs) made the line optional in validate's CITE
// and negative-fixtures stayed green. Held here: validate refuses each of the two by its id, and
// refuses `:12` (a line of no file, tests/negative/evidence-no-path) as citing no path.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'evidence-cites-file-line';

const validate = (dir) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'negative', dir)], { encoding: 'utf8' });
  return { status: r.status, violations: `${r.stdout}${r.stderr}`.split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4)) };
};

export async function run() {
  const fail = (m) => negFailures.push('evidence-cites-file-line: ' + m);
  const v = validate('evidence-not-path-line');
  if (v.status === 0) fail('validate must refuse a citation that is not path:line (it exited 0)');
  for (const [id, what, ev] of [['F-001', 'a bare file with no line', /evidence "lib\/agent\.mjs" is not a path:line citation/], ['F-002', 'a map', /evidence \{"path":"lib\/agent\.mjs","lines":"1"\} is not a path:line citation/]]) {
    if (!v.violations.some((l) => l.includes(id) && ev.test(l))) fail(`validate must refuse ${id}, ${what}, as not a path:line citation (got ${v.violations.join(' | ') || 'no listed violation'})`);
  }
  const np = validate('evidence-no-path');
  if (!np.violations.some((l) => /evidence ":1" cites no path/.test(l))) fail(`validate must refuse ":1" as citing no path (got ${np.violations.join(' | ') || 'no listed violation'})`);
}
