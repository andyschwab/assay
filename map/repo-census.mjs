#!/usr/bin/env node
// repo-census.mjs — the REPO-CENSUS instrument: decides, from the tree alone, four
// floor rows a run could not decide before except by an LLM-authored census
// (yardstick/requirements.yaml d-architecture-page, d-agent-contract, d-runbook,
// d-ci-gate-on-default-branch — map/scanners/CONTRACT.md §3d), plus five
// owner-evidence checks over dated transcripts the owner commits for what a
// repository cannot show by itself (d-backup-restore-exercised,
// d-rollback-exercised, d-deploy-one-command, d-smoke-on-deployed,
// d-health-reported; format at owner/evidence/README.md), plus three operability
// checks over the application's signal declarations, health report and routing
// policy (d-expectations-declared, d-health-reported, d-routing-proportionate, #311),
// read through the format reader the adapter names. Its rows come in through
// map/ingest.mjs (profile `repo-census`) and land on existing axes via
// map/scanners/adapters/repo-census.yaml.
//
// Four checks, each read-only against the checkout, zero network:
//   - architecture-page: ARCHITECTURE.md / docs/ARCHITECTURE.md / docs/architecture.md /
//     docs/architecture/*.md (case-insensitive), or a README "Architecture" section.
//     `pass` only when it also NAMES an external service or data store (a heading or
//     line mentioning database/queue/API/service/store/bucket/provider, or a
//     mermaid/diagram block) — presence alone is not enough. It runs at every location
//     map/projects.mjs finds (#246): the root, each nested project, and each project's
//     workspaces, one check per location; a location with no page of its own passes when
//     its parent's passing page names it (path or scoped package name), a workspace with
//     none passes by its parent's passing page unless it ships a deploy artifact of its own
//     (#306), and a root with none passes when every nested project carries its own
//     (map/scanners/CONTRACT.md §3d).
//   - agent-contract: AGENTS.md or CLAUDE.md (every location, the same rule; a parent's
//     contract is the file and the files its `@path` lines import, #249).
//     `pass` only when it is present-TENSE: no heading matching
//     /^#+\s*(status|history|changelog|todo|backlog)\b/i and no dated changelog line
//     (a line starting with a date like 2026-09-01, or a `- 2026-…` bullet).
//   - runbook: RUNBOOK.md or RUNBOOKS.md at the root or in docs/, docs/runbook*.md, a
//     runbook(s)/ or docs/runbook(s)/ directory (every .md in it, read together), or a
//     README/doc section headed "Runbook" or "Operations"; at the root and at each nested
//     project, never a workspace, with the same parent and project cover. `pass` only when it carries a heading or
//     paragraph for EACH of restart, roll back, rotate (a key/secret/credential), and
//     restore (a backup). Presence of the words is what this decides — whether a
//     procedure was ever actually run is a separate, sidecar claim, said in the
//     observation every time.
//   - ci-gate: every `.github/workflows/*.yml|.yaml`, read with a minimal line-based
//     reader (zero deps — no YAML library; handles the common shapes: `on: [push,
//     pull_request]`, block-form `on: / push: / branches: [main]`, `pull_request:`).
//     A workflow GATES when it triggers on pull_request or merge_group (or push to the
//     default branch) and runs a step whose `run:` invokes a test/check/lint/typecheck/
//     build command, directly or through a package script the root package.json
//     declares (#306). `gap` when no gate workflow exists, or when a gate step FAILS OPEN
//     (`continue-on-error: true` on the job or the step) — cited by file:line.
//     Branch protection (whether the check is *required*) is not visible from the
//     tree; the observation says so every time — this check decides only what the
//     tree shows.
//
// Plus three operability checks (root only, #311; map/scanners/CONTRACT.md §3d). The
// census finds the scheduled jobs itself (a CI workflow's `schedule:` cron, one job per
// workflow) and takes the rest from the format reader its adapter names
// (adapters/repo-census.yaml `signals.reader`, the replaceable part: the jobs the
// application schedules in its own format, its signal declarations, its health report's
// schema and its routing policy). It names no format of its own:
//   - expectation-declared: one check per scheduled job and per declared signal. A job no
//     declaration watches is a gap citing the job; a declaration missing its expectation,
//     evidence or runbook anchor is a gap citing the declaration. With no scheduled job
//     and no declaration, one not-applicable check (the effect half of the requirement
//     is the yardstick's, over the run's triaged effects).
//   - health-report: the report's schema states the state (last success, last count,
//     since when) of every declared signal.
//   - routing-policy: the policy is data and routes every declared signal at record,
//     digest or notify, to a destination role, with a budget; a policy that notifies on
//     every signal is a gap (the flood that gets muted).
// health-report and routing-policy read not-applicable only when the tree has no
// scheduled job, declares no signal and shows no deployment signal.
//
// Plus five evidence checks (root only, one per descriptor id, named
// `evidence-<descriptor-id>`): each reads ops/evidence/<id>.md (else
// docs/evidence/<id>.md, first found wins) — YAML frontmatter (produced_by,
// descriptor, date, by, commit, result, plus keys named per row) over a body
// that must carry at least one fenced code block and at least 5 non-empty
// lines. `produced_by: ci | person` says who produced the transcript from the
// procedure's real output (never an agent — owner/evidence/README.md);
// `ci` additionally requires `run` (the CI run's id or URL). `pass` only when
// the file is present, the frontmatter is complete and well-formed, `result:
// pass`, its `commit` resolves in the checkout's history, and `date` is not in
// the future and no older than the freshness window (`--evidence-max-age`,
// default 90 days, measured from `--as-of`, default today UTC). A commit
// genuinely absent from a real, full history is a `gap`, naming it; a checkout
// that cannot say either way (no `.git`, or too shallow to know) reads
// `not-measured`, never `pass` or `gap` — the check refuses to guess. The
// document never reads the body past line counts — a transcript can hold
// operational detail. Every observation, pass, gap or not-measured, says this
// check verifies the transcript's shape, freshness and commit, never the truth
// of what it describes. Full format: owner/evidence/README.md. The five apply only
// where the tree shows a deployment: with no deployment signal anywhere in the
// tree (findDeploymentSignals below; the list is map/scanners/CONTRACT.md §3d's),
// each reads `not-applicable`, citing the root, never `pass`; the document's
// `deployment` field records every signal found.
//
// Fail loud, never empty: `exit` is 1 when any check is `gap`, 0 when every check is
// `pass`, `not-applicable`, or `not-measured` (the checkout could not confirm a
// commit either way — never itself a failure). A crash of the runner itself
// exits 2, so ingest.mjs (success set [0, 1]) halts on it.
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
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, isAbsolute, relative, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { loadPacket, validatePacket, requirementIdsOnDisk } from '../yardstick/packet.mjs';
import { locateProjects, workspacePath } from './projects.mjs';

export const VERSION = '0.5.0';
export const EVIDENCE_IDS = [
  'd-backup-restore-exercised', 'd-rollback-exercised', 'd-deploy-one-command',
  'd-smoke-on-deployed', 'd-health-reported',
];
const SIGNAL_CHECKS = ['expectation-declared', 'health-report', 'routing-policy'];
export const CHECK_NAMES = ['architecture-page', 'agent-contract', 'runbook', 'ci-gate', ...SIGNAL_CHECKS, ...EVIDENCE_IDS.map((id) => `evidence-${id}`)];
// the checks an earlier census wrote whose requirements the yardstick retired (#311,
// yardstick/requirements.yaml retired:): a raw report archived in a stored run still ingests
export const RETIRED_CHECK_NAMES = ['evidence-d-monitoring-with-alert', 'evidence-d-cost-alerts'];
export const CHECK_STATUS = ['pass', 'gap', 'not-applicable', 'not-measured'];

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
function findPacketSource(dir, packetArg) {
  if (packetArg) return { source: packetArg, auto: false };
  if (existsSync(join(dir, 'packet', 'manifest.yaml'))) return { source: join(dir, 'packet'), auto: true };
  return null;
}
function loadValidatedPacket(source) {
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
function pointerForLocation(value, locations, loc) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const idx = locations.indexOf(loc);
    return idx > -1 && idx < value.length ? value[idx] : null;
  }
  return loc === '.' ? value : null;
}
const pointerNote = (used) => (used ? " (per the packet's pointer)" : '');

// ── root credit (issue #27) ──────────────────────────────────────────────────
// A location with no page of its own is covered when its parent's document, which
// itself passes, names it: by its path from the root (`apps/api`), by its path from the
// parent's project (`apps/api` inside `templates/x`, #246), or by its scoped package name
// (`@org/ui`). A bare package name is never matched — `lib` or `web` is a word in
// ordinary prose. When the parent's page is a README section (`sectionRe`, and no
// packet pointer named the file), only that section is the page. Returns the
// first line that names it, or null. `names` are the paths the location goes by
// (from the root first); the parent is the root unless the location sits in a nested project.
function rootMention(dir, rootCheck, loc, sectionRe = null, names = [loc], parentBase = '.', followImports = false) {
  if (!rootCheck || rootCheck.status !== 'pass') return null;
  // a parent itself credited by its own parent's contract hands that contract down (an imported
  // file is where the name was found, not the contract)
  const file = CONTRACT_OF.get(rootCheck) || String(rootCheck.evidence?.[0] || '').replace(/:\d+$/, '');
  let text = file && safeRead(join(dir, file));
  if (!text) return null;
  let offset = 0;
  const parentReadme = (() => { const r = findReadme(parentBase === '.' ? dir : join(dir, parentBase)); return r && (parentBase === '.' ? r : `${parentBase}/${r}`); })();
  if (sectionRe && !rootCheck.detail?.pointer && file === parentReadme) {
    const sec = findMdSection(text, sectionRe);
    if (!sec) return null;
    text = sec.text; offset = sec.startLine - 1;
  }
  const pkgName = (() => { try { return JSON.parse(readFileSync(join(dir, loc, 'package.json'), 'utf8')).name; } catch { return null; } })();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = [...new Set(names), ...(typeof pkgName === 'string' && /^@[^/\s]+\/[^/\s]+$/.test(pkgName) ? [pkgName] : [])];
  const re = new RegExp(`(?:^|[^\\w@./-])(?:\\./)?(?:${tokens.map(esc).join('|')})(?![\\w-]|\\.\\w)`);
  // an agent contract is the file and everything its `@path` lines import (#249): what the agent reads
  const docs = followImports ? contractWithImports(dir, file, text) : [{ file, text, offset }];
  for (const d of docs) {
    const lines = d.text.split('\n');
    const i = lines.findIndex((l) => re.test(l));
    if (i > -1) return { file: d.file, line: (d.offset || 0) + i + 1, contract: file };
  }
  return null;
}
// the contract a credited location was credited from, for the locations it credits in turn
const CONTRACT_OF = new WeakMap();
// ── the parent's cover of a workspace (#306) ─────────────────────────────────
// A workspace with no document of its own is covered by its project's passing document even
// where that document does not name it, unless the workspace is a separately deployed unit: it
// carries a deploy artifact of its own, a container file, a hosting config or an
// infrastructure-as-code or service manifest (the census's deployment signals, of the kinds
// that ship a unit on their own). A server entry point alone does not: it can run inside the
// project's own deploy. A nested project (its own lockfile) is never covered this way; only
// its naming in the parent's document covers it. Returns the credit, citing the parent's own
// evidence line, or null.
const DEPLOYED_APART = new Set(['container', 'hosting', 'infrastructure']);
function deployedApart(loc, deployment) {
  return (deployment?.signals || []).filter((s) => DEPLOYED_APART.has(s.kind) && String(s.path).startsWith(`${loc}/`)).map((s) => s.path);
}
function treeCover(parentCheck, l, deployment) {
  if (l.project || !parentCheck || parentCheck.status !== 'pass' || parentCheck.detail?.delegatedTo) return null;
  if (deployedApart(l.path, deployment).length) return null;
  const [file, line] = String(parentCheck.evidence?.[0] || '').split(/:(?=\d+$)/);
  if (!file) return null;
  return { file, line: Number(line) || 1, contract: CONTRACT_OF.get(parentCheck) || file, tree: true };
}
// ── an agent contract's imports (#249) ───────────────────────────────────────
// Claude Code reads a CLAUDE.md (or AGENTS.md) together with every file it imports with an
// `@path` token: the path resolves from the importing file, imports nest, and the chain stops
// at IMPORT_MAX_DEPTH hops. A token inside a fenced block or an inline code span is not an import.
// Read here: the file first, then its imports breadth-first, each file once (a cycle ends), a
// target outside the tree or missing skipped, never an error.
const IMPORT_MAX_DEPTH = 5;
const IMPORT_RE = /(?:^|\s)@((?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)*)/g;
function importsOf(text) {
  const out = [];
  let fence = null;   // the open fence's character and length: only a like fence at least as long closes it
  let inList = false;   // an indented line under a list item is the item's text, not an indented code block
  for (const line of text.split('\n')) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f[0].length).trim()) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    const indented = /^(?: {4}|\t)/.test(line);
    if (/^ {0,3}(?:[-*+]|\d+[.)])\s/.test(line)) inList = true;
    else if (line.trim() && !indented) inList = false;
    if (indented && !inList) continue;   // an indented code block
    const bare = line.replace(/(`+)[^`]*?\1/g, '');
    for (const m of bare.matchAll(IMPORT_RE)) out.push(m[1].replace(/\.+$/, ''));
  }
  return out;
}
function contractWithImports(dir, file, text) {
  const root = resolve(dir);
  let realRoot = root; try { realRoot = realpathSync(root); } catch { /* unreadable root: lexical */ }
  const docs = [{ file, text, offset: 0 }];
  const seen = new Set([file]);
  let level = [{ file, text }];
  for (let depth = 1; depth <= IMPORT_MAX_DEPTH && level.length; depth++) {
    const next = [];
    for (const d of level) {
      const from = d.file.includes('/') ? d.file.slice(0, d.file.lastIndexOf('/')) : '.';
      for (const target of importsOf(d.text)) {
        const abs = resolve(root, from, target);
        const rel = relative(root, abs).split(sep).join('/');
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || seen.has(rel)) continue;
        // where the path really lands: a symlink inside the tree may point outside it
        let real = null; try { real = relative(realRoot, realpathSync(abs)); } catch { /* missing: skipped below */ }
        if (real === null || real.startsWith('..') || isAbsolute(real)) continue;
        seen.add(rel);
        const t = statOk(abs, (st) => st.isFile()) ? safeRead(abs) : null;
        if (t === null) continue;
        docs.push({ file: rel, text: t, offset: 0 });
        next.push({ file: rel, text: t });
      }
    }
    level = next;
  }
  return docs;
}
// a check that found no document at all (as against one that found a document that falls
// short): only such a root can be covered by its projects (delegatedPass)
const ABSENT = new WeakSet();
const absent = (c) => { ABSENT.add(c); return c; };
// ── a root covered by its projects (#246) ───────────────────────────────────
// A root that holds no document of its own, over a tree whose nested projects each carry
// one that passes on its own (never by credit), is a catalog: the root delegates to its
// projects, and each project's document is the evidence.
const delegatedPass = (name, what, projectChecks) => ({
  name, status: 'pass', detail: { path: '.', delegatedTo: projectChecks.map((c) => c.detail.path) },
  evidence: projectChecks.map((c) => c.evidence[0]),
  observation: `The root has no ${what} of its own; each of its nested projects carries one that passes (${projectChecks.map((c) => String(c.evidence[0]).replace(/:\d+$/, '')).join(', ')}), so the root delegates to its projects.`,
});
const creditedPass = (name, detail, loc, what, credit) => {
  const who = !credit.parent || credit.parent === '.' ? 'the root' : `its project ${credit.parent}`;
  return {
    name, status: 'pass', detail: { ...detail, coveredBy: credit.file, ...(credit.tree ? { cover: 'tree' } : {}) },
    evidence: [`${credit.file}:${credit.line}`],
    observation: credit.tree
      ? `${loc} has no ${what} of its own and is not deployed apart from ${who} (no container file, hosting config or infrastructure manifest of its own); ${who}'s ${credit.file}, which passes, covers the tree it sits in.`
      : credit.contract && credit.contract !== credit.file
      ? `${loc} has no ${what} of its own; ${who}'s ${credit.contract}, which passes, imports ${credit.file}, which names it at line ${credit.line}, so ${who} covers it.`
      : `${loc} has no ${what} of its own; ${who}'s ${credit.file} names it at line ${credit.line} and passes, so ${who} covers it.`,
  };
};

// ── architecture-page ────────────────────────────────────────────────────────
const EXTERNAL_RE = /\b(database|queue|api|service|store|bucket|provider)\b/i;
const DIAGRAM_RE = /```\s*mermaid\b|\bdiagram\b/i;
function checkArchitecturePage(dir, loc, pointerPath, credit = null) {
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
    if (credit) return creditedPass(name, detail, loc, 'architecture page', credit);
    return absent({
      name, status: 'gap', detail,
      evidence: [`${relPath('') || './'}:1`],   // the root cites ./ (never an empty path)
      observation: `No architecture page found${loc !== '.' ? ` for ${loc}` : ''} (checked ARCHITECTURE.md, docs/ARCHITECTURE.md, docs/architecture.md, docs/architecture/*.md, and a README "Architecture" section) — nothing shows the parts, the data flow, and the external services.`,
    });
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
function checkAgentContract(dir, loc, pointerPath, credit = null) {
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
      if (credit) return creditedPass(name, detail, loc, 'agent contract', credit);
      return absent({
        name, status: 'gap', detail,
        evidence: [`${relPath('') || './'}:1`],   // the root cites ./ (never an empty path)
        observation: `No AGENTS.md or CLAUDE.md found${loc !== '.' ? ` for ${loc}` : ''}.`,
      });
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
function checkRunbook(root, pointerPath, loc = '.', credit = null) {
  const name = 'runbook';
  const detail = { path: loc };
  const dir = loc === '.' ? root : join(root, loc);
  const relPath = (p) => (loc === '.' ? p : `${loc}/${p}`);
  if (pointerPath) {
    const dir = root;
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
  let filePath = null, content = null, lineOffset = 1, evidence = /** @type {string[] | null} */ (null);
  // a runbook(s)/ directory under `base` ('' or 'docs/'): every .md in it, read together,
  // named as the directory and cited file by file
  const readRunbookDir = (base) => {
    const d = ['runbooks', 'runbook'].map((n) => ciFindDir(join(dir, base), n)).find(Boolean);
    if (!d) return;
    const files = safeReaddir(join(dir, base, d)).filter((e) => /\.md$/i.test(e) && statOk(join(dir, base, d, e), (st) => st.isFile())).sort();
    const texts = files.map((f) => safeRead(join(dir, base, d, f)) || '');
    if (!texts.some(Boolean)) return;
    filePath = `${base}${d}/`; content = texts.join('\n'); evidence = files.map((f) => `${base}${d}/${f}:1`);
  };

  const top = ciFindFile(dir, ['RUNBOOK.md', 'RUNBOOKS.md']);
  if (top) { filePath = top; content = safeRead(join(dir, top)); }
  if (!content) readRunbookDir('');
  if (!content) {
    const docsFile = ciFindFile(join(dir, 'docs'), ['RUNBOOK.md', 'RUNBOOKS.md']);
    if (docsFile) { filePath = `docs/${docsFile}`; content = safeRead(join(dir, 'docs', docsFile)); }
  }
  if (!content) {
    const f = safeReaddir(join(dir, 'docs')).find((e) => /^runbook.*\.md$/i.test(e) && statOk(join(dir, 'docs', e), (st) => st.isFile()));
    if (f) { filePath = `docs/${f}`; content = safeRead(join(dir, 'docs', f)); }
  }
  if (!content) readRunbookDir('docs/');
  if (!content) {
    const candidates = [findReadme(dir), ...safeReaddir(join(dir, 'docs')).filter((f) => /\.md$/i.test(f)).map((f) => `docs/${f}`)].filter(Boolean);
    for (const c of candidates) {
      const text = safeRead(join(dir, c));
      const sec = text && findMdSection(text, /^(runbook|operations)\b/i);
      if (sec) { filePath = c; content = sec.text; lineOffset = sec.startLine; break; }
    }
  }

  if (!content) {
    if (credit) return creditedPass(name, detail, loc, 'runbook', credit);
    return absent({
      name, status: 'gap', detail,
      evidence: [`${relPath('') || './'}:1`],   // the root cites ./ (never an empty path)
      observation: `No runbook found${loc !== '.' ? ` for ${loc}` : ''} (checked RUNBOOK.md and RUNBOOKS.md at the root and in docs/, docs/runbook*.md, a runbook(s)/ or docs/runbook(s)/ directory, and a README/doc "Runbook" or "Operations" section). Presence of the words is what this decides; whether a procedure was ever run is a separate, sidecar claim.`,
    });
  }
  const missing = PROCEDURES.filter(([, verbRe, nounRe]) => !hasProcedure(content, verbRe, nounRe)).map(([label]) => label);
  filePath = relPath(filePath);
  evidence = evidence ? evidence.map(relPath) : [`${filePath}:${lineOffset}`];
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
// A step that runs a package script is read through the script (#306): `pnpm check`,
// `pnpm -r build`, `npm run verify --if-present`, `pnpm --filter web test`, `pnpm turbo run
// build`. The script is a gate when its name is a check's (test, check, lint, typecheck,
// build, each with an optional `:suffix`), or when the repository's package.json declares it
// and its body is a gate command, read the same way (a script calling a script, a few deep).
// The package manager's own flags before the script are skipped, the value of one that takes
// a value with it.
const PM_RE = /(?:^|[\s;&|(])(?:npx\s+|pnpm\s+exec\s+)?(npm|pnpm|yarn|bun|turbo)\s+([^;&|\n]*)/g;
const PM_VALUE_FLAGS = new Set(['--filter', '-F', '--workspace', '--dir', '-C', '--prefix', '--cwd', '--scope', '--concurrency']);
const PM_NOT_SCRIPT = new Set(['install', 'i', 'ci', 'add', 'exec', 'dlx', 'x', 'npx', 'create', 'init', 'publish', 'audit', 'outdated', 'why', 'list', 'ls', 'config', 'set', 'cache', 'store', 'link', 'version', 'pack', 'prune', 'dedupe', 'rebuild', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'start', 'dev', 'serve', 'deploy']);
const GATE_SCRIPT_RE = /^(?:test|check|lint|typecheck|type-check|build)(?::[\w:.-]+)?$/i;
function scriptsRun(cmd) {
  const out = [];
  for (const m of String(cmd || '').matchAll(PM_RE)) {
    const toks = m[2].trim().split(/\s+/).filter(Boolean);
    let k = 0;
    while (k < toks.length) {
      const t = toks[k];
      if (t.startsWith('-')) { k += PM_VALUE_FLAGS.has(t) && !t.includes('=') ? 2 : 1; continue; }
      if (t === 'run' || t === 'run-script' || t === 'run-many' || (m[1] === 'yarn' && t === 'workspaces')) { k++; continue; }
      if (m[1] === 'yarn' && t === 'foreach') { k++; continue; }
      break;
    }
    const name = toks[k];
    if (!name || PM_NOT_SCRIPT.has(name)) continue;
    if (name === 'turbo' || name === 'nx') { out.push(...scriptsRun(`turbo ${toks.slice(k + 1).join(' ')}`)); continue; }
    out.push(name.replace(/^['"]|['"]$/g, ''));
  }
  return out;
}
function isGateCommand(cmd, scripts = {}, depth = 0) {
  if (!cmd) return false;
  if (GATE_CMD_RE.test(cmd)) return true;
  return scriptsRun(cmd).some((name) => GATE_SCRIPT_RE.test(name) ||
    (depth < 4 && typeof scripts[name] === 'string' && isGateCommand(scripts[name], scripts, depth + 1)));
}
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
function parseSteps(lines, scripts = {}) {
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
      const job = l.trimmed.replace(/:\s*$/, '');
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
            const key = rest.match(/^(id|if):\s*(.*?)\s*$/);
            if (key) cur[key[1] === 'id' ? 'id' : 'ifCond'] = key[2].replace(/^['"]|['"]$/g, '');
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
              cur = { line: l3.n, cmd: null, continueOnError: jobContinueOnError, coeLine: null, job };
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
    s.isGateCmd = isGateCommand(s.cmd, scripts);
    // a gate step can also fail open through its own shell script — never
    // overrides an already-found `continue-on-error: true` (that citation wins)
    if (!s.continueOnError) {
      const candidates = s.scriptLines && s.scriptLines.length ? s.scriptLines : (s.cmd ? [{ n: s.line, text: s.cmd }] : []);
      for (let ci = 0; ci < candidates.length; ci++) {
        const c = candidates[ci];
        const shape = shellFailOpenLine(c.text);
        if (!shape) continue;
        // a `set +e` that reads the exit status and acts on it is not fail-open (#166)
        const held = shape === 'set +e' ? setPlusEHeld(candidates.slice(ci + 1), s, steps) : { held: false };
        if (held.held === true) break;
        if (held.held === 'unknown') { s.failOpenUnknown = { line: c.n, text: c.text, reason: held.reason }; break; }
        s.continueOnError = true; s.coeLine = c.n; s.failOpenShell = shape; s.failOpenText = c.text; break;
      }
    }
  }
  return steps;
}
// After a `set +e`, the script still fails closed when it reads the gated command's
// status (`code=$?`, `if [ $? …`, `|| code=$?`, `exit $?`) and either exits non-zero on
// it, or hands it on through $GITHUB_OUTPUT to a later step of the same job that exits
// non-zero under an `if:` on that output. A status read whose hand-on cannot be followed
// (another job, a file, no step id) is `unknown`: never pass and never fail-open.
const STATUS_READ_RE = /\$\?/;
const EXITS_NONZERO_RE = /\bexit\s+(?:[1-9]\d*|"?\$\{?(?:\?|[A-Za-z_]\w*)\}?"?)(?:\s|;|$)/;
const GH_OUTPUT_RE = /\b([A-Za-z_][\w-]*)=[^>]*>>\s*"?\$\{?GITHUB_OUTPUT\}?"?/;
function setPlusEHeld(after, step, steps) {
  const readAt = after.findIndex((l) => STATUS_READ_RE.test(l.text));
  if (readAt === -1) return { held: false };
  const rest = after.slice(readAt);
  if (rest.some((l) => EXITS_NONZERO_RE.test(l.text))) return { held: true };
  const keys = [...new Set(rest.map((l) => (l.text.match(GH_OUTPUT_RE) || [])[1]).filter(Boolean))];
  if (!keys.length) return { held: 'unknown', reason: 'the script reads the exit status but neither exits non-zero on it nor hands it on through $GITHUB_OUTPUT' };
  if (!step.id) return { held: 'unknown', reason: `the status is handed on through $GITHUB_OUTPUT (${keys.join(', ')}), but the step has no id: for a later step to read it by` };
  const later = steps.slice(steps.indexOf(step) + 1).filter((t) => t.job === step.job);
  const acts = later.find((t) => t.ifCond && keys.some((k) => t.ifCond.includes(`steps.${step.id}.outputs.${k}`)) &&
    (t.scriptLines && t.scriptLines.length ? t.scriptLines.map((x) => x.text) : [t.cmd || '']).some((x) => EXITS_NONZERO_RE.test(x)));
  if (acts) return { held: true };
  return { held: 'unknown', reason: `the status is handed on as steps.${step.id}.outputs.${keys.join('/')}, but no later step of job ${step.job} exits non-zero under an if: on it` };
}
// scripts: the repository's declared package scripts (its root package.json), which a step
// that runs one is read through
export function parseWorkflow(text, scripts = {}) {
  const lines = toLines(text);
  return { trigger: parseTrigger(lines), steps: parseSteps(lines, scripts) };
}
// the root package.json's scripts, or none
function declaredScripts(dir) {
  try { const s = JSON.parse(safeRead(join(dir, 'package.json')) || '{}').scripts; return s && typeof s === 'object' ? s : {}; } catch { return {}; }
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
  const detail = { path: '.', defaultBranch, workflows: [], failOpen: [], failOpenUnknown: [] };
  if (workflowsPointer) detail.pointer = 'workflows';
  if (!files.length) {
    return {
      name, status: 'gap', detail,
      evidence: [existsSync(wfDir) ? `${wfRelBase}/:1` : './:1'],   // never cite a path the tree does not have
      observation: `No ${wfRelBase}/*.yml|.yaml found${pointerNote(!!workflowsPointer)}; nothing runs the gates on the default branch (${defaultBranch}) or on a pull request. ${branchNote}`,
    };
  }
  let anyGate = false;
  const failOpen = [], unknown = [];
  const scripts = declaredScripts(dir);
  for (const f of files) {
    const relFile = `${wfRelBase}/${f}`;
    const text = safeRead(join(wfDir, f)) || '';
    const { trigger, steps } = parseWorkflow(text, scripts);
    // a change on its way to the default branch: a pull request, or a merge queue's group (#306)
    const onPR = trigger.events.includes('pull_request') || trigger.events.includes('pull_request_target') || trigger.events.includes('merge_group');
    const onDefaultPush = trigger.events.includes('push') && (trigger.pushBranches === null || trigger.pushBranches.includes(defaultBranch));
    const gateSteps = steps.filter((s) => s.isGateCmd);
    const gates = (onPR || onDefaultPush) && gateSteps.length > 0;
    if (gates) anyGate = true;
    for (const s of gateSteps) if (s.continueOnError) failOpen.push({ file: relFile, line: s.coeLine || s.line, cmd: s.failOpenText || s.cmd, shape: s.failOpenShell ? 'shell' : 'continue-on-error' });
    if (gates) for (const s of gateSteps) if (!s.continueOnError && s.failOpenUnknown) unknown.push({ file: relFile, line: s.failOpenUnknown.line, cmd: s.failOpenUnknown.text, fail_open: 'unknown', reason: s.failOpenUnknown.reason });
    detail.workflows.push({ file: relFile, events: trigger.events, pushBranches: trigger.pushBranches, gates, gateCommands: gateSteps.map((s) => s.cmd) });
  }
  detail.failOpen = failOpen;
  detail.failOpenUnknown = unknown;
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
      observation: `No workflow both triggers on pull_request or merge_group (or push to the default branch, ${defaultBranch}${pointerNote(!!pointerBranch)}) and runs a test/check/lint/typecheck/build step, directly or through a script the repository declares${pointerNote(!!workflowsPointer)}. ${branchNote}`,
    };
  }
  // a `set +e` whose status read the census cannot follow to a non-zero exit (#166):
  // never pass, never fail-open
  if (unknown.length) {
    return {
      name, status: 'not-measured', detail,
      evidence: unknown.map((u) => `${u.file}:${u.line}`),
      observation: `A gate step disables errexit (\`set +e\`) and reads the exit status, but the census cannot tell whether a failure still fails the run: ${unknown.map((u) => `${u.file}:${u.line} (${u.reason})`).join('; ')}. Not measured, never pass. ${branchNote}`,
    };
  }
  return {
    name, status: 'pass', detail,
    evidence: detail.workflows.filter((w) => w.gates).map((w) => `${w.file}:1`),
    observation: `At least one workflow${pointerNote(!!workflowsPointer)} gates on pull_request, merge_group or push to the default branch (${defaultBranch}${pointerNote(!!pointerBranch)}) and runs a test/check/lint/typecheck/build step, directly or through a script the repository declares, with no gate step failing open. ${branchNote}`,
  };
}

// ── evidence: owner-attested transcripts ──
// Five floor rows describe things a repository cannot show by itself — a backup
// was restored, a rollback ran, a deploy came up as the committed sha, a smoke
// check hit the deployed app, the live health report was read. The owner commits a dated transcript per row
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
  'd-health-reported': {
    keys: ['report', 'signals'],
    label: 'the live health report was read and stated each signal it carries',
  },
};
const EVIDENCE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVIDENCE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVIDENCE_COMMIT_RE = /^[0-9a-f]{7,40}$/i;
const EVIDENCE_SIGNAL_STATE_RE = /^[^:]+:.+$/; // "<signal>: <state>"
const EVIDENCE_PRODUCED_BY = ['ci', 'person'];

// Does `sha` resolve in this checkout's history? `{ state: 'found' | 'missing' |
// 'unknown', reason }` — 'unknown' (never a gap) when there is no git history to
// check against at all, or the checkout is too shallow to say either way (a
// commit "not found" in a shallow clone may simply be older than the fetch
// depth, not absent from the real repository).
function checkCommitInHistory(dir, sha) {
  if (!existsSync(join(dir, '.git'))) return { state: 'unknown', reason: 'this checkout carries no .git — there is no history here to verify a commit against' };
  const found = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: dir, encoding: 'utf8' });
  if (found.status === 0) return { state: 'found' };
  const shallow = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: dir, encoding: 'utf8' });
  if (shallow.status === 0 && String(shallow.stdout || '').trim() === 'true') {
    return { state: 'unknown', reason: 'this is a shallow checkout — it cannot confirm a commit is absent from history, only that it is not present within the fetched depth' };
  }
  return { state: 'missing' };
}

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
    // the transcript is absent: nothing in the tree was observed wrong, the owner's proof was not
    // found (ingest records it as evidence_absent, which the fix sequence ranks after observed gaps)
    detail.absent = true;
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
  // produced_by says who produced this transcript from the procedure's real output —
  // never an agent (owner/evidence/README.md): ci additionally requires run (the CI
  // run's id or URL); person's requirement is the by field already checked above.
  if (!EVIDENCE_PRODUCED_BY.includes(fm.produced_by)) problems.push(`produced_by "${fm.produced_by ?? ''}" is not ci|person`);
  else if (fm.produced_by === 'ci' && !(typeof fm.run === 'string' && fm.run.trim())) problems.push('produced_by: ci requires run (the CI run\'s id or URL)');
  const commitValid = typeof fm.commit === 'string' && EVIDENCE_COMMIT_RE.test(fm.commit);
  if (!commitValid) problems.push(`commit "${fm.commit ?? ''}" is not 7-40 hex characters`);
  if (fm.result !== 'pass' && fm.result !== 'fail') problems.push(`result "${fm.result ?? ''}" is not pass|fail`);
  else if (fm.result === 'fail') problems.push('result: fail');
  const missingKeys = rowSpec.keys.filter((k) => fm[k] === undefined || fm[k] === null || fm[k] === '');
  if (missingKeys.length) problems.push(`missing key(s): ${missingKeys.join(', ')}`);
  if (id === 'd-deploy-one-command' && !missingKeys.includes('deployed_sha') && !missingKeys.includes('commit') && typeof fm.commit === 'string' && fm.deployed_sha !== fm.commit) {
    problems.push(`deployed_sha "${fm.deployed_sha}" does not match commit "${fm.commit}"`);
  }
  if (id === 'd-health-reported' && !missingKeys.includes('signals')) {
    if (!Array.isArray(fm.signals) || !fm.signals.length) problems.push('signals must be a non-empty list');
    else {
      const bad = fm.signals.filter((a) => typeof a !== 'string' || !EVIDENCE_SIGNAL_STATE_RE.test(a));
      if (bad.length) problems.push(`signals entries must name a signal and the state the live report gave it (e.g. "nightly-sync-ran: held, last success 2026-11-12T03:04Z, 812 rows"): ${bad.map((b) => JSON.stringify(b)).join(', ')}`);
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
  // the commit gate: checked last, only once everything else about the transcript
  // is otherwise in order — a shape problem is reported before an unresolved commit.
  // A commit genuinely not in history is a gap (the transcript names a claim the
  // checkout cannot back); a checkout that cannot say either way (no .git, or too
  // shallow) reads not-measured, never pass — the whole point of this row.
  let commitState = null;
  if (commitValid && !problems.length) {
    commitState = checkCommitInHistory(dir, fm.commit);
    if (commitState.state === 'unknown') {
      detail.commitVerification = commitState;
      return {
        name, status: 'not-measured', detail,
        evidence: [`${found.relPath}:1`],
        observation: `${found.relPath}${pointerNote(!!evidencePointer)} is otherwise complete, but ${commitState.reason} — commit ${fm.commit} could not be confirmed in or out of this checkout's history.`,
      };
    }
    if (commitState.state === 'missing') {
      problems.push(`the commit this transcript names (${fm.commit}) is not in the repository's history`);
    }
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

// ── the deployment signal (the five evidence checks' applicability) ─────────
// The five owner-evidence checks ask for proof about a DEPLOYED application: a
// backup restored, a deploy, a rollback, a smoke check, the live health report.
// A tree with nothing deployed (a library, a command-line tool) has none of these
// to prove, so each check reads `not-applicable` — never `pass` — when the walk
// below finds no deployment signal ANYWHERE in the tree (the database-signal
// shape: a root-only read once filed a false fact over a monorepo). Conservative,
// any doubt keeps the checks measured: one signal of any kind is enough, a walk
// cut short counts as a signal, and the signal list is the contract's
// (map/scanners/CONTRACT.md §3d), never widened silently.
const DEPLOY_WALK_SKIP = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__']);
const DEPLOY_WALK_LIMIT = 20000;   // entries; a tree past this is not ruled out — it reads as a signal
const CONTAINER_RE = /^(dockerfile(\..+)?|.+\.dockerfile|containerfile|(docker-)?compose(\..+)?\.ya?ml)$/i;
const HOSTING_FILES = new Set(['vercel.json', 'now.json', 'netlify.toml', 'fly.toml', 'render.yaml', 'railway.json', 'railway.toml',
  'procfile', 'app.yaml', 'app.yml', 'app.json', 'heroku.yml', 'firebase.json', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
  'amplify.yml', 'apprunner.yaml', 'dockerrun.aws.json', '.platform.app.yaml', 'cloudbuild.yaml', 'cloudbuild.yml', 'appspec.yml', 'samconfig.toml']);
const IAC_FILES = new Set(['pulumi.yaml', 'pulumi.yml', 'serverless.yml', 'serverless.yaml', 'cdk.json', 'chart.yaml', 'kustomization.yaml', 'kustomization.yml', 'skaffold.yaml']);
const IAC_RE = /\.(tf|tfvars|bicep)$/i;
const CI_FILES = new Set(['.gitlab-ci.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'jenkinsfile']);
const SERVER_ENTRY_RE = /^(server\.(m?[jt]s|cjs|py|go|rb)|manage\.py|wsgi\.py|asgi\.py)$/i;
const SERVER_DEPS = new Set(['express', 'fastify', 'koa', 'hapi', '@hapi/hapi', 'restify', 'hono', 'next', 'nuxt', '@nestjs/core',
  '@remix-run/node', '@remix-run/serve', '@sveltejs/kit', 'sails', '@adonisjs/core']);
const SERVER_SCRIPT_RE = /^(start|serve|deploy)(:|$)/;
const PY_MANIFEST_RE = /^(requirements.*\.txt|pyproject\.toml|pipfile)$/i;
const PY_SERVER_RE = /^\s*["']?(flask|django|fastapi|starlette|uvicorn|gunicorn|aiohttp|tornado|sanic)\b/im;
const DEPLOY_WORD_RE = /\bdeploy/i;
// A comment is never evidence: `#` at the start of a line or after whitespace, outside
// quotes, ends what the line says (YAML, and the shell inside a run: script alike).
function stripHashComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
// The line where a CI config deploys, or 0 (#165). A GitHub workflow deploys in what
// runs: a run: script (inline or its block), a uses: action, a job or step name:, or an
// environment: key; any other CI config in any line of its own. Comments never count.
const GH_RUNS_KEY_RE = /^\s*(?:-\s+)?(run|uses|name|environment)\s*:/;
function deployLine(text, githubWorkflow) {
  const lines = String(text).split('\n');
  let blockIndent = -1;   // inside a run: block scalar: the indent its key sits at
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = raw.match(/^\s*/)[0].length;
    if (blockIndent >= 0 && raw.trim() !== '' && indent <= blockIndent) blockIndent = -1;
    const said = stripHashComment(raw);
    if (!githubWorkflow) { if (DEPLOY_WORD_RE.test(said)) return i + 1; continue; }
    const key = said.match(GH_RUNS_KEY_RE);
    if (blockIndent >= 0 || key) { if (DEPLOY_WORD_RE.test(said)) return i + 1; }
    if (key && key[1] === 'run' && /:\s*[|>][-+0-9]*\s*$/.test(said)) blockIndent = said.indexOf('run');
  }
  return 0;
}
function packageJsonSignal(text) {
  let pkg; try { pkg = JSON.parse(text); } catch { return null; }
  if (!pkg || typeof pkg !== 'object') return null;
  const script = Object.keys(pkg.scripts || {}).find((k) => SERVER_SCRIPT_RE.test(k));
  if (script) return `a "${script}" script`;
  for (const sec of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const dep = Object.keys(pkg[sec] || {}).find((d) => SERVER_DEPS.has(d));
    if (dep) return `a ${dep} dependency`;
  }
  return null;
}
function findDeploymentSignals(dir, { evidencePointer = null } = {}) {
  const signals = [];
  const add = (kind, path, what) => signals.push({ kind, path, what });
  // the owner already keeps (or points at) an evidence directory: they treat this as deployed
  if (evidencePointer) add('evidence', evidencePointer.replace(/\/$/, ''), "the packet's evidence pointer");
  for (const base of ['ops', 'docs']) if (statOk(join(dir, base, 'evidence'), (s) => s.isDirectory())) add('evidence', `${base}/evidence`, 'an owner evidence directory');
  let seen = 0, truncated = false;
  const walk = (rel) => {
    for (const e of safeReaddir(rel ? join(dir, rel) : dir).sort()) {
      if (++seen > DEPLOY_WALK_LIMIT) { truncated = true; return; }
      const p = rel ? `${rel}/${e}` : e;
      const abs = join(dir, p);
      if (statOk(abs, (s) => s.isDirectory())) {
        if (!DEPLOY_WALK_SKIP.has(e)) walk(p);
        if (truncated) return;
        continue;
      }
      if (!statOk(abs, (s) => s.isFile())) continue;
      const lower = e.toLowerCase();
      if (CONTAINER_RE.test(e)) add('container', p, 'a container file');
      else if (HOSTING_FILES.has(lower)) add('hosting', p, 'a hosting config');
      else if (IAC_FILES.has(lower) || IAC_RE.test(e)) add('infrastructure', p, 'infrastructure-as-code or a service manifest');
      else if (SERVER_ENTRY_RE.test(e)) add('server', p, 'a server entry point');
      else if (lower === 'package.json') { const w = packageJsonSignal(safeRead(abs) || ''); if (w) add('server', p, w); }
      else if (PY_MANIFEST_RE.test(e)) { if (PY_SERVER_RE.test(safeRead(abs) || '')) add('server', p, 'a Python web framework dependency'); }
      const gh = /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p);
      if (gh || CI_FILES.has(lower) || /^\.circleci\/config\.ya?ml$/i.test(p)) {
        const line = deployLine(safeRead(abs) || '', gh);
        if (line) signals.push({ kind: 'deploy-workflow', path: p, line, what: `a CI workflow that deploys (line ${line})` });
      }
    }
  };
  walk('');
  if (truncated) add('unwalked', '.', `a tree past ${DEPLOY_WALK_LIMIT} entries, not walked to the end (not ruled out)`);
  return { signals, walked: Math.min(seen, DEPLOY_WALK_LIMIT), truncated };
}
const DEPLOYMENT_LOOKED_FOR = 'a container file, a hosting config, infrastructure-as-code or a service manifest, a CI workflow that deploys, a server entry point, start script or web-framework dependency, or an owner evidence directory';
function evidenceNotApplicable(id) {
  return {
    name: `evidence-${id}`, status: 'not-applicable',
    detail: { path: '.', descriptor: id, file: null },
    evidence: ['./:1'],
    observation: `No deployment signal found anywhere in the tree (looked for ${DEPLOYMENT_LOOKED_FOR}) — nothing here is deployed, so ${id} is not applicable, not merely unevidenced.`,
  };
}

// ── signals: declared expectations, a health report, a routing policy (#311) ──
// The three interfaces are stated by property in yardstick/README.md ("Operability
// interfaces"). The census reads them through the format reader its adapter names
// (adapters/repo-census.yaml `signals.reader`), the replaceable part: the census names
// no application's format. A reader that is not named, or cannot be loaded, halts the
// census (exit 2): a census that cannot read the declarations never reads them absent.
const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scanners', 'adapters');
async function loadSignalsReader() {
  const adapter = parseYaml(readFileSync(join(ADAPTER_DIR, 'repo-census.yaml'), 'utf8'));
  const rel = adapter?.signals?.reader;
  if (typeof rel !== 'string' || !rel) throw new Error('adapters/repo-census.yaml names no signals.reader (the format reader for an application\'s signal declarations)');
  const mod = await import(pathToFileURL(join(ADAPTER_DIR, rel)).href);
  if (typeof mod.readSignals !== 'function') throw new Error(`adapters/${rel} exports no readSignals(dir)`);
  return { read: mod.readSignals, format: typeof mod.FORMAT === 'string' ? mod.FORMAT : rel };
}
// loaded once, its failure held until the census reads signals, so a module that imports
// this one for a helper (map/ingest.mjs) never halts on it
const SIGNALS_LOADED = await loadSignalsReader().then((r) => ({ r, e: null }), (e) => ({ r: null, e }));
const SIGNALS = {
  get format() { return SIGNALS_LOADED.r ? SIGNALS_LOADED.r.format : ''; },
  read(dir) { if (SIGNALS_LOADED.e) throw SIGNALS_LOADED.e; return SIGNALS_LOADED.r.read(dir); },
};
const SIGNAL_CLASSES = ['record', 'digest', 'notify'];
const HEALTH_FIELDS = ['last_success', 'last_count', 'since'];
const SCHEDULED_LOOKED_FOR = 'a CI workflow with a schedule: cron';

// The jobs a CI workflow schedules: one per workflow whose `on:` carries `schedule:` with a
// `cron:` entry, named by the workflow file's stem, citing the first cron line. Comments
// never count.
function findWorkflowSchedules(dir) {
  const wfDir = join(dir, '.github', 'workflows');
  const jobs = [];
  for (const f of safeReaddir(wfDir).filter((x) => /\.ya?ml$/i.test(x)).sort()) {
    const lines = (safeRead(join(wfDir, f)) || '').split('\n').map(stripHashComment);
    let inSchedule = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      const indent = l.match(/^\s*/)[0].length;
      if (inSchedule >= 0 && indent <= inSchedule && !/^\s*-/.test(l)) inSchedule = -1;
      if (/^\s*schedule\s*:\s*$/.test(l)) { inSchedule = indent; continue; }
      if (inSchedule >= 0 && /^\s*-?\s*cron\s*:/.test(l)) {
        jobs.push({ name: f.replace(/\.ya?ml$/i, ''), at: `.github/workflows/${f}:${i + 1}`, how: `a CI workflow's schedule (.github/workflows/${f})` });
        break;
      }
    }
  }
  return jobs;
}
const subjectOf = (w) => `${w.kind}:${w.target}`;
const missingOf = (d) => ['expect', 'evidence', 'runbook'].filter((k) => !d[k]);
const problemsIn = (sig, iface) => sig.problems.filter((p) => p.interface === iface);

// expectation-declared: one check per scheduled job and per declared signal
function checkExpectations(sig, jobs) {
  const checks = [];
  const declFile = sig.declarations[0]?.at.replace(/:\d+$/, '') ?? null;
  for (const p of problemsIn(sig, 'declarations')) {
    checks.push({ name: 'expectation-declared', status: 'gap', detail: { path: '.', subject: `file:${p.at.replace(/:\d+$/, '')}` }, evidence: [p.at], observation: `${p.what}: no declaration in it can be read, so nothing it declares is measured.` });
  }
  const used = new Set();
  for (const j of jobs) {
    const d = sig.declarations.find((x) => x.watches && x.watches.kind === 'job' && x.watches.target === j.name);
    const subject = `job:${j.name}`;
    if (!d) {
      checks.push({ name: 'expectation-declared', status: 'gap', detail: { path: '.', subject }, evidence: [j.at],
        observation: `The scheduled job ${j.name} (${j.how}) has no declared expectation${declFile ? ` in ${declFile}` : ` (no signal declaration was found, read as ${SIGNALS.format})`}: if it stops running, or runs and does nothing, no declaration says what should have happened.` });
      continue;
    }
    used.add(d);
    const miss = missingOf(d);
    if (!d.name) miss.unshift('name');
    checks.push(miss.length
      ? { name: 'expectation-declared', status: 'gap', detail: { path: '.', subject }, evidence: [d.at, j.at], observation: `The declaration watching the scheduled job ${j.name} lacks ${miss.join(', ')}: an expectation is stated with what is expected, the evidence that shows it and the runbook step to take.` }
      : { name: 'expectation-declared', status: 'pass', detail: { path: '.', subject }, evidence: [d.at, j.at], observation: `The scheduled job ${j.name} (${j.how}) declares its expectation as signal ${d.name}: "${d.expect}", shown by ${d.evidence}, runbook ${d.runbook}. This reads the declaration, not whether the expectation holds in production.` });
  }
  for (const d of sig.declarations.filter((x) => !used.has(x))) {
    const miss = missingOf(d);
    if (!d.name) miss.unshift('name');
    if (!d.watches) miss.push('watches (job <name>, effect <path> or cost <account>)');
    const subject = d.watches ? subjectOf(d.watches) : `signal:${d.name || d.at}`;
    if (d.watches?.kind === 'job') {
      checks.push({ name: 'expectation-declared', status: miss.length ? 'gap' : 'pass', detail: { path: '.', subject }, evidence: [d.at],
        observation: miss.length ? `The declaration of signal ${d.name || '(unnamed)'} lacks ${miss.join(', ')}.` : `Signal ${d.name} declares an expectation for job ${d.watches.target}, which the census found no schedule for (looked for ${SCHEDULED_LOOKED_FOR}, and the application's own schedule): "${d.expect}", shown by ${d.evidence}, runbook ${d.runbook}.` });
      continue;
    }
    checks.push(miss.length
      ? { name: 'expectation-declared', status: 'gap', detail: { path: '.', subject }, evidence: [d.at], observation: `The declaration of signal ${d.name || '(unnamed)'} lacks ${miss.join(', ')}: an expectation is stated with what it watches, what is expected, the evidence that shows it and the runbook step to take.` }
      : { name: 'expectation-declared', status: 'pass', detail: { path: '.', subject }, evidence: [d.at], observation: `Signal ${d.name} declares an expectation for ${d.watches.kind} ${d.watches.target}: "${d.expect}", shown by ${d.evidence}, runbook ${d.runbook}. This reads the declaration, not whether the expectation holds in production.` });
  }
  if (!checks.length) {
    checks.push({ name: 'expectation-declared', status: 'not-applicable', detail: { path: '.' }, evidence: ['./:1'],
      observation: `No scheduled job found (looked for ${SCHEDULED_LOOKED_FOR}, and the application's own schedule read as ${SIGNALS.format}) and no signal declared: the census has no job to ask for an expectation. Whether the application's effects declare theirs is read against the run's triaged effects.` });
  }
  return checks;
}
// health-report and routing-policy: one check each, over the declared signals
function nothingToWatch(sig, jobs, deployment) {
  return !jobs.length && !sig.declarations.length && !deployment.signals.length;
}
function notApplicableSignal(name, what) {
  return { name, status: 'not-applicable', detail: { path: '.' }, evidence: ['./:1'],
    observation: `No scheduled job found (looked for ${SCHEDULED_LOOKED_FOR}), no signal declared and no deployment signal anywhere in the tree (looked for ${DEPLOYMENT_LOOKED_FOR}): there is nothing for ${what} to cover.` };
}
const declaredNames = (sig) => sig.declarations.map((d) => d.name).filter(Boolean);
function checkHealthReport(sig, jobs, deployment) {
  const name = 'health-report';
  const bad = problemsIn(sig, 'health');
  if (bad.length) return { name, status: 'gap', detail: { path: '.' }, evidence: bad.map((p) => p.at), observation: `${bad.map((p) => p.what).join('; ')}: the health report's schema cannot be read.` };
  if (!sig.health) {
    if (nothingToWatch(sig, jobs, deployment)) return notApplicableSignal(name, 'a health report');
    return { name, status: 'gap', detail: { path: '.' }, evidence: ['./:1'],
      observation: `No machine-readable health report schema found (read as ${SIGNALS.format}): nothing states, for each signal, when it last held, what it last counted and since when, so an absence (a job that never started, a run that touched nothing) is seen only when someone goes looking.` };
  }
  const reported = new Map(sig.health.signals.filter((s) => s.name).map((s) => [s.name, s]));
  const names = declaredNames(sig);
  const missing = names.filter((n) => !reported.has(n));
  const thin = names.filter((n) => reported.has(n)).map((n) => [n, HEALTH_FIELDS.filter((f) => !reported.get(n).fields.includes(f))]).filter(([, m]) => m.length);
  const problems = [];
  if (!reported.size) problems.push('it reports no signal');
  if (missing.length) problems.push(`it does not report ${missing.length} declared signal(s): ${missing.join(', ')}`);
  for (const [n, m] of thin) problems.push(`signal ${n} lacks ${m.join(', ')}`);
  if (!sig.health.report) problems.push('it names no place the report is served (report:)');
  if (problems.length) return { name, status: 'gap', detail: { path: '.' }, evidence: [sig.health.at, ...thin.map(([n]) => reported.get(n).at)], observation: `The health report's schema (${sig.health.at.replace(/:\d+$/, '')}): ${problems.join('; ')}. A report states each declared signal's ${HEALTH_FIELDS.join(', ')}.` };
  return { name, status: 'pass', detail: { path: '.' }, evidence: [sig.health.at],
    observation: `The health report's schema (${sig.health.at.replace(/:\d+$/, '')}, served at ${sig.health.report}) states ${HEALTH_FIELDS.join(', ')} for every one of the ${names.length} declared signal(s). This reads the schema in the tree; whether the report is live is the owner's transcript (evidence-d-health-reported).` };
}
function checkRoutingPolicy(sig, jobs, deployment) {
  const name = 'routing-policy';
  const bad = problemsIn(sig, 'policy');
  if (bad.length) return { name, status: 'gap', detail: { path: '.' }, evidence: bad.map((p) => p.at), observation: `${bad.map((p) => p.what).join('; ')}: the routing policy cannot be read.` };
  if (!sig.policy) {
    if (nothingToWatch(sig, jobs, deployment)) return notApplicableSignal(name, 'a routing policy');
    return { name, status: 'gap', detail: { path: '.' }, evidence: ['./:1'],
      observation: `No routing policy found as data (read as ${SIGNALS.format}): who reads which signal, at what class and with what budget is decided nowhere a person can change it.` };
  }
  const routes = sig.policy.routes;
  const byName = new Map(routes.filter((r) => r.signal).map((r) => [r.signal, r]));
  const names = declaredNames(sig);
  const problems = [], cite = [sig.policy.at];
  const unrouted = names.filter((n) => !byName.has(n));
  if (!routes.length) problems.push('it routes no signal');
  if (unrouted.length) problems.push(`it classes no route for ${unrouted.length} declared signal(s): ${unrouted.join(', ')}`);
  for (const r of routes) {
    const miss = [];
    if (!SIGNAL_CLASSES.includes(r.class)) miss.push(`a class of ${SIGNAL_CLASSES.join(', ')} (got ${r.class ?? 'none'})`);
    if (!r.to) miss.push('a destination role (to:)');
    if (!r.budget) miss.push('a budget');
    if (miss.length) { problems.push(`the route for ${r.signal || '(unnamed)'} lacks ${miss.join(', ')}`); cite.push(r.at); }
  }
  const notify = routes.filter((r) => r.class === 'notify');
  if (routes.length && notify.length === routes.length) problems.push(`every one of its ${routes.length} route(s) is at notify: nothing is held at record or digest until it has been seen quiet and accurate, the flood a reader mutes`);
  const by = Object.fromEntries(SIGNAL_CLASSES.map((c) => [c, routes.filter((r) => r.class === c).length]));
  if (problems.length) return { name, status: 'gap', detail: { path: '.', classes: by }, evidence: [...new Set(cite)], observation: `The routing policy (${sig.policy.at.replace(/:\d+$/, '')}): ${problems.join('; ')}.` };
  return { name, status: 'pass', detail: { path: '.', classes: by }, evidence: [sig.policy.at],
    observation: `The routing policy (${sig.policy.at.replace(/:\d+$/, '')}) classes every one of the ${names.length} declared signal(s), each with a destination role and a budget: ${SIGNAL_CLASSES.map((c) => `${by[c]} at ${c}`).join(', ')}. Whether a signal at notify earned its promotion (seen quiet and accurate first) is not in the tree.` };
}
function signalChecks(dir, deployment) {
  const sig = SIGNALS.read(dir);
  const jobs = [...findWorkflowSchedules(dir), ...sig.jobs];
  return [...checkExpectations(sig, jobs), checkHealthReport(sig, jobs, deployment), checkRoutingPolicy(sig, jobs, deployment)];
}

// ── the run ──────────────────────────────────────────────────────────────────
// exported so other callers reading a checkout's own identity (routine/run.mjs's
// routine.yaml) reuse this exact "is dir itself a repo root" check, rather than
// letting git's own upward discovery resolve to an ENCLOSING repo when dir is
// merely a subdirectory or fixture that isn't a repo of its own.
export function gitHead(dir) {
  if (!existsSync(join(dir, '.git'))) return null;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() || null : null;
}
// strip a "user:password@" userinfo from an http(s)-style remote URL; an SSH
// remote (git@host:owner/repo.git) carries no "://" and is left untouched — the
// "git@" there is the protocol's normal user, not a leaked credential.
const USERINFO_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]+@/;
export function stripUserinfo(url) { return url.replace(USERINFO_RE, '$1'); }
export function gitRemote(dir) {
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

  // where the tree's projects are (map/projects.mjs, #246), unless the packet's `apps` declares them
  const declaredApps = Array.isArray(pointers.apps) ? [...pointers.apps] : (typeof pointers.apps === 'string' ? [pointers.apps] : null);
  if (pointers.apps !== undefined) note('apps');
  // each location with the parent whose passing document can cover it, and the paths it goes by there
  let locs, projects = null, setAside = /** @type {Array<{ path: string, reason: string }>} */ ([]);
  if (declaredApps) {
    locs = [{ path: '.', parent: null, project: true, names: [] }, ...declaredApps.map((a) => ({ path: a, parent: '.', project: false, names: [a] }))];
  } else {
    ({ projects, setAside } = locateProjects(dir));
    locs = [];
    for (const pr of projects) {
      if (pr.path === '.') locs.push({ path: '.', parent: null, project: true, names: [] });
      else locs.push({ path: pr.path, parent: '.', project: true, names: [pr.path] });
      for (const w of pr.locations) {
        const full = workspacePath(pr, w);
        // named from the root, and from the directory its project runs in (a nested project, or the
        // root's application directory, #35)
        locs.push({ path: full, parent: pr.path, project: false, names: [full, ...(pr.run === '.' ? [] : [w])] });
      }
    }
  }
  const mono = { detected: locs.length > 1, locations: locs.filter((l) => l.path !== '.').map((l) => l.path) };
  // a positional pointer list reads the root first, then the other locations in path order (or the
  // packet's own `apps` order) — the order owner/PACKET.md documents
  const order = declaredApps ? locs.map((l) => l.path) : ['.', ...[...mono.locations].sort()];
  const nestedLocs = locs.filter((l) => l.project && l.path !== '.');

  const checks = [];
  // the root is checked first, then each nested project, then the workspaces: a location with
  // no file of its own is credited to its parent's passing document when that document names it;
  // a root with no document of its own is covered by its nested projects when each carries one
  // that passes on its own (delegatedPass)
  // the census's own deployment signals (findDeploymentSignals), read once: a workspace that
  // carries a deploy artifact of its own is a separately deployed unit (#306)
  if (pointers.evidence) note('evidence');
  const deployment = findDeploymentSignals(dir, { evidencePointer: pointers.evidence || null });
  const perLocation = (name, what, sectionRe, check, which) => {
    const byPath = new Map();
    const out = [];
    for (const l of locs.filter(which)) {
      const parent = l.parent === null ? null : byPath.get(l.parent);
      const m = parent ? rootMention(dir, parent, l.path, sectionRe, l.names, l.parent, name === 'agent-contract') || treeCover(parent, l, deployment) : null;
      const c = check(l, m ? { ...m, parent: l.parent } : null);
      if (m && c.detail?.coveredBy) CONTRACT_OF.set(c, m.contract);
      byPath.set(l.path, c);
      out.push(c);
    }
    const root = byPath.get('.');
    const own = nestedLocs.map((l) => byPath.get(l.path)).filter(Boolean);
    const rootHasWorkspaces = locs.some((l) => l.parent === '.' && !l.project);
    if (root && ABSENT.has(root) && !rootHasWorkspaces && own.length && own.length === nestedLocs.length && own.every((c) => c.status === 'pass' && !c.detail?.coveredBy)) {
      out[out.indexOf(root)] = delegatedPass(name, what, own);
    }
    return out;
  };
  checks.push(...perLocation('architecture-page', 'architecture page', /^architecture\b/i, (l, credit) => {
    const p = pointerForLocation(pointers.architecture, order, l.path);
    if (p) note('architecture');
    return checkArchitecturePage(dir, l.path, p, credit);
  }, () => true));
  checks.push(...perLocation('agent-contract', 'agent contract', null, (l, credit) => {
    const p = pointerForLocation(pointers.agent_contract, order, l.path);
    if (p) note('agent_contract');
    return checkAgentContract(dir, l.path, p, credit);
  }, () => true));
  // the runbook belongs to a project (the root and each nested one), never to a workspace
  if (pointers.runbook) note('runbook');
  checks.push(...perLocation('runbook', 'runbook', /^(runbook|operations)\b/i, (l, credit) => checkRunbook(dir, l.path === '.' ? (pointers.runbook || null) : null, l.path, credit), (l) => l.project));
  if (pointers.default_branch) note('default_branch');
  if (pointers.workflows) note('workflows');
  checks.push(checkCiGate(dir, defaultBranch, pointers.default_branch || null, pointers.workflows || null));
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error(`--as-of must be YYYY-MM-DD (got "${asOfDate}")`);
  if (!(Number(evidenceMaxAgeDays) > 0)) throw new Error(`--evidence-max-age must be a positive number of days (got "${evidenceMaxAgeDays}")`);
  for (const id of EVIDENCE_IDS) {
    checks.push(deployment.signals.length ? checkEvidenceRow(dir, id, asOfDate, Number(evidenceMaxAgeDays), pointers.evidence || null) : evidenceNotApplicable(id));
  }
  checks.push(...signalChecks(dir, deployment));
  const exit = checks.some((c) => c.status === 'gap') ? 1 : 0;
  const target_ = { path: target, head: gitHead(dir) };
  const remote = gitRemote(dir);
  if (remote) target_.remote = remote;
  const doc = {
    tool: 'repo-census', version: VERSION, target: target_, monorepo: mono,
    evidence: { asOf: asOfDate, maxAgeDays: Number(evidenceMaxAgeDays) },
    deployment,
    checks, exit,
  };
  // the projects the tree holds beside its root (map/projects.mjs, #246), each with its workspaces from the root
  if (projects && projects.length > 1) doc.projects = projects.map((pr) => ({ path: pr.path, from: pr.from, locations: pr.locations.map((w) => workspacePath(pr, w)) }));
  // what installs on its own but is not read as a project, and why (never a silent drop)
  if (setAside.length) doc.projects_set_aside = setAside;
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
