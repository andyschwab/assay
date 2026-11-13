// ── a misfire read off a platform's resource type, and a migrate that could not run (#319) ──
// On four rebuilt real runs, two cases the confidence rules were written for still read
// confirmed. All four targets deploy their container to Cloud Run, declared in Terraform
// (google_cloud_run_v2_service, or v1's google_cloud_run_service), which ignores an image's
// HEALTHCHECK and checks health by the service's own probes; the checkov misfire matched only
// deployment file names. And a fresh-clone migrate step the runner did not run, because its only
// form needs a live database (the #256 shape: no step ran), read confirmed, its reason only in prose.
// Now the census records the resource types each .tf file declares (comments dropped), the
// adapter's misfire names them (deployed_on_resource), and the runner writes the migrate's reason
// as a closed code (reason_code: needs-live-database) that ingest carries onto the row's detail:,
// which the fresh-clone adapter's not-measured pair reads. Pinned, with the census and the
// fresh-clone runner run over small trees:
//   (a) a Dockerfile with no HEALTHCHECK beside a .tf declaring a Cloud Run service, v2 or v1:
//       the census lists the resource type, and a CKV_DOCKER_2 hit reads known-misfire with its
//       adapter's reason;
//   (b) its twins read confirmed: the same Dockerfile with only a Compose file; the Cloud Run .tf
//       with a Compose file beside it; a .tf whose Cloud Run resource is commented out; a .tf
//       declaring another resource type;
//   (c) a package declaring db:migrate with no dry form, on a tree naming a database: the runner
//       writes reason_code needs-live-database, ingest carries it, and the row reads not-measured
//       with its adapter's reason;
//   (d) its twins read confirmed: no migrate script at all (not declared, no code), and a row
//       whose prose says it needs a live database but carries no code (the rule reads data, never
//       prose); ingest refuses a reason code outside the runner's closed list.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { convert } from '../../map/ingest.mjs';
import { confidenceOf } from '../../map/confidence.mjs';

export const label = 'confidence-platform-and-migrate';

const DOCKERFILE = 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.mjs"]\n';
const RUN_V2 = 'resource "google_cloud_run_v2_service" "app" {\n  name     = "app"\n  location = "europe-west1"\n}\n';
const RUN_V1 = 'resource "google_cloud_run_service" "app" {\n  name     = "app"\n  location = "europe-west1"\n}\n';
const COMPOSE = 'services:\n  app:\n    build: .\n';
const HIT = { source: 'checkov', f: { id: 'F-990', native_id: 'CKV_DOCKER_2@Dockerfile.@Dockerfile', native_category: 'dockerfile', polarity: 'gap', severity: 'Medium', observation: 'Ensure that HEALTHCHECK instructions have been added to container images (CKV_DOCKER_2).', evidence: ['Dockerfile:1'] } };

function tree(dir, files) {
  rmSync(dir, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), body); }
}
// the census's deployment signals over a tree, from its own report
function signals(dir, out) {
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'repo-census', dir, '--out', out], { encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) throw new Error(`repo-census exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  return JSON.parse(readFileSync(out, 'utf8')).deployment.signals;
}

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-confidence-platform-and-migrate');
  const adapters = loadAdapters();
  try {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const misfire = adapters.checkov.confidence.misfires.find((m) => m.id === 'healthcheck-ignored-by-platform');
    const read = (name, files) => {
      const dir = join(tmp, name);
      tree(dir, files);
      const deployment = signals(dir, join(tmp, `${name}.json`));
      return { deployment, c: confidenceOf(HIT, adapters, { deployment }) };
    };

    // (a) Cloud Run, v2 and v1, declared in Terraform
    for (const [name, tf, type] of [['run-v2', RUN_V2, 'google_cloud_run_v2_service'], ['run-v1', RUN_V1, 'google_cloud_run_service']]) {
      const { deployment, c } = read(name, { 'Dockerfile': DOCKERFILE, 'infra/main.tf': tf });
      const sig = deployment.find((s) => s.path === 'infra/main.tf');
      if (!sig || JSON.stringify(sig.resources) !== JSON.stringify([type])) fail(`the census lists the resource type a .tf declares (${name}: got ${JSON.stringify(sig)})`);
      if (c.value !== 'known-misfire' || c.reason !== misfire.reason || c.declared !== misfire.id) fail(`a HEALTHCHECK hit on a tree deploying to Cloud Run (${type}) reads known-misfire with its adapter's reason (got ${JSON.stringify(c)})`);
    }

    // (b) the twins stay confirmed
    for (const [name, files, why] of [
      ['compose-only', { 'Dockerfile': DOCKERFILE, 'docker-compose.yml': COMPOSE }, 'only a Compose file'],
      ['run-and-compose', { 'Dockerfile': DOCKERFILE, 'infra/main.tf': RUN_V2, 'compose.yaml': COMPOSE }, 'a Compose file beside the Cloud Run service'],
      ['run-commented', { 'Dockerfile': DOCKERFILE, 'infra/main.tf': `# ${RUN_V2.split('\n').join('\n# ')}\n/*\n${RUN_V1}*/\n// resource "google_cloud_run_v2_service" "x" {}\n` }, 'a Cloud Run resource only in comments'],
      ['other-resource', { 'Dockerfile': DOCKERFILE, 'infra/main.tf': 'resource "google_storage_bucket" "b" {\n  name = "b"\n}\n' }, 'another resource type'],
    ]) {
      const { c } = read(name, files);
      if (c.value !== 'confirmed') fail(`a HEALTHCHECK hit with ${why} stays confirmed (got ${JSON.stringify(c)})`);
    }

    // (c) a migrate that needs a live database, run through the runner and ingest
    const app = join(tmp, 'migrate-app');
    tree(app, { 'package.json': JSON.stringify({ name: 'm', version: '1.0.0', scripts: { 'db:migrate': 'node migrate.mjs' }, dependencies: { pg: '8.11.0' } }, null, 2) });
    const out = join(tmp, 'fc.json');
    const fc = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'fresh-clone', app, '--out', out, '--no-clone', '--timeout', '60'], { encoding: 'utf8' });
    if (fc.status !== 0 && fc.status !== 1) { fail(`fresh-clone must run over the tree (exit ${fc.status}): ${(fc.stderr || '').slice(0, 300)}`); return; }
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const mig = report.steps.find((s) => s.name === 'migrate');
    if (mig?.status !== 'not-declared' || mig?.reason_code !== 'needs-live-database') fail(`the runner writes the migrate's reason as a code (got ${JSON.stringify(mig)})`);
    const rowOf = (rep) => convert('fresh-clone', JSON.stringify(rep), rep.exit).find((r) => r.native_category === 'migrate');
    const row = rowOf(report);
    if (row?.detail?.status !== 'not-declared' || row?.detail?.reason_code !== 'needs-live-database') fail(`ingest carries the code onto the row's detail (got ${JSON.stringify(row && row.detail)})`);
    const pair = adapters['fresh-clone'].confidence.not_measured.find((n) => n.id === 'migrate-needs-a-live-database');
    const c = row ? confidenceOf({ source: 'fresh-clone', f: row }, adapters, {}) : null;
    if (c?.value !== 'not-measured' || c?.reason !== pair?.reason || c?.declared !== 'migrate-needs-a-live-database') fail(`a migrate that needs a live database reads not-measured with its adapter's reason (got ${JSON.stringify(c)})`);

    // (d) the twins stay confirmed, and the code is closed
    const noScript = { ...report, steps: report.steps.map((s) => (s.name === 'migrate' ? { ...s, reason: 'no migrate / db:migrate script in package.json', reason_code: undefined } : s)) };
    const proseOnly = { ...report, steps: report.steps.map((s) => (s.name === 'migrate' ? { ...s, reason_code: undefined } : s)) };
    for (const [why, rep] of [['declares no migrate script', noScript], ['says it needs a live database in prose only', proseOnly]]) {
      const r = rowOf(JSON.parse(JSON.stringify(rep)));
      const v = r ? confidenceOf({ source: 'fresh-clone', f: r }, adapters, {}) : null;
      if (v?.value !== 'confirmed') fail(`a migrate row that ${why} stays confirmed (got ${JSON.stringify(v)})`);
    }
    let refused = false;
    try { rowOf({ ...report, steps: report.steps.map((s) => (s.name === 'migrate' ? { ...s, reason_code: 'needs-a-pony' } : s)) }); } catch { refused = true; }
    if (!refused) fail('ingest refuses a reason code outside the runner\'s closed list');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
