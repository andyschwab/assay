// ── the run record's read-modify-write is locked (#53, F-613) ──────────────────
// `record` and `ingest` each read map/scanners.yaml, edit one row and write it back; two
// writers interleaving lose a row. A lock file beside it (scanners.yaml.lock) guards the
// whole read-modify-write. Pinned: four processes each adding fifty rows lose none; a
// record and an ingest started while the lock is held write nothing until it is released,
// then write their row.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'run-record-lock';

export async function run() {
  const fail = (m) => negFailures.push('run-record-lock: ' + m);
  const rec = await import('../../map/record.mjs');
  const tmp = join(HERE, 'tmp-run-record-lock'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'map'), { recursive: true });
  const mPath = join(tmp, 'map', 'scanners.yaml');
  const lockFile = mPath + '.lock';
  writeFileSync(mPath, 'engine: x\nscanners:\n  repo-eval:\n    status: skipped\n    reason: "not yet run: ingesting its report records it ran"\n  gitleaks:\n    status: skipped\n    reason: "not yet run: ingesting its report records it ran"\n');
  if (typeof rec.updateRunRecord !== 'function') fail('map/record.mjs must export updateRunRecord(path, edit), the locked read-modify-write both record and ingest use');
  else {
    const writer = join(tmp, 'writer.mjs');
    writeFileSync(writer, `import { updateRunRecord, setScannerRow } from ${JSON.stringify(join(ROOT, 'map', 'record.mjs'))};\n`
      + 'const [p, k] = process.argv.slice(2);\n'
      + "for (let i = 0; i < 50; i++) updateRunRecord(p, (t) => setScannerRow(t, `w${k}-${i}`, 'skipped', { reason: 'r' }).text);\n");
    const { spawn } = await import('node:child_process');
    const exited = (c) => new Promise((res) => c.on('close', (code) => res(code)));
    const codes = await Promise.all([0, 1, 2, 3].map((k) => exited(spawn(process.execPath, [writer, mPath, String(k)], { stdio: 'ignore' }))));
    if (codes.some((c) => c !== 0)) fail(`every concurrent writer must exit 0 (got ${codes.join(', ')})`);
    const rows = Object.keys(parseYaml(readFileSync(mPath, 'utf8')).scanners || {}).filter((id) => id.startsWith('w'));
    if (rows.length !== 200) fail(`four writers adding fifty rows each must leave 200 rows, none lost (got ${rows.length})`);
    if (existsSync(lockFile)) fail('the lock file must be removed once the last writer is done');

    // a held lock: record and ingest both wait for it, then write
    for (const [label, args, check] of [
      ['record', [join(ROOT, 'map', 'record.mjs'), tmp, 'repo-eval', 'ran'], (d) => d.scanners?.['repo-eval']?.status === 'ran'],
      ['ingest', [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1'], (d) => d.scanners?.gitleaks?.status === 'ran'],
    ]) {
      writeFileSync(lockFile, 'held by the harness\n');
      const before = readFileSync(mPath, 'utf8');
      const child = spawn(process.execPath, /** @type {string[]} */ (args), { stdio: 'ignore' });
      const done = exited(child);
      await new Promise((res) => setTimeout(res, 1500));
      if (readFileSync(mPath, 'utf8') !== before) fail(`${label} must not write map/scanners.yaml while another writer holds the lock`);
      rmSync(lockFile, { force: true });
      const code = await done;
      if (code !== 0) fail(`${label} must finish once the lock is released (exit ${code})`);
      if (!check(parseYaml(readFileSync(mPath, 'utf8')))) fail(`${label} must write its row once the lock is released`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
}
