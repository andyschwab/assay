// checklist-cut.mjs — a committed answered sweep, cut down to what the practice-review lane writes in
// checklist mode (#338): map/terrain.md, map/raw/enumerate.json (its input), map/effect-triage.yaml,
// and the delegation pass's effect findings, each finding's links (`reaches:`, `explained_by:`,
// `escapes:`) kept to the findings the cut keeps; the run record is the sweep's own, the lane's row stating `mode: checklist`, its pass
// record kept to the delegation pass and its spend and duration dropped (the cut cost nothing). Nothing is re-judged: every kept line is the sweep's as written.
// Used by tests/blocks/checklist-run-measures.mjs and tests/blocks/checklist-sweep-set.mjs.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const CHECKLIST_FILES = ['map/terrain.md', 'map/raw/enumerate.json', 'map/effect-triage.yaml'];
export const DELEGATION = 'map/findings/practice-review-delegation.yaml';

/** The effect findings of a findings file, as written: its comment head and each effect entry.
 * @param {string} text */
export function effectEntries(text) {
  const parts = text.split(/^(?=- id: )/m);
  const head = parts[0].startsWith('- id: ') ? '' : parts.shift();
  const kept = parts.filter((p) => /^ {2}subject_type: effect\s*$/m.test(p));
  const ids = new Set(kept.map((p) => p.match(/^- id: (\S+)/)[1]));
  // the links validate resolves (reaches, explained_by, escapes): no row reads them, and a cut keeps
  // only the links to findings it keeps
  const trimmed = kept.map((p) => p.replace(/^( {2}(?:reaches|explained_by|escapes): )\[([^\]]*)\]\s*$/gm, (_, k, list) => {
    const keep = list.split(',').map((x) => x.trim()).filter((x) => ids.has(x));
    return keep.length ? `${k}[${keep.join(', ')}]` : '';
  }).replace(/\n{2,}/g, '\n'));
  return { text: head + trimmed.join(''), ids: [...ids] };
}

/** The run record with the lane's row in checklist mode. @param {string} text */
export function checklistRecord(text, scanner = 'practice-review') {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l === `  ${scanner}:`);
  if (at < 0) throw new Error(`no ${scanner} row`);
  let end = lines.findIndex((l, i) => i > at && /^ {2}\S/.test(l));
  if (end < 0) end = lines.length;
  const row = lines.slice(at, end);
  const out = [];
  let inPasses = false, keepPass = false;
  for (const l of row) {
    if (/^ {4}passes:\s*$/.test(l)) { inPasses = true; out.push(l); continue; }
    if (inPasses && /^ {4}\S/.test(l)) inPasses = false;
    if (inPasses) {
      const m = l.match(/^ {6}([\w-]+):\s*$/);
      if (m) keepPass = m[1] === 'delegation';
      if (keepPass) out.push(l);
      continue;
    }
    // the full sweep's cost is not the cut's: a cut-down cost nothing, so it records none
    if (/^ {4}(spend|duration):/.test(l)) continue;
    out.push(l);
    if (/^ {4}status: ran\s*$/.test(l)) out.push('    mode: checklist');
  }
  return [...lines.slice(0, at), ...out, ...lines.slice(end)].join('\n');
}

/** Cut one sweep run dir down into dest; returns { dest, ids } (the effect findings kept).
 * @param {string} sweep @param {string} dest @param {{ record?: boolean }} [opts] */
export function cutToChecklist(sweep, dest, { record = true } = {}) {
  for (const f of CHECKLIST_FILES) {
    if (!existsSync(join(sweep, f))) throw new Error(`${sweep} has no ${f}: not an answered sweep`);
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    copyFileSync(join(sweep, f), join(dest, f));
  }
  const { text, ids } = effectEntries(readFileSync(join(sweep, DELEGATION), 'utf8'));
  mkdirSync(dirname(join(dest, DELEGATION)), { recursive: true });
  writeFileSync(join(dest, DELEGATION), text);
  if (record) writeFileSync(join(dest, 'map', 'scanners.yaml'), checklistRecord(readFileSync(join(sweep, 'map', 'scanners.yaml'), 'utf8')));
  return { dest, ids };
}
