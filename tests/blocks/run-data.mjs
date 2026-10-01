// ── the chains and the handoff sequence are data files with a schema validate checks (#57, F-604, F-605) ──
// The ranked chains reached a consumer only as IMPROVE.md prose and the handoff only as
// markdown, so an agent iterating the work had to parse the human report.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'run-data';

export async function run() {
  const fail = (m) => negFailures.push('run-data: ' + m);
  let D = null;
  try { D = await import('../../lib/run-data.mjs'); } catch (e) { fail(`lib/run-data.mjs must exist and export the data-file schemas (${e.message.split('\n')[0]})`); }
  const L = await import('../../lib/run-layout.mjs');
  if (typeof L.chainsDataPath !== 'function' || typeof L.handoffSequencePath !== 'function') fail('lib/run-layout.mjs must place chains.json and the handoff sequence');
  const tmp = join(HERE, 'tmp-run-data'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
    'target: "notesbox"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
    'roadmap:', '  - slug: close-admin-default', '    title: "Fail authentication closed"',
    '    body: "authenticate() defaults to admin; refuse unknown tokens and gate the two outbound effects."', '    findings: [F-050, F-052, F-053]', '',
  ].join('\n'));
  writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
  const h = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
  if (h.status !== 0) fail(`handoff.mjs must compile notesbox (stderr: ${h.stderr})`);
  const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
  if (rp.status !== 0) fail(`report.mjs must compile notesbox (stderr: ${rp.stderr})`);
  const seqPath = L.handoffSequencePath ? L.handoffSequencePath(tmp) : join(tmp, 'handoff', 'sequence.json');
  const chPath = L.chainsDataPath ? L.chainsDataPath(tmp) : join(tmp, 'views', 'improve', 'chains.json');
  const readJson = (p, what) => { if (!existsSync(p)) { fail(`${what} must be written at ${p.slice(tmp.length + 1)}`); return null; } try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { fail(`${what} must parse as JSON (${e.message})`); return null; } };
  const seq = readJson(seqPath, 'the handoff sequence');
  const ch = readJson(chPath, 'the chains data file');
  if (seq && D) {
    const errs = D.checkSequence(seq);
    if (errs.length) fail(`the handoff's own sequence must pass its schema (got ${errs.join('; ')})`);
    const first = (seq.sequence || [])[0];
    if (!first || first.kind !== 'authored' || first.voice !== 'eval-authored' || !(first.findings || []).includes('F-050') || first.plan !== 'plan/01-close-admin-default.md')
      fail(`sequence[0] must be the roadmap item with its voice, finding ids and plan file (got ${JSON.stringify(first)})`);
    for (const s of seq.sequence || []) if (s.plan && !existsSync(join(tmp, 'handoff', s.plan))) fail(`sequence item ${s.n} names ${s.plan}, which the handoff did not write`);
    if (!Array.isArray(seq.pending)) fail('the sequence must carry the pending (owner-defined) ids, even when empty');
  }
  if (ch && D) {
    const errs = D.checkChains(ch);
    if (errs.length) fail(`the report's own chains file must pass its schema (got ${errs.join('; ')})`);
    const top = (ch.live || [])[0];
    if (!top || top.rank !== 1 || !Array.isArray(top.path) || !top.entry?.id || !top.headline?.id || !top.blast) fail(`chains.live[0] must carry rank, entry, headline, blast and path (got ${JSON.stringify(top)})`);
  }
  // validate reads both files back and fails closed on a malformed one, naming it
  const val = () => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
  const v0 = val();
  if (v0.status !== 0) fail(`validate must pass over the compiled run (stderr: ${String(v0.stderr).split('\n').slice(0, 4).join(' | ')})`);
  if (seq) {
    writeFileSync(seqPath, JSON.stringify({ ...seq, sequence: [{ ...seq.sequence[0], findings: ['F-999999'] }] }));
    const v = val();
    if (v.status === 0 || !/sequence\.json/.test(v.stderr) || !/F-999999/.test(v.stderr)) fail(`validate must fail closed on a sequence citing an id not in the base, naming the file (got ${v.status}: ${String(v.stderr).slice(0, 200)})`);
    writeFileSync(seqPath, JSON.stringify(seq));
  }
  if (ch) {
    writeFileSync(chPath, JSON.stringify({ ...ch, live: [{ ...ch.live[0], blast: 'galaxy' }] }));
    const v = val();
    if (v.status === 0 || !/chains\.json/.test(v.stderr)) fail(`validate must fail closed on a malformed chains file, naming it (got ${v.status}: ${String(v.stderr).slice(0, 200)})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
