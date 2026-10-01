// ── packet phase 2: the yardstick reads the packet (owner/PACKET.md) ──────────
// decideAccountsClaim / decideBusFactorClaim: the two extracted claim rows, met
// / unmet / mixed / null (not decided) — the exact thresholds owner/PACKET.md
// states. decideGenericClaim + measureRun: every other claim row, `basis: owner`
// only when the packet actually spoke to it, and a contradiction recorded (never
// merged) when a packet's `satisfied` meets a run-decided `unmet` row.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, measureRun, loadContradictions, loadRunPacket } from '../../yardstick/measure.mjs';
import { decideAccountsClaim, decideBusFactorClaim, decideGenericClaim } from '../../yardstick/packet.mjs';
import { packetManifestPath } from '../../lib/run-layout.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'packet-measure';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('packet-measure: ' + m);
  const reg = loadYardstick();

  // accounts: met / unmet / mixed / null(not decided)
  if (decideAccountsClaim(undefined) !== null) fail('no custody.accounts must read null (not decided by the packet)');
  if (decideAccountsClaim({ accounts: [] }) !== null) fail('an empty accounts list must read null, same as absent');
  const acctMet = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }] });
  if (acctMet?.status !== 'met') fail(`every account transferable:yes with an owner_role must read met (got ${acctMet?.status})`);
  const acctUnmet = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }, { account: 'b', transferable: 'no' }] });
  if (acctUnmet?.status !== 'unmet' || !/\bb\b/.test(acctUnmet.note)) fail(`any account transferable:no must read unmet, naming it (got ${acctUnmet?.status} / ${acctUnmet?.note})`);
  const acctMixed = decideAccountsClaim({ accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }, { account: 'b', transferable: 'unknown' }] });
  if (acctMixed?.status !== 'mixed') fail(`an account with unknown owner/transfer (and none transferable:no) must read mixed (got ${acctMixed?.status})`);

  // bus factor: met / unmet / mixed / null(not decided)
  if (decideBusFactorClaim(undefined) !== null) fail('no custody.people must read null (not decided by the packet)');
  const bfMet = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'yes' } });
  if (bfMet?.status !== 'met') fail(`build/deploy/restore each 2+ roles and restore_done:yes must read met (got ${bfMet?.status})`);
  const bfUnmetRole = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a'], restore_done: 'yes' } });
  if (bfUnmetRole?.status !== 'unmet') fail(`a single-role restore must read unmet (got ${bfUnmetRole?.status})`);
  const bfUnmetRestore = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'no' } });
  if (bfUnmetRestore?.status !== 'unmet') fail(`restore_done:no must read unmet even with 2+ roles everywhere (got ${bfUnmetRestore?.status})`);
  const bfMixed = decideBusFactorClaim({ people: { build: ['a', 'b'], deploy: ['a', 'b'], restore: ['a', 'b'], restore_done: 'unknown' } });
  if (bfMixed?.status !== 'mixed') fail(`an unknown restore_done (no unmet condition otherwise) must read mixed (got ${bfMixed?.status})`);

  // generic claim row (any id): satisfied -> met, not-applicable -> not-applicable
  // (NEVER met — a requirement that does not apply was not satisfied), open ->
  // unmet, unknown -> not-measured (basis owner still), absent -> null
  const genId = reg.requirements.find((d) => d.decide.kind === 'claim' && d.id !== 'd-accounts-enumerated' && d.id !== 'd-bus-factor').id;
  if (decideGenericClaim(genId, { claims: [] }) !== null) fail('a claim row absent from claims: must read null (not decided)');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'satisfied', by: 'x' }] })?.status !== 'met') fail('satisfied must read met');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'not-applicable', reason: 'x' }] })?.status !== 'not-applicable') fail('not-applicable must read not-applicable, never met');
  if (decideGenericClaim(genId, { claims: [{ id: genId, state: 'open' }] })?.status !== 'unmet') fail('open must read unmet');
  const unk = decideGenericClaim(genId, { claims: [{ id: genId, state: 'unknown' }] });
  if (unk?.status !== 'not-measured') fail('unknown must read not-measured (but still packet-decided — basis owner)');

  // measureRun end-to-end: basis:owner on the packet-decided rows, basis:run elsewhere,
  // and a contradiction when a packet's satisfied meets a run-decided unmet row
  const findings = [{ id: 'F-1', source: 'gitleaks', native_category: 'secret', polarity: 'gap', observation: 'x', evidence: ['a:1'] }];
  const manifest = [{ scanner: 'gitleaks', status: 'ran' }];
  const packet = {
    claims: [{ id: 'd-secrets-out-of-history', state: 'satisfied', by: 'ci scan' }, { id: genId, state: 'open' }],
    custody: { accounts: [{ account: 'a', owner_role: 'founder', transferable: 'yes' }] },
  };
  const rows = measureRun({ findings, manifest, inputs: null, coverage: {}, packet }, reg);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  if (by['d-secrets-out-of-history']?.status !== 'unmet') fail('a claim on a run-decided row must never change that row\'s own status');
  if (by['d-secrets-out-of-history']?.basis !== 'run') fail('a run-decided row\'s basis must stay run even when a packet also claims it');
  if (by['d-accounts-enumerated']?.basis !== 'owner' || by['d-accounts-enumerated']?.status !== 'met') fail('an extracted claim row the packet decided must read basis:owner');
  if (by[genId]?.basis !== 'owner' || by[genId]?.status !== 'unmet') fail('a generic claim row the packet decided must read basis:owner');
  const untouched = reg.requirements.find((d) => d.decide.kind === 'claim' && !packet.claims.some((c) => c.id === d.id) && d.id !== 'd-accounts-enumerated' && d.id !== 'd-bus-factor').id;
  if (by[untouched]?.basis !== 'run') fail(`a claim row the packet never speaks to must stay basis:run (${untouched})`);
  if (rows.contradictions.length !== 1 || rows.contradictions[0].id !== 'd-secrets-out-of-history' || rows.contradictions[0].run_status !== 'unmet')
    fail(`exactly one contradiction must be recorded for d-secrets-out-of-history (got ${JSON.stringify(rows.contradictions)})`);
  // no packet at all: every row basis:run, no contradictions, identical to pre-packet behavior
  const noPacket = measureRun({ findings, manifest, inputs: null, coverage: {} }, reg);
  if (noPacket.some((r) => r.basis !== 'run')) fail('with no packet, every row must read basis:run');
  if (noPacket.contradictions.length) fail('with no packet, there must be no contradictions');

  // CLI round trip: measure --packet copies the packet into the run; a re-measure
  // with no flag reuses that copy and reproduces byte-for-byte.
  const tmp = join(HERE, 'tmp-packet-measure'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  const packetDir = join(HERE, 'fixtures', 'packet-valid');
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--packet', packetDir, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --packet must succeed on the public packet-valid fixture (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  if (!existsSync(packetManifestPath(tmp))) fail('measure --packet must copy manifest.yaml into the run at owner/manifest.yaml (lib/run-layout.mjs)');
  const yardstickFile = join(tmp, 'yardstick.yaml');
  const firstYaml = existsSync(yardstickFile) ? readFileSync(yardstickFile, 'utf8') : null;
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`a re-measure with no --packet flag must succeed, reusing the run's own copy (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  const secondYaml = existsSync(yardstickFile) ? readFileSync(yardstickFile, 'utf8') : null;
  if (firstYaml == null || firstYaml !== secondYaml) fail('re-measuring with no --packet flag must reproduce yardstick.yaml byte-for-byte (the run already carries the packet)');
  const reusedPacket = loadRunPacket(tmp);
  if (!reusedPacket || reusedPacket.repository !== 'example/notesbox') fail("loadRunPacket must read the run's own copied packet with no flag");
  // packet-valid's claims are all on claim-kind rows (never a run-decided one), so
  // this combination must record no contradiction — loadContradictions reads
  // yardstick.yaml's own list, never recomputing it.
  if (loadContradictions(tmp).length) fail(`notesbox + packet-valid must record no contradictions (got ${JSON.stringify(loadContradictions(tmp))})`);
  rmSync(tmp, { recursive: true, force: true });
}
