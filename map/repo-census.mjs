#!/usr/bin/env node
// repo-census.mjs — the REPO-CENSUS instrument: decides, from the tree alone, four
// floor rows a run could not decide before except by an LLM-authored census
// (yardstick/requirements.yaml d-architecture-page, d-agent-contract, d-runbook,
// d-ci-gate-on-default-branch — map/scanners/CONTRACT.md §3d), plus six
// owner-evidence checks over dated transcripts the owner commits for what a
// repository cannot show by itself (d-backup-restore-exercised,
// d-rollback-exercised, d-deploy-one-command, d-smoke-on-deployed,
// d-monitoring-with-alert, d-cost-alerts; format at owner/evidence/README.md). Its rows come in through
// map/ingest.mjs (profile `repo-census`) and land on existing axes via
// map/scanners/adapters/repo-census.yaml.
//
// Four checks, each read-only against the checkout, zero network:
//   - architecture-page: ARCHITECTURE.md / docs/ARCHITECTURE.md / docs/architecture.md /
//     docs/architecture/*.md (case-insensitive), or a README "Architecture" section.
//     `pass` only when it also NAMES an external service or data store (a heading or
//     line mentioning database/queue/API/service/store/bucket/provider, or a
//     mermaid/diagram block) — presence alone is not enough. In a monorepo (package.json
//     workspaces, or apps/*/package.json, or packages/*/package.json) this runs at the
//     root AND at every app, one check per location.
//   - agent-contract: AGENTS.md or CLAUDE.md (root and per app, same monorepo rule).
//     `pass` only when it is present-TENSE: no heading matching
//     /^#+\s*(status|history|changelog|todo|backlog)\b/i and no dated changelog line
//     (a line starting with a date like 2026-09-01, or a `- 2026-…` bullet).
//   - runbook: RUNBOOK.md / docs/RUNBOOK.md / docs/runbook*.md, or a README/doc section
//     headed "Runbook" or "Operations". `pass` only when it carries a heading or
//     paragraph for EACH of restart, roll back, rotate (a key/secret/credential), and
//     restore (a backup). Presence of the words is what this decides — whether a
//     procedure was ever actually run is a separate, sidecar claim, said in the
//     observation every time.
//   - ci-gate: every `.github/workflows/*.yml|.yaml`, read with a minimal line-based
//     reader (zero deps — no YAML library; handles the common shapes: `on: [push,
//     pull_request]`, block-form `on: / push: / branches: [main]`, `pull_request:`).
//     A workflow GATES when it triggers on pull_request (or push to the default
//     branch) and runs a step whose `run:` invokes a test/lint/typecheck/build
//     command. `gap` when no gate workflow exists, or when a gate step FAILS OPEN
//     (`continue-on-error: true` on the job or the step) — cited by file:line.
//     Branch protection (whether the check is *required*) is not visible from the
//     tree; the observation says so every time — this check decides only what the
//     tree shows.
//
// Plus six evidence checks (root only, one per descriptor id, named
// `evidence-<descriptor-id>`): each reads ops/evidence/<id>.md (else
// docs/evidence/<id>.md, first found wins) — YAML frontmatter (descriptor, date,
// by, commit, result, plus keys named per row) over a body that must carry at
// least one fenced code block and at least 5 non-empty lines. `pass` only when
// the file is present, the frontmatter is complete and well-formed, `result:
// pass`, and `date` is not in the future and no older than the freshness window
// (`--evidence-max-age`, default 90 days, measured from `--as-of`, default
// today UTC). The document never reads the body past line counts — a transcript
// can hold operational detail. Every observation, pass or gap, says this check
// verifies the transcript's shape and freshness, never the truth of what it
// describes. Full format: owner/evidence/README.md.
//
// Fail loud, never empty: `exit` is 1 when any check is `gap`, 0 when every check is
// `pass` or `not-applicable`. A crash of the runner itself exits 2, so ingest.mjs
// (success set [0, 1]) halts on it.
//
// The packet's pointers (owner/PACKET.md "Pointers"): with `--packet <dir |
// manifest.yaml>`, or with no flag when `<target>/packet/manifest.yaml` exists
// (the self-describing case — recorded in the output either way), the packet
// is loaded and validated first (validatePacket) — an invalid packet halts
// this runner with the validator's lines, same crash rule, exit 2. A pointer
// is then authoritative, never a hint, for the check(s) it names:
// `default_branch` beats discovery (a `--default-branch` flag still wins over
// both); `apps` replaces monorepo detection for the per-location checks
// (architecture-page, agent-contract) — an app path that does not exist is a
// gap for that location; `architecture` / `agent_contract` / `runbook` /
// `evidence` / `workflows` each make their check read exactly the named
// path(s) instead of searching, and a pointer to a missing path is a gap
// naming it, never a silent fallback. The output's `packet` field names which
// pointers were followed; a check that followed one says so in its
// observation. The format itself is documented once, at `owner/PACKET.md` —
// this file never restates it.
//
// Usage:
//   node assay.mjs repo-census <target-dir> --out <file.json> [--default-branch <name>]
//     [--as-of <YYYY-MM-DD>] [--evidence-max-age <days>] [--packet <dir|manifest.yaml>]
// Zero dependencies (node: modules only) beyond the packet reader it shares
// with validate-packet (yardstick/packet.mjs).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute, relative, sep } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { loadPacket, validatePacket, requirementIdsOnDisk } from '../yardstick/packet.mjs';

export const VERSION = '0.3.0';
export const EVIDENCE_IDS = [
  'd-backup-restore-exercised', 'd-rollback-exercised', 'd-deploy-one-command',
  'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts',
];
export const CHECK_NAMES = ['architecture-page', 'agent-contract', 'runbook', 'ci-gate', ...EVIDENCE_IDS.map((id) => `evidence-${id}`)];
export const CHECK_STATUS = ['pass', 'gap', 'not-applicable'];

// ── small filesystem helpers (case-insensitive, read-only, never throw) ──────
function safeReaddir(dir) { try { return readdirSync(dir); } catch { return []; } }
function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }
// find a file in `dir` whose name matches one of `names`, case-insensitively
function ciFindFile(dir, names) {
  const lower = names.map((n) => n.toLowerCase());
  return safeReaddir(dir).find((e) => lower.includes(e.toLowerCase()) && statOk(join(dir, e), (s) => s.isFile())) || null;
}
// find a subdirectory in `dir` named `name`, case-insensitively
function ciFindDir(dir, name) {
  const lower = name.toLowerCase();
  return safeReaddir(dir).find((e) => e.toLowerCase() === lower && statOk(join(dir, e), (s) => s.isDirectory())) || null;
}
function statOk(p, pred) { try { return pred(statSync(p)); } catch { return false; } }
// the repo's README (mirrors map/fresh-clone.mjs's findReadme so both instruments
// agree on which file "the README" names)
function findReadme(dir) {
  const names = safeReaddir(dir).filter((f) => /^readme(\.(md|markdown|txt))?$/i.test(f)).sort();
  return names.find((f) => /\.md$/i.test(f)) || names[0] || null;
}

// ── markdown section extraction (heading-bounded, case-insensitive) ─────────
// Finds the first heading whose text matches `wordRe`, and returns the lines from
// that heading up to (not including) the next heading at the same or a shallower
// level. Deliberately simple: this is a census over headings, not a markdown parser.
function findMdSection(text, wordRe) {
  const lines = text.split('\n');
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && wordRe.test(m[2].trim())) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return { startLine: start + 1, endLine: end, text: lines.slice(start, end).join('\n') };
}

// ── monorepo detection: package.json workspaces, or apps/* / packages/* ─────
// A simple, documented, non-general glob resolver: it understands an exact
// directory or a trailing `/*` (the two shapes real workspace fields use), nothing
// deeper — this is a census signal, not a build-tool glob engine.
function resolveWorkspaceGlob(dir, pattern) {
  const p = String(pattern).replace(/\/$/, '');
  if (p.endsWith('/*')) {
    const base = p.slice(0, -2);
    const baseDir = join(dir, base);
    return safeReaddir(baseDir)
      .filter((e) => statOk(join(baseDir, e), (s) => s.isDirectory()) && existsSync(join(baseDir, e, 'package.json')))
      .map((e) => `${base}/${e}`)
      .sort();
  }
  return existsSync(join(dir, p, 'package.json')) ? [p] : [];
}
export function detectMonorepo(dir) {
  const locations = new Set();
  const pkg = (() => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; } })();
  const workspaces = pkg && pkg.workspaces
    ? (Array.isArray(pkg.workspaces) ? pkg.workspaces : (Array.isArray(pkg.workspaces.packages) ? pkg.workspaces.packages : null))
    : null;
  if (workspaces) for (const g of workspaces) for (const loc of resolveWorkspaceGlob(dir, g)) locations.add(loc);
  for (const base of ['apps', 'packages']) {
    const baseDir = join(dir, base);
    for (const e of safeReaddir(baseDir)) {
      if (statOk(join(baseDir, e), (s) => s.isDirectory()) && existsSync(join(baseDir, e, 'package.json'))) locations.add(`${base}/${e}`);
    }
  }
  return { detected: locations.size > 0, locations: [...locations].sort() };
}

// ── the packet's pointers (owner/PACKET.md "Pointers") ───────────────────────
// Resolution: an explicit --packet flag names a manifest.yaml or a packet dir;
// with no flag, <target>/packet/manifest.yaml is picked up automatically when
// present (the self-describing case) — either way it is loaded and validated
// the same way validate-packet does, and an invalid packet halts this runner
// (thrown here, caught by the CLI's own crash handler below: exit 2, same rule
// as any other runner crash).
// A pointer to a missing path cannot cite that path (validate refuses evidence the
// tree does not have), so it cites the packet itself when the packet is in the tree
// (the claim that is wrong), else the repository root. Set per run().
let missingPointerCite = './:1';
export function findPacketSource(dir, packetArg) {
  if (packetArg) return { source: packetArg, auto: false };
  if (existsSync(join(dir, 'packet', 'manifest.yaml'))) return { source: join(dir, 'packet'), auto: true };
  return null;
}
export function loadValidatedPacket(source) {
  const { doc, file } = loadPacket(source);
  const requirementIds = requirementIdsOnDisk();
  const errors = validatePacket(doc, { requirementIds });
  if (errors.length) throw new Error(`invalid packet at ${file}:\n${errors.map((e) => `  • ${e}`).join('\n')}`);
  return { doc, file };
}
// A path-or-list pointer (architecture, agent_contract) applied to one
// location: a scalar names the root's page; a list is read positionally
// against `locations` (root first, then apps in the packet's own `apps`
// order) — every pointer path is relative to the repo root, per owner/PACKET.md.
export function pointerForLocation(value, locations, loc) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const idx = locations.indexOf(loc);
    return idx > -1 && idx < value.length ? value[idx] : null;
  }
  return loc === '.' ? value : null;
}
const pointerNote = (used) => (used ? " (per the packet's pointer)" : '');

// ── architecture-page ────────────────────────────────────────────────────────
const EXTERNAL_RE = /\b(database|queue|api|service|store|bucket|provider)\b/i;
const DIAGRAM_RE = /```\s*mermaid\b|\bdiagram\b/i;
function checkArchitecturePage(dir, loc, pointerPath) {
  const base = loc === '.' ? dir : join(dir, loc);
  const relPath = (p) => (loc === '.' ? p : `${loc}/${p}`);
  const name = 'architecture-page';
  const detail = { path: loc };
  if (loc !== '.' && !existsSync(base)) {
    detail.pointer = 'apps';
    return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${loc} as an app, which does not exist.` };
  }
  if (pointerPath) {
    detail.pointer = 'architecture';
    const full = join(dir, pointerPath);
    if (!existsSync(full)) {
      return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${pointerPath} for the architecture page, which does not exist.` };
    }
    const content = safeRead(full) || '';
    const namesExternal = EXTERNAL_RE.test(content) || DIAGRAM_RE.test(content);
    const evidence = [`${pointerPath}:1`];
    if (namesExternal) return { name, status: 'pass', detail, evidence, observation: `${pointerPath}${pointerNote(true)} exists and names at least one external service or data store.` };
    return { name, status: 'gap', detail, evidence, observation: `${pointerPath}${pointerNote(true)} exists but names no external service or data store — no heading or line mentions database, queue, API, service, store, bucket, or provider, and no diagram block is present.` };
  }
  let filePath = null, content = null, lineOffset = 1;

  const top = ciFindFile(base, ['ARCHITECTURE.md']);
  if (top) { filePath = relPath(top); content = safeRead(join(base, top)); }
  if (!content) {
    const docsFile = ciFindFile(join(base, 'docs'), ['ARCHITECTURE.md', 'architecture.md']);
    if (docsFile) { filePath = relPath(`docs/${docsFile}`); content = safeRead(join(base, 'docs', docsFile)); }
  }
  if (!content) {
    const archDirName = ciFindDir(join(base, 'docs'), 'architecture');
    if (archDirName) {
      const archDir = join(base, 'docs', archDirName);
      const md = safeReaddir(archDir).filter((f) => /\.md$/i.test(f)).sort();
      if (md.length) { filePath = relPath(`docs/${archDirName}/${md[0]}`); content = safeRead(join(archDir, md[0])); }
    }
  }
  let sectioned = false;
  if (!content) {
    const readme = findReadme(base);
    if (readme) {
      const text = safeRead(join(base, readme));
      const sec = text && findMdSection(text, /^architecture\b/i);
      if (sec) { filePath = relPath(readme); content = sec.text; lineOffset = sec.startLine; sectioned = true; }
    }
  }

  if (!content) {
    return {
      name, status: 'gap', detail,
      evidence: [`${relPath('') || './'}:1`],   // the root cites ./ (never an empty path)
      observation: `No architecture page found${loc !== '.' ? ` for ${loc}` : ''} (checked ARCHITECTURE.md, docs/ARCHITECTURE.md, docs/architecture.md, docs/architecture/*.md, and a README "Architecture" section) — nothing shows the parts, the data flow, and the external services.`,
    };
  }
  const namesExternal = EXTERNAL_RE.test(content) || DIAGRAM_RE.test(content);
  const evidence = [`${filePath}:${lineOffset}`];
  if (namesExternal) {
    return { name, status: 'pass', detail, evidence, observation: `${filePath}${sectioned ? ` (Architecture section, line ${lineOffset})` : ''} exists and names at least one external service or data store.` };
  }
  return {
    name, status: 'gap', detail, evidence,
    observation: `${filePath} exists but names no external service or data store — no heading or line mentions database, queue, API, service, store, bucket, or provider, and no diagram block is present.`,
  };
}

// ── agent-contract ───────────────────────────────────────────────────────────
const AGENT_HEADING_RE = /^#+\s*(status|history|changelog|todo|backlog)\b/i;
const DATED_LINE_RE = /^(?:\d{4}-\d{2}-\d{2}\b|-\s*\d{4}-)/;
function checkAgentContract(dir, loc, pointerPath) {
  const base = loc === '.' ? dir : join(dir, loc);
  const relPath = (p) => (loc === '.' ? p : `${loc}/${p}`);
  const name = 'agent-contract';
  const detail = { path: loc };
  if (loc !== '.' && !existsSync(base)) {
    detail.pointer = 'apps';
    return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${loc} as an app, which does not exist.` };
  }

  let filePath, text;
  if (pointerPath) {
    detail.pointer = 'agent_contract';
    const full = join(dir, pointerPath);
    if (!existsSync(full)) {
      return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${pointerPath} for the agent contract, which does not exist.` };
    }
    filePath = pointerPath;
    text = safeRead(full) || '';
  } else {
    let file = ciFindFile(base, ['AGENTS.md']);
    if (!file) file = ciFindFile(base, ['CLAUDE.md']);
    if (!file) {
      return {
        name, status: 'gap', detail,
        evidence: [`${relPath('') || './'}:1`],   // the root cites ./ (never an empty path)
        observation: `No AGENTS.md or CLAUDE.md found${loc !== '.' ? ` for ${loc}` : ''}.`,
      };
    }
    filePath = relPath(file);
    text = safeRead(join(base, file)) || '';
  }
  const lines = text.split('\n');
  let offense = null;
  for (let i = 0; i < lines.length; i++) {
    if (AGENT_HEADING_RE.test(lines[i]) || DATED_LINE_RE.test(lines[i].trim())) { offense = { line: i + 1, text: lines[i].trim() }; break; }
  }
  if (offense) {
    return {
      name, status: 'gap', detail,
      evidence: [`${filePath}:${offense.line}`],
      observation: `${filePath}:${offense.line}${pointerNote(!!pointerPath)} carries a status/history marker ("${offense.text.slice(0, 80)}") — an agent contract must be present-tense; history and status belong in a separate, co-located history file (canon convention).`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: [`${filePath}:1`],
    observation: `${filePath}${pointerNote(!!pointerPath)} is present and present-tense: no status/history/changelog/todo/backlog heading and no dated changelog line.`,
  };
}

// ── runbook ───────────────────────────────────────────────────────────────
// "Presence of the words is what this decides" — whether a procedure was ever
// actually run is a separate, sidecar claim, said in every observation this emits.
const PROCEDURES = [
  ['restart', /\brestart(?:ing|ed|s)?\b/i, null],
  ['roll back', /\broll(?:s|ing)?[\s-]?back\b|\brollback\b/i, null],
  ['rotate a key/secret/credential', /\brotat\w*\b/i, /\b(?:key|secret|credential)s?\b/i],
  ['restore from backup', /\brestor\w*\b/i, /\bbackup\b/i],
];
function hasProcedure(text, verbRe, nounRe) {
  if (!nounRe) return verbRe.test(text);
  const re = new RegExp(verbRe.source, verbRe.flags.includes('g') ? verbRe.flags : verbRe.flags + 'g');
  let m;
  while ((m = re.exec(text))) {
    const window = text.slice(Math.max(0, m.index - 200), Math.min(text.length, m.index + 200));
    if (nounRe.test(window)) return true;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return false;
}
function checkRunbook(dir, pointerPath) {
  const name = 'runbook';
  const detail = { path: '.' };
  if (pointerPath) {
    detail.pointer = 'runbook';
    const full = join(dir, pointerPath);
    if (!existsSync(full)) {
      return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${pointerPath} for the runbook, which does not exist.` };
    }
    const content = safeRead(full) || '';
    const missing = PROCEDURES.filter(([, verbRe, nounRe]) => !hasProcedure(content, verbRe, nounRe)).map(([label]) => label);
    const evidence = [`${pointerPath}:1`];
    if (missing.length) {
      return { name, status: 'gap', detail, evidence, missing, observation: `${pointerPath}${pointerNote(true)} is missing a heading or paragraph for: ${missing.join(', ')}. Presence of the words is what this decides; whether a procedure was ever actually run is a separate, sidecar claim.` };
    }
    return { name, status: 'pass', detail, evidence, observation: `${pointerPath}${pointerNote(true)} carries a heading or paragraph for restart, roll back, rotate, and restore. Presence of the words is what this decides; whether a procedure was ever actually run is a separate, sidecar claim.` };
  }
  let filePath = null, content = null, lineOffset = 1;

  const top = ciFindFile(dir, ['RUNBOOK.md']);
  if (top) { filePath = top; content = safeRead(join(dir, top)); }
  if (!content) {
    const docsFile = ciFindFile(join(dir, 'docs'), ['RUNBOOK.md']);
    if (docsFile) { filePath = `docs/${docsFile}`; content = safeRead(join(dir, 'docs', docsFile)); }
  }
  if (!content) {
    const f = safeReaddir(join(dir, 'docs')).find((e) => /^runbook.*\.md$/i.test(e));
    if (f) { filePath = `docs/${f}`; content = safeRead(join(dir, 'docs', f)); }
  }
  if (!content) {
    const candidates = [findReadme(dir), ...safeReaddir(join(dir, 'docs')).filter((f) => /\.md$/i.test(f)).map((f) => `docs/${f}`)].filter(Boolean);
    for (const c of candidates) {
      const text = safeRead(join(dir, c));
      const sec = text && findMdSection(text, /^(runbook|operations)\b/i);
      if (sec) { filePath = c; content = sec.text; lineOffset = sec.startLine; break; }
    }
  }

  if (!content) {
    return {
      name, status: 'gap', detail,
      evidence: ['./:1'],
      observation: 'No runbook found (checked RUNBOOK.md, docs/RUNBOOK.md, docs/runbook*.md, and a README/doc "Runbook" or "Operations" section). Presence of the words is what this decides; whether a procedure was ever run is a separate, sidecar claim.',
    };
  }
  const missing = PROCEDURES.filter(([, verbRe, nounRe]) => !hasProcedure(content, verbRe, nounRe)).map(([label]) => label);
  const evidence = [`${filePath}:${lineOffset}`];
  if (missing.length) {
    return {
      name, status: 'gap', detail, evidence,
      observation: `${filePath} is missing a heading or paragraph for: ${missing.join(', ')}. Presence of the words is what this decides; whether a procedure was ever actually run is a separate, sidecar claim.`,
      missing,
    };
  }
  return {
    name, status: 'pass', detail, evidence,
    observation: `${filePath} carries a heading or paragraph for restart, roll back, rotate, and restore. Presence of the words is what this decides; whether a procedure was ever actually run is a separate, sidecar claim.`,
  };
}

// ── ci-gate ───────────────────────────────────────────────────────────────
// A minimal, line-based, indentation-aware reader for GitHub Actions workflow
// YAML — deliberately not a general parser. It understands: `on: [a, b]` (flow),
// block-form `on: / push: / branches: [main]` or a block list, `pull_request:`
// with no filters, `jobs: / <job>: / steps: / - run: <cmd>`, and
// `continue-on-error: true` at job or step level. Anything shaped differently is
// read conservatively (as "no trigger" / "no gate step" rather than guessed at).
const leadingSpaces = (l) => (l.match(/^ */) || [''])[0].length;
function toLines(text) {
  return text.split('\n').map((raw, i) => ({ n: i + 1, indent: leadingSpaces(raw), trimmed: raw.trim() }));
}
function parseInlineList(v) {
  const m = v.match(/^\[(.*)\]$/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
function parseTrigger(lines) {
  const idx = lines.findIndex((l) => /^on:/.test(l.trimmed));
  if (idx === -1) return { events: [], pushBranches: null, line: null };
  const onLine = lines[idx];
  const inline = onLine.trimmed.match(/^on:\s*(.+)$/);
  let events = [], pushBranches = null;
  if (inline && inline[1].trim()) {
    const val = inline[1].trim();
    const flow = parseInlineList(val);
    events = flow || [val.replace(/^['"]|['"]$/g, '')];
    return { events, pushBranches, line: idx + 1 };
  }
  const base = onLine.indent;
  let i = idx + 1, childIndent = null;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trimmed === '') { i++; continue; }
    if (l.indent <= base) break;
    if (childIndent === null) childIndent = l.indent;
    if (l.indent !== childIndent) { i++; continue; }   // nested content of a sibling key
    const m = l.trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (m) {
      events.push(m[1]);
      if (m[1] === 'push') {
        let j = i + 1;
        while (j < lines.length) {
          const l2 = lines[j];
          if (l2.trimmed === '') { j++; continue; }
          if (l2.indent <= childIndent) break;
          const bm = l2.trimmed.match(/^branches:\s*(.*)$/);
          if (bm) {
            const v = bm[1].trim();
            if (v) pushBranches = parseInlineList(v) || [v.replace(/^['"]|['"]$/g, '')];
            else {
              pushBranches = [];
              let k = j + 1;
              while (k < lines.length && lines[k].indent > l2.indent) {
                const im = lines[k].trimmed.match(/^-\s*(.+)$/);
                if (im) pushBranches.push(im[1].trim().replace(/^['"]|['"]$/g, ''));
                k++;
              }
            }
          }
          j++;
        }
      }
    }
    i++;
  }
  return { events, pushBranches, line: idx + 1 };
}
// `node --test`, and `node <file>` where the file sits in a test/ or tests/ directory or
// is named *.test.* / *.spec.*: the zero-dependency form of a test step
const GATE_CMD_RE = /\b(?:npm\s+(?:run\s+)?(?:test|lint|typecheck|build)|pnpm\s+(?:run\s+)?(?:test|lint|typecheck|build)|yarn\s+(?:run\s+)?(?:test|lint|typecheck|build)|tsc\b|jest\b|vitest\b|pytest\b|go\s+test|cargo\s+test|make\s+test|(?:deno|bun)\s+test|node\s+--test|node\s+(?:\S*\/)?(?:tests?|__tests__)\/\S+|node\s+\S+\.(?:test|spec)\.[cm]?[jt]s)\b/i;
// A gate that can fail open is not a gate: `continue-on-error: true` is the
// documented GitHub Actions shape, but a `run:` script reaches the identical
// outcome with plain shell — appending `|| true` / `|| exit 0` / `|| :` to the
// gate command, or disabling errexit for the rest of the script with `set +e`.
// Checked per LINE of the step's script (a block-scalar `run: |` script is
// captured whole, below) so the citation lands on the exact offending line,
// never the step's first line alone.
const FAIL_OPEN_SHELL_RE = /\|\|\s*(?:true|exit\s+0|:)\s*(?:#.*)?$/;
const SET_PLUS_E_RE = /(?:^|[;&]|\bthen\b)\s*set\s+(?:-\w*\s+)*\+e(?:\s|$)/;
function shellFailOpenLine(text) {
  const t = String(text || '');
  if (FAIL_OPEN_SHELL_RE.test(t)) return 'shell';
  if (SET_PLUS_E_RE.test(t)) return 'set +e';
  return null;
}
// A `run:` value that is a block-scalar indicator (`|`, `|-`, `|+`, `>`, `>-`, `>+`,
// optionally followed by an explicit indentation indicator) rather than an inline
// command — the script body is the more-indented lines that follow.
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*\s*(?:#.*)?$/;
function captureBlock(lines, startIdx, baseIndent) {
  const out = []; let idx = startIdx;
  while (idx < lines.length) {
    const l = lines[idx];
    if (l.trimmed === '') { idx++; continue; }
    if (l.indent <= baseIndent) break;
    out.push({ n: l.n, text: l.trimmed });
    idx++;
  }
  return { scriptLines: out, nextIdx: idx };
}
function parseSteps(lines) {
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l.trimmed));
  if (jobsIdx === -1) return [];
  const jobsIndent = lines[jobsIdx].indent;
  const steps = [];
  let i = jobsIdx + 1, jobIndent = null;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trimmed === '') { i++; continue; }
    if (l.indent <= jobsIndent) break;
    if (jobIndent === null) jobIndent = l.indent;
    if (l.indent === jobIndent && /^[\w-]+:\s*$/.test(l.trimmed)) {
      let j = i + 1, jobContinueOnError = false;
      while (j < lines.length) {
        const l2 = lines[j];
        if (l2.trimmed === '') { j++; continue; }
        if (l2.indent <= jobIndent) break;
        if (/^continue-on-error:\s*true\s*$/.test(l2.trimmed)) jobContinueOnError = true;
        if (/^steps:\s*$/.test(l2.trimmed)) {
          const stepsIndent = l2.indent;
          let k = j + 1, itemIndent = null, cur = null;
          const flush = () => { if (cur) steps.push(cur); cur = null; };
          // handle a `run:` key at line l3 (indent runIndent): inline command, or a
          // block scalar whose body is captured from the following more-indented
          // lines. Returns the index to resume the outer loop from.
          const handleRun = (l3, rest, kNow) => {
            const m = rest.match(/^run:\s*(.*)$/);
            if (!m) return kNow;
            const val = m[1].trim();
            if (BLOCK_SCALAR_RE.test(val) || val === '') {
              const { scriptLines, nextIdx } = captureBlock(lines, kNow + 1, l3.indent);
              if (scriptLines.length) {
                cur.scriptLines = scriptLines;
                cur.cmd = scriptLines.map((s) => s.text).join('\n');
                cur.line = l3.n;
                return nextIdx - 1;
              }
              return kNow;
            }
            cur.cmd = val; cur.line = l3.n;
            return kNow;
          };
          while (k < lines.length) {
            const l3 = lines[k];
            if (l3.trimmed === '') { k++; continue; }
            if (l3.indent <= stepsIndent) break;
            if (itemIndent === null && /^-\s?/.test(l3.trimmed)) itemIndent = l3.indent;
            const isItemStart = itemIndent !== null && l3.indent === itemIndent && /^-\s?/.test(l3.trimmed);
            if (isItemStart) {
              flush();
              cur = { line: l3.n, cmd: null, continueOnError: jobContinueOnError, coeLine: null };
              const rest = l3.trimmed.replace(/^-\s?/, '');
              k = handleRun(l3, rest, k);
              if (/^continue-on-error:\s*true\s*$/.test(rest)) { cur.continueOnError = true; cur.coeLine = l3.n; }
            } else if (cur) {
              k = handleRun(l3, l3.trimmed, k);
              if (/^continue-on-error:\s*true\s*$/.test(l3.trimmed)) { cur.continueOnError = true; cur.coeLine = l3.n; }
            }
            k++;
          }
          flush();
        }
        j++;
      }
    }
    i++;
  }
  for (const s of steps) {
    s.isGateCmd = !!(s.cmd && GATE_CMD_RE.test(s.cmd));
    // a gate step can also fail open through its own shell script — never
    // overrides an already-found `continue-on-error: true` (that citation wins)
    if (!s.continueOnError) {
      const candidates = s.scriptLines && s.scriptLines.length ? s.scriptLines : (s.cmd ? [{ n: s.line, text: s.cmd }] : []);
      for (const c of candidates) {
        const shape = shellFailOpenLine(c.text);
        if (shape) { s.continueOnError = true; s.coeLine = c.n; s.failOpenShell = shape; s.failOpenText = c.text; break; }
      }
    }
  }
  return steps;
}
export function parseWorkflow(text) {
  const lines = toLines(text);
  return { trigger: parseTrigger(lines), steps: parseSteps(lines) };
}
function resolveDefaultBranch(dir, given, pointerBranch) {
  if (given) return given;
  if (pointerBranch) return pointerBranch;
  if (existsSync(join(dir, '.git'))) {
    const r = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: dir, encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.trim().match(/([^/]+)$/);
      if (m) return m[1];
    }
  }
  return 'main';
}
function checkCiGate(dir, defaultBranchArg, pointerBranch, workflowsPointer) {
  const name = 'ci-gate';
  const defaultBranch = resolveDefaultBranch(dir, defaultBranchArg, pointerBranch);
  const wfRelBase = workflowsPointer ? workflowsPointer.replace(/\/$/, '') : '.github/workflows';
  const wfDir = join(dir, wfRelBase);
  const files = safeReaddir(wfDir).filter((f) => /\.ya?ml$/i.test(f)).sort();
  const branchNote = 'Branch protection (whether this check is required to merge) is not visible from the tree; this check decides only what the tree shows.';
  const detail = { path: '.', defaultBranch, workflows: [], failOpen: [] };
  if (workflowsPointer) detail.pointer = 'workflows';
  if (!files.length) {
    return {
      name, status: 'gap', detail,
      evidence: [existsSync(wfDir) ? `${wfRelBase}/:1` : './:1'],   // never cite a path the tree does not have
      observation: `No ${wfRelBase}/*.yml|.yaml found${pointerNote(!!workflowsPointer)}; nothing runs the gates on the default branch (${defaultBranch}) or on a pull request. ${branchNote}`,
    };
  }
  let anyGate = false;
  const failOpen = [];
  for (const f of files) {
    const relFile = `${wfRelBase}/${f}`;
    const text = safeRead(join(wfDir, f)) || '';
    const { trigger, steps } = parseWorkflow(text);
    const onPR = trigger.events.includes('pull_request') || trigger.events.includes('pull_request_target');
    const onDefaultPush = trigger.events.includes('push') && (trigger.pushBranches === null || trigger.pushBranches.includes(defaultBranch));
    const gateSteps = steps.filter((s) => s.isGateCmd);
    const gates = (onPR || onDefaultPush) && gateSteps.length > 0;
    if (gates) anyGate = true;
    for (const s of gateSteps) if (s.continueOnError) failOpen.push({ file: relFile, line: s.coeLine || s.line, cmd: s.failOpenText || s.cmd, shape: s.failOpenShell ? 'shell' : 'continue-on-error' });
    detail.workflows.push({ file: relFile, events: trigger.events, pushBranches: trigger.pushBranches, gates, gateCommands: gateSteps.map((s) => s.cmd) });
  }
  detail.failOpen = failOpen;
  if (failOpen.length) {
    const shapes = [...new Set(failOpen.map((f) => f.shape === 'shell' ? 'a run command that swallows a non-zero exit (`|| true` / `|| exit 0` / `|| :` / `set +e`)' : '`continue-on-error: true`'))];
    return {
      name, status: 'gap', detail,
      evidence: failOpen.map((f) => `${f.file}:${f.line}`),
      observation: `A gate step fails open (${shapes.join(', or ')}): ${failOpen.map((f) => `${f.file}:${f.line} (\`${f.cmd}\`)`).join('; ')}. A gate that can fail open is not a gate. ${branchNote}`,
    };
  }
  if (!anyGate) {
    return {
      name, status: 'gap', detail,
      evidence: detail.workflows.map((w) => `${w.file}:1`),
      observation: `No workflow both triggers on pull_request (or push to the default branch, ${defaultBranch}${pointerNote(!!pointerBranch)}) and runs a test/lint/typecheck/build step${pointerNote(!!workflowsPointer)}. ${branchNote}`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: detail.workflows.filter((w) => w.gates).map((w) => `${w.file}:1`),
    observation: `At least one workflow${pointerNote(!!workflowsPointer)} gates on pull_request or push to the default branch (${defaultBranch}${pointerNote(!!pointerBranch)}) and runs a test/lint/typecheck/build step, with no gate step failing open. ${branchNote}`,
  };
}

// ── evidence: owner-attested transcripts ──
// Six floor rows describe things a repository cannot show by itself — a backup
// was restored, a rollback ran, a deploy came up as the committed sha, a smoke
// check hit the deployed app, an alert fired and was received, cost alerts are
// named per account. The owner commits a dated transcript per row
// (owner/evidence/README.md is the one home of the format); this check
// decides only the transcript's SHAPE and FRESHNESS — never whether the
// procedure it describes actually happened, which rests on the named person's
// attestation in version history. Root only, zero deps, zero network.
const EVIDENCE_ROWS = {
  'd-backup-restore-exercised': {
    keys: ['backup', 'target', 'verified'],
    label: 'a backup was restored into a scratch instance and the restored data was verified',
  },
  'd-rollback-exercised': {
    keys: ['from', 'to', 'verified'],
    label: 'a rollback was exercised and verified afterward',
  },
  'd-deploy-one-command': {
    keys: ['command', 'deployed_sha'],
    label: 'the one documented deploy command was run and the deployed build reports the committed sha',
  },
  'd-smoke-on-deployed': {
    keys: ['environment', 'check'],
    label: 'a smoke check ran against the deployed application',
  },
  'd-monitoring-with-alert': {
    keys: ['monitor', 'alert_fired', 'alert_received'],
    label: 'monitoring is configured and its alert route was exercised',
  },
  'd-cost-alerts': {
    keys: ['accounts'],
    label: 'a cost alert with a named recipient exists on every metered account',
  },
};
const EVIDENCE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVIDENCE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVIDENCE_COMMIT_RE = /^[0-9a-f]{7,40}$/i;
const EVIDENCE_ACCOUNT_RE = /^[^:]+:.+->.+$/; // "<account>: <threshold> -> <recipient>"

// find ops/evidence/<id>.md, else docs/evidence/<id>.md; first found wins
function findEvidenceFile(dir, id, pointerDir) {
  if (pointerDir) {
    const rel = `${pointerDir.replace(/\/$/, '')}/${id}.md`;
    return statOk(join(dir, rel), (s) => s.isFile()) ? { relPath: rel, source: 'pointer' } : null;
  }
  for (const base of ['ops', 'docs']) {
    const rel = `${base}/evidence/${id}.md`;
    if (statOk(join(dir, rel), (s) => s.isFile())) return { relPath: rel, source: base };
  }
  return null;
}
// splits a leading `---` … `---` YAML block from the rest; null when the file
// carries no closed frontmatter block
function splitFrontmatter(text) {
  const lines = text.split('\n');
  if ((lines[0] || '').trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  if (end === -1) return null;
  return { fmText: lines.slice(1, end).join('\n'), bodyLines: lines.slice(end + 1) };
}
// body minimum: at least one fenced code block, at least 5 non-empty lines total.
// Counts only — the body itself (which can hold operational detail) never enters
// the document.
function checkEvidenceBody(bodyLines) {
  const nonEmptyCount = bodyLines.filter((l) => l.trim() !== '').length;
  const fenceCount = bodyLines.filter((l) => /^```/.test(l.trim())).length;
  return { nonEmptyCount, hasFencedBlock: fenceCount >= 2 };
}
function checkEvidenceRow(dir, id, asOfDate, maxAgeDays, evidencePointer) {
  const name = `evidence-${id}`;
  const rowSpec = EVIDENCE_ROWS[id];
  const detail = { path: '.', descriptor: id, file: null };
  if (evidencePointer) detail.pointer = 'evidence';
  const found = findEvidenceFile(dir, id, evidencePointer);
  if (!found) {
    if (evidencePointer) {
      const rel = `${evidencePointer.replace(/\/$/, '')}/${id}.md`;
      return { name, status: 'gap', detail, evidence: [missingPointerCite], observation: `The packet points at ${rel}, which does not exist.` };
    }
    return {
      name, status: 'gap', detail,
      evidence: ['.:1'],
      observation: `No evidence transcript found for ${id} (checked ops/evidence/${id}.md, docs/evidence/${id}.md).`,
    };
  }
  detail.file = found.relPath; detail.source = found.source;
  const text = safeRead(join(dir, found.relPath)) || '';
  const split = splitFrontmatter(text);
  if (!split) {
    return {
      name, status: 'gap', detail,
      evidence: [`${found.relPath}:1`],
      observation: `${found.relPath} has no closed YAML frontmatter block (a leading \`---\` line, then keys, then a closing \`---\`).`,
    };
  }
  let fm;
  try { fm = parseYaml(split.fmText); }
  catch (e) {
    return {
      name, status: 'gap', detail,
      evidence: [`${found.relPath}:1`],
      observation: `${found.relPath} frontmatter is not valid YAML: ${e.message}`,
    };
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
    return {
      name, status: 'gap', detail,
      evidence: [`${found.relPath}:1`],
      observation: `${found.relPath} frontmatter is not a mapping of keys.`,
    };
  }
  detail.frontmatter = fm;
  const problems = [];
  if (fm.descriptor !== id) problems.push(`descriptor is "${fm.descriptor ?? ''}" (must equal ${id})`);
  const dateStr = typeof fm.date === 'string' ? fm.date : String(fm.date ?? '');
  if (!EVIDENCE_DATE_RE.test(dateStr)) problems.push(`date "${dateStr}" is not YYYY-MM-DD`);
  if (typeof fm.by !== 'string' || !fm.by.trim()) problems.push('by is missing');
  else if (EVIDENCE_EMAIL_RE.test(fm.by.trim())) problems.push(`by "${fm.by}" looks like an email address (a role or handle is required)`);
  if (typeof fm.commit !== 'string' || !EVIDENCE_COMMIT_RE.test(fm.commit)) problems.push(`commit "${fm.commit ?? ''}" is not 7-40 hex characters`);
  if (fm.result !== 'pass' && fm.result !== 'fail') problems.push(`result "${fm.result ?? ''}" is not pass|fail`);
  else if (fm.result === 'fail') problems.push('result: fail');
  const missingKeys = rowSpec.keys.filter((k) => fm[k] === undefined || fm[k] === null || fm[k] === '');
  if (missingKeys.length) problems.push(`missing key(s): ${missingKeys.join(', ')}`);
  if (id === 'd-deploy-one-command' && !missingKeys.includes('deployed_sha') && !missingKeys.includes('commit') && typeof fm.commit === 'string' && fm.deployed_sha !== fm.commit) {
    problems.push(`deployed_sha "${fm.deployed_sha}" does not match commit "${fm.commit}"`);
  }
  if (id === 'd-monitoring-with-alert' && !missingKeys.includes('alert_fired') && !missingKeys.includes('alert_received')) {
    const fired = Date.parse(fm.alert_fired), received = Date.parse(fm.alert_received);
    if (Number.isNaN(fired) || Number.isNaN(received)) problems.push('alert_fired / alert_received must be ISO timestamps');
    else if (received < fired) problems.push(`alert_received (${fm.alert_received}) precedes alert_fired (${fm.alert_fired})`);
  }
  if (id === 'd-cost-alerts' && !missingKeys.includes('accounts')) {
    if (!Array.isArray(fm.accounts) || !fm.accounts.length) problems.push('accounts must be a non-empty list');
    else {
      const bad = fm.accounts.filter((a) => typeof a !== 'string' || !EVIDENCE_ACCOUNT_RE.test(a));
      if (bad.length) problems.push(`accounts entries must name account, threshold, and recipient (e.g. "anthropic: $500/month -> platform on-call"): ${bad.map((b) => JSON.stringify(b)).join(', ')}`);
    }
  }
  if (EVIDENCE_DATE_RE.test(dateStr)) {
    if (dateStr > asOfDate) problems.push(`date ${dateStr} is in the future (as of ${asOfDate})`);
    else {
      const ageDays = Math.round((Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${dateStr}T00:00:00Z`)) / 86400000);
      if (ageDays > maxAgeDays) problems.push(`stale: dated ${dateStr}, ${ageDays} days before ${asOfDate} (freshness window ${maxAgeDays} days)`);
    }
  }
  const body = checkEvidenceBody(split.bodyLines);
  detail.bodyNonEmptyLines = body.nonEmptyCount;
  detail.bodyHasFencedBlock = body.hasFencedBlock;
  if (body.nonEmptyCount < 5 || !body.hasFencedBlock) {
    problems.push(`body is a stub (${body.nonEmptyCount} non-empty line(s), fenced code block ${body.hasFencedBlock ? 'present' : 'absent'} — needs at least 5 non-empty lines and at least one fenced code block)`);
  }
  if (problems.length) {
    return {
      name, status: 'gap', detail,
      evidence: [`${found.relPath}:1`],
      observation: `${found.relPath}: ${problems.join('; ')}.`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: [`${found.relPath}:1`],
    observation: `${found.relPath}${pointerNote(!!evidencePointer)} attests, by ${fm.by} at commit ${fm.commit} on ${fm.date} (as of ${asOfDate}), that ${rowSpec.label}. This check verifies the transcript's shape and freshness, not that the procedure actually happened.`,
  };
}

// ── the run ──────────────────────────────────────────────────────────────────
function gitHead(dir) {
  if (!existsSync(join(dir, '.git'))) return null;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() || null : null;
}
// strip a "user:password@" userinfo from an http(s)-style remote URL; an SSH
// remote (git@host:owner/repo.git) carries no "://" and is left untouched — the
// "git@" there is the protocol's normal user, not a leaked credential.
const USERINFO_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]+@/;
export function stripUserinfo(url) { return url.replace(USERINFO_RE, '$1'); }
function gitRemote(dir) {
  if (!existsSync(join(dir, '.git'))) return null;
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const url = String(r.stdout || '').trim();
  return url ? stripUserinfo(url) : null;
}
export function run({ target, defaultBranch = null, asOf = null, evidenceMaxAgeDays = 90, packet: packetArg = null }) {
  const dir = resolve(target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`target is not a directory: ${target}`);

  const packetSource = findPacketSource(dir, packetArg);
  let packetDoc = null, packetFile = null, packetAuto = false;
  if (packetSource) {
    const { doc, file } = loadValidatedPacket(packetSource.source);
    packetDoc = doc; packetFile = file; packetAuto = packetSource.auto;
  }
  const packetRel = packetFile ? relative(dir, resolve(packetFile)) : null;
  missingPointerCite = packetRel && !packetRel.startsWith('..') && !isAbsolute(packetRel) ? `${packetRel.split(sep).join('/')}:1` : './:1';
  const pointers = (packetDoc && packetDoc.pointers) || {};
  const pointersUsed = new Set();
  const note = (key) => pointersUsed.add(key);

  const mono = Array.isArray(pointers.apps)
    ? { detected: true, locations: [...pointers.apps] }
    : (typeof pointers.apps === 'string' ? { detected: true, locations: [pointers.apps] } : detectMonorepo(dir));
  if (pointers.apps !== undefined) note('apps');
  const locations = mono.detected ? ['.', ...mono.locations] : ['.'];

  const checks = [];
  for (const loc of locations) {
    const p = pointerForLocation(pointers.architecture, locations, loc);
    if (p) note('architecture');
    checks.push(checkArchitecturePage(dir, loc, p));
  }
  for (const loc of locations) {
    const p = pointerForLocation(pointers.agent_contract, locations, loc);
    if (p) note('agent_contract');
    checks.push(checkAgentContract(dir, loc, p));
  }
  if (pointers.runbook) note('runbook');
  checks.push(checkRunbook(dir, pointers.runbook || null));
  if (pointers.default_branch) note('default_branch');
  if (pointers.workflows) note('workflows');
  checks.push(checkCiGate(dir, defaultBranch, pointers.default_branch || null, pointers.workflows || null));
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error(`--as-of must be YYYY-MM-DD (got "${asOfDate}")`);
  if (!(Number(evidenceMaxAgeDays) > 0)) throw new Error(`--evidence-max-age must be a positive number of days (got "${evidenceMaxAgeDays}")`);
  if (pointers.evidence) note('evidence');
  for (const id of EVIDENCE_IDS) checks.push(checkEvidenceRow(dir, id, asOfDate, Number(evidenceMaxAgeDays), pointers.evidence || null));
  const exit = checks.some((c) => c.status === 'gap') ? 1 : 0;
  const target_ = { path: target, head: gitHead(dir) };
  const remote = gitRemote(dir);
  if (remote) target_.remote = remote;
  const doc = {
    tool: 'repo-census', version: VERSION, target: target_, monorepo: mono,
    evidence: { asOf: asOfDate, maxAgeDays: Number(evidenceMaxAgeDays) },
    checks, exit,
  };
  if (packetDoc) doc.packet = { path: packetFile, auto: packetAuto, pointers_used: [...pointersUsed].sort() };
  return doc;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  const out = opt('--out');
  const defaultBranch = opt('--default-branch');
  const asOf = opt('--as-of');
  const evidenceMaxAge = opt('--evidence-max-age');
  const packetArg = opt('--packet');
  if (!target || !out) {
    console.error('usage: node assay.mjs repo-census <target-dir> --out <file.json> [--default-branch <name>] [--as-of <YYYY-MM-DD>] [--evidence-max-age <days>] [--packet <dir|manifest.yaml>]');
    process.exit(2);
  }
  try {
    const doc = run({ target, defaultBranch, asOf, evidenceMaxAgeDays: evidenceMaxAge != null ? Number(evidenceMaxAge) : undefined, packet: packetArg });
    writeFileSync(isAbsolute(out) ? out : resolve(out), JSON.stringify(doc, null, 2) + '\n');
    const gaps = doc.checks.filter((c) => c.status === 'gap').map((c) => c.detail?.path && c.detail.path !== '.' ? `${c.name}@${c.detail.path}` : c.name);
    const packetNote = doc.packet ? ` · packet ${doc.packet.auto ? '(auto-detected) ' : ''}at ${doc.packet.path}${doc.packet.pointers_used.length ? ` (pointers followed: ${doc.packet.pointers_used.join(', ')})` : ''}` : '';
    console.error(`${doc.exit === 0 ? '✓' : '✗'} repo-census: ${doc.checks.filter((c) => c.status === 'pass').length} passed · ${gaps.length} gap${gaps.length === 1 ? '' : 's'}${gaps.length ? ` (${gaps.join(', ')})` : ''} → ${out}${packetNote}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ repo-census crashed: ${e.message}`);
    process.exit(2);
  }
}
