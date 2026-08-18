// supervision.mjs — the ES "actions that need oversight" instrument, computed.
//
// The population is the halts: actions that are irreversible or reach outside the
// trust boundary. Each is either SUPERVISED (something oversees it before it fires —
// a human confirm, a deterministic rule, a staged-reversible design; any real gate
// that does not fail open) or UNSUPERVISED (no gate, or a gate that fails open).
// Supervision takes many forms on purpose; the failure is the absence of any.
//
// The unsupervised set is spoken as kinds + fixes: grouped by channel (kind), each
// pointing at the roadmap item queued to close it (its handoff/plan/NN prompt), so
// the instrument is a worklist, not a chart. A kind with no queued fix renders with
// no arrow — an honest gap in the roadmap, never a silent omission.
//
// Determinism: inference proposed the effect facets and the roadmap mapping; this
// derives the split and the counts. The supervised count equals the maturity view's
// halts-gated numerator by construction (same rule), so the score and the worklist
// are one truth.

import { CHANNEL_LABEL, humanizeToken } from './display.mjs';
import { gateHolds, isHaltClass } from './doctrine.mjs';

const isHalt = (f) => f.effect && isHaltClass(f.effect);
const supervised = (f) => gateHolds(f.effect);

// roadmap: the authored list (prose.roadmap); item i closes the findings it lists AND any
// channel it names in `covers_channels` (the pattern-based coverage: a composite fix, e.g.
// "put a staged halt on effects", closes a whole class of channels without citing every
// finding as evidence — `findings` is the fix's evidence, `covers_channels` is its reach).
// Returns the 1-based fix number + slug for a finding id, or null.
function fixFor(id, roadmap) {
  for (let i = 0; i < (roadmap || []).length; i++)
    if ((roadmap[i].findings || []).includes(id)) return { n: i + 1, slug: roadmap[i].slug };
  return null;
}
// Returns the fix that closes an effect CHANNEL by naming it in covers_channels, or null.
function coversChannel(channel, roadmap) {
  for (let i = 0; i < (roadmap || []).length; i++) {
    const cc = roadmap[i].covers_channels;
    if (Array.isArray(cc) && cc.includes(channel)) return { n: i + 1, slug: roadmap[i].slug };
  }
  return null;
}

export function buildSupervision(findings, roadmap) {
  const halts = findings.filter((f) => f.subject_type === 'effect' && isHalt(f));
  const sup = halts.filter(supervised);
  const unsup = halts.filter((e) => !supervised(e));

  // group the unsupervised by channel (kind); collect sites + the fixes that close them
  const byKind = new Map();
  for (const e of unsup) {
    const key = e.effect.channel;
    if (!byKind.has(key)) byKind.set(key, { channel: key, label: CHANNEL_LABEL[key] || humanizeToken(key), sites: 0, ids: [], fixes: new Map() });
    const k = byKind.get(key);
    k.sites += 1;
    k.ids.push(e.id);
    const fx = fixFor(e.id, roadmap);
    if (fx) k.fixes.set(fx.n, fx.slug);
  }
  // pattern-based coverage: a fix that names the whole channel in covers_channels closes it
  for (const k of byKind.values()) {
    const cc = coversChannel(k.channel, roadmap);
    if (cc) k.fixes.set(cc.n, cc.slug);
  }
  const kinds = [...byKind.values()].map((k) => ({
    channel: k.channel, label: k.label, sites: k.sites, ids: k.ids,
    fixes: [...k.fixes.keys()].sort((a, b) => a - b),
    fixSlugs: [...k.fixes.entries()].sort((a, b) => a[0] - b[0]),
  })).sort((a, b) => b.sites - a.sites || a.label.localeCompare(b.label));

  const allFixes = [...new Set(kinds.flatMap((k) => k.fixes))].sort((a, b) => a - b);
  return {
    total: halts.length,
    supervised: sup.length,
    unsupervised: unsup.length,
    kinds,                    // unsupervised, grouped by kind, worst (most sites) first
    fixes: allFixes,          // distinct fix numbers that close the unsupervised set
    anyUnplanned: kinds.some((k) => !k.fixes.length),
  };
}
