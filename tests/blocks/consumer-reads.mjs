// ── consumer-reads: every read a consumer still made past the contract is on it (#236) ──
// A consumer moved to reading assay through CONSUMERS.md alone kept an allow-list of reads
// past it: maturity and variance (commands, not listed), the projection and chains of a red
// run, a checkout's toolchain, the yardstick compare, the lanes and passes, the child
// environment, and the Improve report's model. Pinned:
//   (a) CONSUMERS.md lists each command with its flags: maturity, variance, project,
//       compare, toolchain and lane --list;
//   (b) a Modules section names the one listed export beside run-layout, map/child-env.mjs's
//       childEnv, and what it promises: a target's script never sees a token;
//   (c) the run layout names views/improve/report.json and views/README.md states its format;
//   (d) the two listed-as-they-are commands print what the page says: maturity --write
//       writes maturity-grades.yaml with its aggregate, variance --json prints pct, union, core.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'consumer-reads';

const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });

export async function run() {
  const fail = (m) => negFailures.push('consumer-reads: ' + m);
  const page = readFileSync(join(ROOT, 'CONSUMERS.md'), 'utf8');
  const commands = page.split(/^## /m).find((s) => s.startsWith('Commands and flags')) || '';
  // (a)
  for (const row of ['node assay.mjs maturity <run> [--write]', 'node assay.mjs variance <run> <run>', 'node assay.mjs project <run> [--json]',
    'node assay.mjs compare <previous> <current> [--json]', 'node assay.mjs toolchain <checkout> [--json]', 'node assay.mjs lane --list [--json]'])
    if (!commands.includes('`' + row)) fail(`CONSUMERS.md § Commands and flags must list \`${row}\``);
  // (b)
  const modules = page.split(/^## /m).find((s) => s.startsWith('Modules')) || '';
  if (!modules) fail('CONSUMERS.md must carry a Modules section: the module exports a consumer may import');
  else {
    if (!/map\/child-env\.mjs/.test(modules) || !/childEnv\(/.test(modules)) fail('CONSUMERS.md § Modules must list map/child-env.mjs\'s childEnv()');
    if (!/lib\/run-layout\.mjs/.test(modules)) fail('CONSUMERS.md § Modules must list lib/run-layout.mjs beside it');
  }
  const { childEnv } = await import('../../map/child-env.mjs');
  const before = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'planted-not-a-token';
  try {
    const env = childEnv();
    if ('GITHUB_TOKEN' in env || !env.CI) fail(`childEnv() must drop a token and set CI (got ${Object.keys(env).join(', ')})`);
  } finally { if (before === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = before; }
  // (c)
  if (!/`views\/improve\/report\.json`/.test(page)) fail('CONSUMERS.md § The run layout must name views/improve/report.json');
  const viewsReadme = readFileSync(join(ROOT, 'views', 'README.md'), 'utf8');
  if (!/`views\/improve\/report\.json`[^\n]*assay\.improve-report\/1/.test(viewsReadme)) fail('views/README.md must state report.json\'s format (assay.improve-report/1)');
  // (d)
  const tmp = join(HERE, 'tmp-consumer-reads');
  rmSync(tmp, { recursive: true, force: true });
  try {
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    const m = assay(['maturity', tmp, '--write']);
    const gp = join(tmp, 'views', 'improve', 'maturity-grades.yaml');
    if (m.status !== 0 || !existsSync(gp)) fail(`maturity --write must write views/improve/maturity-grades.yaml (got ${m.status}: ${m.stderr.trim()})`);
    else {
      const g = parseYaml(readFileSync(gp, 'utf8'));
      if (!g || !Array.isArray(g.dimensions) || !g.aggregate || typeof g.aggregate.pct !== 'number') fail('maturity-grades.yaml must carry dimensions and the aggregate pct');
    }
    const v = assay(['variance', join(ROOT, 'tests', 'fixtures', 'notesbox'), tmp, '--json']);
    let vd = null;
    try { vd = JSON.parse(v.stdout); } catch { /* read below */ }
    if (v.status !== 0 || !vd || typeof vd.pct !== 'number' || typeof vd.union !== 'number' || typeof vd.core !== 'number') fail(`variance --json must print pct, union and core as numbers (got ${v.status}: ${v.stdout.slice(0, 120)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
