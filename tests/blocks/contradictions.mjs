// ── contradictions surface in Maintain too, and ratchet always fails on one
// (yardstick/README.md; views/README.md) — a repository's own packet claimed a
// run-decided requirement satisfied; this run found it unmet, never silently
// overridden. Checked with NO --baseline at all: a contradiction is a failure
// under stewardship every time, never something a flag can wave through.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadContradictions } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'contradictions';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('contradictions: ' + m);
  const tmp = join(HERE, 'tmp-contradictions'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  // d-secrets-out-of-history reads unmet in the plain notesbox fixture (gitleaks's
  // F-700) — a packet claiming it satisfied must record a contradiction.
  mkdirSync(join(tmp, 'owner'), { recursive: true });
  writeFileSync(join(tmp, 'owner', 'manifest.yaml'), [
    'packet: 1', 'yardstick: 0',
    'answered:', '  date: "2026-09-28"', '  by: founder', '  via: owner-prompt',
    'claims:', '  - id: d-secrets-out-of-history', '    state: satisfied', '    by: "a ci scan we trust"',
  ].join('\n') + '\n');
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  if (loadContradictions(tmp).length !== 1) fail(`test setup: expected exactly one contradiction (got ${JSON.stringify(loadContradictions(tmp))})`);

  try { execFileSync(process.execPath, [join(ROOT, 'views', 'maintain.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/maintain.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const maintainYamlPath = join(tmp, 'views', 'maintain.yaml');
  const maintainDoc = existsSync(maintainYamlPath) ? parseYaml(readFileSync(maintainYamlPath, 'utf8')) : null;
  if (!maintainDoc || !(maintainDoc.contradictions || []).some((c) => c.id === 'd-secrets-out-of-history'))
    fail(`maintain.yaml must carry the contradiction, same shape as Intake (got ${JSON.stringify(maintainDoc && maintainDoc.contradictions)})`);
  const maintainPage = existsSync(join(tmp, 'MAINTAIN.md')) ? readFileSync(join(tmp, 'MAINTAIN.md'), 'utf8') : '';
  if (!/## Contradicted claims/.test(maintainPage) || !/d-secrets-out-of-history/.test(maintainPage)) fail('MAINTAIN.md must carry a "Contradicted claims" section naming the contradiction');

  // ratchet: a contradiction is ALWAYS a failure, even with no --baseline given.
  let out = '', err = '', status = 0;
  try { out = execFileSync(process.execPath, [join(ROOT, 'yardstick', 'ratchet.mjs'), tmp], { stdio: 'pipe' }).toString(); }
  catch (e) { status = e.status ?? 1; err = String(e.stderr || ''); out = String(e.stdout || ''); }
  if (status !== 1) fail(`ratchet must exit 1 when the run carries a contradiction, even with no --baseline (got ${status})`);
  const line = err || out;
  if (!line.includes('d-secrets-out-of-history')) fail('the contradiction failure line must name the requirement id');
  if (!/satisfied/.test(line) || !/unmet/.test(line)) fail(`the contradiction failure line must name what the owner claimed and what the run found (got: ${line})`);

  rmSync(tmp, { recursive: true, force: true });
}
