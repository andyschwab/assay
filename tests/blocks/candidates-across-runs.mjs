// ── candidates tallied across runs: two independent targets propose, one holds, and the saturation series (#265, D2+D3 of #257) ──
// `node assay.mjs candidates <run> …` reads each run's candidates through D1's one function
// (views/improve/candidates.mjs buildCandidates), so a measured run counts before compile has
// written its candidates.yaml. A target is the run's own `identity:` (map/SCHEMA.md §5a).
// Pinned, over the fixture runs in tests/candidates-runs/ (measured in a scratch copy):
//  1. over runs on two targets that share one property, that property is proposed and the
//     others held; the targets, findings and first run are each property's own; proposing
//     never edits the yardstick, and the output says promotion is a reviewed change;
//  2. two runs of one target (the same repository over https and ssh) never count as two
//     targets: over those two alone nothing is proposed;
//  3. the saturation series: runs in the date each records (never the order given, never the
//     file system's), each with the properties it adds; printed, and the same under --json;
//  4. findings naming no property are counted as unnamed, never as one property;
//  5. a run that states no target is refused, naming identity:, and nothing is tallied;
//     --target and --date state them for a stored run; a --target that contradicts the
//     run's own identity is refused; an unmeasured run is refused, naming measure.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidatesDataPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'candidates-across-runs';

export async function run() {
  const fail = (m) => negFailures.push('candidates-across-runs: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-candidates-across-'));
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8', cwd: tmp });
  const yardstickBefore = readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8');
  try {
    cpSync(join(HERE, 'candidates-runs'), tmp, { recursive: true });
    // (5) an unmeasured run is refused, naming measure: candidates are read after measuring
    const un = assay('candidates', 'alpha-1', 'beta-1');
    if (un.status === 0 || !/alpha-1: has no yardstick\.yaml: measure it first/.test(un.stderr)) fail(`an unmeasured run must be refused, naming measure (exit ${un.status}): ${un.stderr.trim()}`);
    for (const r of ['alpha-1', 'alpha-2', 'beta-1', 'unstated']) {
      const m = assay('measure', r, '--write');
      if (m.status !== 0) { fail(`measure ${r} must succeed (exit ${m.status}): ${(m.stdout + m.stderr).trim().split('\n').slice(-3).join(' | ')}`); return; }
      if (existsSync(candidatesDataPath(join(tmp, r)))) fail(`${r} has no compile yet: the tally must not lean on a written candidates.yaml`);
    }

    // (1)+(3)+(4) the tally, runs given out of date order
    const j = assay('candidates', 'beta-1', 'alpha-2', 'alpha-1', '--json');
    if (j.status !== 0) { fail(`the tally over three stated, measured runs must succeed (exit ${j.status}): ${j.stderr.trim()}`); return; }
    const doc = JSON.parse(j.stdout);
    const prop = (n) => (doc.properties || []).find((p) => p.property === n);
    const proposed = doc.properties.filter((p) => p.status === 'proposed').map((p) => p.property).join(',');
    const held = doc.properties.filter((p) => p.status === 'held').map((p) => p.property).sort().join(',');
    if (proposed !== 'release-signing') fail(`release-signing, on alpha and beta, is the one proposed property (got proposed: ${proposed})`);
    if (held !== 'audit-log-retained,backup-push,changelog-kept') fail(`every property seen on one target is held (got held: ${held})`);
    const rs = prop('release-signing');
    if (rs && (rs.targets.length !== 2 || rs.findings !== 3 || rs.first !== 'alpha-1')) fail(`release-signing: 2 targets, 3 findings, first in alpha-1 (got ${JSON.stringify(rs)})`);
    const bp = prop('backup-push');
    if (bp && (bp.targets.length !== 1 || bp.findings !== 2)) fail(`backup-push is in two runs of one target: 1 target, 2 findings (got ${JSON.stringify(bp)})`);
    const series = (doc.runs || []).map((r) => `${r.run}@${r.date}+${r.added}`).join(' ');
    if (series !== 'alpha-1@2026-01-10+2 alpha-2@2026-02-10+1 beta-1@2026-03-10+1') fail(`the saturation series is the runs in the date each records, each with the properties it adds (got ${series})`);
    if (doc.runs && doc.runs[0] && doc.runs[0].target !== doc.runs[1].target) fail(`two runs of one target name it one way (got ${doc.runs[0].target} and ${doc.runs[1].target})`);
    if (doc.unnamed !== 2) fail(`the two findings naming no property are counted as unnamed (got ${doc.unnamed})`);
    if (doc.properties.some((p) => !p.property || p.property === 'unnamed')) fail('unnamed findings are never one property');

    const t = assay('candidates', 'beta-1', 'alpha-2', 'alpha-1');
    if (t.status !== 0) fail(`the printed tally must succeed (exit ${t.status})`);
    if (!/across 3 runs of 2 independent targets/.test(t.stdout)) fail(`the printed tally counts 2 independent targets over 3 runs (got: ${t.stdout.split('\n')[0]})`);
    if (!/2026-01-10\s+\+2\s+alpha-1[\s\S]*2026-02-10\s+\+1\s+alpha-2[\s\S]*2026-03-10\s+\+1\s+beta-1/.test(t.stdout)) fail(`the saturation series is printed in date order:\n${t.stdout}`);
    if (!/Proposed: 1[\s\S]*release-signing[\s\S]*Held: 3/.test(t.stdout)) fail(`the printed tally lists release-signing proposed and three held:\n${t.stdout}`);
    if (!/Unnamed: 2/.test(t.stdout)) fail('the printed tally counts the unnamed findings');
    if (!/Proposing edits nothing[\s\S]*reviewed change[\s\S]*names its sources/.test(t.stdout)) fail('the output says proposing edits nothing, and promotion is a reviewed change naming its sources');
    if (readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8') !== yardstickBefore) fail('the tally must never edit the yardstick');

    // (2) two runs of one target are one target, whatever the remote's spelling
    const same = assay('candidates', 'alpha-1', 'alpha-2', '--json');
    if (same.status !== 0) fail(`the tally over two runs of one target must succeed (exit ${same.status}): ${same.stderr.trim()}`);
    else {
      const d = JSON.parse(same.stdout);
      const two = d.properties.filter((p) => p.status === 'proposed' || p.targets.length > 1).map((p) => p.property);
      if (two.length) fail(`two runs of one target never count as two targets (proposed or multi-target: ${two.join(', ')})`);
    }

    // (5) a run that states no target is refused, naming the field, and nothing is counted
    const r = assay('candidates', 'alpha-1', 'unstated', '--json');
    if (r.status === 0) fail('a run that states no target must be refused, never counted');
    if (!/unstated: states no target: map\/scanners\.yaml carries no identity:/.test(r.stderr)) fail(`the refusal names identity: (got ${r.stderr.trim()})`);
    if (!/unstated: records no date/.test(r.stderr)) fail(`a run that records no date is refused too, naming drawn: (got ${r.stderr.trim()})`);
    if (r.stdout.trim()) fail(`a refused tally prints nothing to count (got ${r.stdout.trim().slice(0, 80)})`);
    const st = assay('candidates', 'alpha-1', 'unstated', '--target', 'unstated=https://example.org/fixtures/gamma', '--date', 'unstated=2026-04-01', '--json');
    if (st.status !== 0) fail(`--target and --date state a stored run's target and day (exit ${st.status}): ${st.stderr.trim()}`);
    else {
      const d = JSON.parse(st.stdout);
      const u = d.runs.find((x) => x.run === 'unstated');
      if (!u || u.target !== 'https://example.org/fixtures/gamma' || u.date !== '2026-04-01' || u.added !== 1) fail(`the stated run counts under the stated target and day (got ${JSON.stringify(u)})`);
    }
    const contra = assay('candidates', 'alpha-1', '--target', 'alpha-1=https://example.org/fixtures/other');
    if (contra.status === 0 || !/the run's own record stands/.test(contra.stderr)) fail(`a --target that contradicts the run's identity is refused (exit ${contra.status}): ${contra.stderr.trim()}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
