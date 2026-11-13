// ── the operability rows measure declared signals, a health report and a routing policy (#311) ──
// The public target tests/instruments/signals-target declares every signal: a CI workflow's
// nightly job and a job it schedules itself, one external effect and one cost account, each
// with an expectation, its evidence and a runbook anchor; a health report schema that states
// every one; a routing policy at record for every one; and a passing transcript of the live
// report. Run through the census (in a scratch git repository, so the transcript's commit
// resolves) and measured beside a closed effect triage whose one effect cites the declared
// file, it reads met on d-expectations-declared, d-health-reported and d-routing-proportionate.
// The same run with no effect triage reads d-expectations-declared not measured, never met: an
// effect population nobody closed is not an empty one.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { run as census } from '../../map/repo-census.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'operability-signals-met';

const ROWS = ['d-expectations-declared', 'd-health-reported', 'd-routing-proportionate'];

export async function run() {
  const fail = (m) => negFailures.push('operability-signals-met: ' + m);
  const tmp = join(HERE, 'tmp-operability-signals-met'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    cpSync(join(HERE, 'instruments', 'signals-target'), tmp, { recursive: true });
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
    for (const a of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) execFileSync('git', a, { cwd: tmp, env });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();
    const tr = join(tmp, 'ops', 'evidence', 'd-health-reported.md');
    writeFileSync(tr, readFileSync(tr, 'utf8').replace(/^commit: [0-9a-f]{7,40}$/m, `commit: ${sha}`));

    const doc = census({ target: tmp, asOf: '2026-11-13' });
    const rows = convert('repo-census', JSON.stringify(doc), doc.exit);
    const effect = { id: 'F-001', polarity: 'fact', subject_type: 'effect', effect: { channel: 'digest-mail', external: true, reversible: false, gate_type: 'none', telemetry: 'structured-event' }, observation: 'sends the weekly digest mail', evidence: ['src/mail.mjs:3'] };
    const channels = { candidates: ['src/mail.mjs'], triage: [{ candidate: 'src/mail.mjs', finding: 'F-001' }] };
    const reg = loadYardstick();
    const measure = (ch) => Object.fromEntries(measureRun({ findings: [...rows, effect], manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {}, channels: ch }, reg).map((r) => [r.id, r]));

    const got = measure(channels);
    for (const id of ROWS) if (got[id]?.status !== 'met') fail(`${id} reads met over a target that declares, reports and routes every signal at record (got ${got[id]?.status}: ${got[id]?.note})`);
    const exp = got['d-expectations-declared'];
    for (const cite of ['F-001']) if (!(exp?.findings || []).includes(cite)) fail(`d-expectations-declared cites the declared effect ${cite} it read (got ${exp?.findings})`);
    const jobs = rows.filter((r) => r.native_category === 'expectation-declared' && /@job:/.test(r.native_id));
    if (jobs.map((r) => r.native_id).sort().join() !== 'expectation-declared@job:nightly-sync,expectation-declared@job:weekly-digest' || jobs.some((r) => r.polarity !== 'strength'))
      fail(`the census finds both scheduled jobs, the CI workflow's and the application's own, each declared (got ${jobs.map((r) => `${r.native_id}/${r.polarity}`).join(', ')})`);

    const open = measure({ candidates: null, triage: null })['d-expectations-declared'];
    if (open?.status !== 'not-measured' || !/effects: not measured/.test(open.note)) fail(`with no closed effect inventory d-expectations-declared reads not measured, naming why (got ${open?.status}: ${open?.note})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
