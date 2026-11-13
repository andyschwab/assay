// confidence.mjs — how much assay knows about a gap: the one place the value is derived (#319).
//
// Every fix-sequence item records its confidence on a closed scale, and every value is assigned
// by a rule stated once, here (RULES), never by a tool's severity label. A rule fires on facts:
// the kind of evidence the finding's source produces (its adapter's `confidence.evidence`, read
// off the adapter, never off the scanner's name: CLAUDE.md rule 7), the finding's own fields, the
// run record (map/scanners.yaml), the deployment signals the repo census already reads, and a
// pair the adapter itself declares (a step that could not run, a rule that misfires in context).
// No rule, no value: confidenceOf throws, and the handoff halts rather than write an item that
// says nothing about how much is known (CLAUDE.md rule 3).
//
// The scale (map/scanners/CONTRACT.md §3, views/README.md "How much assay knows"):
//   confirmed        a deterministic instrument's result, or a cited finding re-resolved at the
//                    head whose own `confidence:` is `confirmed`;
//   judged           a reviewer's or a lane's reading: a cited finding whose own confidence is
//                    `plausible` or `unverified` (or cites no file:line), or any finding of a
//                    source whose evidence is judgment (a lane's own reading, its owner items);
//                    the measured repeatability of that source rides beside it where a sweep set
//                    the operator named measured it, and nothing where none did;
//   absent-evidence  an owner's evidence file the instrument looked for and did not find
//                    (`evidence_absent: true`, map/SCHEMA.md §1);
//   not-measured     a step or check that could not run: its source recorded skipped or failed,
//                    or a step its adapter declares could not have run on the facts its row
//                    carries (`confidence.not_measured`); never a failure;
//   known-misfire    a rule-in-context pair the adapter declares as not applying, with the reason
//                    (`confidence.misfires`). The finding stays visible; a misfire never reads met.
//
// RULES are tried in the order below, and the first that fires decides: what the adapter declares
// about this exact rule in this exact context (a misfire, a step that could not run) is more than
// the general kind of its source's evidence, and a source that did not run decides nothing at all.
// An item takes its worst gap's confidence (views/improve/sequence.mjs, the gap KEY places first);
// among gaps tied at that worst key, the strongest value (STRENGTH) applies.
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { rawPath } from '../lib/run-layout.mjs';
import { loadManifest } from './project.mjs';
import { loadSweepSet, computeRequirementAgreement, computeCandidateAgreement } from './variance.mjs';

export const CONFIDENCE = ['confirmed', 'judged', 'absent-evidence', 'not-measured', 'known-misfire'];
// strongest first: how much assay knows, from a measurement that holds to none it could make
const STRENGTH = ['confirmed', 'judged', 'absent-evidence', 'not-measured', 'known-misfire'];
// the kinds of evidence an adapter declares its source produces (`confidence.evidence`)
const EVIDENCE_KINDS = ['deterministic', 'cited', 'judged'];
// the facts a declared not-measured pair may test on a row's `detail:` (an equality, or one of these)
const DETAIL_TESTS = ['at_most', 'at_least', 'present'];

const conf = (a) => (a && a.confidence && typeof a.confidence === 'object') ? a.confidence : {};
const list = (v) => (Array.isArray(v) ? v : []);
// a citation of the target's tree with a line: `path:N` or `path:a-b`, never a directory's `./:1`
// or a commit (map/SCHEMA.md §1, Evidence)
const FILE_LINE = /^(?!commit:)(?!\.?\/?:)[^:]*[^/:]:\d+(-\d+)?$/;
const citesFileLine = (f) => list(f.evidence).some((e) => FILE_LINE.test(String(e)));
const re = (s) => new RegExp(String(s), 'i');

function detailMatches(when, detail) {
  const d = detail && typeof detail === 'object' ? detail : {};
  for (const [k, want] of Object.entries(when || {})) {
    const got = d[k];
    if (want && typeof want === 'object') {
      if ('present' in want && (got !== undefined && got !== null && got !== '') !== (want.present === true)) return false;
      if ('at_most' in want && !(typeof got === 'number' && got <= want.at_most)) return false;
      if ('at_least' in want && !(typeof got === 'number' && got >= want.at_least)) return false;
    } else if (got !== want) return false;
  }
  return true;
}
// the deployment-signal paths' file names, lowercased (the census's own reading, loadConfidenceContext)
const deployedOn = (ctx) => (Array.isArray(ctx.deployment) ? ctx.deployment : []).map((s) => basename(String(s.path || '')).toLowerCase());

// THE RULES: one per way a value is assigned, each stated once. `when(p, adapter, ctx)` returns
// null when the rule does not fire, else { reason? }: the reason a misfire or a not-measured pair
// carries, read from the adapter or the run record, never written here.
export const RULES = [
  { name: 'adapter-declared-misfire', value: 'known-misfire',
    says: 'its adapter declares this rule as not applying in this context (confidence.misfires), on a signal the run already holds',
    when(p, a, ctx) {
      const names = deployedOn(ctx);
      for (const m of list(conf(a).misfires)) {
        if (String(p.f.native_category) !== String(m.category)) continue;
        if (m.native_id && !re(m.native_id).test(String(p.f.native_id || ''))) continue;
        // read only off the census's deployment signals: with none read, the rule stays applicable
        if (!Array.isArray(ctx.deployment)) continue;
        if (!names.some((n) => list(m.deployed_on).some((x) => re(x).test(n)))) continue;
        if (names.some((n) => list(m.unless_deployed_on).some((x) => re(x).test(n)))) continue;
        return { reason: String(m.reason), id: String(m.id) };
      }
      return null;
    } },
  { name: 'source-not-run', value: 'not-measured',
    says: 'the run record says its source was skipped or failed, so what it holds was not measured',
    when(p, a, ctx) {
      const row = ctx.manifest && ctx.manifest.scanners && ctx.manifest.scanners[p.source];
      return row && (row.status === 'skipped' || row.status === 'failed') ? { reason: `${row.status}: ${row.reason || 'no reason recorded'}` } : null;
    } },
  { name: 'adapter-declared-not-measured', value: 'not-measured',
    says: 'its adapter declares that a row with these facts is a step that could not run (confidence.not_measured)',
    when(p, a) {
      for (const n of list(conf(a).not_measured)) {
        if (String(p.f.native_category) !== String(n.category)) continue;
        if (!detailMatches(n.when, p.f.detail)) continue;
        return { reason: String(n.reason), id: String(n.id) };
      }
      return null;
    } },
  { name: 'evidence-file-absent', value: 'absent-evidence',
    says: 'the gap is an owner\'s evidence file the instrument looked for and did not find (evidence_absent)',
    when: (p) => (p.f.evidence_absent === true ? {} : null) },
  { name: 'deterministic-instrument', value: 'confirmed',
    says: 'its source is a deterministic instrument: the same tree reads the same result',
    when: (p, a) => (conf(a).evidence === 'deterministic' ? {} : null) },
  { name: 'cited-and-confirmed', value: 'confirmed',
    says: 'its source cites file:line evidence re-resolved at the head, and the finding\'s own confidence is confirmed',
    when: (p, a) => (conf(a).evidence === 'cited' && p.f.confidence === 'confirmed' && citesFileLine(p.f) ? {} : null) },
  { name: 'cited-not-confirmed', value: 'judged',
    says: 'its source cites evidence, but the finding\'s own confidence is plausible or unverified, or it cites no file:line',
    when: (p, a) => (conf(a).evidence === 'cited' ? {} : null) },
  { name: 'judged-source', value: 'judged',
    says: 'its source is a lane\'s judgment: a reading of practice, its owner items included',
    when: (p, a) => (conf(a).evidence === 'judged' ? {} : null) },
];
const RULE_BY_NAME = new Map(RULES.map((r) => [r.name, r]));
export const ruleNamed = (name) => RULE_BY_NAME.get(name) || null;

// One finding's confidence: { value, rule, reason? }. `p` is a projected finding ({ f, source }),
// `ctx` loadConfidenceContext's ({ manifest, deployment, sweeps }, each optional). Throws when no
// rule fires: a value without its rule is never written.
export function confidenceOf(p, adapters, ctx = {}) {
  const a = adapters ? adapters[p.source] : undefined;
  for (const r of RULES) {
    const hit = r.when(p, a, ctx);
    if (!hit) continue;
    const out = { value: r.value, rule: r.name };
    if (hit.reason) out.reason = hit.reason;
    if (hit.id) out.declared = hit.id;
    if (r.value === 'judged') { const rep = repeatabilityOf(p.source, ctx.sweeps); if (rep.length) out.repeatability = rep; }
    return out;
  }
  throw new Error(`no confidence rule applies to ${p.f.id} (source ${p.source}): its adapter must declare confidence.evidence (${EVIDENCE_KINDS.join(' | ')}, map/scanners/CONTRACT.md §3)`);
}

// The strongest of several values (STRENGTH order).
export const strongest = (cs) => cs.slice().sort((x, y) => STRENGTH.indexOf(x.value) - STRENGTH.indexOf(y.value))[0];

// The measured repeatability of a source, from the sweep sets the operator named for this run:
// one entry per set whose every sweep ran that source, with the figures the set measures (#257,
// #312). A figure the set could not take (no requirement decided, no candidate compared) is null,
// never a number. No set, no entry: a figure is never invented.
function repeatabilityOf(source, sweeps) {
  return list(sweeps).filter((s) => list(s.sources).includes(source)).map((s) => ({
    set: s.set, sweeps: s.sweeps, requirement_agreement: s.requirement_agreement, candidate_agreement: s.candidate_agreement,
  }));
}

// A sweep set measured for confidence: which sources every sweep ran, and the requirement and
// per-candidate descriptor agreement map/variance.mjs measures over it.
export function measureSweepSet(dir) {
  const { runDirs } = loadSweepSet(dir);
  const ran = runDirs.map((d) => {
    const m = loadManifest(d);
    return new Set(Object.entries((m && m.scanners) || {}).filter(([, r]) => r && r.status === 'ran').map(([k]) => k));
  });
  const sources = [...ran[0]].filter((s) => ran.every((x) => x.has(s))).sort();
  const q = computeRequirementAgreement(runDirs);
  const c = computeCandidateAgreement(runDirs);
  return {
    set: basename(dir.replace(/[\\/]+$/, '')), sweeps: runDirs.length, sources,
    requirement_agreement: q.decided ? { agree: q.agree, of: q.decided, pct: q.pct } : null,
    candidate_agreement: c && c.candidates && c.candidates.compared ? { agree: c.allFields.agree, of: c.allFields.of, pct: c.allFields.pct } : null,
  };
}

// The run's facts the rules read: its run record, the deployment signals the repo census (the
// core's own instrument, map/repo-census.mjs) recorded in its archived report, and the sweep sets
// named for it. A census that did not run leaves `deployment` null: no misfire is read without it.
export function loadConfidenceContext(runDir, { sweepSets = [] } = {}) {
  const manifest = loadManifest(runDir);
  let deployment = null;
  const census = rawPath(runDir, 'repo-census.json');
  if (existsSync(census)) {
    const rep = JSON.parse(readFileSync(census, 'utf8'));
    if (rep && rep.deployment && Array.isArray(rep.deployment.signals)) deployment = rep.deployment.signals;
  }
  return { manifest, deployment, sweeps: sweepSets.map(measureSweepSet) };
}

// An adapter's `confidence:` block, checked (the harness and the handoff call it): its evidence
// kind is one of EVIDENCE_KINDS, and every declared pair names its id, category and reason, with
// regexes that compile and detail tests from the closed set.
export function checkAdapterConfidence(adapter) {
  const e = [];
  const c = adapter && adapter.confidence;
  const who = `adapters/${adapter && adapter.scanner}.yaml confidence`;
  if (!c || typeof c !== 'object') return [`${who}: missing; declare evidence: ${EVIDENCE_KINDS.join(' | ')}`];
  if (!EVIDENCE_KINDS.includes(c.evidence)) e.push(`${who}.evidence must be one of ${EVIDENCE_KINDS.join(', ')} (got ${JSON.stringify(c.evidence)})`);
  for (const k of Object.keys(c)) if (!['evidence', 'misfires', 'not_measured'].includes(k)) e.push(`${who}: unknown key "${k}" (evidence, misfires, not_measured)`);
  const ids = new Set();
  const pair = (k, x, i) => {
    const at = `${who}.${k}[${i}]`;
    for (const f of ['id', 'category', 'reason']) if (!(x && typeof x[f] === 'string' && x[f].trim())) e.push(`${at}: ${f} must be a non-empty string`);
    if (x && x.id) { if (ids.has(x.id)) e.push(`${at}: id ${x.id} appears twice`); ids.add(x.id); }
    if (x && x.category && adapter.map && !(x.category in adapter.map)) e.push(`${at}: category ${x.category} is not one of this adapter's map: categories`);
    return at;
  };
  list(c.misfires).forEach((m, i) => {
    const at = pair('misfires', m, i);
    if (!list(m.deployed_on).length) e.push(`${at}: deployed_on must list the deployment signals (file names) on which the rule does not apply`);
    for (const x of [m.native_id, ...list(m.deployed_on), ...list(m.unless_deployed_on)].filter((v) => v !== undefined)) { try { re(x); } catch (err) { e.push(`${at}: ${JSON.stringify(x)} is not a regex: ${err.message}`); } }
  });
  list(c.not_measured).forEach((n, i) => {
    const at = pair('not_measured', n, i);
    if (!n.when || typeof n.when !== 'object' || !Object.keys(n.when).length) e.push(`${at}: when must name the row's detail facts it reads`);
    else for (const [k, v] of Object.entries(n.when)) if (v && typeof v === 'object' && !Object.keys(v).every((t) => DETAIL_TESTS.includes(t))) e.push(`${at}: when.${k} tests only ${DETAIL_TESTS.join(', ')}`);
  });
  return e;
}

// The short phrase an item renders (START-HERE, REMEDIATION): the value in words, and for a
// judged value its measured repeatability where one was measured.
export function confidencePhrase(c) {
  if (!c) return '';
  const words = { 'confirmed': 'confirmed', 'judged': 'judged', 'absent-evidence': 'absent evidence', 'not-measured': 'not measured', 'known-misfire': 'known misfire' }[c.value];
  if (c.value === 'judged') {
    const r = list(c.repeatability).find((x) => x.requirement_agreement);
    return r ? `${words}; its source agreed on ${r.requirement_agreement.agree} of ${r.requirement_agreement.of} requirements across ${r.sweeps} sweeps (${r.set})` : words;
  }
  if (c.value === 'known-misfire' || c.value === 'not-measured') return `${words}${c.declared ? ` (${c.declared})` : c.reason ? ` (${c.reason})` : ''}`;
  return words;
}
