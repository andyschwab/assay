// ── instrument rows assert no severity; the views band them (#53, F-1230) ──────
// Every row the blocks above converted from an instrument report (gitleaks, scorecard,
// fresh-clone, dependency-scan, repo-census) carries no severity field: CLAUDE.md rule 1
// keeps no exception for the bands. The projection every view reads hands the view the
// band views/severity.mjs computes (the report rendering in intake-maintain-improve pins
// it end to end over dependency-scan rows written with no severity).
import { projectMulti } from '../../map/project.mjs';
import { negFailures, convertedRows, adaptersOnce } from '../harness.mjs';

export const label = 'instrument-severity';
export const after = '*';   // it sweeps the rows every other block converted

export async function run() {
  const fail = (m) => negFailures.push('instrument-severity: ' + m);
  const INSTRUMENTS = ['gitleaks', 'scorecard', 'fresh-clone', 'dependency-scan', 'repo-census'];
  const inst = convertedRows.filter((r) => INSTRUMENTS.includes(r.source));
  for (const src of INSTRUMENTS) if (!inst.some((r) => r.source === src)) fail(`the sweep saw no ${src} row (the harness must convert at least one)`);
  const carrying = inst.filter((r) => 'severity' in r);
  if (carrying.length) fail(`an instrument row asserts a severity in the map (${carrying.length}, e.g. ${carrying.slice(0, 3).map((r) => `${r.source} ${r.native_id}: ${r.severity}`).join('; ')})`);
  const { projected } = projectMulti(inst.filter((r) => r.polarity === 'gap'), adaptersOnce());
  const unbanded = projected.filter((p) => p.source !== 'gitleaks' && !['Critical', 'High', 'Medium', 'Low'].includes(p.f.severity));
  if (unbanded.length) fail(`every instrument gap but gitleaks must reach the views banded (${unbanded.length} not, e.g. ${unbanded.slice(0, 3).map((p) => `${p.source} ${p.f.native_id}`).join('; ')})`);
  for (const [src, cat, sev] of [['scorecard', 'Branch-Protection', 'High'], ['dependency-scan', 'high', 'High'], ['dependency-scan', 'lockfile-failed', 'Medium'], ['repo-census', 'runbook', 'Medium']]) {
    const p = projected.find((x) => x.source === src && x.f.native_category === cat);
    if (!p || p.f.severity !== sev) fail(`the projection must hand the view ${src} ${cat} banded ${sev} (got ${p ? p.f.severity : 'no row'})`);
  }
  if (!projected.some((p) => p.source === 'repo-census' && p.f.native_category === 'ci-gate' && p.f.fail_open === true && p.f.severity === 'High')) fail('a fail-open ci-gate gap must carry the fail_open fact and reach the view banded High');
  if (!projected.some((p) => p.source === 'fresh-clone' && /:(failed|timed-out)$/.test(p.f.native_id) && p.f.severity === 'High')) fail('a failed or timed-out fresh-clone step must reach the view banded High');
}
