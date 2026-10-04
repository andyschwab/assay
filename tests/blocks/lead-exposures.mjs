// ── the report's lead (§3) carries every Critical/Blocker exposure or control gap no chain carries (#32) ──
// The chain walk starts only at untrusted-input capabilities, so a Critical access gap with
// nothing model-driven on its path (a stranger reaching an unauthenticated route) rendered
// only in §5, below the lead. SCHEMA §6d states the rule: the lead is the ranked chains,
// plus any exposure or control gap at or above Critical that no live chain carries.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'lead-exposures';

export async function run() {
  const fail = (m) => negFailures.push('lead-exposures: ' + m);
  const tmp = join(HERE, 'tmp-lead-exposures'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
  // notesbox: the one live chain is model-driven (F-051 → F-052). F-050 (auth fails open to
  // admin) is the non-AI access gap; rated Critical here, it is the run's only Critical.
  const del = join(tmp, 'map', 'findings', 'repo-eval-delegation.yaml');
  writeFileSync(del, readFileSync(del, 'utf8').replace(/(- id: F-050\n(?:  .*\n)*?  confidence: confirmed\n)/, '$1  severity: Critical\n'));
  if (!/F-050[\s\S]*?severity: Critical/.test(readFileSync(del, 'utf8'))) fail('fixture setup: F-050 must carry severity Critical');
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), 'target: "notesbox"\nmaintainer: "the test maintainers"\nexec_summary: "test"\n');
  const gateYaml = (exposures) => writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), exposures);
  const compile = () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
    if (r.status !== 0) { fail(`report.mjs must compile (stderr: ${r.stderr})`); return ''; }
    const md = existsSync(join(tmp, 'IMPROVE.md')) ? readFileSync(join(tmp, 'IMPROVE.md'), 'utf8') : '';
    const m = md.match(/\n## 3\.[^\n]*\n([\s\S]*?)\n## 4\./);
    if (!m) fail('IMPROVE.md must carry a §3 ahead of §4');
    return m ? m[1] : '';
  };

  // 1. a Critical exposure on a non-AI path leads, beside the model-driven chain
  gateYaml([
    'exposures:',
    '  - name: unauthenticated-admin', '    title: Any caller is treated as admin', '    findings: [F-050, F-053]',
    '    who: stranger-pre-auth', '    what: every route, as the most privileged role', '    likelihood: high',
    '    fix: Refuse unknown tokens in authenticate().',
    '  - name: assistant-email', '    title: Injected notes send email', '    findings: [F-051, F-052]',
    '    who: authorized-real-user', '    what: outbound email to an attacker', '    likelihood: moderate',
    '    fix: Draft, never send.', '',
  ].join('\n'));
  let s3 = compile();
  if (!/Any caller is treated as admin/.test(s3) || !/F-050/.test(s3)) fail(`a Critical exposure no chain carries must appear in §3 (got: ${s3.slice(0, 600)})`);
  if (!/\n### [^\n]*→/.test(s3)) fail('the model-driven chain must still lead §3');
  if (/Injected notes send email/.test(s3)) fail('an exposure with no finding at or above Critical stays in §5, not the lead');

  // 2. a Critical control gap in no exposure still enters the lead, from the findings alone
  gateYaml('exposures: []\n');
  s3 = compile();
  if (!/F-050/.test(s3)) fail(`a Critical control gap no chain or exposure carries must appear in §3 (got: ${s3.slice(0, 600)})`);

  // 3. below the threshold nothing extra enters: the lead is the chains alone
  writeFileSync(del, readFileSync(del, 'utf8').replace('  severity: Critical\n', '  severity: High\n'));
  s3 = compile();
  if (/F-050/.test(s3)) fail('a High control gap must not enter the lead');
  rmSync(tmp, { recursive: true, force: true });
}
