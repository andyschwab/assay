// sequence.mjs — the ONE numbering shared by the handoff (handoff.mjs) and the
// maintainer report (report.mjs), so a maintainer reading both never finds two
// different orders for the same run.
//
// What is sequenced (views/README.md, the `handoff/` row):
//   • the reviewer's roadmap items (views/improve/prose.yaml `roadmap:`), each with the
//     findings it cites;
//   • triage items: one per scanner whose adapter declares `handoff.triage: true` (a
//     read-first bucket: confirm which hits are live before fixing anything), covering
//     every open gap from that scanner the roadmap did not already absorb;
//   • every remaining scanner-fix remedy, grouped per its adapter's declared
//     `handoff.unit` (map/scanners/CONTRACT.md §7): `file`, `scanner`, or the default
//     `finding` (the dedupe by identical verbatim fix, buildFixSpine).
// The ORDER is one key, read off what each item's findings are, never off which scanner
// found them or what kind of item holds them (#306, #316). Each open gap's key, in this order
// (views/README.md `handoff/sequence.json` states it; KEY below is its one expression):
//   1. halt: an unheld halt (doctrine.mjs isHalt over its effect facet), or a confirmed gap on
//      a row whose `halt_at:` it reaches (yardstick/requirements.yaml), first;
//   2. severity class: Blocker/Critical/High, then Medium, then Low/Nit/unrated. A gap that
//      every row it is listed on reads not measured is not a confirmed gap: it ranks unrated;
//   3. evidence: a gap whose confidence is `absent-evidence` (map/confidence.mjs: an owner's
//      evidence file found absent) comes after every observed gap of its class;
//   4. tier: the most urgent tier of the requirement rows the measurement (yardstick.yaml)
//      lists it on, in the yardstick's tier order; a gap no requirement takes comes after every
//      tiered gap of its class;
//   5. severity within the class.
// An item's place is its worst gap's key; ties go to the item whose lowest finding id comes first.
// Every item also records its CONFIDENCE (#319): how much assay knows about its worst gap, on the
// closed scale map/confidence.mjs derives by one stated rule per value; among gaps tied at the
// worst key, the strongest value applies. Confidence does not reorder the key beyond clause 3.
// Every item also records its CONSEQUENCE (#319, slice 2): the policy (yardstick/consequence.yaml, or
// the operator's file the run record names) applied to the facts of what its gaps touch, by
// map/consequence.mjs; the item takes its most consequential gap's, the first in the key's order
// among equals. Consequence does not reorder the key: the quadrant view and the lenses are slice 3.
//
// A scanner item every one of whose findings a roadmap item cites is ABSORBED into that roadmap
// card (never sequenced twice). An open gap with no fix and no roadmap coverage is an OWNER item:
// one per requirement the measurement lists it on, else one per property it observes, sequenced
// by the same key; its remedy is the owner's to decide. A fix-less gap with neither stays
// PENDING: named, with the reason, never sequenced.
import { sevRank, buildFixSpine, isHalt } from '../../map/doctrine.mjs';
import { axisShort } from '../../lib/display.mjs';
import { propertyOf } from '../../map/placement.mjs';
import { confidenceOf, strongest } from '../../map/confidence.mjs';
import { consequenceIndex, consequenceOf, highest } from '../../map/consequence.mjs';

const nn = (i) => String(i + 1).padStart(2, '0');
export const SLUG_RE = /^[a-z0-9-]+$/;
export const stripLine = (e) => String(e).replace(/:\d+$/, '');
const cleanStr = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const worstSeverity = (ps) => {
  let best = null;
  for (const p of ps) if (best === null || sevRank(p.f.severity) < sevRank(best)) best = p.f.severity;
  return best || 'unrated';
};

// An adapter's optional `handoff:` block (map/scanners/CONTRACT.md), defaulted.
// `triage: true` implies `unit: scanner` — the block is a read-first bucket,
// never bundled by file or by identical fix.
export function handoffConfig(adapter) {
  const h = (adapter && adapter.handoff) || {};
  const triage = h.triage === true;
  return { unit: triage ? 'scanner' : (h.unit || 'finding'), triage, client_proof: h.client_proof || null };
}

// "Your proof" — the repository's OWN tools, no assay. One sentence per distinct
// scanner among `ps`, its adapter's client_proof filled with {paths} (evidence
// files, :line stripped, deduped) and {dirs} (their parent directories, deduped).
// A scanner with no client_proof declared says so plainly — never silence.
export function clientProofFor(adapters, ps) {
  const bySrc = new Map();
  for (const p of ps) { if (!bySrc.has(p.source)) bySrc.set(p.source, []); bySrc.get(p.source).push(p); }
  const out = [];
  for (const [src, group] of bySrc) {
    const cfg = handoffConfig(adapters[src]);
    const paths = [...new Set(group.flatMap((p) => (p.f.evidence || []).map(stripLine)))];
    const dirs = [...new Set(paths.map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.')))];
    if (!cfg.client_proof) { out.push(`No proof you can run without assay is declared for \`${src}\`.`); continue; }
    out.push(cfg.client_proof
      .replace(/\{paths\}/g, paths.join(', ') || 'the changed files')
      .replace(/\{dirs\}/g, dirs.join(', ') || 'the repository root'));
  }
  return out;
}

// The authored overlay, joined to the decided base. Moved out of handoff.mjs
// verbatim so report.mjs can build the SAME roadmap (and so the same drift check
// applies wherever the roadmap is read).
export function buildRoadmap(roadmapRaw, byId) {
  const roadmap = (Array.isArray(roadmapRaw) ? roadmapRaw : []).map((r, i) => ({
    slug: r.slug || `item-${i + 1}`,
    title: r.title || r.slug || `Roadmap item ${i + 1}`,
    body: String(r.body || '').trim(),
    questions: Array.isArray(r.questions) ? r.questions : [],
    // the unknown-as-a-variable shape (SCHEMA.md prose block): what the fix assumes, and at most
    // one question carrying the answer we proceed with. Shape errors are validate.mjs's; this
    // only normalizes, so a malformed item never crashes a compile.
    assumptions: (Array.isArray(r.assumptions) ? r.assumptions : []).map((a) => String(a == null ? '' : a).trim()).filter(Boolean),
    question: r.question && typeof r.question === 'object' && !Array.isArray(r.question) && String(r.question.text || '').trim()
      ? { text: String(r.question.text).trim(), recommended: String(r.question.recommended == null ? '' : r.question.recommended).trim(), blocking: r.question.blocking === true }
      : null,
    options: Array.isArray(r.options) ? r.options : [],
    done_when: Array.isArray(r.done_when) ? r.done_when : [],
    ps: (Array.isArray(r.findings) ? r.findings : []).map((id) => byId.get(id)).filter(Boolean),
    missing: (Array.isArray(r.findings) ? r.findings : []).filter((id) => !byId.has(id)),
  }));
  const drift = roadmap.filter((r) => r.missing.length);
  // the slug names the item's plan file (plan/NN-<slug>.md): anything but [a-z0-9-] could
  // carry a path segment out of handoff/. map/validate.mjs holds the same rule.
  const badSlugs = roadmap.filter((r) => !SLUG_RE.test(String(r.slug)));
  return { roadmap, drift, badSlugs };
}

const fileKeyOf = (p) => {
  const paths = [...new Set((p.f.evidence || []).map(stripLine))].sort();
  return paths.length ? paths.join('|') : '(no path)';
};

// Where each finding sits in the measurement: id → { tier, measured, req, haltAt }, tier the
// index of the most urgent tier among the rows that list it, read first from the rows it holds
// unmet or mixed (the requirement the gap bears on), then from a row that read met or not
// applicable with it listed (what the row was met by, #260), then from a row that read not
// measured; measured is false when only a not-measured row lists it; req is that row's id, and
// haltAt the row's `halt_at:` when the gap bears on it (unmet or mixed). A finding no row lists
// is absent: no requirement takes it. `measurement` is yardstick.yaml's rows
// (yardstick/measure.mjs); `yardstick` the registry (requirements.yaml), whose rows give each
// requirement's tier and halt_at and whose `tiers:` give their order, joined here as every view
// joins them.
function tiersOfFindings(measurement, yardstick) {
  const tiers = yardstick.tiers;
  const reqOf = new Map((yardstick.requirements || []).map((d) => [d.id, d]));
  const out = new Map();
  for (const row of Array.isArray(measurement) ? measurement : []) {
    const t = tiers.indexOf(reqOf.get(row.id)?.tier);
    if (t < 0) throw new Error(`the measurement's row ${row.id} has no tier in the yardstick (${tiers.join(', ')}): the measurement and requirements.yaml disagree`);
    const by = row.status === 'unmet' || row.status === 'mixed' ? 0 : row.status === 'not-measured' ? 2 : 1;
    const haltAt = by === 0 ? reqOf.get(row.id)?.halt_at ?? null : null;
    for (const id of Array.isArray(row.findings) ? row.findings : []) {
      const was = out.get(String(id));
      if (!was || by < was.by || (by === was.by && t < was.tier)) out.set(String(id), { tier: t, measured: by !== 2, by, req: row.id, haltAt: haltAt ?? was?.haltAt ?? null });
      else if (haltAt && !was.haltAt && by === was.by) was.haltAt = haltAt;
    }
  }
  return out;
}

const UNRATED = sevRank('unrated');
// the severity classes, most consequential first: a High never ranks below a Low (#316)
export const SEVERITY_CLASS = { Blocker: 0, Critical: 0, High: 0, Medium: 1, Low: 2, Nit: 2 };
const classOf = (sev) => SEVERITY_CLASS[sev] ?? 2;
const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
const byId = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

// What one open gap is, read off the finding and the measurement: the facts the key orders by.
// `at` is its place in the measurement (tiersOfFindings), absent when no requirement takes it.
function gapFacts(p, at, confidence) {
  const sev = at && !at.measured ? UNRATED : sevRank(p.f.severity);
  const named = sev === UNRATED ? 'unrated' : p.f.severity;
  const unheld = !!(p.f.effect && typeof p.f.effect === 'object' && isHalt(p.f.effect));
  // a confirmed gap at or above the halt_at of the row it bears on (yardstick/requirements.yaml)
  const reaches = !!(at && at.haltAt && p.f.confidence === 'confirmed' && sev !== UNRATED && sev <= sevRank(at.haltAt));
  return { halt: unheld || reaches, severity: named, sev, cls: classOf(named), absent: confidence.value === 'absent-evidence', tier: at ? at.tier : null };
}
// THE KEY (views/README.md): one tuple per gap, compared left to right; lower comes first.
// `tiers` is the yardstick's tier count, the place a gap no requirement takes holds in its class.
const KEY = (g, tiers) => [g.halt ? 0 : 1, g.cls, g.absent ? 1 : 0, g.tier === null ? tiers : g.tier, g.sev];
const NO_GAP = [2, Infinity, Infinity, Infinity, Infinity];   // an item citing no open gap ranks last

// Sorts `items` in place by KEY, each `{ ps, … }`, and gives each a `rank` of its worst open
// gap: { halt, tier, severity, absent_evidence }, tier the yardstick tier's name or null when no
// requirement takes it, and a `confidence` of that gap (map/confidence.mjs): { value, rule,
// finding, reason?, declared?, repeatability? }, the strongest among the gaps tied at the worst key;
// and a `consequence` (map/consequence.mjs): { value, rule, finding, facts, effect?, contested?,
// judgment? }, its most consequential open gap's, the first in the key's order among equals.
function rankItems(items, { tierOf, tiers, confOf, consOf }) {
  const open = (it) => it.ps.filter((p) => p.f.polarity === 'gap' && p.state === 'open');
  const keyed = items.map((it) => {
    let worst = null;
    const gaps = [];
    for (const p of open(it)) {
      const c = { ...confOf(p), finding: p.f.id };
      const g = gapFacts(p, tierOf.get(String(p.f.id)), c);
      const k = KEY(g, tiers.length);
      gaps.push({ k, p });
      const cmp = worst ? lex(k, worst.k) : -1;
      if (cmp < 0) worst = { k, g, cs: [c] };
      else if (cmp === 0) worst.cs.push(c);
    }
    const first = [...new Set(it.ps.map((p) => p.f.id))].sort(byId)[0] ?? '';
    it.rank = worst
      ? { halt: worst.g.halt, tier: worst.g.tier === null ? null : tiers[worst.g.tier], severity: worst.g.severity, absent_evidence: worst.g.absent }
      : { halt: false, tier: null, severity: 'unrated', absent_evidence: false };
    // an item citing no open gap has no gap to know about: its strongest cited finding's value
    it.confidence = worst ? strongest(worst.cs) : (it.ps.length ? strongest(it.ps.map((p) => ({ ...confOf(p), finding: p.f.id }))) : null);
    // what is at stake: the most consequential open gap, else (no open gap) its cited findings'
    const cited = gaps.length ? gaps.sort((a, b) => lex(a.k, b.k) || byId(a.p.f.id, b.p.f.id)).map((x) => x.p) : [...it.ps].sort((a, b) => byId(a.f.id, b.f.id));
    it.consequence = cited.length ? highest(cited.map(consOf)) : null;
    return { it, key: worst ? worst.k : NO_GAP, first };
  });
  keyed.sort((a, b) => lex(a.key, b.key) || byId(a.first, b.first));
  keyed.forEach((x, i) => { items[i] = x.it; });
  return items;
}

// The one numbering. `decided` is the full decided base (map/decisions.mjs);
// `roadmap` is buildRoadmap's output; `measurement` is the run's measurement (yardstick.yaml
// rows) and `yardstick` the registry, which together say each finding's tier.
// `context` is map/confidence.mjs loadConfidenceContext's (the run record, the census's deployment
// signals, the sweep sets named for the run); without it the rules read the findings alone. Its
// `consequence` is map/consequence.mjs loadConsequenceContext's (the policy the run record names,
// its channel keys, the named sweep sets' contests); without it, the default policy over the run.
/** @param {{ decided: any[], adapters: any, roadmap: any[], measurement: any, yardstick: any, context?: any }} args */
export function buildSequence({ decided, adapters, roadmap, measurement, yardstick, context = {} }) {
  const coveredIds = new Set(roadmap.flatMap((r) => r.ps.map((p) => p.f.id)));
  const openGaps = decided.filter((p) => p.f.polarity === 'gap' && p.state === 'open');
  const standalone = openGaps.filter((p) => p.f.fix && !coveredIds.has(p.f.id));

  const bySource = new Map();
  for (const p of standalone) { if (!bySource.has(p.source)) bySource.set(p.source, []); bySource.get(p.source).push(p); }

  const triageItems = [];
  const remedies = [];
  const findingUnitPs = [];

  for (const [source, ps] of bySource) {
    const cfg = handoffConfig(adapters[source]);
    if (cfg.triage) {
      triageItems.push({
        kind: 'triage', unit: 'scanner', source, ps,
        ids: ps.map((p) => p.f.id), sev: worstSeverity(ps), axis: ps[0]?.axis,
        files: [...new Set(ps.flatMap((p) => (p.f.evidence || []).map(stripLine)))],
      });
      continue;
    }
    if (cfg.unit === 'file') {
      const byFile = new Map();
      for (const p of ps) { const k = fileKeyOf(p); if (!byFile.has(k)) byFile.set(k, []); byFile.get(k).push(p); }
      for (const [fileKey, group] of byFile)
        remedies.push({ kind: 'remedy', unit: 'file', source, ps: group, ids: group.map((p) => p.f.id), sev: worstSeverity(group), axis: group[0]?.axis, fileKey, also: [] });
      continue;
    }
    if (cfg.unit === 'scanner') {
      remedies.push({ kind: 'remedy', unit: 'scanner', source, ps, ids: ps.map((p) => p.f.id), sev: worstSeverity(ps), axis: ps[0]?.axis, also: [] });
      continue;
    }
    findingUnitPs.push(...ps); // default 'finding' unit — spined below
  }

  // default 'finding' unit: the existing cross-scanner dedupe by (axis, verbatim
  // fix) — unchanged so a scanner that never declares `handoff:` behaves exactly
  // as it did before this module existed.
  const spine = buildFixSpine(findingUnitPs);
  for (const [axis, m] of spine) for (const it of m.values())
    remedies.push({ kind: 'remedy', unit: 'finding', source: it.source, ps: it.ps, ids: it.ids, sev: it.sev, axis, also: it.also, fix: it.fix, obs: it.obs });

  // owner items: an open gap with no fix and no roadmap coverage, grouped as the census and the
  // scanners are, one item per requirement the measurement lists it on (the row it bears on), else
  // one per property it observes (map/placement.mjs). Its remedy is the owner's to decide; it is
  // ranked by the same key. A fix-less gap with neither has nothing to group it under: pending.
  const tierOf = tiersOfFindings(measurement, yardstick);
  const fixless = openGaps.filter((p) => !p.f.fix && !coveredIds.has(p.f.id));
  const ownerGroups = new Map();
  const pending = [];
  for (const p of fixless) {
    const req = tierOf.get(String(p.f.id))?.req ?? null;
    const property = req ? null : propertyOf(p.f, adapters).property;
    if (!req && !property) { pending.push(p); continue; }
    const k = req ? `requirement:${req}` : `property:${property}`;
    if (!ownerGroups.has(k)) ownerGroups.set(k, { kind: 'owner', requirement: req, property, ps: [] });
    ownerGroups.get(k).ps.push(p);
  }
  const ownerItems = [...ownerGroups.values()].map((g) => ({
    ...g, source: [...new Set(g.ps.map((p) => p.source))].sort().join(', '), ids: g.ps.map((p) => p.f.id).sort(byId),
    sev: worstSeverity(g.ps), axis: g.ps[0]?.axis, slug: g.requirement || g.property,
  }));

  const seq = rankItems([
    ...roadmap.map((r) => ({ kind: 'authored', r, ps: r.ps })),
    ...triageItems,
    ...remedies,
    ...ownerItems,
  ], { tierOf, tiers: yardstick.tiers, confOf: (p) => confidenceOf(p, adapters, context),
    consOf: ((idx) => (p) => consequenceOf(p, idx))(consequenceIndex({ decided, measurement, yardstick, context: context.consequence })) });
  seq.forEach((s, i) => { s.n = i + 1; });

  // plan files: every roadmap item, every triage item, every remedy whose worst severity is High
  // or above (applied to the group), and every owner item that leads (a halt), is High or above,
  // or bears on a custody or safety row.
  for (const s of seq) {
    if (s.kind === 'authored') s.plan = `${nn(s.n - 1)}-${s.r.slug}.md`;
    else if (s.kind === 'triage') s.plan = `${nn(s.n - 1)}-triage-${s.source}.md`;
    else if (s.kind === 'owner') { if (s.rank.halt || sevRank(s.rank.severity) <= 2 || ['custody', 'safety'].includes(s.rank.tier)) s.plan = `${nn(s.n - 1)}-decide-${s.slug}.md`; }
    else if (sevRank(s.sev) <= 2) s.plan = `${nn(s.n - 1)}-${axisShort(s.axis)}-${s.ids[0]}.md`;
  }
  // why each pending gap stays outside the sequence (START-HERE names it)
  const pendingWhy = 'no fix is recorded, no requirement takes it and it names no property, so there is no item to group it under';

  // loud, never silent: a Critical finding or a triage item sitting outside the
  // roadmap. Every triage/remedy item is, by construction, outside the roadmap
  // (what the reviewer's own list did not cover).
  const urgentOutside = [];
  for (const s of seq) {
    if (s.kind === 'authored') continue;
    if (s.kind === 'triage') { urgentOutside.push({ n: s.n, kind: 'triage', source: s.source, count: s.ids.length }); continue; }
    const criticalIds = s.ps.filter((p) => p.f.severity === 'Critical').map((p) => p.f.id);
    if (criticalIds.length) urgentOutside.push({ n: s.n, kind: 'critical', ids: criticalIds });
  }

  return { seq, coveredIds, openGaps, pending, pendingWhy, urgentOutside, roadmapCount: roadmap.length };
}

// One stderr-ready sentence for the urgentOutside register (handoff.mjs prints
// it verbatim; report.mjs's paragraph names the same item numbers separately).
export function urgentNote(urgentOutside) {
  if (!urgentOutside.length) return '';
  const names = [];
  const nums = new Set();
  for (const u of urgentOutside) {
    nums.add(u.n);
    if (u.kind === 'triage') names.push(`the ${u.source} triage item (${u.count} hit${u.count === 1 ? '' : 's'})`);
    else names.push(...u.ids);
  }
  const ns = [...nums].sort((a, b) => a - b);
  const many = names.length > 1;
  return `the roadmap does not cover ${names.join(', ')}; ${many ? 'they sit' : 'it sits'} at item${ns.length === 1 ? '' : 's'} ${ns.join(', ')}; fold ${many ? 'them' : 'it'} into the roadmap if ${many ? 'they belong' : 'it belongs'} earlier`;
}

export { cleanStr, worstSeverity };
