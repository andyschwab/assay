// ── compareFindings(): the fingerprint — never line numbers alone, never id ────
import { fingerprintFinding, compareFindings } from '../../yardstick/compare.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'compare-findings';

export async function run() {
  const fail = (m) => negFailures.push('compare-findings: ' + m);
  const prevF = [
    { id: 'F-1', source: 'gitleaks', native_category: 'secret', evidence: ['a.js:6'] },
    { id: 'F-2', dimension: 'delegation', evidence: ['lib/x.py:10'] },
  ];
  const currF = [
    { id: 'F-9', source: 'gitleaks', native_category: 'secret', evidence: ['a.js:99'] }, // same file, line moved
    { id: 'F-2', dimension: 'delegation', evidence: ['lib/x.py:1'] },                    // same file, line moved
    { id: 'F-3', dimension: 'delegation', evidence: ['lib/y.py:1'] },                    // a genuinely different file
  ];
  const delta = compareFindings(prevF, currF);
  if (delta.new.some((f) => f.id === 'F-9') || delta.no_longer_found.some((f) => f.id === 'F-1')) fail('a finding whose evidence FILE is unchanged (only the line moved) must match across runs, never read as new/no-longer-found');
  if (delta.new.some((f) => f.id === 'F-2') || delta.no_longer_found.some((f) => f.id === 'F-2')) fail('F-2 (same scanner/category/file both runs) must match across runs');
  if (!delta.new.some((f) => f.id === 'F-3')) fail('F-3 (a genuinely new evidence file) must read as new');
  if (fingerprintFinding({ source: 'gitleaks', native_category: 'secret', evidence: ['a.js:6'] }) !== fingerprintFinding({ source: 'gitleaks', native_category: 'secret', evidence: ['a.js:999'] })) fail('the fingerprint must be line-number-independent');
}
