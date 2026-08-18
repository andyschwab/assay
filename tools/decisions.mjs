#!/usr/bin/env node
// decisions.mjs — the OPTIONAL owner-triage overlay.
//
// The interview may never happen, and it must never gate the package: the raw
// projected base always compiles a complete board/walk/handoff. If — and only if
// — an owner triages, they leave decisions in <run>/eval/decisions.yaml, and every
// compiler folds them in. Absent file ⇒ empty overlay ⇒ raw base, unchanged.
//
// This is root's own decision model (accept/fix/investigate/snooze + reason +
// who/when), applied to eval findings. A decision NEVER deletes a finding; it
// annotates its state, so a compiler can distinguish "clean because HELD" (earned)
// from "clean because ACCEPTED" (owner-waived) from "OPEN" (untriaged).
//
// Schema (one list item per decided finding):
//   - finding: F-601            # the finding id
//     action: accept            # accept | fix | investigate | snooze
//     reason: "contractor …"    # free text — why (required for accept/snooze)
//     by: reviewer@example.com  # who decided
//     at: 2026-08-14            # when
//     snooze_until: 2026-11-14  # snooze only — reappears after this date
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from './yaml-min.mjs';

export const DECISION_ACTIONS = ['accept', 'fix', 'investigate', 'snooze'];

// Load the overlay for a run. Missing file is the norm, not an error.
export function loadDecisions(dir) {
  const ev = existsSync(join(dir, 'eval')) ? join(dir, 'eval') : dir;
  const p = join(ev, 'decisions.yaml');
  if (!existsSync(p)) return [];
  const d = parseYaml(readFileSync(p, 'utf8'));
  return Array.isArray(d) ? d : [];
}

// Is a snooze still active on the run date? A run has no wall clock (determinism),
// so "today" is passed in (the run date). An expired snooze is NOT a waiver — it
// reverts to open, exactly as root's snoozed items reappear at expiry.
function snoozeActive(dec, runDate) {
  if (dec.action !== 'snooze') return false;
  if (!dec.snooze_until) return true;         // open-ended snooze
  if (!runDate) return true;                  // no date to compare — treat as active
  return String(dec.snooze_until) > String(runDate);
}

// Annotate each projected finding with its decision + a resolved STATE:
//   strength/fact           → carried straight through (decisions apply to gaps)
//   gap, no decision        → 'open'
//   gap, accept             → 'accepted'   (owner waived — off the open count, shown apart)
//   gap, snooze (active)    → 'snoozed'    (off the open count until it expires)
//   gap, snooze (expired)   → 'open'       (reverted)
//   gap, fix|investigate    → 'open'       (a commitment to ACT is not a waiver: still live)
// Returns a NEW array; never mutates the base. `runDate` (YYYY-MM-DD) resolves snoozes.
export function decideProjected(projected, decisions, runDate = null) {
  const byId = new Map();
  for (const d of decisions) if (d && d.finding) byId.set(d.finding, d);
  return projected.map((p) => {
    const dec = byId.get(p.f.id) || null;
    let state = p.f.polarity === 'gap' ? 'open' : p.f.polarity; // strength | fact | open
    if (p.f.polarity === 'gap' && dec) {
      if (dec.action === 'accept') state = 'accepted';
      else if (dec.action === 'snooze') state = snoozeActive(dec, runDate) ? 'snoozed' : 'open';
      // fix / investigate stay 'open' — an acknowledged-but-live risk
    }
    return { ...p, decision: dec, state };
  });
}

// Convenience for compilers: the decided base for a run in one call.
export function loadAndDecide(dir, projected, runDate = null) {
  return decideProjected(projected, loadDecisions(dir), runDate);
}
