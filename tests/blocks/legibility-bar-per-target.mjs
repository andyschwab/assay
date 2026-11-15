// ── the legibility bar's per-target figures are visible, computed and never typed, and the questions
// a per-target rule would drop are named (#338, second slice; yardstick/legibility-bar.mjs,
// yardstick/legibility-bar.yaml) ──
// A question qualifies on its agreement pooled over the committed blind answered sets. Pooled, a
// question can clear the bar while one target alone sits far below it. Whether a question must clear
// the bar on every target is the owner's decision; this keeps the pooled rule and shows the numbers it
// is decided from. Held:
//   (a) barFromSets gives each question its figure on each target alone (per_target), summing to the
//       pooled figure, and per_target_drops names each qualifying question under the bar on a target;
//       the pooled rule still decides what qualifies;
//   (b) the file is held to them: per_target that does not sum to the pooled figure, a target missing
//       from it, a drop the figures do not give, and a drop the figures give left out, are each refused;
//   (c) a file whose per-target figure is off by one disagrees with the computed figures, naming the
//       question and the target;
//   (d) the shipped file agrees with the committed sets, per target as pooled, and the check prints
//       the per-target figures and the questions a per-target rule would drop.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { barFromSets, checkBarDoc, barDisagreements, loadBar, committedSets, BAR_FILE } from '../../yardstick/legibility-bar.mjs';
import { legibilityBarFromSets } from '../../map/variance.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'legibility-bar-per-target';

const by = (o) => Object.fromEntries(Object.entries(o).map(([k, [agree, of]]) => [k, { agree, of }]));

export async function run() {
  const fail = (m) => negFailures.push('legibility-bar-per-target: ' + m);

  // (a) two targets: staged agrees everywhere; person_act clears pooled, falls under on target two
  const sets = [
    { set: 'set-a', target: 'target one', blind: true, compared: 20, byAnswer: by({ staged: [20, 20], person_act: [20, 20] }) },
    { set: 'set-b', target: 'target two', blind: true, compared: 5, byAnswer: by({ staged: [5, 5], person_act: [2, 5] }) },
  ];
  const got = barFromSets(sets, { bar: 75, targetsAtLeast: 2 });
  const pa = got.questions.find((q) => q.question === 'person_act'), st = got.questions.find((q) => q.question === 'staged');
  if (!pa || pa.agreement !== 88 || pa.agree !== 22 || pa.of !== 25) fail(`(a) person_act pools 22 of 25 (88%) and qualifies under the pooled rule (got ${JSON.stringify(pa)})`);
  const want = [{ target: 'target one', agreement: 100, agree: 20, of: 20 }, { target: 'target two', agreement: 40, agree: 2, of: 5 }];
  if (!pa || JSON.stringify(pa.per_target) !== JSON.stringify(want)) fail(`(a) person_act gives its figure on each target alone, beside the pooled one (want ${JSON.stringify(want)}, got ${JSON.stringify(pa && pa.per_target)})`);
  if (JSON.stringify(got.per_target_drops) !== JSON.stringify(['person_act'])) fail(`(a) per_target_drops names person_act, under the bar on target two, and not staged (got ${JSON.stringify(got.per_target_drops)})`);
  if (!st) fail('(a) staged qualifies');

  // (b) the file's own shape
  const entry = (o = {}) => ({ question: 'person_act', agreement: 88, agree: 22, of: 25, targets: ['target one', 'target two'], sets: ['set-a', 'set-b'], per_target: want, reason: 'x', ...o });
  const doc = (o = {}) => ({ schema: 'assay.legibility-bar', version: 1, bar: 75, bar_reason: 'x', targets_at_least: 2, targets_reason: 'x', sets: [{ set: 'set-a', target: 'target one', reason: 'x' }, { set: 'set-b', target: 'target two', reason: 'x' }], questions: [entry()], below_bar: [], per_target_drops: ['person_act'], ...o });
  const ok = checkBarDoc(doc());
  if (ok.length) fail(`(b) a well-formed bar with its per-target figures is accepted (got ${JSON.stringify(ok)})`);
  const refused = (o, re, what) => { const e = checkBarDoc(doc(o)); if (!e.some((x) => re.test(x))) fail(`(b) ${what} is refused (got ${JSON.stringify(e)})`); };
  refused({ questions: [entry({ per_target: [want[0], { ...want[1], agree: 3, agreement: 60 }] })] }, /per_target sums to 23 of 25, the pooled figure is 22 of 25/, 'per_target that does not sum to the pooled figure');
  refused({ questions: [entry({ per_target: [want[0]], agree: 20, of: 20, agreement: 100 })], per_target_drops: [] }, /per_target must give every target the figure was compared on/, 'a target missing from per_target');
  refused({ questions: [entry({ per_target: undefined })] }, /per_target must give the figure on each target/, 'an entry with no per_target');
  refused({ per_target_drops: [] }, /per_target_drops: person_act is below the bar \(75%\) on a target, and is not listed/, 'a drop the figures give left out');
  refused({ questions: [entry({ per_target: [{ ...want[0], agree: 17, agreement: 85 }, { ...want[1], agree: 5, agreement: 100 }] })] }, /per_target_drops: person_act clears the bar on every target, and is listed/, 'a drop the figures do not give');
  refused({ per_target_drops: undefined }, /per_target_drops must be a list/, 'a file with no per_target_drops');

  // (c) a typed figure disagrees with the computed one
  const off = doc({ questions: [entry({ per_target: [{ ...want[0], agree: 19, agreement: 95 }, { ...want[1], agree: 3, agreement: 60 }] })] });
  const diff = barDisagreements(off, got);
  if (!diff.some((x) => /questions: person_act on target one agree is 20, the file says 19/.test(x))) fail(`(c) a per-target figure off by one disagrees, naming the question and the target (got ${JSON.stringify(diff)})`);
  if (!barDisagreements(doc({ per_target_drops: [] }), got).some((x) => /per_target_drops: a per-target rule would drop person_act, the file says none/.test(x))) fail('(c) a file whose drops differ from the computed ones disagrees, naming them');

  // (d) the shipped file, and the check's output
  const shipped = loadBar(BAR_FILE);
  const committed = legibilityBarFromSets(committedSets(), { bar: shipped.bar, targetsAtLeast: shipped.targetsAtLeast });
  const d = barDisagreements(shipped.doc, committed);
  if (d.length) fail(`(d) yardstick/legibility-bar.yaml agrees with the committed sets per target (recompute: node yardstick/legibility-bar-check.mjs): ${d.join('; ')}`);
  for (const q of committed.questions) if (!q.per_target.length) fail(`(d) ${q.question} gives a per-target figure from the committed sets`);
  const check = spawnSync(process.execPath, [join(ROOT, 'yardstick', 'legibility-bar-check.mjs')], { encoding: 'utf8' });
  const drops = committed.per_target_drops;
  if (check.status !== 0 || !check.stdout.includes('per target:') || !check.stdout.includes(`a rule that held the bar on every target would drop: ${drops.length ? drops.join(', ') : 'no question'}`)) fail(`(d) the check prints the per-target figures and the questions a per-target rule would drop (exit ${check.status}): ${check.stdout.slice(0, 600)}`);
  for (const q of drops) if (!new RegExp(`${q}\\s.*\\(under\\)`).test(check.stdout)) fail(`(d) the check marks ${q}'s figure under the bar on its target`);
}
