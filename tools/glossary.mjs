// glossary.mjs — build the run-filtered glossary as Markdown, for
// compile-report.mjs (core + concepts in the report/PDF appendix).
// Enum groups are filtered to the values this run actually uses; core/concepts always show.

export function buildGlossary(findings, glossaryDefs, { only } = {}) {
  const dimsUsed = new Set(findings.map((f) => f.dimension));
  const subjUsed = new Set(findings.map((f) => f.subject_type));
  const confUsed = new Set(findings.map((f) => f.confidence));
  const eff = findings.filter((f) => f.effect).map((f) => f.effect);
  const set = (k) => new Set(eff.map((e) => e[k]).filter(Boolean));
  const pcUsed = new Set(findings.flatMap((f) => f.preconditions || []));
  const GROUPS = [
    ['core', 'Core', null, true],
    ['dimensions', 'The seven dimensions', dimsUsed, false],
    ['subject_type', 'What a finding is about', subjUsed, false],
    ['confidence', 'Confidence', confUsed, false],
    ['reversibility', 'Reversibility', set('reversibility'), false],
    ['gate_type', 'Gate types (what stops an action)', set('gate_type'), false],
    ['fail_mode', 'Fail mode', set('fail_mode'), false],
    ['telemetry', 'Telemetry (does it leave a trace?)', set('telemetry'), false],
    ['blast_scope', 'Blast scope (how far damage spreads)', set('blast_scope'), false],
    ['preconditions', 'Attacker preconditions (the difficulty dial)', pcUsed, false],
    ['concepts', 'Concepts', null, true],
  ];
  const humanize = (t) => t.replace(/-/g, ' ');
  const out = [];
  for (const [key, label, used, always] of GROUPS) {
    if (only && !only.includes(key)) continue;
    const grp = glossaryDefs[key];
    if (!grp) continue;
    const terms = Object.keys(grp).filter((t) => always || (used && used.has(t)));
    if (!terms.length) continue;
    out.push(`#### ${label}\n`);
    for (const t of terms) {
      const disp = always ? humanize(t) : t;
      out.push(`**${disp}** — ${String(grp[t]).replace(/\s+/g, ' ').trim()}\n`);
    }
  }
  return out.join('\n');
}
