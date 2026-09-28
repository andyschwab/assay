#!/usr/bin/env node
// compare.mjs — the pure core behind `ratchet` and `since` (yardstick/README.md,
// views/README.md): what changed between two measurements of the SAME yardstick's
// requirements, and between two runs' findings.
//
// `compare(previous, current)` takes two documents SHAPED like yardstick.yaml
// (`{ version, requirements: [{ id, status, basis, findings, note }] }` — the
// GENERATED file yardstick/measure.mjs --write writes, or a baseline file read the
// same way) and classifies every requirement id present on either side:
//
//   improved            | met/mixed/unmet rank went UP (unmet -> mixed -> met)
//   regressed           | rank went DOWN
//   unchanged           | same status on both sides (including not-measured on both)
//   newly-measured      | previous not-measured, current decided
//   no-longer-measured  | previous decided, current not-measured — NEVER "unchanged"
//                          and NEVER "improved": a status leaving the measured scale
//                          is not progress, it is a loss of information.
//   yardstick-only      | the id exists on only one side (the yardstick itself
//                          changed — a requirement was added, renamed or retired)
//
// The ordering met > mixed > unmet is TOTAL; not-measured sits OFF that scale by
// construction — comparing it as a fourth rung would let "we stopped measuring
// this" read as a lateral move instead of the loss it is (CLAUDE.md rule 3: fail
// loud, never empty).
//
// Yardstick version differences (the `version` a yardstick.yaml or baseline
// carries) are reported on the result, never hidden by comparing rows anyway —
// a requirement's id can be reused with a changed meaning across a yardstick
// revision, and silently diffing across that boundary would misreport an
// unrelated redefinition as a real regression.
//
// A second pure core, `compareFindings`, matches findings across two runs by a
// documented FINGERPRINT (never by `id` — SCHEMA.md §3: ids carry no meaning
// across independent runs) so `since` can report findings new since the
// previous run and findings no longer found — never "fixed": absence of a
// finding is absence of re-detection, not proof the underlying fact is gone.
import { STATUSES } from './measure.mjs';

// ── requirement-status comparison ───────────────────────────────────────────
export const STATUS_RANK = { unmet: 1, mixed: 2, met: 3 }; // not-measured: off-scale, see above
export const CLASSIFICATIONS = ['improved', 'regressed', 'unchanged', 'newly-measured', 'no-longer-measured', 'yardstick-only'];

// classify(previousStatus, currentStatus) — pure, throws on a status outside the
// yardstick's closed vocabulary (fail loud: a silently-accepted unknown status
// would misclassify every row that carries it).
export function classify(prevStatus, currStatus) {
  for (const s of [prevStatus, currStatus]) if (!STATUSES.includes(s)) throw new Error(`compare: unknown status "${s}" (must be one of ${STATUSES.join('|')})`);
  if (prevStatus === 'not-measured' && currStatus === 'not-measured') return 'unchanged';
  if (prevStatus === 'not-measured') return 'newly-measured';
  if (currStatus === 'not-measured') return 'no-longer-measured';
  const pr = STATUS_RANK[prevStatus], cr = STATUS_RANK[currStatus];
  if (cr > pr) return 'improved';
  if (cr < pr) return 'regressed';
  return 'unchanged';
}

const rowView = (r) => r ? { status: r.status, basis: r.basis || 'run', findings: Array.isArray(r.findings) ? r.findings : [], note: r.note ?? null } : null;

// compare(previous, current) — previous/current: { version, requirements: [...] }.
// Returns { previousVersion, currentVersion, versionChanged, rows: [...] } sorted
// by id. Every row present on both sides carries `classification` from `classify`
// above; a row present on only one side carries `classification: 'yardstick-only'`
// and `side: 'previous' | 'current'` naming which one has it.
export function compare(previous, current) {
  const prevById = new Map((previous?.requirements || []).map((r) => [r.id, r]));
  const currById = new Map((current?.requirements || []).map((r) => [r.id, r]));
  const ids = [...new Set([...prevById.keys(), ...currById.keys()])].sort();
  const rows = ids.map((id) => {
    const p = prevById.get(id), c = currById.get(id);
    if (!p || !c) return { id, classification: 'yardstick-only', side: p ? 'previous' : 'current', previous: rowView(p), current: rowView(c) };
    return { id, classification: classify(p.status, c.status), previous: rowView(p), current: rowView(c) };
  });
  const previousVersion = previous?.version ?? null, currentVersion = current?.version ?? null;
  return { previousVersion, currentVersion, versionChanged: previousVersion !== currentVersion, rows };
}

// ── finding fingerprint (documented here AND in views/README.md — one home) ──
// A finding's `id` (F-###) carries no meaning across independent runs (SCHEMA.md
// §3: "ids are renumbered across independent runs anyway"). To say a finding is
// "new since the previous run" or "no longer found" needs a key stable across
// two independent runs instead. Built from fields the schema fixes per-fact,
// never from a line number alone or from prose (a line shifts when the file
// above it grows by one line; an observation's wording is not identity):
//
//   scanner           `source` (native repo-eval passes carry none — those use
//                      the fixed pass label "repo-eval")
//   category          `dimension` for a repo-eval finding, `native_category` for
//                      a scanner/instrument row (SCHEMA.md §2a: the two are
//                      mutually exclusive on a finding)
//   polarity          a check that was a strength and is now a gap is a new
//                      fact, not the same finding
//   evidence paths    every `evidence` entry with its `:line` suffix STRIPPED —
//                      a file moving by a line is not a new fact; a fact moving
//                      to a different FILE is (matches map/variance.mjs's own
//                      identity-token rule: the full path, never the basename,
//                      never the line)
//
// Two independent facts that collide on this key (same scanner, same category,
// same file set) are a known, accepted coarsening — the same one variance.mjs's
// groupKey already accepts for scanner/instrument rows, which carry no per-item
// slug — and it fails toward UNDER-reporting "new", never toward inventing one.
export function fingerprintFinding(f) {
  const scanner = f.source || 'repo-eval';
  const category = f.dimension || f.native_category || '';
  const paths = (Array.isArray(f.evidence) ? f.evidence : []).map((e) => String(e).split(':')[0]).sort();
  // polarity is part of the fact: a check that passed last run and gaps now is a new gap
  // (and a strength no longer found), never the same finding
  return `${scanner}::${category}::${f.polarity || ''}::${paths.join('|')}`;
}

// compareFindings(previousFindings, currentFindings) — pure. Returns
// { new: [...currentFindings not matched in previous], no_longer_found: [...previousFindings not matched in current] },
// each row carrying its fingerprint alongside the finding's own id/source/
// dimension/native_category/evidence/observation (never mutating the input).
export function compareFindings(previousFindings, currentFindings) {
  const prevFp = new Set((previousFindings || []).map(fingerprintFinding));
  const currFp = new Set((currentFindings || []).map(fingerprintFinding));
  const pick = (f) => ({ fingerprint: fingerprintFinding(f), id: f.id, source: f.source || 'repo-eval', dimension: f.dimension ?? null, native_category: f.native_category ?? null, evidence: f.evidence || [], observation: f.observation || '' });
  return {
    new: (currentFindings || []).filter((f) => !prevFp.has(fingerprintFinding(f))).map(pick),
    no_longer_found: (previousFindings || []).filter((f) => !currFp.has(fingerprintFinding(f))).map(pick),
  };
}
