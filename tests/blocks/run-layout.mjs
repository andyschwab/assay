// ── lib/run-layout.mjs places every artifact where the contract says (#52) ────
// Pinned as literal run-relative paths, independent of the module: a moved path is a
// layout change every reader and every existing run must agree to, never a silent one.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { negFailures } from '../harness.mjs';

export const label = 'run-layout';

export async function run() {
  const fail = (m) => negFailures.push('run-layout: ' + m);
  const L = await import('../../lib/run-layout.mjs');
  const R = join(tmpdir(), 'assay-layout-probe');
  const rel = (p) => p.slice(R.length + 1).split(/[\\/]/).join('/');
  const want = [
    ['indexPath', [], 'INDEX.md'], ['intakePagePath', [], 'INTAKE.md'], ['maintainPagePath', [], 'MAINTAIN.md'],
    ['improvePagePath', [], 'IMPROVE.md'], ['ownerPagePath', [], 'OWNER.md'], ['sincePagePath', [], 'SINCE.md'],
    ['routinePath', [], 'routine.yaml'], ['handoffDir', [], 'handoff'],
    ['scannersPath', [], 'map/scanners.yaml'], ['findingsDir', [], 'map/findings'], ['findingsPath', ['gitleaks'], 'map/findings/gitleaks.yaml'],
    ['repoEvalPassPath', ['gates'], 'map/findings/repo-eval-gates.yaml'], ['coveragePath', ['deep-code-review'], 'map/coverage/deep-code-review.yaml'],
    ['censusesPath', [], 'map/censuses.yaml'], ['backlogPath', [], 'map/backlog.yaml'], ['terrainPath', [], 'map/terrain.md'],
    ['nativeReportPath', ['deep-code-review'], 'map/native/deep-code-review.md'], ['rawPath', ['x.json'], 'map/raw/x.json'],
    ['yardstickPath', [], 'yardstick.yaml'], ['viewPath', ['intake'], 'views/intake.yaml'],
    ['prosePath', [], 'views/improve/prose.yaml'], ['axesPath', [], 'views/improve/axes.md'], ['leveragePath', [], 'views/improve/leverage.md'],
    ['maturityPath', [], 'views/improve/maturity.md'], ['maturityGradesPath', [], 'views/improve/maturity-grades.yaml'],
    ['securityPath', [], 'views/improve/security.md'], ['securityGatePath', [], 'views/improve/security-gate.yaml'],
    ['synthesisPath', [], 'views/improve/synthesis.md'], ['decisionsPath', [], 'owner/decisions.yaml'], ['packetManifestPath', [], 'owner/manifest.yaml'],
    ['backlogAuthoredPath', [], 'map/backlog-authored.yaml'], ['chainsDataPath', [], 'views/improve/chains.json'], ['handoffSequencePath', [], 'handoff/sequence.json'],
  ];
  for (const [fn, args, path] of want) {
    if (typeof L[fn] !== 'function') { fail(`lib/run-layout.mjs no longer exports ${fn}`); continue; }
    const got = rel(L[fn](R, ...args));
    if (got !== path) fail(`${fn} places ${got}; the run layout says ${path}`);
  }
}
