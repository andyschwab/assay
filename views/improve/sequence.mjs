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
// found them or what kind of item holds them (#306). Each open gap's key, in this order:
//   1. halt: an unheld halt (doctrine.mjs isHalt over its effect facet) first;
//   2. tier: the most urgent tier of the requirement rows the measurement (yardstick.yaml)
//      lists it on, in the yardstick's tier order;
//   3. severity: Blocker, Critical, High, Medium, Low, Nit, unrated. A gap that every row
//      it is listed on reads not measured is not a confirmed gap: it ranks unrated.
// A gap no requirement takes ranks by its severity alone: right after the last tiered gap
// at least as severe (ahead of every tiered gap when none is). An item's place is its worst
// gap's key; ties go to the item whose lowest finding id comes first.
//
// A scanner item every one of whose findings a roadmap item cites is ABSORBED
// into that roadmap card (never sequenced twice). An open gap with no fix and
// no roadmap coverage is OWNER-DEFINED PENDING — named, never sequenced.
import { sevRank, buildFixSpine, isHalt } from '../../map/doctrine.mjs';
import { axisShort } from '../../lib/display.mjs';

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

// Where each finding sits in the measurement: id → { tier, measured }, tier the index of the
// most urgent tier among the rows that list it, read first from the rows it holds unmet or
// mixed (the requirement the gap bears on), then from a row that read met or not applicable
// with it listed (what the row was met by, #260), then from a row that read not measured;
// measured is false when only a not-measured row lists it. A finding no row lists is absent:
// no requirement takes it. `measurement` is yardstick.yaml's rows
// (yardstick/measure.mjs); `yardstick` the registry (requirements.yaml), whose rows give each
// requirement's tier and whose `tiers:` give their order, joined here as every view joins them.
function tiersOfFindings(measurement, yardstick) {
  const tiers = yardstick.tiers;
  const tierOfReq = new Map((yardstick.requirements || []).map((d) => [d.id, d.tier]));
  const out = new Map();
  for (const row of Array.isArray(measurement) ? measurement : []) {
    const t = tiers.indexOf(tierOfReq.get(row.id));
    if (t < 0) throw new Error(`the measurement's row ${row.id} has no tier in the yardstick (${tiers.join(', ')}): the measurement and requirements.yaml disagree`);
    const by = row.status === 'unmet' || row.status === 'mixed' ? 0 : row.status === 'not-measured' ? 2 : 1;
    for (const id of Array.isArray(row.findings) ? row.findings : []) {
      const was = out.get(String(id));
      if (!was || by < was.by || (by === was.by && t < was.tier)) out.set(String(id), { tier: t, measured: by !== 2, by });
    }
  }
  return out;
}

const UNRATED = sevRank('unrated');
const NO_GAP = [2, Infinity, Infinity, 1];   // an item citing no open gap ranks last
const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
const byId = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

// The one ordering key (the header above; views/README.md, `handoff/sequence.json`). Sorts
// `items` in place, each `{ ps, … }`, and gives each a `rank` of its worst open gap:
// { halt, tier, severity }, tier the yardstick tier's name or null when no requirement takes it.
function rankItems(items, { tierOf, tiers }) {
  const open = (it) => it.ps.filter((p) => p.f.polarity === 'gap' && p.state === 'open');
  const keyOf = (p) => {
    const at = tierOf.get(String(p.f.id));
    const halt = p.f.effect && typeof p.f.effect === 'object' && isHalt(p.f.effect) ? 0 : 1;
    const sev = at && !at.measured ? UNRATED : sevRank(p.f.severity);
    return { p, halt, tier: at ? at.tier : null, sev };
  };
  const keyed = items.map((it) => ({ it, ks: open(it).map(keyOf) }));
  // a gap no requirement takes: after the last tiered gap, of its halt class, at least as severe
  const tiered = keyed.flatMap((x) => x.ks).filter((k) => k.tier !== null);
  const full = (k) => {
    if (k.tier !== null) return [k.halt, k.tier, k.sev, 0];
    const asSevere = tiered.filter((t) => t.halt === k.halt && t.sev <= k.sev);
    const last = asSevere.reduce((m, t) => (!m || lex([t.tier, t.sev], [m.tier, m.sev]) > 0 ? t : m), null);
    return [k.halt, last ? last.tier : -1, k.sev, 1];
  };
  for (const x of keyed) {
    let worst = null;
    for (const k of x.ks) { const f = full(k); if (!worst || lex(f, worst.f) < 0) worst = { f, k }; }
    x.key = worst ? worst.f : NO_GAP;
    x.first = [...new Set(x.it.ps.map((p) => p.f.id))].sort(byId)[0] ?? '';
    x.it.rank = worst
      ? { halt: worst.k.halt === 0, tier: worst.k.tier === null ? null : tiers[worst.k.tier], severity: worst.k.sev === UNRATED ? 'unrated' : worst.k.p.f.severity }
      : { halt: false, tier: null, severity: 'unrated' };
  }
  keyed.sort((a, b) => lex(a.key, b.key) || byId(a.first, b.first));
  keyed.forEach((x, i) => { items[i] = x.it; });
  return items;
}

// The one numbering. `decided` is the full decided base (map/decisions.mjs);
// `roadmap` is buildRoadmap's output; `measurement` is the run's measurement (yardstick.yaml
// rows) and `yardstick` the registry, which together say each finding's tier.
export function buildSequence({ decided, adapters, roadmap, measurement, yardstick }) {
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

  const seq = rankItems([
    ...roadmap.map((r) => ({ kind: 'authored', r, ps: r.ps })),
    ...triageItems,
    ...remedies,
  ], { tierOf: tiersOfFindings(measurement, yardstick), tiers: yardstick.tiers });
  seq.forEach((s, i) => { s.n = i + 1; });

  // plan files: every roadmap item, every triage item, and every remedy whose
  // worst severity is High or above (applied to the group).
  for (const s of seq) {
    if (s.kind === 'authored') s.plan = `${nn(s.n - 1)}-${s.r.slug}.md`;
    else if (s.kind === 'triage') s.plan = `${nn(s.n - 1)}-triage-${s.source}.md`;
    else if (sevRank(s.sev) <= 2) s.plan = `${nn(s.n - 1)}-${axisShort(s.axis)}-${s.ids[0]}.md`;
  }

  const pending = openGaps.filter((p) => !p.f.fix && !coveredIds.has(p.f.id));

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

  return { seq, coveredIds, openGaps, pending, urgentOutside, roadmapCount: roadmap.length };
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
