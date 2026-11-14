// lens.mjs — a named ordering of the fix sequence over its recorded dimensions (#319, slice 3).
//
// A lens is data (views/lenses.yaml, or the operator's own file the run record names): the
// quadrants it shows in its order, whether the items no quadrant takes (not valued) come last or
// are left out, and a tie-break inside a quadrant from a closed list (TIE_BREAKS). Applying a lens
// sorts the items; it never writes or reads past an item's recorded confidence, consequence and
// quadrant (views/improve/quadrants.mjs), and it never combines them into a number. A quadrant or
// the not-valued items a lens leaves out are counted, never dropped silently (CLAUDE.md rule 3).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadManifest } from '../../map/project.mjs';
import { CONSEQUENCE } from '../../map/consequence.mjs';
import { QUADRANTS, NOT_VALUED } from './quadrants.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// the built-in lens file, and the path the run record names it by (relative to assay's root, so a
// record written on one machine reads on another)
export const BUILTIN_LENS_FILE = 'views/lenses.yaml';
const BUILTIN_LENS_PATH = join(HERE, '..', 'lenses.yaml');
const LENS_SCHEMA = 'assay.lenses';
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NOT_VALUED_PLACES = ['last', 'left-out'];

// THE TIE-BREAKS a lens may name, closed. `seq` is the item list in the sequence key's order
// (views/improve/sequence.mjs KEY), so `sequence-key` is that order kept; each returns a comparator.
const firstId = (s) => [...new Set((s.ps || []).map((p) => String(p.f.id)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0] ?? '';
const consRank = (s) => { const v = s.consequence && s.consequence.value; return CONSEQUENCE.includes(v) ? CONSEQUENCE.indexOf(v) : CONSEQUENCE.length; };
export const TIE_BREAKS = {
  'sequence-key': (at) => (a, b) => at.get(a) - at.get(b),
  consequence: (at) => (a, b) => consRank(a) - consRank(b) || at.get(a) - at.get(b),
  'finding-id': (at) => (a, b) => firstId(a).localeCompare(firstId(b), 'en', { numeric: true }) || at.get(a) - at.get(b),
};

// Every problem with a lens file, as a list (empty when it holds).
export function checkLenses(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['the lens file must be a map'];
  if (doc.schema !== LENS_SCHEMA) e.push(`schema must be ${LENS_SCHEMA}`);
  if (doc.version !== 1) e.push('version must be 1');
  for (const k of Object.keys(doc)) if (!['schema', 'version', 'default', 'lenses'].includes(k)) e.push(`unknown key "${k}" (schema, version, default, lenses)`);
  if (!Array.isArray(doc.lenses) || !doc.lenses.length) return [...e, 'lenses must list at least one lens'];
  const names = new Set();
  doc.lenses.forEach((l, i) => {
    const at = `lenses[${i}]${l && l.name ? ` (${l.name})` : ''}`;
    if (!l || typeof l !== 'object' || Array.isArray(l)) { e.push(`${at}: must be a map`); return; }
    for (const k of Object.keys(l)) if (!['name', 'says', 'quadrants', 'not_valued', 'tie_break'].includes(k)) e.push(`${at}: unknown key "${k}" (name, says, quadrants, not_valued, tie_break)`);
    if (typeof l.name !== 'string' || !NAME.test(l.name)) e.push(`${at}: name must match ${NAME}`);
    else if (names.has(l.name)) e.push(`${at}: name appears twice`); else names.add(l.name);
    if (typeof l.says !== 'string' || !l.says.trim()) e.push(`${at}: says must state what the lens is for`);
    if (!Array.isArray(l.quadrants) || !l.quadrants.length) e.push(`${at}: quadrants must list at least one of ${QUADRANTS.join(', ')}`);
    else {
      for (const q of l.quadrants) if (!QUADRANTS.includes(q)) e.push(`${at}: quadrants names "${q}", which is not a quadrant (${QUADRANTS.join(', ')})`);
      if (new Set(l.quadrants).size !== l.quadrants.length) e.push(`${at}: quadrants lists a quadrant twice`);
    }
    if (!NOT_VALUED_PLACES.includes(l.not_valued)) e.push(`${at}: not_valued must be one of ${NOT_VALUED_PLACES.join(', ')} (got ${JSON.stringify(l.not_valued)})`);
    if (!Object.hasOwn(TIE_BREAKS, l.tie_break)) e.push(`${at}: tie_break "${l.tie_break}" is not one of ${Object.keys(TIE_BREAKS).join(', ')}`);
  });
  if (typeof doc.default !== 'string' || !names.has(doc.default)) e.push(`default must name one of the file's lenses (got ${JSON.stringify(doc.default)})`);
  return e;
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
// the path a lens file is read from: the built-in by its recorded name, else as given
const lensPath = (file) => (file === BUILTIN_LENS_FILE ? BUILTIN_LENS_PATH : resolve(file));

// Loads one lens from a file (the file's default when `name` is null); throws, naming every
// problem, when the file does not hold or names no such lens (fail closed: never a default lens
// in place of the one asked for).
export function loadLens(file = BUILTIN_LENS_FILE, name = null) {
  const path = lensPath(file);
  if (!existsSync(path)) throw new Error(`lens file ${file} does not exist`);
  const text = readFileSync(path, 'utf8');
  let doc;
  try { doc = parseYaml(text); } catch (err) { throw new Error(`lens file ${file} does not parse: ${err.message}`); }
  const problems = checkLenses(doc);
  if (problems.length) throw new Error(`lens file ${file} refused:\n  ${problems.join('\n  ')}`);
  const want = name || doc.default;
  const l = doc.lenses.find((x) => x.name === want);
  if (!l) throw new Error(`lens file ${file} has no lens "${want}" (${doc.lenses.map((x) => x.name).join(', ')})`);
  return { name: l.name, says: l.says.trim(), quadrants: [...l.quadrants], not_valued: l.not_valued, tie_break: l.tie_break, file, sha256: sha256(text) };
}

function lensRecordProblems(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['must be { name, file, sha256 }'];
  const e = [];
  if (typeof rec.name !== 'string' || !NAME.test(rec.name)) e.push('name must name the lens');
  if (typeof rec.file !== 'string' || !rec.file.trim()) e.push('file must name the lens file');
  if (typeof rec.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(rec.sha256)) e.push('sha256 must be the file\'s 64-hex digest');
  for (const k of Object.keys(rec)) if (!['name', 'file', 'sha256'].includes(k)) e.push(`unknown key "${k}" (name, file, sha256)`);
  return e;
}

// The lens a run reads: the one its run record names (`lens: { name, file, sha256 }`, map/SCHEMA.md
// §5a, written by `compile --lens` / `--lens-file`), held to the digest recorded with it, else the
// built-in file's default.
export function lensOfRun(runDir) {
  const m = runDir ? loadManifest(runDir) : null;
  const rec = m && m.lens;
  if (rec === undefined || rec === null) return loadLens(BUILTIN_LENS_FILE, null);
  const problems = lensRecordProblems(rec);
  if (problems.length) throw new Error(`map/scanners.yaml lens: ${problems.join('; ')}`);
  const l = loadLens(rec.file, rec.name);
  if (l.sha256 !== rec.sha256) throw new Error(`lens file ${rec.file} changed since the run record named it (sha256 ${l.sha256}, recorded ${rec.sha256}): name it again with compile --lens or --lens-file`);
  return l;
}

// Orders `items` (in the sequence key's order, each carrying `quadrant`: { value, rule } or null
// when not valued) by `lens`. Returns { ordered, leftOut }: `ordered` the items the lens shows, in
// its order; `leftOut` [{ quadrant, items }], one per quadrant (or not-valued) the lens leaves out
// that holds any item, so a caller can say how many and which. An item's own fields are never
// written here.
export function applyLens(items, lens) {
  const at = new Map(items.map((s, i) => [s, i]));
  const cmp = TIE_BREAKS[lens.tie_break](at);
  const group = (q) => items.filter((s) => (q === NOT_VALUED ? !s.quadrant : s.quadrant && s.quadrant.value === q)).sort(cmp);
  const ordered = [];
  for (const q of lens.quadrants) ordered.push(...group(q));
  if (lens.not_valued === 'last') ordered.push(...group(NOT_VALUED));
  const shown = [...lens.quadrants, ...(lens.not_valued === 'last' ? [NOT_VALUED] : [])];
  const leftOut = [...QUADRANTS, NOT_VALUED].filter((q) => !shown.includes(q)).map((q) => ({ quadrant: q, items: group(q) })).filter((x) => x.items.length);
  return { ordered, leftOut };
}
