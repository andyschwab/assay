// ── a before-review analyzer's zero results come with a positive control that fired (#223) ──
// The analyzer a review reads ran on a known-answer target and reported nothing: honest, since its rules do
// not model that target, but a run could not tell it from an analyzer that broke on the machine it ran on
// and matched nothing. An entry's `control` is planted cases the vendored rules must report, run before the
// target. Pinned with the real semgrep the gate requires:
//   (a) the reviewer's control fires on this machine: the envelope records ran and the control's expected
//       hits all found, naming no machine path;
//   (b) a control with a hit the rules do not report makes the run failed, naming the hit, with no report,
//       and the target is not run;
//   (c) a control that is not there makes the run failed, never ran with no control;
//   (d) each expected hit names a rule of the vendored set and a line of a planted file.
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pinnedTools } from '../../map/tools.mjs';
import { runBeforeReview, beforeReviewPath } from '../../map/start.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'before-review-control';

const ADAPTERS = join(ROOT, 'map', 'scanners', 'adapters');

export async function run() {
  const fail = (m) => negFailures.push('before-review-control: ' + m);
  const sg = pinnedTools().find((t) => t.scanner === 'deep-code-review' && t.bin === 'semgrep');
  if (!sg || !sg.before_review) { fail('the reviewer\'s adapter pins semgrep to run before its review'); return; }
  const control = sg.before_review.control;
  if (!control || !Array.isArray(control.expect) || !control.expect.length) { fail('(a) the reviewer\'s before-review entry carries a control with expected hits'); return; }
  const scratch = mkdtempSync(join(tmpdir(), 'assay-control-block-'));
  const read = (out) => { try { return JSON.parse(readFileSync(beforeReviewPath(out, sg.scanner, sg.bin), 'utf8')); } catch { return null; } };
  try {
    // a target with nothing the rules report
    const target = join(scratch, 'target'); mkdirSync(target);
    writeFileSync(join(target, 'index.js'), "module.exports = () => 'a target with no flow';\n");

    // (a)
    const outA = join(scratch, 'run-a');
    runBeforeReview(sg, target, outA, () => {});
    const a = read(outA);
    if (!a || a.status !== 'ran' || !a.control || a.control.expected !== control.expect.length || a.control.found !== control.expect.length || (a.control.missing || []).length) fail(`(a) the control fires and the run records ran (got ${JSON.stringify(a && { status: a.status, reason: a.reason, control: a.control })})`);
    if (a && [ROOT, scratch, tmpdir()].some((m) => JSON.stringify(a.control || {}).includes(m))) fail('(a) the control record names no machine path');

    // (b)
    const unmet = 'taint.js.sqli routes/run.js:4';
    const strict = { ...sg, before_review: { ...sg.before_review, control: { ...control, expect: [...control.expect, unmet] } } };
    const outB = join(scratch, 'run-b');
    runBeforeReview(strict, target, outB, () => {});
    const b = read(outB);
    if (!b || b.status !== 'failed' || b.report !== null || b.exit !== null || !/positive control did not fire/.test(b.reason || '') || !(b.reason || '').includes(unmet)) fail(`(b) a hit the rules do not report fails the run, naming it, with no report and the target not run (got ${JSON.stringify(b && { status: b.status, exit: b.exit, reason: b.reason, report: b.report === null ? null : 'present' })})`);

    // (c)
    const gone = { ...sg, before_review: { ...sg.before_review, control: { ...control, dir: 'deep-code-review/no-such-control' } } };
    const outC = join(scratch, 'run-c');
    runBeforeReview(gone, target, outC, () => {});
    const c = read(outC);
    if (!c || c.status !== 'failed' || c.report !== null || !/positive control did not fire/.test(c.reason || '')) fail(`(c) a control that is not there fails the run (got ${JSON.stringify(c && { status: c.status, reason: c.reason })})`);

    // (d)
    const rulesDir = join(ADAPTERS, String(sg.before_review.rules));
    const ruleText = ['js.yml', 'py.yml'].map((f) => (existsSync(join(rulesDir, f)) ? readFileSync(join(rulesDir, f), 'utf8') : '')).join('\n');
    for (const e of control.expect) {
      const m = String(e).match(/^(\S+) (\S+):(\d+)$/);
      if (!m) { fail(`(d) "${e}" reads <rule> <file>:<line>`); continue; }
      if (!new RegExp(`^- id: ${m[1].replace(/\./g, '\\.')}$`, 'm').test(ruleText)) fail(`(d) ${m[1]} is a rule of the vendored set`);
      const file = join(ADAPTERS, String(control.dir), m[2]);
      if (!existsSync(file) || readFileSync(file, 'utf8').split('\n').length < Number(m[3])) fail(`(d) ${m[2]}:${m[3]} is a line of a planted file`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
