// run-data.mjs — the schemas of the run's data files beyond the map and the views'
// YAML: the ranked chains, the handoff sequence, and the two halves of the engine
// backlog (SCHEMA.md §5c, views/README.md). Each check returns a list of errors,
// empty when the document holds; the writer checks what it is about to write and
// validate.mjs reads every one of them back, fail-closed. Pure: no I/O.
//
// `ids` (optional) is the set of finding ids in the run's base: a data file that
// names an id the base does not carry has drifted from the map it was compiled from.

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isList = Array.isArray;

// ── views/improve/chains.json (views/improve/report.mjs) ─────────────────────
export const CHAINS_SCHEMA = 'assay.chains/1';
const BLAST_SCOPES = ['user', 'tenant', 'fleet', 'cross-tenant'];
const UNRESOLVED_KINDS = ['unsure-open', 'untraced-leg'];

export function checkChains(doc, ids) {
  const e = [];
  const known = (where, id) => { if (!isStr(id)) e.push(`${where}: id must be a finding id`); else if (ids && !ids.has(id)) e.push(`${where}: ${id} is not a finding in this run's base`); };
  const node = (where, n) => { if (!n || typeof n !== 'object') { e.push(`${where} must be { id, label }`); return; } known(where, n.id); if (!isStr(n.label)) e.push(`${where}: label must be a non-empty string`); };
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (doc.schema !== CHAINS_SCHEMA) e.push(`schema must be ${CHAINS_SCHEMA}`);
  if (!isStr(doc.run)) e.push('run must name the run');
  for (const k of ['live', 'held', 'contained', 'unresolved']) if (!isList(doc[k])) e.push(`${k} must be a list`);
  (isList(doc.live) ? doc.live : []).forEach((c, i) => {
    const at = `live[${i}]`;
    if (c.rank !== i + 1) e.push(`${at}: rank must be ${i + 1} (the list is the ranking)`);
    node(`${at}.entry`, c.entry); node(`${at}.headline`, c.headline);
    if (!BLAST_SCOPES.includes(c.blast)) e.push(`${at}: blast must be one of ${BLAST_SCOPES.join(', ')} (got ${JSON.stringify(c.blast)})`);
    if (!Number.isInteger(c.difficulty_rank) || c.difficulty_rank < 0 || c.difficulty_rank > 3) e.push(`${at}: difficulty_rank must be 0–3`);
    if (!isList(c.path) || c.path.length < 2) e.push(`${at}: path must list at least the entry and the headline`);
    else c.path.forEach((id) => known(`${at}.path`, id));
    if (!isList(c.sinks) || !c.sinks.length) e.push(`${at}: sinks must list what the chain reaches`);
    else c.sinks.forEach((s, j) => node(`${at}.sinks[${j}]`, s));
    if (typeof c.tentative !== 'boolean') e.push(`${at}: tentative must be a boolean`);
  });
  (isList(doc.held) ? doc.held : []).forEach((c, i) => {
    node(`held[${i}].entry`, c.entry);
    if (!isList(c.holds) || !c.holds.length) e.push(`held[${i}]: holds must list the held actions`);
    else c.holds.forEach((h, j) => { node(`held[${i}].holds[${j}]`, h); if (!isStr(h.by)) e.push(`held[${i}].holds[${j}]: by must say what holds it`); });
  });
  (isList(doc.contained) ? doc.contained : []).forEach((c, i) => { node(`contained[${i}]`, c); if (!isStr(c.why)) e.push(`contained[${i}]: why must be a non-empty string`); });
  (isList(doc.unresolved) ? doc.unresolved : []).forEach((c, i) => {
    node(`unresolved[${i}]`, c);
    if (!UNRESOLVED_KINDS.includes(c.kind)) e.push(`unresolved[${i}]: kind must be one of ${UNRESOLVED_KINDS.join(', ')}`);
  });
  return e;
}

// ── views/improve/report.json (views/improve/report.mjs) ─────────────────────
// The Improve report's model, labels applied, so a renderer of the report (a PDF made
// from it) reads this file and the run layout's paths and imports nothing (#236).
export const IMPROVE_REPORT_SCHEMA = 'assay.improve-report/1';
const isCount = (v) => Number.isInteger(v) && v >= 0;
const WEAK_CONFIDENCE = ['plausible', 'unverified'];   // below confirmed: what makes a chain tentative
const isMapOfStr = (v) => v && typeof v === 'object' && !isList(v) && Object.values(v).every(isStr);
const CONFIDENCES = ['confirmed', 'plausible', 'unverified'];   // map/SCHEMA.md `confidence`
// every object under v that names a finding by `id`, with where it sits
const namedEntries = (v, at, out = []) => {
  if (isList(v)) v.forEach((x, i) => namedEntries(x, `${at}[${i}]`, out));
  else if (v && typeof v === 'object') {
    if ('id' in v) out.push([at, v]);
    for (const [k, x] of Object.entries(v)) namedEntries(x, `${at}.${k}`, out);
  }
  return out;
};

export function checkImproveReport(doc, ids) {
  const e = [];
  const known = (where, id) => { if (!isStr(id)) e.push(`${where}: must be a finding id`); else if (ids && !ids.has(id)) e.push(`${where}: ${id} is not a finding in this run's base`); };
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (doc.schema !== IMPROVE_REPORT_SCHEMA) e.push(`schema must be ${IMPROVE_REPORT_SCHEMA}`);
  if (!isStr(doc.run)) e.push('run must name the run');
  const lab = doc.labels || {};
  for (const k of ['dimension', 'who', 'group']) if (!isMapOfStr(lab[k])) e.push(`labels.${k} must map each token to its label`);
  // one rule (#242): every entry naming a finding carries its confidence and the word
  // labels.confidence gives it (null when the table gives none: a confirmed finding)
  const words = lab.confidence;
  if (!isMapOfStr(words) || !Object.keys(words).every((k) => CONFIDENCES.includes(k))) e.push(`labels.confidence must map each confidence below confirmed to the report's word for it`);
  else for (const k of ['chains', 'capabilities', 'supervision']) for (const [at, n] of namedEntries(doc[k], k)) {
    if (!CONFIDENCES.includes(n.confidence)) e.push(`${at}: an entry naming a finding must carry its confidence (one of ${CONFIDENCES.join(', ')})`);
    else if (!('word' in n) || n.word !== (words[n.confidence] ?? null)) e.push(`${at}: word must be labels.confidence's word for ${n.confidence} (${JSON.stringify(words[n.confidence] ?? null)})`);
  }
  const cap = doc.capabilities;
  if (!cap || typeof cap !== 'object') e.push('capabilities must be { counts, groups }');
  else {
    const c = cap.counts || {};
    if (!isCount(c.kinds) || !isCount(c.unguarded) || !c.byGroup || typeof c.byGroup !== 'object') e.push('capabilities.counts must be { kinds, unguarded, byGroup }');
    if (!isList(cap.groups)) e.push('capabilities.groups must be a list');
    else cap.groups.forEach((g, i) => {
      const at = `capabilities.groups[${i}]`;
      if (!isStr(g.group) || !isStr(g.label)) e.push(`${at}: group and label must be non-empty strings`);
      if (!isCount(g.kinds) || !isCount(g.unguarded)) e.push(`${at}: kinds and unguarded must be counts`);
      if (!isList(g.channels) || !g.channels.length) { e.push(`${at}: channels must list the group's actions`); return; }
      g.channels.forEach((ch, j) => {
        const w = `${at}.channels[${j}]`;
        if (!isStr(ch.channel) || !isStr(ch.label) || !isStr(ch.trace)) e.push(`${w}: channel, label and trace must be non-empty strings`);
        if (typeof ch.halt !== 'boolean' || typeof ch.external !== 'boolean') e.push(`${w}: halt and external must be booleans`);
        if (!isList(ch.gates)) e.push(`${w}: gates must be a list`);
        if (!isList(ch.findings) || !ch.findings.length) e.push(`${w}: findings must list the channel's findings`);
        else ch.findings.forEach((id) => known(`${w}.findings`, id));
      });
    });
  }
  const ch = doc.chains;
  if (!ch || typeof ch !== 'object') e.push('chains must be { live, held, contained, unresolved }');
  else {
    for (const m of checkChains({ ...ch, schema: CHAINS_SCHEMA, run: doc.run }, ids)) e.push(`chains: ${m}`);
    (isList(ch.live) ? ch.live : []).forEach((c, i) => {
      const at = `chains.live[${i}]`;
      if (!isStr(c.blast_word) || !isStr(c.difficulty)) e.push(`${at}: blast_word and difficulty must be non-empty strings`);
      // the gaps that stop it and, when tentative, the step it rests on: map/chains.mjs's
      // own computation, carried so no renderer re-derives either (#239)
      if (!isList(c.cuts)) e.push(`${at}: cuts must list the control or process gaps that stop the chain ([] when none)`);
      else c.cuts.forEach((x, j) => { if (!x || typeof x !== 'object') { e.push(`${at}.cuts[${j}] must be { id, label }`); return; } known(`${at}.cuts[${j}]`, x.id); if (!isStr(x.label)) e.push(`${at}.cuts[${j}]: label must be a non-empty string`); });
      if (!('weakest' in c)) e.push(`${at}: weakest must be the tentative chain's weakest step, or null`);
      else if (c.tentative !== true) { if (c.weakest !== null) e.push(`${at}: a chain that is not tentative has weakest null`); }
      else if (!c.weakest || typeof c.weakest !== 'object') e.push(`${at}: a tentative chain must carry its weakest step { id, confidence, word }`);
      else {
        known(`${at}.weakest`, c.weakest.id);
        if (isList(c.path) && !c.path.includes(c.weakest.id)) e.push(`${at}.weakest: ${c.weakest.id} is not on the chain's path`);
        if (!WEAK_CONFIDENCE.includes(c.weakest.confidence)) e.push(`${at}.weakest: confidence must be one of ${WEAK_CONFIDENCE.join(', ')}`);
        if (!isStr(c.weakest.word)) e.push(`${at}.weakest: word must be a non-empty string`);
      }
    });
  }
  if (!isStr(doc.howto)) e.push('howto must be the report\'s how-to text (views/improve/templates/howto.md, frontmatter stripped)');
  const s = doc.supervision;
  if (!s || typeof s !== 'object') e.push('supervision must be { total, supervised, unsupervised, kinds, fixes, any_unplanned }');
  else {
    if (!isCount(s.total) || !isCount(s.supervised) || !isCount(s.unsupervised) || s.supervised + s.unsupervised !== s.total) e.push('supervision: total must be supervised + unsupervised, each a count');
    if (!isList(s.fixes) || !s.fixes.every((n) => Number.isInteger(n) && n > 0)) e.push('supervision.fixes must list roadmap item numbers');
    if (typeof s.any_unplanned !== 'boolean') e.push('supervision.any_unplanned must be a boolean');
    if (!isList(s.kinds)) e.push('supervision.kinds must be a list');
    else s.kinds.forEach((k, i) => {
      const at = `supervision.kinds[${i}]`;
      if (!isStr(k.channel) || !isStr(k.label) || !isCount(k.sites)) e.push(`${at}: channel, label and sites must be set`);
      if (!isList(k.ids) || !k.ids.length) e.push(`${at}: ids must list the unsupervised sites`); else k.ids.forEach((id) => known(`${at}.ids`, id));
      if (!isList(k.fixes) || !k.fixes.every((f) => f && Number.isInteger(f.n) && f.n > 0 && (f.slug === null || isStr(f.slug)))) e.push(`${at}: fixes must be [{ n, slug }] (slug null when the roadmap item names none)`);
    });
  }
  return e;
}

// ── handoff/sequence.json (views/improve/handoff.mjs) ────────────────────────
export const SEQUENCE_SCHEMA = 'assay.handoff-sequence/1';
// kind → the voice the handoff labels it with (views/improve/handoff.mjs header)
// owner (#316): open gaps with no fix, one item per requirement or property; the owner decides the remedy
export const SEQUENCE_VOICES = { authored: 'eval-authored', triage: 'triage', remedy: 'scanner-verbatim', owner: 'owner-defined' };
// a sequence item's rank (#306): the yardstick's tiers in their order and the severity scale
// most severe first, or unrated. This module is pure, so the lists are restated here, and
// tests/blocks/sequence-rank-shape.mjs holds them to their homes (requirements.yaml `tiers:`,
// map/doctrine.mjs SEVERITY_ORDER)
export const SEQUENCE_TIERS = ['custody', 'safety', 'reproducibility', 'verification', 'legibility', 'operability'];
export const SEQUENCE_SEVERITIES = ['Blocker', 'Critical', 'High', 'Medium', 'Low', 'Nit', 'unrated'];
// an item's confidence (#319): how much assay knows about its worst gap, a value of the closed
// scale and the rule that assigned it (map/confidence.mjs CONFIDENCE and RULES, restated here as
// this module is pure; tests/blocks/confidence-on-every-item.mjs holds them to their home)
export const SEQUENCE_CONFIDENCE = ['confirmed', 'judged', 'absent-evidence', 'not-measured', 'known-misfire'];
export const SEQUENCE_CONFIDENCE_RULES = {
  'adapter-declared-misfire': 'known-misfire', 'source-not-run': 'not-measured', 'adapter-declared-not-measured': 'not-measured',
  'evidence-file-absent': 'absent-evidence', 'deterministic-instrument': 'confirmed', 'cited-and-confirmed': 'confirmed',
  'cited-not-confirmed': 'judged', 'judged-source': 'judged',
};
// an item's consequence (#319, slice 2): what is at stake, the consequence policy applied to the facts
// of what its gaps touch, a value of the closed scale, the rule that fired, the facts it read and the
// facts the run or a sweep set contested (map/consequence.mjs CONSEQUENCE, FACTS and ENGINE_RULES,
// restated here as this module is pure; tests/blocks/consequence-from-facts.mjs holds them to their home)
export const SEQUENCE_CONSEQUENCE = ['severe', 'significant', 'contained', 'cosmetic'];
export const SEQUENCE_CONSEQUENCE_FACTS = ['reversibility', 'external', 'gate_type', 'fail_mode', 'telemetry', 'blast_scope', 'halt', 'reach', 'trigger', 'tier', 'tags', 'floor', 'halt_at', 'exposure'];
// outside the scale: no rule of the policy values the gap; it carries the reason and no rule
export const SEQUENCE_CONSEQUENCE_UNVALUED = 'unvalued';
export const SEQUENCE_CONSEQUENCE_ENGINE_RULES = ['lane-judgment'];
const DESCRIPTOR_FACTS = SEQUENCE_CONSEQUENCE_FACTS.slice(0, 6);
const RULE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function consequenceErrors(c, at, s, policyRules) {
  const e = [];
  const unvalued = c && c.value === SEQUENCE_CONSEQUENCE_UNVALUED;
  if (!c || typeof c !== 'object' || !(SEQUENCE_CONSEQUENCE.includes(c.value) || unvalued)) return [`${at}: consequence must be { value: ${SEQUENCE_CONSEQUENCE.join(' | ')}, rule, finding, facts }, or { value: ${SEQUENCE_CONSEQUENCE_UNVALUED}, rule: null, reason, finding, facts }`];
  if (unvalued) { if (c.rule !== null || !isStr(c.reason)) e.push(`${at}: an unvalued consequence names no rule (rule: null) and carries its reason`); }
  else if (c.reason !== undefined) e.push(`${at}: only an unvalued consequence carries a reason`);
  if (unvalued) { /* no rule fired */ }
  else if (!isStr(c.rule) || !RULE_NAME.test(c.rule)) e.push(`${at}: consequence.rule must name the rule that fired`);
  else if (policyRules && !policyRules.includes(c.rule) && !SEQUENCE_CONSEQUENCE_ENGINE_RULES.includes(c.rule)) e.push(`${at}: consequence.rule ${c.rule} is neither a rule of the policy the sequence names nor the engine's (${SEQUENCE_CONSEQUENCE_ENGINE_RULES.join(', ')})`);
  if (!isList(s.findings) || !s.findings.includes(c.finding)) e.push(`${at}: consequence.finding must be one of the item's findings (got ${JSON.stringify(c.finding)})`);
  if (!c.facts || typeof c.facts !== 'object' || Array.isArray(c.facts) || JSON.stringify(Object.keys(c.facts)) !== JSON.stringify(SEQUENCE_CONSEQUENCE_FACTS))
    e.push(`${at}: consequence.facts must carry every fact the policy may read, in order (${SEQUENCE_CONSEQUENCE_FACTS.join(', ')}), null where the run could not read it`);
  if (c.effect !== undefined && !isStr(c.effect)) e.push(`${at}: consequence.effect names the effect finding whose facts were read`);
  if (c.contested !== undefined && !(isList(c.contested) && c.contested.length && c.contested.every((x) => x && DESCRIPTOR_FACTS.includes(x.fact) && isList(x.values) && x.values.length >= 2 && x.values.includes(x.read) && x.values[0] === x.read && isList(x.where) && x.where.length)))
    e.push(`${at}: consequence.contested must list { fact, values (riskier first, two or more), read (the riskier), where }`);
  if (c.judgment !== undefined) {
    const j = c.judgment;
    if (!j || !SEQUENCE_CONSEQUENCE.includes(j.value) || typeof j.applied !== 'boolean' || !isStr(j.because)) e.push(`${at}: consequence.judgment must be { value, because, applied }`);
    else if (j.applied && (c.rule !== 'lane-judgment' || c.value !== j.value || !(j.facts_value === SEQUENCE_CONSEQUENCE_UNVALUED ? j.facts_rule === null
      : SEQUENCE_CONSEQUENCE.includes(j.facts_value) && SEQUENCE_CONSEQUENCE.indexOf(j.value) < SEQUENCE_CONSEQUENCE.indexOf(j.facts_value) && isStr(j.facts_rule))))
      e.push(`${at}: an applied judgment raises the value above what the facts give (facts_value, facts_rule) and is the rule that decided it`);
    else if (!j.applied && (c.rule === 'lane-judgment' || unvalued || SEQUENCE_CONSEQUENCE.indexOf(j.value) < SEQUENCE_CONSEQUENCE.indexOf(c.value) || !isStr(j.refused)))
      e.push(`${at}: a judgment not applied is one at or below the facts' value, with the reason it was refused`);
  } else if (c.rule === 'lane-judgment') e.push(`${at}: a value the lane-judgment rule decided carries the judgment`);
  return e;
}
// an item's quadrant (#319, slice 3): consequence against confidence, by the first rule that takes the
// item's two recorded values (views/improve/quadrants.mjs QUADRANTS and QUADRANT_RULES, restated here
// as this module is pure; tests/blocks/quadrants-and-lenses.mjs holds them to their home). An item
// whose consequence is unvalued has none (quadrant: null).
export const SEQUENCE_QUADRANTS = ['act-now', 'verify-first', 'hygiene', 'park'];
export const SEQUENCE_NOT_VALUED = 'not-valued';
export const SEQUENCE_QUADRANT_RULES = [
  { name: 'known-misfire-parks', quadrant: 'park', confidence: ['known-misfire'], consequence: SEQUENCE_CONSEQUENCE },
  { name: 'not-measured-verifies-first', quadrant: 'verify-first', confidence: ['not-measured'], consequence: SEQUENCE_CONSEQUENCE },
  { name: 'high-stake-confirmed', quadrant: 'act-now', confidence: ['confirmed'], consequence: ['severe', 'significant'] },
  { name: 'high-stake-unconfirmed', quadrant: 'verify-first', confidence: ['judged', 'absent-evidence'], consequence: ['severe', 'significant'] },
  { name: 'low-stake-confirmed', quadrant: 'hygiene', confidence: ['confirmed'], consequence: ['contained', 'cosmetic'] },
  { name: 'low-stake-unconfirmed', quadrant: 'park', confidence: ['judged', 'absent-evidence'], consequence: ['contained', 'cosmetic'] },
];
// the labels that name a not-valued finding at the head of the not-valued list (views/improve/sequence.mjs HEAD_LABELS)
export const SEQUENCE_HEAD_LABELS = ['Blocker', 'Critical'];
function quadrantErrors(s, at) {
  const q = s.quadrant;
  const conf = s.confidence && s.confidence.value;
  const cons = s.consequence && s.consequence.value;
  if (cons === SEQUENCE_CONSEQUENCE_UNVALUED) return q === null ? [] : [`${at}: an item whose consequence is unvalued has no quadrant (quadrant: null)`];
  if (!q || typeof q !== 'object' || !SEQUENCE_QUADRANTS.includes(q.value)) return [`${at}: quadrant must be { value: ${SEQUENCE_QUADRANTS.join(' | ')}, rule }, or null when the consequence is unvalued`];
  const r = SEQUENCE_QUADRANT_RULES.find((x) => x.confidence.includes(conf) && x.consequence.includes(cons));
  if (!r || r.name !== q.rule || r.quadrant !== q.value) return [`${at}: quadrant must be the first rule's that takes confidence ${conf} with consequence ${cons} (${r ? `${r.name} → ${r.quadrant}` : 'none'}; got ${JSON.stringify(q)})`];
  return [];
}
// a mix: how many of the item's gaps hold each value, values of the scale in its order, the item's own among them
function mixErrors(mix, scale, value, at) {
  if (mix === undefined) return [];
  if (!mix || typeof mix !== 'object' || Array.isArray(mix)) return [`${at}: mix must map values to counts`];
  const ks = Object.keys(mix);
  if (!ks.length || !ks.every((k) => scale.includes(k) && Number.isInteger(mix[k]) && mix[k] > 0) || JSON.stringify(ks) !== JSON.stringify(scale.filter((v) => ks.includes(v))))
    return [`${at}: mix must count its gaps per value of the scale, in the scale's order (${scale.join(', ')}), each a whole number above 0`];
  if (!ks.includes(value)) return [`${at}: mix must count the item's own value (${value})`];
  return [];
}
const pctFigure = (x) => x === null || (x && Number.isInteger(x.agree) && Number.isInteger(x.of) && x.of > 0 && x.agree <= x.of && Number.isInteger(x.pct));

export function checkSequence(doc, ids) {
  const e = [];
  const known = (where, id) => { if (!isStr(id)) e.push(`${where}: must be a finding id`); else if (ids && !ids.has(id)) e.push(`${where}: ${id} is not a finding in this run's base`); };
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (doc.schema !== SEQUENCE_SCHEMA) e.push(`schema must be ${SEQUENCE_SCHEMA}`);
  if (!isStr(doc.run)) e.push('run must name the run');
  if (!isList(doc.sequence)) e.push('sequence must be a list');
  if (!isList(doc.pending)) e.push('pending must be a list (the owner-defined gaps, empty when none)');
  else doc.pending.forEach((id, i) => known(`pending[${i}]`, id));
  // the consequence policy the values were read under (#319): its file, digest and rule names; a
  // sequence written before the field carries none
  let policyRules = null;
  if (doc.policy !== undefined) {
    const p = doc.policy;
    if (!p || !isStr(p.file) || !/^[0-9a-f]{64}$/.test(String(p.sha256)) || !isList(p.rules) || !p.rules.length || !p.rules.every((r) => isStr(r) && RULE_NAME.test(r))) e.push('policy must be { file, sha256, rules: [rule names] }');
    else policyRules = p.rules;
  }
  // the lens the order is (#319, slice 3): its name, file and digest; what it left out, by quadrant;
  // and the not-valued findings their source labels Blocker or Critical. A sequence written before
  // the fields carries none.
  if (doc.lens !== undefined && !(doc.lens && isStr(doc.lens.name) && RULE_NAME.test(doc.lens.name) && isStr(doc.lens.file) && /^[0-9a-f]{64}$/.test(String(doc.lens.sha256)) && Object.keys(doc.lens).length === 3))
    e.push('lens must be { name, file, sha256 }');
  if (doc.left_out !== undefined) {
    if (!isList(doc.left_out)) e.push('left_out must be a list of { quadrant, findings }');
    else doc.left_out.forEach((x, i) => {
      if (!x || !(SEQUENCE_QUADRANTS.includes(x.quadrant) || x.quadrant === SEQUENCE_NOT_VALUED) || !isList(x.findings) || !x.findings.length) e.push(`left_out[${i}]: must be { quadrant: ${[...SEQUENCE_QUADRANTS, SEQUENCE_NOT_VALUED].join(' | ')}, findings: [ids] }`);
      else x.findings.forEach((id, j) => known(`left_out[${i}].findings[${j}]`, id));
    });
  }
  if (doc.not_valued_head !== undefined) {
    if (!isList(doc.not_valued_head)) e.push('not_valued_head must be a list');
    else doc.not_valued_head.forEach((h, i) => {
      const at = `not_valued_head[${i}]`;
      if (!h || !SEQUENCE_HEAD_LABELS.includes(h.label) || !isStr(h.reason) || !(h.n === null || (Number.isInteger(h.n) && h.n > 0)) || !(h.quadrant === null || SEQUENCE_QUADRANTS.includes(h.quadrant)))
        e.push(`${at}: must be { finding, label: ${SEQUENCE_HEAD_LABELS.join(' | ')}, reason, n (null when the lens leaves it out), quadrant (null when its item is not valued) }`);
      else known(`${at}.finding`, h.finding);
    });
  }
  (isList(doc.sequence) ? doc.sequence : []).forEach((s, i) => {
    const at = `sequence[${i}]`;
    if (s.n !== i + 1) e.push(`${at}: n must be ${i + 1} (the list is the order)`);
    if (!(s.kind in SEQUENCE_VOICES)) e.push(`${at}: kind must be one of ${Object.keys(SEQUENCE_VOICES).join(', ')}`);
    else if (s.voice !== SEQUENCE_VOICES[s.kind]) e.push(`${at}: a ${s.kind} item's voice is ${SEQUENCE_VOICES[s.kind]}`);
    if (s.kind !== 'authored' && !isStr(s.source)) e.push(`${at}: source must name the scanner`);
    if (!isStr(s.title)) e.push(`${at}: title must be a non-empty string`);
    if (!isList(s.findings) || !s.findings.length) e.push(`${at}: findings must list the ids it closes`);
    else s.findings.forEach((id, j) => known(`${at}.findings[${j}]`, id));
    if (s.plan !== null && !(isStr(s.plan) && /^plan\/[^/\\]+\.md$/.test(s.plan) && !s.plan.includes('..'))) e.push(`${at}: plan must be null or plan/<name>.md inside handoff/`);
    // rank: the key that placed the item, read off its worst open gap (views/improve/sequence.mjs,
    // #306). A sequence written before the field carries none; one that carries it is whole.
    if (s.rank !== undefined) {
      const r = s.rank;
      if (!r || typeof r !== 'object' || typeof r.halt !== 'boolean' || !(r.tier === null || SEQUENCE_TIERS.includes(r.tier)) || !SEQUENCE_SEVERITIES.includes(r.severity))
        e.push(`${at}: rank must be { halt: true | false, tier: ${SEQUENCE_TIERS.join(' | ')} | null, severity: ${SEQUENCE_SEVERITIES.join(' | ')} }`);
      // absent_evidence (#316): the item's worst gap is an owner's evidence file found absent; a
      // rank written before the field carries none
      else if (r.absent_evidence !== undefined && typeof r.absent_evidence !== 'boolean') e.push(`${at}: rank.absent_evidence must be true or false`);
    }
    // confidence (#319): how much assay knows about the item's worst gap. A sequence written before
    // the field carries none; one that carries it is whole: a value, the rule that assigned it, the
    // finding it was read off (one of the item's), a reason where a misfire or a not-measured pair
    // gives one, and a judged value's measured repeatability only where a sweep set measured it.
    // consequence (#319, slice 2): a sequence written before the field carries none; one that
    // carries it is whole
    if (s.consequence !== undefined) e.push(...consequenceErrors(s.consequence, at, s, policyRules));
    if (s.consequence && typeof s.consequence === 'object') e.push(...mixErrors(s.consequence.mix, [...SEQUENCE_CONSEQUENCE, SEQUENCE_CONSEQUENCE_UNVALUED], s.consequence.value, `${at}.consequence`));
    if (s.confidence && typeof s.confidence === 'object') e.push(...mixErrors(s.confidence.mix, SEQUENCE_CONFIDENCE, s.confidence.value, `${at}.confidence`));
    // quadrant (#319, slice 3): a sequence written before the field carries none
    if (s.quadrant !== undefined) e.push(...quadrantErrors(s, at));
    if (s.confidence !== undefined) {
      const c = s.confidence;
      if (!c || typeof c !== 'object' || !SEQUENCE_CONFIDENCE.includes(c.value)) e.push(`${at}: confidence must be { value: ${SEQUENCE_CONFIDENCE.join(' | ')}, rule, finding }`);
      else {
        if (SEQUENCE_CONFIDENCE_RULES[c.rule] !== c.value) e.push(`${at}: confidence.rule must name the rule that assigns ${c.value} (${Object.keys(SEQUENCE_CONFIDENCE_RULES).filter((k) => SEQUENCE_CONFIDENCE_RULES[k] === c.value).join(', ')}; got ${JSON.stringify(c.rule)})`);
        if (!isList(s.findings) || !s.findings.includes(c.finding)) e.push(`${at}: confidence.finding must be one of the item's findings (got ${JSON.stringify(c.finding)})`);
        if ((c.value === 'known-misfire' || c.value === 'not-measured') && !isStr(c.reason)) e.push(`${at}: a ${c.value} confidence carries its reason`);
        if (c.repeatability !== undefined) {
          if (c.value !== 'judged') e.push(`${at}: only a judged confidence carries repeatability`);
          else if (!isList(c.repeatability) || !c.repeatability.length || !c.repeatability.every((x) => x && isStr(x.set) && Number.isInteger(x.sweeps) && x.sweeps >= 2 && pctFigure(x.requirement_agreement) && pctFigure(x.candidate_agreement)))
            e.push(`${at}: confidence.repeatability must list { set, sweeps, requirement_agreement, candidate_agreement } per sweep set, each figure { agree, of, pct } or null (not measured)`);
        }
      }
    }
  });
  return e;
}

// ── map/backlog.yaml (map/backlog.mjs, the computed half) ───────────────────
const BACKLOG_COMPUTED_CLASSES = ['un-enumerated-population', 'evidence-inaccuracy', 'coverage-divergence', 'descriptor-divergence'];

export function checkBacklog(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  const counts = doc.counts || {};
  const why = doc.not_computed || {};
  for (const c of BACKLOG_COMPUTED_CLASSES) {
    if (!(c in counts)) e.push(`counts: no row for ${c}`);
    else if (counts[c] === null) { if (!isStr(why[c])) e.push(`counts.${c}: not computed must carry its reason under not_computed`); }
    else if (!Number.isInteger(counts[c]) || counts[c] < 0) e.push(`counts.${c}: must be a count or null (not computed)`);
  }
  for (const c of Object.keys(counts)) if (!BACKLOG_COMPUTED_CLASSES.includes(c)) e.push(`counts: ${c} is not a computed class`);
  if (!isList(doc.items)) return [...e, 'items must be a list'];
  const seen = new Set();
  doc.items.forEach((it, i) => {
    const at = `items[${i}]${it && it.id ? ` (${it.id})` : ''}`;
    if (!/^OB-C\d+$/.test(String(it.id))) e.push(`${at}: id must be OB-C<n>`);
    else if (seen.has(it.id)) e.push(`${at}: id appears twice`); else seen.add(it.id);
    if (!BACKLOG_COMPUTED_CLASSES.includes(it.class)) e.push(`${at}: class ${JSON.stringify(it.class)} is not one of ${BACKLOG_COMPUTED_CLASSES.join(', ')}`);
    if (it.source !== 'computed') e.push(`${at}: source must be computed`);
    if (it.status !== 'proposed') e.push(`${at}: status must be proposed (curation happens in the authored half)`);
    for (const k of ['observation', 'mechanism']) if (!isStr(it[k])) e.push(`${at}: ${k} must be a non-empty string`);
    if (!isList(it.evidence) || !it.evidence.length || !it.evidence.every(isStr)) e.push(`${at}: evidence must be a non-empty list of strings`);
  });
  for (const c of BACKLOG_COMPUTED_CLASSES)
    if (Number.isInteger(counts[c]) && counts[c] !== doc.items.filter((it) => it.class === c).length) e.push(`counts.${c}: ${counts[c]} does not match the items listed`);
  return e;
}

// ── map/backlog-authored.yaml (the analyst; METHOD.md "Feedback hook") ───────
const BACKLOG_AUTHORED_CLASSES = ['false-strength', 'band-sizing', 'granularity-drift', 'tooling-gap'];
const BACKLOG_AUTHORED_STATUS = ['proposed', 'filed', 'dropped'];

export function checkAuthoredBacklog(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (!isList(doc.items)) e.push('items must be a list (empty when the run exposed none)');
  const seen = new Set();
  (isList(doc.items) ? doc.items : []).forEach((it, i) => {
    const at = `items[${i}]${it && it.id ? ` (${it.id})` : ''}`;
    if (!/^OB-A\d+$/.test(String(it.id))) e.push(`${at}: id must be OB-A<n>`);
    else if (seen.has(it.id)) e.push(`${at}: id appears twice`); else seen.add(it.id);
    if (!BACKLOG_AUTHORED_CLASSES.includes(it.class)) e.push(`${at}: class ${JSON.stringify(it.class)} is not one of ${BACKLOG_AUTHORED_CLASSES.join(', ')}`);
    if (!BACKLOG_AUTHORED_STATUS.includes(it.status)) e.push(`${at}: status must be one of ${BACKLOG_AUTHORED_STATUS.join(', ')}`);
    for (const k of ['observation', 'mechanism']) if (!isStr(it[k])) e.push(`${at}: ${k} must be a non-empty string`);
    if (!isList(it.evidence) || !it.evidence.length || !it.evidence.every(isStr)) e.push(`${at}: evidence must be a non-empty list of strings`);
    if (it.status === 'filed' && !isStr(it.issue)) e.push(`${at}: a filed item names its issue`);
  });
  // 1–5 notes, one idea each; "nothing surprised me" is itself a note (METHOD.md)
  if (!isList(doc.notes) || doc.notes.length < 1 || doc.notes.length > 5 || !doc.notes.every(isStr))
    e.push('notes must list 1–5 non-empty notes (if nothing surprised the run, say so as the one note)');
  return e;
}
