// ── a missing evidence transcript is recorded as absent evidence, end to end (#316) ──
// The fix sequence ranks an owner's evidence file found absent after every observed gap of its
// severity class (views/README.md, "The sequence's order"), reading the finding's
// `evidence_absent` (map/SCHEMA.md §1). The census is where that fact is observed. Pinned, over a
// copy of tests/instruments/signals-target with one malformed transcript added:
//   1. the census's raw check says the transcript is absent (detail.absent) where no file was
//      found, and not where a file was found but fails its shape;
//   2. ingest carries it onto the gap row as evidence_absent: true, written to the run's findings
//      file, and never onto a transcript that is present;
//   3. it is a fact beside the row, never a severity (the row asserts none).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'census-evidence-absent';

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-evidence-absent-'));
  try {
    const target = join(tmp, 'target');
    cpSync(join(HERE, 'instruments', 'signals-target'), target, { recursive: true });
    writeFileSync(join(target, 'ops', 'evidence', 'd-rollback-exercised.md'), 'no frontmatter here\n');
    const raw = join(tmp, 'repo-census.json');
    const c = spawnSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), target, '--out', raw], { encoding: 'utf8' });
    if (![0, 1].includes(c.status)) { fail(`the census runs over the target (exit ${c.status}): ${c.stderr.slice(0, 300)}`); return; }
    const checks = JSON.parse(readFileSync(raw, 'utf8')).checks;
    const check = (n) => checks.find((x) => x.name === n);

    // (1) the raw check
    if (check('evidence-d-backup-restore-exercised')?.detail?.absent !== true) fail(`(1) a transcript no file holds is absent (got ${JSON.stringify(check('evidence-d-backup-restore-exercised')?.detail)})`);
    const present = check('evidence-d-rollback-exercised');
    if (present?.status !== 'gap' || present?.detail?.absent) fail(`(1) a transcript that is present but malformed is a gap that is not absent (got ${present?.status}, ${JSON.stringify(present?.detail)})`);

    // (2) ingest writes it onto the row
    const runDir = join(tmp, 'run');
    mkdirSync(join(runDir, 'map', 'findings'), { recursive: true });
    const i = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'ingest', runDir, '--tool', 'repo-census', '--raw', raw, '--exit', String(c.status)], { encoding: 'utf8' });
    if (i.status !== 0) { fail(`(2) ingest takes the report (exit ${i.status}): ${(i.stderr || i.stdout).slice(0, 300)}`); return; }
    const rows = parseYaml(readFileSync(join(runDir, 'map', 'findings', 'repo-census.yaml'), 'utf8'));
    const row = (cat) => rows.find((r) => r.native_category === cat && r.polarity === 'gap');
    if (row('evidence-d-backup-restore-exercised')?.evidence_absent !== true) fail(`(2) the absent transcript's row carries evidence_absent: true (got ${JSON.stringify(row('evidence-d-backup-restore-exercised'))})`);
    if (row('evidence-d-rollback-exercised')?.evidence_absent !== undefined) fail('(2) a present transcript\'s gap carries no evidence_absent');

    // (3) never a severity
    if (rows.some((r) => 'severity' in r)) fail('(3) a census row asserts no severity');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
