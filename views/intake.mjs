#!/usr/bin/env node
// intake.mjs — Intake: can this map be carried? The floor-tagged requirements
// (yardstick/requirements.yaml tags: [floor]) — the bar a repository must clear
// to be taken on at all. Reads ONLY the yardstick's measurement (yardstick.yaml)
// plus the yardstick (title/check/tier/topic) and the run manifest (what was
// not seen this run) — never findings directly.
//
// Writes views/intake.yaml (data) + INTAKE.md (plain, neutral: no prices, no
// verdict, no severity words) at the run root. Also carries "What the owner
// told us" — the run's own copied packet (owner/manifest.yaml, owner/PACKET.md),
// read for FACTS only; assay issues no verdict on any of it. Unknowns are
// shown as "unknown", never dropped — an owner's packet answering "unsure" is
// still an answer worth keeping visible.
//
// Usage: node assay.mjs intake <run-dir> [--stdout]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { buildRows, toYaml, basisNote, contextText, joinContradictions } from './rows.mjs';
import { loadYardstick, loadContradictions, loadRunPacket } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { viewPath, intakePagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';
import { mdText as t } from '../lib/display.mjs';
import { buildOwnerBlock, ownerYaml, renderOwnerSection } from './owner.mjs';

// Let the owner's own credential count inform d-credentials-enumerated as a
// NOTE only, on whichever list (open/met/to_run) the run itself put the row —
// it never changes the row's run-decided status (yardstick/README.md: a claim
// never lets presence stand in for enforcement).
function annotateCredentialsRow(built, owner) {
  if (!owner || !owner.credentials || !owner.credentials.count) return built;
  const n = owner.credentials.count;
  const suffix = ` (the owner listed ${n} credential${n === 1 ? '' : 's'})`;
  for (const list of [built.open, built.met, built.to_run]) {
    const row = list.find((r) => r.id === 'd-credentials-enumerated');
    if (row) row.note = `${row.note}${suffix}`;
  }
  return built;
}

export function renderMd(runId, built, confidential = false, contradictions = [], owner = null) {
  const { open, met, to_run, not_applicable = [], not_seen } = built;
  const out = [];
  out.push('---', 'type: doc', ...(confidential ? ['confidential: true'] : []), `title: "Intake — ${runId}"`, '---', '');
  out.push(`# Intake — ${runId}`, '');
  out.push('_Can this map be carried? The floor: the requirements a repository must clear to be taken');
  out.push('on at all. Plain and neutral — what is open, what is met, what is still to run, what was not');
  out.push('seen. No prices, no verdict._', '');
  out.push(`**${open.length} open · ${met.length} met · ${to_run.length} to run · ${not_applicable.length} not applicable** of ${open.length + met.length + to_run.length + not_applicable.length} floor requirements.`, '');

  out.push('## Open', '');
  if (open.length) {
    for (const r of open) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Today: ${r.status}${basisNote(r)}${r.of != null ? ` (${r.met} of ${r.of})` : ''} — ${t(r.note)}. Proving check: ${r.check}.${contextText(r)}`);
  } else out.push('_Nothing open._');
  out.push('');

  out.push('## Met', '');
  if (met.length) {
    for (const r of met) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${t(r.note)} (met${basisNote(r)}${r.findings && r.findings.length ? `; evidence ${r.findings.join(', ')}` : ''}).${contextText(r)}`);
  } else out.push('_Nothing met yet._');
  out.push('');

  out.push('## To run', '');
  if (to_run.length) {
    for (const r of to_run) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Decided by ${r.decided_by}. Proving check: ${r.check}. ${t(r.note)}${contextText(r)}`);
  } else out.push('_Nothing left to run._');
  out.push('');

  out.push('## Not applicable', '');
  out.push('_Decided from the map, never a packet claim — listed separately, never counted as met._', '');
  if (not_applicable.length) {
    for (const r of not_applicable) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${t(String(r.note || '').replace(/\.$/, ''))}${basisNote(r)}.`);
  } else out.push('_None._');
  out.push('');

  out.push('## Contradicted claims', '');
  out.push("_A repository's own packet said satisfied; this run found the mechanism absent. Never silently");
  out.push("overwritten — the claim, the run's own status, and its findings all stand, side by side._", '');
  if (contradictions.length) {
    for (const c of contradictions) out.push(`- **${c.id}** _(claimed satisfied)_ — ${c.title}. This run: ${c.run_status}${c.findings.length ? ` (${c.findings.join(', ')})` : ''}.`);
  } else out.push('_None._');
  out.push('');

  out.push('## Not seen this run', '');
  if (not_seen.length) {
    for (const r of not_seen) out.push(`- **${r.scanner}** — ${r.status}: ${t(r.reason)}`);
  } else out.push('_Every adopted scanner ran._');
  out.push('');

  out.push(...renderOwnerSection(owner));

  out.push('---', `_assay evaluation engine. Run \`${runId}\`._`);
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('usage: node assay.mjs intake <run-dir> [--stdout]'); process.exit(2); }
  const built = buildRows(runDir, 'floor');
  if (!built) { console.error(`no yardstick measurement under ${runDir} — run: node assay.mjs measure ${runDir} --write`); process.exit(2); }
  const reg = loadYardstick();
  const runId = basename(runDir);
  const contradictions = joinContradictions(loadContradictions(runDir), reg);
  const owner = buildOwnerBlock(loadRunPacket(runDir));
  annotateCredentialsRow(built, owner);
  const yamlOut = toYaml('intake', runId, reg.version, built, contradictions) + ownerYaml(owner);
  // run-level confidentiality, the same rule as the Improve writers: the flag or views/improve/prose.yaml
  let proseConfidential = false;
  try { const pp = runProsePath(runDir); if (existsSync(pp)) proseConfidential = parseYaml(readFileSync(pp, 'utf8'))?.confidential === true; } catch {}
  const mdOut = renderMd(runId, built, process.argv.includes('--confidential') || proseConfidential, contradictions, owner);
  if (process.argv.includes('--stdout')) { process.stdout.write(mdOut); }
  else {
    const yamlDst = viewPath(runDir, 'intake');
    mkdirSync(dirname(yamlDst), { recursive: true });
    writeFileSync(yamlDst, yamlOut);
    writeFileSync(intakePagePath(runDir), mdOut);
    console.log(`wrote ${yamlDst} + ${intakePagePath(runDir)} (${built.open.length} open · ${built.met.length} met · ${built.to_run.length} to run · ${contradictions.length} contradicted)`);
  }
}
