// ── the claim rows a run can close are decided by census (#262, M4 of #257) ──
// d-model-call-telemetry and d-ingested-content-is-data read not measured from every run while
// the run saw their population: model call sites, and the places outside text comes in. Each is
// now a census row in M3's form (yardstick/README.md "The claim rows a run evidences"), so a run
// whose review lists that census decides it. Pinned on a fixture run (notesbox, which calls a
// model and ingests notes), for each row:
//   (a) a census whose members are all strengths reads the row met, citing them, and the run
//       validates and compiles, Maintain or Intake carrying it under met;
//   (b) a census with a gap member reads it unmet, citing the gap;
//   (c) with no census of that name the row reads not measured, never met, and is no longer a
//       claim (how: census);
//   (d) the members are taken by the row (requirementTaking, through the census's term), so they
//       are no discovery candidates.
// d-model-call-telemetry reads over enumerate's model call sites since #286 (M6), so the run is
// given that list (notesbox's one call site) and its triage to the census's member.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRun, loadYardstick } from '../../yardstick/measure.mjs';
import { untakenFindings } from '../../yardstick/untaken.mjs';
import { loadFindings } from '../../map/project.mjs';
import { censusesPath, viewPath, enumeratePath, censusTriagePath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'claim-rows-census-decided';

// one strength and one gap per row, on notesbox's own files
const FINDINGS = {
  'practice-review-context.yaml': `
- id: F-060
  dimension: context-economy
  polarity: strength
  subject_type: control
  observation: >
    The assistant's one model call writes a structured record per call of its tier, its token
    spend and its outcome to the request log.
  evidence: [lib/agent.mjs:19]
  confidence: confirmed

- id: F-061
  dimension: context-economy
  polarity: gap
  subject_type: process
  observation: >
    The assistant's model call records no tier, token count, cost or outcome; the reply is
    returned and nothing of the call is kept.
  evidence: [lib/agent.mjs:19]
  confidence: confirmed
`,
  'practice-review-delegation.yaml': `
- id: F-062
  dimension: delegation
  polarity: strength
  subject_type: control
  observation: >
    Note bodies arrive through POST /notes and are stored verbatim with their author and time,
    rendered escaped, and never read for directives.
  evidence: [lib/sync.mjs:8]
  confidence: confirmed

- id: F-063
  dimension: delegation
  polarity: gap
  subject_type: control
  observation: >
    Note content is handed to the model and the reply is parsed for a TOOL:send_email directive
    that the code then executes, so text from outside acts as an instruction.
  evidence: [lib/agent.mjs:39]
  confidence: confirmed
`,
};
const ROWS = {
  'd-model-call-telemetry': { census: 'model-call-telemetry', dimension: 'context-economy', strength: 'F-060', gap: 'F-061' },
  'd-ingested-content-is-data': { census: 'ingested-content', dimension: 'delegation', strength: 'F-062', gap: 'F-063' },
};
const censuses = (pick) => `dimensions:\n${Object.values(ROWS).map((r) => `  - dimension: ${r.dimension}\n    depth: >\n      x (F-001).\n    sampled:\n      - name: ${r.census}\n        what: "the population"\n        members: [${pick(r).join(', ')}]\n        method: "every member, one finding each"`).join('\n')}\n`;

export async function run() {
  const fail = (m) => negFailures.push('claim-rows-census-decided: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-claim-census-'));
  try {
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    for (const [file, body] of Object.entries(FINDINGS)) appendFileSync(join(run, 'map', 'findings', file), body);
    const list = JSON.parse(readFileSync(enumeratePath(run), 'utf8'));
    list.populations.modelCalls = [{ member: 'model call: lib/agent.mjs', note: 'a model call site', gateable: true, evidence: ['lib/agent.mjs:19'] }];
    writeFileSync(enumeratePath(run), JSON.stringify(list, null, 2) + '\n');
    const triage = (id) => writeFileSync(censusTriagePath(run), `schema: census-triage\nversion: 1\ncensuses:\n  - census: model-call-telemetry\n    triage:\n      - candidate: "model call: lib/agent.mjs"\n        finding: ${id}\n`);
    const rows = () => Object.fromEntries(projectRun(run).map((x) => [x.id, x]));

    // (c) no census: not measured, by census, never met
    let r = rows();
    for (const id of Object.keys(ROWS)) {
      if (r[id]?.how !== 'census' || r[id]?.status !== 'not-measured') fail(`${id} with no census in the run reads not measured, by census (got ${r[id]?.status} by ${r[id]?.how})`);
    }

    // (a) every member a strength: met, citing them
    writeFileSync(censusesPath(run), censuses((x) => [x.strength]));
    triage(ROWS['d-model-call-telemetry'].strength);
    r = rows();
    for (const [id, x] of Object.entries(ROWS)) {
      if (r[id]?.status !== 'met' || JSON.stringify(r[id].findings) !== JSON.stringify([x.strength]) || r[id].of !== 1) fail(`${id}: a ${x.census} census of one strength reads met, 1 of 1, citing ${x.strength} (got ${r[id]?.status} ${r[id]?.met}/${r[id]?.of} [${r[id]?.findings}]: ${r[id]?.note})`);
    }
    const v = assay('validate', run);
    if (v.status !== 0) fail(`the met fixture run validates (exit ${v.status}): ${(v.stdout + v.stderr).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ')}`);
    const c = assay('compile', run);
    if (c.status !== 0) fail(`the met fixture run compiles (exit ${c.status}): ${(c.stderr || '').split('\n').slice(-3).join(' | ')}`);
    else {
      const maintain = parseYaml(readFileSync(viewPath(run, 'maintain'), 'utf8'));
      const intake = parseYaml(readFileSync(viewPath(run, 'intake'), 'utf8'));
      const met = [...(maintain.met || []), ...(intake.met || [])].map((x) => x.id);
      const owner = parseYaml(readFileSync(viewPath(run, 'owner'), 'utf8'));
      const ownerMet = [...(owner.floor?.met || []), ...(owner.beyond_floor?.met || [])].map((x) => x.id);
      for (const id of Object.keys(ROWS)) {
        if (!ownerMet.includes(id)) fail(`${id}: Owner carries the census-decided row under met`);
        const d = loadYardstick().requirements.find((y) => y.id === id);
        if (((d.tags || []).includes('fleet') || (d.tags || []).includes('floor')) && !met.includes(id)) fail(`${id}: Intake or Maintain carries it under met`);
      }
    }

    // (d) the members are taken by their row, so none is a discovery candidate
    const all = loadFindings(run);
    const untaken = new Set(untakenFindings({ findings: all, censuses: parseYaml(readFileSync(censusesPath(run), 'utf8')) }).map((f) => f.id));
    for (const x of Object.values(ROWS)) if (untaken.has(x.strength)) fail(`${x.strength}, a ${x.census} census member, is taken by its row, never a discovery candidate`);

    // (b) a gap member: unmet, citing the gap
    writeFileSync(censusesPath(run), censuses((x) => [x.gap]));
    triage(ROWS['d-model-call-telemetry'].gap);
    r = rows();
    for (const [id, x] of Object.entries(ROWS)) {
      if (r[id]?.status !== 'unmet' || JSON.stringify(r[id].findings) !== JSON.stringify([x.gap])) fail(`${id}: a ${x.census} census with a gap member reads unmet, citing ${x.gap} (got ${r[id]?.status} [${r[id]?.findings}]: ${r[id]?.note})`);
    }
    const v2 = assay('validate', run);
    if (/F-06[0-3]/.test(v2.stdout + v2.stderr)) fail(`the unmet fixture run's findings validate (got ${(v2.stdout + v2.stderr).split('\n').filter((l) => /F-06/.test(l)).slice(0, 2).join(' | ')})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
