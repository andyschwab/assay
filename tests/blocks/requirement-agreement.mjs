// ── the third repeatability measure: do the sweeps reach the same verdict on each requirement (#257, #258) ──
// variance measured fact presence and descriptor agreement, never the verdict a reader acts on:
// the October blind set shares facts and still flips d-effects-gated between met and unmet.
// requirementAgreement counts a requirement any sweep decides, agrees when its status is identical
// in all of them, and the sweep gate holds it to SWEEP.yaml's requirement_agreement threshold.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'requirement-agreement';

export async function run() {
  const fail = (m) => negFailures.push('requirement-agreement: ' + m);
  const V = await import('../../map/variance.mjs');
  if (typeof V.requirementAgreement !== 'function' || typeof V.computeRequirementAgreement !== 'function') {
    fail('map/variance.mjs must export requirementAgreement and computeRequirementAgreement');
    return;
  }

  // the pure measure: a requirement no sweep decides is left out; one missing from a sweep reads not-measured there
  const q = V.requirementAgreement([
    [{ id: 'a', status: 'met' }, { id: 'b', status: 'not-measured' }, { id: 'c', status: 'unmet' }, { id: 'd', status: 'mixed' }],
    [{ id: 'a', status: 'unmet' }, { id: 'b', status: 'not-measured' }, { id: 'c', status: 'unmet' }],
  ]);
  if (q.decided !== 3) fail(`a requirement decided by no sweep must be left out, and one decided by any sweep counted (decided 3 of a,c,d; got ${q.decided})`);
  if (q.agree !== 1 || q.pct !== 33) fail(`only c reads identically in both sweeps (1 of 3, 33%; got ${q.agree}, ${q.pct}%)`);
  const ids = q.divergences.map((v) => v.id).sort().join(',');
  if (ids !== 'a,d') fail(`a (met / unmet) and d (mixed / missing) must be the divergences (got ${ids})`);
  const d = q.divergences.find((v) => v.id === 'd');
  if (d && d.statuses.join('/') !== 'mixed/not-measured') fail(`a requirement missing from a sweep reads not-measured there (got ${d.statuses.join('/')})`);
  const none = V.requirementAgreement([[{ id: 'a', status: 'not-measured' }], [{ id: 'a', status: 'not-measured' }]]);
  if (none.decided !== 0 || none.pct !== 0) fail(`no decided requirement must read 0 decided, never 100% (got ${JSON.stringify(none)})`);

  // the gate: below the threshold is a breach naming the measure; nothing decided under a threshold is not a pass
  if (typeof V.sweepGate === 'function') {
    const thr = { requirement_agreement: 50 };
    if (V.sweepGate({ pct: 100 }, { allFields: { pct: 100 }, channels: { shared: 1 } }, thr, { decided: 2, agree: 1, pct: 50 }).length)
      fail('at the requirement threshold the set must hold');
    const lo = V.sweepGate({ pct: 100 }, { allFields: { pct: 100 }, channels: { shared: 1 } }, thr, { decided: 3, agree: 1, pct: 33 });
    if (lo.length !== 1 || !/requirement agreement/.test(lo[0])) fail(`below the requirement threshold must be one breach naming it (got ${JSON.stringify(lo)})`);
    const empty = V.sweepGate({ pct: 100 }, { allFields: { pct: 100 }, channels: { shared: 1 } }, thr, { decided: 0, agree: 0, pct: 0 });
    if (empty.length !== 1 || !/not measured/.test(empty[0])) fail(`no decided requirement under a requirement threshold must be a breach saying so (got ${JSON.stringify(empty)})`);
  }

  // over a real set: the fixture set with one sweep's halt-class effects re-judged as gated flips
  // d-effects-gated in that sweep alone, and the committed threshold turns the set red, naming it
  const SWEEPS = join(HERE, 'sweeps');
  const fx = join(SWEEPS, 'fixture-notesbox');
  const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), ...args], { encoding: 'utf8' });
  const tmp = join(HERE, 'tmp-requirement-agreement');
  rmSync(tmp, { recursive: true, force: true });
  try {
    cpSync(fx, tmp, { recursive: true });
    const del = join(tmp, 'sweep-3', 'map', 'findings', 'practice-review-delegation.yaml');
    const src = readFileSync(del, 'utf8');
    const flipped = src.replace(/^(\s*)gate_type: none$/gm, '$1gate_type: deterministic-halt\n$1fail_mode: closed');
    if (flipped === src) fail('the fixture set\'s sweep-3 must carry an ungated effect for this block to flip');
    writeFileSync(del, flipped);
    const j = cli(['--set', tmp, '--json']);
    let out = null; try { out = JSON.parse(j.stdout); } catch { fail(`variance --set --json must print JSON (got ${j.stdout.slice(0, 160)} ${j.stderr.slice(0, 160)})`); }
    if (out) {
      if (!out.requirements || typeof out.requirements.pct !== 'number') fail(`variance --json must carry requirements.pct (got ${JSON.stringify(out.requirements)})`);
      const div = (out.requirements?.divergences || []).find((v) => v.id === 'd-effects-gated');
      if (!div) fail(`re-judging sweep-3's effects as gated must make d-effects-gated diverge (got ${JSON.stringify(out.requirements?.divergences)})`);
      else if (div.statuses[2] !== 'met' || div.statuses[0] === 'met') fail(`d-effects-gated must read met only in the re-judged sweep (got ${div.statuses.join(' / ')})`);
    }
    if (j.status !== 1) fail(`a set whose requirement agreement falls below its threshold must exit 1 (got ${j.status})`);
    const txt = cli(['--set', tmp]);
    if (!/requirement agreement \d+% is below the threshold/.test(txt.stdout)) fail('the breach must name requirement agreement in the printed gate');
    // a set that states no requirement_agreement threshold is malformed: exit 2, never an ungated pass
    writeFileSync(join(tmp, 'SWEEP.yaml'), readFileSync(join(fx, 'SWEEP.yaml'), 'utf8').replace(/^\s*requirement_agreement:.*\n/m, ''));
    const noThr = cli(['--set', tmp]);
    if (noThr.status !== 2) fail(`a sweep set with no requirement_agreement threshold must exit 2 (got ${noThr.status})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // every committed set states the measure, so none is held to two numbers only
  const sets = existsSync(SWEEPS) ? readdirSync(SWEEPS).filter((s) => existsSync(join(SWEEPS, s, 'SWEEP.yaml'))) : [];
  for (const s of sets) {
    const r = cli(['--set', join(SWEEPS, s), '--json']);
    let o = null; try { o = JSON.parse(r.stdout); } catch { /* sweep-gate reports a set that fails to load */ }
    if (o && typeof o.gate?.threshold?.requirement_agreement !== 'number') fail(`tests/sweeps/${s} must state a requirement_agreement threshold`);
  }
}
