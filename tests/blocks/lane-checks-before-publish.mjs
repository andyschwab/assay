// ── the practice-review lane validates its own files before it publishes (#278) ──
// A lane once learned that the reader refused a file only after it had published and ended,
// when the consumer's validate sent the run back. The owner decided (#278, question 4) that the
// lane runs the pinned engine's validate over its own scratch run first, and publishes only on
// a clean check; every other part of "executes nothing" stands. Pinned:
//   (a) the seed spells out the one check, the engine's validate of the lane's own scratch run
//       against its checkout, copies its inputs into that run, and publishes only once the
//       check is clean, the checkout record saying it ran clean;
//   (b) the rest of the hard rule stands: never the target's code, its install, build or
//       tests, never a scanner, never a script, never an install;
//   (c) the check runs as the lane runs it: `validate --lane` over a run with the lane's files,
//       its inputs and no run record passes and says the record was not checked; a file the
//       reader refuses fails it, naming the file; an output missing fails it, naming it;
//   (d) a run with no record is still refused everywhere else: a plain validate of the same run
//       fails naming the missing record, so only a lane's own check reads a run with none.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-checks-before-publish';

const CHECK = 'node <scratch>/assay/assay.mjs validate <scratch>/run --lane practice-review --target <checkout>';

export async function run() {
  const fail = (m) => negFailures.push('lane-checks-before-publish: ' + m);
  const seed = laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' });
  const p = seed.prompt.replace(/\s+/g, ' ');

  // (a)
  if (!p.includes('`' + CHECK + '`')) fail(`(a) the lane spells out its one check: \`${CHECK}\``);
  if (!/Copy each input you were given into your scratch run at its own path \(`map\/raw\/enumerate\.json`\)/.test(p)) fail('(a) the lane copies its inputs (map/raw/enumerate.json) into its scratch run, so the triage is checked');
  if (!/Publish nothing until it does/.test(p) || !/Fix every violation the check reports, run it again/.test(p)) fail('(a) the lane fixes what the check reports, re-runs it, and publishes only on a clean check');
  if (!/CHECKOUT RECORD \([^)]*`validate --lane practice-review` ran clean/.test(p)) fail('(a) the checkout record says the check ran clean');
  if (!/Write no run record/.test(p)) fail('(a) the lane writes no run record: the consumer records the run');

  // (b)
  for (const [re, what] of [
    [/This session executes nothing but one check/, 'the session executes nothing but its one check'],
    [/Never run the target's code, its install, build or tests/, "never the target's code, its install, build or tests"],
    [/never run a scanner, any other assay command, or any script from the target or that you fetched/, 'never a scanner, another assay command, or a script'],
    [/never install anything/, 'never an install'],
  ]) if (!re.test(p)) fail(`(b) the hard rule still says: ${what}`);

  // (c) the check as the lane runs it
  const scratch = mkdtempSync(join(tmpdir(), 'assay-lane-check-'));
  try {
    const target = join(scratch, 'checkout'); mkdirSync(target);
    writeFileSync(join(target, 'README.md'), '# Demo\n\nWhat it is.\n');
    const finding = '- id: F-001\n  dimension: artifact-legibility\n  polarity: strength\n  subject_type: artifact\n  observation: >-\n    The README says what the repository is.\n  evidence: [README.md:1]\n  confidence: confirmed\n';
    const lane = (name, { drop = [], bad = null } = {}) => {
      const dir = join(scratch, name);
      mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
      mkdirSync(join(dir, 'map', 'raw'), { recursive: true });
      writeFileSync(join(dir, 'map', 'raw', 'enumerate.json'), JSON.stringify({ schema: 'enumerate', version: 1, target: 'checkout', files: 1, populations: { channelCandidates: [], routeHandlers: [], effectSites: [] } }));
      for (const o of seed.outputs.filter((x) => !drop.includes(x))) {
        const body = o === bad ? 'dimensions:\n  - dimension: verification\n    enforced: { claim: true, why: { text: "nested" } }\n'
          : o.endsWith('.md') ? '# Terrain\n\nA planted target with one README.\n' : o.endsWith('effect-triage.yaml') ? 'schema: effect-triage\nversion: 1\ntriage: []\n' : o.endsWith('census-triage.yaml') ? 'schema: census-triage\nversion: 1\ncensuses: []\n' : o.endsWith('censuses.yaml') ? 'dimensions: []\n' : o.endsWith('-legibility.yaml') ? finding : '[]\n';
        writeFileSync(join(dir, o), body);
      }
      return dir;
    };
    const validate = (dir, extra) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'validate', dir, ...extra], { encoding: 'utf8' });
    const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ');
    const laneFlags = ['--lane', 'practice-review', '--target', target];

    const clean = validate(lane('clean'), laneFlags);
    if (clean.status !== 0) fail(`(c) the lane's own run, its files and inputs and no run record, passes its check (got ${clean.status}: ${bullets(clean)})`);
    else if (!/the run record was not checked/.test(clean.stdout) || !/run-record checks were not made/.test(clean.stdout)) fail('(c) a clean lane check says the run record was not checked, never that the manifest is clean');

    const refused = validate(lane('refused', { bad: 'map/censuses.yaml' }), laneFlags);
    if (refused.status !== 1 || !/map\/censuses\.yaml: YAML parse failed/.test(refused.stderr)) fail(`(c) a file the reader refuses fails the lane's check, naming it (got ${refused.status}: ${bullets(refused)})`);

    const gone = 'map/findings/practice-review-gates.yaml';
    const partial = validate(lane('partial', { drop: [gone] }), laneFlags);
    if (partial.status !== 1 || !partial.stderr.includes(gone)) fail(`(c) an output missing fails the lane's check, naming it (got ${partial.status}: ${bullets(partial)})`);

    // (d)
    const plain = validate(join(scratch, 'clean'), []);
    if (plain.status !== 1 || !/map\/scanners\.yaml: missing/.test(plain.stderr)) fail(`(d) a plain validate of a run with no record still fails, naming it (got ${plain.status}: ${bullets(plain)})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
