#!/usr/bin/env node
// repo-census.mjs — the REPO-CENSUS instrument: decides, from the tree alone, four
// floor rows a run could not decide before except by an LLM-authored census
// (registry/descriptors.yaml d-architecture-page, d-agent-contract, d-runbook,
// d-ci-gate-on-default-branch — integration/scanner-contract.md §3d). Its rows come
// in through tools/ingest.mjs (profile `repo-census`) and land on existing axes via
// integration/adapters/repo-census.yaml.
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
// Fail loud, never empty: `exit` is 1 when any check is `gap`, 0 when every check is
// `pass` or `not-applicable`. A crash of the runner itself exits 2, so ingest.mjs
// (success set [0, 1]) halts on it.
//
// Usage:
//   node tools/repo-census.mjs <target-dir> --out <file.json> [--default-branch <name>]
// Zero dependencies (node: modules only).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute } from 'node:path';
import { isMain } from './doctrine.mjs';

export const VERSION = '0.1.0';
export const CHECK_NAMES = ['architecture-page', 'agent-contract', 'runbook', 'ci-gate'];
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
// the repo's README (mirrors tools/fresh-clone.mjs's findReadme so both instruments
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

// ── architecture-page ────────────────────────────────────────────────────────
const EXTERNAL_RE = /\b(database|queue|api|service|store|bucket|provider)\b/i;
const DIAGRAM_RE = /```\s*mermaid\b|\bdiagram\b/i;
function checkArchitecturePage(dir, loc) {
  const base = loc === '.' ? dir : join(dir, loc);
  const relPath = (p) => (loc === '.' ? p : `${loc}/${p}`);
  const name = 'architecture-page';
  const detail = { path: loc };
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
      evidence: [`${relPath('')}:1`],
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
function checkAgentContract(dir, loc) {
  const base = loc === '.' ? dir : join(dir, loc);
  const relPath = (p) => (loc === '.' ? p : `${loc}/${p}`);
  const name = 'agent-contract';
  const detail = { path: loc };

  let file = ciFindFile(base, ['AGENTS.md']);
  if (!file) file = ciFindFile(base, ['CLAUDE.md']);
  if (!file) {
    return {
      name, status: 'gap', detail,
      evidence: [`${relPath('')}:1`],
      observation: `No AGENTS.md or CLAUDE.md found${loc !== '.' ? ` for ${loc}` : ''}.`,
    };
  }
  const filePath = relPath(file);
  const text = safeRead(join(base, file)) || '';
  const lines = text.split('\n');
  let offense = null;
  for (let i = 0; i < lines.length; i++) {
    if (AGENT_HEADING_RE.test(lines[i]) || DATED_LINE_RE.test(lines[i].trim())) { offense = { line: i + 1, text: lines[i].trim() }; break; }
  }
  if (offense) {
    return {
      name, status: 'gap', detail,
      evidence: [`${filePath}:${offense.line}`],
      observation: `${filePath}:${offense.line} carries a status/history marker ("${offense.text.slice(0, 80)}") — an agent contract must be present-tense; history and status belong in a separate, co-located history file (canon convention).`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: [`${filePath}:1`],
    observation: `${filePath} is present and present-tense: no status/history/changelog/todo/backlog heading and no dated changelog line.`,
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
function checkRunbook(dir) {
  const name = 'runbook';
  const detail = { path: '.' };
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
const GATE_CMD_RE = /\b(?:npm\s+(?:run\s+)?(?:test|lint|typecheck|build)|pnpm\s+(?:run\s+)?(?:test|lint|typecheck|build)|yarn\s+(?:run\s+)?(?:test|lint|typecheck|build)|tsc\b|jest\b|vitest\b|pytest\b|go\s+test|cargo\s+test|make\s+test)\b/i;
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
              const rm = rest.match(/^run:\s*(.+)$/);
              if (rm) { cur.cmd = rm[1].trim(); cur.line = l3.n; }
              if (/^continue-on-error:\s*true\s*$/.test(rest)) { cur.continueOnError = true; cur.coeLine = l3.n; }
            } else if (cur) {
              const rm = l3.trimmed.match(/^run:\s*(.+)$/);
              if (rm) { cur.cmd = rm[1].trim(); cur.line = l3.n; }
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
  for (const s of steps) s.isGateCmd = !!(s.cmd && GATE_CMD_RE.test(s.cmd));
  return steps;
}
export function parseWorkflow(text) {
  const lines = toLines(text);
  return { trigger: parseTrigger(lines), steps: parseSteps(lines) };
}
function resolveDefaultBranch(dir, given) {
  if (given) return given;
  if (existsSync(join(dir, '.git'))) {
    const r = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: dir, encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.trim().match(/([^/]+)$/);
      if (m) return m[1];
    }
  }
  return 'main';
}
function checkCiGate(dir, defaultBranchArg) {
  const name = 'ci-gate';
  const defaultBranch = resolveDefaultBranch(dir, defaultBranchArg);
  const wfDir = join(dir, '.github', 'workflows');
  const files = safeReaddir(wfDir).filter((f) => /\.ya?ml$/i.test(f)).sort();
  const branchNote = 'Branch protection (whether this check is required to merge) is not visible from the tree; this check decides only what the tree shows.';
  const detail = { path: '.', defaultBranch, workflows: [], failOpen: [] };
  if (!files.length) {
    return {
      name, status: 'gap', detail,
      evidence: ['./:1'],
      observation: `No .github/workflows/*.yml|.yaml found; nothing runs the gates on the default branch (${defaultBranch}) or on a pull request. ${branchNote}`,
    };
  }
  let anyGate = false;
  const failOpen = [];
  for (const f of files) {
    const relFile = `.github/workflows/${f}`;
    const text = safeRead(join(wfDir, f)) || '';
    const { trigger, steps } = parseWorkflow(text);
    const onPR = trigger.events.includes('pull_request') || trigger.events.includes('pull_request_target');
    const onDefaultPush = trigger.events.includes('push') && (trigger.pushBranches === null || trigger.pushBranches.includes(defaultBranch));
    const gateSteps = steps.filter((s) => s.isGateCmd);
    const gates = (onPR || onDefaultPush) && gateSteps.length > 0;
    if (gates) anyGate = true;
    for (const s of gateSteps) if (s.continueOnError) failOpen.push({ file: relFile, line: s.coeLine || s.line, cmd: s.cmd });
    detail.workflows.push({ file: relFile, events: trigger.events, pushBranches: trigger.pushBranches, gates, gateCommands: gateSteps.map((s) => s.cmd) });
  }
  detail.failOpen = failOpen;
  if (failOpen.length) {
    return {
      name, status: 'gap', detail,
      evidence: failOpen.map((f) => `${f.file}:${f.line}`),
      observation: `A gate step fails open (\`continue-on-error: true\`): ${failOpen.map((f) => `${f.file}:${f.line} (\`${f.cmd}\`)`).join('; ')}. A gate that can fail open is not a gate. ${branchNote}`,
    };
  }
  if (!anyGate) {
    return {
      name, status: 'gap', detail,
      evidence: detail.workflows.map((w) => `${w.file}:1`),
      observation: `No workflow both triggers on pull_request (or push to the default branch, ${defaultBranch}) and runs a test/lint/typecheck/build step. ${branchNote}`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: detail.workflows.filter((w) => w.gates).map((w) => `${w.file}:1`),
    observation: `At least one workflow gates on pull_request or push to the default branch (${defaultBranch}) and runs a test/lint/typecheck/build step, with no gate step failing open. ${branchNote}`,
  };
}

// ── the run ──────────────────────────────────────────────────────────────────
function gitHead(dir) {
  if (!existsSync(join(dir, '.git'))) return null;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() || null : null;
}
export function run({ target, defaultBranch = null }) {
  const dir = resolve(target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`target is not a directory: ${target}`);
  const mono = detectMonorepo(dir);
  const locations = mono.detected ? ['.', ...mono.locations] : ['.'];
  const checks = [];
  for (const loc of locations) checks.push(checkArchitecturePage(dir, loc));
  for (const loc of locations) checks.push(checkAgentContract(dir, loc));
  checks.push(checkRunbook(dir));
  checks.push(checkCiGate(dir, defaultBranch));
  const exit = checks.some((c) => c.status === 'gap') ? 1 : 0;
  return { tool: 'repo-census', version: VERSION, target: { path: target, head: gitHead(dir) }, monorepo: mono, checks, exit };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const target = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  const out = opt('--out');
  const defaultBranch = opt('--default-branch');
  if (!target || !out) {
    console.error('usage: node tools/repo-census.mjs <target-dir> --out <file.json> [--default-branch <name>]');
    process.exit(2);
  }
  try {
    const doc = run({ target, defaultBranch });
    writeFileSync(isAbsolute(out) ? out : resolve(out), JSON.stringify(doc, null, 2) + '\n');
    const gaps = doc.checks.filter((c) => c.status === 'gap').map((c) => c.detail?.path && c.detail.path !== '.' ? `${c.name}@${c.detail.path}` : c.name);
    console.error(`${doc.exit === 0 ? '✓' : '✗'} repo-census: ${doc.checks.filter((c) => c.status === 'pass').length} passed · ${gaps.length} gap${gaps.length === 1 ? '' : 's'}${gaps.length ? ` (${gaps.join(', ')})` : ''} → ${out}`);
    process.exit(doc.exit);
  } catch (e) {
    console.error(`✗ repo-census crashed: ${e.message}`);
    process.exit(2);
  }
}
