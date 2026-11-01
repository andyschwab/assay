// ── report-chain-cuts: report.json carries each live chain's cuts and its weakest step (#239) ──
// A consumer's Improve-report renderer re-derived a chain's cuts (the control or process
// gaps that stop it) and, for a tentative chain, its weakest step from the findings, by
// map/chains.mjs's own rule: a fork of engine logic outside assay. Pinned, on notesbox with
// a cut and a tentative step planted (F-050 reaches the sink; F-051 is plausible): every
// chains.live row in views/improve/report.json carries `cuts` [{ id, label }] equal to
// buildChains' cuts, and `weakest` { id, confidence, word } for a tentative chain (null
// otherwise) equal to buildChains' weak step; checkImproveReport refuses a row missing
// either, and validate reads it back and fails closed.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'report-chain-cuts';

export async function run() {
  const fail = (m) => negFailures.push('report-chain-cuts: ' + m);
  const L = await import('../../lib/run-layout.mjs');
  const D = await import('../../lib/run-data.mjs');
  const { loadFindings } = await import('../../map/project.mjs');
  const { buildChains } = await import('../../map/chains.mjs');
  const tmp = join(HERE, 'tmp-report-chain-cuts');
  rmSync(tmp, { recursive: true, force: true });
  try {
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    const dp = join(tmp, 'map', 'findings', 'practice-review-delegation.yaml');
    let y = readFileSync(dp, 'utf8');
    const plant = (from, to) => { if (!y.includes(from)) throw new Error(`notesbox no longer carries ${JSON.stringify(from)}; replant`); y = y.replace(from, to); };
    plant('  confidence: confirmed\n  preconditions: [network-position]\n', '  confidence: confirmed\n  preconditions: [network-position]\n  reaches: [F-052]\n');
    plant('  confidence: confirmed\n  capabilities:\n    untrusted_input: true', '  confidence: plausible\n  capabilities:\n    untrusted_input: true');
    writeFileSync(dp, y);
    mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
    writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
      'target: "notesbox"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
      'roadmap:', '  - slug: close-admin-default', '    title: "Fail authentication closed"', '    body: "x"', '    findings: [F-050, F-052, F-053]', '',
    ].join('\n'));
    writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
    const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
    if (rp.status !== 0) { fail(`report.mjs must compile the planted notesbox (stderr: ${rp.stderr})`); return; }
    const findings = loadFindings(tmp);
    const built = buildChains(findings, {});
    if (!built.live.some((c) => c.cuts.length) || !built.live.some((c) => c.tentative)) { fail('the plant must give a live chain with a cut and a tentative step; replant'); return; }
    const p = L.improveReportDataPath(tmp);
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    const live = doc.chains?.live || [];
    if (live.length !== built.live.length) fail(`report.json must carry every live chain (want ${built.live.length}, got ${live.length})`);
    const byId = new Map(findings.map((f) => [f.id, f]));
    built.live.forEach((c, i) => {
      const r = live[i] || {};
      if (JSON.stringify(r.cuts) !== JSON.stringify(c.cuts)) fail(`chains.live[${i}].cuts must be buildChains' cuts (want ${JSON.stringify(c.cuts)}, got ${JSON.stringify(r.cuts)})`);
      const want = c.tentative && c.weak ? { id: c.weak, confidence: byId.get(c.weak).confidence, word: c.confWord } : null;
      if (JSON.stringify(r.weakest) !== JSON.stringify(want)) fail(`chains.live[${i}].weakest must be the chain's weakest step (want ${JSON.stringify(want)}, got ${JSON.stringify(r.weakest)})`);
    });
    const ids = new Set(findings.map((f) => f.id));
    const refuse = (what, mut) => {
      const d = JSON.parse(JSON.stringify(doc)); mut(d.chains.live[0]);
      if (!D.checkImproveReport(d, ids).length) fail(`checkImproveReport must refuse a live chain ${what}`);
    };
    refuse('with no cuts list', (c) => { delete c.cuts; });
    refuse('naming a cut not in the base', (c) => { c.cuts = [{ id: 'F-999999', label: 'x' }]; });
    refuse('that is tentative with no weakest step', (c) => { c.weakest = null; });
    refuse('whose weakest step is off its path', (c) => { c.weakest = { ...c.weakest, id: c.path.includes('F-050') ? 'F-001' : 'F-050' }; });
    refuse('with no weakest field', (c) => { delete c.weakest; });
    const val = () => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    const v0 = val();
    if (v0.status !== 0) fail(`validate must pass over the planted run (stderr: ${String(v0.stderr).split('\n').slice(0, 4).join(' | ')})`);
    const d1 = JSON.parse(JSON.stringify(doc)); delete d1.chains.live[0].cuts;
    writeFileSync(p, JSON.stringify(d1));
    const v1 = val();
    if (v1.status === 0 || !/report\.json/.test(v1.stderr)) fail(`validate must fail closed on a report.json chain with no cuts, naming the file (got ${v1.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
