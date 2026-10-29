// ── repo-census ci-gate: a `set +e` that reads the exit status and acts on it (#166) ──
// `set +e` used to mark any gate step fail-open, even when the script captures the
// status and the job still fails on it a step later. Pinned:
//   (a) status captured and handed through $GITHUB_OUTPUT to a later step of the same
//       job that exits non-zero under an if: on it → no fail-open; ci-gate passes and
//       d-ci-gate-on-default-branch reads met;
//   (b) status captured and the script itself exits non-zero on it → no fail-open;
//   (c) `set +e` with no status read → fail-open, as before;
//   (d) a status read the census cannot follow (handed on and acted on by nothing, no
//       step id, a later step in another job) → fail_open: unknown with the reason; the
//       check reads not-measured, ingest files a ci-gate-unverifiable fact row, and the
//       requirement reads not-measured: never met, never fail-open.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkflow } from '../../map/repo-census.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { projectMulti } from '../../map/project.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'ci-gate-set-e-status';

const HEAD = 'on:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n';
const CAPTURE = `      - name: Run the tests
        id: verify
        run: |
          set +e
          npm test > "$RUNNER_TEMP/test.out" 2>&1
          code=$?
          set -e
          if [ "$code" = "0" ]; then echo "status=ok" >> "$GITHUB_OUTPUT"; else echo "status=failed" >> "$GITHUB_OUTPUT"; fi
`;
const ACT = `
      - name: The tests failed, so fail the run
        if: steps.verify.outputs.status == 'failed'
        run: |
          tail -n 40 "$RUNNER_TEMP/test.out"
          exit 1
`;

export async function run() {
  const fail = (m) => negFailures.push('ci-gate-set-e-status: ' + m);
  const step = (wf) => parseWorkflow(wf).steps.find((s) => s.isGateCmd);
  const setELine = (wf) => wf.split('\n').findIndex((l) => /set \+e/.test(l)) + 1;

  // parse-level
  const repro = HEAD + CAPTURE + ACT;
  const a = step(repro);
  if (!a) fail('(a) the capturing step must read as a gate command');
  else if (a.continueOnError || a.failOpenUnknown) fail(`(a) a captured status acted on a step later is not fail-open (got ${JSON.stringify({ coe: a.continueOnError, unknown: a.failOpenUnknown })})`);
  const b = step(HEAD + '      - run: |\n          set +e\n          npm test\n          code=$?\n          set -e\n          echo "tests exited $code"\n          exit $code\n');
  if (!b || b.continueOnError || b.failOpenUnknown) fail('(b) a script that exits on the captured status is not fail-open');
  const bare = HEAD + '      - run: |\n          set +e\n          npm test\n';
  const c = step(bare);
  if (!c?.continueOnError || c.failOpenShell !== 'set +e' || c.coeLine !== setELine(bare)) fail(`(c) set +e with no status read stays fail-open, citing its own line (got ${JSON.stringify({ coe: c?.continueOnError, shape: c?.failOpenShell, line: c?.coeLine })})`);
  const UNKNOWN = [
    ['handed on, acted on by nothing', HEAD + CAPTURE, /no later step of job test exits non-zero/],
    ['handed on with no step id', HEAD + CAPTURE.replace('        id: verify\n', '') + ACT, /has no id/],
    ['acted on in another job', HEAD + CAPTURE + '  report:\n    runs-on: ubuntu-latest\n    steps:' + ACT, /no later step of job test/],
    ['read and neither exited on nor handed on', HEAD + '      - run: |\n          set +e\n          npm test\n          code=$?\n          echo "tests exited $code"\n', /neither exits non-zero on it nor hands it on/],
  ];
  for (const [what, wf, re] of UNKNOWN) {
    const s = step(wf);
    if (!s) { fail(`(d) ${what}: the step must read as a gate command`); continue; }
    if (s.continueOnError) fail(`(d) ${what}: a status read the census cannot follow is never fail-open`);
    if (!s.failOpenUnknown || !re.test(s.failOpenUnknown.reason || '') || s.failOpenUnknown.line !== setELine(wf)) fail(`(d) ${what}: recorded unknown at the set +e line with its reason (got ${JSON.stringify(s.failOpenUnknown)})`);
  }

  // end to end: census → ingest → yardstick
  const tmp = join(HERE, 'tmp-ci-gate-set-e');
  const census = (wf) => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'slug', scripts: { test: 'node --test' } }) + '\n');
    writeFileSync(join(tmp, '.github', 'workflows', 'ci.yml'), wf);
    const out = join(tmp, '..', 'tmp-ci-gate-set-e.json');
    rmSync(out, { force: true });
    let exit = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch (e) { exit = e.status; }
    const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
    rmSync(out, { force: true });
    return { exit, raw, doc: raw ? JSON.parse(raw) : null };
  };
  const reg = loadYardstick();
  const requirement = (raw, exit) => {
    const rows = convert('repo-census', raw, exit);
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`every census row must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    return { rows, m: measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-ci-gate-on-default-branch') };
  };
  const held = census(repro);
  const heldGate = held.doc?.checks.find((x) => x.name === 'ci-gate');
  if (heldGate?.status !== 'pass' || heldGate.detail?.failOpen?.length) fail(`(a) the reproduction's ci-gate passes with no fail-open row (got ${heldGate?.status}: ${heldGate?.observation})`);
  else if (requirement(held.raw, held.exit).m?.status !== 'met') fail('(a) d-ci-gate-on-default-branch reads met over the reproduction');
  const open = census(bare);
  const openGate = open.doc?.checks.find((x) => x.name === 'ci-gate');
  if (openGate?.status !== 'gap' || !openGate.detail?.failOpen?.length) fail(`(c) bare set +e keeps ci-gate a fail-open gap (got ${openGate?.status})`);
  else {
    const { rows, m } = requirement(open.raw, open.exit);
    if (!rows.some((r) => r.native_category === 'ci-gate' && r.fail_open === true) || m?.status !== 'unmet') fail(`(c) the fail-open gap row carries fail_open: true and the requirement reads unmet (got ${m?.status})`);
  }
  const unsure = census(HEAD + CAPTURE);
  const unsureGate = unsure.doc?.checks.find((x) => x.name === 'ci-gate');
  if (unsureGate?.status !== 'not-measured' || unsureGate.detail?.failOpenUnknown?.[0]?.fail_open !== 'unknown' || !/cannot tell/.test(unsureGate.observation || '')) fail(`(d) an unfollowable hand-on reads ci-gate not-measured, the step fail_open: unknown (got ${unsureGate?.status}: ${JSON.stringify(unsureGate?.detail?.failOpenUnknown)})`);
  else {
    const { rows, m } = requirement(unsure.raw, unsure.exit);
    const fact = rows.filter((r) => r.native_category === 'ci-gate-unverifiable');
    if (fact.length !== 1 || fact[0].polarity !== 'fact' || rows.some((r) => r.native_category === 'ci-gate')) fail('(d) ingest files one ci-gate-unverifiable fact row and leaves ci-gate itself empty');
    if (m?.status !== 'not-measured') fail(`(d) d-ci-gate-on-default-branch reads not-measured, never met (got ${m?.status})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
