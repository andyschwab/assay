// ── every throwaway service is removed, whatever happens (#256) ──
// A stub container runtime (a script answering run / port / exec / rm and logging each call)
// stands in for docker, so this needs none. A setup command that fails: the setup is its own
// row (and its own service-setup gap), the bound steps read skipped, never charged, and the
// container is removed. A service that never comes ready within its wait: the steps read
// skipped with the reason, and the container is removed. A service that does not start:
// nothing to remove, and the steps say why.
import { rmSync, cpSync, mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { SERVICES_FILE } from '../../map/services.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'services-teardown';

function stubRuntime(dir, { runExit = 0, readyExit = 0 }) {
  const log = join(dir, 'runtime.log');
  const p = join(dir, 'stub-runtime');
  writeFileSync(p, `#!/usr/bin/env node
import('node:fs').then((fs) => {
  const a = process.argv.slice(2);
  fs.appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
  if (a[0] === 'run') { if (${runExit}) { console.error('stub: image not found'); process.exit(${runExit}); } console.log('0123456789ab'); }
  else if (a[0] === 'port') console.log('127.0.0.1:55432');
  else if (a[0] === 'exec') process.exit(${readyExit});
  else if (a[0] === 'rm') console.log(a[a.length - 1]);
});
`);
  chmodSync(p, 0o755);
  return { runtime: p, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []) };
}

export async function run() {
  const fail = (m) => negFailures.push('services-teardown: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-services');
  const measure = (what, edit, stub) => {
    const dir = mkdtempSync(join(tmpdir(), 'assay-services-teardown-'));
    const target = join(dir, 'target');
    cpSync(fx, target, { recursive: true });
    const p = join(target, SERVICES_FILE);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
    const rt = stubRuntime(dir, stub);
    let doc = null;
    try { doc = runFreshClone({ target, clone: false, timeout: 60, services: true, runtime: rt.runtime }); }
    catch (e) { fail(`${what}: the runner must not crash (${e.message})`); }
    const calls = rt.calls();
    rmSync(dir, { recursive: true, force: true });
    const started = calls.filter((c) => c.startsWith('run ')).map((c) => c.split(' ')[c.split(' ').indexOf('--name') + 1]);
    const removed = calls.filter((c) => c.startsWith('rm -f ')).map((c) => c.split(' ').pop());
    return { doc, started, removed, calls };
  };
  const st = (doc, n) => doc && doc.steps.find((s) => s.name === n);

  // (a) a setup command that fails
  const a = measure('a failing setup', (t) => t.replace('  - node db.mjs roles', '  - exit 3\n  - node db.mjs roles'), {});
  if (a.started.length !== 1 || a.removed.join() !== a.started.join()) fail(`(a) the container started is removed after a failing setup (started ${a.started}, removed ${a.removed})`);
  if (a.doc) {
    const setup = a.doc.services?.setup || [];
    if (setup[0]?.status !== 'failed' || setup[0]?.exit_code !== 3 || setup[1]?.status !== 'skipped') fail(`(a) the failing setup is its own row, the rest skipped (got ${JSON.stringify(setup.map((x) => [x.command, x.status]))})`);
    for (const n of ['test', 'migrate']) if (st(a.doc, n)?.status !== 'skipped' || !/the declared setup `exit 3` failed \(exit 3\)/.test(st(a.doc, n)?.reason || '')) fail(`(a) ${n} reads skipped, naming the setup that failed (got ${st(a.doc, n)?.status}: ${st(a.doc, n)?.reason})`);
    if (!a.doc.services?.containers?.[0]?.removed || a.doc.exit !== 1) fail(`(a) the report says the container was removed, and the run exits 1 (got ${JSON.stringify(a.doc.services?.containers)}, exit ${a.doc.exit})`);
    const rows = convert('fresh-clone', JSON.stringify(a.doc), 1);
    const gaps = rows.filter((r) => r.polarity === 'gap' && ['service-setup', 'test', 'migrate'].includes(r.native_category)).map((r) => r.native_id).sort().join(',');
    if (gaps !== 'service-setup:0:failed') fail(`(a) the failed setup is one service-setup gap, and nothing is charged to test or migrate (got ${gaps})`);
  }
  // (b) a service that never comes ready within its wait
  const b = measure('a service never ready', (t) => t.replace('    wait: 90', '    wait: 1'), { readyExit: 1 });
  if (b.started.length !== 1 || b.removed.join() !== b.started.join()) fail(`(b) the container that never came ready is removed (started ${b.started}, removed ${b.removed})`);
  if (b.calls.some((c) => c.startsWith('exec ')) === false) fail('(b) the ready check was run');
  for (const n of ['test', 'migrate']) if (b.doc && (st(b.doc, n)?.status !== 'skipped' || !/needs postgres, which this measurement did not provide \(postgres \(postgres:16\.4-alpine\) was not ready within 1s/.test(st(b.doc, n)?.reason || ''))) fail(`(b) ${n} reads skipped with the wait that ran out (got ${st(b.doc, n)?.reason})`);
  if (b.doc && b.doc.services?.setup?.length) fail('(b) no setup runs against a service that is not ready');
  // (c) a service that does not start: nothing to remove, and the steps say why
  const c = measure('a service that does not start', (t) => t, { runExit: 125 });
  if (c.removed.length) fail(`(c) nothing started, nothing removed (removed ${c.removed})`);
  for (const n of ['test', 'migrate']) if (c.doc && !/did not start: stub: image not found/.test(st(c.doc, n)?.reason || '')) fail(`(c) ${n} says the service did not start (got ${st(c.doc, n)?.reason})`);
}
