// ── a lane may not silently contradict a signal (#315 slice 3; map/effect-answers.mjs
// againstSignalErrors, map/SCHEMA.md §6e, "The signals") ──
// Over the signals fixture's list (its release workflow carries refuses_unless, declared_scope and
// person_act signals) and the notesbox run's effect findings:
//  1. an answer that differs from a signal with no against_signal fails validate, naming the
//     candidate, the question and the signal (its answer, marker and file:line);
//  2. the same answers, each with against_signal and its own path:line evidence, validate;
//  3. against_signal with no evidence (a not-determinable answer) is refused;
//  4. answers that agree with every signal validate as before, and against_signal on an answer that
//     agrees, or on a question no signal reaches, is refused;
//  5. a stored version 2 triage against a list drawn before the signals (no `signals`) reads as
//     before: the answers of (1) validate.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'answers-against-signals';

const REL = 'release write (workflow) @ .github/workflows/release.yml';
const SYNC = 'http write (js) @ scripts/sync.mjs';
const ev = (l) => ({ answer: 'no', evidence: [l] });
const NONE = {
  refuses_unless: ev('.github/workflows/release.yml:9'), second_act: ev('.github/workflows/release.yml:17'),
  staged: ev('.github/workflows/release.yml:17'), person_act: ev('.github/workflows/release.yml:3'),
  declared_scope: ev('.github/workflows/release.yml:12'), rate_limit: ev('.github/workflows/release.yml:9'),
  disclosed: ev('.github/workflows/release.yml:17'), received_or_gone: { answer: 'yes', evidence: ['.github/workflows/release.yml:17'] },
  window: { answer: 'not-determinable' },
};
const why = (s, extra = {}) => ({ against_signal: s, ...extra });

export async function run() {
  const fail = (m) => negFailures.push('answers-against-signals: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-against-signals-'));
  try {
    const ej = assay('enumerate', join(HERE, 'enumerate-fixture', 'signals'), '--json');
    if (ej.status !== 0) { fail(`enumerate exited ${ej.status}`); return; }
    const list = JSON.parse(ej.stdout);
    // the list, cut to two candidates: the release workflow (three signals) and a client call (none)
    list.populations.channelCandidates = [];
    list.populations.routeHandlers = [];
    list.populations.effectSites = list.populations.effectSites.filter((c) => c.member === REL || c.member === SYNC);
    list.populations.excluded = [];
    if (list.populations.effectSites.length !== 2 || list.populations.effectSites.find((c) => c.member === REL).signals.length !== 3) { fail(`the cut list holds the release workflow with its three signals (got ${JSON.stringify(list.populations.effectSites)})`); return; }
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    const writeList = (l) => writeFileSync(enumeratePath(run), JSON.stringify(l, null, 2));
    writeList(list);
    const yamlOf = (answers) => Object.entries(answers).map(([k, a]) => `      ${k}: { ${Object.entries(a).map(([x, v]) => `${x}: ${Array.isArray(v) ? `[${v.map((e) => JSON.stringify(e)).join(', ')}]` : JSON.stringify(v)}`).join(', ')} }`).join('\n');
    const triage = (rel) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: 2\ntriage:\n` +
      `  - candidate: "${REL}"\n    finding: F-053\n    clause: workflow-write\n    answers:\n${yamlOf(rel)}\n` +
      `  - candidate: "${SYNC}"\n    finding: F-052\n    clause: client-call-runtime\n    answers:\n${yamlOf(NONE)}\n`);
    const validate = () => { const v = assay('validate', run); return { status: v.status, out: v.stdout + v.stderr }; };
    const lines = (out) => out.split('\n').filter((l) => /effect-triage|✓|✗/.test(l)).join(' | ');

    // (1) three answers against three signals, none saying why
    triage(NONE);
    let v = validate();
    const named = /map\/effect-triage\.yaml\[0\]: answers\.refuses_unless: "release write \(workflow\) @ \.github\/workflows\/release\.yml" answers refuses_unless no against the signal the candidate list records \(refuses_unless: yes, read by job key: environment at \.github\/workflows\/release\.yml:11\): an answer against a signal says why in against_signal/;
    if (v.status === 0 || !named.test(v.out)) fail(`(1) an answer against a signal with no against_signal must fail validate, naming the candidate, the question and the signal (exit ${v.status}): ${lines(v.out)}`);
    for (const q of ['person_act', 'declared_scope']) if (!new RegExp(`answers\\.${q}: "release write[^"]*" answers ${q} no against the signal`).test(v.out)) fail(`(1) each answer against its signal is named: ${q} (${lines(v.out)})`);
    if (/answers\.(?:second_act|staged|rate_limit|disclosed|received_or_gone|window): "release/.test(v.out) || /"http write \(js\) @ scripts\/sync\.mjs" answers/.test(v.out)) fail(`(1) a question no signal reaches, and a candidate with none, are held to nothing more (${lines(v.out)})`);

    // (2) each answer against its signal says why, with its own evidence
    const said = {
      ...NONE,
      refuses_unless: { ...NONE.refuses_unless, ...why('the environment is created with no protection rules by the setup script, so it refuses nothing') },
      person_act: { ...NONE.person_act, ...why('the dispatch is also fired by the scheduler job at its own step') },
      declared_scope: { ...NONE.declared_scope, ...why('contents: write lets the job rewrite every branch, which is the effect itself') },
    };
    triage(said);
    v = validate();
    if (v.status !== 0) fail(`(2) answers against signals, each with against_signal and evidence, must validate (exit ${v.status}): ${lines(v.out)}`);

    // (3) against_signal with no evidence of its own
    triage({ ...said, refuses_unless: { answer: 'not-determinable', ...why('the protection rules are not in the tree') } });
    v = validate();
    if (v.status === 0 || !/answers\.refuses_unless: "release write[^"]*" answers refuses_unless not-determinable against the signal .*with its own path:line evidence/.test(v.out)) fail(`(3) against_signal with no evidence must be refused (exit ${v.status}): ${lines(v.out)}`);

    // (4) answers that agree: F-053 carries the value they give, and nothing more is asked
    const agree = {
      ...NONE,
      refuses_unless: { answer: 'yes', what: "the production environment's protection rules", held_by: 'outside', evidence: ['.github/workflows/release.yml:11'] },
      person_act: { answer: 'yes', evidence: ['.github/workflows/release.yml:3'] },
      declared_scope: { answer: 'yes', evidence: ['.github/workflows/release.yml:12'] },
    };
    const fp = join(run, 'map', 'findings', 'practice-review-delegation.yaml');
    const text = readFileSync(fp, 'utf8');
    const at = text.indexOf('- id: F-053');
    writeFileSync(fp, text.slice(0, at) + text.slice(at).replace('gate_type: none', 'gate_type: external-halt\n    fail_mode: closed'));
    triage(agree);
    v = validate();
    if (v.status !== 0) fail(`(4) answers that agree with every signal validate as before (exit ${v.status}): ${lines(v.out)}`);
    triage({ ...agree, declared_scope: { ...agree.declared_scope, ...why('none needed') } });
    v = validate();
    if (v.status === 0 || !/answers\.declared_scope: "release write[^"]*" carries against_signal, and its answer agrees with the signal/.test(v.out)) fail(`(4) against_signal on an answer that agrees must be refused (exit ${v.status}): ${lines(v.out)}`);
    triage({ ...agree, staged: { ...agree.staged, ...why('nothing to contradict') } });
    v = validate();
    if (v.status === 0 || !/answers\.staged: "release write[^"]*" carries against_signal, and the candidate list records no signal on staged/.test(v.out)) fail(`(4) against_signal where no signal reaches must be refused (exit ${v.status}): ${lines(v.out)}`);
    writeFileSync(fp, text);

    // (5) a list drawn before the signals: the answers of (1) read as before
    for (const c of list.populations.effectSites) delete c.signals;
    writeList(list);
    triage(NONE);
    v = validate();
    if (v.status !== 0) fail(`(5) a stored version 2 triage against a list with no signals must validate as before (exit ${v.status}): ${lines(v.out)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
