// ── report-howto: report.json carries the Improve report's how-to text (#239) ──
// A consumer's renderer read views/improve/templates/howto.md by path, an engine template
// past the contract. Pinned: views/improve/report.json carries `howto`, the template's
// markdown body with its frontmatter stripped, exactly; checkImproveReport refuses a report
// with none, and views/README.md's report.json format names it.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'report-howto';

export async function run() {
  const fail = (m) => negFailures.push('report-howto: ' + m);
  const L = await import('../../lib/run-layout.mjs');
  const D = await import('../../lib/run-data.mjs');
  const tmp = join(HERE, 'tmp-report-howto');
  rmSync(tmp, { recursive: true, force: true });
  try {
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
    writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), 'target: "notesbox"\nmaintainer: "the test maintainers"\nexec_summary: "test"\nroadmap: []\n');
    writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
    const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
    if (rp.status !== 0) { fail(`report.mjs must compile notesbox (stderr: ${rp.stderr})`); return; }
    const doc = JSON.parse(readFileSync(L.improveReportDataPath(tmp), 'utf8'));
    const want = readFileSync(join(ROOT, 'views', 'improve', 'templates', 'howto.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim() + '\n';
    if (doc.howto !== want) fail(`report.json howto must be templates/howto.md's body, frontmatter stripped (got ${JSON.stringify(String(doc.howto).slice(0, 80))})`);
    for (const bad of [undefined, '', '   ', 3]) {
      const d = { ...doc, howto: bad };
      if (!D.checkImproveReport(d).some((m) => /howto/.test(m))) fail(`checkImproveReport must refuse howto ${JSON.stringify(bad)}, naming howto`);
    }
    const vr = readFileSync(join(ROOT, 'views', 'README.md'), 'utf8');
    const row = vr.split('\n').find((l) => l.includes('`views/improve/report.json`')) || '';
    for (const k of ['howto', 'cuts', 'weakest']) if (!new RegExp(`\\b${k}\\b`).test(row)) fail(`views/README.md's report.json format must name ${k}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
