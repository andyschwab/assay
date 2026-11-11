// ── met needs positive evidence (#260, M2 of #257) ──
// A census lists its members (map/censuses.yaml `members:`, map/census.mjs), and a requirement
// reads met by what the run saw in place, never by the absence of a gap:
//  1. a census whose members are all strengths reads met, the strengths cited in the row;
//  2. a member with no verdict (a fact) holds it mixed, and a census with no members: (an
//     authored count) never reads met;
//  3. a strength never turns a row with a gap to met (and on a safety row, never to mixed);
//  4. an authored met/of that disagrees with members: fails validate;
//  5. the views render the cited strengths on a met row (Maintain's findings:, Owner's seen:);
//  6. a met effect row cites the effect findings it read.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYardstick, measureRun, projectRun } from '../../yardstick/measure.mjs';
import { censusesPath, viewPath, ownerPagePath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'met-needs-positive-evidence';

// notesbox's own findings: F-001 and F-010 are strengths (an ADR, a narrow module), F-002 a
// gap (a stale README command), F-1400 a fact
const census = (entries) => `dimensions:\n${entries.map(([dim, name, body]) => `  - dimension: ${dim}\n    depth: >\n      x (F-001).\n    sampled:\n      - name: ${name}\n        what: "the population"\n${body.map((l) => `        ${l}`).join('\n')}\n        method: "every member, one finding each"\n        primary: true`).join('\n')}\n`;
const DR = 'd-decisions-reconstruct', MS = 'd-modules-standalone';

export async function run() {
  const fail = (m) => negFailures.push('met-needs-positive-evidence: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-met-evidence-'));
  try {
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    const write = (entries) => writeFileSync(censusesPath(run), census(entries));
    const rows = () => Object.fromEntries(projectRun(run).map((x) => [x.id, x]));

    // (1) strengths and no gaps: met, the strengths cited
    write([['artifact-legibility', 'decision-reconstruction', ['members: [F-001]']], ['context-economy', 'modules-standalone', ['members: [F-010]', 'met: 1', 'of: 1']]]);
    let r = rows();
    if (r[DR]?.status !== 'met' || r[DR].met !== 1 || r[DR].of !== 1 || JSON.stringify(r[DR].findings) !== '["F-001"]') fail(`a census whose members are all strengths must read met, 1 of 1, citing F-001 (got ${r[DR]?.status} ${r[DR]?.met}/${r[DR]?.of} [${r[DR]?.findings}])`);
    if (r[MS]?.status !== 'met' || JSON.stringify(r[MS].findings) !== '["F-010"]') fail(`a census with members and an agreeing authored count must read met citing F-010 (got ${r[MS]?.status} [${r[MS]?.findings}])`);
    const v = assay('validate', run);
    if (v.status !== 0) fail(`a census whose members all resolve must validate (exit ${v.status}): ${(v.stdout + v.stderr).split('\n').filter((l) => l.includes('censuses')).join(' | ')}`);

    // (5) the views render the cited strengths on the met row
    const c = assay('compile', run);
    if (c.status !== 0) fail(`compile over the met census must succeed (exit ${c.status}): ${(c.stderr || '').split('\n').slice(-3).join(' | ')}`);
    else {
      const maintain = parseYaml(readFileSync(viewPath(run, 'maintain'), 'utf8'));
      const mrow = (maintain.met || []).find((x) => x.id === DR);
      if (!mrow || JSON.stringify(mrow.findings) !== '["F-001"]') fail(`Maintain's met row for ${DR} must carry findings: [F-001] (got ${JSON.stringify(mrow)})`);
      const owner = parseYaml(readFileSync(viewPath(run, 'owner'), 'utf8'));
      const orow = (owner.beyond_floor?.met || []).find((x) => x.id === DR);
      if (!orow || !Array.isArray(orow.seen) || !orow.seen.some((s) => /full ADR/.test(s))) fail(`Owner's met row for ${DR} must say what was seen in place, F-001's observation (got seen: ${JSON.stringify(orow?.seen)})`);
      const page = readFileSync(ownerPagePath(run), 'utf8');
      if (!/Seen in place: The storage decision is recorded as a full ADR/.test(page)) fail('OWNER.md must render the cited strength under Holds ("Seen in place: …")');
      const notMet = (owner.floor?.open || []).concat(owner.beyond_floor?.open || []).filter((x) => (x.seen || []).length);
      if (notMet.length) fail(`only a met row carries seen: (got it on ${notMet.map((x) => x.id).join(', ')})`);
    }

    // (2) a member with no verdict holds the row mixed; a census with no members never reads met
    write([['artifact-legibility', 'decision-reconstruction', ['members: [F-001, F-1400]']], ['context-economy', 'modules-standalone', ['met: 1', 'of: 1']]]);
    r = rows();
    if (r[DR]?.status !== 'mixed' || !/with no verdict.*F-1400/.test(r[DR].note) || r[DR].met !== 1 || r[DR].of !== 2) fail(`a census with a fact member must read mixed, 1 of 2, naming F-1400 (got ${r[DR]?.status} ${r[DR]?.met}/${r[DR]?.of}: ${r[DR]?.note})`);
    if (r[MS]?.status !== 'mixed' || !/lists no members/.test(r[MS].note) || r[MS].findings.length) fail(`an authored 1 of 1 with no members must read mixed, saying it lists no members (got ${r[MS]?.status}: ${r[MS]?.note})`);

    // (3) a strength never turns a row with a gap to met; on a safety row, not even to mixed
    write([['artifact-legibility', 'decision-reconstruction', ['members: [F-001, F-010, F-002]']], ['context-economy', 'modules-standalone', ['members: [F-002]']]]);
    r = rows();
    if (r[DR]?.status !== 'mixed' || !/1 gap: F-002/.test(r[DR].note) || !['F-001', 'F-010', 'F-002'].every((id) => r[DR].findings.includes(id))) fail(`two strengths beside a gap must read mixed, citing every member (got ${r[DR]?.status} [${r[DR]?.findings}]: ${r[DR]?.note})`);
    if (r[MS]?.status !== 'unmet' || JSON.stringify(r[MS].findings) !== '["F-002"]') fail(`a census of one gap must read unmet citing it (got ${r[MS]?.status} [${r[MS]?.findings}])`);
    const reg = loadYardstick();
    const safety = { ...reg, requirements: reg.requirements.map((d) => (d.id === DR ? { ...d, tier: 'safety' } : d)) };
    const fs = ['F-001', 'F-010'].map((id) => ({ id, polarity: 'strength' })).concat([{ id: 'F-002', polarity: 'gap' }]);
    const inputs = { dimensions: [{ dimension: 'artifact-legibility', sampled: [{ name: 'decision-reconstruction', members: ['F-001', 'F-010', 'F-002'], method: 'x' }] }] };
    const s = measureRun({ findings: fs, manifest: [], inputs, coverage: {} }, safety).find((x) => x.id === DR);
    if (s?.status !== 'unmet') fail(`on a safety row a gap reads unmet whatever strengths sit beside it (got ${s?.status}: ${s?.note})`);

    // (4) an authored met/of that disagrees with members: fails validate, for that reason only
    // (a fresh copy: the compile above wrote a measurement a changed census would drift from)
    rmSync(run, { recursive: true, force: true });
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    for (const [body, re] of [[['members: [F-001, F-002]', 'met: 2', 'of: 2'], /authored met: 2 disagrees with members: \(1 strength of 2 members\)/], [['members: [F-001, F-099]'], /members: F-099 is not a finding in this run/], [['members: [F-001, F-001]'], /members: F-001 is listed twice/]]) {
      write([['artifact-legibility', 'decision-reconstruction', body]]);
      const w = assay('validate', run);
      const violations = String(w.stderr).split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4));
      if (w.status === 0 || !violations.some((x) => re.test(x))) fail(`validate must refuse ${body.join(', ')} naming ${re} (exit ${w.status})`);
      const stray = violations.filter((x) => !re.test(x));
      if (stray.length) fail(`validate refused ${body.join(', ')} for other reasons too, so it cannot prove its own check: ${stray.join(' | ')}`);
    }

    // (6) a met effect row cites the effect findings it read
    const eff = { channel: 'send-thing', reversibility: 'irreversible', external: true, gate_type: 'deterministic-halt', fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'tenant' };
    const e = measureRun({ findings: [{ id: 'F-1', polarity: 'fact', subject_type: 'effect', effect: eff }], manifest: [], inputs: {}, coverage: {}, channels: { candidates: ['tool: send_thing'], triage: [{ candidate: 'tool: send_thing', finding: 'F-1' }] } }, reg);
    for (const id of ['d-effects-gated', 'd-effects-traced', 'd-effects-provable', 'd-gates-fail-closed']) {
      const x = e.find((y) => y.id === id);
      if (x?.status !== 'met' || JSON.stringify(x.findings) !== '["F-1"]') fail(`${id} met over a closed population must cite the effect finding it read (got ${x?.status} [${x?.findings}])`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
