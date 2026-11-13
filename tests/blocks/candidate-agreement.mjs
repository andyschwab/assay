// ── descriptor agreement per listed candidate, not per finding (#312, part of #257) ──
// variance keyed an effect channel by the sorted set of candidates its run's triage maps to one
// finding (#298), so three lanes that group the same three listed candidates three ways read as
// channels each seen once, and the per-channel figure measured grouping style more than judgment.
// A listed candidate (a member of the run's map/raw/enumerate.json effect population its triage maps
// to an effect finding) takes that finding's six descriptors, and a candidate every sweep maps is
// compared field by field. A candidate one sweep maps and another triages out of scope or leaves
// untriaged is a scope disagreement, and an effect finding no candidate maps to is counted by slug:
// both apart, never inside the figure. The sweep gate holds SWEEP.yaml's candidate_agreement.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'candidate-agreement';

const A = 'process spawn (js) @ a.mjs', B = 'route: POST /x', C = 'route: PUT /x';

export async function run() {
  const fail = (m) => negFailures.push('candidate-agreement: ' + m);
  const V = await import('../../map/variance.mjs');
  const T = await import('../../map/effect-triage.mjs');
  if (typeof V.candidateAgreement !== 'function' || typeof V.computeCandidateAgreement !== 'function') { fail('map/variance.mjs must export candidateAgreement and computeCandidateAgreement'); return; }
  const eff = (id, channel, o) => ({ id, dimension: 'delegation', subject_type: 'effect',
    polarity: 'fact', observation: 'x', evidence: ['a.mjs:1'], confidence: 'confirmed',
    effect: { channel, reversibility: 'reversible', external: true, gate_type: 'scope-bound',
              fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'user', ...o } });
  const map = (pairs) => pairs.map(([candidate, finding]) => (finding.startsWith('oos:') ? { candidate, out_of_scope: finding.slice(4) } : { candidate, finding }));
  const list = [A, B, C];

  // three sweeps group the same three candidates three ways, descriptors identical per candidate
  const grouped = [
    { findings: [eff('F-1', 'all-three')], candidates: list, triage: map([[A, 'F-1'], [B, 'F-1'], [C, 'F-1']]) },
    { findings: [eff('F-1', 'ab'), eff('F-2', 'c')], candidates: list, triage: map([[A, 'F-1'], [B, 'F-1'], [C, 'F-2']]) },
    { findings: [eff('F-1', 'a'), eff('F-2', 'bc')], candidates: list, triage: map([[A, 'F-1'], [B, 'F-2'], [C, 'F-2']]) },
  ];
  // today's key: every grouping is its own channel, each seen by one sweep (the red case #312 names)
  const perChannel = V.descriptorAgreement(grouped.map((s) => s.findings), grouped.map((s) => T.candidateKeysOf(s.triage)));
  if (perChannel.channels.shared !== 0) fail(`per channel, three groupings of one set of candidates share no channel (got ${perChannel.channels.shared} shared): the per-channel figure reads grouping style`);
  const g = V.candidateAgreement(grouped);
  if (g.candidates.compared !== 3 || g.allFields.agree !== 3 || g.allFields.pct !== 100) fail(`three groupings of the same three candidates with identical descriptors must read 100% over 3 candidates (got ${g.allFields.agree}/${g.candidates.compared}, ${g.allFields.pct}%)`);
  if (g.scope.disagreements !== 0 || g.unmapped.total !== 0) fail(`a grouping difference is neither a scope disagreement nor an unmapped finding (got scope ${g.scope.disagreements}, unmapped ${g.unmapped.total})`);

  // one sweep gives one candidate a different gate_type: that candidate is divergent, naming field and values
  const gt1 = V.candidateAgreement([grouped[0], grouped[1],
    { findings: [eff('F-1', 'a', { gate_type: 'initiated-by-person' }), eff('F-2', 'bc')], candidates: list, triage: map([[A, 'F-1'], [B, 'F-2'], [C, 'F-2']]) }]);
  if (gt1.candidates.compared !== 3 || gt1.allFields.agree !== 2) fail(`one candidate given a different gate_type by one sweep must leave the other two identical (got ${gt1.allFields.agree}/${gt1.candidates.compared})`);
  const dv = gt1.divergences;
  if (dv.length !== 1 || dv[0].candidate !== A) fail(`the divergent candidate must be named (got ${JSON.stringify(dv.map((d) => d.candidate))})`);
  else {
    const f = dv[0].fields;
    if (f.length !== 1 || f[0].field !== 'gate_type') fail(`the divergence must name gate_type alone (got ${JSON.stringify(f.map((x) => x.field))})`);
    else if (f[0].values.map((v) => v.value).join('/') !== 'scope-bound/scope-bound/initiated-by-person') fail(`the divergence must carry each sweep's value (got ${f[0].values.map((v) => v.value).join('/')})`);
  }
  if (gt1.byField.gate_type.agree !== 2 || gt1.byField.gate_type.of !== 3) fail(`per-field agreement is per candidate (gate_type 2/3; got ${gt1.byField.gate_type.agree}/${gt1.byField.gate_type.of})`);
  // direction reads per candidate too: initiated-by-person ranks above scope-bound
  if (gt1.directions.safer !== 1 || gt1.directions.riskier !== 0 || gt1.bothWays) fail(`one divergence that moves safer reads one way (got ${JSON.stringify(gt1.directions)})`);
  const both = V.candidateAgreement([
    { findings: [eff('F-1', 'a'), eff('F-2', 'b', { gate_type: 'none', fail_mode: null })], candidates: [A, B], triage: map([[A, 'F-1'], [B, 'F-2']]) },
    { findings: [eff('F-1', 'a', { gate_type: 'none', fail_mode: null }), eff('F-2', 'b')], candidates: [A, B], triage: map([[A, 'F-1'], [B, 'F-2']]) }]);
  if (!both.bothWays) fail('per-candidate divergences that move both ways must read both-ways (the judgment-drift signature)');

  // a candidate one sweep marks out of scope, or leaves untriaged, is a scope disagreement, never inside agreement
  const sc = V.candidateAgreement([grouped[0], grouped[1],
    { findings: [eff('F-1', 'a'), eff('F-2', 'b')], candidates: list, triage: map([[A, 'F-1'], [B, 'F-2'], [C, 'oos:read-only']]) }]);
  if (sc.candidates.compared !== 2 || sc.allFields.of !== 2 || sc.allFields.pct !== 100) fail(`a candidate one sweep marks out of scope must stay out of the agreement figure (got ${sc.allFields.agree}/${sc.allFields.of})`);
  if (sc.scope.disagreements !== 1 || sc.scope.list[0]?.candidate !== C || sc.scope.list[0]?.statuses.join('/') !== 'mapped/mapped/out-of-scope') fail(`it must be counted as a scope disagreement, naming each sweep's reading (got ${JSON.stringify(sc.scope)})`);
  const un = V.candidateAgreement([grouped[0], { ...grouped[1], triage: map([[A, 'F-1'], [B, 'F-1']]) }]);
  if (un.scope.disagreements !== 1 || un.scope.list[0]?.statuses.join('/') !== 'mapped/untriaged') fail(`a candidate one sweep leaves untriaged while another maps it is a scope disagreement (got ${JSON.stringify(un.scope)})`);
  const oosAll = V.candidateAgreement([
    { findings: [], candidates: [C], triage: map([[C, 'oos:read-only']]) }, { findings: [], candidates: [C], triage: map([[C, 'oos:read-only']]) }]);
  if (oosAll.scope.disagreements !== 0 || oosAll.candidates.outOfScopeEverywhere !== 1 || oosAll.candidates.compared !== 0) fail(`a candidate every sweep marks out of scope agrees on scope and is not compared (got ${JSON.stringify(oosAll.candidates)})`);

  // an effect finding no candidate maps to is counted apart, by slug
  const um = V.candidateAgreement([
    { ...grouped[0], findings: [...grouped[0].findings, eff('F-9', 'Tool-Install')] },
    { ...grouped[1], findings: [...grouped[1].findings, eff('F-9', 'tool-install', { gate_type: 'none', fail_mode: null }), eff('F-8', 'branch-delete')] },
    grouped[2]]);
  if (um.allFields.of !== 3 || um.allFields.pct !== 100) fail(`an effect finding no candidate maps to stays out of the per-candidate figure (got ${um.allFields.agree}/${um.allFields.of})`);
  const slugs = um.unmapped.list.map((u) => `${u.slug}:${u.sweeps.join(',')}`).join(' ');
  if (um.unmapped.total !== 2 || slugs !== 'branch-delete:1 tool-install:0,1') fail(`effect findings no candidate maps to are counted apart by slug, with the sweeps that carry each (got ${slugs})`);

  // a set no sweep lists candidates for is not measured, and a candidate threshold over it is a breach
  const none = V.candidateAgreement([{ findings: [eff('F-1', 'a')], candidates: null, triage: null }, { findings: [eff('F-1', 'a')], candidates: null, triage: null }]);
  if (none.listed || none.candidates.compared !== 0) fail('a set with no candidate list compares no candidate');
  if (typeof V.sweepGate === 'function') {
    const r = { pct: 100 }, d = { allFields: { pct: 100 }, channels: { shared: 1 } };
    if (V.sweepGate(r, d, { candidate_agreement: 100 }, null, g).length) fail('a per-candidate figure at its threshold holds');
    const lo = V.sweepGate(r, d, { candidate_agreement: 100 }, null, gt1);
    if (lo.length !== 1 || !/per-candidate descriptor agreement 67% is below the threshold 100%/.test(lo[0])) fail(`a per-candidate figure below its threshold is a breach naming it (got ${JSON.stringify(lo)})`);
    const nm = V.sweepGate(r, d, { candidate_agreement: 10 }, null, none);
    if (nm.length !== 1 || !/not measured/.test(nm[0])) fail(`a candidate threshold over no compared candidate is a breach, never a pass (got ${JSON.stringify(nm)})`);
    if (V.sweepGate(r, d, { candidate_agreement: 0 }, null, none).length) fail('a candidate threshold of 0 over no list records the set as not measured without a breach');
  }

  // end to end: three run dirs, each with its own list and triage, as a set the CLI gates
  const tmp = join(HERE, 'tmp-candidate-agreement'); rmSync(tmp, { recursive: true, force: true });
  const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), ...args], { encoding: 'utf8' });
  const yamlOf = (fs) => fs.map((f) => `- id: ${f.id}\n  dimension: delegation\n  subject_type: effect\n  polarity: fact\n  observation: x\n  evidence: ["a.mjs:1"]\n  confidence: confirmed\n  effect:\n` +
    Object.entries(f.effect).map(([k, v]) => `    ${k}: ${v === null ? 'null' : v}`).join('\n') + '\n').join('');
  try {
    grouped.forEach((s, i) => {
      const d = join(tmp, `sweep-${i + 1}`);
      mkdirSync(join(d, 'map', 'findings'), { recursive: true });
      mkdirSync(join(d, 'map', 'raw'), { recursive: true });
      writeFileSync(join(d, 'map', 'raw', 'enumerate.json'), JSON.stringify({ schema: 'enumerate', version: 1, target: 't', files: 1,
        populations: { channelCandidates: [], routeHandlers: [{ member: B, evidence: ['a.mjs:2'] }, { member: C, evidence: ['a.mjs:3'] }], effectSites: [{ member: A, evidence: ['a.mjs:1'] }] } }));
      writeFileSync(join(d, 'map', 'effect-triage.yaml'), 'schema: effect-triage\nversion: 1\ntriage:\n' + s.triage.map((e) => `  - candidate: "${e.candidate}"\n    finding: ${e.finding}\n`).join(''));
      writeFileSync(join(d, 'map', 'findings', 'practice-review-delegation.yaml'), yamlOf(s.findings));
    });
    writeFileSync(join(tmp, 'SWEEP.yaml'), 'target: "t"\ntarget_commit: "0"\nmethod_commit: "0"\ndate: "2026-11-13"\nblind: false\nthreshold:\n  fact_presence: 0\n  candidate_agreement: 100\n  descriptor_agreement: 0\n  requirement_agreement: 0\nsweeps: [sweep-1, sweep-2, sweep-3]\n');
    const c = V.computeCandidateAgreement(['sweep-1', 'sweep-2', 'sweep-3'].map((s) => join(tmp, s)));
    if (c.candidates.compared !== 3 || c.allFields.pct !== 100) fail(`the run-dir wrapper must read each run's own list and triage (got ${c.allFields.agree}/${c.candidates.compared})`);
    const j = cli(['--set', tmp, '--json']);
    let out = null; try { out = JSON.parse(j.stdout); } catch { fail(`variance --set --json must print JSON (got ${j.stdout.slice(0, 160)} ${j.stderr.slice(0, 160)})`); }
    if (out) {
      if (!out.candidates || out.candidates.pct !== 100 || out.candidates.compared !== 3) fail(`variance --json must carry candidates { pct, compared } (got ${JSON.stringify(out.candidates)?.slice(0, 160)})`);
      if (!out.descriptors || out.descriptors.shared !== 0) fail(`variance --json keeps the per-channel figure beside it (descriptors.shared 0 here; got ${JSON.stringify(out.descriptors)?.slice(0, 120)})`);
    }
    if (j.status !== 0) fail(`a set at its candidate threshold must hold (exit ${j.status})`);
    const txt = cli(['--set', tmp]).stdout;
    if (!/descriptor agreement per listed candidate \(the primary figure; the gate's candidate_agreement\)/.test(txt)) fail('the printed report must label the per-candidate figure as the one candidate_agreement gates');
    if (!/descriptor agreement per channel \(kept beside the per-candidate figure for one release; the gate's descriptor_agreement\)/.test(txt)) fail('the printed report must label the per-channel figure as kept for one release');
    const red = cli(['--set', tmp, '--min-candidates', '101']);
    if (red.status !== 1 || !/per-candidate descriptor agreement 100% is below the threshold 101%/.test(red.stdout)) fail(`--min-candidates above the measure must exit 1 naming it (got ${red.status})`);
    // a set that states no candidate_agreement is malformed: exit 2, never an ungated pass
    writeFileSync(join(tmp, 'SWEEP.yaml'), readFileSync(join(tmp, 'SWEEP.yaml'), 'utf8').replace(/^\s*candidate_agreement:.*\n/m, ''));
    if (cli(['--set', tmp]).status !== 2) fail('a sweep set with no candidate_agreement threshold must exit 2');
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // every committed set states candidate_agreement and holds it, re-measured under the per-candidate key
  const SWEEPS = join(HERE, 'sweeps');
  const sets = existsSync(SWEEPS) ? readdirSync(SWEEPS).filter((s) => existsSync(join(SWEEPS, s, 'SWEEP.yaml'))) : [];
  if (!sets.length) fail('tests/sweeps/ must carry committed sweep sets');
  for (const s of sets) {
    let set = null;
    try { set = V.loadSweepSet(join(SWEEPS, s)); } catch (e) { fail(`tests/sweeps/${s}/SWEEP.yaml must load (${e.message})`); continue; }
    if (typeof set.threshold.candidate_agreement !== 'number') { fail(`tests/sweeps/${s}/SWEEP.yaml must state threshold.candidate_agreement`); continue; }
    const c = V.computeCandidateAgreement(set.runDirs);
    if (!c.candidates.compared) { if (set.threshold.candidate_agreement > 0) fail(`tests/sweeps/${s}: no candidate is compared, so candidate_agreement must be 0 (got ${set.threshold.candidate_agreement})`); }
    else if (c.allFields.pct < set.threshold.candidate_agreement) fail(`tests/sweeps/${s}: per-candidate agreement ${c.allFields.pct}% is below its threshold ${set.threshold.candidate_agreement}%`);
  }
}
