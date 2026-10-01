// ── ingest keeps the run record: a successful ingest flips that scanner's row
// to ran, without disturbing anything else in map/scanners.yaml ─────────────
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'ingest-record';

export async function run() {
  const fail = (m) => negFailures.push('ingest-record: ' + m);
  const tmp = join(HERE, 'tmp-ingest-record'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'map'), { recursive: true });
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), [
    '# a header comment',
    'engine: cafef00d',
    'scanners:',
    '  repo-eval:',
    '    status: skipped',
    '    reason: "not yet run: ingesting its report records it ran"',
    '  gitleaks:',
    '    status: skipped',
    '    reason: "not yet run: ingesting its report records it ran"',
    '',
  ].join('\n'));
  execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1', '--model', 'test-model'], { encoding: 'utf8' });
  const manifest = parseYaml(readFileSync(join(tmp, 'map', 'scanners.yaml'), 'utf8'));
  if (manifest.scanners?.gitleaks?.status !== 'ran') fail(`ingest must flip the ingested tool's row to ran (got ${JSON.stringify(manifest.scanners?.gitleaks)})`);
  if (manifest.scanners.gitleaks.reason) fail('ingest flipping a row to ran must drop its prior skip reason');
  if (manifest.scanners.gitleaks.model !== 'test-model') fail(`ingest --model must be recorded on the flipped row (got ${JSON.stringify(manifest.scanners.gitleaks.model)})`);
  if (manifest.scanners?.['repo-eval']?.status !== 'skipped') fail('ingest must not disturb a DIFFERENT scanner\'s row');
  if (manifest.engine !== 'cafef00d') fail('ingest must not disturb engine:');
  const raw = readFileSync(join(tmp, 'map', 'scanners.yaml'), 'utf8');
  if (!raw.startsWith('# a header comment')) fail('ingest\'s record-keeping must not disturb the file\'s own header comment');

  rmSync(tmp, { recursive: true, force: true });
}
