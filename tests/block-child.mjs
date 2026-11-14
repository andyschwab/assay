#!/usr/bin/env node
// block-child.mjs — runs ONE block of the regression harness in its own process, for the
// parallel runner (tests/harness.mjs runBlocksParallel; tests/README.md "How the blocks run").
//
//   node tests/block-child.mjs <block-file>
//
// Environment, set by the runner:
//   ASSAY_BLOCK_OUT    where to write the block's result (JSON, below)
//   ASSAY_BLOCK_ROWS   optional: a JSON file of the instrument rows the blocks this one runs
//                      after converted (the shared convertedRows, merged by the runner)
//   ASSAY_BLOCK_ROOT   the working tree whose files every block shares; a write into it that
//                      git does not ignore is reported, so the runner can refuse it
//
// The result: { failures, score, rows, threw, writes }: the block's own failures in the order it
// pushed them, the _score keys it set, the rows it converted, the error it threw (or null), and
// every path in the working tree it wrote that git does not ignore. The block's stdout and stderr
// are the process's own; the runner collects them.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [file] = process.argv.slice(2);
const OUT = process.env.ASSAY_BLOCK_OUT;
const ROOT = process.env.ASSAY_BLOCK_ROOT ? resolve(process.env.ASSAY_BLOCK_ROOT) : null;
if (!file || !OUT) { console.error('usage: ASSAY_BLOCK_OUT=<file> node tests/block-child.mjs <block-file>'); process.exit(2); }

// ── what the block writes into the shared working tree ──────────────────────
// Every fs call that creates, changes or removes a path is wrapped before the block (or the
// harness) is imported, so a write the block makes in this process is seen. A write a
// subprocess makes is not; the blocks hand their subprocesses scratch directories.
const touched = new Set();
const note = (p) => {
  if (!ROOT || p === undefined || p === null) return;
  let s; try { s = p instanceof URL ? fileURLToPath(p) : typeof p === 'string' ? p : Buffer.isBuffer(p) ? p.toString() : null; } catch { s = null; }
  if (!s) return;
  const rel = relative(ROOT, resolve(s));
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) touched.add(rel);
};
const WRAP = { // fn name → which arguments are paths it writes
  writeFileSync: [0], appendFileSync: [0], mkdirSync: [0], rmSync: [0], rmdirSync: [0], unlinkSync: [0],
  renameSync: [0, 1], copyFileSync: [1], cpSync: [1], symlinkSync: [1], linkSync: [1], truncateSync: [0], mkdtempSync: [0],
  writeFile: [0], appendFile: [0], mkdir: [0], rm: [0], rmdir: [0], unlink: [0], rename: [0, 1], copyFile: [1], cp: [1],
};
const wrap = (obj) => {
  for (const [name, args] of Object.entries(WRAP)) {
    const orig = obj[name];
    if (typeof orig !== 'function') continue;
    obj[name] = function (...a) { for (const i of args) note(a[i]); return orig.apply(this, a); };
  }
};
wrap(fs); wrap(fs.promises);
syncBuiltinESMExports();

const H = await import(pathToFileURL(resolve(fileURLToPath(new URL('.', import.meta.url)), 'harness.mjs')).href);
if (process.env.ASSAY_BLOCK_ROWS) H.convertedRows.push(...JSON.parse(fs.readFileSync(process.env.ASSAY_BLOCK_ROWS, 'utf8')));
const inherited = H.convertedRows.length;

let threw = null;
try {
  const mod = await import(pathToFileURL(resolve(file)).href);
  await mod.run();
} catch (e) { threw = String(e?.stack || e).split('\n').slice(0, 2).join(' '); }

// the touched paths git does not ignore: state every block shares
let writes = [];
if (ROOT && touched.size) {
  const paths = [...touched].sort();
  let ignored = '';
  try { ignored = execFileSync('git', ['check-ignore', '--stdin'], { cwd: ROOT, input: paths.join('\n') + '\n', encoding: 'utf8' }); }
  catch (e) { ignored = e.status === 1 ? '' : (() => { throw e; })(); }   // 1: none ignored
  const ign = new Set(ignored.split('\n').filter(Boolean));
  writes = paths.filter((p) => !ign.has(p));
}

fs.writeFileSync(OUT, JSON.stringify({
  failures: H.negFailures, score: H.current._score, rows: H.convertedRows.slice(inherited), threw, writes,
}));
