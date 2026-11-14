// ── an owner reads the most consequential confirmed problems first (#316) ──
// On four real runs the fix sequence buried release-trust and alerting findings: the reviewer's
// K and M findings were unplaced and the key ranked an unplaced finding after every tiered one,
// so a High trailed tiered Lows; the halt flag never fired; the practice review's gaps, which
// carry no fix, sat only in `pending`; and a census "no evidence transcript" row led confirmed
// findings of the same severity. The key is now halt, severity class, absent evidence after
// observed gaps, tier, severity (views/improve/sequence.mjs, views/README.md). Pinned over a
// fixture run holding:
//   F-1001 a reviewer K High: a promoter's tag runs the production apply first   (release trust,
//          named by no property: placed by its markers, a halt by d-release-path-trusted's halt_at)
//   F-1002 a reviewer K Low: a base image floats on a mutable tag                  (supply chain)
//   F-1003 a reviewer B High on d-routes-authorized                                 (safety)
//   F-1004 a reviewer M Medium: production has no alert policy at all              (operability)
//   F-1005 a reviewer B Low, F-1006 a reviewer B Nit                                (safety)
//   F-902  a failing fresh-clone test step, banded High                            (verification)
//   F-053  an unheld halt effect with no fix                                       practice review
//   F-055  a fail-open spend ceiling with no fix, Medium, on d-gates-fail-closed  (safety)
//   F-054  a Low effect with no record                                             (verification)
//   F-056  a process gap with no fix that no requirement takes and names no property
//   F-1100 no evidence transcript for backup-restore (Medium, safety, absent evidence)
//   F-1101 no evidence transcript for the health read (Medium, operability, absent evidence)
// Held:
//   (a) sequence.json and START-HERE put the halt and the release-trust High first, both marked
//       halt, and list the same order;
//   (b) no Blocker, Critical or High ranks below a Medium, Low, Nit or unrated item, and no
//       Medium below a Low, Nit or unrated one;
//   (c) the absent transcripts come after every confirmed Medium, the safety one included after
//       the operability alerting Medium;
//   (d) the practice review's fix-less gaps are sequenced as owner items, one per requirement;
//       the one no requirement takes is in `pending`, and START-HERE names it with the reason;
//   (e) the K and M findings are on their rows: release trust on d-release-path-trusted, the
//       pinning Low on d-dependencies-pinned, the alerting Medium on d-routing-proportionate;
//   (f) renaming every scanner, with its adapter, leaves the order as it was.
// Re-pinned by #319 (slice 3): the order handed on is now a named lens over the quadrants, and this
// key is the default lens's tie-break inside a quadrant. (a) to (c) hold on the key's order, read off
// the engine (buildSequence's keyOrder, tests/blocks/quadrants-and-lenses.mjs keyOrderOf), exactly
// as before; sequence.json and START-HERE are held to that order grouped by risk-first's quadrants,
// and (b) still holds inside every quadrant of sequence.json; (f) reads keyOrder.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { keyOrderOf, riskFirstOf } from './quadrants-and-lenses.mjs';
import { buildSequence } from '../../views/improve/sequence.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';

export const label = 'sequence-severity-bounds-tier';

// the severity classes the invariant names: a High never ranks below a Medium, a Medium never
// below a Low, Nit or unrated item
const SEVERITY_CLASS = { Blocker: 0, Critical: 0, High: 0, Medium: 1, Low: 2, Nit: 2, unrated: 2 };

export const EXPECTED = ['F-1001', 'F-053', 'F-1003', 'F-902', 'F-055', 'F-1004', 'F-1100', 'F-1101', 'F-1005', 'F-1006', 'F-1002', 'F-054'];

const F = (o) => `- id: ${o.id}\n${Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => typeof v === 'boolean' ? `  ${k}: ${v}` : typeof v === 'string' && !v.startsWith('[') && !v.startsWith('\n') ? `  ${k}: ${JSON.stringify(v)}` : `  ${k}:${v.startsWith('\n') ? v : ' ' + v}`).join('\n')}\n`;
const effect = (o) => `\n${Object.entries(o).map(([k, v]) => `    ${k}: ${v}`).join('\n')}`;
const dcr = (id, cat, severity, title, tag, fix) => F({ id, source: 'deep-code-review', native_id: `R${id.slice(2)}`, native_category: cat, polarity: 'gap', severity, confidence: 'confirmed',
  title, native_tag: tag, observation: `${title}.`, evidence: '[server.mjs:1]', fix });

// a fixture run: notesbox's public run record, raw inputs, coverage and effect triage, with these findings
export function writeBoundsFixture(dir) {
  rmSync(dir, { recursive: true, force: true });
  const src = join(ROOT, 'tests', 'fixtures', 'notesbox', 'map');
  mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
  for (const x of ['raw', 'coverage']) cpSync(join(src, x), join(dir, 'map', x), { recursive: true });
  writeFileSync(join(dir, 'map', 'effect-triage.yaml'), readFileSync(join(src, 'effect-triage.yaml'), 'utf8'));
  writeFileSync(join(dir, 'map', 'scanners.yaml'), readFileSync(join(src, 'scanners.yaml'), 'utf8')
    .replace(/  repo-census:\n    status: skipped\n    reason: "[^"]*"\n/, '  repo-census:\n    status: ran\n'));
  writeFileSync(join(dir, 'map', 'findings', 'practice-review-delegation.yaml'), [
    F({ id: 'F-053', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', confidence: 'confirmed',
      observation: 'POST /sync pushes every user\'s notes to an external backup service with no authority check and no halt.', evidence: '[lib/sync.mjs:8]',
      effect: effect({ channel: 'backup-sync', reversibility: 'irreversible', external: 'true', gate_type: 'none', telemetry: 'none', blast_scope: 'tenant' }) }),
    F({ id: 'F-054', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', confidence: 'confirmed', severity: 'Low',
      observation: 'Saving a note rewrites its row in place and leaves no record that the write happened.', evidence: '[lib/db.mjs:28]', fix: 'Emit a structured record of each note write.',
      effect: effect({ channel: 'note-save', reversibility: 'reversible', external: 'false', gate_type: 'initiated-by-person', telemetry: 'none', blast_scope: 'user' }) }),
    F({ id: 'F-055', dimension: 'delegation', polarity: 'gap', subject_type: 'effect', confidence: 'confirmed', severity: 'Medium',
      observation: 'The spend ceiling prices a call at zero when its price is unset, so the check lets every call through.', evidence: '[lib/db.mjs:12]',
      effect: effect({ channel: 'note-index', reversibility: 'reversible', external: 'false', gate_type: 'deterministic-halt', fail_mode: 'open', telemetry: 'structured-event', blast_scope: 'user' }) }),
    F({ id: 'F-056', dimension: 'delegation', polarity: 'gap', subject_type: 'process', confidence: 'confirmed', severity: 'Low',
      observation: 'No one is named as the owner of the backup account.', evidence: '[README.md:1]' }),
  ].join('\n'));
  writeFileSync(join(dir, 'map', 'findings', 'deep-code-review.yaml'), [
    dcr('F-1001', 'K', 'High', 'A promoter\'s tag runs the production apply before the production reviewer', 'release · deploy', 'Bind the apply job to the production environment so its reviewer gates it.'),
    dcr('F-1002', 'K', 'Low', 'The base image floats on a mutable tag', 'supply chain', 'Pin the base image by digest.'),
    dcr('F-1003', 'B', 'High', 'A member can purge the workspace', 'authz', 'Check the caller\'s role on the server before the purge route runs.'),
    dcr('F-1004', 'M', 'Medium', 'Production has no alert policy at all', 'alerting', 'Write a routing policy that names who reads each signal.'),
    dcr('F-1005', 'B', 'Low', 'An admin route echoes the request id unescaped', 'xss', 'Escape the request id before it is written.'),
    dcr('F-1006', 'B', 'Nit', 'The purge route logs at debug', 'logging', 'Log the purge at info.'),
  ].join('\n'));
  writeFileSync(join(dir, 'map', 'findings', 'fresh-clone.yaml'), F({ id: 'F-902', source: 'fresh-clone', native_id: 'test:failed', native_category: 'test',
    polarity: 'gap', observation: 'Fresh-clone step test failed (exit 1).', evidence: '[package.json:1]',
    fix: 'Make the test step pass on a clean checkout; re-run fresh-clone and confirm test passes.' }));
  writeFileSync(join(dir, 'map', 'findings', 'repo-census.yaml'), [
    F({ id: 'F-1100', source: 'repo-census', native_id: 'evidence-d-backup-restore-exercised@root', native_category: 'evidence-d-backup-restore-exercised', polarity: 'gap', evidence_absent: true,
      observation: 'No evidence transcript found for d-backup-restore-exercised.', evidence: '[./:1]', fix: 'Run the restore and record its transcript.' }),
    F({ id: 'F-1101', source: 'repo-census', native_id: 'evidence-d-health-reported@root', native_category: 'evidence-d-health-reported', polarity: 'gap', evidence_absent: true,
      observation: 'No evidence transcript found for d-health-reported.', evidence: '[./:1]', fix: 'Record the transcript of the live health report being read.' }),
  ].join('\n'));
}

const order = (seq) => seq.map((s) => s.ps.map((p) => p.f.id).sort().join('+')).join(' ');
const renamed = (decided, adapters, name) => ({
  decided: decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } })),
  adapters: Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k) }])),
});

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-sequence-severity-bounds');
  try {
    writeBoundsFixture(tmp);
    const h = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
    if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); return; }
    const doc = JSON.parse(readFileSync(join(tmp, 'handoff', 'sequence.json'), 'utf8'));
    const start = existsSync(join(tmp, 'handoff', 'START-HERE.md')) ? readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8') : '';
    const listed = doc.sequence.map((s) => s.findings.join('+'));
    const keyed = keyOrderOf(tmp);
    const got = keyed.map((s) => s.ps.map((p) => p.f.id).join('+'));
    const at = (id) => got.indexOf(id);
    const rankOf = (id) => (doc.sequence.find((s) => s.findings.includes(id)) || {}).rank || {};

    // (a) the halt and the release-trust High lead the key, and sequence.json and START-HERE are its
    // order grouped by the default lens's quadrants
    if (got.join(' ') !== EXPECTED.join(' ')) fail(`the sequence key must order ${EXPECTED.join(' ')} (got ${got.join(' ')})`);
    const qOf = new Map(doc.sequence.map((s) => [s.findings.join('+'), s.quadrant ? s.quadrant.value : null]));
    const lensed = riskFirstOf(EXPECTED, (k) => qOf.get(k));
    if (listed.join(' ') !== lensed.join(' ')) fail(`sequence.json must be the key's order grouped by the default lens's quadrants: ${lensed.join(' ')} (got ${listed.join(' ')})`);
    if (new Set(got.slice(0, 2)).size !== 2 || !['F-1001', 'F-053'].every((id) => got.slice(0, 2).includes(id))) fail(`the unheld halt and the release-trust High must be items 1 and 2 under the sequence key (got ${got.slice(0, 2).join(', ')})`);
    for (const id of ['F-1001', 'F-053']) if (rankOf(id).halt !== true) fail(`${id}'s rank must say halt (got ${JSON.stringify(rankOf(id))})`);
    for (const id of EXPECTED.filter((x) => !['F-1001', 'F-053'].includes(x))) if (rankOf(id).halt !== false) fail(`${id} is no halt (got ${JSON.stringify(rankOf(id))})`);
    const lines = (start.split('## Sequence')[1] || '').split('\n').filter((l) => /^\d+\. /.test(l));
    const startOrder = lines.map((l) => (EXPECTED.find((id) => l.includes('`' + id + '`')) || '?'));
    if (startOrder.join(' ') !== listed.join(' ')) fail(`START-HERE must list the same order as sequence.json (got ${startOrder.join(' ')})`);

    // (b) severity bounds tier: under the key, no item ranks below an item of a less severe class,
    // and so inside every quadrant of sequence.json
    const cls = (s) => SEVERITY_CLASS[s.rank.severity] ?? 2;
    keyed.forEach((s, i) => keyed.forEach((later, j) => { if (j > i && !later.rank.halt && !s.rank.halt && cls(later) < cls(s)) fail(`item ${j + 1} (${later.rank.severity}, ${later.ps.map((p) => p.f.id).join('+')}) must not rank below item ${i + 1} (${s.rank.severity}, ${s.ps.map((p) => p.f.id).join('+')}) under the sequence key`); }));
    doc.sequence.forEach((s, i) => { for (const later of doc.sequence.slice(i + 1)) if (later.quadrant?.value === s.quadrant?.value && !later.rank.halt && !s.rank.halt && cls(later) < cls(s)) fail(`inside ${s.quadrant?.value || 'not valued'}, item ${later.n} (${later.rank.severity}) must not rank below item ${s.n} (${s.rank.severity})`); });
    if (at('F-1003') > at('F-1005') || at('F-902') > at('F-054')) fail(`no High may rank below a Low (got ${got.join(' ')})`);

    // (c) absent evidence after every confirmed Medium, whatever its tier
    for (const doc_ of ['F-1100', 'F-1101']) for (const med of ['F-055', 'F-1004'])
      if (at(doc_) < at(med)) fail(`the absent transcript ${doc_} must come after the confirmed Medium ${med} (items ${at(doc_) + 1} and ${at(med) + 1})`);
    if (rankOf('F-1100').absent_evidence !== true || rankOf('F-1004').absent_evidence !== false) fail(`a rank must say whether its gap is absent evidence (got ${JSON.stringify(rankOf('F-1100'))}, ${JSON.stringify(rankOf('F-1004'))})`);

    // (d) the practice review's fix-less gaps are sequenced, one owner item per requirement
    const item = (id) => doc.sequence.find((s) => s.findings.includes(id));
    for (const id of ['F-053', 'F-055']) if (item(id)?.kind !== 'owner' || item(id)?.voice !== 'owner-defined') fail(`the fix-less practice-review gap ${id} must be an owner item (got ${JSON.stringify(item(id))})`);
    if (item('F-055') && !/d-gates-fail-closed/.test(item('F-055').title)) fail(`the owner item names the requirement it groups (got ${item('F-055').title})`);
    if (JSON.stringify(doc.pending) !== JSON.stringify(['F-056'])) fail(`pending must hold only the fix-less gap no requirement takes and no property names (got ${JSON.stringify(doc.pending)})`);
    if (!/1 open gap\(s\) sit outside the sequence\*\* \(`F-056`\): no fix is recorded, no requirement takes it and it names no property/.test(start)) fail('START-HERE must count and name the gap outside the sequence, with the reason');

    // (e) K and M are on their rows
    const y = projectRun(tmp, loadYardstick());
    const on = (req) => (y.find((r) => r.id === req)?.findings || []);
    for (const [req, id] of [['d-release-path-trusted', 'F-1001'], ['d-dependencies-pinned', 'F-1002'], ['d-routing-proportionate', 'F-1004']])
      if (!on(req).includes(id)) fail(`${id} must be listed on ${req} (got ${on(req).join(', ') || 'none'}: ${y.find((r) => r.id === req)?.note})`);
    if (on('d-dependencies-pinned').includes('F-1001')) fail('the release-trust finding must not be filed under d-dependencies-pinned');

    // (f) the key names no scanner: renaming every scanner leaves the order
    const yardstick = loadYardstick();
    const adapters = loadAdapters();
    const { projected } = projectMulti(loadFindings(tmp), adapters);
    const decided = decideProjected(projected, loadDecisions(tmp), '');
    const before = order(buildSequence({ decided, adapters, roadmap: [], measurement: y, yardstick }).keyOrder);
    for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`]) {
      const r = renamed(decided, adapters, name);
      const after = order(buildSequence({ decided: r.decided, adapters: r.adapters, roadmap: [], measurement: y, yardstick }).keyOrder);
      if (after !== before) fail(`renaming the scanners must not move the sequence (was ${before}, renamed ${after})`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
