// ── a sweep gate checks a measure or says it does not: no threshold passes by being 0 (#323) ──
// Seven of twelve committed sets carried `candidate_agreement: 0`, and one `requirement_agreement: 0`.
// The README called a 0 "not measured", but the gate could not tell "not measured" from "measured
// and set to pass anything": a 0 passes whatever the set reads. A measure a set cannot take is now
// declared under `not_measured` with its reason, loads, and reads not measured; a threshold of 0 is
// refused (exit 2, naming the key); a declaration the set's own data contradicts is a breach.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'sweep-not-measured';

export async function run() {
  const fail = (m) => negFailures.push('sweep-not-measured: ' + m);
  const V = await import('../../map/variance.mjs');
  const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'map', 'variance.mjs'), ...args], { encoding: 'utf8' });
  const fx = join(HERE, 'sweeps', 'fixture-notesbox');
  const committed = readFileSync(join(fx, 'SWEEP.yaml'), 'utf8');
  const tmp = mkdtempSync(join(tmpdir(), 'assay-sweep-not-measured-'));
  const set = join(tmp, 'set');
  cpSync(fx, set, { recursive: true });
  const plant = (yaml) => writeFileSync(join(set, 'SWEEP.yaml'), yaml);
  const refused = (what, yaml, key) => {
    plant(yaml);
    let threw = null; try { V.loadSweepSet(set); } catch (e) { threw = e.message; }
    if (!threw || !threw.includes(key)) fail(`${what}: loadSweepSet must refuse it naming ${key} (got ${threw === null ? 'a set that loaded' : threw})`);
    const r = cli(['--set', set]);
    if (r.status !== 2 || !r.stderr.includes(key)) fail(`${what}: variance --set must exit 2 naming ${key} (got exit ${r.status}: ${r.stderr.split('\n')[0]})`);
  };
  try {
    // (a) a 0 on a measure the set measures (fixture-notesbox shares effect channels) is refused
    if (!/^\s*descriptor_agreement: \d+/m.test(committed)) fail('test setup: fixture-notesbox must gate descriptor_agreement');
    refused('a threshold of 0 on descriptor_agreement, which the set measures',
      committed.replace(/^(\s*)descriptor_agreement: \d+.*$/m, '$1descriptor_agreement: 0'), 'threshold.descriptor_agreement');
    // (b) a 0 standing in for "not measured" is refused too: the declaration is how a set says so
    refused('a threshold of 0 standing in for a measure the set cannot take',
      committed.replace(/^not_measured:\n\s*candidate_agreement:.*\n/m, '').replace(/^threshold:\n/m, 'threshold:\n  candidate_agreement: 0\n'), 'threshold.candidate_agreement');
    // (c) a measure both gated and declared, a declaration with no reason, and a measure neither gated nor declared
    refused('a measure both gated and declared not measured',
      committed.replace(/^threshold:\n/m, 'threshold:\n  candidate_agreement: 50\n'), 'candidate_agreement');
    refused('a not-measured declaration with no reason',
      committed.replace(/^(\s*)candidate_agreement: ".*"$/m, '$1candidate_agreement: ""'), 'not_measured.candidate_agreement');
    refused('a measure neither gated nor declared',
      committed.replace(/^not_measured:\n\s*candidate_agreement:.*\n/m, ''), 'candidate_agreement');

    // (d) the committed set declares candidate_agreement not measured: it loads, holds, and reads it so
    plant(committed);
    let loaded = null; try { loaded = V.loadSweepSet(set); } catch (e) { fail(`a set declaring candidate_agreement not measured must load (${e.message})`); }
    if (loaded && !(typeof loaded.notMeasured?.candidate_agreement === 'string' && loaded.notMeasured.candidate_agreement.length)) fail(`loadSweepSet must return the declaration with its reason (got ${JSON.stringify(loaded?.notMeasured)})`);
    if (loaded && 'candidate_agreement' in loaded.threshold) fail('a declared measure must carry no threshold');
    const txt = cli(['--set', set]);
    if (txt.status !== 0) fail(`a set declaring a measure it cannot take must hold (exit ${txt.status}: ${txt.stdout.split('\n').filter((l) => /✗/.test(l)).join(' | ')})`);
    if (!/per-candidate descriptor agreement not measured/.test(txt.stdout) || !/candidate_agreement not measured: \S/.test(txt.stdout)) fail('the printed gate must read the declared measure as not measured, with its reason');
    let out = null; try { out = JSON.parse(cli(['--set', set, '--json']).stdout); } catch { fail('variance --set --json must print JSON'); }
    if (out && (typeof out.gate?.not_measured?.candidate_agreement !== 'string' || 'candidate_agreement' in (out.gate?.threshold || {}))) fail(`variance --json must carry the declaration under gate.not_measured, not as a threshold (got ${JSON.stringify(out.gate)})`);

    // (e) a declaration the set's own data contradicts is a breach: notesbox shares effect channels
    plant(committed.replace(/^(\s*)descriptor_agreement: \d+.*\n/m, '').replace(/^not_measured:\n/m, 'not_measured:\n  descriptor_agreement: "planted: claims the set shares no channel"\n'));
    const lie = cli(['--set', set]);
    if (lie.status !== 1 || !/descriptor_agreement is declared not measured, but the set measures it/.test(lie.stdout)) fail(`declaring a measure the set takes not measured must be a breach naming it (got exit ${lie.status})`);

    // (f) the ad-hoc flags refuse a 0 the same way
    plant(committed);
    const z = cli(['--set', set, '--min-facts', '0']);
    if (z.status !== 2) fail(`--min-facts 0 must exit 2 (got ${z.status})`);

    // (g) the pure gate: a declared measure the data takes is a breach; one it does not take is silent
    const r = { pct: 100, union: 3 }, d = { allFields: { pct: 100 }, channels: { shared: 0 } }, q = { decided: 2, agree: 2, pct: 100 };
    const quiet = V.sweepGate(r, d, { fact_presence: 50 }, q, null, { descriptor_agreement: 'no channel' });
    if (quiet.length) fail(`a declared measure the set does not take must gate nothing (got ${JSON.stringify(quiet)})`);
    const loud = V.sweepGate(r, d, { fact_presence: 50 }, q, null, { requirement_agreement: 'planted' });
    if (loud.length !== 1 || !/requirement_agreement is declared not measured/.test(loud[0])) fail(`a declared measure the set takes must be one breach naming it (got ${JSON.stringify(loud)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
