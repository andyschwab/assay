#!/usr/bin/env node
// legibility-bar.mjs — the questions of the checklist d-effect-facts-legible reads (#338;
// yardstick/README.md, "An effect's facts, legible"; the data in yardstick/legibility-bar.yaml).
//
// A not-determinable answer is two things at once: a fact about the target (the tree states the
// effect's fact nowhere a reader finds it) and noise about assay (the question's wording admits two
// readings, #337). They are kept apart by a stated bar held in data: a question is read against a
// target only when blind lanes answer it alike across targets, its agreement pooled over the
// committed blind sweep sets whose runs answer the checklist, at or above `bar`, compared on at
// least `targets_at_least` distinct targets. This module:
//   • checks the file's shape and its own consistency (checkBarDoc), and loads it (loadBar),
//     failing loud: a bar that does not read never reads as "every question qualifies";
//   • computes the figures from per-set answer agreement (barFromSets), pure, so a test can state
//     its own sets; map/variance.mjs legibilityBarFromSets feeds it the committed sets;
//   • names every place the file disagrees with the figures (barDisagreements); the recompute over
//     the committed sets is yardstick/legibility-bar-check.mjs, its own entry so this module, which
//     the measurement imports, imports nothing of the variance it is computed from.
// Nothing here names a scanner or a target (CLAUDE.md rules 6 and 7).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { CHECKLIST_KEYS } from '../map/effect-answers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BAR_FILE = join(HERE, 'legibility-bar.yaml');
const SWEEPS_DIR = join(HERE, '..', 'tests', 'sweeps');
const SCHEMA = 'assay.legibility-bar';
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const pct = (agree, of) => (of ? Math.round(100 * agree / of) : 0);

/** Every problem with a bar document: its shape, and each entry consistent with the bar it states. @param {any} doc @returns {string[]} */
export function checkBarDoc(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['the bar must be a map: { schema, version, bar, bar_reason, targets_at_least, targets_reason, sets, questions, below_bar, per_target_drops, none_qualify? }'];
  if (doc.schema !== SCHEMA) e.push(`schema must be ${SCHEMA} (got ${JSON.stringify(doc.schema)})`);
  if (doc.version !== 1) e.push(`version must be 1 (got ${JSON.stringify(doc.version)})`);
  const known = ['schema', 'version', 'bar', 'bar_reason', 'targets_at_least', 'targets_reason', 'sets', 'questions', 'below_bar', 'per_target_drops', 'none_qualify'];
  for (const k of Object.keys(doc)) if (!known.includes(k)) e.push(`unknown key "${k}" (${known.join(', ')})`);
  if (typeof doc.bar !== 'number' || !(doc.bar > 0 && doc.bar <= 100)) e.push('bar must be a percentage above 0 and at most 100 (a bar of 0 would read every question)');
  if (!nonEmpty(doc.bar_reason)) e.push('bar_reason must say why the bar is where it is');
  if (!Number.isInteger(doc.targets_at_least) || doc.targets_at_least < 2) e.push('targets_at_least must be an integer of 2 or more: agreement on one target cannot tell its ambiguity from the question\'s wording');
  if (!nonEmpty(doc.targets_reason)) e.push('targets_reason must say why that many targets');
  for (const k of ['sets', 'questions', 'below_bar', 'per_target_drops']) if (!Array.isArray(doc[k])) e.push(`${k} must be a list ([] when empty)`);
  if (e.length) return e;
  const setNames = new Set();
  doc.sets.forEach((s, i) => {
    const at = `sets[${i}]`;
    if (!s || typeof s !== 'object' || !nonEmpty(s.set) || !nonEmpty(s.target) || !nonEmpty(s.reason)) e.push(`${at}: a set is { set, target, reason }`);
    else if (setNames.has(s.set)) e.push(`${at}: ${s.set} listed twice`);
    else setNames.add(s.set);
  });
  const seen = new Set();
  /** @type {[string, boolean][]} */
  const lists = [['questions', true], ['below_bar', false]];
  for (const [list, qualifies] of lists) doc[list].forEach((q, i) => {
    const at = `${list}[${i}]${q && q.question ? ` (${q.question})` : ''}`;
    if (!q || typeof q !== 'object') { e.push(`${at}: an entry is { question, agreement, agree, of, targets, sets, per_target, reason }`); return; }
    if (!CHECKLIST_KEYS.includes(q.question)) e.push(`${at}: ${JSON.stringify(q.question)} is not a question of the checklist (${CHECKLIST_KEYS.join(', ')})`);
    else if (seen.has(q.question)) e.push(`${at}: ${q.question} is listed twice`);
    seen.add(q.question);
    for (const k of ['agreement', 'agree', 'of']) if (!Number.isInteger(q[k]) || q[k] < 0) e.push(`${at}: ${k} must be a whole number`);
    if (Number.isInteger(q.agree) && Number.isInteger(q.of) && (q.agree > q.of || q.agreement !== pct(q.agree, q.of))) e.push(`${at}: agreement ${q.agreement} is not ${q.agree} of ${q.of}`);
    if (!Array.isArray(q.targets) || !q.targets.every(nonEmpty)) e.push(`${at}: targets must list the targets the figure was compared on`);
    if (!Array.isArray(q.sets) || !q.sets.length || !q.sets.every(nonEmpty)) e.push(`${at}: sets must list the sweep sets the figure rests on`);
    else for (const s of q.sets) if (!setNames.has(s)) e.push(`${at}: rests on ${s}, which sets: does not list`);
    if (!nonEmpty(q.reason)) e.push(`${at}: reason must say why it ${qualifies ? 'qualifies' : 'does not'}`);
    // the pooled figure's parts, one per target it was compared on, beside it (never in its place)
    if (!Array.isArray(q.per_target) || !q.per_target.length) e.push(`${at}: per_target must give the figure on each target it was compared on: [{ target, agreement, agree, of }]`);
    else {
      const ts = new Set();
      q.per_target.forEach((t, j) => {
        const w = `${at}: per_target[${j}]`;
        if (!t || typeof t !== 'object' || !nonEmpty(t.target)) { e.push(`${w}: an entry is { target, agreement, agree, of }`); return; }
        if (ts.has(t.target)) e.push(`${w}: ${t.target} listed twice`); ts.add(t.target);
        if (Array.isArray(q.targets) && !q.targets.includes(t.target)) e.push(`${w}: ${t.target} is not among the targets the figure was compared on`);
        for (const k of ['agreement', 'agree', 'of']) if (!Number.isInteger(t[k]) || t[k] < 0) e.push(`${w}: ${k} must be a whole number`);
        if (Number.isInteger(t.agree) && Number.isInteger(t.of) && (t.agree > t.of || t.agreement !== pct(t.agree, t.of))) e.push(`${w}: agreement ${t.agreement} is not ${t.agree} of ${t.of}`);
      });
      if (Array.isArray(q.targets) && q.targets.some((t) => !ts.has(t))) e.push(`${at}: per_target must give every target the figure was compared on (${q.targets.join(', ')})`);
      const sum = (k) => q.per_target.reduce((n, t) => n + (Number.isInteger(t && t[k]) ? t[k] : 0), 0);
      if (Number.isInteger(q.agree) && Number.isInteger(q.of) && (sum('agree') !== q.agree || sum('of') !== q.of)) e.push(`${at}: per_target sums to ${sum('agree')} of ${sum('of')}, the pooled figure is ${q.agree} of ${q.of}`);
    }
    const clears = Number.isInteger(q.agreement) && q.agreement >= doc.bar && Array.isArray(q.targets) && new Set(q.targets).size >= doc.targets_at_least;
    if (qualifies && !clears) e.push(`${at}: listed as qualifying, but ${q.agreement}% over ${new Set(q.targets || []).size} target(s) does not clear the bar (${doc.bar}% over ${doc.targets_at_least})`);
    if (!qualifies && clears) e.push(`${at}: listed below the bar, but ${q.agreement}% over ${new Set(q.targets).size} target(s) clears it (${doc.bar}% over ${doc.targets_at_least})`);
  });
  // the questions a per-target rule would drop: each qualifying question below the bar on some target
  const under = (q) => Array.isArray(q && q.per_target) && q.per_target.some((t) => t && Number.isInteger(t.agreement) && t.agreement < doc.bar);
  const drops = new Set((doc.per_target_drops || []).filter((x) => typeof x === 'string'));
  for (const x of doc.per_target_drops || []) if (!doc.questions.some((q) => q && q.question === x)) e.push(`per_target_drops: ${JSON.stringify(x)} is no qualifying question`);
  for (const q of doc.questions) if (q && q.question) {
    if (under(q) && !drops.has(q.question)) e.push(`per_target_drops: ${q.question} is below the bar (${doc.bar}%) on a target, and is not listed`);
    if (!under(q) && drops.has(q.question)) e.push(`per_target_drops: ${q.question} clears the bar on every target, and is listed`);
  }
  if (!doc.questions.length && !nonEmpty(doc.none_qualify)) e.push('none_qualify must say why no question qualifies when questions is empty');
  if (doc.questions.length && doc.none_qualify !== undefined) e.push('none_qualify is said only when no question qualifies');
  return e;
}

/**
 * One run's reading of one candidate on one question (yardstick/README.md, "An effect's facts,
 * legible"): `legible` where a signal the list records answers the question, or the run answers it yes
 * or no with its evidence; `gap` where the run answers it not-determinable; `unread` where the answer is
 * not in the checklist's form. d-effect-facts-legible reads a run by it, and map/variance.mjs compares
 * runs by it, so the row and its repeatability read one rule.
 * @param {any} answers the candidate's answers in the run's triage @param {any[]} signals the signals the run's list records on it @param {string} q
 * @returns {'legible' | 'gap' | 'unread'}
 */
export function factLegibility(answers, signals, q) {
  if ((Array.isArray(signals) ? signals : []).some((x) => x && x.question === q)) return 'legible';
  const a = answers && typeof answers === 'object' ? answers[q] : undefined;
  if (a && (a.answer === 'yes' || a.answer === 'no') && Array.isArray(a.evidence) && a.evidence.length) return 'legible';
  return a && a.answer === 'not-determinable' ? 'gap' : 'unread';
}

/** The bar, read and checked; throws naming every problem (fail loud). @param {string} [file] */
export function loadBar(file = BAR_FILE) {
  if (!existsSync(file)) throw new Error(`legibility bar ${file} does not exist`);
  let doc;
  try { doc = parseYaml(readFileSync(file, 'utf8')); } catch (err) { throw new Error(`legibility bar ${file} does not parse: ${err.message}`); }
  const problems = checkBarDoc(doc);
  if (problems.length) throw new Error(`legibility bar ${file} refused:\n  ${problems.join('\n  ')}`);
  return { file, doc, bar: doc.bar, targetsAtLeast: doc.targets_at_least, qualifying: doc.questions.map((q) => q.question), noneQualify: doc.none_qualify || null };
}

/**
 * The figures from per-set answer agreement. sets: one { set, target, blind, compared, byAnswer }
 * per sweep set, byAnswer map/variance.mjs candidateAgreement's answers.byAnswer and compared its
 * answers.compared. A set counts only when it is blind and its runs answer at least one candidate:
 * an authored set's agreement is no reader's, and a set with no answers measures no question.
 * Per question: agree and of summed over the sets that compared it, the targets it was compared on.
 * @param {any[]} sets @param {{ bar: number, targetsAtLeast: number }} opts
 */
export function barFromSets(sets, { bar, targetsAtLeast }) {
  const used = sets.filter((s) => s && s.blind === true && s.compared > 0);
  const rows = [];
  for (const k of CHECKLIST_KEYS) {
    const on = used.filter((s) => s.byAnswer && s.byAnswer[k] && s.byAnswer[k].of > 0);
    if (!on.length) continue;
    const agree = on.reduce((n, s) => n + s.byAnswer[k].agree, 0), of = on.reduce((n, s) => n + s.byAnswer[k].of, 0);
    const targets = [...new Set(on.map((s) => s.target))].sort();
    const agreement = pct(agree, of);
    // the same figure on each target alone, beside the pooled one: computed, never typed
    const per_target = targets.map((t) => {
      const ts = on.filter((s) => s.target === t);
      const a = ts.reduce((n, s) => n + s.byAnswer[k].agree, 0), o = ts.reduce((n, s) => n + s.byAnswer[k].of, 0);
      return { target: t, agreement: pct(a, o), agree: a, of: o };
    });
    rows.push({ question: k, agreement, agree, of, targets, sets: on.map((s) => s.set).sort(), per_target, qualifies: agreement >= bar && targets.length >= targetsAtLeast });
  }
  const questions = rows.filter((r) => r.qualifies);
  return {
    sets: used.map((s) => ({ set: s.set, target: s.target })).sort((a, b) => a.set.localeCompare(b.set)),
    questions,
    below_bar: rows.filter((r) => !r.qualifies),
    // the pooled rule stands; a rule that held the bar on every target would drop these (the owner's
    // decision, read from the numbers, never this file's)
    per_target_drops: questions.filter((r) => r.per_target.some((t) => t.agreement < bar)).map((r) => r.question),
  };
}

/** Every place the file disagrees with the computed figures. @param {any} doc @param {ReturnType<typeof barFromSets>} computed @returns {string[]} */
export function barDisagreements(doc, computed) {
  const out = [];
  const want = (xs) => new Map(xs.map((x) => [x.set ?? x.question, x]));
  const fileSets = want(doc.sets || []), gotSets = want(computed.sets);
  for (const [s, x] of gotSets) if (!fileSets.has(s)) out.push(`sets: ${s} (${x.target}) is a blind answered set the file does not list`);
  else if (fileSets.get(s).target !== x.target) out.push(`sets: ${s} is over ${x.target}, the file says ${fileSets.get(s).target}`);
  for (const s of fileSets.keys()) if (!gotSets.has(s)) out.push(`sets: ${s} is listed, and is no committed blind set whose runs answer the checklist`);
  /** @type {[string, any[]][]} */
  const lists = [['questions', computed.questions], ['below_bar', computed.below_bar]];
  for (const [list, got] of lists) {
    const file = want(doc[list] || []), have = want(got);
    for (const [q, x] of have) {
      const f = file.get(q);
      if (!f) { out.push(`${list}: ${q} computes ${x.agreement}% (${x.agree} of ${x.of}) over ${x.targets.length} target(s) and the file does not list it there`); continue; }
      for (const k of ['agreement', 'agree', 'of']) if (f[k] !== x[k]) out.push(`${list}: ${q} ${k} is ${x[k]}, the file says ${f[k]}`);
      for (const k of ['targets', 'sets']) if (JSON.stringify([...(f[k] || [])].sort()) !== JSON.stringify(x[k])) out.push(`${list}: ${q} ${k} are ${x[k].join(', ')}, the file says ${(f[k] || []).join(', ')}`);
      const fileT = new Map((Array.isArray(f.per_target) ? f.per_target : []).filter((t) => t && t.target).map((t) => [t.target, t]));
      for (const t of x.per_target) {
        const ft = fileT.get(t.target);
        if (!ft) { out.push(`${list}: ${q} computes ${t.agreement}% (${t.agree} of ${t.of}) on ${t.target} and the file gives no per_target figure for it`); continue; }
        for (const k of ['agreement', 'agree', 'of']) if (ft[k] !== t[k]) out.push(`${list}: ${q} on ${t.target} ${k} is ${t[k]}, the file says ${ft[k]}`);
      }
      for (const t of fileT.keys()) if (!x.per_target.some((y) => y.target === t)) out.push(`${list}: ${q} gives a per_target figure on ${t}, which the committed sets do not compare it on`);
    }
    for (const q of file.keys()) if (!have.has(q)) out.push(`${list}: ${q} is listed, and the committed sets give it no figure there`);
  }
  const fileDrops = [...(doc.per_target_drops || [])].sort(), gotDrops = [...computed.per_target_drops].sort();
  if (JSON.stringify(fileDrops) !== JSON.stringify(gotDrops)) out.push(`per_target_drops: a per-target rule would drop ${gotDrops.join(', ') || 'no question'}, the file says ${fileDrops.join(', ') || 'none'}`);
  return out;
}

/** The committed sweep sets, by directory. */
export function committedSets(dir = SWEEPS_DIR) {
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SWEEP.yaml'))).map((d) => join(dir, d.name)).sort();
}
