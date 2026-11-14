// ── a sweep's cost is what its run record says, never an estimate (#324) ──
// A measurement that saves sessions has to show the saving measured, not assumed: variance prints
// each sweep's cost as its run record has it (map/scanners.yaml, the `spend:` and `duration:` of the
// scanner that ran, map/SCHEMA.md §5a), and a sweep whose record carries neither reads "not
// recorded", with no figure put in its place.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'sweep-cost';

export async function run() {
  const fail = (m) => negFailures.push('sweep-cost: ' + m);
  const V = await import('../../map/variance.mjs');
  if (typeof V.sweepCost !== 'function') { fail('map/variance.mjs must export sweepCost'); return; }

  // the pure half: a recorded field copied as written, an absent one absent
  const got = V.sweepCost([
    { scanners: { 'practice-review': { status: 'ran', spend: 'USD 6.22 (child session)', duration: 'about 8m' }, gitleaks: { status: 'skipped', reason: 'r' } } },
    { scanners: { 'practice-review': { status: 'ran', duration: '41s' } } },
    { scanners: { 'practice-review': { status: 'ran', model: 'm' } } },
    null,
  ], ['a', 'b', 'c', 'd']);
  const want = [
    { sweep: 'a', scanners: [{ scanner: 'practice-review', spend: 'USD 6.22 (child session)', duration: 'about 8m' }] },
    { sweep: 'b', scanners: [{ scanner: 'practice-review', duration: '41s' }] },
    { sweep: 'c', scanners: [] },
    { sweep: 'd', scanners: [] },
  ];
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`sweepCost must copy each recorded spend and duration and invent none (got ${JSON.stringify(got)})`);

  // the command, over a copy of the fixture set: one sweep's record carries a cost, the others none
  const set = join(HERE, 'tmp-sweep-cost');
  rmSync(set, { recursive: true, force: true });
  try {
    cpSync(join(HERE, 'sweeps', 'fixture-notesbox'), set, { recursive: true });
    const rec = join(set, 'sweep-1', 'map', 'scanners.yaml');
    const text = readFileSync(rec, 'utf8');
    if (!text.includes('    model: "fixture-authored"\n')) { fail('the fixture sweep record moved: re-pin this block'); return; }
    writeFileSync(rec, text.replace('    model: "fixture-authored"\n', '    model: "fixture-authored"\n    spend: "41k tokens"\n    duration: "4m10s"\n'));
    const cli = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'variance', '--set', set, ...a], { encoding: 'utf8' });
    const t = cli();
    if (t.status !== 0) fail(`the fixture set with a cost recorded must still hold its threshold (exit ${t.status})`);
    if (!/sweep-1: practice-review, spend 41k tokens, duration 4m10s/.test(t.stdout)) fail(`variance --set must print a recorded cost as written (got ${t.stdout.split('\n').filter((l) => /sweep-1:/.test(l)).join(' | ')})`);
    for (const s of ['sweep-2', 'sweep-3']) {
      const line = t.stdout.split('\n').find((l) => l.trim().startsWith(`${s}:`)) || '';
      if (!/: not recorded$/.test(line)) fail(`a sweep whose record carries no cost must read "not recorded", nothing else (got ${JSON.stringify(line)})`);
    }
    const j = cli('--json');
    let out = null; try { out = JSON.parse(j.stdout); } catch { fail('variance --set --json must print JSON'); }
    if (out) {
      const by = Object.fromEntries((out.cost || []).map((c) => [c.sweep, c]));
      if (JSON.stringify(by['sweep-1']) !== JSON.stringify({ sweep: 'sweep-1', scanners: [{ scanner: 'practice-review', spend: '41k tokens', duration: '4m10s' }] })) fail(`--json cost must carry sweep-1's recorded cost (got ${JSON.stringify(by['sweep-1'])})`);
      if (!by['sweep-2'] || by['sweep-2'].scanners.length) fail(`--json cost must carry no figure for a sweep whose record has none (got ${JSON.stringify(by['sweep-2'])})`);
    }
  } finally {
    rmSync(set, { recursive: true, force: true });
  }
}
