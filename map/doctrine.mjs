// doctrine.mjs — the ONE home for cross-tool doctrine the views compute from.
//
// Before this module, the gate doctrine (what counts as a real, held stop) was
// restated in four files and the severity ranking in three; they agreed by
// coincidence, and a change to one would have let the maturity numerator, the ⚑
// halt flags, the chain sinks and the drift direction quietly disagree. State
// doctrine once; every consumer imports it, and the regression harness pins that
// the maturity numerator and the supervision split are the same rule.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── the gate doctrine ────────────────────────────────────────────────────────
// A REAL gate is one that can actually stop an action; `none` and
// `disclosure-only` do not hold (telling someone afterwards is not a stop).
export const REAL_GATES = new Set(['deterministic-halt', 'staged-reversible', 'scope-bound', 'rate-throttle', 'external-halt']);

// A gate HOLDS iff it is real and does not fail open. Takes the effect facet.
export const gateHolds = (e) => REAL_GATES.has(e.gate_type) && e.fail_mode !== 'open';

// The HALT population: an effect that is irreversible or reaches outside the
// trust boundary — the actions that need oversight. Takes the effect facet.
export const isHaltClass = (e) => e.reversibility === 'irreversible' || e.external === true;

// An UNHELD HALT (⚑): a halt-class effect with no working stop. Derived, not
// restated — the supervised/unsupervised split, the maturity halts-gated
// numerator, and the chain sinks are all this one rule. (Under the closed
// gate_type vocab, !gateHolds ⇔ gate none/disclosure-only or fail-open.)
export const isHalt = (e) => isHaltClass(e) && !gateHolds(e);

// ── severity ─────────────────────────────────────────────────────────────────
// Severity is a carried property (a scanner's own label, never asserted by the
// engine); this is only its display/sort order. Unrated sorts last.
export const SEV = { Blocker: 0, Critical: 1, High: 2, Medium: 3, Low: 4, Nit: 5 };
export const sevRank = (s) => (SEV[s] ?? 9);

// ── CLI detection (one idiom for every tool that is both library and CLI) ────
export function isMain(importMetaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try { return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(argv1); }
  catch { return fileURLToPath(importMetaUrl) === argv1; }
}

// ── the remediation fix-spine grouping (shared by the walk and the handoff) ──
// Groups gap items that carry a scanner-supplied fix by (axis, verbatim fix):
// several findings sharing one remedy collapse to one row; a row's severity is
// the worst among its findings. Items are projected entries ({ f, axis, also,
// source, ... }) already filtered to the gaps the caller wants spined (the walk
// passes every gap; the handoff passes open gaps only). Returns
// Map(axis → Map(fix → { ids, sev, fix, obs, evidence, source, also, ps })).
export function buildFixSpine(items) {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const spine = new Map();
  for (const p of items) {
    if (!p.f.fix) continue;
    if (!spine.has(p.axis)) spine.set(p.axis, new Map());
    const m = spine.get(p.axis);
    const fx = clean(p.f.fix);
    if (m.has(fx)) {
      const r = m.get(fx);
      if (!r.ids.includes(p.f.id)) { r.ids.push(p.f.id); r.ps.push(p); }
      if (sevRank(p.f.severity) < sevRank(r.sev)) r.sev = p.f.severity;
    } else {
      m.set(fx, { ids: [p.f.id], sev: p.f.severity || 'unrated', fix: fx, obs: clean(p.f.observation), evidence: p.f.evidence || [], source: p.source, also: p.also || [], ps: [p] });
    }
  }
  return spine;
}
