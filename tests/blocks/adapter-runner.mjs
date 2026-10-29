// ── an instrument run off its adapter's `run:` (map/start.mjs runAdapterInstrument) ──
// The runner names no tool (CLAUDE.md rule 7): the adapter gives the command, the exits that
// are a run, the inputs, the version and the install line. Pinned with a fake zizmor on PATH
// driving the real zizmor adapter:
//   (a) the binary absent: skipped with the reason and the install line, never clean;
//   (b) none of the adapter's inputs in the tree: the tool is not started, and the run is
//       one no-input fact;
//   (c) an exit outside the success set: failed, with the tool's stderr as the reason;
//   (d) a report and stderr naming the target absolutely, or relative to the filesystem
//       root: the rows cite target-relative paths, and the archived envelope carries no
//       path of the machine it ran on;
//   (e) only adopted instruments whose adapter carries run: are driven by `start`;
//   (f) the tool runs in the allow-listed child environment (map/child-env.mjs): a token
//       in the evaluator's environment never reaches it.
import { mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runAdapterInstrument, adapterRunInstruments } from '../../map/start.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'adapter-runner';

export async function run() {
  const fail = (m) => negFailures.push('adapter-runner: ' + m);
  const adapter = loadAdapters().zizmor;
  const tmp = join(HERE, 'tmp-adapter-runner'); rmSync(tmp, { recursive: true, force: true });
  const target = join(tmp, 'target'); mkdirSync(join(target, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(target, '.github', 'workflows', 'ci.yml'), 'on: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n');
  const empty = join(tmp, 'empty'); mkdirSync(empty, { recursive: true });
  const real = realpathSync(target);
  const bin = join(tmp, 'bin'); mkdirSync(bin, { recursive: true });
  // the fake zizmor: --version prints one; the file `exit` beside it picks the exit (the
  // child sees no variable of ours); it reports the workflow absolutely, complains on stderr
  // with a filesystem-root-relative path, and says whether it can see the evaluator's token
  const sarif = { runs: [{ tool: { driver: { name: 'zizmor' } }, results: [{ ruleId: 'zizmor/unpinned-uses', message: { text: 'unpinned action reference' },
    properties: { 'zizmor/severity': 'High' }, locations: [{ physicalLocation: { artifactLocation: { uri: `${real}/.github/workflows/ci.yml` }, region: { startLine: 6 } } }] }] }] };
  // written so it runs as either module kind (the fake has no extension): fs comes from a dynamic import
  writeFileSync(join(bin, 'zizmor'), `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('zizmor 0.0.0-fake'); process.exit(0); }
import('node:fs').then(({ readFileSync }) => {
  process.stderr.write('note: read ${real.replace(/^\/+/, '')}/.github/workflows/ci.yml\\n');
  process.stderr.write('token ' + (process.env.ASSAY_TEST_EVALUATOR_TOKEN ? 'seen' : 'absent') + '\\n');
  const code = Number(readFileSync(${JSON.stringify(join(bin, 'exit'))}, 'utf8').trim() || 0);
  if (code === 0) process.stdout.write(${JSON.stringify(JSON.stringify(sarif))});
  else process.stderr.write('boom: the fake tool crashed\\n');
  process.exit(code);
});
`);
  chmodSync(join(bin, 'zizmor'), 0o755);
  const savedPath = process.env.PATH, savedToken = process.env.ASSAY_TEST_EVALUATOR_TOKEN;
  // the evaluator holds a token the tool must never see (f); the exit is set in the file beside the fake
  const withEnv = (path, exit, fn) => {
    process.env.PATH = path; process.env.ASSAY_TEST_EVALUATOR_TOKEN = 'planted-evaluator-token';
    writeFileSync(join(bin, 'exit'), String(exit ?? 0));
    try { return fn(); } finally { process.env.PATH = savedPath; if (savedToken === undefined) delete process.env.ASSAY_TEST_EVALUATOR_TOKEN; else process.env.ASSAY_TEST_EVALUATOR_TOKEN = savedToken; }
  };
  const runDir = (name) => { const d = join(tmp, name); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); return d; };
  const rowsOf = (d) => { const p = join(d, 'map', 'findings', 'zizmor.yaml'); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
  try {
    // (a)
    const absent = withEnv('/nonexistent-path-for-the-test', undefined, () => runAdapterInstrument('zizmor', adapter, target, runDir('run-a'), () => {}));
    if (absent.status !== 'skipped' || !/zizmor not on PATH/.test(absent.reason || '') || !/install: uv tool install zizmor/.test(absent.reason || '')) fail(`(a) an absent binary is skipped, with the install line (got ${JSON.stringify(absent)})`);
    // (b)
    const dB = runDir('run-b');
    const none = withEnv(`${bin}:${savedPath}`, undefined, () => runAdapterInstrument('zizmor', adapter, empty, dB, () => {}));
    if (none.status !== 'ran' || !/native_category: "no-input"/.test(rowsOf(dB))) fail(`(b) a tree with none of the inputs is one no-input fact (got ${JSON.stringify(none)})`);
    // (c)
    const crash = withEnv(`${bin}:${savedPath}`, 2, () => runAdapterInstrument('zizmor', adapter, target, runDir('run-c'), () => {}));
    if (crash.status !== 'failed' || !/exited 2/.test(crash.reason || '') || !/boom: the fake tool crashed/.test(crash.reason || '')) fail(`(c) an exit outside the success set is failed, with stderr as the reason (got ${JSON.stringify(crash)})`);
    // (d)
    const dD = runDir('run-d');
    const ok = withEnv(`${bin}:${savedPath}`, 0, () => runAdapterInstrument('zizmor', adapter, target, dD, () => {}));
    if (ok.status !== 'ran' || !/evidence: \[".github\/workflows\/ci.yml:6"\]/.test(rowsOf(dD))) fail(`(d) the row cites the target-relative path (got ${JSON.stringify(ok)}; ${rowsOf(dD).split('\n').filter((l) => /evidence/.test(l)).join(' ')})`);
    const archived = readFileSync(join(dD, 'map', 'raw', 'zizmor.json'), 'utf8');
    if (archived.includes(real) || archived.includes(real.replace(/^\/+/, ''))) fail('(d) the archived envelope carries no path of the machine it ran on');
    if (!/"version": "zizmor 0.0.0-fake"/.test(archived)) fail('(d) the envelope records the version the adapter asks for');
    // (f)
    if (!/token absent/.test(archived) || /token seen/.test(archived)) fail('(f) the tool runs in the allow-listed child environment: the evaluator\'s token never reaches it');
  } finally { process.env.PATH = savedPath; rmSync(tmp, { recursive: true, force: true }); }
  // (e)
  const ids = adapterRunInstruments({ a: { scanner: 'a', role: 'instrument', run: { bin: 'a' }, map: {} }, b: { scanner: 'b', role: 'instrument', adopted: false, run: { bin: 'b' }, map: {} }, c: { scanner: 'c', role: 'instrument', map: {} }, d: { scanner: 'd', role: 'judgment', run: { bin: 'd' }, map: {} } });
  if (ids.join() !== 'a') fail(`(e) start drives only adopted instruments whose adapter carries run: (got ${ids.join() || 'none'})`);
}
