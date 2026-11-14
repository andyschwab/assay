// effect-signals.mjs — what the tree states about a listed effect candidate, read deterministically
// (#315 slice 3; map/SCHEMA.md §6e, "The signals").
//
// The checklist (map/effect-answers.mjs) is answered by a lane reading the code. Some answers the
// tree states outright: a workflow job that names an environment, a permissions block, a manual
// dispatch, a script whose argument parsing defaults to a dry run, a route its file wraps in a rate
// limiter, a statement that sets a soft-delete column. enumerate records each such fact on the
// candidate as a signal: { question, supports, evidence: ["path:line"], marker }, the question it
// bears on, the answer it supports, where the tree states it, and the marker that read it. A signal
// is read, never inferred: a candidate with no marker for a question carries no signal for it, and
// no signal ever says no for want of a marker. A lane still answers every question; validate holds
// an answer that differs from a signal to say why (`against_signal`, map/effect-answers.mjs).
//
// The markers are data (map/effect-signals.yaml, each with its reason): this module knows where in a
// file to look (a workflow's job keys and triggers, a script's argument parsing, a route's
// registering line and handler, a literal SQL statement) and names no marker itself, so the core
// names no tool or library here (CLAUDE.md rule 7). The file is read once; a file that does not read,
// or an entry with no reason, halts enumerate (fail loud).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { CHECKLIST_KEYS } from './effect-answers.mjs';

const MARKERS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'effect-signals.yaml');
const SUPPORTS = ['yes', 'no'];
const HELD_BY = ['code', 'outside'];

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

/** The markers, read and held to their shape: every entry names its reason. @param {string} [path] */
export function loadMarkers(path = MARKERS_FILE) {
  const doc = parseYaml(readFileSync(path, 'utf8'));
  const bad = (m) => { throw new Error(`${path}: ${m}`); };
  if (!doc || doc.schema !== 'effect-signals' || doc.version !== 1) bad('needs schema: effect-signals, version: 1');
  const question = (q, at) => { if (!CHECKLIST_KEYS.includes(q)) bad(`${at}: question ${JSON.stringify(q)} is not a question of the checklist (${CHECKLIST_KEYS.join(', ')})`); };
  const supports = (s, at) => { if (!SUPPORTS.includes(s)) bad(`${at}: supports ${JSON.stringify(s)} is not one of ${SUPPORTS.join(', ')}`); };
  const reasoned = (list, key, at) => {
    if (!Array.isArray(list) || !list.length) bad(`${at}: a non-empty list`);
    list.forEach((e, i) => { if (!e || !nonEmpty(e[key])) bad(`${at}[${i}]: names its ${key}`); if (!nonEmpty(e.reason)) bad(`${at}[${i}] (${e[key]}): says why (reason)`); });
  };
  const wf = doc.workflow || bad('workflow: the workflow markers');
  for (const k of ['job_keys', 'workflow_keys']) {
    reasoned(wf[k], 'key', `workflow.${k}`);
    wf[k].forEach((e, i) => {
      question(e.question, `workflow.${k}[${i}]`); supports(e.supports, `workflow.${k}[${i}]`);
      if (e.question === 'refuses_unless' && e.supports === 'yes' && (!HELD_BY.includes(e.held_by) || !nonEmpty(e.what))) bad(`workflow.${k}[${i}]: a refuses_unless yes says who holds the check (held_by: ${HELD_BY.join(' | ')}) and what it checks (what)`);
    });
  }
  const tr = wf.triggers || bad('workflow.triggers');
  question(tr.question, 'workflow.triggers');
  reasoned(tr.person, 'trigger', 'workflow.triggers.person');
  reasoned(tr.automatic, 'trigger', 'workflow.triggers.automatic');
  const sc = doc.scripts || bad('scripts: the script markers');
  question(sc.question, 'scripts'); supports(sc.supports, 'scripts');
  if (!nonEmpty(sc.reason)) bad('scripts: says why (reason)');
  reasoned(sc.apply_flags, 'flag', 'scripts.apply_flags');
  if (!Array.isArray(sc.dry_run_words) || !sc.dry_run_words.length) bad('scripts.dry_run_words: a non-empty list');
  const rt = doc.routes || bad('routes: the route markers');
  question(rt.question, 'routes'); supports(rt.supports, 'routes');
  reasoned(rt.limiter_modules, 'module', 'routes.limiter_modules');
  reasoned(rt.limiter_calls, 'call', 'routes.limiter_calls');
  if (!Array.isArray(rt.limiter_words) || !rt.limiter_words.length || !nonEmpty(rt.limiter_words_reason)) bad('routes.limiter_words: a non-empty list, and limiter_words_reason');
  const sd = doc.soft_delete || bad('soft_delete: the soft-delete markers');
  question(sd.question, 'soft_delete'); supports(sd.supports, 'soft_delete');
  if (!nonEmpty(sd.reason)) bad('soft_delete: says why (reason)');
  reasoned(sd.columns, 'column', 'soft_delete.columns');
  return doc;
}

// ── where to look ───────────────────────────────────────────────────────────
const indentOf = (l) => l.length - l.trimStart().length;
const blank = (l) => !l.trim() || /^\s*#/.test(l);
const unq = (v) => String(v).trim().replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
// the lines under the key at line i: [i + 1, end)
function blockEnd(ls, i) {
  const ind = indentOf(ls[i]);
  let j = i + 1;
  while (j < ls.length && (blank(ls[j]) || indentOf(ls[j]) > ind)) j++;
  return j;
}
// a block's direct children: [{ key, value, at }], a `key: value` or a `- item` at the first child indent
function children(ls, i, end) {
  const out = [];
  let ind = -1;
  for (let j = i + 1; j < end; j++) {
    if (blank(ls[j])) continue;
    if (ind < 0) ind = indentOf(ls[j]);
    if (indentOf(ls[j]) !== ind) continue;
    const item = ls[j].match(/^\s*-\s+(.*)$/);
    if (item) { out.push({ key: unq(item[1]), value: '', at: j }); continue; }
    const kv = ls[j].match(/^\s*(['"]?)([\w-]+)\1\s*:\s*(.*)$/);
    if (kv) out.push({ key: kv[2], value: unq(kv[3]), at: j });
  }
  return out;
}

// A workflow file's triggers, top-level keys and jobs.
function readWorkflow(ls) {
  const onAt = ls.findIndex((l) => /^(?:on|"on"|'on'|true)\s*:/.test(l));
  const triggers = [];
  if (onAt >= 0) {
    const v = unq(ls[onAt].replace(/^[^:]*:\s*/, ''));
    if (v.startsWith('[')) for (const t of v.replace(/^\[|\]$/g, '').split(',')) { if (unq(t)) triggers.push({ name: unq(t), at: onAt }); }
    else if (v) triggers.push({ name: v, at: onAt });
    else for (const c of children(ls, onAt, blockEnd(ls, onAt))) triggers.push({ name: c.key, at: c.at });
  }
  const top = new Map();
  ls.forEach((l, i) => { const m = l.match(/^([\w-]+)\s*:\s*(.*)$/); if (m && !top.has(m[1])) top.set(m[1], { value: unq(m[2]), at: i }); });
  const jobs = [];
  const jobsAt = ls.findIndex((l) => /^jobs:\s*(?:#.*)?$/.test(l));
  if (jobsAt >= 0) for (const c of children(ls, jobsAt, blockEnd(ls, jobsAt))) {
    const end = blockEnd(ls, c.at);
    jobs.push({ name: c.key, start: c.at, end, keys: new Map(children(ls, c.at, end).map((k) => [k.key, k])) });
  }
  return { triggers, top, jobs };
}

/** A workflow write's signals, read at the jobs that hold its step lines (0-based). @returns {Map<string, any>} */
function workflowSignals(ls, at, M) {
  const out = new Map();
  const { triggers, top, jobs } = readWorkflow(ls);
  const wf = M.workflow;
  // the trigger: every trigger a person's act, or any one that starts the job with none
  const tq = wf.triggers.question;
  const person = new Set(wf.triggers.person.map((e) => e.trigger)), automatic = new Set(wf.triggers.automatic.map((e) => e.trigger));
  if (triggers.length && triggers.every((t) => person.has(t.name))) out.set(tq, { question: tq, supports: 'yes', lines: triggers.map((t) => t.at), marker: `on: ${triggers.map((t) => t.name).join(', ')}` });
  else if (triggers.some((t) => automatic.has(t.name))) {
    const auto = triggers.filter((t) => automatic.has(t.name));
    out.set(tq, { question: tq, supports: 'no', lines: auto.map((t) => t.at), marker: `on: ${auto.map((t) => t.name).join(', ')}` });
  }
  // a job-level key, or a workflow-level one for a job that declares none: at every job holding a step
  const holding = [...new Set(at.map((i) => jobs.find((j) => i > j.start && i < j.end)))];
  if (!holding.length || holding.includes(undefined)) return out;   // a step outside any job (a composite action): no job to read
  const holds = (e, k) => k && !(Array.isArray(e.unbounded) && e.unbounded.includes(k.value));
  const questions = [...new Set([...wf.job_keys, ...wf.workflow_keys].map((e) => `${e.question}\u0000${e.supports}`))];
  for (const qs of questions) {
    const [q, s] = qs.split('\u0000');
    const lines = [], markers = new Set();
    /** @type {any} */
    let first = null;
    const every = holding.every((job) => {
      const own = wf.job_keys.find((e) => e.question === q && e.supports === s && holds(e, job.keys.get(e.key)));
      if (own) { lines.push(job.keys.get(own.key).at); markers.add(`job key: ${own.key}`); first = first || own; return true; }
      const wide = wf.workflow_keys.find((e) => e.question === q && e.supports === s && holds(e, top.get(e.key)));
      if (wide) { lines.push(top.get(wide.key).at); markers.add(`workflow key: ${wide.key}`); first = first || wide; return true; }
      return false;
    });
    if (every && first) out.set(q, { question: q, supports: s, lines, marker: [...markers].join(', '), ...(first.held_by ? { held_by: first.held_by, what: first.what } : {}) });
  }
  return out;
}

// The lines of a file that are code: a comment line (//, /*, *, #) is skipped.
const codeLine = (l) => !/^\s*(?:\/\/|\/\*|\*|#)/.test(l) && l.length <= 2000;

/** A script's signal, read from its own argument parsing. @returns {Map<string, any>} */
function scriptSignals(ls, M) {
  const out = new Map();
  const sc = M.scripts;
  const words = sc.dry_run_words.map(esc).join('|');
  const DRY_DEFAULT = new RegExp(`(?<![\\w-])(?:${words})(?![\\w-])(?:\\s*:\\s*[A-Za-z_][\\w.]*)?\\s*(?:=(?!=)|:)\\s*(?:true\\b|True\\b|1\\b|['"]1['"]|!(?!=)|not\\s|\\$\\{\\w+:-(?:1|true)\\})|add_argument\\(\\s*['"]--(?:${words})['"][^)]*\\bdefault\\s*=\\s*True\\b`);
  const dryAt = ls.findIndex((l) => codeLine(l) && DRY_DEFAULT.test(l));
  for (const f of sc.apply_flags) {
    const re = new RegExp(`(['"\`])${esc(f.flag)}\\1|(?:^|[\\s|(])${esc(f.flag)}\\s*[|)]`);
    const flagAt = ls.findIndex((l) => codeLine(l) && re.test(l));
    if (flagAt < 0) continue;
    if (!f.dry_run_default && dryAt < 0) continue;
    out.set(sc.question, { question: sc.question, supports: sc.supports, lines: f.dry_run_default ? [flagAt] : [flagAt, dryAt], marker: `apply flag: ${f.flag}` });
    break;
  }
  return out;
}

// A route's registering line: an Express-style call, a Next.js app-router method export, a
// pages-router default export, or none (a node:http dispatch, read no further).
const EXPRESS = /\b(app|router|\w+Router)[.](get|post|put|patch|delete|options|head|all)\s*[(]\s*(['"`])(\/[^'"`]*)\3/;
const NEXT_EXPORT = /\bexport\s+(?:(?:async\s+)?function\s*\*?|(?:const|let|var)\s+)(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b|\bexport\s*\{/;
// the line a bracket opened at (i, c) closes on, reading past strings and line comments; or the last line
function closeOf(ls, i, c) {
  const close = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let q = null;
  for (let j = i; j < Math.min(ls.length, i + 400); j++) {
    const l = ls[j];
    for (let k = j === i ? c : 0; k < l.length; k++) {
      const ch = l[k];
      if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; }
      if (ch === '/' && l[k + 1] === '/') break;
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (close[ch]) stack.push(close[ch]);
      else if (ch === ')' || ch === ']' || ch === '}') { stack.pop(); if (!stack.length) return j; }
    }
    if (q && q !== '`') q = null;
  }
  return ls.length - 1;
}
// the handler's lines [from, to] for the route registered at line i, by its form; null when unread
function routeExtent(ls, i, path) {
  const l = ls[i];
  const ex = l.match(EXPRESS);
  if (ex) return { from: i, to: closeOf(ls, i, l.indexOf('(', ex.index)), express: { recv: ex[1], path: ex[4] } };
  if (NEXT_EXPORT.test(l)) {
    let to = ls.length - 1;
    for (let j = i + 1; j < ls.length; j++) if (/^\s*export\b/.test(ls[j])) { to = j - 1; break; }
    return { from: i, to };
  }
  if (/(?:^|\/)pages\/api\//.test(path) && /\bexport\s+default\b/.test(l)) return { from: 0, to: ls.length - 1 };
  return null;
}

// The limiter names a file binds: from a listed module (an import or require, and an instance made
// from one), or defined by the tree under a name that says it limits (in the file, or imported from a
// relative path). Map<name, line>.
function limiterNames(ls, M) {
  const names = new Map();
  const mods = M.routes.limiter_modules.map((m) => esc(m.module)).join('|');
  const words = M.routes.limiter_words.map((w) => String(w).toLowerCase());
  const limiterWord = (n) => words.some((w) => n.toLowerCase().includes(w));
  const bindings = (clause) => {
    const out = [];
    const c = clause.trim();
    const brace = c.match(/\{([^}]*)\}/);
    if (brace) for (const part of brace[1].split(',')) { const n = part.trim().split(/\s+as\s+|\s*:\s*/).pop(); if (n) out.push(n.trim()); }
    const star = c.match(/\*\s+as\s+([\w$]+)/);
    if (star) out.push(star[1]);
    const def = c.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').split(',')[0].trim();
    if (/^[\w$]+$/.test(def)) out.push(def);
    return out;
  };
  const IMPORT = /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/;
  const REQUIRE = /\b(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/;
  const listed = new RegExp(`^(?:${mods})$`);
  ls.forEach((l, i) => {
    if (!codeLine(l)) return;
    const m = l.match(IMPORT) || l.match(REQUIRE);
    if (!m) return;
    const fromList = listed.test(m[2]), relativeTree = /^\.\.?\//.test(m[2]);
    for (const n of bindings(m[1])) if (fromList || (relativeTree && limiterWord(n))) if (!names.has(n)) names.set(n, i);
  });
  // an instance made from a listed binding, and a limiter defined in this file under a limiting name
  ls.forEach((l, i) => {
    if (!codeLine(l)) return;
    const inst = l.match(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?(?:new\s+)?([\w$]+)\s*[(.]/);
    if (inst && names.has(inst[2]) && !names.has(inst[1])) names.set(inst[1], i);
    const def = l.match(/^\s*(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=)/);
    const n = def && (def[1] || def[2]);
    if (n && limiterWord(n) && !names.has(n)) names.set(n, i);
  });
  return names;
}

/** A route's signal: a limiter its registering file applies to it. @returns {Map<string, any>} */
function routeLimitSignals(ls, at, path, M) {
  const out = new Map();
  const rt = M.routes;
  const names = limiterNames(ls, M);
  if (!names.size) return out;
  const nameRe = [...names.keys()].map(esc).join('|');
  const calls = rt.limiter_calls.map((c) => esc(c.call)).join('|');
  const lines = [], markers = new Set();
  const every = at.every((i) => {
    const ext = routeExtent(ls, i, path);
    if (!ext) return false;
    let hitAt = -1, name = null;
    if (ext.express) {
      // a route argument before the handler, or a .use( on the same receiver, earlier, at the route's path
      const args = ls[i].slice(ls[i].search(EXPRESS)).replace(EXPRESS, '');
      const arg = args.match(new RegExp(`^\\s*,(?:\\s*[\\w$.]+\\s*,)*?\\s*(${nameRe})\\s*(?:[,)]|\\()`));
      if (arg) { hitAt = i; name = arg[1]; }
      else for (let j = 0; j < i && hitAt < 0; j++) {
        if (!codeLine(ls[j])) continue;
        const u = ls[j].match(new RegExp(`\\b${esc(ext.express.recv)}\\s*[.]\\s*use\\s*\\(\\s*(?:(['"\`])(\\/[^'"\`]*)\\1\\s*,\\s*)?(${nameRe})\\s*[,)(]`));
        if (u && (!u[2] || ext.express.path === u[2] || ext.express.path.startsWith(u[2].replace(/\/$/, '') + '/'))) { hitAt = j; name = u[3]; }
      }
    }
    // a limiter's refusing call inside the handler
    for (let j = ext.from; j <= ext.to && hitAt < 0; j++) {
      if (!codeLine(ls[j])) continue;
      const c = ls[j].match(new RegExp(`\\b(${nameRe})\\s*[.]\\s*(?:${calls})\\s*\\(`));
      if (c) { hitAt = j; name = c[1]; }
    }
    if (hitAt < 0) return false;
    lines.push(hitAt, names.get(name));
    markers.add(name);
    return true;
  });
  if (every) out.set(rt.question, { question: rt.question, supports: rt.supports, lines, marker: `limiter: ${[...markers].join(', ')}` });
  return out;
}

/** A soft delete in the candidate's own code: a literal statement that sets a listed column, and no hard delete beside it. */
function softDeleteSignal(ls, from, to, M) {
  const sd = M.soft_delete;
  const text = ls.slice(from, to + 1).join('\n');
  if (/\bDELETE\s+FROM\b/i.test(text)) return null;
  const cols = sd.columns.map((c) => esc(c.column)).join('|');
  const m = new RegExp(`\\bUPDATE\\s+[\\w."\`\\[\\]]+\\s+SET\\b(?:(?!\\bWHERE\\b)[^;])*?\\b(${cols})\\s*=`, 'i').exec(text);
  if (!m) return null;
  const line = from + text.slice(0, m.index + m[0].length).split('\n').length - 1;
  return { question: sd.question, supports: sd.supports, lines: [line], marker: `soft delete: ${m[1]}` };
}

// ── one candidate ───────────────────────────────────────────────────────────
// The kinds of candidate a signal is read for, by the member enumerate writes (map/SCHEMA.md §6e).
const isWorkflow = (pop, member) => pop === 'effectSites' && /\(workflow\) @ /.test(member);
const isScript = (pop, member) => (pop === 'channelCandidates' && /^(?:cli|surface): /.test(member)) || (pop === 'effectSites' && !isWorkflow(pop, member));

/**
 * The signals of one candidate: [{ question, supports, evidence: ["path:line"], marker, held_by?, what? }],
 * in the checklist's order. Read in every file the candidate's evidence cites, and kept only where
 * every one of those files states it alike: a member several files share carries a signal only where
 * each path to it does (map/SCHEMA.md §1, the paths rule).
 * @param {{ pop: string, member: string, evidence: Iterable<string> }} c
 * @param {(path: string) => string[]} read  a file's lines, by its target-relative path
 * @param {any} M  the markers (loadMarkers)
 */
export function signalsOf({ pop, member, evidence }, read, M) {
  const byFile = new Map();
  for (const e of evidence) {
    const m = String(e).match(/^(.+):(\d+)$/);
    if (!m) continue;
    if (!byFile.has(m[1])) byFile.set(m[1], []);
    byFile.get(m[1]).push(Number(m[2]) - 1);
  }
  if (!byFile.size) return [];
  const perFile = [...byFile].map(([path, at]) => {
    const ls = read(path);
    const out = new Map();
    const put = (m) => { for (const [q, s] of m) out.set(q, s); };
    if (isWorkflow(pop, member)) put(workflowSignals(ls, at, M));
    if (isScript(pop, member)) put(scriptSignals(ls, M));
    if (pop === 'routeHandlers') {
      put(routeLimitSignals(ls, at, path, M));
      const sds = at.map((i) => { const x = routeExtent(ls, i, path); return x && softDeleteSignal(ls, x.from, x.to, M); });
      if (sds.length && sds.every(Boolean)) out.set(sds[0].question, { ...sds[0], lines: sds.flatMap((s) => s.lines), marker: [...new Set(sds.map((s) => s.marker))].join(', ') });
    }
    if (pop === 'channelCandidates' && /^(?:cli|surface): /.test(member)) { const s = softDeleteSignal(ls, 0, ls.length - 1, M); if (s) out.set(s.question, s); }
    return { path, out };
  });
  const signals = [];
  for (const q of CHECKLIST_KEYS) {
    const all = perFile.map((p) => p.out.get(q));
    if (all.some((s) => !s) || all.some((s) => s.supports !== all[0].supports)) continue;
    const evidence = [...new Set(perFile.flatMap((p, k) => all[k].lines.filter((i) => i >= 0).map((i) => `${p.path}:${i + 1}`)))]
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const { held_by, what } = all[0];
    signals.push({ question: q, supports: all[0].supports, evidence, marker: [...new Set(all.map((s) => s.marker))].join('; '), ...(held_by ? { held_by, what } : {}) });
  }
  return signals;
}

/** Every error in one candidate's recorded signals, as validate reads a list (map/raw/enumerate.json). @param {any} signals @param {string} at */
export function signalShapeErrors(signals, at) {
  if (signals === undefined) return [];
  if (!Array.isArray(signals)) return [`${at}: signals must be a list`];
  const errors = [], seen = new Set();
  signals.forEach((s, i) => {
    const w = `${at}.signals[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${w}: a signal is a map ({ question, supports, evidence, marker })`); return; }
    if (!CHECKLIST_KEYS.includes(s.question)) errors.push(`${w}: question ${JSON.stringify(s.question)} is not a question of the checklist`);
    else if (seen.has(s.question)) errors.push(`${w}: a second signal on ${s.question}: one per question`);
    seen.add(s.question);
    if (!SUPPORTS.includes(s.supports)) errors.push(`${w}: supports ${JSON.stringify(s.supports)} is not one of ${SUPPORTS.join(', ')}`);
    if (!Array.isArray(s.evidence) || !s.evidence.length || !s.evidence.every((e) => typeof e === 'string' && /^.+:\d+$/.test(e))) errors.push(`${w}: evidence must be a non-empty list of path:line citations`);
    if (!nonEmpty(s.marker)) errors.push(`${w}: names the marker that read it`);
  });
  return errors;
}
