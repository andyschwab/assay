// ── engine-pipeline invariants: roster honesty + explicit-axis rail + decision overlay ─
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { loadAdapters, projectMulti, contributedBySources, rosterFor } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'engine-pipeline';
export const gate = ['roster-honesty', 'decision-overlay'];

export async function run() {
  const fail = (m) => negFailures.push('engine-pipeline: ' + m);
  const adapters = loadAdapters();
  const explicit = projectMulti([
    { id: 'F-902', dimension: 'unprompted', axis: 'code-security', polarity: 'gap', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', subject_type: 'process' },
  ], adapters);
  if (explicit.projected.find((p) => p.f.id === 'F-902')?.axis !== 'code-security') fail('an explicit finding axis must be honored as-is');
  const contributed = contributedBySources(adapters, ['repo-eval']);
  if (contributed.has('code-correctness')) fail('repo-eval must not contribute the code axes (they arrive with a code scanner)');
  if (!contributed.has('delegation') || !contributed.has('multiplayer')) fail('repo-eval must contribute its seven dimension axes');
  const roster = rosterFor(adapters, ['repo-eval'], explicit.projected);
  if (!roster.includes('code-security')) fail('an axis a finding explicitly carries must still appear in the roster (never a silent drop)');
  const base = [{ f: { id: 'F-A', polarity: 'gap', severity: 'Critical' }, axis: 'code-correctness', also: [], source: 'x' }];
  const decided = decideProjected(base, [{ finding: 'F-A', action: 'accept', reason: 'known' }], null);
  if (decided[0].state !== 'accepted') fail('accepting a gap must read accepted (waived) — distinct from open and from held');
  const snz = [{ finding: 'F-A', action: 'snooze', snooze_until: '2099-01-01' }];
  if (decideProjected(base, snz, '2026-01-01')[0].state !== 'snoozed') fail('an active snooze must read snoozed');
  if (decideProjected(base, snz, '2099-06-01')[0].state !== 'open') fail('an expired snooze must revert to open');
  // (#53, F-1231) a map-shaped overlay is not "no decisions"; a well-formed one validates green
  let threw = false; try { loadDecisions(join(HERE, 'negative', 'decisions-not-a-list')); } catch { threw = true; }
  if (!threw) fail('loadDecisions over a map-shaped owner/decisions.yaml must throw, never read as no decisions');
  const okRun = join(HERE, 'tmp-decisions-ok'); rmSync(okRun, { recursive: true, force: true });
  cpSync(join(HERE, 'negative', 'decisions-bad-action'), okRun, { recursive: true });
  writeFileSync(join(okRun, 'owner', 'decisions.yaml'), '- finding: F-001\n  action: snooze\n  reason: "waiting on the vendor fix"\n  snooze_until: 2026-11-14\n  by: platform-eng\n  at: 2026-08-14\n');
  const okV = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), okRun], { encoding: 'utf8' });
  if (okV.status !== 0) fail(`a well-formed owner/decisions.yaml must validate green (got exit ${okV.status}: ${String(okV.stdout + okV.stderr).split('\n').filter((l) => l.includes('•')).join(' | ')})`);
  if (loadDecisions(okRun).length !== 1) fail('a well-formed owner/decisions.yaml must load its one decision');
  rmSync(okRun, { recursive: true, force: true });
}
