#!/usr/bin/env node
// variance.mjs — calibration-mode repeatability measurement.
//
// Given N blind sweeps of the SAME target, measure how repeatable the base observation is.
// It clusters findings across sweeps into "facts" and reports what every sweep caught (the
// stable core), what only some caught (the variance — the residual inference-dependence),
// and the union (the coverage ceiling a single run leaves on the table).
//
// A "fact" = a connected component under: two findings (from DIFFERENT sweeps) are the same
// fact iff they share a dimension AND at least one IDENTITY TOKEN. An identity token is the
// specific thing the finding is about: a full evidence PATH (not just its basename), or an
// explicit item key — an effect `channel`, a `label`, or a `slug`. subject_type is NOT part
// of identity: it is a descriptor a run chooses, and a whole census can flip it
// (cal5 tagged its gates census `contract`, cal6 tagged it `control`) — keying on it read
// identical facts as 0% agreement. Matching on the full path (not basename) is what keeps two
// enumerated items apart when they share a filename (every skill cites a file named SKILL.md).
// The union-find is many-to-one by construction, so a folded finding that shares a path with
// two granular findings joins all three rather than manufacturing variance. Deliberately
// conservative otherwise: a fact recorded against genuinely different evidence with no shared
// item key shows up honestly as variance, not a false match. History: before 2026-08-05 the
// key was (dimension, subject_type, evidence BASENAME); the census-augmented cal5/cal6 pair
// proved that key blind to its own best result (35% where the facts agreed at 73%).
//
// THREE measures, because a run has three layers that can drift independently:
//
//   1. FACT PRESENCE (computeVariance) — did every sweep record a fact about this thing?
//      Identity is (dimension + a shared identity token). subject_type and the effect
//      descriptors are deliberately NOT part of it: they are judgments a run makes about
//      a fact, and keying on them reads identical facts as disagreement.
//
//   2. DESCRIPTOR AGREEMENT (descriptorAgreement) — given that both sweeps recorded the
//      same effect channel, did they JUDGE it the same way? This is the measure that
//      matters most, because it is the layer every shipped number is computed from:
//      maturity coverage (gate_type/fail_mode/telemetry), the halt inventory flags
//      (reversibility/external/gate_type), the chain ranking (blast_scope/preconditions)
//      and the gate. Measure 1 can read high while measure 2 reads low — two sweeps
//      agreeing on WHAT exists and disagreeing on what it MEANS — and then the verdict is
//      not repeatable even though the base looks like it is. Measured in the field,
//      off-repo, before tests/sweeps/ existed, on a cross-run pair (both canon-pinned,
//      so channel identity was solved): 26 shared channels, descriptors identical on 8
//      (31%). The figure the tree reproduces is a committed sweep set's (THE GATE below):
//      the newest blind set over this repository (tests/sweeps/assay-2026-11-12c, three
//      fresh contexts at 2b247c0) read 13% fact presence, 40% descriptor agreement per
//      listed candidate and per channel, and 92% requirement agreement.
//      It is taken two ways (#312). PER LISTED CANDIDATE (candidateAgreement) is the primary
//      figure: each member of a run's enumerated effect population that its triage maps to an
//      effect finding takes that finding's descriptors, and a candidate every sweep maps is
//      compared, however each lane grouped candidates into findings; scope disagreements and
//      effect findings no candidate maps to are counted apart. PER CHANNEL (descriptorAgreement)
//      is the figure it replaces, kept beside it for one release so committed sets stay
//      comparable: a channel there is the sorted candidate set one finding covers, so lanes that
//      group the same candidates differently read as channels each seen once.
//
//   3. REQUIREMENT AGREEMENT (requirementAgreement) — given the same findings bases, did
//      every sweep reach the same verdict on each requirement? Each sweep is measured
//      against the yardstick in process (no owner packet: only what the runs decided); a
//      requirement counts when any sweep decides it (anything but not-measured), and agrees
//      when its status is identical in all of them. This is the layer a reader acts on:
//      two sweeps can share most facts and still flip a safety row between met and unmet,
//      when one run never recorded the effect the other judged (#257, #258).
//
// The DIRECTION of divergence separates the two explanations. If every divergence moves
// the same way, that is consistent with the TARGET having changed between runs. If they
// move both ways at once, that is the signature of JUDGMENT drift, and a cross-run
// coverage delta computed over them is not a trend. `bothWays` computes it.
//
// THE GATE. A committed SWEEP SET (tests/sweeps/<set>/SWEEP.yaml, tests/sweeps/README.md)
// names its sweeps and the threshold each measure must reach, or declares a measure it cannot take
// not measured, with the reason; `--set` measures the set and exits 1 when any measure is below its
// threshold or a declared one is taken after all (2 when the set is malformed, a threshold of 0
// among them), so a
// repeatability claim is a number the tree reproduces and the harness checks, not prose.
// `--min-facts N` / `--min-candidates N` / `--min-descriptors N` / `--min-requirements N` gate an ad-hoc set of run dirs the same way.
//
// Zero-dep. Usage: node assay.mjs variance <run-dir> <run-dir> [<run-dir> ...]
//                  node assay.mjs variance --set <sweep-set-dir> [--json]

import { basename, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parseYaml } from '../lib/yaml-min.mjs';
// The shared fail-closed loader: a sweep file this reader cannot parse HALTS the
// measurement instead of being skipped — a silently dropped file would be
// mis-read as variance, corrupting the very number this tool exists to produce.
import { loadFindings, loadManifest, modelOf, PRACTICE_REVIEW_PASSES } from './project.mjs';
import { isMain } from './doctrine.mjs';
import { projectRun, loadYardstick } from '../yardstick/measure.mjs';
import { channelKeys, loadChannelFiles } from './effect-triage.mjs';
import { closure } from './triage.mjs';
import { CHECKLIST_KEYS, gateTypeFrom, reversibilityFrom, answerValue } from './effect-answers.mjs';

// A channel's identity (#298): an effect finding the run's map/effect-triage.yaml maps a candidate to
// is keyed by that candidate (map/effect-triage.mjs candidateKeysOf), so two lanes' spellings of one
// channel read as one; a finding no candidate maps to keeps its slug. keys: Map<finding id, key>, or
// none (every finding keeps its slug).
const channelOf = (f, keys) => (f && f.id && keys && keys.get(f.id)) || (f.effect && f.effect.channel) || f.channel;

// identity tokens: the specific thing a finding is about — full evidence PATH (not basename)
// plus any explicit item key (effect channel, label, slug). subject_type is NOT included.
const idTokens = (f, keys) => {
  const t = new Set();
  for (const e of (Array.isArray(f.evidence) ? f.evidence : [])) t.add('p:' + String(e).split(':')[0]);
  const chan = channelOf(f, keys);
  if (chan) t.add('c:' + String(chan).toLowerCase().trim());
  if (f.label) t.add('l:' + String(f.label).toLowerCase().replace(/\s+/g, ' ').trim());
  if (f.slug) t.add('s:' + String(f.slug).toLowerCase().trim());
  return t;
};

// A finding's clustering bucket. practice-review findings carry `dimension`; scanner and
// instrument rows carry `source` + `native_category` and NO dimension (SCHEMA §2a), so
// they group by source instead of collapsing into one undefined bucket (which also crashed
// the sort). Keeping them separate per source is the honest read: two sources are never the
// same fact, and an instrument's rows are deterministic by construction rather than a
// measure of analyst repeatability.
export const groupKey = (f) => f.dimension || (f.source ? `source:${f.source}` : 'ungrouped');

// computeVariance(runDirs) → structured repeatability result (pure; no I/O beyond loadFindings).
// A fact = a connected component under: same dimension + a shared identity token, matched only
// ACROSS sweeps. Deterministic; used by the CLI and pinned by tests/blocks/model-of-record.mjs
// and tests/blocks/variance-mixed-base.mjs.
export function computeVariance(runDirs) {
  return varianceFromSweeps(runDirs.map((d) => loadFindings(d)), runDirs.map((d) => basename(d)), runDirs.map((d) => modelResolver(loadManifest(d))), runDirs.map((d) => channelKeys(d)));
}

// A sweep's model of record per clustering bucket (SCHEMA.md §5a): a dimension reads
// its practice-review pass's model (else the row's), a `source:<id>` bucket that scanner's.
// null where the run record names none — reported as such, never guessed.
const PASS_OF_DIMENSION = Object.fromEntries(Object.entries(PRACTICE_REVIEW_PASSES).map(([p, d]) => [d, p]));
function modelResolver(manifest) {
  return (g) => (String(g).startsWith('source:') ? modelOf(manifest, g.slice('source:'.length)) : modelOf(manifest, 'practice-review', PASS_OF_DIMENSION[g]));
}

// The pure half — sweeps is an array of FINDINGS ARRAYS, so the measure is testable
// without fixtures (same split as descriptorAgreement below). models (optional): one
// resolver per sweep, bucket → model id | null, for the per-model-pair agreement. keys (optional):
// one Map<finding id, channel key> per sweep, the run's triaged candidates (#298).
export function varianceFromSweeps(sweeps, names, models, keys) {
  const N = sweeps.length;
  const nodes = [];
  sweeps.forEach((findings, ri) => { for (const f of findings || []) nodes.push({ run: ri, dim: groupKey(f), subj: f.subject_type || '-', ev: idTokens(f, keys && keys[ri]), obs: (f.observation || '').trim().replace(/\s+/g, ' ').slice(0, 90) }); });

  const parent = nodes.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.run === b.run) continue;                 // only match ACROSS sweeps — never collapse distinct within-run findings
    if (a.dim !== b.dim) continue;                 // dimension is part of identity; subject_type is NOT (it drifts)
    for (const e of a.ev) if (b.ev.has(e)) { union(i, j); break; }
  }

  const facts = new Map();
  nodes.forEach((n, i) => { const r = find(i); if (!facts.has(r)) facts.set(r, { dim: n.dim, subj: n.subj, runs: new Set(), sample: n.obs }); const fct = facts.get(r); fct.runs.add(n.run); if (n.run === 0) fct.sample = n.obs; });

  const factList = [...facts.values()];
  const union_ = factList.length;
  const core = factList.filter((f) => f.runs.size === N).length;
  const byDimension = {};
  for (const d of [...new Set(factList.map((f) => f.dim))].sort()) {
    const fs = factList.filter((f) => f.dim === d);
    const c = fs.filter((f) => f.runs.size === N).length;
    byDimension[d] = { core: c, union: fs.length, pct: Math.round(100 * c / fs.length) };
  }
  // agreement per MODEL PAIR: for every pair of sweeps, a fact either caught agrees when
  // both caught it; keyed by the two models of record that wrote its bucket in those
  // sweeps, so a model change reads as its own row rather than blended into the whole.
  const byModelPair = {};
  if (models) {
    const NONE = '(no model recorded)';
    for (const fct of factList) for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      if (!fct.runs.has(i) && !fct.runs.has(j)) continue;
      const key = [models[i](fct.dim) || NONE, models[j](fct.dim) || NONE].sort().join(' × ');
      const e = byModelPair[key] || (byModelPair[key] = { agree: 0, of: 0, pct: 0 });
      e.of += 1;
      if (fct.runs.has(i) && fct.runs.has(j)) e.agree += 1;
    }
    for (const e of Object.values(byModelPair)) e.pct = Math.round(100 * e.agree / e.of);
  }
  return {
    sweeps: sweeps.map((_, i) => ({ name: (names && names[i]) || `sweep-${i}`, findings: nodes.filter((n) => n.run === i).length })),
    byModelPair,
    N, union: union_, core, pct: union_ ? Math.round(100 * core / union_) : 0,
    byDimension,
    variant: factList.filter((f) => f.runs.size < N).sort((a, b) => a.runs.size - b.runs.size || String(a.dim).localeCompare(String(b.dim))),
  };
}

// ── measure 2: descriptor agreement ──────────────────────────────────────────
// The effect facet fields the views compute from. `external` is included: it is a
// descriptor a run judges (does this leave the trust boundary), and it feeds the halt flag.
export const DESCRIPTOR_FIELDS = ['reversibility', 'external', 'gate_type', 'fail_mode', 'telemetry', 'blast_scope'];

// Safety ordering per field, low = riskier. Used ONLY to give a divergence a direction;
// it never scores anything. gate_type's order follows doctrine.mjs's REAL_GATES split
// (none/disclosure-only do not hold) with the halts ranked above the bounds. A field with
// no defensible total order (none here today) would be left out and counted `unordered`.
const RANK = {
  reversibility: { irreversible: 0, 'reversible-with-window': 1, reversible: 2 },
  external: { true: 0, false: 1 },
  gate_type: { none: 0, 'disclosure-only': 1, 'rate-throttle': 2, 'scope-bound': 2, 'initiated-by-person': 3, 'staged-reversible': 3, 'external-halt': 3, 'deterministic-halt': 4 },
  fail_mode: { open: 0, unterminated: 0, closed: 1 },
  telemetry: { none: 0, unstructured: 1, 'structured-event': 2, audited: 3 },
  blast_scope: { 'cross-tenant': 0, fleet: 1, tenant: 2, user: 3 },
};

// the same order, read by map/consequence.mjs: a contested descriptor reads its riskier value (#319)
export const DESCRIPTOR_RANK = RANK;

const norm = (v) => (v === undefined || v === null ? null : String(v).trim().toLowerCase());
const tupleOf = (f) => Object.fromEntries(DESCRIPTOR_FIELDS.map((k) => [k, norm(f.effect[k])]));

// One comparison of the six descriptors across the sweeps that carry one item (a channel, or a
// listed candidate), shared by both descriptor measures so they can never count differently.
// present: [[sweep index, tuple]]; byField and directions are tallied in place. Returns the
// fields that part, each with every sweep's value.
function compareTuples(present, byField, directions) {
  const fieldsDiffering = [];
  for (const k of DESCRIPTOR_FIELDS) {
    const vals = present.map(([, t]) => t[k]);
    // fail_mode is NOT APPLICABLE where a sweep recorded gate_type: none — the schema
    // only requires it when a gate exists. Counting it there double-counts a single
    // gate_type disagreement as two, deflating the fail_mode column for a difference
    // it did not independently observe. Skip the field entirely for that item, and where a sweep's
    // finding records no fail_mode (a candidate whose own answers give a gate, mapped to a finding
    // whose riskier path has none, #315).
    if (k === 'fail_mode' && present.some(([, t]) => t.gate_type === 'none' || t.fail_mode === null)) continue;
    byField[k].of += 1;
    if (vals.every((v) => v === vals[0])) { byField[k].agree += 1; continue; }
    fieldsDiffering.push({ field: k, values: present.map(([i, t]) => ({ sweep: i, value: t[k] })) });
    // direction, first sweep -> last sweep that carries the item
    const a = RANK[k] ? RANK[k][vals[0]] : undefined;
    const b = RANK[k] ? RANK[k][vals[vals.length - 1]] : undefined;
    if (a === undefined || b === undefined || a === b) directions.unordered += 1;
    else if (b > a) directions.safer += 1;
    else directions.riskier += 1;
  }
  return fieldsDiffering;
}
const emptyByField = () => Object.fromEntries(DESCRIPTOR_FIELDS.map((k) => [k, { agree: 0, of: 0, pct: 0 }]));
const finishByField = (byField) => { for (const k of DESCRIPTOR_FIELDS) byField[k].pct = byField[k].of ? Math.round(100 * byField[k].agree / byField[k].of) : 0; };

// descriptorAgreement(sweeps) — sweeps is an array of FINDINGS ARRAYS (pure; no I/O), so
// it is testable without fixtures. Each sweep contributes at most one descriptor tuple per
// effect channel (the first; a run recording a channel twice is a granularity choice that
// measure 1 already covers). keys (optional): one Map<finding id, channel key> per sweep, so a
// channel is the candidate its run triaged to it, not the lane's slug (#298).
export function descriptorAgreement(sweeps, keys) {
  const perSweep = sweeps.map((findings, si) => {
    const byChannel = new Map();
    for (const f of findings || []) {
      if (!f || f.subject_type !== 'effect' || !f.effect) continue;
      const ch = norm(channelOf(f, keys && keys[si]));
      if (!ch || byChannel.has(ch)) continue;
      byChannel.set(ch, tupleOf(f));
    }
    return byChannel;
  });

  const allChannels = new Set(perSweep.flatMap((m) => [...m.keys()]));
  const shared = [...allChannels].filter((ch) => perSweep.filter((m) => m.has(ch)).length >= 2).sort();
  const unshared = [...allChannels].filter((ch) => !shared.includes(ch)).sort();

  const byField = emptyByField();
  const divergences = [];
  let allAgree = 0;
  const directions = { safer: 0, riskier: 0, unordered: 0 };

  for (const ch of shared) {
    const present = perSweep.map((m, i) => [i, m.get(ch)]).filter(([, t]) => t);
    const fieldsDiffering = compareTuples(present, byField, directions);
    if (!fieldsDiffering.length) allAgree += 1;
    else divergences.push({ channel: ch, fields: fieldsDiffering, sweeps: present.map(([i]) => i) });
  }
  finishByField(byField);

  return {
    N: sweeps.length,
    channels: { total: allChannels.size, shared: shared.length, unshared: unshared.length, unsharedList: unshared },
    byField,
    allFields: { agree: allAgree, of: shared.length, pct: shared.length ? Math.round(100 * allAgree / shared.length) : 0 },
    divergences,
    directions,
    // both directions at once = judgment drift, not target movement. Needs a divergence
    // in each direction; an all-one-way set is consistent with the target having changed.
    bothWays: directions.safer > 0 && directions.riskier > 0,
  };
}

// runDir wrapper — loads then delegates.
export function computeDescriptorAgreement(runDirs) {
  return descriptorAgreement(runDirs.map((d) => loadFindings(d)), runDirs.map((d) => channelKeys(d)));
}

// ── measure 2, per listed candidate (#312): the primary descriptor figure ─────
// Per channel, two lanes that group the same listed candidates into findings differently
// (`a | b` as one finding beside `a` and `b` as two) read as different channels each seen once,
// so the per-channel figure measures grouping style more than judgment. A listed candidate is
// the list's own unit: each member of the run's map/raw/enumerate.json effect population that
// its triage maps to an effect finding takes that finding's six descriptors, and a candidate
// every sweep maps is compared field by field, however each sweep grouped it. Counted apart,
// never inside the figure:
//   • scope: a candidate one sweep mapped and another triaged out of scope or left untriaged
//     (a disagreement on whether it is an effect, not on how it is described);
//   • not listed in every sweep: a candidate some sweep's list does not carry;
//   • unmapped: effect findings no candidate maps to, keyed by their slug as before.
// Where every sweep's triage records the candidate's answers to the checklist (#315 slice 2,
// map/effect-answers.mjs), the lanes are compared on the answers: the candidate's gate_type and
// reversibility are the values its own answers give, not its finding's as written (which is the
// riskiest of every candidate the finding covers), and each answer is counted per question
// (`answers`). A candidate some sweep did not answer (a version 1 triage) is compared as written and
// counted `unanswered`.
// sweeps: one { findings, candidates, triage } per sweep (candidates null = the run carries no
// list; triage null = no triage file), the way map/effect-triage.mjs loadChannelFiles reads them.
export function candidateAgreement(sweeps) {
  const N = sweeps.length;
  const per = sweeps.map((s) => {
    const findings = (s && s.findings) || [];
    const byId = new Map(findings.filter((f) => f && f.id).map((f) => [String(f.id), f]));
    const isEffect = (id) => { const f = byId.get(id); return !!(f && f.subject_type === 'effect' && f.effect && typeof f.effect === 'object'); };
    const listed = Array.isArray(s && s.candidates) ? s.candidates : null;
    const { judged, outOfScope } = listed ? closure(listed, s.triage, isEffect) : { judged: new Map(), outOfScope: [] };
    const mapped = new Set(judged.values());
    const unmapped = new Map();
    for (const f of findings) {
      if (!f || f.subject_type !== 'effect' || !f.effect || (f.id && mapped.has(String(f.id)))) continue;
      const slug = norm(f.effect.channel || f.channel);
      if (slug && !unmapped.has(slug)) unmapped.set(slug, f);
    }
    const answers = new Map();
    for (const e of Array.isArray(s && s.triage) ? s.triage : []) if (e && typeof e.candidate === 'string' && e.answers && typeof e.answers === 'object' && !answers.has(e.candidate)) answers.set(e.candidate, e.answers);
    return { listed, set: new Set(listed || []), judged, out: new Set(outOfScope), byId, unmapped, answers };
  });

  const status = (p, c) => (!p.listed || !p.set.has(c) ? 'not-listed' : p.judged.has(c) ? 'mapped' : p.out.has(c) ? 'out-of-scope' : 'untriaged');
  const all = [...new Set(per.flatMap((p) => p.listed || []))].sort();
  const byField = emptyByField();
  const directions = { safer: 0, riskier: 0, unordered: 0 };
  const divergences = [], scope = [], notListed = [];
  let compared = 0, agree = 0, outOfScopeEverywhere = 0, untriagedEverywhere = 0, unanswered = 0;
  const byAnswer = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, { agree: 0, of: 0, pct: 0 }]));
  const answerDivergences = [];
  let answeredCompared = 0, answersAgree = 0;
  for (const c of all) {
    const st = per.map((p) => status(p, c));
    if (st.includes('not-listed')) { notListed.push({ candidate: c, statuses: st }); continue; }
    if (st.every((x) => x === 'mapped')) {
      compared += 1;
      const answered = per.every((p) => p.answers.has(c));
      const present = per.map((p, i) => {
        const t = tupleOf(p.byId.get(p.judged.get(c)));
        return [i, answered ? { ...t, gate_type: gateTypeFrom(p.answers.get(c)), reversibility: reversibilityFrom(p.answers.get(c)) } : t];
      });
      if (!answered) unanswered += 1;
      else {
        answeredCompared += 1;
        const differ = [];
        for (const k of CHECKLIST_KEYS) {
          const vals = per.map((p) => answerValue(k, p.answers.get(c)[k]));
          byAnswer[k].of += 1;
          if (vals.every((v) => v === vals[0])) byAnswer[k].agree += 1;
          else differ.push({ key: k, values: vals });
        }
        if (!differ.length) answersAgree += 1;
        else answerDivergences.push({ candidate: c, answers: differ });
      }
      const fields = compareTuples(present, byField, directions);
      if (!fields.length) agree += 1;
      else divergences.push({ candidate: c, fields, findings: per.map((p) => p.judged.get(c)) });
    } else if (st.includes('mapped')) scope.push({ candidate: c, statuses: st });
    else if (st.every((x) => x === 'out-of-scope')) outOfScopeEverywhere += 1;
    else untriagedEverywhere += 1;
  }
  finishByField(byField);
  for (const k of CHECKLIST_KEYS) byAnswer[k].pct = byAnswer[k].of ? Math.round(100 * byAnswer[k].agree / byAnswer[k].of) : 0;

  const slugs = [...new Set(per.flatMap((p) => [...p.unmapped.keys()]))].sort();
  const unmapped = slugs.map((slug) => ({ slug, sweeps: per.map((p, i) => (p.unmapped.has(slug) ? i : -1)).filter((i) => i >= 0) }));

  return {
    N,
    listed: per.some((p) => p.listed),
    candidates: { total: all.length, compared, notListed: notListed.length, outOfScopeEverywhere, untriagedEverywhere, unanswered },
    byField,
    allFields: { agree, of: compared, pct: compared ? Math.round(100 * agree / compared) : 0 },
    divergences,
    directions,
    bothWays: directions.safer > 0 && directions.riskier > 0,
    scope: { disagreements: scope.length, list: scope },
    notListed,
    unmapped: { total: unmapped.length, inEvery: unmapped.filter((u) => u.sweeps.length === N).length, list: unmapped },
    answers: { compared: answeredCompared, allAnswers: { agree: answersAgree, of: answeredCompared, pct: answeredCompared ? Math.round(100 * answersAgree / answeredCompared) : 0 }, byAnswer, divergences: answerDivergences },
  };
}

// runDir wrapper: each run's own list and triage. A list or triage present but unreadable halts
// the measurement (fail closed), never reads as a run with no list.
export function computeCandidateAgreement(runDirs) {
  return candidateAgreement(runDirs.map((d) => {
    const { candidates, triage, errors } = loadChannelFiles(d);
    if (errors.length) throw new Error(`${d}: ${errors[0]}`);
    return { findings: loadFindings(d), candidates, triage };
  }));
}

// ── requirement agreement (measure 3) ───────────────────────────────────────
// The pure half: sweepRows is one array per sweep of { id, status } (a measurement's
// rows). A requirement no sweep decides is left out: nobody measured it, so it neither
// agrees nor disagrees. A requirement missing from a sweep's rows reads not-measured there.
export function requirementAgreement(sweepRows) {
  const ids = [...new Set(sweepRows.flatMap((rs) => (rs || []).map((r) => r.id)))];
  let decided = 0;
  const divergences = [];
  for (const id of ids) {
    const statuses = sweepRows.map((rs) => ((rs || []).find((r) => r.id === id) || {}).status || 'not-measured');
    if (statuses.every((s) => s === 'not-measured')) continue;
    decided++;
    if (!statuses.every((s) => s === statuses[0])) divergences.push({ id, statuses });
  }
  const agree = decided - divergences.length;
  return { decided, agree, pct: decided ? Math.round(100 * agree / decided) : 0, divergences };
}

// runDir wrapper: each sweep measured against the yardstick, with no owner packet.
export function computeRequirementAgreement(runDirs, reg = loadYardstick()) {
  return requirementAgreement(runDirs.map((d) => projectRun(d, reg, null).map((r) => ({ id: r.id, status: r.status }))));
}

// ── the sweep set and its gate ──────────────────────────────────────────────
// The gate's four measures (tests/sweeps/README.md). candidate_agreement is the primary descriptor
// figure (#312); descriptor_agreement gates the per-channel figure it replaces, kept beside it for one
// release so the committed sets stay comparable, then retired with its output.
const THRESHOLD_KEYS = ['fact_presence', 'candidate_agreement', 'descriptor_agreement', 'requirement_agreement'];

// loadSweepSet(dir) → { meta, threshold, notMeasured, runDirs }; throws on a malformed set (a set
// that cannot say what it gates on is never an ungated pass). Every measure is either gated, a
// threshold above 0, or declared under `not_measured` with the reason the set cannot take it,
// never both. A threshold of 0 is refused: it passes whatever the set measures, so it reads like a
// gate and checks nothing (#323).
export function loadSweepSet(dir) {
  const path = join(dir, 'SWEEP.yaml');
  if (!existsSync(path)) throw new Error(`no SWEEP.yaml in ${dir}`);
  const meta = parseYaml(readFileSync(path, 'utf8')) || {};
  const bad = (m) => { throw new Error(`${path}: ${m}`); };
  for (const k of ['target', 'target_commit', 'method_commit', 'date']) if (typeof meta[k] !== 'string' || !meta[k].trim()) bad(`${k} must be a non-empty string`);
  if (typeof meta.blind !== 'boolean') bad('blind must be true or false (a set authored beside its answers is not blind)');
  const thr = meta.threshold;
  if (!thr || typeof thr !== 'object' || Array.isArray(thr)) bad(`threshold is required: { ${THRESHOLD_KEYS.join(', ')} }, each a percentage above 0, or declared under not_measured`);
  const nm = meta.not_measured === undefined ? {} : meta.not_measured;
  if (!nm || typeof nm !== 'object' || Array.isArray(nm)) bad('not_measured must map each measure the set cannot take to the reason it cannot');
  for (const k of Object.keys(thr)) if (!THRESHOLD_KEYS.includes(k)) bad(`threshold.${k} is no measure (${THRESHOLD_KEYS.join(', ')})`);
  for (const k of Object.keys(nm)) {
    if (!THRESHOLD_KEYS.includes(k)) bad(`not_measured.${k} is no measure (${THRESHOLD_KEYS.join(', ')})`);
    if (typeof nm[k] !== 'string' || !nm[k].trim()) bad(`not_measured.${k} must say why the set cannot take it`);
    if (k in thr) bad(`${k} is both gated by threshold.${k} and declared not measured; a measure is one or the other`);
  }
  for (const k of THRESHOLD_KEYS) {
    if (k in nm) continue;
    if (!(k in thr)) bad(`threshold.${k} is required, or declare ${k} under not_measured with the reason the set cannot take it`);
    if (typeof thr[k] !== 'number' || thr[k] < 0 || thr[k] > 100) bad(`threshold.${k} must be a percentage 0–100`);
    if (thr[k] === 0) bad(`threshold.${k} is 0, which passes whatever the set measures: gate ${k} above 0, or declare it under not_measured with the reason the set cannot take it`);
  }
  if (!Array.isArray(meta.sweeps) || meta.sweeps.length < 2) bad('sweeps must list at least two sweep directories');
  for (const s of meta.sweeps) {
    if (typeof s !== 'string' || !/^[\w.-]+$/.test(s) || s === '..' || s === '.') bad(`sweep ${JSON.stringify(s)} must be a directory name inside the set`);
    if (!existsSync(join(dir, s))) bad(`sweep ${s} does not exist`);
  }
  return { meta, threshold: thr, notMeasured: nm, runDirs: meta.sweeps.map((s) => join(dir, s)) };
}

// sweepGate(r, d, threshold, q, c, notMeasured) → breaches (empty = the set holds). r is
// computeVariance's result, d descriptorAgreement's, q requirementAgreement's, c
// candidateAgreement's. A descriptor threshold over no shared channel, a candidate threshold over
// no candidate every sweep maps, or a requirement threshold over no decided requirement, is a
// breach: the measure was not taken, which never reads as met. A measure the set declares not
// measured is reported so and gates nothing, unless the set does take it: then the declaration is
// false and is a breach naming it.
export function sweepGate(r, d, threshold, q = null, c = null, notMeasured = {}) {
  const out = [];
  const declared = (k, taken, what) => { if (k in notMeasured && taken) out.push(`${k} is declared not measured, but the set measures it (${what}): state its threshold`); };
  declared('fact_presence', !!(r && r.union), `${r && r.union} union facts`);
  declared('candidate_agreement', !!(c && c.candidates && c.candidates.compared), `${c && c.candidates && c.candidates.compared} candidates every sweep maps`);
  declared('descriptor_agreement', !!(d && d.channels && d.channels.shared), `${d && d.channels && d.channels.shared} shared effect channels`);
  declared('requirement_agreement', !!(q && q.decided), `${q && q.decided} decided requirements`);
  if (typeof threshold.fact_presence === 'number' && r.pct < threshold.fact_presence)
    out.push(`fact presence ${r.pct}% is below the threshold ${threshold.fact_presence}%`);
  if (typeof threshold.candidate_agreement === 'number') {
    if (!c || !c.candidates.compared) { if (threshold.candidate_agreement > 0) out.push(`per-candidate descriptor agreement not measured: no listed candidate every sweep maps to an effect finding, threshold ${threshold.candidate_agreement}%`); }
    else if (c.allFields.pct < threshold.candidate_agreement) out.push(`per-candidate descriptor agreement ${c.allFields.pct}% is below the threshold ${threshold.candidate_agreement}%`);
  }
  if (typeof threshold.descriptor_agreement === 'number') {
    if (!d.channels.shared) { if (threshold.descriptor_agreement > 0) out.push(`descriptor agreement not measured: no shared effect channel, threshold ${threshold.descriptor_agreement}%`); }
    else if (d.allFields.pct < threshold.descriptor_agreement) out.push(`descriptor agreement ${d.allFields.pct}% is below the threshold ${threshold.descriptor_agreement}%`);
  }
  if (typeof threshold.requirement_agreement === 'number') {
    if (!q || !q.decided) { if (threshold.requirement_agreement > 0) out.push(`requirement agreement not measured: no requirement decided by any sweep, threshold ${threshold.requirement_agreement}%`); }
    else if (q.pct < threshold.requirement_agreement) out.push(`requirement agreement ${q.pct}% is below the threshold ${threshold.requirement_agreement}%`);
  }
  return out;
}

function reportRequirements(q) {
  console.log(`  requirement agreement (the verdicts a reader acts on):`);
  if (!q.decided) { console.log(`    no requirement decided by any sweep — nothing to compare.\n`); return; }
  console.log(`    identical in every sweep: ${q.agree}/${q.decided} decided requirements  (${q.pct}%)`);
  for (const v of q.divergences) console.log(`      ${v.id.padEnd(34)} ${v.statuses.join(' / ')}`);
  console.log('');
}

const printFields = (byField) => { for (const k of DESCRIPTOR_FIELDS)
  console.log(`      ${k.padEnd(15)} ${String(byField[k].agree).padStart(3)}/${String(byField[k].of).padStart(3)}  ${String(byField[k].pct + '%').padStart(5)}`); };
const printDirection = (x) => {
  console.log(`\n    direction: ${x.directions.safer} safer · ${x.directions.riskier} riskier · ${x.directions.unordered} unordered`);
  console.log(x.bothWays
    ? `    ⚠ divergences move in BOTH directions — the signature of judgment drift, not target change.\n` +
      `      A cross-run coverage delta computed over these descriptors is not a trend.`
    : `    divergences move one way — consistent with the target having changed between sweeps.`);
};

function reportCandidates(c) {
  console.log(`  descriptor agreement per listed candidate (the primary figure; the gate's candidate_agreement):`);
  if (!c.listed) { console.log(`    no sweep carries a candidate list (map/raw/enumerate.json) — not measured.\n`); return; }
  console.log(`    listed candidates: ${c.candidates.total}; mapped to an effect finding by every sweep: ${c.candidates.compared}`);
  console.log(`    counted apart: ${c.scope.disagreements} scope disagreement(s) (mapped by one sweep, out of scope or untriaged in another) · ` +
    `${c.candidates.outOfScopeEverywhere} out of scope in every sweep · ${c.candidates.untriagedEverywhere} untriaged in every sweep · ${c.candidates.notListed} not listed by every sweep`);
  for (const v of c.scope.list) console.log(`      scope: ${v.candidate.padEnd(40)} ${v.statuses.join(' / ')}`);
  console.log(`    effect findings no candidate maps to (by slug): ${c.unmapped.total}, ${c.unmapped.inEvery} in every sweep`);
  if (!c.candidates.compared) { console.log(`    no candidate every sweep maps — nothing to compare.\n`); return; }
  console.log(`    all ${DESCRIPTOR_FIELDS.length} descriptors identical: ${c.allFields.agree}/${c.allFields.of}  (${c.allFields.pct}%)` +
    `  — ${c.answers.compared} compared on their answers (gate_type and reversibility as the answers give them), ${c.candidates.unanswered} unanswered in some sweep, as written`);
  printFields(c.byField);
  if (c.answers.compared) {
    console.log(`\n    answers identical (per candidate every sweep answers): ${c.answers.allAnswers.agree}/${c.answers.allAnswers.of}  (${c.answers.allAnswers.pct}%)`);
    for (const k of CHECKLIST_KEYS) console.log(`      ${k.padEnd(17)} ${String(c.answers.byAnswer[k].agree).padStart(3)}/${String(c.answers.byAnswer[k].of).padStart(3)}  ${String(c.answers.byAnswer[k].pct + '%').padStart(5)}`);
    for (const v of c.answers.divergences) console.log(`      ${v.candidate.padEnd(40)} ${v.answers.map((a) => `${a.key}: ${a.values.join(' vs ')}`).join(' · ')}`);
  }
  if (c.divergences.length) {
    console.log(`\n    divergent candidates:`);
    for (const v of c.divergences)
      console.log(`      ${v.candidate.padEnd(40)} ${v.fields.map((f) => `${f.field}: ${f.values.map((x) => x.value).join(' vs ')}`).join(' · ')}`);
    printDirection(c);
  }
  console.log('');
}

function reportDescriptors(d) {
  console.log(`  descriptor agreement per channel (kept beside the per-candidate figure for one release; the gate's descriptor_agreement):`);
  console.log(`    effect channels shared by 2+ sweeps: ${d.channels.shared} of ${d.channels.total}` +
    (d.channels.unshared ? `  (${d.channels.unshared} seen by only one sweep: ${d.channels.unsharedList.join(', ')})` : ''));
  if (!d.channels.shared) { console.log(`    no shared channel — nothing to compare.\n`); return; }
  console.log(`    all ${DESCRIPTOR_FIELDS.length} descriptors identical: ${d.allFields.agree}/${d.allFields.of}  (${d.allFields.pct}%)`);
  printFields(d.byField);
  if (d.divergences.length) {
    console.log(`\n    divergent channels:`);
    for (const v of d.divergences)
      console.log(`      ${v.channel.padEnd(26)} ${v.fields.map((f) => `${f.field}: ${f.values.map((x) => x.value).join(' vs ')}`).join(' · ')}`);
    printDirection(d);
  }
  console.log('');
}

function report(r) {
  console.log(`\nassay variance — ${r.N} sweeps:`);
  r.sweeps.forEach((s, i) => console.log(`  sweep ${i}: ${s.name} (${s.findings} findings)`));
  console.log(`\n  facts (union):        ${r.union}`);
  console.log(`  caught by all ${r.N}:      ${r.core}  (${r.pct}% — the repeatable core)`);
  console.log(`  caught by some only:  ${r.union - r.core}  (${r.union ? Math.round(100 * (r.union - r.core) / r.union) : 0}% — the variance)`);
  console.log(`\n  by dimension (repeatable core / union facts = %):`);
  for (const [d, v] of Object.entries(r.byDimension))
    console.log(`    ${d.padEnd(22)} ${String(v.core).padStart(3)}/${String(v.union).padStart(3)}  ${String(v.pct + '%').padStart(5)}`);
  console.log(`\n  by model pair (facts caught by both sweeps of a pair / caught by either, across every sweep pair):`);
  for (const [k, v] of Object.entries(r.byModelPair).sort())
    console.log(`    ${k.padEnd(40)} ${String(v.agree).padStart(3)}/${String(v.of).padStart(3)}  ${String(v.pct + '%').padStart(5)}`);
  console.log(`\n  variance detail (which sweeps caught each divergent fact):`);
  for (const f of r.variant) console.log(`    [${f.runs.size}/${r.N} · sweeps ${[...f.runs].sort().join(',')}] ${f.dim}/${f.subj}: ${f.sample}`);
  console.log('');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const VALUED = ['--set', '--min-facts', '--min-candidates', '--min-descriptors', '--min-requirements'];
  const flag = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  let runs = argv.filter((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1]));
  let threshold = {}, notMeasured = {}, set = null;
  if (flag('--set')) {
    try { set = loadSweepSet(flag('--set')); } catch (e) { console.error(`✗ variance: malformed sweep set — ${e.message}`); process.exit(2); }
    runs = set.runDirs; threshold = { ...set.threshold }; notMeasured = { ...set.notMeasured };
  }
  for (const [f, k] of [['--min-facts', 'fact_presence'], ['--min-candidates', 'candidate_agreement'], ['--min-descriptors', 'descriptor_agreement'], ['--min-requirements', 'requirement_agreement']]) {
    if (flag(f) === null) continue;
    const n = Number(flag(f));
    if (!Number.isFinite(n) || n <= 0) { console.error(`${f} takes a percentage above 0 (a threshold of 0 passes whatever is measured)`); process.exit(2); }
    if (k in notMeasured) { console.error(`${f}: the set declares ${k} not measured (${notMeasured[k]})`); process.exit(2); }
    threshold[k] = n;
  }
  if (runs.length < 2) { console.error('usage: node variance.mjs <run-dir> <run-dir> [<run-dir> ...] | --set <sweep-set-dir>  [--min-facts N] [--min-candidates N] [--min-descriptors N] [--min-requirements N] [--json]'); process.exit(2); }
  const r = computeVariance(runs);
  const d = computeDescriptorAgreement(runs);
  const c = computeCandidateAgreement(runs);
  const q = computeRequirementAgreement(runs);
  const gated = Object.keys(threshold).length > 0 || Object.keys(notMeasured).length > 0;
  const breaches = gated ? sweepGate(r, d, threshold, q, c, notMeasured) : [];
  if (process.argv.includes('--json')) console.log(JSON.stringify({
    pct: r.pct, union: r.union, core: r.core, byDimension: r.byDimension, byModelPair: r.byModelPair,
    candidates: { pct: c.allFields.pct, listed: c.listed, total: c.candidates.total, compared: c.candidates.compared, agree: c.allFields.agree,
                  byField: c.byField, divergences: c.divergences, directions: c.directions, bothWays: c.bothWays,
                  scope: c.scope, outOfScopeEverywhere: c.candidates.outOfScopeEverywhere, untriagedEverywhere: c.candidates.untriagedEverywhere,
                  notListed: c.notListed, unmapped: c.unmapped, unanswered: c.candidates.unanswered, answers: c.answers },
    descriptors: { pct: d.allFields.pct, shared: d.channels.shared, byField: d.byField,
                   divergences: d.divergences, directions: d.directions, bothWays: d.bothWays },
    requirements: { pct: q.pct, decided: q.decided, agree: q.agree, divergences: q.divergences },
    ...(set ? { set: { target: set.meta.target, target_commit: set.meta.target_commit, method_commit: set.meta.method_commit, date: set.meta.date, blind: set.meta.blind } } : {}),
    ...(gated ? { gate: { threshold, not_measured: notMeasured, breaches } } : {}),
  }, null, 2));
  else {
    if (set) console.log(`\nsweep set ${flag('--set')}: ${set.meta.target} @ ${set.meta.target_commit}, method @ ${set.meta.method_commit}, ${set.meta.date}${set.meta.blind ? ', blind' : ', NOT blind (authored beside its answers)'}`);
    report(r); reportCandidates(c); reportDescriptors(d); reportRequirements(q);
    if (gated) {
      const at = (k) => (k in notMeasured ? 'not measured' : `≥ ${threshold[k] ?? '—'}%`);
      console.log(`  gate: fact presence ${at('fact_presence')} · per-candidate descriptor agreement ${at('candidate_agreement')} · per-channel descriptor agreement ${at('descriptor_agreement')} · requirement agreement ${at('requirement_agreement')}`);
      for (const [k, why] of Object.entries(notMeasured)) console.log(`  – ${k} not measured: ${why}`);
      if (breaches.length) for (const b of breaches) console.log(`  ✗ ${b}`);
      else console.log('  ✓ the set holds its threshold');
    }
  }
  if (breaches.length) process.exit(1);
}
