// ── a not-measured count and a previous status read what the measurement says (#53, F-1225) ──
// INDEX and IMPROVE counted every claim row as a not-measured, claim-only row even when the
// packet decided some of them; SINCE printed "not-measured → X" for a row that was
// previously not-applicable.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { renderMd as renderSinceMd } from '../../views/since.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'counts-read-measurement';

export async function run() {
  const fail = (m) => negFailures.push('counts-read-measurement: ' + m);
  const tmp = join(HERE, 'tmp-counts-read'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmp); copyFixtureScanners('cleanlib', tmp);
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), 'target: "cleanlib"\nmaintainer: "the test maintainers"\nexec_summary: "test"\nroadmap: []\n');
  writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
  const c = spawnSync(process.execPath, [join(ROOT, 'views', 'compile.mjs'), tmp, '--packet', join(HERE, 'fixtures', 'packet-valid')], { encoding: 'utf8' });
  if (c.status !== 0) fail(`the fixture is wrong: cleanlib with the valid packet must compile (exit ${c.status}: ${String(c.stderr).split('\n').slice(-3).join(' | ')})`);
  else {
    const rows = parseYaml(readFileSync(join(tmp, 'yardstick.yaml'), 'utf8')).requirements;
    const claimNm = rows.filter((r) => r.how === 'claim' && r.status === 'not-measured').length;
    if (claimNm === rows.filter((r) => r.how === 'claim').length) fail('the fixture is wrong: the valid packet must decide at least one claim row');
    const idx = readFileSync(join(tmp, 'INDEX.md'), 'utf8').match(/of which (\d+) are claim-only/)?.[1];
    if (Number(idx) !== claimNm) fail(`INDEX must count the claim rows still not measured (${claimNm}), not every claim row (got ${idx})`);
    const imp = readFileSync(join(tmp, 'IMPROVE.md'), 'utf8').match(/not measured, (\d+) of them claims/)?.[1];
    if (Number(imp) !== claimNm) fail(`IMPROVE must count the claim rows still not measured (${claimNm}), not every claim row (got ${imp})`);
  }
  rmSync(tmp, { recursive: true, force: true });
  const row = { id: 'd-x', tier: 'floor', topic: 'custody', title: 'X', previous: { status: 'not-applicable' }, current: { status: 'met', findings: [] }, note: '' };
  const md = renderSinceMd('run-b', 'run-a', { previousVersion: 1, currentVersion: 1, versionChanged: false, regressed: [], improved: [], newly_measured: [row], no_longer_measured: [], yardstick_only: [] }, { new: [], no_longer_found: [] });
  if (!/not-applicable → met/.test(md) || /not-measured → met/.test(md)) fail('SINCE must print the previous status of a newly measured row (not-applicable → met), never "not-measured →"');
}
