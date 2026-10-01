// ── repo-census: no deployment signal → the six operating rows read not-applicable ──
// (issue #19) A tree with nothing deployed (a library, a command-line tool) has no
// backup to restore, no deploy to roll back, nothing to smoke-test, monitor or bill:
// the census records that it looked for a deployment signal anywhere in the tree and
// found none, each evidence check reads not-applicable (never pass), ingest files a
// fact row per check, and the yardstick reads the six rows not-applicable — never met,
// the d-schema-versioned shape. Conservative: any one signal (a container file, a
// hosting config, infrastructure-as-code or a service manifest, a deploy workflow, a
// server entry point or framework dependency, an owner evidence directory, a packet
// evidence pointer) keeps every evidence check measured, and a missing transcript a gap.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'repo-census-no-deployment';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('repo-census-no-deployment: ' + m);
  const EVIDENCE_IDS = ['d-backup-restore-exercised', 'd-rollback-exercised', 'd-deploy-one-command', 'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts'];
  const tmp = join(HERE, 'tmp-repo-census-no-deploy');
  // a pure library: no I/O, a test-only CI gate, nothing deployed
  const library = () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(tmp, 'test'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'slug', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
    writeFileSync(join(tmp, 'index.mjs'), 'export const slug = (s) => s.toLowerCase();\n');
    writeFileSync(join(tmp, 'test', 'slug.test.mjs'), "import { slug } from '../index.mjs';\n");
    writeFileSync(join(tmp, 'README.md'), '# slug\n\nA library.\n');
    writeFileSync(join(tmp, '.github', 'workflows', 'ci.yml'), 'on: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n');
  };
  const census = () => {
    const out = join(tmp, '..', 'tmp-repo-census-no-deploy.json');
    rmSync(out, { force: true });
    let exit = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch (e) { exit = e.status; }
    const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
    rmSync(out, { force: true });
    return { exit, raw, doc: raw ? JSON.parse(raw) : null };
  };
  library();
  const { exit, raw, doc } = census();
  if (!doc) fail('the runner must write a document over a library fixture');
  else {
    if (!Array.isArray(doc.deployment?.signals) || doc.deployment.signals.length) fail(`a library with nothing deployed must record zero deployment signals (got ${JSON.stringify(doc.deployment)})`);
    for (const id of EVIDENCE_IDS) {
      const c = doc.checks.find((x) => x.name === `evidence-${id}`);
      if (c?.status !== 'not-applicable' || !/no deployment signal/i.test(c.observation || '')) fail(`evidence-${id} must read not-applicable naming the absent deployment signal (got ${c?.status}/${c?.observation})`);
      for (const ev of c?.evidence || []) if (!existsSync(join(tmp, ev.replace(/:\d+$/, '')))) fail(`evidence-${id} cites ${ev}, which is not in the target`);
    }
    // the four tree checks are untouched by the signal (architecture page, agent contract and runbook still gap here)
    if (exit !== 1) fail(`the library still carries tree gaps (architecture, agent contract, runbook): exit 1 (got ${exit})`);
    // ingest: one fact row per not-applicable check, in its own category, never a gap or a strength
    const rows = convert('repo-census', raw, exit);
    for (const id of EVIDENCE_IDS) {
      const got = rows.filter((r) => r.native_category === `evidence-${id}-not-applicable`);
      if (got.length !== 1 || got[0].polarity !== 'fact') fail(`evidence-${id} not-applicable must convert to exactly one fact row in evidence-${id}-not-applicable (got ${JSON.stringify(got)})`);
      if (rows.some((r) => r.native_category === `evidence-${id}`)) fail(`evidence-${id} not-applicable must leave its own category empty`);
    }
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`every not-applicable fact category must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    // the yardstick: not-applicable, with the census's own observation — never met
    const reg = loadYardstick();
    const m = Object.fromEntries(measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    for (const id of EVIDENCE_IDS) {
      if (m[id]?.status !== 'not-applicable' || !/no deployment signal/i.test(m[id].note || '')) fail(`${id} must read not-applicable from a census that found no deployment signal (got ${m[id]?.status}/${m[id]?.note})`);
    }
    // and the converter's old silence would have read met: a not-applicable check that leaves no row is the bug this pins
    const silent = Object.fromEntries(measureRun({ findings: rows.filter((r) => !/-not-applicable$/.test(r.native_category)), manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (silent['d-cost-alerts']?.status !== 'met') fail('control: with the fact row dropped the row reads met — the fact row is what keeps it not-applicable');
  }
  // conservative: each deployment signal on its own keeps all six measured, and absent transcripts gap
  const SIGNALS = [
    ['a deploy workflow', () => writeFileSync(join(tmp, '.github', 'workflows', 'release.yml'), 'on:\n  push:\n    branches: [main]\njobs:\n  ship:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ./scripts/deploy.sh\n'), '.github/workflows/release.yml'],
    ['a Dockerfile', () => writeFileSync(join(tmp, 'Dockerfile'), 'FROM node:20\n'), 'Dockerfile'],
    ['a nested compose file', () => { mkdirSync(join(tmp, 'apps', 'api'), { recursive: true }); writeFileSync(join(tmp, 'apps', 'api', 'docker-compose.yml'), 'services: {}\n'); }, 'apps/api/docker-compose.yml'],
    ['a hosting config', () => writeFileSync(join(tmp, 'vercel.json'), '{}\n'), 'vercel.json'],
    ['a Procfile', () => writeFileSync(join(tmp, 'Procfile'), 'web: node server.mjs\n'), 'Procfile'],
    ['infrastructure as code', () => { mkdirSync(join(tmp, 'infra'), { recursive: true }); writeFileSync(join(tmp, 'infra', 'main.tf'), '# x\n'); }, 'infra/main.tf'],
    ['a server entry point', () => writeFileSync(join(tmp, 'server.mjs'), "import http from 'node:http';\n"), 'server.mjs'],
    ['a start script', () => writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'svc', scripts: { start: 'node index.mjs' } }) + '\n'), 'package.json'],
    ['a server framework dependency', () => writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'svc', dependencies: { express: '^4.0.0' } }) + '\n'), 'package.json'],
    ['a Python web framework', () => writeFileSync(join(tmp, 'requirements.txt'), 'fastapi==0.110.0\n'), 'requirements.txt'],
    ['an owner evidence directory', () => { mkdirSync(join(tmp, 'ops', 'evidence'), { recursive: true }); writeFileSync(join(tmp, 'ops', 'evidence', 'README.md'), 'transcripts go here\n'); }, 'ops/evidence'],
  ];
  for (const [label, plant, path] of SIGNALS) {
    library(); plant();
    const r = census();
    if (!r.doc) { fail(`${label}: the runner must write a document`); continue; }
    const sig = r.doc.deployment?.signals || [];
    if (!sig.some((s) => s.path === path)) fail(`${label}: the census must record ${path} as a deployment signal (got ${JSON.stringify(sig)})`);
    for (const id of EVIDENCE_IDS) {
      const c = r.doc.checks.find((x) => x.name === `evidence-${id}`);
      if (c?.status !== 'gap' || !/No evidence transcript found/.test(c.observation || '')) fail(`${label}: evidence-${id} must still gap without a transcript (got ${c?.status}/${c?.observation})`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}
