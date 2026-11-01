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
const isMapOfStr = (v) => v && typeof v === 'object' && !isList(v) && Object.values(v).every(isStr);

export function checkImproveReport(doc, ids) {
  const e = [];
  const known = (where, id) => { if (!isStr(id)) e.push(`${where}: must be a finding id`); else if (ids && !ids.has(id)) e.push(`${where}: ${id} is not a finding in this run's base`); };
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (doc.schema !== IMPROVE_REPORT_SCHEMA) e.push(`schema must be ${IMPROVE_REPORT_SCHEMA}`);
  if (!isStr(doc.run)) e.push('run must name the run');
  const lab = doc.labels || {};
  for (const k of ['dimension', 'who', 'group']) if (!isMapOfStr(lab[k])) e.push(`labels.${k} must map each token to its label`);
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
    (isList(ch.live) ? ch.live : []).forEach((c, i) => { if (!isStr(c.blast_word) || !isStr(c.difficulty)) e.push(`chains.live[${i}]: blast_word and difficulty must be non-empty strings`); });
  }
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
export const SEQUENCE_VOICES = { authored: 'eval-authored', triage: 'triage', remedy: 'scanner-verbatim' };

export function checkSequence(doc, ids) {
  const e = [];
  const known = (where, id) => { if (!isStr(id)) e.push(`${where}: must be a finding id`); else if (ids && !ids.has(id)) e.push(`${where}: ${id} is not a finding in this run's base`); };
  if (!doc || typeof doc !== 'object') return ['the document must be an object'];
  if (doc.schema !== SEQUENCE_SCHEMA) e.push(`schema must be ${SEQUENCE_SCHEMA}`);
  if (!isStr(doc.run)) e.push('run must name the run');
  if (!isList(doc.sequence)) e.push('sequence must be a list');
  if (!isList(doc.pending)) e.push('pending must be a list (the owner-defined gaps, empty when none)');
  else doc.pending.forEach((id, i) => known(`pending[${i}]`, id));
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
