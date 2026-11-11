#!/usr/bin/env node
// passes.mjs — practice-review's passes, organized by the requirements they feed (#263).
//
// map/passes.yaml is the one home of the pass-to-requirement map: each pass names the facet and
// census requirements it decides, the discovery questions it asks that no requirement reads, and
// the map/SCHEMA.md sections its outputs need. This module reads it and:
//   - ownershipErrors: every facet- or census-decided requirement of the yardstick has exactly
//     one owning pass, and a pass decides only facet and census rows;
//   - shapeErrors: the passes, their discovery properties (one pass each, never a requirement id)
//     and their schema sections are well formed;
//   - renderBlock / methodDrift: map/METHOD.md's block at the head of each pass is rendered from
//     the map, never a second hand-kept copy;
//   - sliceOf: the opening context a pass subagent reads (the method's ground rules, the passes'
//     introduction, its own pass's section, and the SCHEMA.md sections it names), and its bytes.
// tests/blocks/passes-feed-requirements.mjs holds all of it.
//
// Usage: node map/passes.mjs [--check | --write | --measure [--json]]
//   --check    exit 1 naming each error and each pass block of METHOD.md that drifted (default)
//   --write    rewrite METHOD.md's pass blocks from the map
//   --measure  each pass subagent's opening context in bytes, beside the whole two files
//
// It imports only the reader at load, so map/project.mjs can read the pass list off it; the
// yardstick's population reader is imported when a block is rendered.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PASSES_FILE = join(HERE, 'passes.yaml');
export const METHOD_FILE = join(HERE, 'METHOD.md');
export const SCHEMA_FILE = join(HERE, 'SCHEMA.md');

const DIMENSIONS = ['artifact-legibility', 'context-economy', 'deterministic-gates', 'verification', 'delegation', 'improvement-loop', 'multiplayer'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DECIDED = ['facet', 'census'];
const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** The passes, in order. @param {string} [file] @returns {any[]} */
export function loadPasses(file = PASSES_FILE) {
  const doc = parseYaml(readFileSync(file, 'utf8'));
  if (!doc || !Array.isArray(doc.passes) || !doc.passes.length) throw new Error(`${file}: no passes: list`);
  return doc.passes.map((p) => ({ ...p, decides: asList(p.decides).map(String), discovery: asList(p.discovery), schema: asList(p.schema).map(String) }));
}

/** Every requirement the map leaves unowned or owns twice, and every decides entry that names no
 * facet or census row. @param {any[]} passes @param {any} reg */
export function ownershipErrors(passes, reg) {
  const errors = [];
  const rows = new Map((reg.requirements || []).map((d) => [d.id, d]));
  const owners = new Map();
  for (const p of passes) for (const id of p.decides) {
    const d = rows.get(id);
    if (!d) { errors.push(`pass ${p.id} decides ${id}, which the yardstick does not have`); continue; }
    if (!DECIDED.includes(d.decide?.kind)) { errors.push(`pass ${p.id} decides ${id}, a ${d.decide?.kind} row: a pass decides only facet and census rows`); continue; }
    owners.set(id, [...(owners.get(id) || []), p.id]);
  }
  for (const d of rows.values()) {
    if (!DECIDED.includes(d.decide?.kind)) continue;
    const by = owners.get(d.id) || [];
    if (!by.length) errors.push(`${d.id} (${d.decide.kind}) has no owning pass: name it in one pass's decides (map/passes.yaml)`);
    else if (by.length > 1) errors.push(`${d.id} (${d.decide.kind}) is owned by ${by.length} passes (${by.join(', ')}): one observation, one pass`);
  }
  return errors;
}

/** The map's own shape: ids, order, dimensions, discovery properties, schema sections.
 * @param {any[]} passes @param {any} reg @param {string} schemaText */
export function shapeErrors(passes, reg, schemaText) {
  const errors = [];
  const ids = new Set(), dims = new Set(), props = new Map();
  const reqIds = new Set((reg.requirements || []).map((d) => d.id));
  passes.forEach((p, i) => {
    const at = `pass ${p.id ?? i}`;
    if (!p.id || !KEBAB.test(String(p.id))) errors.push(`${at}: id must be kebab-case`);
    if (ids.has(p.id)) errors.push(`${at}: id appears twice`); ids.add(p.id);
    if (Number(p.pass) !== i + 1) errors.push(`${at}: pass ${p.pass} out of order (want ${i + 1})`);
    if (!DIMENSIONS.includes(p.dimension)) errors.push(`${at}: dimension ${p.dimension} is not one of ${DIMENSIONS.join(', ')}`);
    if (dims.has(p.dimension)) errors.push(`${at}: dimension ${p.dimension} belongs to another pass`); dims.add(p.dimension);
    if (!p.title) errors.push(`${at}: title required`);
    for (const q of p.discovery) {
      if (!q || !KEBAB.test(String(q.property))) { errors.push(`${at}: a discovery question's property must be kebab-case (got ${q?.property})`); continue; }
      if (reqIds.has(q.property)) errors.push(`${at}: discovery property ${q.property} is a requirement id; a property never is (SCHEMA.md §1)`);
      if (props.has(q.property)) errors.push(`${at}: discovery property ${q.property} is already ${props.get(q.property)}'s: one question, one pass`);
      else props.set(q.property, p.id);
      if (!/\?$/.test(String(q.question || ''))) errors.push(`${at}: discovery ${q.property} needs a question ending in "?"`);
    }
    if (!p.schema.length) errors.push(`${at}: names no SCHEMA.md section`);
    for (const s of p.schema) if (sectionByNumber(schemaText, s) === null) errors.push(`${at}: SCHEMA.md has no section ${s}`);
  });
  for (const d of DIMENSIONS) if (!dims.has(d)) errors.push(`no pass carries the dimension ${d}`);
  // the slice covers the outputs: a census row's census is §6b's, a facet row's forced fields are
  // §4's, and the effect-channel triage is §6e's
  const rows = new Map((reg.requirements || []).map((d) => [d.id, d]));
  for (const p of passes) for (const id of p.decides) {
    const d = rows.get(id);
    const need = d?.decide?.kind === 'census' ? ['6b'] : d?.decide?.kind === 'facet' ? (d.decide.rule === 'channels-triaged' ? ['6e'] : ['4']) : [];
    for (const s of need) if (!p.schema.includes(s)) errors.push(`pass ${p.id} decides ${id}, whose output SCHEMA.md §${s} states, and its schema: does not name §${s}`);
  }
  return errors;
}

// ── sections ────────────────────────────────────────────────────────────────
// A section runs from its heading to the next heading of the same or a higher level, or the next
// numbered SCHEMA.md section (§1 ends at "### 2a." although 2a is deeper); lines inside a fenced
// block are never headings (SCHEMA.md's YAML examples open lines with "# ").
function headings(text) {
  const lines = text.split('\n');
  const out = [];
  let fenced = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) { fenced = !fenced; return; }
    const m = !fenced && /^(#{1,6}) (.*)$/.exec(l);
    if (m) out.push({ line: i, level: m[1].length, title: m[2] });
  });
  return { lines, out };
}
const NUMBERED = /^\d+[a-z]?\. /;
function sectionAt(text, find) {
  const { lines, out } = headings(text);
  const k = out.findIndex(find);
  if (k < 0) return null;
  const h = out[k];
  const next = out.slice(k + 1).find((n) => n.level <= h.level || (NUMBERED.test(h.title) && NUMBERED.test(n.title)));
  return lines.slice(h.line, next ? next.line : lines.length).join('\n').replace(/\s+$/, '') + '\n';
}
/** SCHEMA.md's section by number ("1", "6b"), or null. @param {string} text @param {string} n */
export function sectionByNumber(text, n) {
  return sectionAt(text, (h) => h.level <= 3 && h.title.startsWith(`${n}. `));
}
/** A section by the start of its heading's title, or null. @param {string} text @param {string} title */
export function sectionByTitle(text, title) {
  return sectionAt(text, (h) => h.title.startsWith(title));
}
// the passes' introduction: the "Passes 1–7" heading up to the first pass's own section
function passesIntro(method) {
  const s = sectionByTitle(method, 'Passes 1–7');
  if (!s) return null;
  const i = s.search(/^### Pass 1 /m);
  return i < 0 ? s : s.slice(0, i).replace(/\s+$/, '') + '\n';
}

/** A pass subagent's opening context: the method's ground rules, the passes' introduction, its
 * own pass's section, and the SCHEMA.md sections the map names, in that order. Throws on a piece
 * it cannot find, never returns a short slice.
 * @param {any} pass @param {{ method?: string, schema?: string }} [texts] */
export function sliceOf(pass, { method = readFileSync(METHOD_FILE, 'utf8'), schema = readFileSync(SCHEMA_FILE, 'utf8') } = {}) {
  const pieces = [
    ['METHOD.md', 'Ground rules', sectionByTitle(method, 'Ground rules')],
    ['METHOD.md', 'Passes 1–7', passesIntro(method)],
    ['METHOD.md', `Pass ${pass.pass}`, sectionByTitle(method, `Pass ${pass.pass} — `)],
    ...pass.schema.map((n) => ['SCHEMA.md', `§${n}`, sectionByNumber(schema, n)]),
  ];
  for (const [file, name, text] of pieces) if (text === null) throw new Error(`${file} has no section ${name} (pass ${pass.id})`);
  const text = pieces.map((p) => p[2]).join('\n');
  return { pass: pass.id, pieces: pieces.map(([file, name, t]) => ({ file, name, bytes: Buffer.byteLength(/** @type {string} */ (t)) })), text, bytes: Buffer.byteLength(text) };
}

// ── METHOD.md's pass blocks ─────────────────────────────────────────────────
const open = (id) => `<!-- passes:${id} -->`;
const close = (id) => `<!-- /passes:${id} -->`;

/** The block at the head of a pass's section, rendered from the map and the yardstick.
 * @param {any} pass @param {any} reg */
export async function renderBlock(pass, reg) {
  const { parseCheck } = await import('../yardstick/population.mjs');
  const terms = (reg.members || []).map((m) => m.term);
  const rows = new Map((reg.requirements || []).map((d) => [d.id, d]));
  const decides = pass.decides.map((id) => {
    const d = rows.get(id);
    if (!d) throw new Error(`pass ${pass.id} decides ${id}, which the yardstick does not have`);
    const c = parseCheck(d.check, terms);
    if (!c) throw new Error(`${id}: its check names no population term (yardstick/population.mjs)`);
    const how = d.decide.kind === 'census' ? `census \`${asList(d.decide.measures)[0]}\`` : `facet \`${d.decide.rule}\``;
    return `  - \`${id}\` (${how}): population every ${c.term}; asks: ${c.question}`;
  });
  const discovery = pass.discovery.map((q) => `  - \`${q.property}\`: ${q.question}`);
  return [
    open(pass.id),
    'Rendered from `map/passes.yaml` (`node map/passes.mjs --write`); never hand-edited.',
    '',
    decides.length ? '- **Decides**, asked of every member of each population:' : '- **Decides** no facet or census requirement.',
    ...decides,
    discovery.length ? '- **Discovery**, read by no requirement yet; a finding answering one carries its `property:`:' : '- **Discovery**: none.',
    ...discovery,
    `- **Opens on** the ground rules, the passes' introduction, this section, and \`SCHEMA.md\` ${pass.schema.map((s) => `§${s}`).join(', ')}.`,
    close(pass.id),
  ].join('\n');
}

/** METHOD.md with every pass block rendered, and the passes whose block drifted or is missing.
 * @param {any[]} passes @param {any} reg @param {string} method */
export async function methodDrift(passes, reg, method) {
  let out = method;
  const drift = [];
  for (const p of passes) {
    const re = new RegExp(`${open(p.id)}[\\s\\S]*?${close(p.id)}`);
    const want = await renderBlock(p, reg);
    const m = re.exec(out);
    if (!m) { drift.push(`${p.id}: METHOD.md has no ${open(p.id)} … ${close(p.id)} block`); continue; }
    if (m[0] !== want) { drift.push(`${p.id}: METHOD.md's pass block differs from map/passes.yaml (node map/passes.mjs --write)`); out = out.replace(re, () => want); }
  }
  const stray = [...method.matchAll(/<!-- passes:([\w-]+) -->/g)].map((m) => m[1]).filter((id) => !passes.some((p) => p.id === id));
  for (const id of stray) drift.push(`${id}: METHOD.md has a pass block for a pass map/passes.yaml does not name`);
  return { text: out, drift };
}

/** Each pass's opening context in bytes, beside the whole two files a pass read before (#263). */
export function measure(passes = loadPasses()) {
  const method = readFileSync(METHOD_FILE, 'utf8'), schema = readFileSync(SCHEMA_FILE, 'utf8');
  const whole = Buffer.byteLength(method) + Buffer.byteLength(schema);
  return { whole, passes: passes.map((p) => { const s = sliceOf(p, { method, schema }); return { pass: p.id, bytes: s.bytes, pieces: s.pieces }; }) };
}

// The command runs once this module has finished loading: the yardstick's reader imports
// map/project.mjs, which imports this module, so a top-level await here would wait on itself.
async function main() {
  const args = process.argv.slice(2);
  const passes = loadPasses();
  if (args.includes('--measure')) {
    const m = measure(passes);
    if (args.includes('--json')) process.stdout.write(JSON.stringify(m, null, 2) + '\n');
    else {
      console.log(`whole METHOD.md + SCHEMA.md: ${m.whole} bytes`);
      for (const p of m.passes) console.log(`${p.pass.padEnd(13)} ${String(p.bytes).padStart(7)} bytes (${Math.round((100 * p.bytes) / m.whole)}%): ${p.pieces.map((x) => `${x.file} ${x.name}`).join(', ')}`);
    }
    process.exit(0);
  }
  const { loadYardstick } = await import('../yardstick/measure.mjs');
  const reg = loadYardstick();
  const method = readFileSync(METHOD_FILE, 'utf8');
  const errors = [...ownershipErrors(passes, reg), ...shapeErrors(passes, reg, readFileSync(SCHEMA_FILE, 'utf8'))];
  const { text, drift } = await methodDrift(passes, reg, method);
  if (args.includes('--write')) {
    if (text !== method) writeFileSync(METHOD_FILE, text);
    const missing = drift.filter((d) => !/differs/.test(d));
    for (const e of [...errors, ...missing]) console.error(`✗ ${e}`);
    if (errors.length || missing.length) process.exit(1);
    console.log(`✓ METHOD.md's pass blocks rendered from map/passes.yaml (${text === method ? 'unchanged' : 'rewritten'})`);
    process.exit(0);
  }
  for (const e of [...errors, ...drift]) console.error(`✗ ${e}`);
  if (errors.length || drift.length) process.exit(1);
  console.log(`✓ map/passes.yaml: ${passes.length} passes, every facet and census requirement owned once, METHOD.md in step`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(`✗ passes: ${e.message}`); process.exit(2); });
