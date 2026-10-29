// ── the pinned external tools install checksum-verified, and a pin behind upstream is said (#189) ──
// map/tools.mjs reads each adopted adapter's tool: block and nothing else (rule 7).
//   (a) an archive whose sum matches is installed, its member executable, the stamp written;
//   (b) a second install of the same pin downloads nothing;
//   (c) a download whose sum differs is refused, naming both sums, and nothing is installed;
//   (d) a platform with no pinned artifact reads unsupported, never installed;
//   (e) every adopted adapter that runs an external binary pins it in a well-formed tool:
//       block, at its verified_against where it has one;
//   (f) check reads a newer upstream as behind, and an unreadable one as unknown, never current;
//   (g) the gitleaks CI installs is the adapter's pin: one version and one sum, never two.
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { installTool, pinnedTools, toolBlockProblems, checkTools } from '../../map/tools.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'tools';

export async function run() {
  const fail = (m) => negFailures.push('tools: ' + m);
  const tmp = join(HERE, 'tmp-tools'); rmSync(tmp, { recursive: true, force: true });
  const src = join(tmp, 'src'), bin = join(tmp, 'bin'); mkdirSync(join(src, 'pkg', 'scripts'), { recursive: true });
  try {
    writeFileSync(join(src, 'faketool'), '#!/bin/sh\necho faketool 1.0.0\n');
    writeFileSync(join(src, 'pkg', 'scripts', 'otherfake'), '#!/bin/sh\necho otherfake 2.0.0\n');
    spawnSync('tar', ['-czf', join(tmp, 'faketool.tar.gz'), '-C', src, 'faketool']);
    spawnSync('sh', ['-c', `cd ${src} && zip -q -r ${join(tmp, 'otherfake.whl')} pkg`]);
    const sum = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
    let downloads = 0;
    const fetch = (url, dest) => { downloads++; copyFileSync(join(tmp, url.split('/').pop()), dest); };
    const tar = { scanner: 'fake', bin: 'faketool', version: '1.0.0', upstream: 'github:example/faketool',
      fetch: { 'linux-x64': { url: 'https://example.invalid/faketool.tar.gz', sha256: sum(join(tmp, 'faketool.tar.gz')), member: 'faketool' } } };
    // (a)
    const a = installTool(tar, bin, { platform: 'linux-x64', fetch });
    if (a.status !== 'installed' || !existsSync(join(bin, 'faketool')) || !(statSync(join(bin, 'faketool')).mode & 0o111)) fail(`(a) a matching archive installs its member, executable (got ${JSON.stringify(a)})`);
    const stamp = JSON.parse(readFileSync(join(bin, '.assay-tools.json'), 'utf8'));
    if (stamp.faketool?.version !== '1.0.0' || !/^[0-9a-f]{64}$/.test(stamp.faketool?.sha256 || '')) fail('(a) the stamp records the version and the installed sum');
    const whl = { scanner: 'other', bin: 'otherfake', version: '2.0.0', upstream: 'pypi:otherfake',
      fetch: { 'linux-x64': { url: 'https://example.invalid/otherfake.whl', sha256: sum(join(tmp, 'otherfake.whl')), member: 'pkg/scripts/otherfake' } } };
    const w = installTool(whl, bin, { platform: 'linux-x64', fetch });
    if (w.status !== 'installed' || readFileSync(join(bin, 'otherfake'), 'utf8') !== readFileSync(join(src, 'pkg', 'scripts', 'otherfake'), 'utf8')) fail(`(a) a wheel's member is installed byte for byte (got ${JSON.stringify(w)})`);
    // (b)
    const before = downloads;
    const b = installTool(tar, bin, { platform: 'linux-x64', fetch });
    if (b.status !== 'current' || downloads !== before) fail(`(b) the same pin again downloads nothing (got ${b.status}, ${downloads - before} download(s))`);
    // (c)
    const bad = { ...tar, bin: 'badtool', fetch: { 'linux-x64': { ...tar.fetch['linux-x64'], sha256: '0'.repeat(64) } } };
    const c = installTool(bad, bin, { platform: 'linux-x64', fetch });
    if (c.status !== 'failed' || !c.detail.includes('0'.repeat(64)) || !c.detail.includes(tar.fetch['linux-x64'].sha256) || existsSync(join(bin, 'badtool'))) fail(`(c) a sum mismatch is refused naming both sums, nothing installed (got ${JSON.stringify(c)})`);
    // (d)
    const d = installTool(tar, join(tmp, 'bin2'), { platform: 'plan9-mips', fetch });
    if (d.status !== 'unsupported' || existsSync(join(tmp, 'bin2', 'faketool'))) fail(`(d) a platform with no artifact is unsupported (got ${JSON.stringify(d)})`);
    // (e)
    const adapters = loadAdapters();
    const pinned = new Map(pinnedTools(adapters).map((t) => [t.scanner, t]));
    for (const [id, ad] of Object.entries(adapters)) {
      if (ad.adopted === false || ad.retired) continue;
      if (ad.run?.bin && !pinned.has(id)) fail(`(e) ${id} runs ${ad.run.bin} but pins no tool: block`);
    }
    if (!pinned.has('gitleaks')) fail('(e) gitleaks, an external binary start runs, pins a tool: block');
    for (const t of pinned.values()) for (const p of toolBlockProblems(t)) fail(`(e) ${t.scanner}: ${p}`);
    if (!toolBlockProblems({ ...tar, verified: '0.9.0' }).some((p) => /verified_against/.test(p))) fail('(e) a pin that is not the verified version is a problem');
    // (f)
    const rows = checkTools([tar, whl], (t) => (t.bin === 'faketool' ? { latest: '1.1.0' } : { latest: null, why: 'unreadable' }));
    if (rows[0].status !== 'behind' || rows[1].status !== 'unknown') fail(`(f) a newer upstream is behind and an unreadable one unknown (got ${rows.map((r) => r.status).join(', ')})`);
    // (g)
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const ciVersion = (ci.match(/GITLEAKS_VERSION:\s*'([^']+)'/) || [])[1], ciSum = (ci.match(/GITLEAKS_SHA256:\s*'([0-9a-f]{64})'/) || [])[1];
    const gl = pinned.get('gitleaks');
    if (!gl || ciVersion !== String(gl.version) || ciSum !== gl.fetch?.['linux-x64']?.sha256) fail(`(g) ci.yml installs gitleaks ${ciVersion} (${ciSum}); the adapter pins ${gl?.version} (${gl?.fetch?.['linux-x64']?.sha256})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
