// ── a census a tool can list reads over a triaged candidate list (#286, M6 of #257) ──
// Each lane drew a census's members at its own grain, so sweeps parted on rows they judged alike.
// A census row now names the enumerate population listing its candidates, the lane triages each
// candidate once in map/census-triage.yaml, and:
//   (a) d-credentials-enumerated reads over populations.secrets: met only over a complete triage;
//       mixed, naming the untriaged candidate, over an incomplete one or none; not measured, with
//       the reason, when the run carries no list or a list without the population;
//   (b) d-change-gates-fail-closed reads over populations.changeGates and d-model-call-telemetry
//       over populations.modelCalls, each listed by its enumerate fixture: met over the complete
//       triage of that list, mixed naming an untriaged candidate;
//   (c) validate refuses a missed candidate, a double triage, a finding that is no member of the
//       census, and one member judging two candidates (tests/negative/census-triage-*), each red
//       for its own reason alone, and passes the complete triage;
//   (d) the practice-review lane publishes the triage, and its seed says so.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYardstick, measureRun, projectRun } from '../../yardstick/measure.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { enumeratePath, censusTriagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'census-triage-closed';

const NEGATIVE_TRIAGE = [
  ['census-triage-missed', 'a triage that misses a candidate', /censuses\[2\]\.triage: 1 candidate\(s\) of census credential not triaged: SEARCH_API_KEY/],
  ['census-triage-twice', 'a triage that triages one candidate twice', /"DEPLOY_TOKEN" is triaged twice/],
  ['census-triage-not-member', 'a triage naming a finding that is no member of the census', /finding F-003 is not a member of census credential/],
  ['census-triage-merged', 'a triage in which one member judges two candidates', /finding F-001 already judges .*one candidate, one member/],
];

export async function run() {
  const fail = (m) => negFailures.push('census-triage-closed: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const reg = loadYardstick();
  const manifest = [{ scanner: 'practice-review', status: 'ran' }];
  const control = (id, polarity) => ({ id, dimension: 'delegation', polarity, subject_type: 'control', observation: 'x', evidence: ['a.mjs:1'], confidence: 'confirmed' });
  const listOf = (pops) => ({ channelCandidates: [], routeHandlers: [], effectSites: [], ...Object.fromEntries(Object.entries(pops).map(([p, ms]) => [p, ms.map((member) => ({ member, note: '', gateable: true, evidence: ['a.mjs:1'] }))])) });
  const inputs = (dimension, name, members) => ({ dimensions: [{ dimension, sampled: [{ name, members, method: 'every candidate, one finding each' }] }] });
  const measure = (findings, ins, census) => Object.fromEntries(measureRun({ findings, manifest, inputs: ins, coverage: {}, census }, reg).map((x) => [x.id, x]));

  // (a) credentials, in process
  const creds = [control('F-1', 'strength'), control('F-2', 'strength')];
  const credIn = inputs('delegation', 'credential', ['F-1', 'F-2']);
  const secrets = listOf({ secrets: ['DEPLOY_TOKEN', 'SEARCH_API_KEY', 'TEST_API_KEY'] });
  const full = [{ census: 'credential', triage: [{ candidate: 'DEPLOY_TOKEN', finding: 'F-1' }, { candidate: 'SEARCH_API_KEY', finding: 'F-2' }, { candidate: 'TEST_API_KEY', out_of_scope: 'an inert string planted in a test fixture' }] }];
  let r = measure(creds, credIn, { populations: secrets, triage: full })['d-credentials-enumerated'];
  if (r?.status !== 'met' || r.of !== 2) fail(`d-credentials-enumerated over a complete triage of its secrets reads met, 2 of 2 (got ${r?.status} ${r?.met}/${r?.of}: ${r?.note})`);
  r = measure(creds, credIn, { populations: secrets, triage: [{ census: 'credential', triage: full[0].triage.slice(0, 2) }] })['d-credentials-enumerated'];
  if (r?.status !== 'mixed' || !/1 of 3 candidate\(s\) untriaged: TEST_API_KEY/.test(r.note)) fail(`a credential census with one candidate untriaged reads mixed, naming it (got ${r?.status}: ${r?.note})`);
  r = measure(creds, credIn, { populations: secrets, triage: null })['d-credentials-enumerated'];
  if (r?.status !== 'mixed' || !/3 of 3 candidate\(s\) untriaged/.test(r.note)) fail(`a credential census with no triage at all reads mixed, naming every candidate (got ${r?.status}: ${r?.note})`);
  r = measure(creds, credIn, { populations: secrets, triage: [{ census: 'credential', triage: [{ candidate: 'DEPLOY_TOKEN', finding: 'F-9' }, ...full[0].triage.slice(1)] }] })['d-credentials-enumerated'];
  if (r?.status !== 'mixed' || !/untriaged: DEPLOY_TOKEN/.test(r.note)) fail(`a candidate triaged to a finding that is no member counts untriaged (got ${r?.status}: ${r?.note})`);
  r = measure(creds, credIn, null)['d-credentials-enumerated'];
  if (r?.status !== 'not-measured' || !/census population not closed: the run carries no candidate list/.test(r.note)) fail(`a credential census with no candidate list reads not measured, with the reason (got ${r?.status}: ${r?.note})`);
  r = measure(creds, credIn, { populations: listOf({}), triage: null })['d-credentials-enumerated'];
  if (r?.status !== 'not-measured' || !/lists no populations\.secrets/.test(r.note)) fail(`a candidate list without populations.secrets reads not measured, naming it (got ${r?.status}: ${r?.note})`);
  const gap = measure([control('F-1', 'gap'), control('F-2', 'gap')], credIn, { populations: secrets, triage: null })['d-credentials-enumerated'];
  if (gap?.status !== 'unmet' || !/untriaged: DEPLOY_TOKEN/.test(gap.note)) fail(`a gap the run recorded stays unmet beside untriaged candidates, naming them (got ${gap?.status}: ${gap?.note})`);

  // (b) change gates and model calls, over their enumerate fixtures' own lists
  const listed = (dir) => JSON.parse(assay('enumerate', join(HERE, 'enumerate-fixture', dir), '--json').stdout).populations;
  for (const [id, dir, pop, census, dimension] of [['d-change-gates-fail-closed', 'gates', 'changeGates', 'change-gates', 'deterministic-gates'], ['d-model-call-telemetry', 'models', 'modelCalls', 'model-call-telemetry', 'context-economy']]) {
    const pops = listed(dir);
    const cands = (pops[pop] || []).map((x) => x.member);
    if (cands.length < 3) { fail(`${id}: the ${dir} fixture lists its ${pop} (got ${cands.length})`); continue; }
    const fs = cands.map((_, i) => ({ ...control(`F-${100 + i}`, 'strength'), dimension }));
    const ins = inputs(dimension, census, fs.map((f) => f.id));
    const entries = cands.map((c, i) => ({ candidate: c, finding: `F-${100 + i}` }));
    r = measure(fs, ins, { populations: pops, triage: [{ census, triage: entries }] })[id];
    if (r?.status !== 'met' || r.of !== cands.length) fail(`${id} over a complete triage of the ${dir} fixture's ${cands.length} ${pop} reads met (got ${r?.status} ${r?.met}/${r?.of}: ${r?.note})`);
    r = measure(fs, ins, { populations: pops, triage: [{ census, triage: entries.slice(1) }] })[id];
    if (r?.status !== 'mixed' || !r.note.includes(`untriaged: ${cands[0]}`)) fail(`${id} with ${cands[0]} untriaged reads mixed, naming it (got ${r?.status}: ${r?.note})`);
    r = measure(fs, ins, { populations: listOf({}), triage: null })[id];
    if (r?.status !== 'not-measured' || !r.note.includes(`lists no populations.${pop}`)) fail(`${id} over a list without ${pop} reads not measured, naming it (got ${r?.status}: ${r?.note})`);
  }

  // (c) validate, on the negative fixtures and the complete triage
  for (const [dir, what, expect] of NEGATIVE_TRIAGE) {
    const v = assay('validate', join(HERE, 'negative', dir));
    const violations = (v.stdout + v.stderr).split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4));
    if (v.status === 0) { fail(`negative/${dir} validated green: validate must refuse ${what}`); continue; }
    if (!violations.some((x) => expect.test(x))) fail(`negative/${dir} is red, but not for its reason (${what}): want ${expect}, got ${violations.join(' | ') || 'no listed violation'}`);
    const stray = violations.filter((x) => !expect.test(x));
    if (stray.length) fail(`negative/${dir} is red for other reasons too (${what}): ${stray.join(' | ')}`);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'assay-census-triage-'));
  try {
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'negative', 'census-triage-missed'), run, { recursive: true });
    const base = readFileSync(censusTriagePath(run), 'utf8');
    writeFileSync(censusTriagePath(run), base + '      - candidate: SEARCH_API_KEY\n        finding: F-002\n');
    const v = assay('validate', run);
    if (v.status !== 0) fail(`a complete census triage validates (exit ${v.status}): ${(v.stdout + v.stderr).split('\n').filter((l) => l.startsWith('  • ')).join(' | ')}`);
    r = projectRun(run).find((x) => x.id === 'd-credentials-enumerated');
    if (r?.status !== 'met' || JSON.stringify(r.findings) !== JSON.stringify(['F-001', 'F-002'])) fail(`on disk, the complete triage reads d-credentials-enumerated met, citing F-001, F-002 (got ${r?.status} [${r?.findings}]: ${r?.note})`);
    writeFileSync(censusTriagePath(run), base);
    r = projectRun(run).find((x) => x.id === 'd-credentials-enumerated');
    if (r?.status !== 'mixed' || !/untriaged: SEARCH_API_KEY/.test(r.note)) fail(`on disk, the missed candidate reads d-credentials-enumerated mixed, naming it (got ${r?.status}: ${r?.note})`);
    rmSync(censusTriagePath(run));
    rmSync(enumeratePath(run));
    r = projectRun(run).find((x) => x.id === 'd-credentials-enumerated');
    if (r?.status !== 'not-measured' || !/no candidate list/.test(r.note)) fail(`on disk, no candidate list reads d-credentials-enumerated not measured, with the reason (got ${r?.status}: ${r?.note})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // (d) the lane publishes the triage
  const seed = laneSeed('practice-review', { name: 'X', inputsDir: 'the-run' });
  if (!seed.outputs.includes('map/census-triage.yaml')) fail(`the practice-review lane's outputs name map/census-triage.yaml (got ${seed.outputs.join(' ')})`);
  if (!/map\/census-triage\.yaml/.test(seed.prompt) || !/populations\.secrets/.test(seed.prompt) || !/populations\.changeGates/.test(seed.prompt) || !/populations\.modelCalls/.test(seed.prompt)) fail('the practice-review seed hands each closed census its candidates and says the triage is map/census-triage.yaml');
}
