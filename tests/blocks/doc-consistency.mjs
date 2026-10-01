// ── doc-consistency: the front door and the contracts say what the code does ──
// Each statement here is read off the code, never off another document: the view
// count from the pages lib/run-layout.mjs can place, the fingerprint's parts from
// probing fingerprintFinding itself, a cited ground rule from CLAUDE.md's own list.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintFinding } from '../../yardstick/compare.mjs';
import { run as runCensus } from '../../map/repo-census.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'doc-consistency';

export async function run() {
  const fail = (m) => negFailures.push('doc-consistency: ' + m);
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    .filter((f) => /\.(mjs|md|yaml|json)$/.test(f) && f !== 'HISTORY.md' && !f.startsWith('tests/fixtures/') && !f.startsWith('tests/instruments/'));
  // the harness's own files quote the strings these checks hunt for, as test data (#87: once one file)
  const isHarness = (f) => f === 'tests/regression.mjs' || f === 'tests/harness.mjs' || f.startsWith('tests/blocks/');
  const flat = (t) => t.replace(/\n\s*(?:\/\/|#)?\s*/g, ' ').replace(/[`*]/g, '').replace(/\s+/g, ' ');

  // (a) the view count. A one-run view is a page compile writes beside INDEX.md;
  // Since is the two-run view and is named apart wherever the count is stated.
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
  const layout = await import('../../lib/run-layout.mjs');
  const ORDER = ['intake', 'maintain', 'improve', 'owner'];
  const views = Object.keys(layout).filter((k) => /PagePath$/.test(k) && k !== 'sincePagePath')
    .map((k) => k.replace(/PagePath$/, '')).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((v) => v[0].toUpperCase() + v.slice(1));
  if (views.length !== 4) fail(`run-layout places ${views.length} one-run view pages (${views.join(', ')}); this block's view names below assume Intake, Maintain, Improve, Owner`);
  const word = NUM[views.length];
  for (const f of ['README.md', 'CLAUDE.md', 'package.json', 'assay.mjs', 'views/README.md', 'views/compile.mjs', 'views/owner.mjs', 'yardstick/measure.mjs']) {
    const t = flat(read(f));
    for (const m of t.matchAll(/\b(three|four|five|six)\s+views\b/gi)) {   // "the two views" is a pair, never a count
      if (m[1].toLowerCase() !== word) fail(`${f} says "${m[0]}"; the engine writes ${word} views (${views.join(', ')}) plus Since`);
    }
    if (['README.md', 'CLAUDE.md', 'package.json'].includes(f)) {
      for (const v of [...views, 'Since']) if (!new RegExp(`\\b${v}\\b`).test(t)) fail(`${f} does not name the ${v} view`);
    }
  }
  // map/METHOD.md's leverage/maturity/security are Improve's readings, never the engine's views
  if (!/three views inside Improve/i.test(flat(read('map/METHOD.md')))) fail('map/METHOD.md must say its leverage/maturity/security views live inside Improve, not stand beside the engine\'s views');

  // (b) the cross-run fingerprint: its parts are probed off the code, and every
  // contract that states it names each part.
  const base = { source: 'gitleaks', dimension: 'code-security', polarity: 'gap', evidence: ['a.js:1'] };
  const fp = fingerprintFinding;
  const parts = {
    scanner: fp(base) !== fp({ ...base, source: 'fresh-clone' }),
    'dimension-or-native': fp(base) !== fp({ ...base, dimension: 'verification' }),
    polarity: fp(base) !== fp({ ...base, polarity: 'strength' }),
    'evidence file paths': fp(base) !== fp({ ...base, evidence: ['b.js:1'] }),
  };
  if (fp(base) !== fp({ ...base, evidence: ['a.js:9'] })) fail('fingerprintFinding moved with the evidence line; the contracts say the line is stripped');
  for (const f of ['yardstick/README.md', 'views/README.md']) {
    const t = flat(read(f));
    const stated = [...t.matchAll(/\(scanner,\s*dimension-or-native[_-]category,[^)]*?evidence file paths[^)]*\)/g)].map((m) => m[0]);
    if (!stated.length) { fail(`${f} no longer states the fingerprint as (scanner, dimension-or-native-category, …, evidence file paths …)`); continue; }
    for (const s of stated) for (const [part, inCode] of Object.entries(parts)) {
      if (inCode && !s.includes(part)) fail(`${f} states the fingerprint as "${s}" without ${part}, which fingerprintFinding keys on`);
      if (!inCode && s.includes(part)) fail(`${f} states the fingerprint with ${part}, which fingerprintFinding ignores`);
    }
  }

  // (c) a CLAUDE.md citation names a rule CLAUDE.md holds, under its own number.
  const claude = read('CLAUDE.md');
  const rules = {};
  for (const m of claude.matchAll(/^(\d+)\. \*\*(.+?)\*\*/gm)) rules[m[1]] = m[2].replace(/[.,]$/, '').toLowerCase();
  const claudeFlat = flat(claude).toLowerCase();
  const CITE_N = new RegExp('CLAUDE\\.md`?\\s+rule\\s+(\\d+)(?::\\s*([^;.)]+))?', 'g');
  const CITE_TEXT = new RegExp('CLAUDE\\.md(?:\'s\\s+|:\\s*"|\\s+")([^";.)]+)', 'g');
  for (const f of tracked.filter((x) => x !== 'CLAUDE.md' && !isHarness(x))) {
    const t = flat(read(f));
    for (const m of t.matchAll(CITE_N)) {
      const n = m[1];
      if (!rules[n]) { fail(`${f} cites CLAUDE.md rule ${n}; CLAUDE.md has rules 1-${Object.keys(rules).length}`); continue; }
      const phrase = (m[2] || '').trim().toLowerCase();
      const owner = phrase && Object.entries(rules).find(([, title]) => title.startsWith(phrase) || phrase.startsWith(title));
      if (owner && owner[0] !== n) fail(`${f} cites "${m[0].trim()}", which is CLAUDE.md rule ${owner[0]}`);
    }
    for (const m of t.matchAll(CITE_TEXT)) {
      const phrase = m[1].trim().toLowerCase();
      if (!claudeFlat.includes(phrase)) fail(`${f} cites CLAUDE.md for "${m[1].trim()}", which CLAUDE.md does not say`);
    }
  }
  // the habit the history records, and where engine learnings go, are written where a contributor reads
  if (!/confirm(?:ed)? red/i.test(claudeFlat) || !/revert/i.test(claudeFlat)) fail('CLAUDE.md does not state the red-then-green rule (a new assertion is confirmed red with its rule reverted)');
  if (!/issue tracker/i.test(claudeFlat)) fail('CLAUDE.md does not name the issue tracker as where engine learnings go');

  // (d) pointers that once named files that do not exist stay gone.
  const STALE = [
    ['compile-report.mjs', 'the report compiler is views/improve/report.mjs'],
    ['compile-package.mjs', 'the package compiler is views/compile.mjs'],
    ['scanner-candidates.md', 'the roster is map/scanners/CANDIDATES.md'],
    ['backlog-computed.yaml', 'backlog.mjs writes map/backlog.yaml'],
    ['optimization-backlog.yaml', 'no tool reads or writes it'],
    ["maturity.mjs's REAL_GATES", 'REAL_GATES lives in map/doctrine.mjs'],
    ['PACKET.md Phase', 'owner/PACKET.md has no phases'],
    ['the orchestrator', 'no tracked file defines one; owner/ask-owner.md is the prompt'],
  ];
  for (const f of tracked.filter((x) => !isHarness(x))) {
    const t = flat(read(f));
    for (const [s, why] of STALE) if (t.includes(s)) fail(`${f} names ${s}: ${why}`);
  }
  // nothing else builds a run path by hand where lib/run-layout.mjs has the helper
  for (const [f, re] of [['views/compile.mjs', /join\(runDir, 'INDEX\.md'\)/], ['routine/run.mjs', /join\(outDir, 'map', 'scanners\.yaml'\)/], ['map/start.mjs', /join\(outDir, 'map', 'findings'\)/]]) {
    if (re.test(read(f))) fail(`${f} builds ${re.source.replace(/\\/g, '')} by hand; lib/run-layout.mjs has the helper`);
  }

  // (e) repo-census reads this repository's own architecture page and runbook.
  const census = runCensus({ target: ROOT, asOf: '2026-10-01' });
  for (const name of ['architecture-page', 'runbook']) {
    const c = census.checks.find((x) => x.name === name);
    if (!c || c.status !== 'pass') fail(`repo-census on assay itself: ${name} reads ${c ? c.status : 'absent'} (${c ? c.observation : ''})`);
  }

  // (f) how to add a block is written where the harness is described, in the runner's own terms (#87)
  const harness = await import('../harness.mjs').catch(() => null);
  const testsReadme = existsSync(join(ROOT, 'tests', 'README.md')) ? flat(read('tests/README.md')) : '';
  if (!testsReadme) fail('tests/README.md must describe the harness and say how to add a block');
  else if (!testsReadme.includes('tests/blocks/')) fail('tests/README.md must say a block is a file under tests/blocks/');
  if (!harness?.BLOCK_FIELDS) fail('tests/harness.mjs must export BLOCK_FIELDS, the exports the runner reads off a block');
  else for (const f of harness.BLOCK_FIELDS) if (testsReadme && !new RegExp(`export (?:const|async function) ${f}\\b`).test(testsReadme)) fail(`tests/README.md does not say how a block exports ${f}, which the runner reads`);
}
