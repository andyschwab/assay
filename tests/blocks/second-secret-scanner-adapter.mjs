// ── a second secret scanner joins as an adapter alone (#156) ──
// The leak-list format and the runner's repository scope were the secret scan's own code in the core; they
// are now adapter fields. An invented scanner (keyhound, no real tool) is dropped into the adapters directory as
// one file, with a fake binary on PATH, and runs, ingests and archives with no core change:
//   (a) its leak list converts with the adapter's category and fix, never copying the matched value; an exit
//       that disagrees with the report halts;
//   (b) run over its repository's top level, it writes its report to the {report} file the runner names, and
//       the rows cite file:line; the archive keeps only the fields the adapter's keep names;
//   (c) over a subdirectory of a repository it is skipped with the not-top-level reason, never run; in no
//       repository it runs with its outside_repository args.
// The adapter file and the fake binary are removed again whatever happens.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convert } from '../../map/ingest.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { runAdapterInstrument } from '../../map/start.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'second-secret-scanner-adapter';

const ID = 'keyhound';
const ADAPTER = `# Adapter: ${ID} — an INVENTED secret scanner, test data only (tests/blocks/second-secret-scanner-adapter.mjs)
scanner: ${ID}
targets_taxonomy: 3
role: instrument
run:
  bin: ${ID}
  args: ["scan", "--out", "{report}"]
  scope: repository
  outside_repository: ["--loose"]
  ok_exits: [0, 1]
ingest:
  format: leak-list
  start_id: 690
  found_exit: 1
  category: credential
  keep: [RuleID, File, StartLine]
  fix: "Rotate it and record why."
contributes: []
map:
  credential:
    axis: code-security
default: FAIL
`;

export async function run() {
  const fail = (m) => negFailures.push('second-secret-scanner-adapter: ' + m);
  const adapterPath = join(ROOT, 'map', 'scanners', 'adapters', `${ID}.yaml`);
  if (existsSync(adapterPath)) { fail(`${adapterPath} already exists; this block owns that name`); return; }
  const scratch = mkdtempSync(join(tmpdir(), 'assay-keyhound-'));
  const savedPath = process.env.PATH;
  const planted = 'k' + 'h-planted-value';
  try {
    writeFileSync(adapterPath, ADAPTER);
    // the fake scanner: records its args, writes one leak to --out, exits 1
    const bin = join(scratch, 'bin'); mkdirSync(bin);
    const argsLog = join(scratch, 'args.log');
    writeFileSync(join(bin, ID), `#!${process.execPath}
const fs = require('node:fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(argsLog)}, a.join(' ') + '\\n');
fs.writeFileSync(a[a.indexOf('--out') + 1], JSON.stringify([{ RuleID: 'hound-key', File: 'lib/k.js', StartLine: 3, Secret: ${JSON.stringify(planted)}, Match: ${JSON.stringify(planted)} }]));
process.exit(1);
`);
    chmodSync(join(bin, ID), 0o755);
    process.env.PATH = `${bin}:${savedPath}`;
    const adapter = loadAdapters()[ID];

    // (a)
    const rows = convert(ID, JSON.stringify([{ RuleID: 'r', File: 'a.js', StartLine: 1, Secret: planted }]), 1);
    if (rows.length !== 1 || rows[0].source !== ID || rows[0].native_category !== 'credential' || rows[0].fix !== 'Rotate it and record why.' || rows[0].evidence[0] !== 'a.js:1') fail(`(a) the leak list converts with the adapter's category and fix (got ${JSON.stringify(rows)})`);
    if (JSON.stringify(rows).includes(planted)) fail('(a) the matched value never reaches a row');
    let threw = false; try { convert(ID, '[]', 1); } catch { threw = true; }
    if (!threw) fail('(a) the found exit over an empty report halts');

    // (b)
    const repo = join(scratch, 'repo'); mkdirSync(join(repo, 'lib'), { recursive: true });
    writeFileSync(join(repo, 'lib', 'k.js'), 'export const k = 1;\n');
    const git = (args, cwd = repo) => spawnSync('git', args, { cwd, encoding: 'utf8' });
    git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'assay regression']); git(['add', '-A']); git(['commit', '-q', '-m', 'x']);
    const out = join(scratch, 'run');
    const top = runAdapterInstrument(ID, adapter, repo, out, () => {});
    const findings = existsSync(join(out, 'map', 'findings', `${ID}.yaml`)) ? readFileSync(join(out, 'map', 'findings', `${ID}.yaml`), 'utf8') : '';
    if (top.status !== 'ran' || !/lib\/k\.js:3/.test(findings)) fail(`(b) over its repository's top level it runs and cites file:line (got ${JSON.stringify(top)}, rows ${JSON.stringify(findings.slice(0, 200))})`);
    const archived = existsSync(join(out, 'map', 'raw', `${ID}.json`)) ? readFileSync(join(out, 'map', 'raw', `${ID}.json`), 'utf8') : '';
    if (!archived || archived.includes(planted) || !/hound-key/.test(archived)) fail(`(b) the archive keeps the located leak and never its value (got ${JSON.stringify(archived.slice(0, 300))})`);
    if (/--loose/.test(readFileSync(argsLog, 'utf8'))) fail('(b) inside its repository it runs without its outside_repository args');

    // (c)
    writeFileSync(argsLog, '');
    const sub = runAdapterInstrument(ID, adapter, join(repo, 'lib'), join(scratch, 'run-sub'), () => {});
    if (sub.status !== 'skipped' || !/not its git repository's top level/.test(sub.reason || '') || readFileSync(argsLog, 'utf8')) fail(`(c) a subdirectory of a repository is skipped with the reason, never run (got ${JSON.stringify(sub)})`);
    const loose = join(scratch, 'loose'); mkdirSync(join(loose, 'lib'), { recursive: true });
    if (git(['rev-parse', '--show-toplevel'], loose).status === 0) { fail(`test setup: ${tmpdir()} is inside a git repository`); return; }
    const lo = runAdapterInstrument(ID, adapter, loose, join(scratch, 'run-loose'), () => {});
    if (lo.status !== 'ran' || !/--loose/.test(readFileSync(argsLog, 'utf8'))) fail(`(c) in no repository it runs with its outside_repository args (got ${JSON.stringify(lo)}, args ${readFileSync(argsLog, 'utf8').trim()})`);
  } finally {
    process.env.PATH = savedPath;
    rmSync(adapterPath, { force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}
