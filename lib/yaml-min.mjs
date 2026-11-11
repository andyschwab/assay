// yaml-min — a zero-dependency reader for the YAML subset assay's files are written in,
// shared by every engine tool that reads YAML. What it reads, and what it refuses with the
// plain form to write instead, has one home: map/SCHEMA.md § "What the reader reads"
// (tests/blocks/yaml-subset.mjs holds that section and this reader to each other). It reads
// what has one meaning and THROWS on anything else: the tools fail closed on input they
// cannot parse, from a fail-closed lesson: a checker that silently accepts unparseable input
// hides the very thing it exists to catch.
export class YamlError extends Error {}

// THE quote helper every writer uses for a double-quoted scalar: a backslash is
// escaped before a quote (so `\\host` and `a\"b` read back as written), and a
// line break collapses to a space (a multi-line value would end the scalar).
export const q = (s) => `"${String(s).replace(/\r?\n|\r/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const indentOf = (s) => s.length - s.replace(/^ +/, '').length;

function stripInlineComment(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && inD) i++;   // an escaped character inside a double-quoted scalar
    else if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t'))
      return s.slice(0, i).replace(/\s+$/, '');
  }
  return s;
}

// The refusals, each naming the plain form to write instead (SCHEMA.md § "What the reader
// reads" lists the same alternatives; the yaml-subset block holds the two together).
const PLAIN = {
  nested: 'write the inner collection as block lines under its key (key: value, - item)',
  anchor: 'write the value in full at each place it is used',
  alias: 'write the value in full here',
  tag: 'drop the tag and write the plain value (quote it to keep it a string)',
  document: 'write one document per file',
  blockIndicator: 'write the block scalar as > (folded) or | (literal)',
  flowMap: 'write the map as block lines (key: value)',
};
const refuse = (what, v, plain) => new YamlError(`unsupported YAML construct (fail-closed): ${what} "${v}": ${plain}`);

function scalar(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~' || v === '') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\([\\"])/g, '$1');
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  // FAIL CLOSED on a plain scalar that starts with a YAML indicator this reader does not
  // read: returned as a string it would be a misleading value (an adapter row written
  // `{domain: x}` inside a flow list would become an unparsed string and drop its findings)
  if (v.startsWith('{') || v.startsWith('[')) throw refuse('a flow collection inside a flow collection', v, PLAIN.nested);
  if (v.startsWith('&')) throw refuse('an anchor', v, PLAIN.anchor);
  if (v.startsWith('*')) throw refuse('an alias', v, PLAIN.alias);
  if (v.startsWith('!')) throw refuse('a tag', v, PLAIN.tag);
  if (v.startsWith('>') || v.startsWith('|')) throw refuse('a block scalar header', v, PLAIN.blockIndicator);
  return v;
}

// a block scalar header: > or | with an optional chomping indicator (- or +). This reader
// drops a block's trailing line breaks whichever indicator is written, so the chomped forms
// read exactly as their unchomped one. Anything else after the indicator is refused.
const BLOCK_HEADER = /^([>|])([-+]?)$/;
const blockStyle = (s) => { const m = s.match(BLOCK_HEADER); return m ? m[1] : null; };

// The quote-aware split shared by the flow list and the flow map: the commas OUTSIDE quotes
// and outside one level of [ ] (a flow map's list value). A nested { or a [ inside [ is
// refused here, never guessed.
function flowSplit(inner, t, { listsInside }) {
  const parts = [];
  let cur = '', inS = false, inD = false, depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inD && c === '\\') { cur += c + (inner[i + 1] ?? ''); i++; continue; }
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD && (c === '{' || c === '}')) throw refuse('a flow map inside a flow collection', t, PLAIN.nested);
    else if (!inS && !inD && c === '[') { if (!listsInside || depth) throw refuse('a flow list inside a flow list', t, PLAIN.nested); depth++; }
    else if (!inS && !inD && c === ']') { if (!depth) throw new YamlError(`unbalanced "]" in flow collection (fail-closed): "${t}"`); depth--; }
    else if (c === ',' && !inS && !inD && !depth) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (inS || inD) throw new YamlError(`unbalanced quote in flow collection (fail-closed): "${t}"`);
  if (depth) throw new YamlError(`flow list is not closed by "]" (fail-closed): "${t}"`);
  parts.push(cur);
  return parts;
}

// A flow list [a, "b, c", d]: split on the commas OUTSIDE quotes. FAIL CLOSED on
// a list with no closing bracket (an unquoted ` #` read as a comment ate its
// tail), an unbalanced quote, or a nested collection — never a guessed split.
function flowSeq(raw) {
  const t = raw.trim();
  if (!t.startsWith('[') || !t.endsWith(']')) throw new YamlError(`flow list is not closed by "]" (fail-closed; quote an element holding " #"): "${t}"`);
  const inner = t.slice(1, -1);
  if (inner.trim() === '') return [];
  return flowSplit(inner, t, { listsInside: false }).map((x) => scalar(x));
}

// A single-level flow map {a: x, b: [y, z]}: the block map it stands for. Each entry is
// key: value, the value a scalar or a flow list of scalars. The same key rules as a block
// map: a duplicate key or __proto__ is refused.
function flowMap(raw) {
  const t = raw.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) throw new YamlError(`flow map is not closed by "}" on its line (fail-closed; ${PLAIN.flowMap}): "${t}"`);
  const inner = t.slice(1, -1);
  const obj = {};
  if (inner.trim() === '') return obj;
  for (const part of flowSplit(inner, t, { listsInside: true })) {
    const m = part.trim().match(/^([A-Za-z0-9_-]+):(\s+([\s\S]*))?$/);
    if (!m) throw new YamlError(`flow map entry is not key: value (fail-closed; ${PLAIN.flowMap}): "${part.trim()}" in "${t}"`);
    const key = m[1];
    if (key === '__proto__') throw new YamlError(`reserved key "__proto__" (fail-closed; rename the key): "${t}"`);
    if (Object.hasOwn(obj, key)) throw new YamlError(`duplicate key "${key}" (fail-closed; the first value would be lost: write each key once): "${t}"`);
    const val = (m[3] ?? '').trim();
    obj[key] = val.startsWith('[') ? flowSeq(val) : scalar(val);
  }
  return obj;
}

// a value on a key's line or a sequence item's line: a flow list, a flow map, or a scalar
const flowValue = (v) => (v.startsWith('[') ? flowSeq(v) : v.startsWith('{') ? flowMap(v) : scalar(v));

export function parseYaml(src) {
  const rows = src.split('\n').map((raw) => {
    const noNL = raw.replace(/\r$/, '');
    const trimmedStart = noNL.replace(/^ +/, '');
    return { raw: noNL, indent: indentOf(noNL), blank: trimmedStart === '', comment: trimmedStart.startsWith('#') };
  });
  // one document: a leading --- is read as the document's start; a --- after content
  // would begin a second document, and is refused
  {
    const first = rows.findIndex((r) => !r.blank && !r.comment);
    const isMarker = (r) => r.indent === 0 && /^---(\s+#.*)?\s*$/.test(r.raw);
    if (first > -1 && isMarker(rows[first])) rows[first] = { ...rows[first], comment: true };
    for (let i = first + 1; first > -1 && i < rows.length; i++)
      if (rows[i].indent === 0 && /^---(\s|$)/.test(rows[i].raw)) throw refuse('a second document', `line ${i + 1}: ${rows[i].raw}`, PLAIN.document);
  }
  let p = 0;
  const skip = () => { while (p < rows.length && (rows[p].blank || rows[p].comment)) p++; };

  function foldedScalar(keyIndent) {
    const parts = [];
    while (p < rows.length) {
      const r = rows[p];
      if (r.blank) { p++; parts.push(''); continue; }
      if (r.indent <= keyIndent) break;
      parts.push(r.raw.trim()); // folded content: NOT comment-stripped
      p++;
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  // a literal block (|): its lines as written, line breaks kept, the block's indentation
  // removed (deeper indentation stays). Trailing line breaks are dropped, as every block's are.
  function literalScalar(keyIndent) {
    const lines = [];
    let blockIndent = -1;
    while (p < rows.length) {
      const r = rows[p];
      if (r.blank) { p++; lines.push(''); continue; }
      if (r.indent <= keyIndent) break;
      if (blockIndent < 0) blockIndent = r.indent;
      if (r.indent < blockIndent) throw new YamlError(`literal block line is less indented than its first line (fail-closed; indent every line of the block at least as far as its first): "${r.raw}"`);
      lines.push(r.raw.slice(blockIndent)); // literal content: NOT comment-stripped
      p++;
    }
    return lines.join('\n').replace(/\n+$/, '');
  }
  const blockScalar = (keyIndent, style) => (style === '|' ? literalScalar(keyIndent) : foldedScalar(keyIndent));

  function parseBlock(minIndent) {
    skip();
    if (p >= rows.length) return null;
    const ind = rows[p].indent;
    if (ind < minIndent) return null;
    const content = stripInlineComment(rows[p].raw.slice(ind));
    if (content.startsWith('- ') || content === '-') return parseSeq(ind);
    if (content.startsWith('[')) { p++; return flowSeq(content); }   // a flow list on the line below its key
    if (content.startsWith('{')) { p++; return flowMap(content); }   // a flow map on the line below its key
    return parseMap(ind);
  }

  function parseSeq(indent) {
    const arr = [];
    while (true) {
      skip();
      if (p >= rows.length) break;
      const r = rows[p];
      if (r.indent !== indent) break;
      const content = stripInlineComment(r.raw.slice(indent));
      if (!(content.startsWith('- ') || content === '-')) break;
      const rest = content === '-' ? '' : content.slice(2);
      if (rest === '') { p++; arr.push(parseBlock(indent + 1)); continue; }
      const style = blockStyle(rest);
      if (style) { p++; arr.push(blockScalar(indent, style)); continue; }
      const m = rest.match(/^([A-Za-z0-9_-]+):(\s|$)/);
      if (m) {
        const keyCol = indent + 2;
        rows[p] = { raw: ' '.repeat(keyCol) + rest, indent: keyCol, blank: false, comment: false };
        arr.push(parseMap(keyCol));
      } else { arr.push(flowValue(rest)); p++; }
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    while (true) {
      skip();
      if (p >= rows.length) break;
      const r = rows[p];
      if (r.indent !== indent) { if (r.indent < indent) break; throw new YamlError(`unexpected indent ${r.indent} (want ${indent}): "${r.raw}"`); }
      const content = stripInlineComment(r.raw.slice(indent));
      const m = content.match(/^([A-Za-z0-9_-]+):(.*)$/);
      if (!m) throw new YamlError(`not a key: "${r.raw}"`);
      const key = m[1];
      // FAIL CLOSED on a key that would not read back: a repeat silently replaced the
      // first value, and `__proto__` set the object's prototype instead of a field
      if (key === '__proto__') throw new YamlError(`reserved key "__proto__" (fail-closed; rename the key): "${r.raw}"`);
      if (Object.hasOwn(obj, key)) throw new YamlError(`duplicate key "${key}" (fail-closed; the first value would be lost: write each key once): "${r.raw}"`);
      const after = m[2].trim();
      const style = blockStyle(after);
      if (style) { p++; obj[key] = blockScalar(indent, style); }
      else if (after === '') { p++; obj[key] = parseBlock(indent + 1); }
      else { obj[key] = flowValue(after); p++; }
    }
    return obj;
  }

  const out = parseBlock(0);
  skip();
  if (p < rows.length) throw new YamlError(`trailing content at line ${p + 1}: "${rows[p].raw}"`);
  return out;
}
