// migrate-run.mjs — bring a run written before the strict YAML reader forward (#182).
//
// Before b16800c a flow list was split on every comma and each element read as a
// scalar, and ingest wrote evidence elements unquoted. A path holding a bracket (a
// dynamic route segment, app/[id]/page.tsx) now reads as a nested flow list, and the
// strict reader fails closed on it, so such a run cannot be validated or be Since's
// baseline. This rewrites only the flow lists the strict reader refuses: each element
// the legacy rule read as an unquoted string is re-emitted through q(), as ingest
// writes it today, and a number, boolean or quoted element keeps its text. Lists the
// strict reader already reads are left alone. Nothing is written unless each rewritten list
// reads back under the strict reader to exactly what the legacy rule read, and the
// whole file then parses. A line it cannot bring forward is named, and that file is
// left as it was.
//
// Usage: node assay.mjs migrate-run <run-dir> [--write]   (without --write: what would change)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml, q, YamlError } from '../lib/yaml-min.mjs';

// the legacy reader's rule for one flow list, frozen as b16800c^ had it
function legacyScalar(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~' || v === '') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
const legacyParts = (list) => { const inner = list.trim().replace(/^\[/, '').replace(/\]$/, '').trim(); return inner === '' ? [] : inner.split(','); };

const strictReads = (value) => { try { parseYaml(`k: ${value}`); return true; } catch (e) { if (e instanceof YamlError) return false; throw e; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// one file's text → { text, changed, refused } — refused names each line left as it was
function migrateText(text) {
  let changed = 0; const refused = [];
  const lines = text.split('\n').map((line, i) => {
    const m = line.match(/^(\s*(?:- )?(?:[A-Za-z0-9_-]+:\s+)?)(\[.*\])\s*$/);
    if (!m || strictReads(m[2])) return line;
    const parts = legacyParts(m[2]);
    const legacy = parts.map(legacyScalar);
    const list = `[${parts.map((x, j) => (typeof legacy[j] === 'string' && !/^\s*["']/.test(x) ? q(legacy[j]) : x.trim())).join(', ')}]`;
    let back = null;
    try { back = parseYaml(`k: ${list}`).k; } catch { /* refused below */ }
    if (!same(back, legacy)) { refused.push(`line ${i + 1}: ${line.trim()}`); return line; }
    changed++;
    return m[1] + list;
  });
  const out = lines.join('\n');
  if (!refused.length && changed) { try { parseYaml(out); } catch (e) { refused.push(`the file still does not parse after the rewrite: ${e.message}`); } }
  return { text: refused.length ? text : out, changed: refused.length ? 0 : changed, refused };
}

const yamlFiles = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? yamlFiles(p) : /\.ya?ml$/.test(n) ? [p] : []; });

function migrateRun(runDir, { write = false } = {}) {
  const report = [];
  for (const f of yamlFiles(runDir)) {
    const before = readFileSync(f, 'utf8');
    const r = migrateText(before);
    if (!r.changed && !r.refused.length) continue;
    if (write && r.changed) writeFileSync(f, r.text);
    report.push({ file: relative(runDir, f), changed: r.changed, refused: r.refused });
  }
  return report;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('--'));
  if (!runDir) { console.error('usage: node assay.mjs migrate-run <run-dir> [--write]'); process.exit(2); }
  const write = args.includes('--write');
  const report = migrateRun(runDir, { write });
  if (!report.length) { console.log(`✓ migrate-run: every YAML file in ${runDir} already reads under the strict reader`); process.exit(0); }
  for (const r of report) {
    if (r.changed) console.log(`${write ? '✓ rewrote' : '· would rewrite'} ${r.changed} flow list(s) in ${r.file}`);
    for (const x of r.refused) console.error(`✗ ${r.file}: left as it was, ${x}`);
  }
  if (report.some((r) => r.refused.length)) process.exit(1);
  if (!write) console.log('re-run with --write to rewrite them');
}
