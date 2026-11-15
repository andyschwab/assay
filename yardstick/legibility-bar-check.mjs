#!/usr/bin/env node
// legibility-bar-check.mjs — recompute yardstick/legibility-bar.yaml's figures from the committed
// sweep sets (#338) and say where the file disagrees with them; exit 1 when it does, 2 when the file
// does not load. tests/blocks/legibility-bar-recomputed.mjs runs the same comparison in the suite.
//   node yardstick/legibility-bar-check.mjs [--bar <file>] [--json]
import { loadBar, barDisagreements, committedSets, BAR_FILE } from './legibility-bar.mjs';
import { legibilityBarFromSets } from '../map/variance.mjs';
import { isMain } from '../map/doctrine.mjs';

if (isMain(import.meta.url)) {
  const fileArg = process.argv.indexOf('--bar');
  let bar;
  try { bar = loadBar(fileArg > -1 ? process.argv[fileArg + 1] : BAR_FILE); } catch (err) { console.error(`✗ ${err.message}`); process.exit(2); }
  const computed = legibilityBarFromSets(committedSets(), { bar: bar.bar, targetsAtLeast: bar.targetsAtLeast });
  const diff = barDisagreements(bar.doc, computed);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ file: bar.file, bar: bar.bar, targets_at_least: bar.targetsAtLeast, computed, disagreements: diff }, null, 2));
  else {
    console.log(`legibility bar ${bar.file}: ${bar.bar}% over at least ${bar.targetsAtLeast} targets`);
    console.log(`  blind answered sets: ${computed.sets.length ? computed.sets.map((s) => `${s.set} (${s.target})`).join(', ') : 'none'}`);
    for (const q of [...computed.questions, ...computed.below_bar]) console.log(`  ${q.question.padEnd(17)} ${String(q.agreement).padStart(3)}%  ${q.agree}/${q.of} over ${q.targets.length} target(s)  ${q.qualifies ? 'qualifies' : 'below the bar'}`);
    if (!computed.questions.length) console.log('  no question qualifies: d-effect-facts-legible reads not measured on every target');
    if (diff.length) for (const d of diff) console.log(`  ✗ ${d}`);
    else console.log('  ✓ the file agrees with the committed sets');
  }
  if (diff.length) process.exit(1);
}
