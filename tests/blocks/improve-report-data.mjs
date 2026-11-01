// ── improve-report-data: the Improve report's model, written as data (#236) ──
// A renderer of the Improve report (a PDF made from it, say) rebuilt the model by importing
// map/capabilities.mjs, map/chains.mjs, map/supervision.mjs, lib/display.mjs and the findings
// loader. Pinned: report.mjs writes views/improve/report.json (assay.improve-report/1,
// lib/run-data.mjs checkImproveReport) beside chains.json, placed by run-layout's
// improveReportDataPath: the capabilities with their counts and trace phrases, the chains,
// the supervision split with its fixes, and the label tables, the labels already applied;
// every number agrees with the module that computes it; validate reads it back and fails
// closed on a malformed one, naming it.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'improve-report-data';

export async function run() {
  const fail = (m) => negFailures.push('improve-report-data: ' + m);
  const L = await import('../../lib/run-layout.mjs');
  const D = await import('../../lib/run-data.mjs');
  const { loadFindings } = await import('../../map/project.mjs');
  const { buildCapabilities, capabilityCounts, tracePhrase } = await import('../../map/capabilities.mjs');
  const { buildSupervision } = await import('../../map/supervision.mjs');
  const { DIM_LABEL, WHO_LABEL, GROUP_LABEL } = await import('../../lib/display.mjs');
  if (typeof L.improveReportDataPath !== 'function') { fail('lib/run-layout.mjs must place the report data (improveReportDataPath)'); return; }
  if (typeof D.checkImproveReport !== 'function' || D.IMPROVE_REPORT_SCHEMA !== 'assay.improve-report/1') { fail('lib/run-data.mjs must export checkImproveReport and IMPROVE_REPORT_SCHEMA assay.improve-report/1'); return; }
  const tmp = join(HERE, 'tmp-improve-report-data');
  rmSync(tmp, { recursive: true, force: true });
  try {
    const rel = L.improveReportDataPath(tmp).slice(tmp.length + 1).split(/[\\/]/).join('/');
    if (rel !== 'views/improve/report.json') fail(`improveReportDataPath places ${rel}; the run layout says views/improve/report.json`);
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
    const roadmap = [{ slug: 'close-admin-default', title: 'Fail authentication closed', body: 'x', findings: ['F-050', 'F-052', 'F-053'] }];
    writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
      'target: "notesbox"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
      'roadmap:', '  - slug: close-admin-default', '    title: "Fail authentication closed"', '    body: "x"', '    findings: [F-050, F-052, F-053]', '',
    ].join('\n'));
    writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
    const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
    if (rp.status !== 0) { fail(`report.mjs must compile notesbox (stderr: ${rp.stderr})`); return; }
    const p = L.improveReportDataPath(tmp);
    if (!existsSync(p)) { fail('report.mjs must write views/improve/report.json'); return; }
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    const ids = new Set(loadFindings(tmp).map((f) => f.id));
    const errs = D.checkImproveReport(doc, ids);
    if (errs.length) fail(`the report's own data file must pass its schema (got ${errs.join('; ')})`);
    const findings = loadFindings(tmp);
    const groups = buildCapabilities(findings, {});
    const counts = capabilityCounts(groups);
    if (JSON.stringify(doc.capabilities && doc.capabilities.counts) !== JSON.stringify(counts)) fail(`capabilities.counts must be capabilityCounts (want ${JSON.stringify(counts)}, got ${JSON.stringify(doc.capabilities && doc.capabilities.counts)})`);
    const chans = (doc.capabilities?.groups || []).flatMap((g) => g.channels || []);
    const wantChans = groups.flatMap((g) => g.channels);
    if (chans.length !== wantChans.length) fail(`every capability channel must be carried (want ${wantChans.length}, got ${chans.length})`);
    for (const [i, c] of chans.entries()) {
      const w = wantChans[i];
      if (!w) break;
      if (c.channel !== w.channel || c.label !== w.label || c.halt !== w.halt || c.trace !== tracePhrase(w.telemetry)) fail(`channel ${i} must carry its label, halt and trace phrase applied (want ${w.channel}/${w.label}/${w.halt}/${tracePhrase(w.telemetry)}, got ${c.channel}/${c.label}/${c.halt}/${c.trace})`);
      if (!Array.isArray(c.gates)) fail(`channel ${c.channel}: gates must be a list`);
    }
    for (const g of doc.capabilities?.groups || []) if (g.label !== GROUP_LABEL[g.group]) fail(`group ${g.group} must carry its label (${GROUP_LABEL[g.group]})`);
    const chainsFile = JSON.parse(readFileSync(L.chainsDataPath(tmp), 'utf8'));
    if (JSON.stringify(doc.chains?.live?.map((c) => c.entry.id)) !== JSON.stringify(chainsFile.live.map((c) => c.entry.id))) fail('report.json chains.live must rank as chains.json does');
    if (!doc.chains?.live?.length || !doc.chains.live[0].blast_word || !doc.chains.live[0].difficulty) fail('a live chain must carry its words applied (blast_word, difficulty)');
    const sup = buildSupervision(findings, roadmap, {});
    const s = doc.supervision || {};
    if (s.total !== sup.total || s.supervised !== sup.supervised || s.unsupervised !== sup.unsupervised || JSON.stringify(s.fixes) !== JSON.stringify(sup.fixes)) fail(`supervision must be buildSupervision's split (want ${sup.total}/${sup.supervised}/${sup.unsupervised} fixes ${JSON.stringify(sup.fixes)}, got ${JSON.stringify(s)})`);
    for (const k of s.kinds || []) if (!Array.isArray(k.fixes) || k.fixes.some((f) => !Number.isInteger(f.n) || typeof f.slug !== 'string')) fail(`supervision kind ${k.channel}: fixes must be [{ n, slug }]`);
    const lab = doc.labels || {};
    if (JSON.stringify(lab.dimension) !== JSON.stringify(DIM_LABEL) || JSON.stringify(lab.who) !== JSON.stringify(WHO_LABEL) || JSON.stringify(lab.group) !== JSON.stringify(GROUP_LABEL)) fail('labels must carry the dimension, who and group tables');
    // validate reads it back, fail-closed
    const val = () => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    const v0 = val();
    if (v0.status !== 0) fail(`validate must pass over the compiled run (stderr: ${String(v0.stderr).split('\n').slice(0, 4).join(' | ')})`);
    writeFileSync(p, JSON.stringify({ ...doc, schema: 'assay.improve-report/0' }));
    const v1 = val();
    if (v1.status === 0 || !/report\.json/.test(v1.stderr)) fail(`validate must fail closed on a malformed report.json, naming it (got ${v1.status})`);
    writeFileSync(p, JSON.stringify({ ...doc, supervision: { ...doc.supervision, kinds: [{ channel: 'x', label: 'x', sites: 1, ids: ['F-999999'], fixes: [] }] } }));
    const v2 = val();
    if (v2.status === 0 || !/F-999999/.test(v2.stderr)) fail(`validate must refuse a report.json naming an id not in the base (got ${v2.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
