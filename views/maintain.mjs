#!/usr/bin/env node
// maintain.mjs — Maintain: is this map still healthy? The fleet-tagged
// requirements (yardstick/requirements.yaml tags: [fleet]) — what a steward's
// routines read, all of them, each also stamped `floor: true|false` (whether
// it is also a floor requirement). Reads ONLY the yardstick's measurement
// (yardstick.yaml) plus the yardstick (title/check/tier/topic) and the run
// manifest (what was not seen this run) — never findings directly.
//
// Writes views/maintain.yaml (data) + MAINTAIN.md (plain, neutral: no prices,
// no verdict, no severity words) at the run root.
//
// Usage: node assay.mjs maintain <run-dir> [--stdout]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { buildRows, toYaml, basisNote } from './floor-fleet.mjs';
import { loadYardstick } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { viewPath, maintainPagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';

export function renderMd(runId, built, confidential = false) {
  const { open, met, to_run, not_seen } = built;
  const out = [];
  out.push('---', 'type: doc', ...(confidential ? ['confidential: true'] : []), `title: "Maintain — ${runId}"`, '---', '');
  out.push(`# Maintain — ${runId}`, '');
  out.push('_Is this map still healthy? The fleet: what a steward\'s routines read, floor and');
  out.push('non-floor requirements together, each marked whether it is also a floor requirement.');
  out.push('Plain and neutral — what is open, what is met, what is still to run, what was not seen.');
  out.push('No prices, no verdict._', '');
  out.push(`**${open.length} open · ${met.length} met · ${to_run.length} to run** of ${open.length + met.length + to_run.length} fleet requirements.`, '');

  out.push('## Open', '');
  if (open.length) {
    for (const r of open) out.push(`- **${r.id}**${r.floor ? ' _(floor)_' : ''} _(${r.tier}/${r.topic})_ — ${r.title}. Today: ${r.status}${basisNote(r)}${r.of != null ? ` (${r.met} of ${r.of})` : ''} — ${r.note}. Proving check: ${r.check}.`);
  } else out.push('_Nothing open._');
  out.push('');

  out.push('## Met', '');
  if (met.length) {
    for (const r of met) out.push(`- **${r.id}**${r.floor ? ' _(floor)_' : ''} _(${r.tier}/${r.topic})_ — ${r.title}. ${r.note} (met${basisNote(r)}).`);
  } else out.push('_Nothing met yet._');
  out.push('');

  out.push('## To run', '');
  if (to_run.length) {
    for (const r of to_run) out.push(`- **${r.id}**${r.floor ? ' _(floor)_' : ''} _(${r.tier}/${r.topic})_ — ${r.title}. Decided by ${r.decided_by}. Proving check: ${r.check}. ${r.note}`);
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
  if (!runDir) { console.error('usage: node assay.mjs maintain <run-dir> [--stdout]'); process.exit(2); }
  const built = buildRows(runDir, 'fleet', { withFloor: true });
  if (!built) { console.error(`no yardstick measurement under ${runDir} — run: node assay.mjs measure ${runDir} --write`); process.exit(2); }
  const reg = loadYardstick();
  const runId = basename(runDir);
  const yamlOut = toYaml('maintain', runId, reg.version, built);
  // run-level confidentiality, the same rule as the Improve writers: the flag or views/improve/prose.yaml
  let proseConfidential = false;
  try { const pp = runProsePath(runDir); if (existsSync(pp)) proseConfidential = parseYaml(readFileSync(pp, 'utf8'))?.confidential === true; } catch {}
  const mdOut = renderMd(runId, built, process.argv.includes('--confidential') || proseConfidential);
  if (process.argv.includes('--stdout')) { process.stdout.write(mdOut); }
  else {
    const yamlDst = viewPath(runDir, 'maintain');
    mkdirSync(dirname(yamlDst), { recursive: true });
    writeFileSync(yamlDst, yamlOut);
    writeFileSync(maintainPagePath(runDir), mdOut);
    console.log(`wrote ${yamlDst} + ${maintainPagePath(runDir)} (${built.open.length} open · ${built.met.length} met · ${built.to_run.length} to run)`);
  }
}
