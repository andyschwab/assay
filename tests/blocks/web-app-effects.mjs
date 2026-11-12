// ── a web app's effects, closed (#269, after #259) ──
// A target with no CLI, skill, tool definition or MCP toolset used to enumerate an empty
// channel-candidate list, which counts as closed, so the effect rows read met over whatever
// effect findings the run recorded. The triage list is now the channel candidates, the route
// handlers and the effect call sites together (map/effect-triage.mjs CANDIDATE_POPULATIONS),
// one entry per member as enumerate collapses it:
//  1. a web app's route handlers and effect-site members are on the run's list;
//  2. an untriaged member turns d-effects-gated met into mixed, naming it; fully triaged, the
//     rule reads over the findings as before (met for a held halt, unmet for an ungated one);
//  3. d-effect-channels-enumerated reads met for a fully triaged web app, unmet naming an
//     untriaged member;
//  4. validate holds the new members to the channel candidates' triage checks;
//  5. a list missing one of the populations is an error, never a shorter closed list.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { loadChannelFiles } from '../../map/effect-triage.mjs';
import { writeEnumeration } from '../../map/start.mjs';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'web-app-effects';

const ROUTE = 'route: POST /api/notes';
const SITE = 'http write (js) @ lib/push.mjs';   // an effect-site member is one file's calls of one kind (#272)
// the notesbox fixture's committed list (tests/fixtures/notesbox/map/raw/enumerate.json) predates
// #272's per-file keys and is read as written: a committed run carries its own enumeration
const NB_SITE = 'http write (js)';

export async function run() {
  const fail = (m) => negFailures.push('web-app-effects: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-web-app-effects-'));
  try {
    // a web app: one app-router handler and one outbound write, nothing agentic
    const target = join(tmp, 'target');
    mkdirSync(join(target, 'app', 'api', 'notes'), { recursive: true });
    mkdirSync(join(target, 'lib'), { recursive: true });
    writeFileSync(join(target, 'app', 'api', 'notes', 'route.mjs'), "import { push } from '../../../lib/push.mjs';\nexport async function POST(req) {\n  return Response.json(await push(await req.json()));\n}\n");
    writeFileSync(join(target, 'lib', 'push.mjs'), "export async function push(note) {\n  await fetch('https://backup.invalid/notes', { method: 'POST', body: JSON.stringify(note) });\n  return { ok: true };\n}\n");
    const run = join(tmp, 'run');
    const w = writeEnumeration(target, run);
    if (!w.ok) { fail(`enumerating the web-app fixture must write the run's list (${w.reason})`); return; }

    // (1) the list holds the route and the effect site, though no channel candidate exists
    const pops = JSON.parse(readFileSync(enumeratePath(run), 'utf8')).populations;
    if (pops.channelCandidates.length !== 0) fail(`the web-app fixture must enumerate no channel candidate (got ${pops.channelCandidates.map((c) => c.member).join(', ')})`);
    const files = loadChannelFiles(run);
    if (JSON.stringify([...(files.candidates || [])].sort()) !== JSON.stringify([ROUTE, SITE].sort())) fail(`a web app's triage list must be its route handlers and effect-site members (want ${ROUTE}, ${SITE}; got ${files.candidates === null ? 'no list' : files.candidates.join(', ') || 'an empty list'})`);

    // (2)(3) in process over the run's own files
    const reg = loadYardstick();
    const eff = { channel: 'backup-push', reversibility: 'irreversible', external: true, gate_type: 'deterministic-halt', fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'tenant' };
    const held = [{ id: 'F-1', dimension: 'delegation', polarity: 'strength', subject_type: 'effect', observation: 'x', evidence: ['lib/push.mjs:2'], confidence: 'confirmed', effect: eff }];
    const ungated = [{ ...held[0], polarity: 'gap', effect: { ...eff, gate_type: 'none', fail_mode: undefined } }];
    const triage = (entries) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: 1\ntriage:${entries.length ? '' : ' []'}\n${entries.map((x) => `  - candidate: "${x[0]}"\n    ${x[1]}`).join('\n')}\n`);
    const measure = (findings) => Object.fromEntries(measureRun({ findings, manifest: [{ scanner: 'practice-review', status: 'ran' }], inputs: {}, coverage: {}, channels: loadChannelFiles(run) }, reg).map((x) => [x.id, x]));
    const complete = [[ROUTE, 'out_of_scope: "delegates to lib/push.mjs: its write is the effect-site member"'], [SITE, 'finding: F-1']];

    triage([]);
    let r = measure(held);
    if (r['d-effects-gated']?.status === 'met' || !['mixed', 'not-measured'].includes(r['d-effects-gated']?.status)) fail(`a web app with its effect site untriaged must never read d-effects-gated met (got ${r['d-effects-gated']?.status}: ${r['d-effects-gated']?.note})`);
    else if (!r['d-effects-gated'].note.includes(SITE)) fail(`d-effects-gated must name the untriaged effect site (got ${r['d-effects-gated'].note})`);
    triage(complete.slice(0, 1));
    r = measure(held);
    if (r['d-effects-gated']?.status !== 'mixed' || !r['d-effects-gated'].note.includes(`untriaged: ${SITE}`)) fail(`one untriaged effect-site member must turn d-effects-gated mixed, naming it (got ${r['d-effects-gated']?.status}: ${r['d-effects-gated']?.note})`);
    if (r['d-effect-channels-enumerated']?.status !== 'unmet' || !r['d-effect-channels-enumerated'].note.includes(`untriaged: ${SITE}`)) fail(`d-effect-channels-enumerated must read unmet naming the untriaged member (got ${r['d-effect-channels-enumerated']?.status}: ${r['d-effect-channels-enumerated']?.note})`);
    triage(complete);
    r = measure(held);
    if (r['d-effects-gated']?.status !== 'met') fail(`the web app fully triaged with its halt held must read d-effects-gated met, the rule over the findings (got ${r['d-effects-gated']?.status}: ${r['d-effects-gated']?.note})`);
    const en = r['d-effect-channels-enumerated'];
    if (en?.status !== 'met' || en.of !== 2 || !en.findings.includes('F-1')) fail(`a fully triaged web app must read d-effect-channels-enumerated met, 2 of 2, citing F-1 (got ${en?.status} ${en?.met}/${en?.of} [${en?.findings}]: ${en?.note})`);
    r = measure(ungated);
    if (r['d-effects-gated']?.status !== 'unmet') fail(`the web app fully triaged with its halt ungated must read d-effects-gated unmet, the rule over the findings (got ${r['d-effects-gated']?.status})`);

    // (5) a list without the route or effect-site population does not read as a closed one
    const full = readFileSync(enumeratePath(run), 'utf8');
    const short = JSON.parse(full); delete short.populations.effectSites;
    writeFileSync(enumeratePath(run), JSON.stringify(short));
    r = measure(held);
    if (r['d-effects-gated']?.status !== 'not-measured' || !/effectSites/.test(r['d-effects-gated'].note)) fail(`a list missing effectSites must read the effect rows not measured, naming it (got ${r['d-effects-gated']?.status}: ${r['d-effects-gated']?.note})`);
    writeFileSync(enumeratePath(run), full);

    // (4) validate holds a web app's members as it holds channel candidates: the notesbox fixture
    // (flawed-webapp, one effect-site member covered by F-053)
    const nb = join(tmp, 'notesbox');
    cpSync(join(HERE, 'fixtures', 'notesbox'), nb, { recursive: true });
    const nbTriage = (entries) => writeFileSync(effectTriagePath(nb), `schema: effect-triage\nversion: 1\ntriage:${entries.length ? '' : ' []'}\n${entries.map((x) => `  - candidate: "${x[0]}"\n    ${x[1]}`).join('\n')}\n`);
    const validates = (want, re, what) => {
      const v = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'validate', nb], { encoding: 'utf8' });
      const out = v.stdout + v.stderr;
      if (want && v.status !== 0) fail(`${what}: validate must pass (exit ${v.status}): ${out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ')}`);
      if (!want && (v.status === 0 || !re.test(out))) fail(`${what}: validate must refuse it naming ${re} (exit ${v.status})`);
    };
    validates(true, null, 'notesbox with its effect site triaged');
    nbTriage([]);
    validates(false, /not triaged: http write \(js\)/, 'a triage that misses the effect-site member');
    nbTriage([[NB_SITE, 'finding: F-053'], [NB_SITE, 'finding: F-052']]);
    validates(false, /"http write \(js\)" is triaged twice/, 'a triage that triages the effect-site member twice');
    nbTriage([[NB_SITE, 'finding: F-050']]);
    validates(false, /finding F-050 is not an effect finding/, 'an effect-site member pointed at a finding that is not an effect');
    nbTriage([[NB_SITE, 'out_of_scope: ""']]);
    validates(false, /out_of_scope needs the reason/, 'an effect-site member out of scope with no reason');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
