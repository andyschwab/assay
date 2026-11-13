// ── `assay start --allow-services` and `--unstripped-report` (#256) ──
// --allow-services passes the services opt-in through to fresh-clone, and only with
// --allow-exec: alone it is refused, nothing written. --unstripped-report <file> also writes
// fresh-clone's report as drawn (step output tails included) to <file>, which must lie outside
// the run (inside, refused, nothing written); the run's own archived copy stays stripped. A stub
// `docker` first on PATH stands in for the runtime (no docker needed): it starts the service,
// the declared setup then fails against a port nothing listens on, and that failure's output is
// what the unstripped report keeps and the run does not.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, chmodSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'start-unstripped-report';

export async function run() {
  const fail = (m) => negFailures.push('start-unstripped-report: ' + m);
  const tmp = join(HERE, 'tmp-start-unstripped'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const target = join(tmp, 'target');
  cpSync(join(HERE, 'instruments', 'fresh-clone-services'), target, { recursive: true });
  const git = (args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' });
  git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'assay regression']); git(['add', '-A']);
  if (git(['commit', '-q', '-m', 'init']).status !== 0) fail('could not git-init the scratch target');
  const bin = join(tmp, 'bin'); mkdirSync(bin);
  const log = join(tmp, 'runtime.log');
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env node
import('node:fs').then((fs) => {
  const a = process.argv.slice(2);
  fs.appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
  if (a[0] === 'run') console.log('0123456789ab');
  else if (a[0] === 'port') console.log('127.0.0.1:9');
  else if (a[0] === 'rm') console.log(a[a.length - 1]);
});
`);
  chmodSync(join(bin, 'docker'), 0o755);
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  const start = (args) => spawnSync(process.execPath, [join(ROOT, 'map', 'start.mjs'), ...args], { encoding: 'utf8', env });

  // refusals: nothing is written
  const r1 = start(['--out', join(tmp, 'run-a'), target, '--allow-services']);
  if (r1.status !== 2 || !/--allow-services .* only under --allow-exec/.test(r1.stderr) || existsSync(join(tmp, 'run-a'))) fail(`--allow-services without --allow-exec is refused, nothing written (exit ${r1.status}: ${r1.stderr})`);
  const r2 = start(['--out', join(tmp, 'run-b'), target, '--allow-exec', '--unstripped-report', join(tmp, 'run-b', 'fc.json')]);
  if (r2.status !== 2 || !/lies inside the run/.test(r2.stderr) || existsSync(join(tmp, 'run-b'))) fail(`an unstripped report inside the run is refused, nothing written (exit ${r2.status}: ${r2.stderr})`);

  // the opt-ins together
  const runDir = join(tmp, 'run'), kept = join(tmp, 'operator', 'fresh-clone.json');
  const r = start(['--out', runDir, target, '--allow-exec', '--allow-services', '--unstripped-report', kept]);
  if (r.status !== 0) fail(`start draws the run (exit ${r.status}: ${r.stdout.slice(-400)}${r.stderr.slice(-400)})`);
  const calls = existsSync(log) ? readFileSync(log, 'utf8') : '';
  if (!/^run -d --rm --name assay-svc-postgres-/m.test(calls) || !/^rm -f assay-svc-postgres-/m.test(calls)) fail(`--allow-services reaches fresh-clone, which starts the declared service throwaway and removes it (runtime calls: ${calls || '(none)'})`);
  if (!existsSync(kept)) fail('--unstripped-report writes the report outside the run');
  else {
    const doc = JSON.parse(readFileSync(kept, 'utf8'));
    if (doc.services?.requested !== true || doc.services?.setup?.[0]?.status !== 'failed') fail(`the kept report is fresh-clone's, the opt-in requested and the setup failed (got ${JSON.stringify(doc.services)})`);
    if (!/ECONNREFUSED/.test(doc.services?.setup?.[0]?.output_tail || '')) fail(`the kept report carries the failed setup's output tail, its reason (got ${JSON.stringify(doc.services?.setup?.[0]?.output_tail)})`);
  }
  const archived = join(runDir, 'map', 'raw', 'fresh-clone.json');
  if (!existsSync(archived)) fail('the run archives fresh-clone\'s report');
  else {
    const text = readFileSync(archived, 'utf8');
    if (/output_tail/.test(text) || /ECONNREFUSED/.test(text)) fail('the run\'s archived report stays stripped: no output tail');
    if (!/"service-setup"|service-setup/.test(readFileSync(join(runDir, 'map', 'findings', 'fresh-clone.yaml'), 'utf8'))) fail('the failed setup is its own service-setup row in the run');
  }
  rmSync(tmp, { recursive: true, force: true });
}
