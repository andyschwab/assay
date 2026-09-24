#!/usr/bin/env node
// intake.mjs — Intake: can this map be carried? The floor-tagged requirements
// (yardstick/requirements.yaml tags: [floor]) — the bar a repository must clear
// to be taken on at all. Reads ONLY the yardstick's measurement
// (eval/yardstick.yaml, falling back to the legacy eval/view-descriptors.yaml)
// plus the register (title/check/tier/topic) and the run manifest (what was
// not seen this run) — never findings directly.
//
// Writes eval/intake.yaml (data) + INTAKE.md (plain, neutral: no prices, no
// verdict, no severity words) at the run root.
//
// Usage: node assay.mjs intake <run-dir> [--stdout]
import { writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { buildRows, toYaml } from './floor-fleet.mjs';
import { loadRegistry } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';

export function renderMd(runId, built) {
  const { open, met, to_run, not_seen } = built;
  const out = [];
  out.push('---', 'type: doc', `title: "Intake — ${runId}"`, '---', '');
  out.push(`# Intake — ${runId}`, '');
  out.push('_Can this map be carried? The floor: the requirements a repository must clear to be taken');
  out.push('on at all. Plain and neutral — what is open, what is met, what is still to run, what was not');
  out.push('seen. No prices, no verdict._', '');
  out.push(`**${open.length} open · ${met.length} met · ${to_run.length} to run** of ${open.length + met.length + to_run.length} floor requirements.`, '');

  out.push('## Open', '');
  if (open.length) {
    for (const r of open) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Today: ${r.status}${r.of != null ? ` (${r.met} of ${r.of})` : ''} — ${r.note}. Proving check: ${r.check}.`);
  } else out.push('_Nothing open._');
  out.push('');

  out.push('## Met', '');
  if (met.length) {
    for (const r of met) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.note}`);
  } else out.push('_Nothing met yet._');
  out.push('');

  out.push('## To run', '');
  if (to_run.length) {
    for (const r of to_run) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Decided by ${r.decided_by}. Proving check: ${r.check}. ${r.note}`);
  } else out.push('_Nothing left to run._');
  out.push('');

  out.push('## Not seen this run', '');
  if (not_seen.length) {
    for (const r of not_seen) out.push(`- **${r.scanner}** — ${r.status}: ${r.reason}`);
  } else out.push('_Every adopted scanner ran._');
  out.push('');

  out.push('---', `_assay evaluation engine. Run \`${runId}\`._`);
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('usage: node assay.mjs intake <run-dir> [--stdout]'); process.exit(2); }
  const built = buildRows(runDir, 'floor');
  if (!built) { console.error(`no yardstick measurement under ${runDir} — run: node assay.mjs measure ${runDir} --write`); process.exit(2); }
  const reg = loadRegistry();
  const runId = basename(runDir.replace(/\/eval\/?$/, ''));
  const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
  const runRoot = basename(evalDir) === 'eval' ? join(evalDir, '..') : evalDir;
  const yamlOut = toYaml('intake', runId, reg.version, built);
  const mdOut = renderMd(runId, built);
  if (process.argv.includes('--stdout')) { process.stdout.write(mdOut); }
  else {
    writeFileSync(join(evalDir, 'intake.yaml'), yamlOut);
    writeFileSync(join(runRoot, 'INTAKE.md'), mdOut);
    console.log(`wrote ${join(evalDir, 'intake.yaml')} + ${join(runRoot, 'INTAKE.md')} (${built.open.length} open · ${built.met.length} met · ${built.to_run.length} to run)`);
  }
}
