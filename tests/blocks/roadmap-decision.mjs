// ── roadmap decision structure: an unknown is a variable with a stated default ─────────────
// A roadmap item states `assumptions` and at most one `question` with a recommended answer;
// the plan prompt proceeds on them and waits only for a `blocking: true` question. The legacy
// `questions:` list compiles exactly as before (pinned below, word for word), and validate warns
// on it without failing. Each malformed new field is a validate error naming the item's slug.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'roadmap-decision';

export async function run() {
  const fail = (m) => negFailures.push('roadmap-decision: ' + m);
  const tmp = join(HERE, 'tmp-roadmap-decision'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmp);
  copyFixtureScanners('cleanlib', tmp);
  // repo-eval is a judgment scanner: with no model of record it warns (#56), and this
  // block's "no warning at all" must stay about the roadmap shape alone
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), readFileSync(join(tmp, 'map', 'scanners.yaml'), 'utf8').replace('  repo-eval:\n    status: ran\n', '  repo-eval:\n    status: ran\n    model: "test-model"\n'));
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  const head = ['target: "decision test target"', 'maintainer: "the test maintainers"', 'exec_summary: "test"', 'roadmap:'];
  const item = (extra) => ['  - slug: declare-lint', '    title: "Declare the missing lint gate"', '    body: "Lint is not declared; add it."', '    findings: [F-900]', ...extra, '    done_when:', '      - "package.json declares a lint script"', ''];
  const writeProse = (extra) => writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [...head, ...item(extra)].join('\n'));
  const compile = (extra) => {
    writeProse(extra);
    const r = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
    const planDir = join(tmp, 'handoff', 'plan');
    const f = existsSync(planDir) ? readdirSync(planDir).find((x) => /^01-/.test(x)) : null;
    return { status: r.status, stderr: r.stderr, plan: f ? readFileSync(join(planDir, f), 'utf8') : '', remediation: existsSync(join(tmp, 'handoff', 'REMEDIATION.md')) ? readFileSync(join(tmp, 'handoff', 'REMEDIATION.md'), 'utf8') : '', start: existsSync(join(tmp, 'handoff', 'START-HERE.md')) ? readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8') : '' };
  };
  const check = (extra) => {
    writeProse(extra);
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    return { status: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
  };
  const ASSUME = ['    assumptions:', '      - "The lint tool is the one already in devDependencies."', '      - "CI already runs npm test."'];
  const Q = (blocking) => ['    question:', '      text: "Should lint failures block merges?"', '      recommended: "Yes, as a required check."', ...(blocking === undefined ? [] : [`      blocking: ${blocking}`])];
  const OPTS = (rec) => ['    options:', '      - name: "Script only"', '        tradeoff: "Smallest change."', '      - name: "Script plus CI"', '        tradeoff: "Catches regressions."', ...(rec ? ['        recommended: true'] : [])];

  // 1. assumptions + a non-blocking question: proceed on the defaults, never wait
  const nb = compile([...ASSUME, ...Q(false)]);
  if (nb.status !== 0) fail(`handoff.mjs must compile an item with assumptions and a question (stderr: ${nb.stderr})`);
  if (!nb.plan.includes('## Step 1 — Assumptions')) fail(`a new-shape item must render "Step 1 — Assumptions" (got:\n${nb.plan})`);
  if (!nb.plan.includes('We proceed on these unless the owner says otherwise on the issue:') || !nb.plan.includes('- CI already runs npm test.')) fail('the assumptions must be listed under "we proceed on these unless the owner says otherwise on the issue"');
  if (!nb.plan.includes('One question: Should lint failures block merges? Recommended answer: Yes, as a required check.')) fail('the question must render with its recommended answer');
  if (!nb.plan.includes('Proceed with the recommended answer unless the owner has answered otherwise.')) fail('a non-blocking question must say to proceed with the recommended answer');
  if (!nb.plan.includes('Work in order. Confirm the claims against the code first; then proceed on the assumptions below unless I have said otherwise.')) fail('a new-shape item must open with the proceed-on-assumptions line');
  if (/Wait for my answers|do not change code until I have answered|Ask it and wait|must be answered before code changes/.test(nb.plan)) fail('a non-blocking item must carry no wait/gate wording');
  if (/## Step 1 — Ask/.test(nb.plan)) fail('a new-shape item must not render the legacy "Step 1 — Ask"');
  if (!/\*\*Assumptions\*\*/.test(nb.remediation) || !/\*\*Question:\*\* Should lint failures block merges\? Recommended answer: Yes, as a required check\./.test(nb.remediation)) fail('REMEDIATION.md must carry the item\'s assumptions and question');

  // 2. a blocking question: ask it and wait, and say so up front
  const bl = compile([...ASSUME, ...Q(true)]);
  if (bl.status !== 0) fail(`handoff.mjs must compile an item with a blocking question (stderr: ${bl.stderr})`);
  if (!bl.plan.includes('Ask it and wait for the answer before changing code.')) fail(`a blocking question must render "Ask it and wait" (got:\n${bl.plan})`);
  if (!bl.plan.includes('This item has one question that must be answered before code changes; ask it and wait.')) fail('a blocking question must add the opening "must be answered before code changes" line');
  if (bl.plan.includes('Proceed with the recommended answer unless the owner has answered otherwise.')) fail('a blocking question must not tell the agent to proceed on the recommended answer');
  // a question with no `blocking` key defaults to non-blocking
  const dflt = compile([...ASSUME, ...Q(undefined)]);
  if (/Ask it and wait/.test(dflt.plan) || !dflt.plan.includes('Proceed with the recommended answer unless the owner has answered otherwise.')) fail('a question with no blocking key must default to non-blocking');

  // 3. a recommended option: proceed with it, present the others in the PR
  const ro = compile([...ASSUME, ...OPTS(true)]);
  if (!ro.plan.includes('Proceed with the recommended option (Script plus CI) unless the owner has chosen another; present the others with their trade-offs in the PR.')) fail(`a recommended option must render "Proceed with the recommended option" (got:\n${ro.plan})`);
  if (/Do not\s+pick for me/.test(ro.plan)) fail('a recommended option must not say "Do not pick for me"');
  const nr = compile([...ASSUME, ...OPTS(false)]);
  if (!/Present these \(and any better approach you see\), with tradeoffs, and let me choose\. Do not\s+pick for me\./.test(nr.plan) || /Proceed with the recommended option/.test(nr.plan)) fail('with no option recommended, Step 2 keeps its present-and-let-me-choose wording');
  if (!ro.start.includes('proceed on its stated assumptions and recommended')) fail('START-HERE must describe both behaviours (proceed on defaults; interview when none recorded)');

  // 4. a legacy `questions:` list: today's prompt, word for word; validate warns but passes
  const legacy = compile(['    questions:', '      - "Which linter does the team use?"', '      - "Should lint block merges?"', ...OPTS(false)]);
  if (legacy.status !== 0) fail(`a legacy questions: list must still compile (stderr: ${legacy.stderr})`);
  const LEGACY_OPEN = 'You are closing one item from a code evaluation of this repository. Work in order and\n**do not change code until I have answered the questions and chosen an approach.**';
  const LEGACY_STEP1 = '## Step 1 — Ask\n\n- Which linter does the team use?\n- Should lint block merges?\n\nWait for my answers before proceeding.\n\n## Step 2 — Choose the approach\n\nPresent these (and any better approach you see), with tradeoffs, and let me choose. Do not\npick for me.\n\n- **Script only** — Smallest change.\n- **Script plus CI** — Catches regressions.\n\n## Step 3 — Implement';
  if (!legacy.plan.includes(LEGACY_OPEN)) fail(`a legacy item must keep its opening, word for word (got:\n${legacy.plan.slice(0, 900)})`);
  if (!legacy.plan.includes(LEGACY_STEP1)) fail(`a legacy item must keep Steps 1-2, word for word (got:\n${legacy.plan})`);
  if (/Assumptions|recommended/.test(legacy.plan)) fail('a legacy item must carry none of the new wording');
  const legacyNone = compile([]);   // no questions, no options, no assumptions: the unchanged ask-and-wait default
  if (!legacyNone.plan.includes(LEGACY_OPEN) || !legacyNone.plan.includes('## Step 1 — Ask\n\nAsk me any context the read-only evaluation could not know (intended behavior, callers,\nconstraints) and wait.')) fail('an item with no decision fields keeps today\'s ask-and-wait default');
  const lv = check(['    questions:', '      - "Which linter does the team use?"', '      - "Should lint block merges?"']);
  if (lv.status !== 0) fail(`a legacy questions: list must validate green (got ${lv.status}:\n${lv.out})`);
  if (!/warning/.test(lv.out) || !/declare-lint/.test(lv.out) || !/prefer assumptions plus at most one question with a recommended answer/.test(lv.out)) fail(`a legacy questions: list with 2 entries must warn (prefer assumptions plus at most one question…) (got:\n${lv.out})`);
  const lv1 = check(['    questions:', '      - "Which linter does the team use?"']);
  if (lv1.status !== 0 || !/prefer assumptions plus at most one question/.test(lv1.out)) fail(`a one-entry legacy questions: list must also warn, and pass (got ${lv1.status}:\n${lv1.out})`);
  const good = check([...ASSUME, ...Q(false), ...OPTS(true)]);
  if (good.status !== 0 || /warning/.test(good.out)) fail(`the new shape must validate green with no warning (got ${good.status}:\n${good.out})`);

  // 5. each malformed new field is a validate error naming the slug
  const bad = [
    ['assumptions not a list', ['    assumptions: "just a string"']],
    ['an empty assumption', ['    assumptions:', '      - "fine"', '      - ""']],
    ['question not an object', ['    question: "Should it block?"']],
    ['question without text', ['    question:', '      recommended: "Yes."']],
    ['question with an empty recommended', ['    question:', '      text: "Block merges?"', '      recommended: ""']],
    ['question without recommended', ['    question:', '      text: "Block merges?"']],
    ['a non-boolean blocking', ['    question:', '      text: "Block merges?"', '      recommended: "Yes."', '      blocking: "yes"']],
    ['two recommended options', ['    options:', '      - name: "A"', '        tradeoff: "a"', '        recommended: true', '      - name: "B"', '        tradeoff: "b"', '        recommended: true']],
  ];
  for (const [what, extra] of bad) {
    const v = check(extra);
    if (v.status !== 1) fail(`${what} must be a validate error (exit ${v.status}):\n${v.out}`);
    else if (!/roadmap item "declare-lint"/.test(v.out)) fail(`${what}: the error must name the roadmap item's slug (got:\n${v.out})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
