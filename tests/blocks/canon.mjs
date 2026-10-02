// ── the canon check (SCHEMA.md §8, #52): a named-but-missing canon is an error,
// channel drift against a present one is a warning, never an error ──
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'canon';

export async function run() {
  const fail = (m) => negFailures.push('canon: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-canon-'));
  const run = join(tmp, 'entry', 'runs', 'r');   // the custody layout: <entry>/runs/<run>/, canon at <entry>/canon/
  mkdirSync(join(run, 'map', 'findings'), { recursive: true });
  mkdirSync(join(run, 'views', 'improve'), { recursive: true });
  copyFileSync(join(HERE, 'negative', 'bad-standing-watch', 'map', 'scanners.yaml'), join(run, 'map', 'scanners.yaml'));
  writeFileSync(join(run, 'map', 'findings', 'repo-eval-delegation.yaml'), [
    '- id: F-001', '  dimension: delegation', '  polarity: strength', '  subject_type: effect',
    '  observation: A held, reversible send.', '  evidence: [a.py:1]', '  confidence: confirmed',
    '  effect:', '    channel: mail-send', '    reversibility: reversible', '    external: false',
    '    gate_type: deterministic-halt', '    fail_mode: closed', '    telemetry: audited', '    blast_scope: user', ''].join('\n'));
  writeFileSync(join(run, 'views', 'improve', 'prose.yaml'), 'canon: c1\n');
  const validateJson = () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), run, '--json'], { encoding: 'utf8' });
    try { return { exit: r.status, ...JSON.parse(r.stdout) }; } catch { return { exit: r.status, errors: [`unparseable: ${r.stdout}${r.stderr}`], warnings: [] }; }
  };
  const missing = validateJson();
  if (missing.exit !== 1 || missing.errors.length !== 1 || !/canon: "c1" names canon\/c1\.yaml, which exists neither/.test(missing.errors[0] || ''))
    fail(`a named-but-missing canon must be the one error (got exit ${missing.exit}: ${missing.errors.join(' | ')})`);
  mkdirSync(join(tmp, 'entry', 'canon'), { recursive: true });
  writeFileSync(join(tmp, 'entry', 'canon', 'c1.yaml'), 'effect_channels:\n  - slug: ledger-write\n');
  const drift = validateJson();
  if (drift.exit !== 0 || drift.errors.length) fail(`channel drift against a present canon must not fail validate (got exit ${drift.exit}: ${drift.errors.join(' | ')})`);
  if (!drift.warnings.some((w) => /run effect channel "mail-send" is not in the canon/.test(w))) fail('a run channel the canon lacks must warn');
  if (!drift.warnings.some((w) => /canon channel "ledger-write" has no effect finding/.test(w))) fail('a canon channel the run does not assess must warn');
  rmSync(tmp, { recursive: true, force: true });
}
