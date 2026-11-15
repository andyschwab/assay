// ── validate holds the checklist mode: a checklist run means what it says (#338) ──
// A practice-review lane in checklist mode writes the terrain, the answered triage and the
// delegation pass's effect findings, and nothing else. Its triage is the full mode's format, held by
// the same rules. Pinned, over a committed answered sweep cut to its checklist subset
// (tests/checklist-cut.mjs), each refusal naming what it refuses:
//   (a) what the full mode's would be refused for: an answer missing, a mapped candidate's effect
//       finding missing, a scope clause missing;
//   (b) what the mode refuses: a census (map/censuses.yaml), another pass's file, a finding that is not
//       an effect, an effect finding answering a discovery question (property:), a version 1 triage,
//       no triage at all;
//   (c) the record: a mode its lane does not offer, a mode on a row that did not run, and --mode
//       naming another mode than the record's; `record --mode` refuses a mode the lane does not
//       offer and one on a row that is not ran, writes `mode: checklist`, keeps it on a later ran
//       that names none, and writes no mode: line for full;
//   (d) the lane's own scratch check: --mode checklist asks only for the checklist's files, and --mode
//       without --lane is a usage error.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cutToChecklist } from '../checklist-cut.mjs';
import { setScannerRow } from '../../map/record.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'checklist-run-refusals';

const SWEEP = join(ROOT, 'tests', 'sweeps', 'flawed-webapp-2026-11-15', 'sweep-1');

export async function run() {
  const fail = (m) => negFailures.push('checklist-run-refusals: ' + m);
  const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
  const scratch = mkdtempSync(join(tmpdir(), 'assay-checklist-refusals-'));
  try {
    const base = join(scratch, 'base');
    cutToChecklist(SWEEP, base);
    const ok = assay(['validate', base]);
    if (ok.status !== 0) { fail(`the cut validates before any change (got ${ok.status}: ${ok.stderr.trim().split('\n').slice(-2).join(' | ')})`); return; }
    let n = 0;
    const variant = (change) => { const d = join(scratch, `v${++n}`); cpSync(base, d, { recursive: true }); change(d); return d; };
    const edit = (d, rel, fn) => writeFileSync(join(d, rel), fn(readFileSync(join(d, rel), 'utf8')));
    const refused = (what, d, re, extra = []) => {
      const r = assay(['validate', d, ...extra]);
      const out = r.stderr + r.stdout;
      if (r.status !== 1 || !re.test(out)) fail(`${what} (exit ${r.status}; wanted ${re}): ${out.split('\n').filter((l) => /•|✗|usage/.test(l)).slice(0, 2).join(' | ')}`);
    };
    const TRIAGE = 'map/effect-triage.yaml', DELEGATION = 'map/findings/practice-review-delegation.yaml';
    // the first mapped entry's second answer, and the last effect finding
    const dropAnswer = (t) => { const i = t.indexOf('      second_act:'), j = t.indexOf('      staged:', i); return t.slice(0, i) + t.slice(j); };

    // (a)
    refused('(a) a checklist run missing an answer is refused, naming it', variant((d) => edit(d, TRIAGE, dropAnswer)), /answers\.second_act: not answered/);
    refused('(a) a checklist run missing the effect finding a mapped candidate needs is refused, naming it', variant((d) => edit(d, DELEGATION, (t) => t.slice(0, t.lastIndexOf('- id: ')))), /finding F-\d+ is not in this run/);
    refused('(a) a checklist run missing a scope clause is refused', variant((d) => edit(d, TRIAGE, (t) => t.replace(/^ {4}clause: .*\n/m, ''))), /clause/);

    // (b)
    refused('(b) a checklist run carrying a census is refused, naming it', variant((d) => copyFileSync(join(SWEEP, 'map', 'censuses.yaml'), join(d, 'map', 'censuses.yaml'))), /practice-review \(checklist mode\): the run carries map\/censuses\.yaml, which the lane in checklist mode does not write/);
    refused('(b) a checklist run carrying another pass\'s file is refused, naming it', variant((d) => copyFileSync(join(SWEEP, 'map', 'findings', 'practice-review-gates.yaml'), join(d, 'map', 'findings', 'practice-review-gates.yaml'))), /the run carries map\/findings\/practice-review-gates\.yaml/);
    refused('(b) a checklist run carrying a finding that is not an effect is refused', variant((d) => copyFileSync(join(SWEEP, DELEGATION), join(d, DELEGATION))), /a (capability|control|contract) finding in a checklist run/);
    refused('(b) an effect finding answering a discovery question is refused in a checklist run', variant((d) => edit(d, DELEGATION, (t) => t.replace(/^( {2}subject_type: effect\n)/m, '$1  property: acting-principal-stated\n'))), /property: acting-principal-stated in a checklist run/);
    refused('(b) a checklist run whose triage is version 1 is refused', variant((d) => edit(d, TRIAGE, (t) => t.replace(/^version: 2$/m, 'version: 1'))), /the triage is version 1: a checklist run answers the checklist/);
    refused('(b) a checklist run with no triage is refused', variant((d) => unlinkSync(join(d, TRIAGE))), /no triage \(map\/effect-triage\.yaml\): it is what the checklist mode writes/);

    // (c)
    refused('(c) a mode the lane does not offer is refused', variant((d) => edit(d, 'map/scanners.yaml', (t) => t.replace('    mode: checklist', '    mode: quick'))), /mode: quick is not a mode the practice-review lane offers \(full, checklist\)/);
    refused('(c) a mode on a scanner with no lane is refused', variant((d) => edit(d, 'map/scanners.yaml', (t) => t.replace(/( {2}gitleaks:\n {4}status: )skipped/, '$1ran\n    mode: checklist').replace(/( {2}gitleaks:\n {4}status: ran\n {4}mode: checklist\n) {4}reason: .*\n/, '$1'))), /gitleaks: mode: checklist is not a mode the gitleaks lane offers \(it has no lane\)/);
    refused('(c) --mode naming another mode than the record\'s is refused', base, /--mode full, and the run record says the lane ran in checklist mode/, ['--lane', 'practice-review', '--mode', 'full', '--target', scratch]);
    const rec = readFileSync(join(SWEEP, 'map', 'scanners.yaml'), 'utf8');
    const modes = ['full', 'checklist'];
    const tryRow = (args) => { try { return setScannerRow(rec, 'practice-review', args.status, args).text; } catch (e) { return e; } };
    const quick = tryRow({ status: 'ran', mode: 'quick', modes });
    if (!(quick instanceof Error) || !/--mode quick: the practice-review lane offers the modes full, checklist/.test(quick.message)) fail(`(c) record --mode refuses a mode the lane does not offer (got ${quick instanceof Error ? quick.message : 'written'})`);
    const skipped = tryRow({ status: 'skipped', reason: 'not this run', mode: 'checklist', modes });
    if (!(skipped instanceof Error) || !/--mode records the mode a lane that ran ran in/.test(skipped.message)) fail('(c) record --mode refuses a mode on a row that is not ran');
    const written = tryRow({ status: 'ran', mode: 'checklist', modes });
    if (typeof written !== 'string' || !/ {2}practice-review:\n {4}status: ran\n {4}mode: checklist\n/.test(written)) fail('(c) record --mode checklist writes mode: checklist on the lane\'s row');
    else {
      const kept = setScannerRow(written, 'practice-review', 'ran', { model: 'm' }).text;
      if (!/ {4}mode: checklist\n/.test(kept)) fail('(c) a later ran that names no mode keeps the row\'s mode');
      const back = setScannerRow(written, 'practice-review', 'ran', { mode: 'full', modes }).text;
      if (/ {4}mode:/.test(back.split('  deep-code-review:')[0])) fail('(c) record --mode full writes no mode: line (a row with none ran in full)');
      const gone = setScannerRow(written, 'practice-review', 'failed', { reason: 'session lost' }).text;
      if (/ {4}mode:/.test(gone.split('  deep-code-review:')[0])) fail('(c) a row no longer ran drops its mode');
    }

    // (d)
    const lane = join(scratch, 'lane');
    cutToChecklist(SWEEP, lane, { record: false });
    const own = assay(['validate', lane, '--lane', 'practice-review', '--mode', 'checklist', '--target', scratch]);
    const missing = (own.stderr + own.stdout).match(/(\d+) of the (\d+) files the practice-review lane publishes/);
    if (missing) fail(`(d) the lane's own check in checklist mode asks only for the checklist's files (got: ${missing[0]})`);
    const asFull = assay(['validate', lane, '--lane', 'practice-review', '--target', scratch]);
    if (!/8 of the 11 files the practice-review lane publishes are not in the run/.test(asFull.stderr)) fail('(d) the same run checked as a full lane still names the 8 full-mode files it lacks');
    const bare = assay(['validate', base, '--mode', 'checklist']);
    if (bare.status !== 2 || !/--mode <mode> names the mode the --lane <scanner> ran in/.test(bare.stderr)) fail(`(d) --mode without --lane is a usage error (got ${bare.status})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
