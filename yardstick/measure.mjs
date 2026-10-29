#!/usr/bin/env node
// measure.mjs — the yardstick's measurement (yardstick/README.md).
//
// Measures a findings base against the YARDSTICK (yardstick/requirements.yaml):
// for each requirement, what the run decides — met | unmet | mixed | not-measured —
// and by which mechanism. A second projection beside the axis projection
// (project.mjs); it changes nothing the axis views compute. Read-only over the
// base. The honesty rules, in order:
//   • a requirement is decided only by its declared mechanism (facet, census,
//     instrument); prose is never read — an observation that merely mentions a
//     topic is not a measurement (the first prototype turned "single authored
//     contract" into a met bus-factor row);
//   • an instrument row decides only if the run manifest records its scanner as
//     ran; skipped or failed reads not-measured WITH the recorded reason;
//   • a peer scanner's category with no rows reads met only where the scanner's
//     own coverage sidecar says the domain was scanned; partial or not-scanned
//     reads not-measured;
//   • a `claim` requirement always reads not-measured from a run UNLESS a
//     repository's own packet (owner/PACKET.md) decides it — then it reads from
//     the packet, `basis: owner` on the row, never inferred from a run;
//   • a claim on a row the RUN decides (facet/census/instrument) never changes
//     that row's status — a claim never lets presence stand in for enforcement.
//     `satisfied` against a run-`unmet` row is a contradiction, recorded, not merged.
//
// Usage:  node assay.mjs measure <run-dir> [--write] [--json] [--packet <dir>]
//   --write    regenerate yardstick.yaml (generated; never hand-edit)
//   --packet   validate a repository's packet and copy it into the run
//              (lib/run-layout.mjs packetManifestPath) before measuring; a run that
//              already carries that copy reads it with no flag (owner/PACKET.md)
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, q } from '../lib/yaml-min.mjs';
import { censusesPath, yardstickPath, ownerDir, packetManifestPath } from '../lib/run-layout.mjs';
import { isHalt, isHaltClass, gateHolds, isMain } from '../map/doctrine.mjs';
import { loadFindings, loadManifest, loadScannerCoverage, loadAdapters, AXIS_ORDER } from '../map/project.mjs';
import { loadPacket, validatePacket, decidePacketClaim } from './packet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // yardstick/
const YARDSTICK_FILE = join(HERE, 'requirements.yaml');
export const KINDS = ['facet', 'census', 'instrument', 'claim'];
const FACET_RULES = ['halts-gated', 'halts-traced', 'gates-fail-closed', 'trifecta', 'effects-provable'];
export const STATUSES = ['met', 'unmet', 'mixed', 'not-measured', 'not-applicable'];
const STRUCTURED = new Set(['structured-event', 'audited']);
// TOPICS — the roster a requirement's `topic:` must land on: the axis roster
// (map/project.mjs AXIS_ORDER) plus the three tiers with no axis of their own.
export const TOPICS = [...AXIS_ORDER, 'custody', 'reproducibility', 'operability'];

// ── the yardstick: load + validate (fail closed) ───────────────────────────────
// One decider: a scanner, the native category (or categories) its rows decide the row on,
// and its optional evidence conditions. Shared by a yardstick row and an adapter's decides:.
function validateDecider(spec, at) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return [`${at}: a decider must be a map`];
  const cat = spec.category;
  // category is one native_category, OR a list of them (two rows the decider must
  // hold jointly — e.g. install AND build); an empty list names nothing and is rejected
  const validCategory = typeof cat === 'string' ? cat.length > 0 : Array.isArray(cat) && cat.length > 0 && cat.every((c) => typeof c === 'string' && c.length > 0);
  if (!(spec.scanner && validCategory)) errors.push(`${at} needs scanner + category (a non-empty string, or a non-empty list of strings)`);
  // optional evidence conditions (§ not-applicable / not-measured, decided only from
  // the map): the name of a `polarity: fact` row, from the SAME scanner, whose presence
  // (with the decided category itself carrying no rows) resolves the decider instead of
  // the ordinary category verdict. Never a packet claim — see measureRun. `audits` names
  // the fact category in which the scanner records each file it audited: another
  // decider's not-measured fact about that file is answered by it.
  const okName = (x) => typeof x === 'string' && x.length > 0;
  for (const k of ['not_applicable_when', 'not_measured_when', 'audits']) {
    const v = spec[k];
    if (v !== undefined && !(okName(v) || (Array.isArray(v) && v.length > 0 && v.every(okName)))) errors.push(`${at}: ${k} must be a non-empty string, or a non-empty list of them (a fact row's native_category)`);
  }
  // optional population rule: the name of a detail flag the scanner sets on rows its own
  // evidence cannot carry (e.g. structure-scan's `unconfigured`, #121); such rows stay in
  // the map and the views and never decide this requirement
  if (spec.excluding !== undefined && !okName(spec.excluding)) errors.push(`${at}: excluding must be a non-empty string (a detail flag the scanner sets)`);
  return errors;
}
export function validateYardstick(reg) {
  const errors = [];
  if (!reg || !Array.isArray(reg.requirements)) return ['yardstick: no requirements list'];
  if (!Array.isArray(reg.tiers) || !reg.tiers.length) errors.push('yardstick: tiers must be a non-empty list');
  const tiers = new Set(reg.tiers || []), tags = new Set(reg.tags || []), topics = new Set(TOPICS), seen = new Set();
  for (const d of reg.requirements) {
    const at = `yardstick: ${d.id ?? '(no id)'}`;
    if (!d.id || !/^d-[a-z0-9-]+$/.test(d.id)) errors.push(`${at}: id must match d-<slug>`);
    if (seen.has(d.id)) errors.push(`${at}: duplicate id`); seen.add(d.id);
    if (!d.title) errors.push(`${at}: title required`);
    if (!tiers.has(d.tier)) errors.push(`${at}: tier "${d.tier}" not in the yardstick's tiers`);
    if (!topics.has(d.topic)) errors.push(`${at}: topic "${d.topic}" not in the allowed list (the axis roster plus custody, reproducibility and operability)`);
    for (const t of d.tags || []) if (!tags.has(t)) errors.push(`${at}: tag "${t}" not in the yardstick's tags`);
    if (!d.decide || !KINDS.includes(d.decide.kind)) errors.push(`${at}: decide.kind must be one of ${KINDS.join('|')}`);
    else if (d.decide.kind === 'facet' && !FACET_RULES.includes(d.decide.rule)) errors.push(`${at}: facet rule "${d.decide.rule}" unknown`);
    else if (d.decide.kind === 'census' && !(Array.isArray(d.decide.measures) && d.decide.measures.length)) errors.push(`${at}: census needs measures: [names]`);
    else if (d.decide.kind === 'instrument') {
      // one decider on the row itself (scanner + category …), a list of them (decide.deciders),
      // or none here: an external scanner binds through its adapter's `decides:` (CLAUDE.md
      // rule 7), and decidersOf resolves the row against the adapters
      if (d.decide.deciders !== undefined) {
        if (!Array.isArray(d.decide.deciders) || !d.decide.deciders.length) errors.push(`${at}: decide.deciders must be a non-empty list`);
        else for (const [i, spec] of d.decide.deciders.entries()) errors.push(...validateDecider(spec, `${at}: decide.deciders[${i}]`));
        if (d.decide.scanner !== undefined) errors.push(`${at}: decide carries scanner beside deciders: name each decider in the list`);
      } else if (d.decide.scanner !== undefined || d.decide.category !== undefined) errors.push(...validateDecider(d.decide, `${at}: instrument`));
      if (d.decide.any_gap !== undefined && d.decide.any_gap !== 'unmet') errors.push(`${at}: decide.any_gap may only be "unmet" (a check every listed property must hold)`);
    }
    if (!d.check) errors.push(`${at}: check (the proving check) required`);
    if (!Array.isArray(d.sources) || !d.sources.length) errors.push(`${at}: sources required (extracted, not designed)`);
    if (!['draft', 'stable', 'deprecated'].includes(d.status)) errors.push(`${at}: status must be draft|stable|deprecated`);
    // owner.risk / owner.fix — the Owner view's register (yardstick/README.md, views/owner.mjs):
    // required on every row, fail-closed, the same as check/sources above — a row with no
    // owner register would read as an owner page with a blank line, never an absence.
    if (!d.owner || !d.owner.risk || !d.owner.fix) errors.push(`${at}: owner.risk and owner.fix required (the Owner view's register)`);
  }
  return errors;
}
export function loadYardstick(file = YARDSTICK_FILE) {
  const reg = parseYaml(readFileSync(file, 'utf8'));
  // the register itself, then every adapter's binding against it (rule 7, #177)
  const errors = validateYardstick(reg);
  if (!errors.length) errors.push(...validateAdapterDecides(reg, (ADAPTERS ??= loadAdapters())));
  if (errors.length) throw new Error(errors.join('\n'));
  return reg;
}

// ── the run's inputs beyond the base ─────────────────────────────────────────
function loadMaturityInputs(dir) {
  const p = censusesPath(dir);
  if (!existsSync(p)) return null;
  return parseYaml(readFileSync(p, 'utf8'));
}
// The run's own copy of a repository's packet (owner/manifest.yaml —
// lib/run-layout.mjs packetManifestPath), if `measure --packet` ever copied one
// in. Read-only, already-validated data: never re-validated here (that happened
// at copy time) and never reached for outside the run — a re-compile reproduces
// from exactly what the run itself carries. Absent is the norm, not an error.
export function loadRunPacket(dir) {
  const p = packetManifestPath(dir);
  if (!existsSync(p)) return null;
  return parseYaml(readFileSync(p, 'utf8'));
}
// manifest → { scanner: {status, reason} } across the two manifest shapes the tools accept
function dispositionsOf(manifest) {
  const out = {};
  if (!manifest) return out;
  const rows = Array.isArray(manifest) ? manifest : Array.isArray(manifest.scanners) ? manifest.scanners
    : manifest.scanners && typeof manifest.scanners === 'object' ? Object.entries(manifest.scanners).map(([k, v]) => ({ scanner: k, ...v })) : [];
  for (const r of rows) if (r && (r.scanner || r.id)) out[r.scanner || r.id] = { status: r.status, reason: r.reason };
  return out;
}

let ADAPTERS = null;
const isInstrument = (scanner) => { ADAPTERS ??= loadAdapters(); return ADAPTERS[scanner]?.role === 'instrument'; };

// ── deciders ──────────────────────────────────────────────────────────────────
const row = (status, how, ids, note, extra = {}) => ({ status, how, findings: ids, note, ...extra });

function byFacet(d, fs) {
  const effects = fs.filter((f) => f.subject_type === 'effect' && f.effect);
  const halts = effects.filter((f) => isHaltClass(f.effect));
  const r = d.decide.rule;
  if (r === 'halts-gated' || r === 'halts-traced' || r === 'effects-provable' || r === 'gates-fail-closed') {
    if (!effects.length) return row('not-measured', 'facet', [], 'no effect findings in the base');
    let bad = [], of = halts, what = '';
    if (r === 'halts-gated') { bad = halts.filter((f) => isHalt(f.effect)); what = 'halt-class effects with no gate that holds'; }
    if (r === 'halts-traced') { bad = halts.filter((f) => f.effect.telemetry === 'none'); what = 'halt-class effects leaving no record'; }
    if (r === 'gates-fail-closed') {
      // fail-open and a check that never terminates are each counted, and named apart (#38)
      of = effects.filter((f) => f.effect.gate_type && f.effect.gate_type !== 'none');
      const open = of.filter((f) => f.effect.fail_mode === 'open'), unt = of.filter((f) => f.effect.fail_mode === 'unterminated');
      bad = of.filter((f) => open.includes(f) || unt.includes(f));
      if (!of.length) return row('not-measured', 'facet', [], 'population empty (gated effects)');
      const ch = (xs) => xs.length ? ': ' + xs.map((f) => f.effect.channel).filter(Boolean).join(', ') : '';
      return row(bad.length ? 'unmet' : 'met', 'facet', bad.map((f) => f.id),
        `${bad.length} of ${of.length} gated effects whose gate does not end in a refusal: ${open.length} fails open${ch(open)}; ${unt.length} never terminates${ch(unt)}`,
        { met: of.length - bad.length, of: of.length, open: open.length, unterminated: unt.length });
    }
    if (r === 'effects-provable') { of = effects; bad = effects.filter((f) => !STRUCTURED.has(f.effect.telemetry)); what = 'effects with no structured or audited record'; }
    if (!of.length) return row('not-measured', 'facet', [], `population empty (${what.split(' with')[0]})`);
    return row(bad.length ? 'unmet' : 'met', 'facet', bad.map((f) => f.id), `${bad.length} of ${of.length} ${what}${bad.length ? ': ' + bad.map((f) => f.effect.channel).filter(Boolean).join(', ') : ''}`, { met: of.length - bad.length, of: of.length });
  }
  if (r === 'trifecta') {
    const caps = fs.filter((f) => f.subject_type === 'capability' && f.capabilities);
    if (!caps.length) return row('not-measured', 'facet', [], 'no capability findings in the base (no AI surface enumerated)');
    const full = caps.filter((f) => f.capabilities.untrusted_input && f.capabilities.private_data && f.capabilities.external_effect);
    const byId = new Map(fs.map((f) => [f.id, f]));
    const bad = full.filter((f) => (f.reaches ?? []).some((id) => { const t = byId.get(id); return t?.effect && isHalt(t.effect); }));
    const status = !full.length ? 'met' : bad.length ? 'unmet' : 'mixed';
    return row(status, 'facet', full.map((f) => f.id), `${caps.length} AI surface(s); ${full.length} hold the full trifecta; ${bad.length} reach an effect with no gate that holds`, { met: caps.length - full.length, of: caps.length });
  }
  throw new Error(`facet rule ${r}`);
}

function byCensus(d, inputs) {
  const names = new Set(d.decide.measures);
  const hits = [];
  for (const dim of inputs?.dimensions || []) for (const s of dim.sampled || []) if (names.has(s.name)) hits.push({ ...s, dimension: dim.dimension });
  if (!hits.length) return row('not-measured', 'census', [], `no census named ${d.decide.measures.join(' | ')} in map/censuses.yaml`);
  const s = hits[0];
  const met = Number(s.met), of = Number(s.of);
  if (!(of > 0)) return row('not-measured', 'census', [], `census ${s.name} has an empty population`);
  return row(met === of ? 'met' : met === 0 ? 'unmet' : 'mixed', 'census', [], `${met} of ${of} ${s.what ?? s.name} (census ${s.name}, ${s.dimension})`, { met, of, measure: s.name });
}

// one listed category's own "no gap rows" verdict — a deterministic INSTRUMENT that ran
// clean is met (its exit code is the verdict); a PEER scanner is met only where its own
// coverage sidecar says it scanned the domain — no sidecar means no account of what it
// looked at, which is not clean.
function categoryVerdict(scanner, category, rows, coverage) {
  const cov = coverage[scanner]?.coverage?.[category];
  if (!cov) {
    if (isInstrument(scanner)) return { status: 'met', note: `ran and reported no ${category} rows${rows.length ? ' (' + rows.length + ' strength row(s))' : ''}` };
    if (rows.length) return { status: 'met', note: `${rows.length} strength row(s), no gaps` };
    return { status: 'not-measured', note: coverage[scanner] ? `reported coverage but no row for category ${category}` : `left no coverage account for category ${category} (a peer scanner's silence is not clean)` };
  }
  if (cov.status === 'scanned') return { status: 'met', note: `scanned category ${category}: no gaps${rows.length ? ', ' + rows.length + ' strength row(s)' : ''}` };
  return { status: 'not-measured', note: `category ${category} ${cov.status}${cov.note ? ': ' + cov.note : ''}` };
}

// a row the requirement's `decide.excluding` flag sets aside (its detail carries the flag true)
const excluded = (spec, f) => Boolean(spec.excluding) && f.detail?.[spec.excluding] === true;

function byInstrument(d, spec, fs, disp, coverage) {
  const { scanner, category } = spec;
  // category may be one native_category or a list of them (two rows the decider must
  // hold jointly, e.g. install AND build for one requirement): a finding matches when its
  // native_category is ANY listed value; met requires EVERY listed category to be met.
  const categories = (Array.isArray(category) ? category : [category]).map(String);
  const catLabel = categories.length > 1 ? `[${categories.join(', ')}]` : categories[0];
  const all = fs.filter((f) => f.source === scanner && categories.includes(String(f.native_category ?? '')));
  const rows = all.filter((f) => !excluded(spec, f));
  const aside = all.length - rows.length;
  const asideNote = aside ? `; ${aside} row(s) flagged ${spec.excluding} set aside, not evidence for this requirement` : '';
  const dp = disp[scanner];
  if (!dp) return row(rows.length ? 'unmet' : 'not-measured', 'instrument', rows.map((f) => f.id), rows.length ? `${rows.length} row(s) from ${scanner} (no manifest disposition recorded)` : `${scanner} has no disposition in the run manifest`);
  if (dp.status !== 'ran') return row('not-measured', 'instrument', [], `${scanner} ${dp.status}${dp.reason ? ': ' + dp.reason : ''}`);
  const gaps = rows.filter((f) => f.polarity === 'gap'), strengths = rows.filter((f) => f.polarity === 'strength');
  // a safety-tier check is a cleanliness claim: a strength row never makes it partly met
  // (yardstick/README.md, the instrument rule); any other tier reads a strength beside a gap mixed.
  if (gaps.length) return row(strengths.length && mixable(d) ? 'mixed' : 'unmet', 'instrument', rows.map((f) => f.id), `${gaps.length} gap row(s) from ${scanner} category ${catLabel}${strengths.length ? ', ' + strengths.length + ' strength' : ''}${asideNote}`);
  // no gap rows anywhere in the listed categories: met only where every listed category
  // independently clears categoryVerdict — a list is an AND, never decided by one member alone.
  const perCat = categories.map((c) => ({ c, ...categoryVerdict(scanner, c, rows.filter((f) => String(f.native_category) === c), coverage) }));
  const unmet = perCat.filter((p) => p.status !== 'met');
  if (!unmet.length) return row('met', 'instrument', rows.map((f) => f.id), `${scanner} ${perCat.map((p) => p.note).join('; ')}${asideNote}`);
  return row('not-measured', 'instrument', rows.map((f) => f.id), `${scanner} ${unmet.map((p) => `${p.c}: ${p.note}`).join('; ')}`);
}

// ── evidence conditions: not-applicable / not-measured, decided ONLY from a fact
// the deciding instrument itself recorded (yardstick/README.md — a row's optional
// `decide.not_applicable_when` / `decide.not_measured_when`, naming a `polarity:
// fact` row's native_category from the SAME scanner). Never a packet claim: a
// claim never reaches an instrument-decided row's status at all (measureRun),
// so a claim of not-applicable here is ignored for status like any other. Fires
// only when the row's own decided category carries NO rows this run — real
// evidence in that category (a gap, a strength) always governs over the
// condition, the same "list is an AND, never overridden by a side fact" rule
// byInstrument already holds for a joint category.
function evidenceCondition(spec, fs, disp, key, answered = new Set()) {
  const cond = spec[key];
  if (!cond) return null;
  const { scanner, category } = spec;
  if (disp[scanner]?.status !== 'ran') return null;   // not decidable from a run that did not happen
  const categories = (Array.isArray(category) ? category : [category]).map(String);
  const inCategory = fs.filter((f) => f.source === scanner && categories.includes(String(f.native_category ?? '')) && !excluded(spec, f));
  if (inCategory.length) return null;
  const conds = (Array.isArray(cond) ? cond : [cond]).map(String);   // any one of the named facts fires it
  // a fact about files another decider of the same row audited is answered by that decider
  const hits = fs.filter((f) => f.source === scanner && conds.includes(String(f.native_category)) && f.polarity === 'fact')
    .filter((f) => !(evidenceFiles(f).length && evidenceFiles(f).every((x) => answered.has(x))));
  if (!hits.length) return null;
  return hits.map((h) => h.observation).filter(Boolean).join(' ') || `${scanner} recorded ${conds.join(' / ')}`;
}

// a gap beside a strength reads mixed, except on a safety-tier row (a cleanliness claim) and
// on a row marked `any_gap: unmet` (a check every listed property must hold, #177)
const mixable = (d) => d.tier !== 'safety' && d.decide.any_gap !== 'unmet';
const evidenceFiles = (f) => (f.evidence || []).map((e) => String(e).replace(/:\d+(-\d+)?$/, '')).filter(Boolean);
const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map(String);

// The deciders of an instrument row (#177): its own (the single form on decide, or
// decide.deciders), then every adapter whose `decides:` names the row. An adapter's binding
// counts when the scanner is adopted, or when the run records a disposition for it (a
// candidate measured on a run that carries it).
export function decidersOf(d, adapters, disp = null) {
  if (d?.decide?.kind !== 'instrument') return [];
  const own = Array.isArray(d.decide.deciders) ? d.decide.deciders : d.decide.scanner ? [d.decide] : [];
  const bound = Object.values(adapters || {}).flatMap((a) => (Array.isArray(a.decides) ? a.decides : [])
    .filter((b) => b && b.requirement === d.id && (a.adopted !== false || (disp && disp[a.scanner])))
    .map(({ requirement, ...b }) => ({ ...b, scanner: a.scanner })));
  return [...own.map(({ kind, deciders, any_gap, ...spec }) => spec), ...bound];
}
// every adapter binding names an instrument row and is a whole decider; every instrument
// row resolves at least one decider (fail closed: a row nothing decides is not a row)
function validateAdapterDecides(reg, adapters) {
  const errors = [];
  const byId = new Map(reg.requirements.map((d) => [d.id, d]));
  for (const a of Object.values(adapters || {})) for (const [i, b] of (Array.isArray(a.decides) ? a.decides : []).entries()) {
    const at = `adapters/${a.scanner}.yaml decides[${i}]`;
    const d = b && byId.get(b.requirement);
    if (!d) { errors.push(`${at}: names no requirement in the yardstick (${b && b.requirement})`); continue; }
    if (d.decide.kind !== 'instrument') errors.push(`${at}: ${d.id} is decided by ${d.decide.kind}, not an instrument`);
    errors.push(...validateDecider({ ...b, scanner: a.scanner }, at));
  }
  for (const d of reg.requirements) if (d.decide.kind === 'instrument' && !decidersOf(d, adapters, null).length && !Object.values(adapters || {}).some((a) => (a.decides || []).some((b) => b && b.requirement === d.id)))
    errors.push(`yardstick: ${d.id}: an instrument row with no decider (neither on the row nor in any adapter's decides:)`);
  return errors;
}

// One decider's own reading of the row: its evidence conditions, then its rows.
function decideOne(d, spec, fs, disp, coverage, answered) {
  const na = evidenceCondition(spec, fs, disp, 'not_applicable_when');
  if (na) return row('not-applicable', 'instrument', [], na);
  const nm = evidenceCondition(spec, fs, disp, 'not_measured_when', answered);
  if (nm) return row('not-measured', 'instrument', [], nm);
  return byInstrument(d, spec, fs, disp, coverage);
}
// An instrument row over all its deciders (#177). One decider reads exactly as it always
// has. With several: a gap from any decider decides the row (mixed only where a strength
// sits beside it and the row is mixable); a decider that reads not-applicable steps aside,
// and the row is not-applicable only when every one does; any other decider not measured
// holds the row not-measured; met needs every remaining decider met.
function decideInstrument(d, fs, disp, coverage, adapters) {
  const specs = decidersOf(d, adapters, disp);
  if (!specs.length) return row('not-measured', 'instrument', [], 'no decider for this row is adopted or recorded in this run');
  const auditedBy = (spec) => new Set(fs.filter((f) => f.source === spec.scanner && f.polarity === 'fact' && asList(spec.audits).includes(String(f.native_category))).flatMap(evidenceFiles));
  const per = specs.map((spec) => {
    const answered = new Set(specs.filter((o) => o !== spec).flatMap((o) => [...auditedBy(o)]));
    return { spec, r: decideOne(d, spec, fs, disp, coverage, answered) };
  });
  if (per.length === 1) return per[0].r;
  const ids = [...new Set(per.flatMap((p) => p.r.findings || []))];
  const say = (ps) => ps.map((p) => `${p.spec.scanner}: ${p.r.note}`).join('; ');
  const gapped = per.filter((p) => p.r.status === 'unmet' || p.r.status === 'mixed');
  if (gapped.length) {
    const byId = new Map(fs.map((f) => [f.id, f]));
    const strengths = ids.filter((id) => byId.get(id)?.polarity === 'strength').length;
    return row(strengths && mixable(d) ? 'mixed' : 'unmet', 'instrument', ids, say(per));
  }
  const live = per.filter((p) => p.r.status !== 'not-applicable');
  if (!live.length) return row('not-applicable', 'instrument', [], say(per));
  if (live.some((p) => p.r.status !== 'met')) return row('not-measured', 'instrument', ids, say(live.filter((p) => p.r.status !== 'met')));
  return row('met', 'instrument', ids, say(live));
}

// ── the projection ────────────────────────────────────────────────────────────
// `packet` (optional): a repository's own VALIDATED claims (yardstick/packet.mjs
// loadPacket().doc — the caller validates; this function trusts it). Every row
// gains `basis`: 'owner' only when the packet itself decided that row (a claim
// row it spoke to, extracted or generic); 'run' otherwise — including a claim
// row the packet is silent on, which still reads not-measured, unchanged.
// Contradictions (a packet claim of `satisfied` against a run-decided `unmet`
// row) are collected and attached as `rows.contradictions` — an own property on
// the returned array, not a second return value, so every existing caller
// (`.map`/`.find`/`Object.fromEntries`) keeps working unmodified.
export function measureRun({ findings, manifest, inputs, coverage, packet = null, adapters = null }, reg = loadYardstick()) {
  const disp = dispositionsOf(manifest);
  adapters ??= (ADAPTERS ??= loadAdapters());
  const contradictions = [];
  const claims = packet && Array.isArray(packet.claims) ? packet.claims : [];
  const rows = reg.requirements.map((d) => {
    let r, basis = 'run';
    if (d.decide.kind === 'facet') r = byFacet(d, findings);
    else if (d.decide.kind === 'census') r = byCensus(d, inputs);
    else if (d.decide.kind === 'instrument') r = decideInstrument(d, findings, disp, coverage || {}, adapters);
    else {
      const pd = decidePacketClaim(d.id, packet);
      if (pd) { r = row(pd.status, 'claim', [], pd.note); basis = 'owner'; }
      else r = row('not-measured', 'claim', [], 'claim-only: decided by the owner, never inferred from a run');
    }
    if (d.decide.kind !== 'claim') {
      const c = claims.find((x) => x && x.id === d.id);
      if (c && c.state === 'satisfied' && r.status === 'unmet') {
        contradictions.push({ id: d.id, claim: 'satisfied', run_status: r.status, findings: r.findings || [] });
      }
    }
    return { id: d.id, title: d.title, tier: d.tier, tags: d.tags || [], topic: d.topic ?? null, kind: d.decide.kind, basis, ...r };
  });
  rows.contradictions = contradictions;
  return rows;
}
// packet: optional explicit override (already-validated doc); default reads the
// run's own copy (owner/manifest.yaml), so a run measured after `measure
// --packet <dir>` (or one that already carries the copy) folds it in with no
// flag — owner/PACKET.md, yardstick/README.md.
export function projectRun(runDir, reg, packet = loadRunPacket(runDir)) {
  const findings = loadFindings(runDir);
  const manifest = loadManifest(runDir);
  // Zero findings is a valid measurement when the run carries a manifest recording
  // what ran (an all-clean run: every instrument ran clean, explicit empty files) —
  // only a run with NEITHER findings NOR a manifest is the truly empty, unmeasured case
  // this guards against (CLAUDE.md rule 3: fail loud, never empty; a clean run with an
  // explicit run record is a valid measurement, not an absent one).
  if (!findings.length && !manifest) throw new Error(`no findings under ${runDir}`);
  return measureRun({ findings, manifest, inputs: loadMaturityInputs(runDir), coverage: loadScannerCoverage(runDir), packet }, reg);
}
// Read back a run's own measurement — yardstick.yaml — the FILE, never
// recomputed. This is what the four views (Intake, Maintain, Improve's topic
// grouping, Owner) read: only this measurement plus the yardstick (for
// title/tier/topic/check), never findings directly. Returns null when the run
// has not been measured yet.
export function loadMeasurement(dir) {
  const p = yardstickPath(dir);
  if (!existsSync(p)) return null;
  const doc = parseYaml(readFileSync(p, 'utf8'));
  return Array.isArray(doc.requirements) ? doc.requirements : [];
}
// The run's recorded contradictions (a packet claim of satisfied against a
// run-decided unmet row) — yardstick.yaml's own contradictions: list, never
// recomputed here. Always an array, even when the run carries no packet.
export function loadContradictions(dir) {
  const p = yardstickPath(dir);
  if (!existsSync(p)) return [];
  const doc = parseYaml(readFileSync(p, 'utf8'));
  return Array.isArray(doc.contradictions) ? doc.contradictions : [];
}
export function summarize(rows) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) c[r.status]++;
  return /** @type {Record<string, number>} */ ({ ...c, decided: rows.length - c['not-measured'], of: rows.length });
}
// yardstick.yaml — the run's measurement of the map against the yardstick.
// Per row: what THIS RUN decided, how, and its basis (run | owner — owner/PACKET.md);
// a title/tier/topic/check is the register's, joined by id, never duplicated here.
export function toYaml(rows, runName) {
  const L = [`# yardstick.yaml — GENERATED by yardstick/measure.mjs --write. Do not hand-edit.`,
    `# The yardstick's measurement of run ${runName}: per requirement, what THIS RUN decides and how.`,
    `# A claim-only requirement reads not-measured here by construction unless a repository's own`,
    `# packet decided it (basis: owner — owner/PACKET.md); the run never infers one.`,
    `# title/tier/topic/check are the yardstick's (yardstick/requirements.yaml), joined by id — not duplicated here.`,
    'schema: yardstick', 'version: 0', 'summary:'];
  const s = summarize(rows);
  for (const k of [...STATUSES, 'decided', 'of']) L.push(`  ${k}: ${s[k]}`);
  L.push('requirements:');
  for (const r of rows) {
    L.push(`  - id: ${r.id}`, `    status: ${r.status}`, `    how: ${r.how}`, `    basis: ${r.basis || 'run'}`);
    if (r.of != null) L.push(`    met: ${r.met}`, `    of: ${r.of}`);
    L.push(`    findings: [${r.findings.join(', ')}]`, `    note: ${q(r.note)}`);
  }
  const contradictions = rows.contradictions || [];
  L.push('contradictions:');
  for (const c of contradictions) {
    L.push(`  - id: ${c.id}`, `    claim: ${c.claim}`, `    run_status: ${c.run_status}`, `    findings: [${(c.findings || []).join(', ')}]`);
  }
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const packetIdx = args.indexOf('--packet');
  const packetDir = packetIdx > -1 ? args[packetIdx + 1] : null;
  const dir = args.find((a, i) => !a.startsWith('--') && !(packetIdx > -1 && i === packetIdx + 1));
  if (!dir) { console.error('usage: node assay.mjs measure <run-dir> [--write] [--json] [--packet <dir>]'); process.exit(2); }
  if (packetDir) {
    let doc, file;
    try { ({ doc, file } = loadPacket(packetDir)); }
    catch (e) { console.error(`✗ assay measure --packet: ${e.message}`); process.exit(1); }
    const errors = validatePacket(doc, { requirementIds: loadYardstick().requirements.map((d) => d.id) });
    if (errors.length) {
      console.error(`✗ assay measure --packet: ${errors.length} violation(s) in ${file} (fails closed — nothing measured)\n`);
      for (const e of errors) console.error('  • ' + e);
      process.exit(1);
    }
    mkdirSync(ownerDir(dir), { recursive: true });
    copyFileSync(file, packetManifestPath(dir));
    console.error(`packet copied: ${file} → ${packetManifestPath(dir)}`);
  }
  const rows = projectRun(dir);
  const s = summarize(rows);
  if (args.includes('--json')) { console.log(JSON.stringify({ summary: s, requirements: rows }, null, 1)); }
  else {
    for (const r of rows) console.log(`${r.status.padEnd(12)} ${r.how.padEnd(10)} ${r.id.padEnd(34)} ${r.note}`);
    console.log(`\n${s.decided} of ${s.of} decided (met ${s.met} · unmet ${s.unmet} · mixed ${s.mixed}) · not measured ${s['not-measured']}`);
  }
  if (args.includes('--write')) {
    const out = yardstickPath(dir);
    writeFileSync(out, toYaml(rows, dir.split('/').filter(Boolean).pop()));
    console.error(`wrote ${out}`);
  }
}
