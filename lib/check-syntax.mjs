// check-syntax.mjs — the engine's syntax gate (`npm run lint`, `npm run build`):
// `node --check` over every tracked engine module, failing on the first module
// Node cannot parse. Fixture targets under tests/*/ are known-answer targets,
// some with deliberately broken files, never engine code, so they are skipped;
// tests/blocks/ is the harness's own code (#87), so it is checked.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '*.mjs', '*.js', '*.cjs'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((f) => f && !/^tests\/(?!blocks\/)[^/]+\//.test(f));
if (!files.length) { console.error('check-syntax: git ls-files found no modules — refusing to read that as clean'); process.exit(1); }
const bad = files.filter((f) => spawnSync(process.execPath, ['--check', f], { cwd: ROOT, stdio: 'inherit' }).status !== 0);
if (bad.length) { console.error(`check-syntax: ${bad.length} of ${files.length} module(s) do not parse: ${bad.join(', ')}`); process.exit(1); }
console.log(`check-syntax: ${files.length} module(s) parse`);
