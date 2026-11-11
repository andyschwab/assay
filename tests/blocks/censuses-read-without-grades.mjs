// ── validate reads map/censuses.yaml whether or not a grades file exists (#267) ──
// A run fresh from its lane has no views/improve/maturity-grades.yaml yet. validate once
// parsed the censuses only while checking a grades file, so a censuses file the strict
// reader refuses passed validate and then threw in the measurement (variance, compile).
// The fixture holds an enforced: written as a nested flow map (still refused, #278) and no grades file; it must go red naming the
// file, for that reason only.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'censuses-read-without-grades';

export async function run() {
  const fail = (m) => negFailures.push('censuses-read-without-grades: ' + m);
  const fx = join(HERE, 'negative', 'censuses-flow-map');
  if (existsSync(join(fx, 'views', 'improve', 'maturity-grades.yaml'))) { fail('the fixture must carry no maturity-grades file (the case under test)'); return; }
  let red = false, out = '';
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), fx], { stdio: 'pipe' }); }
  catch (e) { red = true; out = String(e.stdout || '') + String(e.stderr || ''); }
  if (!red) { fail('negative/censuses-flow-map validated GREEN: an unreadable map/censuses.yaml with no grades file went unread'); return; }
  const violations = out.split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4));
  const expect = /^map\/censuses\.yaml: YAML parse failed .*unsupported YAML construct/;
  if (!violations.some((v) => expect.test(v))) fail(`red, but not naming map/censuses.yaml's parse failure: ${violations.join(' | ') || 'no listed violation'}`);
  const stray = violations.filter((v) => !expect.test(v));
  if (stray.length) fail(`red for other reasons too, so it cannot prove its own check: ${stray.join(' | ')}`);
}
