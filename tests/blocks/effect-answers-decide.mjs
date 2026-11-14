// ── a candidate's gate_type and reversibility follow from its recorded answers (#315 slice 2;
// map/effect-answers.mjs, map/SCHEMA.md §6e, "The answers") ──
// Read whole, gate_type and reversibility were the descriptors lanes parted on most. At triage
// version 2 each in-scope candidate records its answers to a closed checklist, each yes, no or
// not determinable, with file:line evidence for a yes or a no, and the value follows from them:
//  1. the derivation, in process: each value of §1's order comes from its answer, an answer not
//     determinable reads as the riskier one, and a finding several candidates map to takes the
//     riskiest value any of them gives;
//  2. validate refuses a finding whose value the answers do not give, naming the finding, the
//     candidate and its answers (answers that give deterministic-halt beside gate_type: none);
//  3. validate refuses answers with no evidence, an unanswered question, an answer outside the
//     closed set, and an in-scope entry with no answers at version 2;
//  4. a stored version 1 triage, which carries no answers, still validates: its descriptors are
//     read as written, and validate marks it unanswered.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { gateTypeFrom, reversibilityFrom, descriptorsFrom, CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'effect-answers-decide';

const WORKFLOW = 'deploy/publish (workflow) @ .github/workflows/deploy.yml';
const CLIENT = 'http write (js) @ src/clients/billing.mjs';
const SERVER = 'http write (js) @ server.mjs';
const GET = 'route: GET /relay/status';
const POST = 'route: POST /relay/send';

// every question answered no, and the effect received outside: gate_type none, irreversible
const NONE = {
  refuses_unless: { answer: 'no', evidence: ['server.mjs:5'] }, second_act: { answer: 'no', evidence: ['server.mjs:5'] },
  staged: { answer: 'no', evidence: ['server.mjs:5'] }, person_act: { answer: 'no', evidence: ['server.mjs:5'] },
  declared_scope: { answer: 'no', evidence: ['server.mjs:5'] }, rate_limit: { answer: 'no', evidence: ['server.mjs:5'] },
  disclosed: { answer: 'no', evidence: ['server.mjs:5'] }, received_or_gone: { answer: 'yes', evidence: ['server.mjs:5'] },
  window: { answer: 'not-determinable' },
};
const with_ = (over) => ({ ...NONE, ...over });

export async function run() {
  const fail = (m) => negFailures.push('effect-answers-decide: ' + m);

  // (1) the derivation, in process
  const cases = [
    [NONE, 'none', 'irreversible'],
    [with_({ refuses_unless: { answer: 'yes', what: 'an approval', held_by: 'code', evidence: ['a.mjs:1'] } }), 'deterministic-halt', 'irreversible'],
    [with_({ refuses_unless: { answer: 'yes', what: 'required reviewers', held_by: 'outside', evidence: ['a.yml:1'] } }), 'external-halt', 'irreversible'],
    [with_({ refuses_unless: { answer: 'yes', what: 'required reviewers', held_by: 'outside', evidence: ['a.yml:1'] }, second_act: { answer: 'yes', evidence: ['a.mjs:2'] } }), 'deterministic-halt', 'irreversible'],
    [with_({ staged: { answer: 'yes', evidence: ['a.mjs:1'] } }), 'staged-reversible', 'irreversible'],
    [with_({ person_act: { answer: 'yes', evidence: ['a.mjs:1'] }, declared_scope: { answer: 'yes', evidence: ['a.mjs:1'] } }), 'initiated-by-person', 'irreversible'],
    [with_({ declared_scope: { answer: 'yes', evidence: ['a.yml:1'] } }), 'scope-bound', 'irreversible'],
    [with_({ rate_limit: { answer: 'yes', evidence: ['a.mjs:1'] } }), 'rate-throttle', 'irreversible'],
    [with_({ disclosed: { answer: 'yes', evidence: ['a.mjs:1'] } }), 'disclosure-only', 'irreversible'],
    [with_({ refuses_unless: { answer: 'not-determinable' } }), 'none', 'irreversible'],
    [with_({ received_or_gone: { answer: 'not-determinable' }, window: { answer: 'no', evidence: ['a.mjs:1'] } }), 'none', 'irreversible'],
    [with_({ received_or_gone: { answer: 'no', evidence: ['a.mjs:1'] }, window: { answer: 'yes', evidence: ['a.mjs:1'] } }), 'none', 'reversible-with-window'],
    [with_({ received_or_gone: { answer: 'no', evidence: ['a.mjs:1'] }, window: { answer: 'not-determinable' } }), 'none', 'reversible-with-window'],
    [with_({ received_or_gone: { answer: 'no', evidence: ['a.mjs:1'] }, window: { answer: 'no', evidence: ['a.mjs:1'] } }), 'none', 'reversible'],
  ];
  cases.forEach(([a, g, r], i) => {
    if (gateTypeFrom(a) !== g) fail(`(1) case ${i}: the answers must give gate_type ${g} (got ${gateTypeFrom(a)})`);
    if (reversibilityFrom(a) !== r) fail(`(1) case ${i}: the answers must give reversibility ${r} (got ${reversibilityFrom(a)})`);
  });
  const both = descriptorsFrom([cases[1][0], NONE]);
  if (both.gate_type !== 'none' || both.reversibility !== 'irreversible') fail(`(1) a finding two candidates map to takes the riskiest value either gives (got ${JSON.stringify(both)})`);
  const rev = descriptorsFrom([cases[13][0], cases[11][0]]);
  if (rev.reversibility !== 'reversible-with-window') fail(`(1) reversibility across candidates is the riskiest (got ${rev.reversibility})`);

  // (2)–(4) on disk, over the scope fixture's list and the notesbox run's effect findings
  // (F-052 and F-053: gate_type none, irreversible)
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const tmp = mkdtempSync(join(tmpdir(), 'assay-effect-answers-'));
  try {
    const ej = assay('enumerate', join(HERE, 'enumerate-fixture', 'effect-scope'), '--json');
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    writeFileSync(enumeratePath(run), ej.stdout);
    const yamlOf = (answers) => Object.entries(answers).map(([k, a]) => `      ${k}: { ${Object.entries(a).map(([x, v]) => `${x}: ${Array.isArray(v) ? `[${v.map((e) => JSON.stringify(e)).join(', ')}]` : JSON.stringify(v)}`).join(', ')} }`).join('\n');
    const triage = (version, entries) => writeFileSync(effectTriagePath(run), `schema: effect-triage\nversion: ${version}\ntriage:\n${entries.map(([c, lines, answers]) => `  - candidate: "${c}"\n${lines.map((l) => `    ${l}\n`).join('')}${answers ? `    answers:\n${yamlOf(answers)}\n` : ''}`).join('')}`);
    const validate = () => { const v = assay('validate', run); return { status: v.status, out: v.stdout + v.stderr }; };
    const triageLines = (out) => out.split('\n').filter((l) => l.includes('effect-triage')).join(' | ');
    const entries = (over = {}) => [
      [GET, ['out_of_scope: "reads only: returns the relay\'s status"', 'clause: route-reads-only']],
      [POST, ['finding: F-052', 'clause: route-method-writes'], over[POST] || NONE],
      [WORKFLOW, ['finding: F-053', 'clause: workflow-write'], over[WORKFLOW] || NONE],
      [SERVER, ['finding: F-052', 'clause: client-call-runtime'], over[SERVER] || NONE],
      [CLIENT, ['finding: F-053', 'clause: client-call-runtime'], over[CLIENT] || NONE],
    ];

    triage(2, entries());
    let v = validate();
    if (v.status !== 0) fail(`(2) answers that give each finding's written values must validate (exit ${v.status}): ${triageLines(v.out)}`);

    // (2) answers that give deterministic-halt on every path of F-052, beside its written none
    const halt = with_({ refuses_unless: { answer: 'yes', what: 'a signed request', held_by: 'code', evidence: ['server.mjs:5'] } });
    triage(2, entries({ [POST]: halt, [SERVER]: halt }));
    v = validate();
    const want = /finding F-052's gate_type is none, but its candidates' answers give deterministic-halt: "route: POST \/relay\/send" \(refuses_unless: yes \(held_by code\), second_act: no, .*received_or_gone: yes, window: not-determinable\)/;
    if (v.status === 0 || !want.test(v.out)) fail(`(2) answers giving deterministic-halt beside gate_type none must fail validate, naming the finding, the candidate and the answers (exit ${v.status}): ${triageLines(v.out)}`);
    // a halt on one path of two leaves the riskier value, none, which the finding says
    triage(2, entries({ [POST]: halt }));
    v = validate();
    if (v.status !== 0) fail(`(2) a halt on one of a finding's two candidates gives the riskier none, which validates (exit ${v.status}): ${triageLines(v.out)}`);
    // reversibility the same way: answers that keep the prior state beside the written irreversible
    const kept = with_({ received_or_gone: { answer: 'no', evidence: ['src/clients/billing.mjs:3'] }, window: { answer: 'no', evidence: ['src/clients/billing.mjs:3'] } });
    triage(2, entries({ [WORKFLOW]: kept, [CLIENT]: kept }));
    v = validate();
    if (v.status === 0 || !/finding F-053's reversibility is irreversible, but its candidates' answers give reversible:/.test(v.out)) fail(`(2) answers giving reversible beside reversibility irreversible must fail validate (exit ${v.status}): ${triageLines(v.out)}`);

    // (3) answers with no evidence, an unanswered question, a value outside the set, none at all
    triage(2, entries({ [POST]: with_({ refuses_unless: { answer: 'no' } }) }));
    v = validate();
    if (v.status === 0 || !/answers\.refuses_unless: a no carries its evidence/.test(v.out)) fail(`(3) a no with no evidence must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries({ [POST]: with_({ staged: { answer: 'yes', evidence: [] } }) }));
    v = validate();
    if (v.status === 0 || !/answers\.staged: a yes carries its evidence/.test(v.out)) fail(`(3) a yes with an empty evidence list must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries({ [POST]: with_({ staged: { answer: 'yes', evidence: ['server.mjs'] } }) }));
    v = validate();
    if (v.status === 0 || !/answers\.staged: evidence "server\.mjs" is not a path:line citation/.test(v.out)) fail(`(3) evidence with no line must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    const { window: _w, ...short } = NONE;
    triage(2, entries({ [POST]: short }));
    v = validate();
    if (v.status === 0 || !/answers\.window: not answered/.test(v.out)) fail(`(3) a question left unanswered must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries({ [POST]: with_({ staged: { answer: 'maybe', evidence: ['server.mjs:5'] } }) }));
    v = validate();
    if (v.status === 0 || !/answers\.staged: answer "maybe" is not one of yes, no, not-determinable/.test(v.out)) fail(`(3) an answer outside the closed set must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries({ [POST]: with_({ refuses_unless: { answer: 'yes', evidence: ['server.mjs:5'] } }) }));
    v = validate();
    if (v.status === 0 || !/answers\.refuses_unless: a yes says what the check checks/.test(v.out) || !/a yes says who holds the check/.test(v.out)) fail(`(3) a refuses_unless yes with no what and no held_by must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries().map((e, i) => (i === 1 ? [e[0], e[1]] : e)));
    v = validate();
    if (v.status === 0 || !/"route: POST \/relay\/send" is in scope and carries no answers/.test(v.out)) fail(`(3) an in-scope entry with no answers at version 2 must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    triage(2, entries().map((e, i) => (i === 0 ? [e[0], e[1], NONE] : e)));
    v = validate();
    if (v.status === 0 || !/"route: GET \/relay\/status" is out of scope: answers describe an in-scope effect/.test(v.out)) fail(`(3) answers on an out-of-scope entry must be refused (exit ${v.status}): ${triageLines(v.out)}`);
    if (CHECKLIST_KEYS.length !== Object.keys(NONE).length) fail(`(3) this block answers every question of the checklist (${CHECKLIST_KEYS.join(', ')})`);

    // (4) a stored version 1 triage carries no answers: it validates, its descriptors as written,
    // marked unanswered
    triage(1, entries().map(([c, lines]) => [c, lines.slice(0, 1)]));
    v = validate();
    if (v.status !== 0 || !/map\/effect-triage\.yaml: version 1, unanswered: 4 in-scope candidate\(s\) carry no answers \(#315\), so their gate_type and reversibility are read as written/.test(v.out)) fail(`(4) a stored version 1 triage must validate, marked unanswered (exit ${v.status}): ${v.out.split('\n').filter((l) => /effect-triage|✓|✗/.test(l)).join(' | ')}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
