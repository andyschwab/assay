// consequence.mjs — how much a gap matters: the one place the value is derived (#319, slice 2).
//
// Two questions, kept apart. WHAT CAN THE CODE DO is a set of facts from closed lists (FACTS), read
// off the map: the effect a gap is or touches (its six descriptors, map/SCHEMA.md §1), whether that
// effect is an unheld halt (doctrine.mjs isHalt), the live chain that carries the gap (its reach and
// its effort to trigger, map/chains.mjs), and the requirement row it bears on (its tier, its tags,
// whether it is floor). HOW MUCH THAT MATTERS is a policy over those facts, held as data
// (yardstick/consequence.yaml, or the operator's own file the run record names): rules of the form
// "when these facts hold, the consequence is at least this", every one read, the highest that
// fires winning and the first rule down the file at that value the one the item cites.
//
// Never read: a tool's or a lane's severity label. A label states a conclusion without its facts,
// so the same facts always give the same consequence, whoever found them and whatever they called
// it. Monotone, the only ways above what the facts give, never below:
//   • a contested fact reads its riskier value: a descriptor two of the run's findings on one
//     channel record differently, or that the sweeps of a set named for the run part on, reads the
//     riskier by map/variance.mjs's per-field order (DESCRIPTOR_RANK), and the item says so;
//   • a lane's judgment (`judged_consequence: { value, because }` on its finding, map/SCHEMA.md §1)
//     raises the value when it is higher (ENGINE_RULES `lane-judgment`, citing the policy rule it
//     raised), and is refused, recorded but never applied, when it would lower it.
// No rule, no value: a gap no rule values reads `unvalued`, outside the scale, with the reason;
// a value of the scale is never written without the rule that gave it (CLAUDE.md rule 3).
//
// The scale is closed and ordered, never a number, and nothing combines it with confidence.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { isHalt, sevRank } from './doctrine.mjs';
import { DESCRIPTOR_RANK, DESCRIPTOR_FIELDS, loadSweepSet, computeDescriptorAgreement, computeCandidateAgreement } from './variance.mjs';
import { buildChains, DIFFICULTY_WORDS, triggerOf } from './chains.mjs';
import { channelKeys } from './effect-triage.mjs';
import { loadManifest } from './project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POLICY = join(HERE, '..', 'yardstick', 'consequence.yaml');
const POLICY_SCHEMA = 'assay.consequence-policy';

// the scale, most consequential first
export const CONSEQUENCE = ['severe', 'significant', 'contained', 'cosmetic'];
// outside the scale: a gap no rule of the policy values, because no fact on the closed list that a
// rule reads applies to it. Never a value of the scale, never a guess, never read off a label: it
// carries its reason, and it is what slice 3 and #315 work down (#319, review of #322).
export const UNVALUED = 'unvalued';
const RANK_OF = (v) => (CONSEQUENCE.includes(v) ? CONSEQUENCE.indexOf(v) : CONSEQUENCE.length);   // lower = more consequential; unvalued below the scale
const higher = (a, b) => RANK_OF(a) < RANK_OF(b);

const BLAST = Object.keys(DESCRIPTOR_RANK.blast_scope);
const ordered = (field) => Object.keys(DESCRIPTOR_RANK[field]).map((v) => (field === 'external' ? v === 'true' : v));
// THE FACTS a policy may test: closed, each with its vocabulary and where it is read. A rule naming
// any other fact, or a value outside its fact's vocabulary, refuses to load. `tier` and `tags` take
// their vocabulary from the yardstick (requirements.yaml `tiers:`, `tags:`), never restated here.
export const FACTS = {
  reversibility: { from: 'effect', values: () => ordered('reversibility') },
  external: { from: 'effect', values: () => [true, false] },
  gate_type: { from: 'effect', values: () => ordered('gate_type') },
  fail_mode: { from: 'effect', values: () => ordered('fail_mode') },
  telemetry: { from: 'effect', values: () => ordered('telemetry') },
  blast_scope: { from: 'effect', values: () => BLAST },
  halt: { from: 'effect', values: () => [true, false] },
  reach: { from: 'chain', values: () => BLAST },
  trigger: { from: 'chain', values: () => DIFFICULTY_WORDS },
  tier: { from: 'row', values: (y) => y.tiers },
  tags: { from: 'row', values: (y) => y.tags, list: true },
  floor: { from: 'row', values: () => [true, false] },
  halt_at: { from: 'row', values: () => [true, false] },
};
export const FACT_NAMES = Object.keys(FACTS);

// The engine's own rules: the monotone channels a policy does not hold. Stated once, like a
// policy's, and named on the item that one decided.
export const ENGINE_RULES = [
  { name: 'lane-judgment', says: 'a lane judged the gap more consequential than its facts give (judged_consequence), so the value is raised to its judgment; a judgment below the facts is refused' },
];
const ENGINE_RULE_NAMES = new Set(ENGINE_RULES.map((r) => r.name));
const RULE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ── the policy ───────────────────────────────────────────────────────────────
// A policy document checked: its schema and version, and every rule's name (kebab, unique, not an
// engine rule's), its `says`, its `at_least` (a value of the scale) and its `when` (facts of the
// closed list, each value in its fact's vocabulary). Returns the problems, empty when it holds.
export function checkPolicy(doc, yardstick) {
  const e = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['the policy must be a map: { schema, version, rules }'];
  if (doc.schema !== POLICY_SCHEMA) e.push(`schema must be ${POLICY_SCHEMA} (got ${JSON.stringify(doc.schema)})`);
  if (doc.version !== 1) e.push(`version must be 1 (got ${JSON.stringify(doc.version)})`);
  for (const k of Object.keys(doc)) if (!['schema', 'version', 'rules'].includes(k)) e.push(`unknown key "${k}" (schema, version, rules)`);
  if (!Array.isArray(doc.rules) || !doc.rules.length) return [...e, 'rules must list at least one rule'];
  const names = new Set();
  doc.rules.forEach((r, i) => {
    const at = `rules[${i}]${r && r.name ? ` (${r.name})` : ''}`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { e.push(`${at}: a rule is { name, says, when, at_least }`); return; }
    for (const k of Object.keys(r)) if (!['name', 'says', 'when', 'at_least'].includes(k)) e.push(`${at}: unknown key "${k}" (name, says, when, at_least)`);
    if (typeof r.name !== 'string' || !RULE_NAME.test(r.name)) e.push(`${at}: name must be kebab-case`);
    else if (names.has(r.name)) e.push(`${at}: name appears twice`);
    else if (ENGINE_RULE_NAMES.has(r.name)) e.push(`${at}: ${r.name} is the engine's own rule`);
    names.add(r.name);
    if (typeof r.says !== 'string' || !r.says.trim()) e.push(`${at}: says must state what the rule reads, in words`);
    if (!CONSEQUENCE.includes(r.at_least)) e.push(`${at}: at_least must be one of ${CONSEQUENCE.join(', ')} (got ${JSON.stringify(r.at_least)})`);
    if (!r.when || typeof r.when !== 'object' || Array.isArray(r.when)) { e.push(`${at}: when must map facts to the values it reads ({} fires on every gap)`); return; }
    for (const [fact, want] of Object.entries(r.when)) {
      const def = FACTS[fact];
      if (!def) { e.push(`${at}: when names "${fact}", which is not a fact the policy may read (${FACT_NAMES.join(', ')})`); continue; }
      const vocab = def.values(yardstick || {}) || [];
      const vals = Array.isArray(want) ? want : [want];
      if (!vals.length) e.push(`${at}: when.${fact} lists no value`);
      for (const v of vals) if (!vocab.includes(v)) e.push(`${at}: when.${fact}: ${JSON.stringify(v)} is not one of ${vocab.map(String).join(', ')}`);
    }
  });
  return e;
}

// Loads and checks a policy file; throws, naming every problem, when it does not hold (fail
// closed: a policy that cannot be read never reads as a default).
export function loadPolicy(file, yardstick) {
  if (!existsSync(file)) throw new Error(`consequence policy ${file} does not exist`);
  const text = readFileSync(file, 'utf8');
  let doc;
  try { doc = parseYaml(text); } catch (err) { throw new Error(`consequence policy ${file} does not parse: ${err.message}`); }
  const problems = checkPolicy(doc, yardstick);
  if (problems.length) throw new Error(`consequence policy ${file} refused:\n  ${problems.join('\n  ')}`);
  return { file, sha256: sha256(text), rules: doc.rules.map((r) => ({ name: r.name, says: r.says.trim(), when: r.when, at_least: r.at_least })) };
}
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// The policy a run reads: the file its run record names (`consequence_policy: { file, sha256 }`,
// map/SCHEMA.md §5a), held to the digest recorded with it, else the default.
export function policyOfRun(runDir, yardstick) {
  const m = runDir ? loadManifest(runDir) : null;
  const rec = m && m.consequence_policy;
  if (rec === undefined || rec === null) return { ...loadPolicy(DEFAULT_POLICY, yardstick), named: null };
  const problems = policyRecordProblems(rec);
  if (problems.length) throw new Error(`map/scanners.yaml consequence_policy: ${problems.join('; ')}`);
  const p = loadPolicy(resolve(rec.file), yardstick);
  if (p.sha256 !== rec.sha256) throw new Error(`consequence policy ${rec.file} changed since the run record named it (sha256 ${p.sha256}, recorded ${rec.sha256}): name it again with compile --consequence-policy`);
  return { ...p, named: rec.file };
}
export function policyRecordProblems(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['must be { file, sha256 }'];
  const e = [];
  if (typeof rec.file !== 'string' || !rec.file.trim()) e.push('file must name the policy file');
  if (typeof rec.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(rec.sha256)) e.push('sha256 must be the file\'s 64-hex digest');
  for (const k of Object.keys(rec)) if (!['file', 'sha256'].includes(k)) e.push(`unknown key "${k}" (file, sha256)`);
  return e;
}

// ── the facts ────────────────────────────────────────────────────────────────
// Where each finding sits in the measurement, for the row facts: the rows that list it, read
// first from those it bears on (unmet or mixed), then those met or not applicable with it listed,
// then those not measured (the order the sequence's tier reads, views/improve/sequence.mjs). At
// that level: the most urgent tier, the union of the rows' tags, and floor when any row is floor;
// and, from the rows it bears on (unmet or mixed) only, the most demanding `halt_at:` they carry.
function rowFactsOf(measurement, yardstick) {
  const tiers = yardstick.tiers;
  const reqOf = new Map((yardstick.requirements || []).map((d) => [d.id, d]));
  const level = new Map();
  for (const row of Array.isArray(measurement) ? measurement : []) {
    const d = reqOf.get(row.id);
    if (!d) continue;
    const by = row.status === 'unmet' || row.status === 'mixed' ? 0 : row.status === 'not-measured' ? 2 : 1;
    for (const id of Array.isArray(row.findings) ? row.findings : []) {
      const k = String(id);
      const was = level.get(k);
      if (!was || by < was.by) level.set(k, { by, rows: [d] });
      else if (by === was.by) was.rows.push(d);
    }
  }
  const out = new Map();
  for (const [id, { by, rows }] of level) {
    const t = Math.min(...rows.map((d) => tiers.indexOf(d.tier)).filter((i) => i >= 0));
    const tags = [...new Set(rows.flatMap((d) => (Array.isArray(d.tags) ? d.tags : [])))].sort();
    const bars = by === 0 ? rows.map((d) => d.halt_at).filter(Boolean).sort((a, b) => sevRank(b) - sevRank(a)) : [];
    out.set(id, { tier: Number.isFinite(t) ? tiers[t] : null, tags, floor: tags.includes('floor'), haltAt: bars[0] || null, rows: rows.map((d) => d.id).sort() });
  }
  return out;
}

const norm = (v) => (v === undefined || v === null ? null : String(v).trim().toLowerCase());
const asFact = (field, v) => (v === null ? null : field === 'external' ? v === true || v === 'true' : v);
// riskier first, by variance's per-field order (lower rank is riskier)
const byRisk = (field) => (a, b) => (DESCRIPTOR_RANK[field][String(a)] ?? 99) - (DESCRIPTOR_RANK[field][String(b)] ?? 99);

// The run's contested descriptors: per channel key (the candidate its triage maps, else the slug,
// as map/variance.mjs keys one), per field, every value the run's effect findings on it record,
// and every value the sweeps of each named set record on it. One value is no contest.
function contestIndex(findings, keys, sweepContest) {
  const keyOf = (f) => norm((f.id && keys && keys.get(f.id)) || (f.effect && f.effect.channel));
  const byKey = new Map();
  for (const f of findings) {
    if (!f || !f.effect || typeof f.effect !== 'object') continue;
    const k = keyOf(f);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, Object.fromEntries(DESCRIPTOR_FIELDS.map((x) => [x, new Map()])));
    const m = byKey.get(k);
    for (const x of DESCRIPTOR_FIELDS) { const v = norm(f.effect[x]); if (v !== null) { if (!m[x].has(v)) m[x].set(v, new Set()); m[x].get(v).add('run'); } }
  }
  for (const s of sweepContest || []) for (const [k, fields] of s.byKey) {
    if (!byKey.has(k)) continue;   // a channel this run does not carry contests nothing here
    const m = byKey.get(k);
    for (const [x, vals] of Object.entries(fields)) for (const v of vals) { if (!m[x].has(v)) m[x].set(v, new Set()); m[x].get(v).add(`sweep set ${s.set}`); }
  }
  return { keyOf, byKey };
}

// One effect's descriptors as the policy reads them: each field's own value, or the riskier value
// where the run or a named sweep set contests it, with the contest recorded.
function readEffect(e, contest) {
  const k = contest.keyOf(e);
  const m = k ? contest.byKey.get(k) : null;
  const facts = {};
  const contested = [];
  for (const x of DESCRIPTOR_FIELDS) {
    const own = norm(e.effect[x]);
    const seen = m ? [...m[x].keys()] : [];
    const all = [...new Set([...(own === null ? [] : [own]), ...seen])].sort(byRisk(x));
    if (all.length > 1 && !(x === 'fail_mode' && own === null)) {
      const where = [...new Set(all.flatMap((v) => [...((m && m[x].get(v)) || [])]))].sort();
      contested.push({ fact: x, values: all.map((v) => asFact(x, v)), read: asFact(x, all[0]), where });
      facts[x] = asFact(x, all[0]);
    } else facts[x] = asFact(x, own);
  }
  facts.halt = isHalt({ ...e.effect, ...facts });
  return { facts, contested };
}

// The index the sequence builds once per run: every finding by id, the effects each gap touches
// through the graph (an effect it `reaches`, an effect `explained_by` it), the live chain that
// carries each finding (its entry, path, sinks or cuts), the row facts, and the contests.
/** @param {{ decided: any[], measurement: any, yardstick: any, context?: any }} args */
export function consequenceIndex({ decided, measurement, yardstick, context = {} }) {
  const findings = decided.map((p) => p.f);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const isEffect = (f) => !!(f && f.effect && typeof f.effect === 'object');
  const touchedBy = new Map();
  const touch = (gapId, effId) => { if (!touchedBy.has(gapId)) touchedBy.set(gapId, new Set()); touchedBy.get(gapId).add(effId); };
  for (const f of findings) {
    for (const r of Array.isArray(f.reaches) ? f.reaches : []) if (isEffect(byId.get(r))) touch(f.id, r);
    if (isEffect(f)) for (const x of Array.isArray(f.explained_by) ? f.explained_by : []) touch(x, f.id);
  }
  const onChain = new Map();
  for (const c of buildChains(findings).live) {   // ranked widest reach, then easiest, first
    const ids = [c.entry.id, ...c.path, ...c.sinks.map((s) => s.id), ...c.cuts.map((x) => x.id)];
    for (const id of ids) if (!onChain.has(id)) onChain.set(id, { reach: c.blast, trigger: c.difficulty, entry: c.entry.id });
  }
  const policy = context.policy || { ...loadPolicy(DEFAULT_POLICY, yardstick), named: null };
  return {
    byId, touchedBy, onChain, policy, yardstick,
    rows: rowFactsOf(measurement, yardstick),
    contest: contestIndex(findings, context.keys, context.sweepContest),
  };
}

// The fact sets one gap is read under: one per effect it is or touches (an effect finding is its
// own), else one with no effect. Each carries every fact of the closed list, null where the run
// could not read it.
function factSets(f, idx) {
  const row = idx.rows.get(String(f.id)) || { tier: null, tags: [], floor: false, haltAt: null, rows: [] };
  // halt_at: the gap reaches the halt its row names (yardstick/requirements.yaml `halt_at:`), read
  // exactly as the sequence's halt clause reads it (views/improve/sequence.mjs): a gap the row bears
  // on, its own confidence confirmed, at or above the row's bar. The one fact that reads a severity,
  // because the row names the bar on the severity scale: the requirement, not the tool, says what
  // is a halt. Null when the row it bears on names no halt.
  const haltAt = row.haltAt ? (f.confidence === 'confirmed' && sevRank(f.severity) <= sevRank(row.haltAt)) : null;
  const chain = idx.onChain.get(f.id) || null;
  const effects = f.effect && typeof f.effect === 'object' ? [f] : [...(idx.touchedBy.get(f.id) || [])].sort().map((id) => idx.byId.get(id));
  const base = (eff) => ({
    reach: chain ? chain.reach : null,
    trigger: chain ? chain.trigger : (triggerOf(eff) || triggerOf(f)),
    tier: row.tier, tags: row.tags, floor: row.floor, halt_at: haltAt,
  });
  if (!effects.length) return [{ effect: null, facts: { ...Object.fromEntries(DESCRIPTOR_FIELDS.map((x) => [x, null])), halt: false, ...base(null) }, contested: [] }];
  return effects.map((e) => {
    const { facts, contested } = readEffect(e, idx.contest);
    return { effect: e.id === f.id ? null : e.id, facts: { ...facts, ...base(e) }, contested };
  });
}

const matches = (when, facts) => Object.entries(when).every(([fact, want]) => {
  const got = facts[fact];
  const vals = Array.isArray(want) ? want : [want];
  if (FACTS[fact].list) return Array.isArray(got) && got.some((g) => vals.includes(g));
  return got !== null && got !== undefined && vals.includes(got);
});

// The policy applied to one fact set: the highest value a rule fires at, and the first rule down
// the file at that value; null when none fires.
function applyPolicy(policy, facts) {
  let best = null;
  for (const r of policy.rules) if (matches(r.when, facts) && (!best || higher(r.at_least, best.at_least))) best = r;
  return best ? { value: best.at_least, rule: best.name } : null;
}

// One gap's consequence: { value, rule, finding, facts, effect?, contested?, judgment? }, or, when no
// rule of the policy fires on any of its fact sets, { value: 'unvalued', rule: null, reason, finding,
// facts }: never a value of the scale without the rule that gave it. `p` is a projected finding
// ({ f, source }); `idx` consequenceIndex's. The source is never read: renaming every scanner moves
// nothing.
export function consequenceOf(p, idx) {
  const f = p.f;
  let out = /** @type {any} */ (null);
  for (const s of factSets(f, idx)) {
    const hit = applyPolicy(idx.policy, s.facts);
    if (!hit) { if (!out) out = /** @type {any} */ ({ value: UNVALUED, rule: null, reason: unvaluedReason(idx.policy), finding: f.id, facts: s.facts, ...(s.effect ? { effect: s.effect } : {}), ...(s.contested.length ? { contested: s.contested } : {}) }); continue; }
    if (!out || out.value === UNVALUED || higher(hit.value, out.value)) {
      out = /** @type {any} */ ({ value: hit.value, rule: hit.rule, finding: f.id, facts: s.facts });
      if (s.effect) out.effect = s.effect;
      if (s.contested.length) out.contested = s.contested;
    }
  }
  const j = f.judged_consequence;
  if (j && typeof j === 'object' && CONSEQUENCE.includes(j.value)) {
    const judgment = { value: j.value, because: String(j.because || '').trim() };
    if (higher(j.value, out.value)) {
      // a judgment raises an unvalued gap too: the lane says what the facts the run read do not
      if (out.value === UNVALUED) { const { reason, ...rest } = out; void reason; out = { ...rest, value: j.value, rule: 'lane-judgment', judgment: { ...judgment, applied: true, facts_value: UNVALUED, facts_rule: null } }; return out; }
      out = { ...out, value: j.value, rule: 'lane-judgment', judgment: { ...judgment, applied: true, facts_value: out.value, facts_rule: out.rule } };
    } else out.judgment = { ...judgment, applied: false, refused: j.value === out.value ? 'equal to what the facts give' : 'below what the facts give: a judgment may raise consequence, never lower it' };
  }
  return out;
}

// Why a gap reads unvalued: no rule of the policy fires on what the run could read of it.
const unvaluedReason = (policy) => `no fact on the closed list that a rule of ${policy.named || 'the default policy'} reads applies: it bears on no requirement whose tier or tags a rule names, and touches no effect, chain or halt a rule reads`;

// The most consequential of several, the first among equals (callers pass them in the key's order).
export const highest = (cs) => cs.reduce((best, c) => (!best || higher(c.value, best.value) ? c : best), null);

// ── the run's context ────────────────────────────────────────────────────────
// What the rules read beyond the findings: the policy the run record names (else the default), the
// run's channel keys (its effect triage), and per named sweep set, every descriptor value its
// sweeps part on per channel and per listed candidate (map/variance.mjs).
/** @param {string} runDir @param {{ sweepSets?: string[], yardstick?: any }} [opts] */
export function loadConsequenceContext(runDir, { sweepSets = [], yardstick } = {}) {
  let keys = null;
  try { keys = channelKeys(runDir); } catch { keys = null; }
  const policy = policyOfRun(runDir, yardstick);
  return { policy, keys, sweepContest: sweepSets.map(sweepContestOf) };
}

function sweepContestOf(dir) {
  const { runDirs } = loadSweepSet(dir);
  const byKey = new Map();
  const add = (k, fields) => {
    const key = norm(k);
    if (!byKey.has(key)) byKey.set(key, {});
    const m = byKey.get(key);
    for (const { field, values } of fields) { m[field] = m[field] || new Set(); for (const { value } of values) if (value !== null) m[field].add(norm(value)); }
  };
  for (const d of computeDescriptorAgreement(runDirs).divergences) add(d.channel, d.fields);
  let cand = null;
  try { cand = computeCandidateAgreement(runDirs); } catch { cand = null; }
  for (const d of (cand && cand.divergences) || []) add(d.candidate, d.fields);
  const set = String(dir).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  // a channel keyed by several candidates (`a | b`) is contested on each of them
  for (const [k, v] of [...byKey]) if (k.includes(' | ')) for (const part of k.split(' | ')) if (!byKey.has(part)) byKey.set(part, v);
  return { set, byKey };
}

// ── the words ────────────────────────────────────────────────────────────────
// The short phrase an item renders beside its confidence (START-HERE, REMEDIATION).
export function consequencePhrase(c) {
  if (!c) return '';
  if (c.value === UNVALUED) return `consequence not valued: ${c.reason}`;
  const over = c.rule === 'lane-judgment' && c.judgment ? `lane judgment over ${c.judgment.facts_rule || 'no rule: not valued by the facts'}` : c.rule;
  const contested = (c.contested || []).map((x) => x.fact);
  return `consequence ${c.value} (${over}${contested.length ? `; ${contested.join(', ')} contested` : ''})`;
}
// The facts an item read, in words, the non-null ones in the closed list's order.
export function factsPhrase(c) {
  if (!c || !c.facts) return '';
  return FACT_NAMES.filter((k) => c.facts[k] !== null && c.facts[k] !== undefined && !(Array.isArray(c.facts[k]) && !c.facts[k].length))
    .map((k) => `${k} ${Array.isArray(c.facts[k]) ? c.facts[k].join('+') : c.facts[k]}`).join(', ');
}
