// ── the effect-channel population, closed (#259, part of #257 M1) ──
// An effect requirement reads met only over a population someone enumerated and triaged:
//  1. `assay start` writes the deterministic enumeration into the run (map/raw/enumerate.json),
//     and `enumerate --json` prints the populations without --run;
//  2. the practice-review lane is given that file (inputs:) and publishes the triage
//     (map/effect-triage.yaml); a seed without --inputs-dir is refused;
//  3. validate holds the triage: every candidate once, every finding an effect, every
//     out-of-scope entry a reason;
//  4. the four effect facet rules read met only when the list exists and every candidate is
//     triaged: an untriaged candidate turns met mixed, naming it; no list reads not measured
//     with the reason;
//  5. d-effect-channels-enumerated is decided by the triage: met / unmet / not measured.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYardstick, measureRun, projectRun } from '../../yardstick/measure.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { writeEnumeration } from '../../map/start.mjs';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'effect-population';

const EFFECT_ROWS = ['d-effects-gated', 'd-effects-traced', 'd-effects-provable', 'd-gates-fail-closed'];

export async function run() {
  const fail = (m) => negFailures.push('effect-population: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-effect-pop-'));
  try {
    const target = join(HERE, 'enumerate-fixture', 'target');

    // (1) enumerate --json prints the populations; start's step writes them into the run
    const ej = assay('enumerate', target, '--json');
    let doc = null;
    try { doc = JSON.parse(ej.stdout); } catch { /* reported below */ }
    const members = doc?.populations?.channelCandidates?.map((c) => c.member) || [];
    if (ej.status !== 0 || doc?.schema !== 'enumerate' || !members.includes('tool: send_thing')) fail(`enumerate --json without --run must print the populations (exit ${ej.status}, schema ${doc?.schema}, candidates ${members.join(', ') || 'none'})`);
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(effectTriagePath(run), { force: true });
    rmSync(enumeratePath(run), { force: true });
    const w = writeEnumeration(target, run);
    if (!w.ok || !existsSync(enumeratePath(run))) { fail(`assay start's enumeration step must write map/raw/enumerate.json (${w.reason || 'no file'})`); return; }
    const listed = JSON.parse(readFileSync(enumeratePath(run), 'utf8')).populations.channelCandidates.map((c) => c.member);
    if (JSON.stringify(listed) !== JSON.stringify(members)) fail(`the run's candidate list must be enumerate --json's (got ${listed.join(', ')})`);

    // (2) the lane is given the list, and refuses a seed that does not say where it is
    try { laneSeed('practice-review', { name: 'X' }); fail('practice-review lane seeded without --inputs-dir: it reads map/raw/enumerate.json and must refuse'); }
    catch (e) { if (!/map\/raw\/enumerate\.json/.test(e.message) || !/--inputs-dir/.test(e.message)) fail(`practice-review lane refusal must name the input and --inputs-dir (got: ${e.message})`); }
    const seed = laneSeed('practice-review', { name: 'X', inputsDir: 'the-run' });
    if (!seed.inputs.includes('map/raw/enumerate.json')) fail(`practice-review lane inputs must name map/raw/enumerate.json (got ${seed.inputs.join(' ') || 'none'})`);
    if (!seed.outputs.includes('map/effect-triage.yaml')) fail(`practice-review lane outputs must name map/effect-triage.yaml (got ${seed.outputs.join(' ')})`);
    if (!/`the-run`/.test(seed.prompt) || !/map\/raw\/enumerate\.json/.test(seed.prompt) || !/map\/effect-triage\.yaml/.test(seed.prompt)) fail('practice-review seed must say where the candidate list is and that Pass 0 writes the triage');
    if (!/executes nothing/.test(seed.prompt)) fail('practice-review seed must keep its hard rule: the session executes nothing');

    // (3) validate holds the triage
    const triage = (entries) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: 1\ntriage:\n${entries.map((x) => `  - candidate: "${x[0]}"\n    ${x[1]}`).join('\n')}\n`);
    const complete = [['mcp-toolset: analytics', 'out_of_scope: "read-only: an analytics query toolset, writes nothing"'], ['tool: read_thing', 'out_of_scope: "read-only: returns a record"'], ['tool: send_thing', 'finding: F-052']];
    const validates = (want, re, what) => {
      const v = assay('validate', run);
      const out = v.stdout + v.stderr;
      if (want && v.status !== 0) fail(`${what}: validate must pass (exit ${v.status}): ${out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ')}`);
      if (!want && (v.status === 0 || !re.test(out))) fail(`${what}: validate must refuse it naming ${re} (exit ${v.status})`);
    };
    triage(complete);
    validates(true, null, 'a complete triage');
    triage(complete.slice(1));
    validates(false, /not triaged: mcp-toolset: analytics/, 'a triage that misses a candidate');
    triage([...complete, ['tool: read_thing', 'finding: F-053']]);
    validates(false, /"tool: read_thing" is triaged twice/, 'a triage that triages one candidate twice');
    triage([...complete.slice(0, 2), ['tool: send_thing', 'finding: F-050']]);
    validates(false, /finding F-050 is not an effect finding/, 'a triage that points at a finding that is not an effect');
    triage([['mcp-toolset: analytics', 'out_of_scope: ""'], ...complete.slice(1)]);
    validates(false, /out_of_scope needs the reason/, 'an out-of-scope entry with no reason');
    triage([...complete, ['tool: not_listed', 'out_of_scope: "x"']]);
    validates(false, /"tool: not_listed" is not a channel candidate/, 'a triage of a candidate the list does not hold');

    // (5) on disk: the triage decides d-effect-channels-enumerated
    const enumerated = () => projectRun(run).find((r) => r.id === 'd-effect-channels-enumerated');
    triage(complete);
    let r = enumerated();
    if (r?.kind !== 'facet' || r.status !== 'met' || r.of !== 3 || !r.findings.includes('F-052')) fail(`a complete triage must read d-effect-channels-enumerated met, 3 of 3, citing F-052 (got ${r?.kind} ${r?.status} ${r?.met}/${r?.of} [${r?.findings}])`);
    triage(complete.slice(1));
    r = enumerated();
    if (r?.status !== 'unmet' || !/untriaged: mcp-toolset: analytics/.test(r.note)) fail(`a triage missing a candidate must read d-effect-channels-enumerated unmet naming it (got ${r?.status}: ${r?.note})`);
    rmSync(effectTriagePath(run));
    r = enumerated();
    if (r?.status !== 'unmet' || r.met !== 0) fail(`a candidate list with no triage must read d-effect-channels-enumerated unmet, 0 triaged (got ${r?.status} ${r?.met}/${r?.of})`);
    rmSync(enumeratePath(run));
    r = enumerated();
    if (r?.status !== 'not-measured' || !/no channel candidate list/.test(r.note)) fail(`no candidate list must read d-effect-channels-enumerated not measured with the reason (got ${r?.status}: ${r?.note})`);
    // (4) on disk: no list holds the four effect rows not measured with the reason, findings or not
    const onDisk = Object.fromEntries(projectRun(run).map((x) => [x.id, x]));
    for (const id of EFFECT_ROWS) if (onDisk[id]?.status !== 'not-measured' || !/no channel candidate list \(map\/raw\/enumerate\.json/.test(onDisk[id].note)) fail(`${id} over effect findings with no candidate list must read not measured with the reason (got ${onDisk[id]?.status}: ${onDisk[id]?.note})`);

    // (4) in process: a held halt reads d-effects-gated met over a closed list, mixed over one untriaged candidate
    const reg = loadYardstick();
    const eff = { channel: 'send-thing', reversibility: 'irreversible', external: true, gate_type: 'deterministic-halt', fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'tenant' };
    const findings = [{ id: 'F-1', dimension: 'delegation', polarity: 'strength', subject_type: 'effect', observation: 'x', evidence: ['agent.mjs:8'], confidence: 'confirmed', effect: eff }];
    const by = (channels) => Object.fromEntries(measureRun({ findings, manifest: [{ scanner: 'practice-review', status: 'ran' }], inputs: {}, coverage: {}, channels }, reg).map((x) => [x.id, x]));
    const candidates = ['tool: read_thing', 'tool: send_thing'];
    const closed = by({ candidates, triage: [{ candidate: 'tool: send_thing', finding: 'F-1' }, { candidate: 'tool: read_thing', out_of_scope: 'read-only' }] });
    for (const id of EFFECT_ROWS) if (closed[id]?.status !== 'met') fail(`${id} over a closed population with its one effect held, traced and gated closed must read met (got ${closed[id]?.status}: ${closed[id]?.note})`);
    const open = by({ candidates, triage: [{ candidate: 'tool: send_thing', finding: 'F-1' }] });
    for (const id of EFFECT_ROWS) if (open[id]?.status !== 'mixed' || !/1 of 2 channel candidate\(s\) untriaged: tool: read_thing/.test(open[id].note)) fail(`${id} with one untriaged channel candidate must read mixed, naming it (got ${open[id]?.status}: ${open[id]?.note})`);
    const none = by(null);
    for (const id of [...EFFECT_ROWS, 'd-effect-channels-enumerated']) if (none[id]?.status !== 'not-measured' || !/effect population not closed/.test(none[id].note)) fail(`${id} with no candidate list must read not measured with the reason (got ${none[id]?.status}: ${none[id]?.note})`);
    // a gap the run did record stays unmet beside an untriaged candidate
    const gap = Object.fromEntries(measureRun({ findings: [{ ...findings[0], polarity: 'gap', effect: { ...eff, gate_type: 'none', fail_mode: undefined } }], manifest: [{ scanner: 'practice-review', status: 'ran' }], inputs: {}, coverage: {}, channels: { candidates, triage: [] } }, reg).map((x) => [x.id, x]));
    if (gap['d-effects-gated']?.status !== 'unmet' || !/untriaged: tool: read_thing, tool: send_thing/.test(gap['d-effects-gated'].note)) fail(`an ungated halt beside untriaged candidates must stay unmet, naming them (got ${gap['d-effects-gated']?.status}: ${gap['d-effects-gated']?.note})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
