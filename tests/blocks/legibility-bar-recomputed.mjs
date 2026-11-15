// ── the legibility bar is computed from committed sweep sets, never typed, and variance --set lists
// where blind lanes part on a question that clears it (#338; yardstick/legibility-bar.yaml,
// yardstick/legibility-bar.mjs, map/variance.mjs lanesPart and legibilityBarFromSets) ──
// d-effect-facts-legible reads a question only when its cross-target agreement clears a stated bar,
// so a question lanes part on because of its own wording never reads as the target's gap. The list of
// qualifying questions, the bar and the sets it rests on live in one data file, each with its reason.
// Held:
//   (a) the shipped file agrees with the figures the committed sets under tests/sweeps/ give: every
//       blind answered set listed, every question's agreement, counts, targets and sets as computed;
//   (b) a file that disagrees with the committed sets fails: one that lists a qualifying question
//       no committed set gives a figure is named, question and all;
//   (c) the file is held to its own shape: a question listed as qualifying below the bar, a bar of 0,
//       a single target, and an empty list with no reason are each refused;
//   (d) over a cut-down answered pair of sets built here (two targets, two blind sweeps each), the
//       figures pool per question across the sets, and a question qualifies only at or above the bar
//       on both targets; a file stating them agrees, one off by a count disagrees;
//   (e) variance --set lists, on that set, each candidate and qualifying question where the lanes
//       part, with each sweep's answer, and never a question below the bar; with a bar that lists no
//       qualifying question it lists nothing and says so.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumeratePath, effectTriagePath } from '../../lib/run-layout.mjs';
import { loadBar, checkBarDoc, barDisagreements, committedSets, BAR_FILE } from '../../yardstick/legibility-bar.mjs';
import { legibilityBarFromSets, lanesPart, computeCandidateAgreement } from '../../map/variance.mjs';
import { CHECKLIST_KEYS } from '../../map/effect-answers.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'legibility-bar-recomputed';

const WORKFLOW = 'deploy/publish (workflow) @ .github/workflows/deploy.yml';
const CLIENT = 'http write (js) @ src/clients/billing.mjs';
const SERVER = 'http write (js) @ server.mjs';
const GET = 'route: GET /relay/status';
const POST = 'route: POST /relay/send';

// gate_type none, irreversible, as the notesbox run's F-052 and F-053 say
const NONE = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, k === 'received_or_gone' ? { answer: 'yes', evidence: ['server.mjs:5'] } : k === 'window' ? { answer: 'not-determinable' } : { answer: 'no', evidence: ['server.mjs:5'] }]));
const nd = { answer: 'not-determinable' };
const noW = { answer: 'no', evidence: ['server.mjs:5'] };

const yamlOf = (answers) => Object.entries(answers).map(([k, a]) => `      ${k}: { ${Object.entries(a).map(([x, v]) => `${x}: ${Array.isArray(v) ? `[${v.map((e) => JSON.stringify(e)).join(', ')}]` : JSON.stringify(v)}`).join(', ')} }`).join('\n');
const triageText = (over = {}) => {
  const entries = [
    [GET, ['out_of_scope: "reads only: returns the relay\'s status"', 'clause: route-reads-only']],
    [POST, ['finding: F-052', 'clause: route-method-writes'], { ...NONE, ...(over[POST] || {}) }],
    [WORKFLOW, ['finding: F-053', 'clause: workflow-write'], { ...NONE, ...(over[WORKFLOW] || {}) }],
    [SERVER, ['finding: F-052', 'clause: client-call-runtime'], { ...NONE, ...(over[SERVER] || {}) }],
    [CLIENT, ['finding: F-053', 'clause: client-call-runtime'], { ...NONE, ...(over[CLIENT] || {}) }],
  ];
  return `schema: effect-triage\nversion: 2\ntriage:\n${entries.map(([c, lines, answers]) => `  - candidate: "${c}"\n${lines.map((l) => `    ${l}\n`).join('')}${answers ? `    answers:\n${yamlOf(answers)}\n` : ''}`).join('')}`;
};

// a sweep set of blind sweeps over one target, each sweep's answers overridden as given
function writeSet(dir, target, overs, enumerateJson) {
  mkdirSync(dir, { recursive: true });
  overs.forEach((over, i) => {
    const run = join(dir, `sweep-${i + 1}`);
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    writeFileSync(enumeratePath(run), enumerateJson);
    writeFileSync(effectTriagePath(run), triageText(over));
  });
  writeFileSync(join(dir, 'SWEEP.yaml'), `target: "${target}"\ntarget_commit: "fixture"\nmethod_commit: "fixture"\ndate: "2026-11-15"\nblind: true\nthreshold:\n  fact_presence: 1\n  candidate_agreement: 1\n  descriptor_agreement: 1\n  requirement_agreement: 1\nsweeps: [${overs.map((_, i) => `sweep-${i + 1}`).join(', ')}]\n`);
}

const barText = ({ bar = 75, targets = 2, sets = [], questions = [], below = [], none = 'stated by the test' } = {}) => `schema: assay.legibility-bar
version: 1
bar: ${bar}
bar_reason: "stated by the test"
targets_at_least: ${targets}
targets_reason: "stated by the test"
sets:${sets.length ? '\n' + sets.map((s) => `  - { set: ${s.set}, target: "${s.target}", reason: "stated by the test" }`).join('\n') : ' []'}
questions:${questions.length ? '\n' + questions.map((q) => `  - { question: ${q.question}, agreement: ${q.agreement}, agree: ${q.agree}, of: ${q.of}, targets: [${q.targets.map((t) => `"${t}"`).join(', ')}], sets: [${q.sets.join(', ')}], reason: "stated by the test" }`).join('\n') : ' []'}
below_bar:${below.length ? '\n' + below.map((q) => `  - { question: ${q.question}, agreement: ${q.agreement}, agree: ${q.agree}, of: ${q.of}, targets: [${q.targets.map((t) => `"${t}"`).join(', ')}], sets: [${q.sets.join(', ')}], reason: "stated by the test" }`).join('\n') : ' []'}
${questions.length ? '' : `none_qualify: "${none}"\n`}`;

export async function run() {
  const fail = (m) => negFailures.push('legibility-bar-recomputed: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-legibility-bar-'));
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  try {
    // (a) the shipped file against the committed sets
    const shipped = loadBar(BAR_FILE);
    const committed = legibilityBarFromSets(committedSets(), { bar: shipped.bar, targetsAtLeast: shipped.targetsAtLeast });
    const diff = barDisagreements(shipped.doc, committed);
    if (diff.length) fail(`(a) yardstick/legibility-bar.yaml disagrees with the committed sweep sets (recompute: node yardstick/legibility-bar-check.mjs): ${diff.join('; ')}`);

    // (b) a file that lists a qualifying question no committed set gives a figure. Re-pinned when the
    // first answered sets were committed (2026-11-15): the shipped sets now give every question a
    // figure, so the claim is checked against sets that give none, which is the case the rule names.
    const noFigures = legibilityBarFromSets([], { bar: shipped.bar, targetsAtLeast: shipped.targetsAtLeast });
    const claimed = join(tmp, 'claimed.yaml');
    writeFileSync(claimed, barText({ sets: [{ set: 'set-one', target: 'target one' }], questions: [{ question: 'refuses_unless', agreement: 90, agree: 9, of: 10, targets: ['target one', 'target two'], sets: ['set-one'] }] }));
    const claimedDiff = barDisagreements(loadBar(claimed).doc, noFigures);
    if (!claimedDiff.some((x) => /questions: refuses_unless is listed, and the committed sets give it no figure there/.test(x))) fail(`(b) a bar file listing refuses_unless as qualifying, which no committed set gives a figure, disagrees with the committed sets, naming it (got ${JSON.stringify(claimedDiff)})`);
    if (!claimedDiff.some((x) => /sets: set-one is listed/.test(x))) fail(`(b) a bar file listing a set no committed set is disagrees, naming it (got ${JSON.stringify(claimedDiff)})`);

    // (c) the file's own shape
    const doc = (o) => ({ schema: 'assay.legibility-bar', version: 1, bar: 75, bar_reason: 'x', targets_at_least: 2, targets_reason: 'x', sets: [{ set: 's', target: 't', reason: 'x' }], questions: [], below_bar: [], none_qualify: 'x', ...o });
    const q = (o) => ({ question: 'staged', agreement: 70, agree: 7, of: 10, targets: ['t', 'u'], sets: ['s'], reason: 'x', ...o });
    const refused = (o, re, what) => { const e = checkBarDoc(doc(o)); if (!e.some((x) => re.test(x))) fail(`(c) ${what} is refused (got ${JSON.stringify(e)})`); };
    refused({ questions: [q()], none_qualify: undefined }, /listed as qualifying, but 70% over 2 target\(s\) does not clear the bar/, 'a question below the bar listed as qualifying');
    refused({ questions: [q({ agreement: 90, agree: 9, targets: ['t'] })], none_qualify: undefined }, /does not clear the bar/, 'a question compared on one target listed as qualifying');
    refused({ bar: 0 }, /bar must be a percentage above 0/, 'a bar of 0');
    refused({ targets_at_least: 1 }, /targets_at_least must be an integer of 2 or more/, 'a single target');
    refused({ none_qualify: undefined }, /none_qualify must say why no question qualifies/, 'an empty list with no reason');
    refused({ below_bar: [q({ agreement: 90, agree: 9 })] }, /listed below the bar, but 90% over 2 target\(s\) clears it/, 'a question that clears the bar listed below it');
    if (checkBarDoc(doc({})).length) fail(`(c) a well-formed empty bar is accepted (got ${JSON.stringify(checkBarDoc(doc({})))})`);

    // (d) a cut-down answered pair of sets
    const ej = assay('enumerate', join(HERE, 'enumerate-fixture', 'effect-scope'), '--json');
    if (ej.status !== 0) { fail(`enumerate of the effect-scope fixture failed (exit ${ej.status}): ${ej.stderr.slice(0, 300)}`); return; }
    const one = join(tmp, 'set-one'), two = join(tmp, 'set-two');
    // set one: the lanes part on POST's received_or_gone (yes / not determinable) and on SERVER's and CLIENT's window
    writeSet(one, 'target one', [{}, { [POST]: { received_or_gone: nd }, [SERVER]: { window: noW }, [CLIENT]: { window: noW } }], ej.stdout);
    // set two: the lanes part on SERVER's window only
    writeSet(two, 'target two', [{}, { [SERVER]: { window: noW } }], ej.stdout);
    const c1 = computeCandidateAgreement([join(one, 'sweep-1'), join(one, 'sweep-2')]);
    if (c1.answers.compared !== 4) fail(`(d) each sweep answers the four in-scope candidates (got ${c1.answers.compared})`);
    const got = legibilityBarFromSets([one, two], { bar: 75, targetsAtLeast: 2 });
    const fig = (k) => [...got.questions, ...got.below_bar].find((x) => x.question === k);
    const rog = fig('received_or_gone'), win = fig('window'), ref = fig('refuses_unless');
    if (!rog || rog.agree !== 7 || rog.of !== 8 || rog.agreement !== 88 || !got.questions.includes(rog)) fail(`(d) received_or_gone pools 7 of 8 (88%) over both targets and qualifies (got ${JSON.stringify(rog)})`);
    if (!win || win.agree !== 5 || win.of !== 8 || win.agreement !== 63 || !got.below_bar.includes(win)) fail(`(d) window pools 5 of 8 (63%) and falls below the bar (got ${JSON.stringify(win)})`);
    if (!ref || ref.agreement !== 100 || JSON.stringify(ref.targets) !== JSON.stringify(['target one', 'target two']) || JSON.stringify(ref.sets) !== JSON.stringify(['set-one', 'set-two'])) fail(`(d) refuses_unless rests on both sets and both targets (got ${JSON.stringify(ref)})`);
    const lone = legibilityBarFromSets([one], { bar: 75, targetsAtLeast: 2 });
    if (lone.questions.length) fail(`(d) over one target no question qualifies, however well its lanes agree (got ${lone.questions.map((x) => x.question).join(', ')})`);
    const stated = join(tmp, 'stated.yaml');
    writeFileSync(stated, barText({ sets: got.sets, questions: got.questions, below: got.below_bar }));
    const statedBar = loadBar(stated);
    const agrees = barDisagreements(statedBar.doc, got);
    if (agrees.length) fail(`(d) a bar file stating the computed figures agrees with them (got ${JSON.stringify(agrees)})`);
    const off = join(tmp, 'off.yaml');
    writeFileSync(off, barText({ sets: got.sets, questions: got.questions.map((x) => (x.question === 'received_or_gone' ? { ...x, agree: 8, agreement: 100 } : x)), below: got.below_bar }));
    if (!barDisagreements(loadBar(off).doc, got).some((x) => /questions: received_or_gone agree is 7, the file says 8/.test(x))) fail('(d) a bar file off by one count disagrees, naming the question and the count');

    // (e) variance --set lists where the lanes part, on qualifying questions only
    const v = assay('variance', '--set', one, '--bar', stated, '--json');
    let out = null;
    try { out = JSON.parse(v.stdout); } catch { fail(`(e) variance --set --json prints JSON (exit ${v.status}): ${(v.stdout + v.stderr).slice(0, 400)}`); }
    if (out) {
      const parted = out.legibility && out.legibility.parted;
      const want = [{ candidate: POST, question: 'received_or_gone', values: ['yes', 'not-determinable'] }];
      if (JSON.stringify(parted) !== JSON.stringify(want)) fail(`(e) variance --set lists the candidate and qualifying question where the lanes part, never window, which is below the bar (want ${JSON.stringify(want)}, got ${JSON.stringify(parted)})`);
      if (JSON.stringify(lanesPart(c1, statedBar.qualifying)) !== JSON.stringify(want)) fail('(e) lanesPart gives the same list in process');
    }
    const t = assay('variance', '--set', one, '--bar', stated);
    if (!t.stdout.includes('where lanes part on a question that clears the legibility bar') || !t.stdout.includes(`${POST.padEnd(40)} received_or_gone: yes vs not-determinable`)) fail(`(e) the text report lists the parting under its heading (got ${t.stdout.slice(0, 200)})`);
    // re-pinned when the shipped bar first listed qualifying questions (2026-11-15): a stated bar with
    // none is the case the rule names, so the test states it rather than read the shipped file
    const noneBar = join(tmp, 'none.yaml');
    writeFileSync(noneBar, barText({}));
    const empty = assay('variance', '--set', one, '--bar', noneBar);
    if (!empty.stdout.includes('no checklist question has cleared the cross-target bar: nothing is listed')) fail('(e) with a bar that lists no qualifying question, variance --set lists nothing and says so');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
