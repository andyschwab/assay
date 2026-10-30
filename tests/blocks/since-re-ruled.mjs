// ── since: a rule change between engines reads re-ruled, never a move of the repository (#183) ──
// Two runs over one fixture map. In the current run gitleaks found nothing (a true move),
// and checkov, which did not run in the previous run, ran. Then:
//   (a) with the stored measurement as today's engine reads it, nothing is re-ruled;
//   (b) the previous run's stored yardstick.yaml hand-set to an older engine's reading
//       (a row both runs read unmet stored as met) reads re-ruled, met by the stored
//       file and unmet on the same map today, and never regressed; the true move still
//       reads improved;
//   (c) a finding from a scanner that did not run in the previous run reads apart from
//       the new findings, never as one of them;
//   (d) since.yaml names both engines, and SINCE.md has the re-ruled section naming the row.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { sincePagePath, viewPath, yardstickPath, scannersPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'since-re-ruled';

export async function run() {
  const fail = (m) => negFailures.push('since-re-ruled: ' + m);
  const tmp = join(HERE, 'tmp-since-re-ruled'); rmSync(tmp, { recursive: true, force: true });
  const prev = join(tmp, 'prev'), curr = join(tmp, 'curr');
  try {
    for (const r of [prev, curr]) { copyFixtureFindings('notesbox', r); copyFixtureScanners('notesbox', r); }
    writeFileSync(join(curr, 'map', 'findings', 'gitleaks.yaml'), '[]\n');
    rmSync(join(prev, 'map', 'findings', 'checkov.yaml'));
    const prevRecord = readFileSync(scannersPath(prev), 'utf8');
    const skipped = prevRecord.replace(/(\n  checkov:\n)    status: ran\n    duration: "2s"\n/, '$1    status: skipped\n    reason: "planted: not on PATH when this run was drawn"\n').replace(/^engine: fixture$/m, 'engine: "older-engine"');
    if (skipped === prevRecord || !/older-engine/.test(skipped)) fail('test setup: could not record checkov skipped and an older engine in the previous run');
    writeFileSync(scannersPath(prev), skipped);
    for (const r of [prev, curr]) execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), r, '--write'], { stdio: 'pipe' });
    const since = () => {
      execFileSync(process.execPath, [join(ROOT, 'views', 'since.mjs'), curr, '--previous', prev], { stdio: 'pipe' });
      return parseYaml(readFileSync(viewPath(curr, 'since'), 'utf8'));
    };

    // (a)
    const a = since();
    if ((a.re_ruled || []).length) fail(`(a) a stored measurement today's engine agrees with reads nothing re-ruled (got ${(a.re_ruled || []).map((r) => r.id).join(', ')})`);

    // (b)
    const stored = readFileSync(yardstickPath(prev), 'utf8');
    const statusOf = (text, id) => (text.match(new RegExp(`- id: ${id}\\n    status: ([\\w-]+)`)) || [])[1];
    const currText = readFileSync(yardstickPath(curr), 'utf8');
    const ids = [...stored.matchAll(/- id: ([\w-]+)\n    status: unmet/g)].map((m) => m[1]).filter((id) => statusOf(currText, id) === 'unmet');
    if (!ids.length) fail('test setup: no requirement reads unmet in both runs to re-rule');
    const R = ids[0];
    writeFileSync(yardstickPath(prev), stored.replace(new RegExp(`(- id: ${R}\\n    status: )unmet`), '$1met'));
    const b = since();
    const rr = (b.re_ruled || []).find((r) => r.id === R);
    if (!rr || rr.previous.status !== 'met' || rr.current.status !== 'unmet') fail(`(b) ${R} reads re-ruled, met stored and unmet on the same map today (got ${JSON.stringify(rr)})`);
    if ((b.regressed || []).some((r) => r.id === R)) fail(`(b) ${R}'s rule change never reads regressed`);
    if ((b.regressed || []).length) fail(`(b) nothing regressed in this fixture (got ${(b.regressed || []).map((r) => r.id).join(', ')})`);
    if (!(b.improved || []).some((r) => r.id === 'd-secrets-out-of-history')) fail('(b) the true move still reads improved (d-secrets-out-of-history)');
    if (b.counts?.re_ruled !== 1) fail(`(b) counts.re_ruled is 1 (got ${b.counts?.re_ruled})`);

    // (c)
    const notRun = (b.findings?.not_run_before || []).map((f) => f.source);
    const fresh = (b.findings?.new || []).map((f) => f.source);
    if (!notRun.length || notRun.some((s) => s !== 'checkov')) fail(`(c) checkov's findings read as from a scanner that did not run before (got ${JSON.stringify(notRun)})`);
    if (fresh.includes('checkov')) fail('(c) a finding from a scanner that did not run before is never a new finding');
    if (!(b.findings?.no_longer_found || []).some((f) => f.source === 'gitleaks')) fail('(c) a scanner that ran both times still reports what it no longer found');

    // (d)
    if (b.engine !== 'fixture' || b.previous_engine !== 'older-engine') fail(`(d) since.yaml names both engines (got ${b.previous_engine} → ${b.engine})`);
    const page = readFileSync(sincePagePath(curr), 'utf8');
    const section = page.split('## Re-ruled by the engine')[1] || '';
    if (!section || !section.split('\n## ')[0].includes(R)) fail(`(d) SINCE.md's re-ruled section names ${R}`);
    if (!/1 re-ruled/.test(page)) fail('(d) the headline counts the re-ruled row');
    if (!/ran in only one run/.test(page) || !/checkov/.test(page)) fail('(d) SINCE.md names the findings from a scanner that ran in only one run');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
