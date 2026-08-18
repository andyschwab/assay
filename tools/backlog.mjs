#!/usr/bin/env node
// backlog.mjs — the COMPUTED half of a run's optimization backlog.
//
// Every eval produces two things: a client result (the report + handoff) and an
// optimization backlog for the engine itself — the determinism/coverage gaps the run
// exposed in the RUBRIC, not the target. This tool generates the computed portion of
// that backlog by composing the two determinism tools + a prior-run diff:
//
//   • enumerate.mjs --run --json   → live-surface population members no finding cites
//                                     (un-enumerated-population items)
//   • validate.mjs  --target --json → evidence paths that do not resolve
//                                     (evidence-inaccuracy items)
//   • --prior <run>                → facts a prior run cited that this run does not
//                                     (coverage-divergence items, best-effort, review-flagged)
//
// The analyst then curates these into `optimization-backlog.yaml` (the run-root
// deliverable) and adds the AUTHORED items a tool cannot compute (a false strength over
// an un-inspected class, a band-sizing limit, a granularity drift). That split mirrors
// maturity: the tool computes what it can, the human authors the judgment. This file is
// tool-owned and regenerable — like view-maturity-grades.yaml, never hand-edited.
//
// Zero runtime deps beyond node + the sibling tools (which are themselves zero-dep).
//
// Usage:
//   node tools/backlog.mjs <run-dir> [--target <repo>] [--prior <prior-run-dir>] [--write]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-min.mjs';
import { computeDescriptorAgreement } from './variance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const runDir = process.argv[2];
if (!runDir || runDir.startsWith('--')) { console.error('usage: node backlog.mjs <run-dir> [--target <repo>] [--prior <prior-run>] [--write]'); process.exit(2); }
const flag = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const target = flag('--target');
const prior = flag('--prior');
const write = process.argv.includes('--write');

const node = process.execPath;
function toolJson(tool, args) {
  try { return JSON.parse(execFileSync(node, [join(HERE, tool), ...args, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
  catch (e) {
    // a non-zero exit is the tool's VERDICT (violations / coverage gaps found),
    // not a tool failure — the JSON payload is still on stdout. Only an
    // unparseable stdout is a real failure.
    const out = e && e.stdout ? String(e.stdout) : '';
    if (out.trim().startsWith('{')) { try { return JSON.parse(out); } catch { /* fall through */ } }
    console.error(`  (backlog: ${tool} failed: ${e.message.split('\n')[0]})`);
    return null;
  }
}

// mechanism templates + severity per determinism class (kept closed so the backlog is comparable)
const CLASS = {
  'un-enumerated-population': { sev: 'medium', mech: (m) => `Add the ${m.population} population to the terrain's required enumerations (enumerate.mjs already detects it); assess this member or record why it is out of scope.` },
  'evidence-inaccuracy': { sev: 'high', mech: () => `The cited evidence path does not resolve in the target; fix it to the real path. validate.mjs --target fails closed on this class.` },
  'coverage-divergence': { sev: 'medium', mech: (m) => `A prior run cited ${m.file} that this run does not — verify the fact is still present and record it, or confirm it is genuinely gone. Best-effort (basename match); review before acting.` },
  'descriptor-divergence': { sev: 'high', mech: (m) => `Both runs recorded this channel; they JUDGED it differently, and every shipped number (maturity coverage, the halt flags, the chain ranking, the gate) is computed from these fields. Decide per field whether the TARGET changed or the RUN judged differently${m.bothWays ? ' — the run-level divergences move in BOTH directions, which is the signature of judgment drift rather than target change, so treat a cross-run coverage delta as not-a-trend until this is resolved' : ''}. Where it is judgment, pin the rubric (the canon can carry the expected descriptors per channel the way it already carries the channel list).` },
};

const items = [];
let n = 0;
const add = (cls, observation, evidence, meta = {}) => items.push({
  id: `OB-C${String(++n).padStart(2, '0')}`, class: cls, source: 'computed',
  severity: CLASS[cls].sev, status: 'proposed', observation, evidence, mechanism: CLASS[cls].mech(meta),
});

// 1) coverage gaps (enumerate --run)
if (target) {
  const en = toolJson('enumerate.mjs', [target, '--run', runDir]);
  if (en && Array.isArray(en.coverageGaps)) for (const g of en.coverageGaps)
    add('un-enumerated-population',
      `${g.population}: "${g.member}" at ${g.file || g.evidence} is a live-surface population member no finding cites.`,
      [g.evidence || g.file].filter(Boolean), { population: g.population });
}

// 2) evidence-path errors (validate --target)
if (target) {
  const v = toolJson('validate.mjs', [runDir, '--target', target]);
  if (v && Array.isArray(v.evidencePathErrors)) for (const e of v.evidencePathErrors)
    add('evidence-inaccuracy', `${e.finding} cites "${e.path}", which does not exist in the target.`, [`${e.file}:${e.finding}`]);
}

// 3) prior-run divergence (best-effort basename diff). Regex-scrape the raw findings
// text rather than YAML-parse, so it is robust across old/new schemas and flow-map styles.
function findingsPath(dir) {
  for (const rel of ['eval/findings.yaml', 'backtest/findings.yaml', 'findings.yaml']) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
  }
  return null;
}
// returns { basenames:Set, byBasename:Map(basename → first finding id that cited it) }
function scrapeEvidence(path) {
  const basenames = new Set(); const byBasename = new Map();
  if (!path || !existsSync(path)) return { basenames, byBasename };
  const txt = readFileSync(path, 'utf8');
  let curId = '?';
  for (const line of txt.split('\n')) {
    const idm = line.match(/^\s*-?\s*id:\s*(F-\d+|\S+)/); if (idm) curId = idm[1];
    // any repo-relative-looking path with an extension, inside evidence lists or facets
    for (const m of line.matchAll(/([A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+)(?::\d+(?:-\d+)?)?/g)) {
      const b = basename(m[1]);
      if (!/\.(py|sh|js|ts|mjs|json|ya?ml|txt|md|example|service|conf|ini|toml)$/.test(b)) continue;
      basenames.add(b); if (!byBasename.has(b)) byBasename.set(b, curId);
    }
  }
  return { basenames, byBasename };
}
if (prior) {
  const cur = scrapeEvidence(findingsPath(runDir)).basenames;
  const old = scrapeEvidence(findingsPath(prior));
  if (!old.basenames.size) console.error(`  (backlog: could not read prior findings in ${prior})`);
  for (const b of old.basenames) {
    if (cur.has(b)) continue;
    add('coverage-divergence',
      `Prior run ${basename(prior)} cited ${b} (finding ${old.byBasename.get(b)}) but this run cites no finding touching it — a possible dropped fact.`,
      [`${basename(prior)}:${old.byBasename.get(b)}`], { file: b });
  }
}

// 4) descriptor divergence (the layer every shipped number is computed from). Measure 1
// above answers "did both runs record this channel"; this answers "did they judge it the
// same way", which is what the maturity numbers, the halt flags and the gate ride on.
if (prior) {
  try {
    const d = computeDescriptorAgreement([prior, runDir]);
    for (const v of d.divergences)
      add('descriptor-divergence',
        `Effect channel "${v.channel}" carries different descriptors in ${basename(prior)} and this run: ` +
        v.fields.map((f) => `${f.field} ${f.values.map((x) => x.value || '(unset)').join(' vs ')}`).join('; ') + '.',
        [`${basename(prior)}:${v.channel}`], { bothWays: d.bothWays });
    if (d.divergences.length)
      console.error(`  (backlog: descriptor agreement ${d.allFields.pct}% over ${d.channels.shared} shared channels; ` +
        `${d.directions.safer} safer / ${d.directions.riskier} riskier` +
        `${d.bothWays ? ' — BOTH directions: judgment drift, not target change' : ' — one direction, consistent with target change'})`);
  } catch (e) { console.error(`  (backlog: descriptor agreement failed: ${e.message.split('\n')[0]})`); }
}

// ── emit ──
const header = `# backlog-computed.yaml — GENERATED by tools/backlog.mjs. Do not hand-edit.\n` +
  `# The computed half of this run's optimization backlog: determinism/coverage gaps in the\n` +
  `# RUBRIC that this run exposed (not target findings). The analyst curates these into the\n` +
  `# run-root optimization-backlog.yaml and adds the authored items a tool cannot compute.\n` +
  `# Regenerate: node tools/backlog.mjs ${runDir}${target ? ` --target ${target}` : ''}${prior ? ` --prior ${prior}` : ''} --write\n`;
const yaml = header + `generated_from:\n  target: ${target || 'null'}\n  prior: ${prior || 'null'}\ncounts:\n` +
  Object.keys(CLASS).map((c) => `  ${c}: ${items.filter((i) => i.class === c).length}`).join('\n') + `\nitems:\n` +
  items.map((i) => `  - id: ${i.id}\n    class: ${i.class}\n    source: computed\n    severity: ${i.severity}\n    status: proposed\n` +
    `    observation: >\n      ${i.observation.replace(/\n/g, ' ')}\n    evidence: [${i.evidence.join(', ')}]\n` +
    `    mechanism: >\n      ${i.mechanism.replace(/\n/g, ' ')}\n`).join('');

if (write) {
  const out = join(runDir, 'eval', 'backlog-computed.yaml');
  writeFileSync(out, yaml);
  console.log(`wrote ${out} — ${items.length} computed backlog items (${Object.entries(CLASS).map(([c]) => `${items.filter((i) => i.class === c).length} ${c}`).join(', ')})`);
} else {
  console.log(yaml);
  console.error(`\n${items.length} computed backlog items. Re-run with --write to save eval/backlog-computed.yaml.`);
}
