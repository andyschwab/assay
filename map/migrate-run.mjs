// migrate-run.mjs — bring a run written by an earlier engine forward (#182, #188).
//
// Two changes left stored runs behind, and this brings each forward in turn.
//
// 1. A retired scanner id (#188). The built-in judgment scanner was named repo-eval
// until it was renamed practice-review (its method class eval-pass with it): a run
// drawn before the rename carries the old id in its file names (map/findings/
// repo-eval-<pass>.yaml) and its text (the run record's key, a row's source). Every
// file and path holding it is renamed; nothing is written where a renamed path would
// land on one that exists.
//
// 2. Before b16800c a flow list was split on every comma and each element read as a
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
import { readFileSync, writeFileSync, readdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml, q, YamlError } from '../lib/yaml-min.mjs';

// the retired ids and what they became; the one place in the tree the old ids are
// written (tests/blocks/retired-names.mjs holds it)
const RETIRED = [['repo-eval', 'practice-review'], ['eval-pass', 'practice-review']];
const renamed = (s) => RETIRED.reduce((t, [a, b]) => t.split(a).join(b), s);
const holdsRetired = (s) => RETIRED.some(([a]) => s.includes(a));

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const TEXT = /\.(ya?ml|md|json|txt)$/;

// step 1: the retired ids → { renames: [[from, to]], rewrites: [file], refused: [why] }
function retiredIds(runDir) {
  const files = walk(runDir);
  const renames = files.filter((f) => holdsRetired(basename(f))).map((f) => [f, join(dirname(f), renamed(basename(f)))]);
  const rewrites = files.filter((f) => TEXT.test(f) && holdsRetired(readFileSync(f, 'utf8')));
  const refused = renames.filter(([, to]) => existsSync(to)).map(([from, to]) => `${relative(runDir, from)} would land on ${relative(runDir, to)}, which exists`);
  return { renames, rewrites, refused };
}

// what a run still carries from an earlier engine, in a line each (validate and Since
// name it, and the command that brings the run forward)
export function legacyIn(runDir) {
  if (!existsSync(runDir)) return [];
  const out = [];
  const ids = retiredIds(runDir);
  if (ids.renames.length || ids.rewrites.length) out.push(`it carries a retired scanner id (${RETIRED.map(([a, b]) => `${a} → ${b}`).join(', ')}) in ${ids.renames.length + ids.rewrites.length} file(s)`);
  const lists = walk(runDir).filter((f) => /\.ya?ml$/.test(f)).filter((f) => migrateText(readFileSync(f, 'utf8')).changed);
  if (lists.length) out.push(`${lists.length} file(s) hold flow lists the strict reader refuses`);
  return out.map((x) => `${x} — a run drawn by an earlier engine: node assay.mjs migrate-run ${runDir} --write`);
}

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

function migrateRun(runDir, { write = false } = {}) {
  const report = [];
  const ids = retiredIds(runDir);
  if (ids.refused.length) return [{ file: '(retired ids)', ids: 0, changed: 0, refused: ids.refused }];
  if (ids.renames.length || ids.rewrites.length) {
    if (write) {
      for (const f of ids.rewrites) writeFileSync(f, renamed(readFileSync(f, 'utf8')));
      for (const [from, to] of ids.renames) renameSync(from, to);
    }
    report.push({ file: '(retired ids)', ids: ids.renames.length + ids.rewrites.length, changed: 0, refused: [] });
    if (!write) return report;   // the strict-list step reads the files under their new names
  }
  for (const f of walk(runDir).filter((x) => /\.ya?ml$/.test(x))) {
    const before = readFileSync(f, 'utf8');
    const r = migrateText(before);
    if (!r.changed && !r.refused.length) continue;
    if (write && r.changed) writeFileSync(f, r.text);
    report.push({ file: relative(runDir, f), ids: 0, changed: r.changed, refused: r.refused });
  }
  return report;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('--'));
  if (!runDir) { console.error('usage: node assay.mjs migrate-run <run-dir> [--write]'); process.exit(2); }
  const write = args.includes('--write');
  const report = migrateRun(runDir, { write });
  if (!report.length) { console.log(`✓ migrate-run: ${runDir} carries nothing from an earlier engine`); process.exit(0); }
  for (const r of report) {
    if (r.ids) console.log(`${write ? '✓ renamed' : '· would rename'} the retired scanner id in ${r.ids} file(s) or path(s)`);
    if (r.changed) console.log(`${write ? '✓ rewrote' : '· would rewrite'} ${r.changed} flow list(s) in ${r.file}`);
    for (const x of r.refused) console.error(`✗ ${r.file}: left as it was, ${x}`);
  }
  if (report.some((r) => r.refused.length)) process.exit(1);
  if (!write) console.log('re-run with --write to rewrite them');
}
