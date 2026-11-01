// ── project-command: a run's projection and chains as data, red runs too (#236) ──
// A consumer pinned the axis counts, the unmapped and needs-an-axis rows and the lead chain
// of a run by importing map/project.mjs and map/chains.mjs, because compile refuses a run
// that does not validate and prints no axis counts. Pinned:
//   (a) `assay project <run> --json` prints { run, axes: { <axis>: n }, unmapped, needs_axis,
//       chains: { live, lead } }, the same numbers projectMulti and buildChains give;
//   (b) it reads a run that validates RED (validate refuses it; project still prints);
//   (c) an unmapped row is printed AND exits 1: the projection halts loud, never reads clean;
//   (d) a run with no map exits non-zero and prints no JSON, never an empty projection.
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'project-command';

const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });

export async function run() {
  const fail = (m) => negFailures.push('project-command: ' + m);
  const P = await import('../../map/project.mjs');
  const { buildChains } = await import('../../map/chains.mjs');
  const tmp = join(HERE, 'tmp-project-command');
  rmSync(tmp, { recursive: true, force: true });
  try {
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    const findings = P.loadFindings(tmp);
    const adapters = P.loadAdapters();
    const { projected } = P.projectMulti(findings, adapters);
    const sources = [...new Set(projected.map((p) => p.source))].sort();
    const roster = P.rosterFor(adapters, sources, projected);
    const want = Object.fromEntries(roster.map((a) => [a, projected.filter((p) => p.axis === a).length]));
    const live = buildChains(findings).live;

    // (a)
    const r = assay(['project', tmp, '--json']);
    let doc = null;
    if (r.status !== 0) fail(`project --json over notesbox must exit 0 (got ${r.status}: ${r.stderr.trim().split('\n')[0]})`);
    else { try { doc = JSON.parse(r.stdout); } catch (e) { fail(`project --json must print JSON (${e.message})`); } }
    if (doc) {
      if (JSON.stringify(doc.axes) !== JSON.stringify(want)) fail(`axes must be the primary count per roster axis, in order: want ${JSON.stringify(want)}, got ${JSON.stringify(doc.axes)}`);
      if (!Array.isArray(doc.unmapped) || doc.unmapped.length) fail(`notesbox projects with no unmapped row (got ${JSON.stringify(doc.unmapped)})`);
      if (!Array.isArray(doc.needs_axis)) fail('needs_axis must be a list');
      if (!doc.chains || doc.chains.live !== live.length) fail(`chains.live must count the live chains (${live.length}), got ${JSON.stringify(doc.chains)}`);
      if (!live.length) fail('notesbox must carry a live chain for this block to read the lead');
      else if (doc.chains && doc.chains.lead !== live[0].entry.label) fail(`chains.lead must be the first live chain's entry label (${live[0].entry.label}), got ${JSON.stringify(doc.chains.lead)}`);
    }

    // (b) a run that validates red: no run record
    rmSync(join(tmp, 'map', 'scanners.yaml'));
    const v = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'validate', tmp], { encoding: 'utf8' });
    if (v.status === 0) fail('test setup: a run with no run record must validate red');
    const red = assay(['project', tmp, '--json']);
    let redDoc = null;
    try { redDoc = JSON.parse(red.stdout); } catch { /* read below */ }
    if (red.status !== 0 || !redDoc || JSON.stringify(redDoc.axes) !== JSON.stringify(want)) fail(`project --json must read a run that validates red, the same axes (got ${red.status}: ${red.stderr.trim().split('\n')[0]})`);
    copyFixtureScanners('notesbox', tmp);

    // (c) an unmapped row halts loud, with the data still printed
    writeFileSync(join(tmp, 'map', 'findings', 'planted.yaml'), '- id: F-990001\n  source: no-such-scanner\n  native_category: x\n  polarity: gap\n  observation: planted\n  evidence: [a.txt:1]\n');
    const um = assay(['project', tmp, '--json']);
    let umDoc = null;
    try { umDoc = JSON.parse(um.stdout); } catch { /* read below */ }
    if (um.status !== 1) fail(`an unmapped row must exit 1 (got ${um.status})`);
    if (!umDoc || !(umDoc.unmapped || []).some((u) => u.id === 'F-990001')) fail(`the unmapped row must be printed with its id (got ${um.stdout.slice(0, 200)})`);
    if (!/unmapped|HALTED/i.test(um.stderr)) fail('an unmapped row must be said on stderr');

    // (d) no map
    rmSync(join(tmp, 'map', 'findings'), { recursive: true, force: true });
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), 'scanners: {}\n');
    const none = assay(['project', tmp, '--json']);
    if (none.status === 0 || none.stdout.trim()) fail(`a run with no findings directory must exit non-zero and print nothing (got ${none.status}: ${none.stdout.slice(0, 80)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
