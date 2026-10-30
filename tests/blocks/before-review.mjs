// ── a review reads what ran before it, and executes nothing (#201) ──
// A judgment scanner's review session refused to run binaries it downloaded, so the code reviewer's analyzer
// did not run. Now the deterministic phase runs each `tools:` entry with `before_review` over the target and
// writes its report into the run (map/raw/before-review/<scanner>/<bin>.json) for the review to read. Pinned
// with the real semgrep the gate requires:
//   (a) with the reviewer's vendored taint rules, a planted command injection is found and cited relative
//       to the target; the record says ran, names the rules, carries no stderr tail;
//   (b) a target's own .semgrep.yml takes the vendored rules' place;
//   (c) an exit outside ok_exits reads failed with its reason and no report, never an empty clean one; a
//       rule set that is not there reads skipped with its reason;
//   (d) the offline draw (`assay start`, the routine) writes it for every judgment scanner that has one;
//   (e) the vendored rules name their source commit and carry their licence.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pinnedTools } from '../../map/tools.mjs';
import { runBeforeReview, beforeReviewPath, drawOfflineMap } from '../../map/start.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'before-review';

export async function run() {
  const fail = (m) => negFailures.push('before-review: ' + m);
  const tmp = join(HERE, 'tmp-before-review'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const sg = pinnedTools().find((t) => t.scanner === 'deep-code-review' && t.bin === 'semgrep');
  if (!sg || !sg.before_review) { fail('the reviewer\'s adapter pins semgrep to run before its review'); return; }
  let scratch = null;
  const read = (out, t = sg) => { try { return JSON.parse(readFileSync(beforeReviewPath(out, t.scanner, t.bin), 'utf8')); } catch { return null; } };
  try {
    // (a)
    // outside any repository: semgrep honours the enclosing repository's .gitignore, and this one ignores tests/tmp-*
    scratch = mkdtempSync(join(tmpdir(), 'assay-before-review-'));
    const target = join(scratch, 'target'); mkdirSync(join(target, 'routes'), { recursive: true });
    writeFileSync(join(target, 'routes', 'run.js'), "const { exec } = require('child_process');\nmodule.exports = (req, res) => {\n  exec('ls ' + req.query.dir, (e, out) => res.send(out));\n};\n");
    const outA = join(tmp, 'run-a');
    runBeforeReview(sg, target, outA, () => {});
    const a = read(outA);
    const hits = a && a.report ? (JSON.parse(a.report).results || []) : [];
    if (!a || a.status !== 'ran' || a.rules !== 'deep-code-review/semgrep-taint') fail(`(a) the run records ran with the vendored rules (got ${JSON.stringify(a && { status: a.status, rules: a.rules, reason: a.reason })})`);
    if (!hits.some((h) => h.check_id === 'taint.js.command-injection' && h.path === 'routes/run.js' && h.start?.line === 3)) fail(`(a) the planted command injection is found at routes/run.js:3, relative to the target (got ${JSON.stringify(hits.map((h) => `${h.check_id} ${h.path}:${h.start?.line}`))})`);
    if (a && ('stderr' in a)) fail('(a) no stderr tail is archived');
    const machine = (rec) => [ROOT, ROOT.replace(/^\/+/, '').split('/').join('.'), scratch, scratch.replace(/^\/+/, '').split('/').join('.')].filter((m) => JSON.stringify(rec).includes(m));
    if (a && machine(a).length) fail(`(a) the record names no machine path (got ${machine(a).join(', ')})`);

    // (b)
    writeFileSync(join(target, '.semgrep.yml'), 'rules:\n  - id: planted-own-rule\n    pattern: res.send(...)\n    message: the target\'s own rule\n    languages: [javascript]\n    severity: INFO\n');
    const outB = join(tmp, 'run-b');
    runBeforeReview(sg, target, outB, () => {});
    const b = read(outB);
    const own = b && b.report ? (JSON.parse(b.report).results || []) : [];
    if (!b || b.rules !== '.semgrep.yml' || !own.length || !own.every((h) => h.check_id === 'planted-own-rule') || machine(b).length) fail(`(b) the target's own .semgrep.yml takes the vendored rules' place (got ${JSON.stringify(b && { rules: b.rules, ids: own.map((h) => h.check_id) })})`);

    // (c)
    const failing = { ...sg, bin: 'false', versionArgs: ['--version'], before_review: { ...sg.before_review } };
    const outC = join(tmp, 'run-c');
    runBeforeReview(failing, target, outC, () => {});
    const c = read(outC, failing);
    if (!c || c.status !== 'failed' || c.report !== null || !/exited 1/.test(c.reason || '')) fail(`(c) an exit outside ok_exits reads failed, with its reason and no report (got ${JSON.stringify(c)})`);
    const noRules = { ...sg, before_review: { ...sg.before_review, rules: 'no-such-rules', repo_rules: [] } };
    const outD = join(tmp, 'run-d');
    runBeforeReview(noRules, join(HERE, 'instruments', 'fresh-clone-target'), outD, () => {});
    const d = read(outD);
    if (!d || d.status !== 'skipped' || !/no rule set/.test(d.reason || '')) fail(`(c) a rule set that is not there reads skipped, with its reason (got ${JSON.stringify(d)})`);

    // (d)
    const outE = join(tmp, 'run-e');
    drawOfflineMap({ repoDir: join(HERE, 'instruments', 'fresh-clone-target'), outDir: outE, pendingReason: 'x', freshCloneSkipReason: 'not this block\'s', structureScanNoExec: true });
    const e = read(outE);
    if (!e || e.status !== 'ran') fail(`(d) the offline draw runs semgrep before the review and writes its record (got ${JSON.stringify(e && { status: e.status, reason: e.reason })})`);

    // (e)
    const dir = join(ROOT, 'map', 'scanners', 'adapters', 'deep-code-review', 'semgrep-taint');
    const source = existsSync(join(dir, 'SOURCE.md')) ? readFileSync(join(dir, 'SOURCE.md'), 'utf8') : '';
    if (!/`[0-9a-f]{40}`/.test(source) || !/MIT/.test(readFileSync(join(dir, 'LICENSE'), 'utf8'))) fail('(e) the vendored rules name their source commit and carry their MIT licence');
    for (const f of ['js.yml', 'py.yml']) if (!existsSync(join(dir, f))) fail(`(e) the vendored rule set carries ${f}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}
