// ── the fix sequence is ordered by what a finding is, never by its scanner or item kind (#306) ──
// One key places every sequenced item, read off its worst open gap (views/improve/sequence.mjs,
// views/README.md `handoff/sequence.json`): an unheld halt first, then the tier of the
// requirement the measurement lists it on, then severity. Pinned over a fixture run holding:
//   F-053  an unheld halt (an irreversible, outward effect with no gate)      practice review
//   F-1003 a code-review High on a safety-tier row (d-routes-authorized)       code review
//   F-902  a failing fresh-clone test step (verification tier, banded High)    fresh-clone
//   F-054  a Low on a verification-tier row (d-effects-provable)               practice review
//   F-1100 a census documentation row: no architecture page (legibility)      census
//   F-1101 a census evidence row: no evidence transcript (operability)         census
// Held:
//   (a) sequence.json and START-HERE put the halt first, then the safety High, and the
//       documentation and evidence rows after every tiered gap that is not one;
//   (b) each item's rank names the halt, tier and severity that placed it;
//   (c) the order is the same when the halt sits in an authored roadmap item: the item's kind
//       never moves it.
// Under the kind-first order this replaced (roadmap, triage, then remedies by severity) the
// halt, which carries no severity, was last and the census rows came before the Low.
// Re-pinned by #316: severity now bounds tier (halt, severity class, absent evidence, tier,
// severity), so the two census Mediums come after every High and before the verification Low;
// a High still never follows them, and neither carries evidence_absent here, so neither is
// moved by the absent-evidence clause (tests/blocks/sequence-severity-bounds-tier.mjs pins it).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'sequence-by-what-a-finding-is';

const EXPECTED = ['F-053', 'F-1003', 'F-902', 'F-1100', 'F-1101', 'F-054'];

// a fixture run: notesbox's public run record, raw inputs and effect triage, with these findings
export function writeRankFixture(dir) {
  rmSync(dir, { recursive: true, force: true });
  const src = join(ROOT, 'tests', 'fixtures', 'notesbox', 'map');
  mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
  for (const x of ['raw', 'coverage']) cpSync(join(src, x), join(dir, 'map', x), { recursive: true });
  writeFileSync(join(dir, 'map', 'effect-triage.yaml'), readFileSync(join(src, 'effect-triage.yaml'), 'utf8'));
  // the census ran in this run (notesbox records it skipped)
  writeFileSync(join(dir, 'map', 'scanners.yaml'), readFileSync(join(src, 'scanners.yaml'), 'utf8')
    .replace(/  repo-census:\n    status: skipped\n    reason: "[^"]*"\n/, '  repo-census:\n    status: ran\n'));
  const F = (o) => `- id: ${o.id}\n${Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => typeof v === 'string' && !v.startsWith('[') && !v.startsWith('\n') ? `  ${k}: ${JSON.stringify(v)}` : `  ${k}:${v.startsWith('\n') ? v : ' ' + v}`).join('\n')}\n`;
  writeFileSync(join(dir, 'map', 'findings', 'practice-review-delegation.yaml'), [
    F({ id: 'F-053', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', confidence: 'confirmed',
      observation: 'POST /sync pushes every user\'s notes to an external backup service with no authority check and no halt.',
      evidence: '[lib/sync.mjs:8]', fix: 'Put the sync behind an authorization check and a confirm step.',
      effect: '\n    channel: backup-sync\n    reversibility: irreversible\n    external: true\n    gate_type: none\n    telemetry: none\n    blast_scope: tenant' }),
    F({ id: 'F-054', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', confidence: 'confirmed', severity: 'Low',
      observation: 'Saving a note rewrites its row in place and leaves no record that the write happened.',
      evidence: '[lib/db.mjs:28]', fix: 'Emit a structured record of each note write.',
      effect: '\n    channel: note-save\n    reversibility: reversible\n    external: false\n    gate_type: initiated-by-person\n    telemetry: none\n    blast_scope: user' }),
  ].join('\n'));
  writeFileSync(join(dir, 'map', 'findings', 'deep-code-review.yaml'), F({ id: 'F-1003', source: 'deep-code-review', native_id: 'F4', native_category: 'B',
    polarity: 'gap', severity: 'High', confidence: 'confirmed', title: 'A member can purge the workspace',
    observation: 'requireAdmin() checks only the role the token claims, so any member token can call the purge route.',
    evidence: '[routes/admin.mjs:7]', fix: 'Check the caller\'s role on the server before the purge route runs.' }));
  writeFileSync(join(dir, 'map', 'findings', 'fresh-clone.yaml'), F({ id: 'F-902', source: 'fresh-clone', native_id: 'test:failed', native_category: 'test',
    polarity: 'gap', severity: 'High', observation: 'Fresh-clone step test failed (exit 1).', evidence: '[package.json:1]',
    fix: 'Make the test step pass on a clean checkout; re-run fresh-clone and confirm test passes.' }));
  writeFileSync(join(dir, 'map', 'findings', 'repo-census.yaml'), [
    F({ id: 'F-1100', source: 'repo-census', native_id: 'architecture-page@root', native_category: 'architecture-page', polarity: 'gap', severity: 'Medium',
      observation: 'No architecture page found.', evidence: '[./:1]', fix: 'Add a page that names every external service and data store.' }),
    // #311 retired d-monitoring-with-alert, whose census row this was; the operability row is
    // now the read of the live health report, decided the same way, so the rank is unchanged
    F({ id: 'F-1101', source: 'repo-census', native_id: 'evidence-d-health-reported@root', native_category: 'evidence-d-health-reported', polarity: 'gap', severity: 'Medium',
      observation: 'No evidence transcript for a read of the live health report.', evidence: '[./:1]', fix: 'Record the transcript of the live health report being read.' }),
  ].join('\n'));
}

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-sequence-by-what');
  const handoff = () => spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
  const read = () => {
    const p = join(tmp, 'handoff', 'sequence.json');
    const doc = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { sequence: [] };
    const start = existsSync(join(tmp, 'handoff', 'START-HERE.md')) ? readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8') : '';
    const lines = (start.split('## Sequence')[1] || '').split('\n').filter((l) => /^\d+\. /.test(l));
    return { doc, lines, order: doc.sequence.map((s) => s.findings.join('+')) };
  };
  const startOrder = (lines) => lines.map((l) => (EXPECTED.find((id) => new RegExp('`' + id + '`').test(l)) || '?'));

  // (a) the order, in sequence.json and in START-HERE
  writeRankFixture(tmp);
  const h = handoff();
  if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); rmSync(tmp, { recursive: true, force: true }); return; }
  const a = read();
  if (a.order.join(' ') !== EXPECTED.join(' ')) fail(`sequence.json must order halt, safety High, verification High, documentation Medium, evidence Medium, verification Low: ${EXPECTED.join(' ')} (got ${a.order.join(' ')})`);
  if (startOrder(a.lines).join(' ') !== EXPECTED.join(' ')) fail(`START-HERE must list the same order as sequence.json: ${EXPECTED.join(' ')} (got ${startOrder(a.lines).join(' ')})`);
  const at = (id) => a.order.indexOf(id);
  if (at('F-053') !== 0) fail(`the unheld halt must be item 1 (got item ${at('F-053') + 1})`);
  if (at('F-1003') !== 1) fail(`the code-review High on a safety-tier row must be item 2 (got item ${at('F-1003') + 1})`);
  for (const doc of ['F-1100', 'F-1101']) for (const gap of ['F-1003', 'F-902'])
    if (at(doc) < at(gap)) fail(`the census row ${doc} must come after the High ${gap} (items ${at(doc) + 1} and ${at(gap) + 1})`);

  // (b) the rank names what placed each item
  const rankOf = (id) => (a.doc.sequence.find((s) => s.findings.includes(id)) || {}).rank;
  const want = { 'F-053': { halt: true, tier: 'safety' }, 'F-1003': { halt: false, tier: 'safety', severity: 'High' }, 'F-902': { halt: false, tier: 'verification', severity: 'High' },
    'F-054': { halt: false, tier: 'verification', severity: 'Low' }, 'F-1100': { halt: false, tier: 'legibility' }, 'F-1101': { halt: false, tier: 'operability' } };
  for (const [id, w] of Object.entries(want)) {
    const r = rankOf(id);
    for (const [k, v] of Object.entries(w)) if (!r || r[k] !== v) fail(`${id}'s rank must carry ${k}: ${JSON.stringify(v)} (got ${JSON.stringify(r)})`);
  }

  // (c) an authored item holding the halt is placed by the halt, not by being authored; an
  // authored item holding only the evidence row is placed by that row, after everything else
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
    'target: "rank fixture"', 'exec_summary: "test"', 'roadmap:',
    '  - slug: record-the-health-read', '    title: "Record a read of the live health report"', '    body: "x"', '    findings: [F-1101]',
    '  - slug: halt-the-sync', '    title: "Halt the backup sync"', '    body: "x"', '    findings: [F-053]', '',
  ].join('\n'));
  const h2 = handoff();
  const c = read();
  if (h2.status !== 0) fail(`handoff.mjs must compile the fixture with a roadmap (exit ${h2.status}): ${h2.stderr.slice(0, 600)}`);
  if (c.order.join(' ') !== EXPECTED.join(' ')) fail(`an authored item must take the place its findings give it, the same order as without the roadmap: ${EXPECTED.join(' ')} (got ${c.order.join(' ')})`);
  if (c.doc.sequence[0]?.kind !== 'authored' || c.doc.sequence[4]?.kind !== 'authored') fail(`the two authored items must be items 1 and 5 (got kinds ${c.doc.sequence.map((s) => s.kind).join(', ')})`);

  rmSync(tmp, { recursive: true, force: true });
}
