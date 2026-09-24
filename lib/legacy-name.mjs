// legacy-name.mjs — the ONE fallback helper for every run artifact Phase 2
// (2026-09-24) renamed: the yardstick's measurement and the Improve view's
// detail files. A reader resolves the new name if it is present, else falls
// back to the legacy name, so a frozen base stays valid; a writer always
// writes only the new name. One helper, used everywhere a reader needs one
// of these files, so the fallback rule can never silently diverge per file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Every renamed run artifact, new name ← legacy name.
export const RENAMES = {
  yardstick: { current: 'yardstick.yaml', legacy: 'view-descriptors.yaml' },
  improveLead: { current: 'IMPROVE.md', legacy: 'MAINTAINER-REPORT.md' },
  improveAxes: { current: 'improve-axes.md', legacy: 'view-axes.md' },
  improveLeverage: { current: 'improve-leverage.md', legacy: 'view-leverage.md' },
  improveMaturity: { current: 'improve-maturity.md', legacy: 'view-maturity.md' },
  improveMaturityGrades: { current: 'improve-maturity-grades.yaml', legacy: 'view-maturity-grades.yaml' },
  improveSecurity: { current: 'improve-security.md', legacy: 'view-security.md' },
  improveSecurityGate: { current: 'improve-security-gate.yaml', legacy: 'view-security-gate.yaml' },
};

// The path a reader should use for one of the RENAMES keys: the current name
// if it exists in evalDir, else the legacy name, else the current name (so a
// "missing" message names today's convention, not a retired one).
export function resolveRenamed(evalDir, key) {
  const r = RENAMES[key];
  if (!r) throw new Error(`legacy-name: unknown renamed artifact "${key}"`);
  const p = join(evalDir, r.current);
  if (existsSync(p)) return p;
  const legacy = join(evalDir, r.legacy);
  if (existsSync(legacy)) return legacy;
  return p;
}
