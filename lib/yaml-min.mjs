// yaml-min — a zero-dependency reader for the CONSTRAINED YAML subset repo-eval
// uses (SCHEMA.md). Shared by validate.mjs and compile-report.mjs. It handles:
// block sequences (- ), block mappings (key: value / key: <nested>), flow
// sequences [a, b], folded scalars (key: >), scalars, and full-line + inline
// comments (inline only OUTSIDE folded blocks). Anything else THROWS — the tools
// fail closed on input they cannot parse from a fail-closed lesson: a checker that silently accepts unparseable input hides the very thing it exists to catch.
export class YamlError extends Error {}

const indentOf = (s) => s.length - s.replace(/^ +/, '').length;

export function stripInlineComment(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS && s[i - 1] !== '\\') inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t'))
      return s.slice(0, i).replace(/\s+$/, '');
  }
  return s;
}

function scalar(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~' || v === '') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  // FAIL CLOSED on constructs this minimal reader does not parse — an inline flow
  // MAP {…}, an anchor &x, an alias *x, or a chomped block scalar >- / |- would
  // otherwise be returned as a misleading string (an adapter row written `{domain: x}`
  // would silently become an unparsed string and drop its findings). Throw instead.
  if (/^[{&*]/.test(v) || v === '>-' || v === '|-' || v === '>+' || v === '|+') {
    throw new YamlError(`unsupported YAML construct (fail-closed): "${v}"`);
  }
  return v;
}

function flowSeq(raw) {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (inner === '') return [];
  return inner.split(',').map((x) => scalar(x));
}

export function parseYaml(src) {
  const rows = src.split('\n').map((raw) => {
    const noNL = raw.replace(/\r$/, '');
    const trimmedStart = noNL.replace(/^ +/, '');
    return { raw: noNL, indent: indentOf(noNL), blank: trimmedStart === '', comment: trimmedStart.startsWith('#') };
  });
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

  function parseBlock(minIndent) {
    skip();
    if (p >= rows.length) return null;
    const ind = rows[p].indent;
    if (ind < minIndent) return null;
    const content = stripInlineComment(rows[p].raw.slice(ind));
    if (content.startsWith('- ') || content === '-') return parseSeq(ind);
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
      if (rest === '>' || rest === '|') { p++; arr.push(foldedScalar(indent)); continue; }
      const m = rest.match(/^([A-Za-z0-9_-]+):(\s|$)/);
      if (m) {
        const keyCol = indent + 2;
        rows[p] = { raw: ' '.repeat(keyCol) + rest, indent: keyCol, blank: false, comment: false };
        arr.push(parseMap(keyCol));
      } else { arr.push(scalar(rest)); p++; }
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
      const after = m[2].trim();
      if (after === '>' || after === '|') { p++; obj[key] = foldedScalar(indent); }
      else if (after.startsWith('[')) { obj[key] = flowSeq(after); p++; }
      else if (after === '') { p++; obj[key] = parseBlock(indent + 1); }
      else { obj[key] = scalar(after); p++; }
    }
    return obj;
  }

  const out = parseBlock(0);
  skip();
  if (p < rows.length) throw new YamlError(`trailing content at line ${p + 1}: "${rows[p].raw}"`);
  return out;
}
