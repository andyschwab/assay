// ── shared helpers live once (#80, F-1232): the child environment's allow-list is built in
// one place (map/child-env.mjs); ingest imports each instrument's closed vocabularies from
// the producer that emits them (fresh-clone, dependency-scan, repo-census), so a status
// cannot be added on one side only; and no export is left that nothing else names. Pinned:
// (a) exactly one module declares the allow-list and builds the child's environment, and
// no `scrubbedEnv` copy survives; (b) ingest imports the producers' vocabularies, restates
// none as its own literal, and the statuses its converters compare against are exactly
// the producer's vocabulary (plus dependency-scan's documented pre-0.2.0 `not-supported`);
// (c) every export outside tests/ is named by some other module (a test naming it is its reference).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'shared-helpers';

export async function run() {
  const fail = (m) => negFailures.push('shared-helpers: ' + m);
  const srcFiles = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name.startsWith('tmp-')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.mjs')) srcFiles.push(p);
    }
  };
  walk(ROOT);
  const rel = (p) => p.slice(ROOT.length + 1).split('\\').join('/');
  const SRC = Object.fromEntries(srcFiles.map((p) => [rel(p), readFileSync(p, 'utf8')]));
  const engine = Object.keys(SRC).filter((f) => !f.startsWith('tests/'));
  // (a) one allow-list, one builder
  const envDecl = engine.filter((f) => /\b(?:CHILD_ENV_NAMES|scrubbedEnv)\s*=|function\s+(?:childEnv|scrubbedEnv)\b/.test(SRC[f]));
  if (envDecl.join() !== 'map/child-env.mjs') fail(`the child environment's allow-list must be declared once, in map/child-env.mjs (declared in: ${envDecl.join(', ') || 'none'})`);
  for (const f of engine) if (/\bscrubbedEnv\b/.test(SRC[f])) fail(`${f} still names scrubbedEnv; the one builder is map/child-env.mjs childEnv()`);
  for (const f of ['map/fresh-clone.mjs', 'map/dependency-scan.mjs']) if (!/import \{[^}]*\bchildEnv\b[^}]*\} from '\.\/child-env\.mjs'/.test(SRC[f])) fail(`${f} must build its child's environment with childEnv() from map/child-env.mjs`);
  // (b) ingest imports the producers' vocabularies and its converters' cases match them
  const FC = await import('../../map/fresh-clone.mjs');
  const DS = await import('../../map/dependency-scan.mjs');
  const RC = await import('../../map/repo-census.mjs');
  const ing = SRC['map/ingest.mjs'];
  const IMPORTS = { './fresh-clone.mjs': ['STEPS', 'STEP_STATUS', 'CLAIM_STATUS'], './dependency-scan.mjs': ['LOCK_STATUS', 'SEVERITIES'], './repo-census.mjs': ['EVIDENCE_IDS', 'CHECK_NAMES', 'CHECK_STATUS'] };
  for (const [mod, names] of Object.entries(IMPORTS)) {
    const line = [...ing.matchAll(/^import \{([^}]*)\} from '([^']+)';$/gm)].find((m) => m[2] === mod);
    const got = line ? line[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]) : [];
    for (const n of names) if (!got.includes(n)) fail(`map/ingest.mjs must import ${n} from ${mod} — the producer owns that vocabulary`);
  }
  const VOCABS = { 'fresh-clone STEPS': FC.STEPS, 'fresh-clone STEP_STATUS': FC.STEP_STATUS, 'fresh-clone CLAIM_STATUS': FC.CLAIM_STATUS, 'dependency-scan LOCK_STATUS': DS.LOCK_STATUS, 'dependency-scan SEVERITIES': DS.SEVERITIES, 'repo-census EVIDENCE_IDS': RC.EVIDENCE_IDS, 'repo-census CHECK_NAMES': RC.CHECK_NAMES, 'repo-census CHECK_STATUS': RC.CHECK_STATUS };
  for (const [what, vocab] of Object.entries(VOCABS)) if (!Array.isArray(vocab) || !vocab.length) fail(`${what} must be exported by its producer`);
  // a string-array literal in ingest that holds a whole producer vocabulary is a restatement
  for (const m of ing.matchAll(/\[\s*('[\w-]+'(?:\s*,\s*'[\w-]+')+)\s*,?\s*\]/g)) {
    const items = new Set(m[1].split(',').map((s) => s.trim().slice(1, -1)));
    for (const [what, vocab] of Object.entries(VOCABS)) if (Array.isArray(vocab) && vocab.length > 1 && vocab.every((v) => items.has(v))) fail(`map/ingest.mjs restates ${what} as a literal ([${m[1]}]); import it from the producer`);
  }
  const section = (from, to) => { const a = ing.indexOf(`\n  '${from}': {`), b = to ? ing.indexOf(`\n  '${to}': {`, a) : ing.indexOf('\n};\n', a); return a < 0 || b < 0 ? '' : ing.slice(a, b); };
  // the statuses a converter compares one row's status against (`s.status === 'failed'`)
  const cases = (text, row) => new Set([...text.matchAll(new RegExp(`\\b${row}\\.status\\s*[!=]==\\s*'([\\w-]+)'`, 'g'))].map((m) => m[1]));
  const sameSet = (what, text, row, vocab, legacy = []) => {
    if (!text) { fail(`map/ingest.mjs has no converter to read for ${what}`); return; }
    const want = new Set([...(vocab || []), ...legacy]), got = cases(text, row);
    const extra = [...got].filter((s) => !want.has(s)), missing = [...want].filter((s) => !got.has(s));
    if (extra.length || missing.length) fail(`ingest's cases for ${what} and the producer's vocabulary disagree: ${extra.length ? `ingest has a case for ${extra.join(', ')}, which the producer never emits` : ''}${extra.length && missing.length ? '; ' : ''}${missing.length ? `no case in ingest for ${missing.join(', ')}` : ''}`);
  };
  const fcText = section('fresh-clone', 'dependency-scan');
  sameSet('fresh-clone STEP_STATUS', fcText, 's', FC.STEP_STATUS);
  sameSet('fresh-clone CLAIM_STATUS', fcText, 'c', FC.CLAIM_STATUS);
  sameSet('dependency-scan LOCK_STATUS', section('dependency-scan', 'repo-census'), 'lf', DS.LOCK_STATUS, ['not-supported']);   // not-supported: documents from before dependency-scan 0.2.0
  sameSet('repo-census CHECK_STATUS', section('repo-census', null), 'c', RC.CHECK_STATUS);
  // (c) no export nothing else names
  for (const f of engine) {
    for (const m of SRC[f].matchAll(/^export\s+(?:async\s+)?(?:const|let|var|class|function\*?)\s+([A-Za-z_$][\w$]*)/gm)) {
      const re = new RegExp(`(?<![\\w$])${m[1].replace(/\$/g, '\\$')}(?![\\w$])`);
      if (!Object.keys(SRC).some((g) => g !== f && re.test(SRC[g]))) fail(`${f} exports ${m[1]}, which no other module names; delete it, or drop the export when only ${f} uses it`);
    }
  }
}
