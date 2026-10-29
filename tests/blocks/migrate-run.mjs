// ── a run written before the strict reader is brought forward, never stranded (#182) ──
// Before b16800c ingest wrote flow lists unquoted, and the legacy reader split them on
// every comma. A path holding a bracket (a dynamic route segment) now reads as a nested
// flow list and fails closed, so such a run cannot be Since's baseline.
//   (a) Since over that baseline halts, naming migrate-run, never a stack trace;
//   (b) migrate-run without --write names what it would rewrite and changes nothing;
//   (c) with --write, the file parses, each list reads back to the legacy split, and a
//       list the strict reader already read keeps its text;
//   (d) a list it cannot bring forward is named, and its file is left as it was;
//   (e) Since then compiles over the migrated baseline.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'migrate-run';

// the legacy writer's shape: unquoted elements, one holding a bracketed segment
const LEGACY = 'evidence: [app/contracts/[id]/page.tsx:12, lib/auth.mjs:16]';
const QUOTED = 'evidence: ["config/settings.mjs:6", "config/settings.mjs:5", "lib/sync.mjs:10"]';

export async function run() {
  const fail = (m) => negFailures.push('migrate-run: ' + m);
  const tmp = join(HERE, 'tmp-migrate-run'); rmSync(tmp, { recursive: true, force: true });
  const prev = join(tmp, 'prev'), cur = join(tmp, 'cur');
  cpSync(join(HERE, 'fixtures', 'notesbox'), prev, { recursive: true });
  cpSync(join(HERE, 'fixtures', 'notesbox'), cur, { recursive: true });
  const cli = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
  const f = join(prev, 'map', 'findings', 'deep-code-review.yaml');
  try {
    for (const d of [prev, cur]) cli('yardstick/measure.mjs', [d, '--write']);
    const original = readFileSync(f, 'utf8');
    const first = original.split('\n').findIndex((l) => /^\s+evidence: \[/.test(l));
    const lines = original.split('\n'); lines[first] = lines[first].replace(/evidence: \[.*\]/, LEGACY);
    const legacyText = lines.join('\n');
    writeFileSync(f, legacyText);
    // (a)
    const s1 = cli('views/since.mjs', [cur, '--previous', prev]);
    if (s1.status === 0 || !/migrate-run/.test(s1.stderr) || /at .*\.mjs:\d+/.test(s1.stderr)) fail(`(a) Since over a pre-strict baseline halts naming migrate-run (got ${s1.status}: ${s1.stderr.split('\n')[0]})`);
    // (b)
    const dry = cli('map/migrate-run.mjs', [prev]);
    if (dry.status !== 0 || !/would rewrite 1 flow list\(s\) in map\/findings\/deep-code-review\.yaml/.test(dry.stdout)) fail(`(b) a dry run names the list it would rewrite (got ${dry.status}: ${dry.stdout}${dry.stderr})`);
    if (readFileSync(f, 'utf8') !== legacyText) fail('(b) a dry run changes nothing');
    // (c)
    const w = cli('map/migrate-run.mjs', [prev, '--write']);
    if (w.status !== 0) fail(`(c) --write exits 0 (got ${w.status}: ${w.stderr})`);
    const after = readFileSync(f, 'utf8');
    let doc = null; try { doc = parseYaml(after); } catch (e) { fail(`(c) the rewritten file parses (got ${e.message})`); }
    const ev = doc && (Array.isArray(doc) ? doc : doc.findings || [])[0]?.evidence;
    if (JSON.stringify(ev) !== JSON.stringify(['app/contracts/[id]/page.tsx:12', 'lib/auth.mjs:16'])) fail(`(c) the list reads back to the legacy split (got ${JSON.stringify(ev)})`);
    if (!after.includes(QUOTED)) fail('(c) a list the strict reader already read keeps its text');
    if (after.split('\n').length !== legacyText.split('\n').length) fail('(c) the rewrite changes lines in place, adding or dropping none');
    // (d)
    const bad = join(prev, 'map', 'findings', 'gitleaks.yaml');
    const badBefore = readFileSync(bad, 'utf8');
    writeFileSync(bad, badBefore + '\nextra: [a, [b], c]\n');
    const badText = readFileSync(bad, 'utf8');
    const r = cli('map/migrate-run.mjs', [prev, '--write']);
    if (r.status === 0 || !/gitleaks\.yaml: left as it was/.test(r.stderr)) fail(`(d) a list it cannot bring forward is named and fails the command (got ${r.status}: ${r.stderr})`);
    if (readFileSync(bad, 'utf8') !== badText) fail('(d) the refused file is left as it was');
    writeFileSync(bad, badBefore);
    // (e)
    const s2 = cli('views/since.mjs', [cur, '--previous', prev]);
    if (s2.status !== 0) fail(`(e) Since compiles over the migrated baseline (got ${s2.status}: ${s2.stderr})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
