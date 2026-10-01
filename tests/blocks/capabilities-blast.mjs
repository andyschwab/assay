// ── capabilities reads every blast_scope the schema allows, and refuses another (#53, F-1236) ──
// BLAST_RANK had no `user`, so a user-scoped channel reported tenant (rank undefined never
// wins), and an unknown value passed silently.
import { buildCapabilities } from '../../map/capabilities.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'capabilities-blast';

export async function run() {
  const fail = (m) => negFailures.push('capabilities-blast: ' + m);
  const eff = (id, blast) => ({ id, subject_type: 'effect', effect: { channel: 'ch', reversibility: 'reversible', external: false, gate_type: 'none', telemetry: 'none', blast_scope: blast } });
  const blastOf = (fs) => buildCapabilities(fs).flatMap((g) => g.channels)[0]?.blast;
  if (blastOf([eff('F-1', 'user')]) !== 'user') fail(`a user-scoped channel must report user (got ${blastOf([eff('F-1', 'user')])})`);
  if (blastOf([eff('F-1', 'user'), eff('F-2', 'tenant')]) !== 'tenant') fail('the worst scope across a channel\'s findings wins (user + tenant → tenant)');
  if (blastOf([eff('F-1', 'cross-tenant'), eff('F-2', 'fleet')]) !== 'cross-tenant') fail('cross-tenant outranks fleet');
  let threw = false; try { buildCapabilities([eff('F-1', 'galaxy')]); } catch { threw = true; }
  if (!threw) fail('an unknown blast_scope must throw, never rank as nothing');
}
