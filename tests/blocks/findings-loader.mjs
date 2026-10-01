// ── the shared findings loader fails loud on a shape it cannot read (#53, F-1213) ──
// A findings file whose top level is not a list was skipped, and a run with no
// map/findings/ read as an empty base, so variance reported 0 % and score, since and
// measure read zero findings where there was a file they could not read or no map at all.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadFindings } from '../../map/project.mjs';
import { computeVariance } from '../../map/variance.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'findings-loader';

export async function run() {
  const fail = (m) => negFailures.push('findings-loader: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must throw`); };
  const mapShaped = join(HERE, 'negative', 'findings-not-a-list');
  mustThrow('loadFindings over a findings file whose top level is a map', () => loadFindings(mapShaped));
  mustThrow('loadFindings over a run with no map/findings/ directory', () => loadFindings(join(HERE, 'tmp-no-such-run')));
  mustThrow('variance over a map-shaped sweep', () => computeVariance([mapShaped, join(HERE, 'fixtures', 'notesbox')]));
  const v = spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), join(HERE, 'fixtures', 'notesbox'), join(HERE, 'tmp-no-such-run')], { encoding: 'utf8' });
  if (v.status === 0) fail(`variance over a sweep with no map/findings/ must exit non-zero (got 0: ${String(v.stdout).split('\n').slice(0, 3).join(' | ')})`);
  const sc = spawnSync(process.execPath, [join(ROOT, 'map', 'score.mjs'), mapShaped, '--answers', join(HERE, 'fixtures', 'notesbox', 'ANSWERS.yaml')], { encoding: 'utf8' });
  if (sc.status === 0) fail('score over a map-shaped findings file must exit non-zero');
  const empty = loadFindings(join(HERE, 'fixtures', 'cleanlib'));
  if (!Array.isArray(empty)) fail('a well-formed run must still load as a list');
}
