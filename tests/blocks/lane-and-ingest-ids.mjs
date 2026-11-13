// ── a lane's ids and ingest's ids never collide, by construction (#304) ──
// A run drawn with its instruments, then a practice-review lane collected into it, failed closed:
// the lane numbers its findings in a scratch run that holds no instrument rows, ingest numbered
// from floors (700, 970, …) or the next hundred above the run's highest id, and a large
// instrument ran straight through the lane's ids. The two are now disjoint ranges (map/ids.mjs,
// SCHEMA.md §3): a lane numbers F-001..F-9999, ingest allocates F-10000 and above. Pinned:
//   (a) a run drawn by start's run-record writer, a 500-row instrument ingested into it (it would
//       have crossed every old floor), then a lane's files collected with the ids lanes really
//       wrote (F-001…, F-1000…): it validates clean, no id twice, every ingested id in the ingest
//       range, and the next ingest's start reads only the ingested ids;
//   (b) a lane finding in the ingest range fails validate, naming the range; an ingested row in
//       the lane range fails it in a run whose record carries ingest_ids_from:, naming the range;
//   (c) a stored run drawn before the ranges (no ingest_ids_from:) keeps its ids and validates;
//   (d) an ingest asked to start in the lane range is refused with its usage, exit 2.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { toScannersYaml } from '../../map/start.mjs';
import { nextStart } from '../../map/ingest.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'lane-and-ingest-ids';

const ROWS = 500;
const SCANNER = 'gitleaks';   // a leak list: one row per leak, the simplest report to make large

const laneFinding = (id, file = 'README.md') => `- id: ${id}\n  dimension: artifact-legibility\n  polarity: strength\n  subject_type: artifact\n  observation: >\n    The README says what the repository is.\n  evidence: [${file}:1]\n  confidence: confirmed\n`;

export async function run() {
  const fail = (m) => negFailures.push('lane-and-ingest-ids: ' + m);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-lane-ids-'));
  const adapters = loadAdapters();
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });
  const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ');
  const leaks = Array.from({ length: ROWS }, (_, i) => ({ RuleID: 'generic-api-key', Description: 'planted', File: 'README.md', StartLine: 1 + (i % 3), Secret: 'inert-planted-string' }));
  const report = join(scratch, 'leaks.json'); writeFileSync(report, JSON.stringify(leaks));

  // a run as start draws it (its record written by start's own writer), the instrument ingested,
  // then the lane collected: the order a consumer runs them in
  const drawn = (name, { record = true } = {}) => {
    const dir = join(scratch, name);
    mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
    const rows = Object.fromEntries(Object.keys(adoptedAdapters(adapters)).map((id) => [id, id === 'practice-review' ? { status: 'ran', model: 'a-model' } : { status: 'skipped', reason: 'not in this block' }]));
    let yaml = toScannersYaml('block', rows);
    if (!record) yaml = yaml.split('\n').filter((l) => !/^ingest_ids_from:/.test(l)).join('\n');
    writeFileSync(join(dir, 'map', 'scanners.yaml'), yaml);
    const ing = assay('ingest', dir, '--tool', SCANNER, '--raw', report, '--exit', '1');
    if (ing.status !== 0) fail(`${name}: the ${ROWS}-row ingest succeeds (got ${ing.status}: ${ing.stderr.trim().split('\n').slice(-2).join(' | ')})`);
    return dir;
  };
  const collect = (dir, ids) => writeFileSync(join(dir, 'map', 'findings', 'practice-review-legibility.yaml'), ids.map((id) => laneFinding(id)).join('\n'));
  const laneIds = [...Array.from({ length: 60 }, (_, i) => `F-${String(i + 1).padStart(3, '0')}`), ...Array.from({ length: 100 }, (_, i) => `F-${1000 + i}`)];

  try {
    // (a)
    const a = drawn('a');
    if (!/^ingest_ids_from: 10000$/m.test(readFileSync(join(a, 'map', 'scanners.yaml'), 'utf8'))) fail('(a) start\'s run-record writer records the ranges (ingest_ids_from: 10000)');
    collect(a, laneIds);
    const ingested = (parseYaml(readFileSync(join(a, 'map', 'findings', `${SCANNER}.yaml`), 'utf8')) || []).map((f) => Number(String(f.id).slice(2)));
    if (ingested.length !== ROWS) fail(`(a) the instrument wrote ${ROWS} rows (got ${ingested.length})`);
    if (ingested.some((n) => n < 10000)) fail(`(a) every ingested id is in the ingest range, F-10000 and above (lowest F-${Math.min(...ingested)})`);
    const all = idsIn(a);
    const twice = all.filter((id, i) => all.indexOf(id) !== i);
    if (twice.length) fail(`(a) no id is in the run twice (got ${twice.length}: ${twice.slice(0, 5).join(', ')}…)`);
    const v = assay('validate', a);
    if (v.status !== 0) fail(`(a) a lane collected beside a ${ROWS}-row instrument validates clean (got ${v.status}: ${bullets(v)})`);
    const ns = nextStart(a, 'deep-code-review');
    if (ns.start !== Math.ceil((Math.max(...ingested) + 1) / 100) * 100) fail(`(a) the next ingest starts above the highest INGESTED id, never reading the lane's (got F-${ns.start}: ${ns.reason})`);

    // (b) each direction, naming the range
    const b1 = drawn('b-lane-high'); collect(b1, ['F-001', 'F-12000']);
    const r1 = assay('validate', b1);
    if (r1.status !== 1 || !/F-12000: a lane's finding is numbered in the ingest range \(F-10000 and above\)/.test(r1.stderr)) fail(`(b) a lane finding in the ingest range fails validate, naming the range (got ${r1.status}: ${bullets(r1)})`);
    const b2 = drawn('b-ingest-low'); collect(b2, ['F-001']);
    const lowPath = join(b2, 'map', 'findings', `${SCANNER}.yaml`);
    writeFileSync(lowPath, readFileSync(lowPath, 'utf8').replace(/^- id: F-10700$/m, '- id: F-0700'));
    const r2 = assay('validate', b2);
    if (r2.status !== 1 || !/F-0700: an ingested gitleaks row is numbered in the lane range \(F-001\.\.F-9999\)/.test(r2.stderr)) fail(`(b) an ingested row in the lane range fails validate, naming the range (got ${r2.status}: ${bullets(r2)})`);

    // (c) the same run drawn before the ranges: its record carries no ingest_ids_from:
    const c = drawn('c', { record: false }); collect(c, ['F-001']);
    const cPath = join(c, 'map', 'findings', `${SCANNER}.yaml`);
    writeFileSync(cPath, readFileSync(cPath, 'utf8').replace(/^- id: F-10700$/m, '- id: F-0700'));
    const r3 = assay('validate', c);
    if (r3.status !== 0) fail(`(c) a run drawn before the ranges keeps its ids and validates (got ${r3.status}: ${bullets(r3)})`);

    // (d)
    const d = assay('ingest', drawn('d'), '--tool', SCANNER, '--raw', report, '--exit', '1', '--start', 'F-700');
    if (d.status !== 2 || !/--start F-700 is not an id in the ingest range/.test(d.stderr) || !/^usage: node assay\.mjs ingest/m.test(d.stderr)) fail(`(d) an ingest asked to start in the lane range is refused with its usage, exit 2 (got ${d.status}: ${d.stderr.trim().split('\n')[0]})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

// every finding id in a run, in file order
function idsIn(dir) {
  const fd = join(dir, 'map', 'findings');
  return readdirSync(fd).filter((f) => f.endsWith('.yaml')).sort()
    .flatMap((f) => (parseYaml(readFileSync(join(fd, f), 'utf8')) || []).map((x) => String(x.id)));
}
