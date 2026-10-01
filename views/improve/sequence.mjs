// sequence.mjs — the ONE numbering shared by the handoff (handoff.mjs) and the
// maintainer report (report.mjs), so a maintainer reading both never finds two
// different orders for the same run.
//
// Order (a person's judgment outranks the machine's — the reviewer's own
// priority leads, then the engine's honesty
// registers, worst first):
//   1. The reviewer's roadmap items (views/improve/prose.yaml `roadmap:`), in
//      authored order — the maintainer's first list, so the report's §6 and the
//      handoff's items 1..R are the SAME items with the SAME numbers.
//   2. Triage items — one per scanner whose adapter declares `handoff.triage:
//      true` (a read-first bucket: confirm which hits are live before fixing
//      anything) — covering every open gap from that scanner the roadmap did
//      not already absorb.
//   3. Every remaining scanner-fix remedy, grouped per its adapter's declared
//      `handoff.unit` (map/scanners/CONTRACT.md): `file` (one remedy per
//      evidence file), `scanner` (one remedy for the whole scanner's remaining
//      gaps), or the default `finding` (today's dedupe by identical verbatim
//      fix, buildFixSpine) — sorted worst severity first, then roster (axis)
//      order, exactly as before.
// With no roadmap, the sequence is triage items then the grouped remedies.
//
// A scanner item every one of whose findings a roadmap item cites is ABSORBED
// into that roadmap card (never sequenced twice). An open gap with no fix and
// no roadmap coverage is OWNER-DEFINED PENDING — named, never sequenced.
import { sevRank, buildFixSpine } from '../../map/doctrine.mjs';
import { axisShort } from '../../lib/display.mjs';

export const nn = (i) => String(i + 1).padStart(2, '0');
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
  return { roadmap, drift };
}

const fileKeyOf = (p) => {
  const paths = [...new Set((p.f.evidence || []).map(stripLine))].sort();
  return paths.length ? paths.join('|') : '(no path)';
};

// The one numbering. `decided` is the full decided base (map/decisions.mjs);
// `roadmap` is buildRoadmap's output; `roster` is the run's axis roster
// (map/project.mjs rosterFor), used only for the tie-break among remedies.
export function buildSequence({ decided, adapters, roadmap, roster }) {
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

  remedies.sort((a, b) => sevRank(a.sev) - sevRank(b.sev) || roster.indexOf(a.axis) - roster.indexOf(b.axis));
  triageItems.sort((a, b) => sevRank(a.sev) - sevRank(b.sev) || String(a.source).localeCompare(b.source));

  const seq = [
    ...roadmap.map((r) => ({ kind: 'authored', r, ps: r.ps })),
    ...triageItems,
    ...remedies,
  ];
  seq.forEach((s, i) => { s.n = i + 1; });

  // plan files: every roadmap item, every triage item, and every remedy whose
  // worst severity is High or above (today's tier-1 rule, applied to the group).
  for (const s of seq) {
    if (s.kind === 'authored') s.plan = `${nn(s.n - 1)}-${s.r.slug}.md`;
    else if (s.kind === 'triage') s.plan = `${nn(s.n - 1)}-triage-${s.source}.md`;
    else if (sevRank(s.sev) <= 2) s.plan = `${nn(s.n - 1)}-${axisShort(s.axis)}-${s.ids[0]}.md`;
  }

  const pending = openGaps.filter((p) => !p.f.fix && !coveredIds.has(p.f.id));

  // loud, never silent: a Critical finding or a triage item sitting outside the
  // roadmap. Every triage/remedy item is, by construction, outside the roadmap
  // (roadmap items are tier 1; these are what the roadmap did not cover).
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
