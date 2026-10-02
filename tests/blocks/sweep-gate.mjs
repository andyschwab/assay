// ── the repeatability gate: a committed sweep set, a threshold variance enforces (#57, F-324, F-517) ──
// variance printed its measures and exited 0 at any agreement level, and no sweep set was
// committed, so the agreement figures the docs cite could not be reproduced from the tree.
// Every set under tests/sweeps/ is gated here at its own SWEEP.yaml threshold; the fixture
// set proves the gate can go red.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'sweep-gate';

export async function run() {
  const fail = (m) => negFailures.push('sweep-gate: ' + m);
  const V = await import('../../map/variance.mjs');
  if (typeof V.loadSweepSet !== 'function' || typeof V.sweepGate !== 'function') fail('map/variance.mjs must export loadSweepSet and sweepGate');
  const SWEEPS = join(HERE, 'sweeps');
  const sets = existsSync(SWEEPS) ? readdirSync(SWEEPS).filter((d) => existsSync(join(SWEEPS, d, 'SWEEP.yaml'))) : [];
  if (!sets.includes('fixture-notesbox')) fail('tests/sweeps/fixture-notesbox/ (the fixture-sized sweep set that exercises the gate) must be committed');
  const varianceCli = (args) => spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), ...args], { encoding: 'utf8' });
  // every committed set passes at its own threshold, and every one of its sweeps is a valid map
  for (const s of sets) {
    const r = varianceCli(['--set', join(SWEEPS, s)]);
    if (r.status !== 0) fail(`tests/sweeps/${s} must pass its own threshold (exit ${r.status}): ${(r.stdout + r.stderr).split('\n').filter((l) => /below|threshold|✗/.test(l)).join(' | ')}`);
    let set = null;
    try { set = V.loadSweepSet(join(SWEEPS, s)); } catch (e) { fail(`tests/sweeps/${s}/SWEEP.yaml must load (${e.message})`); }
    for (const d of (set ? set.runDirs : [])) {
      const v = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), d], { encoding: 'utf8' });
      if (v.status !== 0) fail(`tests/sweeps/${s}: sweep ${d.slice(SWEEPS.length + 1)} must validate (${String(v.stderr).split('\n').slice(0, 3).join(' | ')})`);
    }
  }
  const fx = join(SWEEPS, 'fixture-notesbox');
  if (existsSync(join(fx, 'SWEEP.yaml'))) {
    const j = varianceCli(['--set', fx, '--json']);
    let out = null; try { out = JSON.parse(j.stdout); } catch { fail(`variance --set --json must print JSON (got ${j.stdout.slice(0, 120)})`); }
    if (out) {
      if (!out.gate || !out.gate.threshold || !Array.isArray(out.gate.breaches)) fail(`variance --set --json must carry gate.threshold and gate.breaches (got ${JSON.stringify(out.gate)})`);
      if (out.pct === 100 || out.descriptors?.pct === 100) fail('the fixture set must carry real variance on both measures (a 100% set cannot show the gate reading the number)');
      // one point above the measured value on either measure turns the same set red
      const facts = varianceCli(['--set', fx, '--min-facts', String(out.pct + 1)]);
      if (facts.status !== 1) fail(`variance must exit 1 when fact presence (${out.pct}%) is below the threshold (got ${facts.status})`);
      if (!/fact presence/i.test(facts.stdout + facts.stderr)) fail('a fact-presence breach must name the measure it failed');
      const desc = varianceCli(['--set', fx, '--min-descriptors', String((out.descriptors?.pct ?? 0) + 1)]);
      if (desc.status !== 1) fail(`variance must exit 1 when descriptor agreement is below the threshold (got ${desc.status})`);
      if (!/descriptor agreement/i.test(desc.stdout + desc.stderr)) fail('a descriptor-agreement breach must name the measure it failed');
    }
    // a set with no threshold is malformed: fail loud (exit 2), never an ungated pass
    const tmp = join(HERE, 'tmp-sweep-gate'); rmSync(tmp, { recursive: true, force: true });
    cpSync(fx, tmp, { recursive: true });
    writeFileSync(join(tmp, 'SWEEP.yaml'), readFileSync(join(fx, 'SWEEP.yaml'), 'utf8').replace(/^threshold:[\s\S]*?(?=^\S)/m, ''));
    const noThr = varianceCli(['--set', tmp]);
    if (noThr.status !== 2) fail(`a sweep set with no threshold must exit 2 (got ${noThr.status})`);
    rmSync(tmp, { recursive: true, force: true });
  }
  // the pure gate: a measure below its threshold is a breach naming it; no shared channel is not a pass
  if (typeof V.sweepGate === 'function') {
    const thr = { fact_presence: 80, descriptor_agreement: 50 };
    const ok = V.sweepGate({ pct: 80 }, { allFields: { pct: 50 }, channels: { shared: 2 } }, thr);
    if (ok.length) fail(`at the threshold must pass (got ${JSON.stringify(ok)})`);
    const lo = V.sweepGate({ pct: 79 }, { allFields: { pct: 49 }, channels: { shared: 2 } }, thr);
    if (lo.length !== 2) fail(`below both thresholds must give two breaches (got ${JSON.stringify(lo)})`);
    const none = V.sweepGate({ pct: 90 }, { allFields: { pct: 0 }, channels: { shared: 0 } }, thr);
    if (none.length !== 1 || !/no shared/.test(none[0])) fail(`no shared channel under a descriptor threshold must be a breach saying so (got ${JSON.stringify(none)})`);
  }
}
