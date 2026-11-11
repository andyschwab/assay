// ── a finding names the property it observes, and the run lists the ones no requirement takes (#264, D1 of #257) ──
// A finding may carry `property:`, a stack-free kebab-case name for the property it observes
// (map/SCHEMA.md §1), never a requirement id (#257 Q1). After measuring, compile lists the
// run's candidates, the findings no requirement takes (yardstick/untaken.mjs, the one
// definition), grouped by property, in views/improve/candidates.yaml and IMPROVE.md §8.
// Pinned:
//  1. untakenFindings: a finding cited by a measurement row, a census member, or a triage
//     covering finding is taken; every other finding is not;
//  2. a fixture run with a finding no requirement reads lists it under its property, and one
//     that names none under unnamed;
//  3. a finding a requirement takes never appears as a candidate, whatever property it names
//     (cited by a row, a triage's covering finding, a census member);
//  4. validate refuses a malformed property and one that is a requirement id, and accepts a
//     well-formed one;
//  5. IMPROVE.md renders the candidates by property.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { untakenFindings } from '../../yardstick/untaken.mjs';
import { candidatesDataPath, censusesPath, findingsDir, improvePagePath, prosePath, securityGatePath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'finding-property-candidates';

// notesbox: F-030 and F-001 are taken by no requirement in the fixture as committed; F-053 is
// the effect-triage's covering finding and an effect facet row cites it
const setProperty = (run, file, id, value) => {
  const p = join(findingsDir(run), file);
  const s = readFileSync(p, 'utf8');
  const at = `- id: ${id}\n`;
  if (!s.includes(at)) throw new Error(`${file} carries no ${id}`);
  writeFileSync(p, s.replace(at, `${at}  property: ${value}\n`));
};
const census = (dim, name, members) => `dimensions:\n  - dimension: ${dim}\n    depth: >\n      x (F-001).\n    sampled:\n      - name: ${name}\n        what: "the population"\n        members: [${members.join(', ')}]\n        method: "every member, one finding each"\n        primary: true\n`;

export async function run() {
  const fail = (m) => negFailures.push('finding-property-candidates: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });

  // (1) the one definition, over each route by which a requirement takes a finding
  const fs = ['F-001', 'F-002', 'F-003', 'F-004'].map((id) => ({ id }));
  const left = (o) => untakenFindings({ findings: fs, ...o }).map((f) => f.id).join(',');
  if (left({}) !== 'F-001,F-002,F-003,F-004') fail(`with nothing measured, every finding is untaken (got ${left({})})`);
  if (left({ measurement: [{ id: 'd-x', findings: ['F-002'] }] }) !== 'F-001,F-003,F-004') fail('a finding a measurement row cites is taken');
  if (left({ censuses: { dimensions: [{ sampled: [{ name: 'c', members: ['F-003'] }] }] } }) !== 'F-001,F-002,F-004') fail('a census member is taken');
  if (left({ triage: [{ candidate: 'x', finding: 'F-004' }, { candidate: 'y', out_of_scope: 'read-only' }] }) !== 'F-001,F-002,F-003') fail('a triage covering finding is taken, and an out-of-scope entry takes none');

  const tmp = mkdtempSync(join(tmpdir(), 'assay-property-candidates-'));
  try {
    const rel = candidatesDataPath(tmp).slice(tmp.length + 1).split(/[\\/]/).join('/');
    if (rel !== 'views/improve/candidates.yaml') fail(`candidatesDataPath places ${rel}; the run layout says views/improve/candidates.yaml`);
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    setProperty(run, 'practice-review-verification.yaml', 'F-030', 'release-signing');
    setProperty(run, 'practice-review-delegation.yaml', 'F-053', 'backup-push');
    const read = () => parseYaml(readFileSync(candidatesDataPath(run), 'utf8'));
    const all = (d) => [...(d.properties || []).flatMap((p) => p.findings || []), ...(d.unnamed || [])];
    const taken = () => {
      const y = parseYaml(readFileSync(join(run, 'yardstick.yaml'), 'utf8'));
      const t = new Set((y.requirements || []).flatMap((r) => r.findings || []));
      const tr = parseYaml(readFileSync(join(run, 'map', 'effect-triage.yaml'), 'utf8'));
      for (const e of tr.triage || []) if (e.finding) t.add(e.finding);
      if (existsSync(censusesPath(run))) for (const d of parseYaml(readFileSync(censusesPath(run), 'utf8')).dimensions || []) for (const s of d.sampled || []) for (const m of s.members || []) t.add(m);
      return t;
    };

    const c = assay('compile', run);
    if (c.status !== 0) { fail(`compile over notesbox with property: on two findings must succeed (exit ${c.status}): ${(c.stdout + c.stderr).split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 4).join(' | ')}`); return; }
    if (!existsSync(candidatesDataPath(run))) { fail('compile must write views/improve/candidates.yaml'); return; }
    let d = read();
    // (2) the untaken finding is listed under its property; a finding naming none under unnamed
    const rs = (d.properties || []).find((p) => p.property === 'release-signing');
    if (!rs || JSON.stringify(rs.findings) !== '["F-030"]') fail(`F-030 (property: release-signing, taken by no requirement) must be listed under release-signing (got ${JSON.stringify(d.properties)})`);
    if (!(d.unnamed || []).includes('F-001')) fail(`F-001 (no property, taken by no requirement) must be listed as unnamed (got ${JSON.stringify(d.unnamed)})`);
    if (d.view !== 'candidates' || d.counts?.candidates !== all(d).length || d.counts?.findings !== d.counts?.taken + d.counts?.candidates) fail(`candidates.yaml's counts must add up (got ${JSON.stringify(d.counts)} over ${all(d).length} listed)`);
    // (3) a taken finding is never a candidate, whatever property it names
    if (all(d).includes('F-053') || (d.properties || []).some((p) => p.property === 'backup-push')) fail('F-053 (a triage covering finding, cited by an effect row) is taken: it must never appear as a candidate, nor its property');
    const both = all(d).filter((id) => taken().has(id));
    if (both.length) fail(`a finding a requirement takes appears as a candidate: ${both.join(', ')}`);

    // (3) a census member is taken: F-001 leaves the list once a census lists it
    writeFileSync(censusesPath(run), census('artifact-legibility', 'decision-reconstruction', ['F-001']));
    assay('measure', run, '--write');   // the stored measurement predates the census: validate drift-checks it
    const c2 = assay('compile', run);
    if (c2.status !== 0) fail(`compile with a census listing F-001 must succeed (exit ${c2.status})`);
    else {
      d = read();
      if (all(d).includes('F-001')) fail('F-001, a census member, is taken: it must not appear as a candidate');
      const again = all(d).filter((id) => taken().has(id));
      if (again.length) fail(`a finding a requirement takes appears as a candidate: ${again.join(', ')}`);
    }

    // (5) IMPROVE.md §8 renders the candidates by property
    writeFileSync(prosePath(run), ['target: "notesbox"', 'exec_summary: "test"', 'roadmap:', '  - slug: close-admin-default', '    title: "Fail authentication closed"', '    body: "x"', '    findings: [F-050, F-052, F-053]', ''].join('\n'));
    writeFileSync(securityGatePath(run), 'exposures: []\n');
    const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), run], { encoding: 'utf8' });
    if (rp.status !== 0) fail(`report.mjs must compile the run (stderr: ${rp.stderr.trim().split('\n').slice(-2).join(' | ')})`);
    else {
      const page = readFileSync(improvePagePath(run), 'utf8');
      const sec = page.split('## 8. What no requirement reads yet')[1]?.split('\n## ')[0] || '';
      if (!sec) fail('IMPROVE.md must carry §8, "What no requirement reads yet"');
      else {
        if (!/### `release-signing` \(1\)\n\n- \*\*F-030\*\*/.test(sec)) fail('IMPROVE.md §8 must list F-030 under `release-signing`');
        if (/F-053|F-001\b/.test(sec)) fail('IMPROVE.md §8 must not list a finding a requirement takes (F-053, F-001)');
      }
    }

    // (4) validate refuses a malformed property and a requirement id, and accepts a good one
    const v0 = assay('validate', run);
    if (v0.status !== 0) fail(`a run whose findings carry well-formed property: values must validate (exit ${v0.status}): ${(v0.stdout + v0.stderr).split('\n').filter((l) => /property/.test(l)).join(' | ')}`);
    for (const [bad, why] of [['Release_Signing', 'malformed'], ['release--signing', 'malformed'], ['-release', 'malformed'], ['d-decisions-reconstruct', 'a requirement id']]) {
      const r2 = join(tmp, `bad-${bad}`);
      cpSync(run, r2, { recursive: true });
      setProperty(r2, 'practice-review-legibility.yaml', 'F-001', bad);
      const v = assay('validate', r2);
      const out = v.stdout + v.stderr;
      if (v.status === 0 || !/F-001.*property/.test(out)) fail(`validate must refuse property: ${bad} (${why}) on F-001, naming it (exit ${v.status})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
