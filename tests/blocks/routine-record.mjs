// ── routine.yaml stays readable whatever a failure reason carries ──
import { parseYaml } from '../../lib/yaml-min.mjs';
import { toRoutineYaml } from '../../routine/run.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'routine-record';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('routine-record: ' + m);
  const y = toRoutineYaml({ date: 'd', commit: 'c', engine: 'e', trigger: 'local', baseline: { source: 'none' }, gate: 'not-run', failures: ['validate failed:\n  • F-1: bad C:\\\\tmp\\\\x "quoted"\n' + 'z'.repeat(900)], contradictions: 0, exit: 1 });
  let doc = null;
  try { doc = parseYaml(y); } catch (e) { fail(`a multi-line, quoted, backslashed reason must still parse (${e.message})`); }
  if (doc) {
    const f = doc.failures && doc.failures[0];
    if (typeof f !== 'string' || f.includes('\n')) fail(`a reason is recorded on one line (got ${JSON.stringify(f)})`);
    if (f && f.length > 400) fail(`a reason is capped (got ${f.length} chars)`);
    if (f && !f.includes('"quoted"')) fail('quotes inside a reason survive the round trip');
  }
}
