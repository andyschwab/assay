// ── exposures sidecar: standing_watch, not the retired stage scale ────────────
// The stage scale (gate:/blocks_stage:) is retired: a sidecar (properties +
// standing_watch only) must validate green.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'exposures-sidecar';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('exposures-sidecar: ' + m);
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), join(HERE, 'sidecar-fixture')], { stdio: 'pipe' }); }
  catch { fail('a sidecar (no gate:, no blocks_stage:, standing_watch labeled) must validate green'); }
}
