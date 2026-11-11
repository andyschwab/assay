// ── lane-list: the lanes and the built-in passes, read by a command (#236) ──
// A consumer's tests listed the review lanes and the practice-review passes by importing
// map/lane.mjs and map/project.mjs. Pinned: `assay lane --list --json` prints
// { lanes: [{ scanner, lane, outputs, inputs, passes }] }, one per lane lanes() finds; the
// practice-review lane's passes are the built-in scanner's passes, in order, and every other
// lane's are empty; a lane's seed JSON carries the same passes; the text form names each lane.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-list';

const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });

export async function run() {
  const fail = (m) => negFailures.push('lane-list: ' + m);
  const { lanes } = await import('../../map/lane.mjs');
  const { PRACTICE_REVIEW_PASSES } = await import('../../map/project.mjs');
  const passes = Object.keys(PRACTICE_REVIEW_PASSES);
  const want = lanes().map((l) => l.scanner).sort();
  const r = assay(['lane', '--list', '--json']);
  let doc = null;
  if (r.status !== 0) fail(`lane --list --json must exit 0 (got ${r.status}: ${r.stderr.trim().split('\n')[0]})`);
  else { try { doc = JSON.parse(r.stdout); } catch (e) { fail(`lane --list --json must print JSON (${e.message})`); } }
  if (doc) {
    const got = (doc.lanes || []).map((l) => l.scanner).sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`lane --list must list every lane (${want.join(', ')}), got ${got.join(', ')}`);
    for (const l of doc.lanes || []) {
      for (const k of ['lane', 'outputs', 'inputs', 'passes']) if (l[k] === undefined) fail(`lane ${l.scanner} must carry ${k}`);
      if (!Array.isArray(l.outputs) || !Array.isArray(l.inputs) || !Array.isArray(l.passes)) fail(`lane ${l.scanner}: outputs, inputs and passes must be lists`);
      const wantPasses = l.scanner === 'practice-review' ? passes : [];
      if (JSON.stringify(l.passes) !== JSON.stringify(wantPasses)) fail(`lane ${l.scanner} must carry passes ${JSON.stringify(wantPasses)}, got ${JSON.stringify(l.passes)}`);
    }
    if (!(doc.lanes || []).some((l) => l.scanner === 'practice-review')) fail('the practice-review lane must be listed');
  }
  const seed = assay(['lane', 'practice-review', '--name', 'Example', '--assay', 'v0.0.0', '--date', '2026-01-01', '--inputs-dir', 'the-run']);
  let s = null;
  try { s = JSON.parse(seed.stdout); } catch { /* read below */ }
  if (seed.status !== 0 || !s || JSON.stringify(s.passes) !== JSON.stringify(passes)) fail(`the practice-review seed must carry its passes ${JSON.stringify(passes)} (got ${seed.status}: ${JSON.stringify(s && s.passes)})`);
  const t = assay(['lane', '--list']);
  if (t.status !== 0 || want.some((id) => !t.stdout.includes(id))) fail(`lane --list (text) must name every lane (got ${t.status}: ${t.stdout})`);
}
