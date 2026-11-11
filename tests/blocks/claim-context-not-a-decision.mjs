// ── a claim row shows what the run saw on it as context, never as a decision (#262, M4 of #257) ──
// Eight claim rows stay the owner's (yardstick/README.md "The claim rows a run evidences"), and a
// run still sees evidence on them. The review lists it in the row's context list (map/censuses.yaml
// `context:`, map/SCHEMA.md §6b); the yardstick places those findings on the row through the one
// reading of which requirement takes a finding (requirementTaking, the row's population term).
// Pinned, on a fixture run (notesbox) with findings on two claim rows' populations:
//   (a) the row's status stays not measured, its findings: stay empty, and the ids ride on the
//       row as context:, in yardstick.yaml too;
//   (b) a packet that decides the row decides it alone: met by the owner's word, findings: still
//       empty, the context still beside it;
//   (c) the views carry the ids as context (Intake/Maintain to_run, Owner not_measured with the
//       observations), never under met or open from the run, and every page labels them
//       "Seen in this run (context, not a decision)";
//   (d) requirementTaking places each listed finding on its claim row, so none is a discovery
//       candidate, and an unplaced finding stays one;
//   (e) validate refuses a context list no claim row names, an id the run lacks, an id listed in
//       two lists, an id that is also a census member, and a list with a count; and a stored
//       context: the lists do not give is drift.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRun, loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { requirementTaking } from '../../yardstick/population.mjs';
import { untakenFindings } from '../../yardstick/untaken.mjs';
import { loadFindings, loadAdapters } from '../../map/project.mjs';
import { censusesPath, viewPath, ownerPagePath, yardstickPath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'claim-context-not-a-decision';

const LABEL = 'Seen in this run (context, not a decision)';
const FINDINGS = `
- id: F-064
  dimension: context-economy
  polarity: gap
  subject_type: process
  observation: >
    No file records which model the assistant calls, why it was chosen, or what would trigger
    re-checking it when a new model ships.
  evidence: [lib/agent.mjs:19]
  confidence: confirmed

- id: F-065
  dimension: context-economy
  polarity: strength
  subject_type: process
  observation: >
    The assistant's answers are checked by a small eval of example notes that runs in CI.
  evidence: [test/smoke.mjs:9]
  confidence: confirmed

- id: F-067
  dimension: context-economy
  polarity: strength
  subject_type: control
  observation: >
    The smoke suite carries a fixture with an invalid token that is meant to turn the auth check
    red when the check is weakened.
  evidence: [test/smoke.mjs:9]
  confidence: confirmed

- id: F-066
  dimension: context-economy
  polarity: gap
  subject_type: process
  observation: >
    A second, unplaced observation about the assistant's prompt that no population takes.
  evidence: [lib/agent.mjs:11]
  confidence: confirmed
`;
const QUAL = 'd-model-qualification', EVALS = 'd-ai-feature-evals';
const CONTEXT = `context:\n  - name: model-qualification\n    members: [F-064]\n  - name: ai-feature-evals\n    members: [F-065]\n  - name: guard-fixtures\n    members: [F-067]\n`;

export async function run() {
  const fail = (m) => negFailures.push('claim-context-not-a-decision: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  // a run that fails validate: its bullet lines (a run that passes has none, its warnings aside)
  const violations = (dir) => { const v = assay('validate', dir); return v.status === 0 ? [] : (v.stdout + v.stderr).split('\n').filter((l) => /•/.test(l)); };
  const tmp = mkdtempSync(join(tmpdir(), 'assay-claim-context-'));
  try {
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    appendFileSync(join(run, 'map', 'findings', 'practice-review-context.yaml'), FINDINGS);
    writeFileSync(censusesPath(run), CONTEXT);

    // (a) not measured, no findings, the context beside it
    let r = Object.fromEntries(projectRun(run).map((x) => [x.id, x]));
    for (const [id, ids] of [[QUAL, ['F-064']], [EVALS, ['F-065']], ['d-guards-bite', ['F-067']]]) {
      if (r[id]?.status !== 'not-measured' || r[id].how !== 'claim') fail(`${id}: a claim row stays not measured whatever the run saw (got ${r[id]?.status} by ${r[id]?.how})`);
      if ((r[id]?.findings || []).length) fail(`${id}: what the run saw stays out of findings: (got [${r[id]?.findings}])`);
      if (JSON.stringify(r[id]?.context) !== JSON.stringify(ids)) fail(`${id}: the context list's ids ride on the row as context: (got ${JSON.stringify(r[id]?.context)})`);
    }
    if (r['d-one-home-per-fact']?.context) fail('a claim row whose context list the run did not write carries no context:');
    if (violations(run).length) fail(`a run with context lists validates (got ${violations(run).slice(0, 3).join(' | ')})`);

    // (c) the views: context, labelled, never met or open
    const c = assay('compile', run);
    if (c.status !== 0) fail(`a run with context lists compiles (exit ${c.status}): ${(c.stderr || '').split('\n').slice(-3).join(' | ')}`);
    else {
      const ys = parseYaml(readFileSync(yardstickPath(run), 'utf8')).requirements.find((x) => x.id === QUAL);
      if (JSON.stringify(ys?.context) !== '["F-064"]' || (ys?.findings || []).length) fail(`yardstick.yaml carries context: [F-064] and findings: [] on ${QUAL} (got ${JSON.stringify(ys)})`);
      for (const view of ['maintain', 'intake']) {
        const y = parseYaml(readFileSync(viewPath(run, view), 'utf8'));
        for (const key of ['met', 'open']) if ((y[key] || []).some((x) => [QUAL, EVALS, 'd-guards-bite'].includes(x.id))) fail(`${view}: a claim row is never under ${key} from the run`);
      }
      const owner = parseYaml(readFileSync(viewPath(run, 'owner'), 'utf8'));
      const nm = (owner.beyond_floor?.not_measured || []).find((x) => x.id === QUAL);
      if (JSON.stringify(nm?.context) !== '["F-064"]' || !(nm?.context_seen || []).some((s) => /No file records which model/.test(s)) || (nm?.findings || []).length || (nm?.where || []).length || (nm?.seen || []).length) fail(`Owner's not_measured ${QUAL} carries context: [F-064] and its observation in context_seen, with findings, where and seen empty (got ${JSON.stringify(nm)})`);
      const pages = { 'OWNER.md': readFileSync(ownerPagePath(run), 'utf8'), ...Object.fromEntries(['INTAKE.md', 'MAINTAIN.md'].map((p) => [p, (() => { try { return readFileSync(join(run, p), 'utf8'); } catch { return ''; } })()])) };
      if (!pages['OWNER.md'].includes(`${LABEL}: No file records which model`)) fail(`OWNER.md renders the context after the row as "${LABEL}: <observation>"`);
      const maintainYaml = parseYaml(readFileSync(viewPath(run, 'maintain'), 'utf8'));
      const fleetClaims = (maintainYaml.to_run || []).filter((x) => x.context && x.context.length);
      if (JSON.stringify(fleetClaims.map((x) => [x.id, x.context])) !== '[["d-guards-bite",["F-067"]]]') fail(`Maintain's to_run carries d-guards-bite (a fleet claim row) with context: [F-067], and no other row with a context (got ${JSON.stringify(fleetClaims.map((x) => [x.id, x.context]))})`);
      for (const x of fleetClaims) if (!new RegExp(`\\*\\*${x.id}\\*\\*.*${LABEL.replace(/[()]/g, '\\$&')}: ${x.context.join(', ')}`).test(pages['MAINTAIN.md'])) fail(`MAINTAIN.md labels ${x.id}'s context "${LABEL}"`);
      for (const [p, text] of Object.entries(pages)) for (const line of text.split('\n').filter((l) => l.includes(LABEL))) {
        if (/\b(met|unmet|mixed)\b/i.test(line.slice(line.indexOf(LABEL)))) fail(`${p}: the context label and what follows it never read met or unmet ("${line.slice(line.indexOf(LABEL), line.indexOf(LABEL) + 120)}")`);
      }
    }

    // (b) a packet decides the row alone; the context stays beside it
    const reg = loadYardstick();
    const findings = loadFindings(run);
    const inputs = parseYaml(readFileSync(censusesPath(run), 'utf8'));
    const packet = { claims: [{ id: QUAL, state: 'satisfied', by: 'owner', evidence: 'docs/models.md' }] };
    const withPacket = measureRun({ findings, manifest: [], inputs, coverage: {}, packet }, reg).find((x) => x.id === QUAL);
    if (withPacket?.basis === 'owner') {
      if ((withPacket.findings || []).length || JSON.stringify(withPacket.context) !== '["F-064"]') fail(`a packet-decided claim row keeps findings: empty and the context beside it (got ${JSON.stringify(withPacket)})`);
    } else fail(`test setup: the packet decides ${QUAL} (got basis ${withPacket?.basis}, ${withPacket?.status}: ${withPacket?.note})`);

    // (d) the one reading places each listed finding on its claim row; an unplaced one stays a candidate
    const adapters = loadAdapters();
    const byId = new Map(findings.map((f) => [f.id, f]));
    const t = requirementTaking(byId.get('F-064'), { member: 'model in use', reg, adapters });
    if (t.requirement !== QUAL) fail(`requirementTaking places a "model in use" finding on ${QUAL} (got ${JSON.stringify(t)})`);
    const untaken = new Set(untakenFindings({ findings, censuses: inputs, reg, adapters }).map((f) => f.id));
    if (['F-064', 'F-065', 'F-067'].some((id) => untaken.has(id))) fail('a finding in a claim row\'s context list is taken by the row, never a discovery candidate');
    if (!untaken.has('F-066')) fail('a finding in no census and no context list stays a discovery candidate');

    // (e) validate refuses a malformed context list, and a stored context: the lists do not give
    const bad = [
      ['a list no claim row names', `context:\n  - name: doc-freshness\n    members: [F-064]\n`, /no claim row names the context list "doc-freshness"/],
      ['an id the run lacks', `context:\n  - name: model-qualification\n    members: [F-9999]\n`, /F-9999 is not a finding in this run/],
      ['an id in two lists', `context:\n  - name: model-qualification\n    members: [F-064]\n  - name: ai-feature-evals\n    members: [F-064]\n`, /F-064 is listed in two context lists/],
      ['an id that is a census member', `dimensions:\n  - dimension: artifact-legibility\n    depth: >\n      x (F-001).\n    sampled:\n      - name: decision-reconstruction\n        what: "x"\n        members: [F-001]\n        method: "x"\n${CONTEXT.replace('[F-064]', '[F-001]')}`, /F-001 is also a census member/],
      ['a count', `context:\n  - name: model-qualification\n    members: [F-064]\n    met: 1\n`, /a context list carries no met/],
    ];
    for (const [what, body, want] of bad) {
      const dir = join(tmp, `bad-${bad.findIndex((b) => b[0] === what)}`);
      cpSync(join(HERE, 'fixtures', 'notesbox'), dir, { recursive: true });
      appendFileSync(join(dir, 'map', 'findings', 'practice-review-context.yaml'), FINDINGS);
      mkdirSync(join(dir, 'map'), { recursive: true });
      writeFileSync(censusesPath(dir), body);
      const v = violations(dir);
      if (!v.some((l) => want.test(l))) fail(`validate refuses ${what} (got ${v.slice(0, 3).join(' | ') || 'no violation'})`);
    }
    const ysPath = yardstickPath(run);
    writeFileSync(ysPath, readFileSync(ysPath, 'utf8').replace('context: [F-064]', 'context: [F-064, F-066]'));
    if (!violations(run).some((l) => /d-model-qualification: context drift/.test(l))) fail('a stored context: the run\'s lists do not give reads as drift');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
