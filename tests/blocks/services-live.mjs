// ── a database-backed suite, measured for real with its declared throwaway service (#256) ──
// SKIPPED WHERE DOCKER IS ABSENT: it runs only when `docker info` answers (a daemon, not just
// the client), and the gate line says which (services-live, or services-live-skipped-no-docker).
// The fixture declares Postgres; with `--services` fresh-clone starts it throwaway, runs the
// setup (a role), migrate (creates a table) and test (writes and reads it), and removes it.
// The test reads `passed` with its own counts, each bound step names the service it ran with,
// the container is gone afterwards, and the measurement reads both requirements met.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { measureRun } from '../../yardstick/measure.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'services-live';
const dockerUp = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 20000 }).status === 0;
export const gate = [dockerUp ? 'services-live' : 'services-live-skipped-no-docker'];

export async function run() {
  const fail = (m) => negFailures.push('services-live: ' + m);
  if (!dockerUp) { console.log('  · services-live: skipped, docker is absent here (no daemon answered `docker info`)'); return; }
  const doc = runFreshClone({ target: join(HERE, 'instruments', 'fresh-clone-services'), clone: false, timeout: 300, services: true });
  const st = Object.fromEntries(doc.steps.map((s) => [s.name, s]));
  if (doc.services?.provided !== true) fail(`the declared service is provided (got ${JSON.stringify(doc.services)})`);
  if (st.test?.status !== 'passed' || st.test?.tests?.passed !== 1 || st.test?.tests?.failed !== 0) fail(`the test reads passed by its real outcome (got ${st.test?.status}, ${JSON.stringify(st.test?.tests)}: ${st.test?.output_tail})`);
  if (st.migrate?.status !== 'passed' || st.migrate?.declared_as !== 'migrate') fail(`the real migrate script replays into the empty database (got ${st.migrate?.status}: ${st.migrate?.output_tail})`);
  for (const n of ['test', 'migrate']) if (JSON.stringify(st[n]?.services) !== JSON.stringify([{ name: 'postgres', image: 'postgres:16.4-alpine', throwaway: true }])) fail(`${n} names the service it ran with, throwaway (got ${JSON.stringify(st[n]?.services)})`);
  for (const n of ['install', 'build', 'lint', 'typecheck']) if (st[n]?.services) fail(`${n} is not bound and names no service`);
  if ((doc.services?.setup || []).map((x) => x.status).join() !== 'passed') fail(`the declared setup ran once and passed (got ${JSON.stringify(doc.services?.setup)})`);
  const c = doc.services?.containers?.[0];
  if (!c?.removed) fail(`the container is removed (got ${JSON.stringify(c)})`);
  else if (spawnSync('docker', ['ps', '-aq', '--filter', `name=${c.container}`], { encoding: 'utf8' }).stdout.trim()) fail(`docker still knows ${c.container}`);
  const rows = convert('fresh-clone', JSON.stringify(doc), doc.exit);
  const m = Object.fromEntries(measureRun({ findings: rows, manifest: [{ scanner: 'fresh-clone', status: 'ran' }], inputs: null, coverage: {} }).map((r) => [r.id, r]));
  for (const id of ['d-tests-execute-core', 'd-schema-versioned']) if (m[id]?.status !== 'met') fail(`${id} reads met, measured (got ${m[id]?.status}: ${m[id]?.note})`);
}
