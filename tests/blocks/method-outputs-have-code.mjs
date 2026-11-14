// ── map/METHOD.md names only outputs some code writes or reads (#323) ──
// METHOD.md described a meta-synthesis (`views/improve/synthesis.md`) and a leverage view
// (`views/improve/leverage.md`) no code wrote, and `lib/run-layout.mjs` kept a path for the first
// that nothing read: a contract that described a run no run was. Every run file METHOD.md names (a
// backticked path that is no file of this repository) must appear as a string in the engine's code
// outside a comment, where a writer or a reader names it. A file of the repository it cites
// (`map/SCHEMA.md`, a template) is a source, not an output, and is not asked.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures, repoFiles } from '../harness.mjs';

export const label = 'method-outputs-have-code';

// the engine's code: every .mjs outside tests/, comments dropped
function engineCode(files) {
  return files.filter((f) => f.endsWith('.mjs') && !f.startsWith('tests/') && !f.startsWith('node_modules/'))
    .map((f) => readFileSync(join(ROOT, f), 'utf8').split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n'))
    .join('\n');
}

// the run files a text names: backticked paths ending in a document extension, less the repo's own
// files (a bare name like `SCHEMA.md` is a repo file when one is tracked under that name)
export function namedOutputs(text, files) {
  const tokens = [...new Set([...text.matchAll(/`([^`\s]+\.(?:md|ya?ml|json))`/g)].map((m) => m[1]))];
  const tracked = new Set(files), sources = files.filter((f) => !f.startsWith('tests/'));
  return tokens.filter((t) => !t.startsWith('.') && !tracked.has(t) && !tracked.has(`map/${t}`)
    && (t.includes('/') || !sources.some((f) => f.endsWith(`/${t}`))));
}

// the literal a writer or reader would name: the file's name up to its first placeholder, or, where
// that leaves too little (`plan/NN-*.md`), the directory it sits in
export function needleOf(path) {
  const parts = path.split('/');
  const head = parts[parts.length - 1].split(/<|\*|NN/)[0];
  return head.length >= 4 ? head : parts[parts.length - 2] || head;
}

// a string in the code opens on the needle, or names the file's stem alone (a page built as
// `${name}.md` from 'INDEX')
export function unresolved(text, files, code) {
  const quoted = (n) => ['\'', '"', '`'].some((q) => code.includes(q + n));
  return namedOutputs(text, files).filter((p) => {
    const n = needleOf(p), stem = n.replace(/\.(md|ya?ml|json)$/, '');
    return !n || !(quoted(n) || (stem !== n && ['\'', '"'].some((q) => code.includes(q + stem + q))));
  });
}

export async function run() {
  const fail = (m) => negFailures.push('method-outputs-have-code: ' + m);
  const files = repoFiles();
  const code = engineCode(files);
  const method = readFileSync(join(ROOT, 'map', 'METHOD.md'), 'utf8');
  const named = namedOutputs(method, files);
  // the outputs a run of the method makes, so the extraction is known to see them
  for (const p of ['map/censuses.yaml', 'views/improve/axes.md', 'views/improve/security-gate.yaml', 'IMPROVE.md', 'map/raw/enumerate.json'])
    if (!named.includes(p)) fail(`test setup: METHOD.md must be read as naming ${p}`);
  if (named.includes('map/SCHEMA.md') || named.includes('views/improve/templates/howto.md')) fail('test setup: a file of the repository is a source, never an output');
  for (const p of unresolved(method, files, code)) fail(`METHOD.md names ${p}, which no code writes or reads (\`${needleOf(p)}\` is in no engine module outside a comment)`);
  // it bites: a section naming a file nothing produces is refused
  const planted = unresolved(`${method}\n## Pass 8 — Meta-synthesis → \`views/improve/synthesis.md\`\n`, files, code);
  if (!planted.includes('views/improve/synthesis.md')) fail(`a planted section naming views/improve/synthesis.md must be refused (got ${JSON.stringify(planted)})`);
}
