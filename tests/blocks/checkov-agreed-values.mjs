// ── checkov-agreed-values: a variable every environment sets alike is resolved (#306) ──
// checkov resolves a Terraform variable from its default, terraform.tfvars and *.auto.tfvars,
// never from per-environment value files (envs/prod.tfvars). A Cloud SQL instance whose
// `ssl_mode = var.db_ssl_mode` is set in every environment reached CKV_GCP_6 as the bare
// reference and failed it whatever the environments set. The adapter's run.agreed_values has
// the runner hand checkov each variable that every environment's value file sets to one
// identical literal (map/start.mjs agreedValues), so the check judges the value the tree
// states; a variable the environments disagree on stays unresolved and fails as before. The
// trees are written at runtime to a scratch directory, so this repository carries no
// infrastructure of its own.
//
// One fact about the pinned policy is held here too, because it decided the reported case: at
// checkov 3.4.0, CKV_GCP_6 passes a non-SQL Server instance only on
// TRUSTED_CLIENT_CERTIFICATE_REQUIRED (client certificates), so ENCRYPTED_ONLY in every
// environment still fails it once resolved. That is the tool's policy, read as it is; an
// upgrade that changes it turns this block red and is reviewed then.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runAdapterInstrument } from '../../map/start.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'checkov-agreed-values';

const MAIN = `variable "db_ssl_mode" {
  type = string
}

resource "google_sql_database_instance" "main" {
  name             = "main"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled = false
      ssl_mode     = var.db_ssl_mode
    }
  }
}
`;

export async function run() {
  const fail = (m) => negFailures.push('checkov-agreed-values: ' + m);
  const adapter = loadAdapters().checkov;
  const spec = adapter?.run?.agreed_values;
  if (!spec || spec.flag !== '--var-file' || !(spec.files || []).includes('**/*.tfvars') || !['terraform.tfvars', '*.auto.tfvars'].every((f) => (spec.loaded || []).includes(f))) fail(`the checkov adapter must hand on agreed values after --var-file, from every .tfvars file but the two checkov loads itself (got ${JSON.stringify(spec)})`);
  if (spawnSync('checkov', ['--version'], { encoding: 'utf8' }).status !== 0) return;   // the black-box half needs the binary (CI installs it)

  const scratch = mkdtempSync(join(tmpdir(), 'assay-checkov-agreed-'));
  const tree = (name, envs) => {
    const dir = join(scratch, name);
    const files = { 'infra/main.tf': MAIN, ...Object.fromEntries(Object.entries(envs).map(([env, mode]) => [`infra/envs/${env}.tfvars`, `region      = "us-central1"\ndb_ssl_mode = "${mode}"\n`])) };
    for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); }
    const out = join(scratch, `${name}-run`);
    const r = runAdapterInstrument('checkov', adapter, dir, out, () => {});
    const findings = join(out, 'map', 'findings', 'checkov.yaml');
    if (r.status !== 'ran') fail(`${name}: checkov must run over the scratch tree (got ${JSON.stringify(r)})`);
    return existsSync(findings) ? /CKV_GCP_6\b/.test(readFileSync(findings, 'utf8')) : null;
  };
  const MTLS = 'TRUSTED_CLIENT_CERTIFICATE_REQUIRED', OPEN = 'ALLOW_UNENCRYPTED_AND_ENCRYPTED';
  try {
    // the false positive: every environment sets a value the check passes
    if (tree('every-env-safe', { prod: MTLS, staging: MTLS }) !== false) fail(`a variable every environment sets to ${MTLS} is resolved before CKV_GCP_6 judges it, and the check passes`);
    // true positives: every environment unsafe; the environments disagree (never resolved to one of them)
    if (tree('every-env-open', { prod: OPEN, staging: OPEN }) !== true) fail(`a variable every environment sets to ${OPEN} still fails CKV_GCP_6`);
    if (tree('envs-disagree', { prod: MTLS, qa: OPEN }) !== true) fail('a variable the environments set differently stays unresolved and still fails CKV_GCP_6, never read as one environment\'s value');
    // the pinned policy: ENCRYPTED_ONLY, resolved, still fails at checkov 3.4.0
    if (tree('every-env-encrypted-only', { prod: 'ENCRYPTED_ONLY', staging: 'ENCRYPTED_ONLY' }) !== true) fail('at the pinned checkov, CKV_GCP_6 fails ENCRYPTED_ONLY on a non-SQL Server instance; if an upgrade changed that, review this block and #306');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
