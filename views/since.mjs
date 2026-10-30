#!/usr/bin/env node
// since.mjs — Since: what changed between this run and a previous one, so a
// stewarded repository's own scheduled runs say what moved without a person
// diffing two packages by hand (views/README.md "Since: what changed?"). The
// requirement-level story compares three measurements through yardstick/compare.mjs:
// the previous run's stored yardstick.yaml, the yardstick's measurement of the previous
// map under today's engine (yardstick/measure.mjs projectRun), and this run's
// yardstick.yaml. Previous-today against this run is what the repository moved; the
// stored file against previous-today is what the engine re-ruled (#183), so a rule
// change never reads as a regression. The finding-level story compares the two runs'
// findings, apart from the scanners that ran in only one of them. The view decides no
// requirement on its own: every status is the yardstick's (views/README.md).
//
// Writes views/since.yaml (data) + SINCE.md (plain, neutral — counts only in the
// headline, no verdict, no severity the views do not already compute: CLAUDE.md
// rule 1) at the run root.
//
// Usage: node assay.mjs since <run-dir> --previous <prev-run-dir> [--confidential]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml, q as yq } from '../lib/yaml-min.mjs';
import { loadFindings, loadManifest } from '../map/project.mjs';
import { legacyIn } from '../map/migrate-run.mjs';
import { loadYardstick, projectRun } from '../yardstick/measure.mjs';
import { loadYardstickDoc } from '../yardstick/ratchet.mjs';
import { compare, compareFindings } from '../yardstick/compare.mjs';
import { viewPath, sincePagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';
import { mdText, mdCode } from '../lib/display.mjs';

// buildSince(previousDoc, currentDoc, reg, previousToday) — pure over three
// { version, requirements } documents plus the loaded register (for title/tier/topic,
// tier-ordered — the same ordering every other view uses):
//   previousDoc     the previous run's stored measurement (its yardstick.yaml)
//   previousToday   the previous run's map measured by today's engine (defaults to
//                   previousDoc: no re-measurement, nothing re-ruled)
//   currentDoc      this run's measurement
// The moves (regressed, improved, newly/no-longer measured) are previousToday against
// currentDoc: the repository's change, on one engine. re_ruled is previousDoc against
// previousToday: one map, two engines, so every row there is the engine's change. The
// yardstick-only list (a requirement on one side only) is the same pair: retired since
// (previous) or added since (current).
function buildSince(previousDoc, currentDoc, reg, previousToday = previousDoc) {
  const { rows, previousVersion, currentVersion, versionChanged } = compare(previousToday, currentDoc);
  const ruled = compare(previousDoc, previousToday).rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ruledById = new Map(ruled.map((r) => [r.id, r]));
  const tierRank = Object.fromEntries((reg.tiers || []).map((t, i) => [t, i]));
  const ordered = reg.requirements.slice().sort((a, b) => (tierRank[a.tier] ?? 999) - (tierRank[b.tier] ?? 999));
  const regressed = [], improved = [], newly_measured = [], no_longer_measured = [], re_ruled = [];
  for (const d of ordered) {
    const rr = ruledById.get(d.id);
    if (rr && rr.classification !== 'yardstick-only' && rr.previous.status !== rr.current.status) {
      re_ruled.push({ id: d.id, tier: d.tier, topic: d.topic, title: d.title, previous: rr.previous, current: rr.current, note: (rr.current && rr.current.note) ?? '' });
    }
    const r = byId.get(d.id);
    if (!r || r.classification === 'yardstick-only') continue; // reported separately below
    const base = { id: d.id, tier: d.tier, topic: d.topic, title: d.title, previous: r.previous, current: r.current, note: (r.current && r.current.note) ?? (r.previous && r.previous.note) ?? '' };
    if (r.classification === 'regressed') regressed.push(base);
    else if (r.classification === 'improved') improved.push(base);
    else if (r.classification === 'newly-measured') newly_measured.push(base);
    else if (r.classification === 'no-longer-measured') no_longer_measured.push(base);
  }
  const onlyRows = [...ruled, ...rows].filter((r) => r.classification === 'yardstick-only');
  const seen = new Set();
  const yardstick_only = onlyRows.filter((r) => !seen.has(`${r.id}:${r.side}`) && seen.add(`${r.id}:${r.side}`)).map((r) => {
    const d = reg.requirements.find((x) => x.id === r.id);
    const side = r.side === 'previous' ? r.previous : r.current;
    return { id: r.id, side: r.side, title: (d && d.title) || r.id, status: side.status, basis: side.basis };
  });
  return { previousVersion: previousDoc.version ?? previousVersion, currentVersion, versionChanged: versionChanged || String(previousDoc.version) !== String(currentVersion), regressed, improved, newly_measured, no_longer_measured, re_ruled, yardstick_only };
}

// splitFindings(delta, previousManifest, currentManifest) — the findings delta apart from
// the roster's change (#183): a finding new from a scanner that did not run in the
// previous run is new to the record, not to the repository; a finding no longer found
// because its scanner did not run in this one was not looked for. Only a scanner that ran
// in both runs speaks to what the repository changed.
const ranIn = (manifest) => new Set(Object.entries((manifest && manifest.scanners) || {}).filter(([, r]) => r && r.status === 'ran').map(([id]) => id));
function splitFindings(delta, previousManifest, currentManifest) {
  const ranBefore = ranIn(previousManifest), ranNow = ranIn(currentManifest);
  return {
    new: delta.new.filter((f) => ranBefore.has(f.source)),
    not_run_before: delta.new.filter((f) => !ranBefore.has(f.source)),
    no_longer_found: delta.no_longer_found.filter((f) => ranNow.has(f.source)),
    not_run_now: delta.no_longer_found.filter((f) => !ranNow.has(f.source)),
  };
}

// ── YAML emission (yaml-min's block-only subset: no inline flow maps) ───────
const q = (s) => yq(s == null ? '' : s);
function statusBlock(indent, label, s) {
  const L = [`${indent}${label}:`, `${indent}  status: ${s.status}`, `${indent}  basis: ${s.basis || 'run'}`];
  if (s.findings) L.push(`${indent}  findings: [${(s.findings || []).join(', ')}]`);
  return L;
}
function reqRowYaml(r) {
  const L = [`  - id: ${r.id}`, `    tier: ${r.tier}`, `    topic: ${r.topic}`, `    title: ${q(r.title)}`];
  L.push(...statusBlock('    ', 'previous', r.previous));
  L.push(...statusBlock('    ', 'current', r.current));
  L.push(`    note: ${q(r.note)}`);
  return L.join('\n');
}
function yardstickOnlyRowYaml(r) {
  return [`  - id: ${r.id}`, `    side: ${r.side}`, `    title: ${q(r.title)}`, `    status: ${r.status}`, `    basis: ${r.basis || 'run'}`].join('\n');
}
function findingRowYaml(f) {
  return [`    - fingerprint: ${q(f.fingerprint)}`, `      id: ${f.id}`, `      source: ${f.source}`,
    `      dimension: ${q(f.dimension || '')}`, `      native_category: ${q(f.native_category || '')}`,
    `      evidence: [${(f.evidence || []).map(q).join(', ')}]`, `      observation: ${q(f.observation)}`].join('\n');
}

// a caller with no re-measurement or roster split (one engine, one roster) passes neither list
const withDefaults = (since, findingsDelta) => [{ re_ruled: [], ...since }, { not_run_before: [], not_run_now: [], ...findingsDelta }];

export function toYaml(runId, previousId, since, findingsDelta, engines = { previous: '', current: '' }) {
  [since, findingsDelta] = withDefaults(since, findingsDelta);
  const L = ['# since.yaml — GENERATED by views/since.mjs. Do not hand-edit.',
    'view: since', `run: ${runId}`, `previous: ${previousId}`,
    `yardstick: ${since.currentVersion}`, `previous_yardstick: ${since.previousVersion}`,
    `yardstick_version_changed: ${since.versionChanged}`,
    `engine: ${q(engines.current)}`, `previous_engine: ${q(engines.previous)}`, 'counts:',
    `  regressed: ${since.regressed.length}`, `  improved: ${since.improved.length}`,
    `  newly_measured: ${since.newly_measured.length}`, `  no_longer_measured: ${since.no_longer_measured.length}`,
    `  re_ruled: ${since.re_ruled.length}`, `  yardstick_only: ${since.yardstick_only.length}`,
    `  findings_new: ${findingsDelta.new.length}`, `  findings_no_longer_found: ${findingsDelta.no_longer_found.length}`,
    `  findings_not_run_before: ${findingsDelta.not_run_before.length}`, `  findings_not_run_now: ${findingsDelta.not_run_now.length}`];
  for (const [key, list] of [['regressed', since.regressed], ['improved', since.improved], ['newly_measured', since.newly_measured], ['no_longer_measured', since.no_longer_measured], ['re_ruled', since.re_ruled]]) {
    L.push(`${key}:`); for (const r of list) L.push(reqRowYaml(r));
  }
  L.push('yardstick_only:'); for (const r of since.yardstick_only) L.push(yardstickOnlyRowYaml(r));
  L.push('findings:');
  for (const key of ['new', 'no_longer_found', 'not_run_before', 'not_run_now']) { L.push(`  ${key}:`); for (const f of findingsDelta[key]) L.push(findingRowYaml(f)); }
  return L.join('\n') + '\n';
}

// ── the plain page: most useful first (regressed, then improved, then the
// measured/not-measured transitions), findings last. Headline is counts only —
// no verdict, no severity the views do not already compute (CLAUDE.md rule 1).
export function renderMd(runId, previousId, since, findingsDelta, confidential = false, engines = { previous: '', current: '' }) {
  [since, findingsDelta] = withDefaults(since, findingsDelta);
  const out = [];
  out.push('---', 'type: doc', ...(confidential ? ['confidential: true'] : []), `title: "Since ${previousId} — ${runId}"`, '---', '');
  out.push(`# Since ${previousId} — ${runId}`, '');
  out.push(`_What changed since the previous run. Counts only — no verdict, no severity the views do not`);
  out.push('already compute._', '');
  out.push(`**${since.regressed.length} regressed · ${since.improved.length} improved · ${since.newly_measured.length} newly measured · ${since.no_longer_measured.length} no longer measured · ${since.re_ruled.length} re-ruled · ${since.yardstick_only.length} yardstick-only · ${findingsDelta.new.length} findings new · ${findingsDelta.no_longer_found.length} findings no longer found**.`, '');
  out.push('_The moves below are the repository\'s: the previous run\'s map, measured by this run\'s engine, against this run. What the engine itself changed reads re-ruled, never regressed or improved._', '');
  if (engines.previous !== engines.current) out.push(`_The two runs were measured by different engines: ${mdCode(engines.previous || 'unrecorded')} → ${mdCode(engines.current || 'unrecorded')}._`, '');
  if (since.versionChanged) out.push(`_The yardstick itself changed between runs: ${since.previousVersion} → ${since.currentVersion}. A requirement's id can carry a different meaning across that boundary._`, '');

  out.push('## Regressed', '');
  if (since.regressed.length) for (const r of since.regressed) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.previous.status} → ${r.current.status}${r.current.findings.length ? ` (${r.current.findings.join(', ')})` : ''}. ${r.note}`);
  else out.push('_Nothing regressed._');
  out.push('');

  out.push('## Improved', '');
  if (since.improved.length) for (const r of since.improved) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.previous.status} → ${r.current.status}. ${r.note}`);
  else out.push('_Nothing improved._');
  out.push('');

  out.push('## Newly measured', '');
  if (since.newly_measured.length) for (const r of since.newly_measured) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.previous ? r.previous.status : 'not-measured'} → ${r.current.status}. ${r.note}`);
  else out.push('_Nothing newly measured._');
  out.push('');

  out.push('## No longer measured', '');
  if (since.no_longer_measured.length) for (const r of since.no_longer_measured) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.previous.status} → ${r.current.status}. ${r.note}`);
  else out.push('_Nothing dropped off the measured scale._');
  out.push('');

  out.push('## Re-ruled by the engine', '');
  out.push('_The previous run\'s own map, measured again by this run\'s engine: a row here moved because a rule changed, not the repository. The note is the rule\'s reading today._', '');
  if (since.re_ruled.length) for (const r of since.re_ruled) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Stored ${r.previous.status}; today's engine reads the same map ${r.current.status}. ${r.note}`);
  else out.push('_Nothing re-ruled: the previous run reads the same under this engine._');
  out.push('');

  if (since.yardstick_only.length) {
    out.push('## Yardstick changed', '');
    out.push('_A requirement present on only one side — the yardstick itself was edited between runs._', '');
    for (const r of since.yardstick_only) out.push(`- **${r.id}** _(${r.side} only)_ — ${r.title}: ${r.status}.`);
    out.push('');
  }

  out.push('## Findings new since the previous run', '');
  if (findingsDelta.new.length) for (const f of findingsDelta.new) out.push(`- **${f.id}** _(${f.source})_ — ${mdText(f.observation)} — ${(f.evidence || []).map(mdCode).join(', ')}`);
  else out.push('_None._');
  out.push('');

  out.push('## Findings no longer found', '');
  out.push('_Not matched in this run by fingerprint (yardstick/compare.mjs). "No longer found" — never "fixed":');
  out.push('absence of a finding is absence of re-detection, not proof the underlying fact is gone._', '');
  if (findingsDelta.no_longer_found.length) for (const f of findingsDelta.no_longer_found) out.push(`- **${f.id}** _(${f.source})_ — ${mdText(f.observation)} — ${(f.evidence || []).map(mdCode).join(', ')}`);
  else out.push('_None._');
  out.push('');

  if (findingsDelta.not_run_before.length || findingsDelta.not_run_now.length) {
    out.push('## Findings from scanners that ran in only one run', '');
    out.push('_A scanner that did not run in one of the two runs speaks to the record, not to what the repository changed._', '');
    if (findingsDelta.not_run_before.length) out.push(`- **${findingsDelta.not_run_before.length}** recorded this run by a scanner that did not run in the previous one (${[...new Set(findingsDelta.not_run_before.map((f) => f.source))].sort().join(', ')}).`);
    if (findingsDelta.not_run_now.length) out.push(`- **${findingsDelta.not_run_now.length}** recorded in the previous run by a scanner that did not run in this one (${[...new Set(findingsDelta.not_run_now.map((f) => f.source))].sort().join(', ')}); not looked for, never "no longer found".`);
    out.push('');
  }

  out.push('---', `_assay evaluation engine. Run \`${runId}\`, since \`${previousId}\`._`);
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const prevIdx = args.indexOf('--previous');
  const previous = prevIdx > -1 ? args[prevIdx + 1] : null;
  const runDir = args.find((a, i) => !a.startsWith('--') && !(prevIdx > -1 && i === prevIdx + 1));
  if (!runDir || !previous) { console.error('usage: node assay.mjs since <run-dir> --previous <prev-run-dir> [--confidential]'); process.exit(2); }

  let currentDoc, previousDoc;
  try { currentDoc = loadYardstickDoc(runDir); }
  catch (e) { console.error(`✗ since: cannot read ${runDir}'s yardstick.yaml (${e.message})`); process.exit(2); }
  try { previousDoc = loadYardstickDoc(previous); }
  catch (e) { console.error(`✗ since: cannot read ${previous}'s yardstick.yaml (${e.message})`); process.exit(2); }

  let reg;
  try { reg = loadYardstick(); }
  catch (e) { console.error(`✗ since: cannot load the yardstick register (${e.message})`); process.exit(2); }

  // a baseline drawn by an earlier engine is named, with the command that brings it forward (#182, #188)
  const legacy = legacyIn(previous);
  if (legacy.length) { console.error(`✗ since: the previous run ${previous} is not in the current format`); for (const l of legacy) console.error('  • ' + l); process.exit(2); }
  let previousFindings;
  try { previousFindings = loadFindings(previous); }
  catch (e) { console.error(`✗ since: the previous run's findings do not read under the strict reader (${e.message}); a run written before b16800c is brought forward with: node assay.mjs migrate-run ${previous} --write`); process.exit(2); }
  // the previous map, measured by this engine (#183): what differs from its stored
  // measurement is the engine's change, read apart from the repository's
  let previousToday;
  try { previousToday = { version: currentDoc.version, requirements: projectRun(previous, reg) }; }
  catch (e) { console.error(`✗ since: cannot measure the previous run's map with this engine (${e.message})`); process.exit(2); }
  const since = buildSince(previousDoc, currentDoc, reg, previousToday);
  const previousManifest = loadManifest(previous), currentManifest = loadManifest(runDir);
  const findingsDelta = splitFindings(compareFindings(previousFindings, loadFindings(runDir)), previousManifest, currentManifest);
  const engines = { previous: String((previousManifest && previousManifest.engine) ?? ''), current: String((currentManifest && currentManifest.engine) ?? '') };

  const runId = basename(runDir), previousId = basename(previous);
  let proseConfidential = false;
  try { const pp = runProsePath(runDir); if (existsSync(pp)) proseConfidential = parseYaml(readFileSync(pp, 'utf8'))?.confidential === true; } catch {}
  const confidential = process.argv.includes('--confidential') || proseConfidential;

  const yamlOut = toYaml(runId, previousId, since, findingsDelta, engines);
  const mdOut = renderMd(runId, previousId, since, findingsDelta, confidential, engines);

  const yamlDst = viewPath(runDir, 'since');
  mkdirSync(dirname(yamlDst), { recursive: true });
  writeFileSync(yamlDst, yamlOut);
  writeFileSync(sincePagePath(runDir), mdOut);
  console.log(`wrote ${yamlDst} + ${sincePagePath(runDir)} (${since.regressed.length} regressed · ${since.improved.length} improved · ${since.re_ruled.length} re-ruled · ${findingsDelta.new.length} findings new · ${findingsDelta.no_longer_found.length} findings no longer found)`);
}
