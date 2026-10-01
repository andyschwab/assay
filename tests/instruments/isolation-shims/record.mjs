// Shared by the isolation shims (#47): append one line to tests/tmp-isolation/records.ndjson
// naming the tool, its arguments, its working directory, the files in it and the NAMES
// (never values) of its environment. The path is fixed relative to this file because the
// child environment carries nothing a test could use to point it elsewhere.
import { appendFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp-isolation');
export function record(tool, args) {
  mkdirSync(OUT, { recursive: true });
  let files = [];
  try { files = readdirSync(process.cwd()).sort(); } catch { /* unreadable */ }
  appendFileSync(join(OUT, 'records.ndjson'), JSON.stringify({ tool, args, cwd: process.cwd(), files, env: Object.keys(process.env).sort() }) + '\n');
}
