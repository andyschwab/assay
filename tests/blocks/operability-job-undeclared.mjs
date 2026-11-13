// ── a scheduled job with no declared expectation is a gap citing the job (#311) ──
// An absence nobody declared is an absence nobody notices. Two cases over the public
// target tests/instruments/signals-target:
//   (a) its declaration files removed, leaving one scheduled job (the nightly CI workflow) and
//       no expectation: d-expectations-declared reads unmet citing that job at its cron line,
//       never not measured, even with no effect triage (a gap counts wherever it sits);
//   (b) only the nightly job's declaration removed, the other job, effect and cost account
//       still declared: the row reads mixed (a gap beside strengths, the instrument rule), and
//       its one gap is that job, so a declared neighbour never hides it.
import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { run as census } from '../../map/repo-census.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'operability-job-undeclared';

const ID = 'd-expectations-declared';
const JOB_CITE = '.github/workflows/nightly-sync.yml:4';

export async function run() {
  const fail = (m) => negFailures.push('operability-job-undeclared: ' + m);
  const tmp = join(HERE, 'tmp-operability-job-undeclared'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const reg = loadYardstick();
  const measure = (dir, channels) => {
    const doc = census({ target: dir, asOf: '2026-11-13' });
    const rows = convert('repo-census', JSON.stringify(doc), doc.exit);
    const r = measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {}, channels }, reg).find((x) => x.id === ID);
    return { r, rows, byId: new Map(rows.map((x) => [x.id, x])) };
  };
  try {
    // (a) one scheduled job, no declaration, and no effect inventory
    const one = join(tmp, 'a'); cpSync(join(HERE, 'instruments', 'signals-target'), one, { recursive: true });
    for (const f of ['signals.yaml', 'health.yaml', 'routing.yaml']) rmSync(join(one, 'ops', f));
    const A = measure(one, { candidates: null, triage: null });
    if (A.r?.status !== 'unmet') fail(`(a) an application with scheduled jobs and no declaration reads ${ID} unmet, never not measured (got ${A.r?.status}: ${A.r?.note})`);
    const cited = (A.r?.findings || []).map((id) => A.byId.get(id)).filter((f) => f && f.polarity === 'gap').flatMap((f) => f.evidence);
    if (cited.join() !== JOB_CITE) fail(`(a) the row cites the one scheduled job it found, ${JOB_CITE} (got ${cited.join(', ')})`);
    // (b) the nightly job's declaration, and its report and route, removed; the rest declared
    const part = join(tmp, 'b'); cpSync(join(HERE, 'instruments', 'signals-target'), part, { recursive: true });
    const drop = (file, re) => { const p = join(part, 'ops', file); writeFileSync(p, readFileSync(p, 'utf8').replace(re, '')); };
    drop('signals.yaml', /  - name: nightly-sync-ran\n(    .*\n){4}/);
    drop('health.yaml', /  - name: nightly-sync-ran\n    .*\n/);
    drop('routing.yaml', /  - signal: nightly-sync-ran\n(    .*\n){3}/);
    if (/nightly-sync-ran/.test(readFileSync(join(part, 'ops', 'signals.yaml'), 'utf8'))) fail('(b) setup: the nightly declaration was removed');
    const B = measure(part, { candidates: [], triage: [] });
    if (B.r?.status !== 'mixed') fail(`(b) one undeclared job beside declared ones reads ${ID} mixed (got ${B.r?.status}: ${B.r?.note})`);
    const gaps = (B.r?.findings || []).map((id) => B.byId.get(id)).filter((f) => f && f.polarity === 'gap');
    if (gaps.length !== 1 || !gaps[0].evidence.includes(JOB_CITE) || gaps[0].native_id !== 'expectation-declared@job:nightly-sync')
      fail(`(b) the one gap cites the undeclared job at ${JOB_CITE} (got ${gaps.map((g) => `${g.native_id} ${g.evidence}`).join(' | ') || 'none'})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
