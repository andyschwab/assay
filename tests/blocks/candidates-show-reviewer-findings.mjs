// ── the candidates view shows every reviewer finding no row takes, by its property (#306, part 2) ──
// Every reviewer finding is placed by the property it observes: on the row whose binding names
// that property, or listed untaken under it in the run's candidates. Before #306 a reviewer's row
// carried no property, so every one no row took sat in one undifferentiated `unnamed` list, and
// IMPROVE.md §8 (the only page that rendered them) is written only where the run carries prose:
// on a raw base a person never saw them. Pinned, compiling notesbox with the invented report
// tests/instruments/deep-code-review-properties.yaml ingested (no prose):
//   1. the concurrency and integration findings no row takes are listed under concurrent-state
//      and integration-contracts; the release-trust finding, which d-release-path-trusted takes
//      since #316, is on that row and in no candidate list (re-pinned by #316: it was listed
//      untaken under release-path-trust while no row took it);
//   2. every reviewer finding is on a row or in the candidates, never neither and never both;
//   3. the walk, the human read of a raw base, lists them under the same properties.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidatesDataPath, axesPath, prosePath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'candidates-show-reviewer-findings';

export async function run() {
  const fail = (m) => negFailures.push('candidates-show-reviewer-findings: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-reviewer-candidates-'));
  try {
    const runDir = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), runDir, { recursive: true });
    rmSync(join(runDir, 'ANSWERS.yaml'), { force: true });
    if (existsSync(prosePath(runDir))) { fail('the fixture run must be a raw base (no prose)'); return; }
    const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
    const i = assay('ingest', runDir, '--tool', 'deep-code-review', '--raw', join(HERE, 'instruments', 'deep-code-review-properties.yaml'), '--exit', '0');
    if (i.status !== 0) { fail(`the fixture report ingests (exit ${i.status}): ${(i.stderr || i.stdout).split('\n').slice(0, 3).join(' | ')}`); return; }
    const c = assay('compile', runDir);
    if (c.status !== 0) { fail(`compile succeeds (exit ${c.status}): ${(c.stdout + c.stderr).split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 3).join(' | ')}`); return; }
    const rows = parseYaml(readFileSync(join(runDir, 'map', 'findings', 'deep-code-review.yaml'), 'utf8'));
    const id = (n) => rows.find((r) => r.native_id === n)?.id;
    const d = parseYaml(readFileSync(candidatesDataPath(runDir), 'utf8'));
    const under = (p) => (d.properties || []).find((x) => x.property === p)?.findings || [];

    // (1) listed under the property each observes
    for (const [n, p] of [['R3', 'concurrent-state'], ['R4', 'integration-contracts']]) {
      if (!under(p).includes(id(n))) fail(`(1) ${n} (${id(n)}) is listed under ${p} (got ${p}: ${under(p).join(', ') || 'nothing'}; unnamed: ${(d.unnamed || []).join(', ')})`);
    }

    // (2) on a row or in the candidates, exactly one
    const y = parseYaml(readFileSync(join(runDir, 'yardstick.yaml'), 'utf8'));
    const release = (y.requirements || []).find((r) => r.id === 'd-release-path-trusted');
    if (!(release?.findings || []).includes(id('R1'))) fail(`(1) R1 (${id('R1')}) is on d-release-path-trusted (got ${release?.status}: ${(release?.findings || []).join(', ')})`);
    if (under('release-path-trust').length) fail(`(1) no release-trust finding is listed untaken (got ${under('release-path-trust').join(', ')})`);
    const onRow = new Set((y.requirements || []).flatMap((r) => r.findings || []));
    const listed = new Set([...(d.properties || []).flatMap((x) => x.findings || []), ...(d.unnamed || [])]);
    for (const r of rows) {
      if (onRow.has(r.id) && listed.has(r.id)) fail(`(2) ${r.id} (${r.native_id}) is both on a row and a candidate`);
      if (!onRow.has(r.id) && !listed.has(r.id)) fail(`(2) ${r.id} (${r.native_id}) is on no row and in no candidate list`);
    }

    // (3) the walk shows them on a raw base
    const walk = existsSync(axesPath(runDir)) ? readFileSync(axesPath(runDir), 'utf8') : '';
    const sec = walk.split(/^# Findings no requirement takes\s*$/m)[1]?.split(/^# /m)[0] || '';
    if (!sec) fail('(3) the walk carries a "Findings no requirement takes" section');
    for (const [n, p] of [['R3', 'concurrent-state'], ['R4', 'integration-contracts']]) {
      const block = sec.split(/^## /m).find((b) => b.startsWith(`\`${p}\``)) || '';
      if (!block.includes(`**${id(n)}**`)) fail(`(3) the walk lists ${id(n)} under ${p}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
