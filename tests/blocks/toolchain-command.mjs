// ── toolchain-command: a checkout's toolchain family, read without executing it (#236) ──
// A consumer dispatches the fresh-clone measurement to a machine of its own and needs the
// toolchain family of a run drawn without --allow-exec; it imported map/fresh-clone.mjs's
// detectToolchain for it. Pinned: `assay toolchain <checkout> --json` prints
// { toolchain } exactly as detectToolchain reads it; it executes nothing (a package.json
// whose scripts would write a marker leaves none); a path that is not a directory exits 2.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'toolchain-command';

const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });

export async function run() {
  const fail = (m) => negFailures.push('toolchain-command: ' + m);
  const { detectToolchain } = await import('../../map/fresh-clone.mjs');
  const tmp = join(HERE, 'tmp-toolchain-command');
  rmSync(tmp, { recursive: true, force: true });
  try {
    const node = join(tmp, 'node'), go = join(tmp, 'go'), bare = join(tmp, 'bare');
    for (const d of [node, go, bare]) mkdirSync(d, { recursive: true });
    const marker = join(tmp, 'ran');
    writeFileSync(join(node, 'package.json'), JSON.stringify({ name: 'x', scripts: { preinstall: `node -e "require('fs').writeFileSync('${marker}','')"`, test: 'true' }, dependencies: { pg: '1' } }));
    writeFileSync(join(node, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(join(go, 'go.mod'), 'module x\n');
    const read = (dir) => {
      const r = assay(['toolchain', dir, '--json']);
      if (r.status !== 0) { fail(`toolchain --json ${dir.slice(tmp.length + 1)} must exit 0 (got ${r.status}: ${r.stderr.trim()})`); return null; }
      try { return JSON.parse(r.stdout); } catch (e) { fail(`toolchain --json must print JSON (${e.message})`); return null; }
    };
    for (const [dir, family] of [[node, 'node'], [go, 'go'], [bare, 'none']]) {
      const got = read(dir);
      if (!got) continue;
      const want = detectToolchain(dir).toolchain;
      if (JSON.stringify(got.toolchain) !== JSON.stringify(want)) fail(`toolchain --json must print detectToolchain's toolchain for ${family}:\n want ${JSON.stringify(want)}\n got  ${JSON.stringify(got.toolchain)}`);
      if (got.toolchain && got.toolchain.family !== family) fail(`the ${family} tree must read family ${family} (got ${got.toolchain.family})`);
    }
    const n = read(node);
    if (n && (n.toolchain.package_manager !== 'pnpm' || !n.toolchain.database_signals.includes('dep:pg'))) fail(`the node tree must read pnpm with its database signal (got ${JSON.stringify(n.toolchain)})`);
    if (existsSync(marker)) fail('toolchain executed the target: its package.json script wrote a marker');
    const t = assay(['toolchain', node]);
    if (t.status !== 0 || !/\bnode\b/.test(t.stdout) || !/\bpnpm\b/.test(t.stdout)) fail(`toolchain (text) must name the family and the package manager (got ${t.status}: ${t.stdout})`);
    const missing = assay(['toolchain', join(tmp, 'nope'), '--json']);
    if (missing.status !== 2 || missing.stdout.trim()) fail(`a checkout that is not there must exit 2 and print nothing (got ${missing.status})`);
    const none = assay(['toolchain']);
    if (none.status !== 2) fail(`toolchain with no checkout must exit 2 (got ${none.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
