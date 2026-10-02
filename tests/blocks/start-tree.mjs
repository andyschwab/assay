// ── start --allow-exec over a tree, not a repository (#88) ──
// fresh-clone clones the target's committed head, so a target that is not its
// own repository's top level (an exported tree, or a subdirectory of some other
// checkout) cannot be cloned. start must record fresh-clone skipped with the
// reason, never failed with git's own "repository does not exist" — both for a
// tree in no repository and a tree inside the assay checkout itself.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { scannersPath as runScannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'start-tree';

export async function run() {
  const fail = (m) => negFailures.push('start-tree: ' + m);
  const TREE_REASON = 'target is not a git repository; fresh-clone needs one';
  const outside = mkdtempSync(join(tmpdir(), 'assay-start-tree-'));
  const inside = join(HERE, 'tmp-start-tree'); rmSync(inside, { recursive: true, force: true });
  for (const [label, base] of [['a tree in no repository', outside], ['a subdirectory of another checkout', inside]]) {
    const target = join(base, 'target');
    cpSync(join(HERE, 'instruments', 'fresh-clone-target'), target, { recursive: true });
    const runDir = join(base, 'run');
    let out = '';
    try { out = execFileSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), '--out', runDir, target, '--allow-exec'], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    const rows = existsSync(runScannersPath(runDir)) ? (parseYaml(readFileSync(runScannersPath(runDir), 'utf8')).scanners || {}) : {};
    const fc = rows['fresh-clone'];
    if (fc?.status !== 'skipped' || !String(fc.reason || '').includes(TREE_REASON)) fail(`${label}: start --allow-exec must record fresh-clone skipped with "${TREE_REASON}" (got ${JSON.stringify(fc)})`);
    if (/does not exist|git clone failed/.test(out + JSON.stringify(rows))) fail(`${label}: no bare git clone error may reach the output or the run record (got:\n${out})`);
    if (rows['repo-census']?.status !== 'ran') fail(`${label}: the other instruments still run over a tree (repo-census got ${JSON.stringify(rows['repo-census'])})`);
    if (!/✓ assay validate/.test(out)) fail(`${label}: a start that skipped fresh-clone over a tree must still validate green (got:\n${out})`);
  }
  const helpOut = execFileSync(process.execPath, [join(ROOT, 'assay.mjs'), 'help'], { encoding: 'utf8' });
  if (!/--allow-exec[^\n]*needs a git repository/.test(helpOut)) fail('`assay help` must say, on the start line naming --allow-exec, that fresh-clone needs a git repository');
  rmSync(outside, { recursive: true, force: true });
  rmSync(inside, { recursive: true, force: true });
}
