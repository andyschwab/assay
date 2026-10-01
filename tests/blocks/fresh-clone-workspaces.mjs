// ── fresh-clone workspaces ──────────────
// The public fixture is a real monorepo's shape: a root that is a bare npm-workspaces shell
// (workspaces: ["apps/*"], no scripts, no dependencies, no lockfile of its own) with
// apps/good (passes) and apps/bad (fails offline and deterministically — a failing
// build script standing in for the real npm-ci EUSAGE a clean workspace clone hits
// when the workspace carries its own lockfile but the root has none; see the
// fixture's package.json for why). The runner must record the root as not-declared
// across the board, run each workspace's own plan in its own directory, and read
// exit 1 from apps/bad's failure alone. The converter must turn that into per-
// workspace rows with prefixed native_ids and workspace-relative evidence, and an
// older (pre-workspaces) document with no `workspaces` key must still convert exactly as
// it always has.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'fresh-clone-workspaces';

export async function run() {
  const fail = (m) => negFailures.push('fresh-clone-workspaces: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-monorepo');
  const tmp = join(HERE, 'tmp-fresh-clone-ws'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'fresh-clone.json');
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'fresh-clone.mjs'), fx, '--no-clone', '--out', out, '--timeout', '60'], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the monorepo fixture must exit 1 (apps/bad's build fails; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    if (doc.exit !== 1) fail(`document exit must be 1 (got ${doc.exit})`);
    if (!Array.isArray(doc.workspaces) || doc.workspaces.length !== 2) fail(`document must carry two workspaces (got ${doc.workspaces?.length})`);
    if (doc.steps.some((s) => s.status !== 'not-declared')) fail(`the root (a bare workspaces shell) must read every step not-declared (got ${JSON.stringify(doc.steps.map((s) => s.status))})`);
    const byPath = Object.fromEntries((doc.workspaces || []).map((w) => [w.path, w]));
    const good = byPath['apps/good'], bad = byPath['apps/bad'];
    if (!good || !bad) fail(`workspaces must be apps/good and apps/bad (got ${Object.keys(byPath).join(', ')})`);
    if (good) {
      const st = Object.fromEntries(good.steps.map((s) => [s.name, s.status]));
      if (st.build !== 'passed' || st.test !== 'passed') fail(`apps/good must pass build and test (got build ${st.build}, test ${st.test})`);
    }
    if (bad) {
      const st = Object.fromEntries(bad.steps.map((s) => [s.name, s.status]));
      if (st.build !== 'failed') fail(`apps/bad must read its failure — build failed (got ${st.build})`);
    }
    // convert: rows for both workspaces, prefixed native_ids, workspace-relative evidence
    const rows = convert('fresh-clone', raw, 1);
    const wsRows = rows.filter((r) => r.native_id.startsWith('apps/'));
    if (!wsRows.length) fail('convert must emit rows for the workspaces, not only the root');
    const badBuild = rows.find((r) => r.native_id === 'apps/bad:build:failed');
    if (!badBuild) fail(`convert must emit a row native_id apps/bad:build:failed (got ${rows.map((r) => r.native_id).join(', ')})`);
    if (badBuild && (badBuild.native_category !== 'build' || badBuild.evidence[0] !== 'apps/bad/package.json:1')) fail(`the workspace build row must keep native_category build (for the adapter map) and cite apps/bad/package.json:1 (got ${badBuild.native_category} / ${badBuild.evidence[0]})`);
    if (badBuild && !/workspace apps\/bad/.test(badBuild.observation)) fail('the workspace row observation must name the workspace');
    if (rows.some((r) => r.native_id.startsWith('apps/good:') && !['lint', 'typecheck', 'no-database-signal'].includes(r.native_category))) fail('apps/good must yield gap rows only for its not-declared floor steps (lint, typecheck) plus its own no-database-signal fact, never for its passing build/test');
    // every category still maps (no rogue category is introduced by the workspace prefix)
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`workspace rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    // an older document with no `workspaces` key at all still converts exactly as before
    const oldShape = { ...doc }; delete oldShape.workspaces;
    const oldRows = convert('fresh-clone', JSON.stringify(oldShape), 1);
    if (oldRows.some((r) => r.native_id.startsWith('apps/'))) fail('a document with no workspaces key must convert with no workspace rows');
    const rootOnly = rows.filter((r) => !r.native_id.startsWith('apps/'));
    if (JSON.stringify(oldRows) !== JSON.stringify(rootOnly)) fail('a document with no workspaces key must convert its root rows exactly as a document with an empty workspaces list does');
    // a workspace entry missing its steps[] halts (fail loud, never empty)
    let threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: [{ path: 'apps/bad', readme_claims: [] }] }), 1); } catch { threw = true; }
    if (!threw) fail('a workspace entry with no steps[] must halt');
    threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: [{ ...bad, steps: bad.steps.filter((s) => s.name !== 'test') }] }), 1); } catch { threw = true; }
    if (!threw) fail('a workspace entry missing a step row must halt');
    threw = false;
    try { convert('fresh-clone', JSON.stringify({ ...doc, workspaces: 'apps/bad' }), 1); } catch { threw = true; }
    if (!threw) fail('a workspaces value that is not a list must halt');
  }
  rmSync(tmp, { recursive: true, force: true });
}
