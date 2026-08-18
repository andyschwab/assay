// chains.mjs — compute attack chains from the findings graph, deterministically.
// The base already carries the chain as a graph: `reaches` edges from a capability that
// holds untrusted input to the effects it can drive, and `explained_by` edges to the
// controls that fail. This walks that graph and RANKS the chains, so the report's lead
// risk is computed from descriptors, never authored per run (determinism).
//
// Honesty (outputs are claims): the report never claims a chain does not EXIST, only that
// none was IDENTIFIED. Three states are computed, not two:
//   live      — reaches an unheld halt (a real, open path)
//   held      — reaches an effect, but every one is currently held (guarded / read-only);
//               shown with what holds it, because that control is load-bearing
//   contained — an untrusted-input surface with NO power to act (external_effect: false),
//               a confirmed reason the obvious chain is closed
// Plus `unresolved`: chain-critical values that could not be determined (a low-confidence
// finding on a path, an unsure sink, an effect leg with no traced reach). Confidence
// propagates: a chain riding a plausible/unverified finding is rendered "possible", not asserted.
import { isHalt } from './capabilities.mjs';
import { CHANNEL_LABEL, humanizeToken } from './display.mjs';

const PRECOND_RANK = {
  'prompt-injection': 1, 'malicious-dependency': 2, 'stolen-credential': 2,
  'network-position': 3, 'insider': 3, 'zero-day': 3, 'physical': 3,
};
const RANK_WORD = { 0: 'trivial', 1: 'low', 2: 'moderate', 3: 'high' };
const PRECOND_WHY = {
  'prompt-injection': 'a planted instruction the assistant reads',
  'malicious-dependency': 'a poisoned software package',
  'stolen-credential': 'a stolen credential',
  'network-position': 'a foothold on the network',
  'insider': 'an insider',
  'zero-day': 'an unknown exploit',
  'physical': 'physical access',
};
const BLAST_RANK = { user: 0, tenant: 0, fleet: 2, 'cross-tenant': 2 };
const BLAST_WORD = { user: 'one user', tenant: 'one tenant', fleet: 'the whole fleet', 'cross-tenant': 'other tenants too' };
const CONF_RANK = { confirmed: 2, plausible: 1, unverified: 0 };
const CONF_WORD = { plausible: 'inferred, not confirmed', unverified: 'not verified' };  // null for confirmed

const nodeCost = (f) => Math.max(0, ...((f && f.preconditions) || []).map((p) => PRECOND_RANK[p] || 0));
const hardestPrecond = (f) => {
  let best = null, r = -1;
  for (const p of (f && f.preconditions) || []) if ((PRECOND_RANK[p] || 0) > r) { r = PRECOND_RANK[p] || 0; best = p; }
  return best;
};
const label = (f, fallback) => (f && f.label) || fallback || (f && f.id) || '';
const sinkFallback = (f) => (f.effect && (CHANNEL_LABEL[f.effect.channel] || humanizeToken(f.effect.channel))) || f.id;
const confWord = (c) => CONF_WORD[c] || null;

// what the review found limiting a reached-but-not-open effect (stated as an observation,
// not a guarantee the limit holds — the reader decides what it's worth)
function holdReason(e) {
  if (!e.external && e.reversibility !== 'irreversible') return 'only reads, with no outside effect';
  const g = {
    'deterministic-halt': 'a hard stop', 'staged-reversible': 'a reversible step',
    'scope-bound': 'a scoped boundary', 'rate-throttle': 'a rate limit',
  }[e.gate_type] || 'a control in the way';
  return e.reversibility !== 'irreversible' ? `${g}, and it is reversible` : g;
}

// minimax path entry→sink: minimize the HARDEST precondition on the path.
function minimaxPath(entryId, sinkId, byId) {
  const dist = new Map([[entryId, nodeCost(byId.get(entryId))]]);
  const prev = new Map(), seen = new Set();
  while (seen.size < byId.size) {
    let u = null, ud = Infinity;
    for (const [k, d] of dist) if (!seen.has(k) && d < ud) { ud = d; u = k; }
    if (u == null) break;
    seen.add(u);
    if (u === sinkId) break;
    for (const v of (byId.get(u)?.reaches || [])) {
      if (!byId.has(v)) continue;
      const nd = Math.max(ud, nodeCost(byId.get(v)));
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  if (!dist.has(sinkId)) return null;
  const path = [sinkId];
  for (let c = sinkId; prev.has(c); ) { c = prev.get(c); path.unshift(c); }
  const gateNode = path.map((id) => byId.get(id)).reduce((a, b) => (nodeCost(b) > nodeCost(a) ? b : a));
  return { rank: dist.get(sinkId), path, gateNode };
}
// weakest confidence on a path, and the finding that set it
function pathConfidence(pathIds, byId) {
  let worst = 2, at = null;
  for (const id of pathIds) {
    const c = CONF_RANK[byId.get(id)?.confidence] ?? 2;
    if (c < worst) { worst = c; at = byId.get(id); }
  }
  return { rank: worst, weak: worst < 2 ? at : null };
}

// returns { live:[...], held:[...], contained:[...], unresolved:[...] }
export function buildChains(findings) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const entries = findings.filter((f) => f.subject_type === 'capability' && f.capabilities && f.capabilities.untrusted_input);
  const live = [], held = [], contained = [], unresolved = [];
  for (const entry of entries) {
    const reached = new Set(), q = [entry.id];
    while (q.length) for (const v of (byId.get(q.shift())?.reaches || [])) if (byId.has(v) && !reached.has(v)) { reached.add(v); q.push(v); }
    const reachedEffects = [...reached].map((id) => byId.get(id)).filter((f) => f.subject_type === 'effect' && f.effect);
    const liveSinks = reachedEffects.filter((f) => isHalt(f.effect));
    const heldEffects = reachedEffects.filter((f) => !isHalt(f.effect));
    const entryLabel = label(entry, entry.id);

    if (liveSinks.length) {
      const rankSink = (f) => (BLAST_RANK[f.effect.blast_scope] || 0) * 2 + (f.effect.reversibility === 'irreversible' ? 1 : 0);
      liveSinks.sort((a, b) => rankSink(b) - rankSink(a));
      const headline = liveSinks[0];
      const mm = minimaxPath(entry.id, headline.id, byId) || { rank: nodeCost(headline), path: [entry.id, headline.id], gateNode: headline };
      const conf = pathConfidence(mm.path, byId);
      const sinkIds = new Set(liveSinks.map((s) => s.id));
      const cuts = findings.filter((f) =>
        (f.subject_type === 'control' || f.subject_type === 'process') && f.polarity === 'gap' &&
        (((f.reaches || []).some((r) => sinkIds.has(r))) || liveSinks.some((s) => (s.explained_by || []).includes(f.id))))
        .map((f) => ({ id: f.id, label: label(f, f.id) }));
      const blast = headline.effect.blast_scope;
      live.push({
        entry: { id: entry.id, label: entryLabel },
        headline: { id: headline.id, label: label(headline, sinkFallback(headline)), blast },
        sinks: liveSinks.map((s) => ({ id: s.id, label: label(s, sinkFallback(s)), blast: s.effect.blast_scope, confWord: confWord(s.confidence) })),
        blast, blastWord: BLAST_WORD[blast] || blast,
        difficultyRank: mm.rank, difficulty: RANK_WORD[mm.rank] || String(mm.rank),
        difficultyWhy: PRECOND_WHY[hardestPrecond(mm.gateNode)] || 'a reachable precondition',
        path: mm.path, cuts,
        tentative: conf.rank < 2, confWord: conf.weak ? confWord(conf.weak.confidence) : null, weak: conf.weak ? conf.weak.id : null,
      });
      // an unsure live sink is a value worth resolving
      for (const s of liveSinks) if ((CONF_RANK[s.confidence] ?? 2) < 2)
        unresolved.push({ kind: 'unsure-open', id: s.id, label: label(s, sinkFallback(s)),
          why: `we could not confirm this action is really reachable/unguarded (${s.confidence})` });
    } else if (heldEffects.length) {
      held.push({
        entry: { id: entry.id, label: entryLabel },
        holds: heldEffects.map((e) => ({ id: e.id, label: label(e, sinkFallback(e)), by: holdReason(e.effect), confWord: confWord(e.confidence) })),
      });
    } else if (entry.capabilities.external_effect === false) {
      contained.push({ id: entry.id, label: entryLabel, why: 'holds no power to act' });
    } else {
      // an effect leg is present but no reached effect was traced — a missing edge, or truly inert
      unresolved.push({ kind: 'untraced-leg', id: entry.id, label: entryLabel,
        why: 'this surface can act but no action it reaches was traced — either contained or a missing link in the eval' });
    }
  }
  live.sort((a, b) => (BLAST_RANK[b.blast] || 0) - (BLAST_RANK[a.blast] || 0) || a.difficultyRank - b.difficultyRank || a.entry.id.localeCompare(b.entry.id));
  return { live, held, contained, unresolved };
}
