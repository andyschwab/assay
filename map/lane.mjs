#!/usr/bin/env node
// lane.mjs — a judgment scanner's review lane, filled in for one target (#201).
//
// A judgment scanner's review runs in a session a person started, and that session executes
// nothing: the deterministic phase (assay start, the routine) ran the instruments, whose output
// the review reads, and the consumer validates what the session publishes. The
// lane is the session's seed body, versioned with the engine: the adapter names it (`lane:`, a
// file beside the adapter under map/scanners/adapters/), and its frontmatter carries the session
// and artifact titles, the files the lane publishes (`outputs`) and the files it reads that ran
// before it (`inputs`). The consumer adds what is its own: the model the session runs on, and any
// authorization block its sessions open with. Nothing here names a model or an operator.
//
// Placeholders: {{NAME}} the target's public name · {{DATE}} · {{HEAD_LABEL}} and {{HEAD_STEP}}
// the head to check out · {{FOCUS}} where the budget goes · {{ASSAY_REF}} the engine the method
// is read at (this engine, by default) · {{VERIFIED_AGAINST}} the scanner's verified release ·
// {{METHOD_COMMIT}} the commit that release is, for a lane that reads its method from another
// repository (the adapter's verified_against: { release, commit }, #228; a lane that names it is
// refused a seed when the adapter pins no commit) · {{PROPERTIES}} the property the reviewer
// names on a finding of a category its adapter splits (map/placement.mjs, #306; a lane whose
// adapter splits one and that never asks is refused a seed) · {{INPUTS_STEP}} where the inputs are. A lane with inputs needs --inputs-dir: a review told to
// read results nobody said where to find is refused, never seeded.
//
// Modes (#338): a lane's frontmatter may name `modes:`, the modes it offers, `full` first (the
// default; a lane that names none offers only `full`). A mode other than full may set its own
// `<mode>_outputs`, `<mode>_passes`, `<mode>_session_title` and `<mode>_artifact`, which replace
// the plain key in that mode; the body keeps a span for one mode between `<!-- mode:<mode> -->` and
// `<!-- /mode:<mode> -->`, dropped in every other mode, and text outside every span is every mode's,
// written once. {{ARTIFACT}} is the mode's artifact title, {{OUTPUTS}} its outputs as a list, and
// {{CHECKLIST}} the checklist mode's text, rendered from map/passes.yaml (map/passes.mjs
// checklistText), never written twice. The seed carries `mode`; the run record carries it once the
// consumer records the run (`assay record <run> <scanner> ran --mode <mode>`, map/lane-mode.mjs).
//
// A lane's frontmatter may name `passes`: the built-in scanner's lane names its passes, the
// files map/project.mjs's PRACTICE_REVIEW_PASSES reads (tests/blocks/lane-list.mjs pins the two
// equal); every other lane names none.
//
// Usage: node assay.mjs lane <scanner> --name <Name> [--head <sha|branch>] [--focus <text>]
//          [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>] [--mode <mode>]
// Prints { lane, scanner, mode, title, artifact, outputs, inputs, passes, prompt } as JSON.
//        node assay.mjs lane --list [--json]
// Prints { lanes: [{ scanner, lane, outputs, inputs, passes, modes }] }, every lane unfilled.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './doctrine.mjs';
import { loadAdapters, adoptedAdapters, verifiedPin } from './project.mjs';
import { engineCommit } from './start.mjs';
import { splitCategories } from './placement.mjs';
import { checklistText } from './passes.mjs';
import { CHECKLIST_KEYS } from './effect-answers.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';

const ADAPTERS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scanners', 'adapters');
const words = (v) => String(v || '').split(/\s+/).filter(Boolean);

// the adopted judgment scanners that carry a lane, and the lane file each names
export function lanes(adapters = loadAdapters()) {
  return Object.entries(adoptedAdapters(adapters)).filter(([, a]) => a.role !== 'instrument' && a.lane).map(([id, a]) => ({ scanner: id, file: join(ADAPTERS_DIR, String(a.lane)) }));
}

// one lane file → { meta, body }
export function readLane(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no frontmatter`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.match(/^(\w+):\s*"?(.*?)"?$/)).filter(Boolean).map((x) => [x[1], x[2]]));
  return { meta, body: m[2] };
}

// the modes a lane offers (`modes:`, full first; full alone when it names none)
export const modesOf = (meta) => (words(meta.modes).length ? words(meta.modes) : ['full']);
// a frontmatter key as one mode reads it: `<mode>_<key>` in a mode other than full, else the key
const metaFor = (meta, key, mode = 'full') => (mode !== 'full' && meta[`${mode}_${key}`] !== undefined ? meta[`${mode}_${key}`] : meta[key]);
// the files a lane publishes in one mode
export const laneOutputs = (meta, mode = 'full') => words(metaFor(meta, 'outputs', mode));
// the body as one mode reads it: that mode's spans kept, every other mode's dropped
function bodyFor(body, mode, modes) {
  let out = body;
  for (const m of modes) {
    const re = new RegExp(`<!-- mode:${m} -->([\\s\\S]*?)<!-- /mode:${m} -->`, 'g');
    out = out.replace(re, (_, inner) => (m === mode ? inner : ''));
  }
  const stray = out.match(/<!-- \/?mode:([\w-]+) -->/);
  if (stray) throw new Error(`the lane body has a span for mode ${stray[1]}, which its modes: (${modes.join(', ')}) do not name, or a span left open`);
  return out;
}
// the yardstick's titles, for the checklist text's rows
function requirementTitles() {
  const reg = parseYaml(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'yardstick', 'requirements.yaml'), 'utf8'));
  return new Map((reg.requirements || []).map((d) => [d.id, d.title]));
}

// fill one lane for one target → the seed, or throws naming what is missing
export function laneSeed(scanner, { name, head = null, focus = null, assay = null, date = null, inputsDir = null, mode = 'full' } = /** @type {any} */ ({}), adapters = loadAdapters()) {
  const lane = lanes(adapters).find((l) => l.scanner === scanner);
  if (!lane) throw new Error(`no lane for ${scanner} (lanes: ${lanes(adapters).map((l) => l.scanner).join(', ') || 'none'})`);
  if (!existsSync(lane.file)) throw new Error(`adapters/${scanner}.yaml names lane ${adapters[scanner].lane}, which is not there`);
  if (!name) throw new Error('a lane is seeded for a named target (--name)');
  const { meta, body: whole } = readLane(lane.file);
  const modes = modesOf(meta);
  mode = mode || 'full';
  if (!modes.includes(mode)) throw new Error(`the ${scanner} lane offers no mode ${mode} (modes: ${modes.join(', ')})`);
  const body = bodyFor(whole, mode, modes);
  const outputs = laneOutputs(meta, mode);
  const inputs = words(meta.inputs);
  if (inputs.length && !inputsDir) throw new Error(`the ${scanner} lane reads ${inputs.join(', ')}, which ran before it: say where they are (--inputs-dir)`);
  const pin = verifiedPin(adapters[scanner]);
  const vars = {
    NAME: name,
    DATE: date || new Date().toISOString().slice(0, 10),
    ASSAY_REF: assay || engineCommit(),
    VERIFIED_AGAINST: pin.release ?? 'the latest release',
    METHOD_COMMIT: pin.commit,
    HEAD_LABEL: head ? `head ${head}` : 'the default branch',
    HEAD_STEP: head
      ? `Run \`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --depth=3000\` (bounded), then check out ${head} detached (\`git checkout -q ${head}\`, or \`git checkout -q origin/${head}\` for a branch name). If it is not reachable, say so and stop.`
      : 'Use the checkout as cloned (the default branch).',
    FOCUS: focus || 'Cover the whole tree; weight the budget toward the applications that carry the product.',
    // the categories the adapter splits by property (#306): the reviewer names one on each
    // finding of such a category, so its finding is placed by what it observes, never by nearness
    PROPERTIES: splitCategories(adapters[scanner]).map(({ category, properties }) => `Every finding in area ${category} also carries \`property:\`, exactly one of: ${properties.map((p) => `\`${p.property}\` (${p.means})`).join('; ')}. A finding that observes both is two findings; one that names neither is listed untaken, and no requirement reads it.`).join(' '),
    INPUTS_STEP: inputs.length ? `They are files under \`${inputsDir}\`, at the run's own paths: ${inputs.map((p) => `\`${p}\``).join(', ')}. A file that is not there is a result you were not given: say so, and review without it.` : '',
    OUTPUTS: outputs.map((o) => `\`${o}\``).join(', '),
  };
  // the checklist mode's text is map/passes.yaml's (#338), rendered only where the body asks for it
  if (/\{\{CHECKLIST\}\}/.test(body)) vars.CHECKLIST = checklistText({ titles: requirementTitles(), keys: CHECKLIST_KEYS });
  // an adapter that splits a category by property needs its lane to say so: a seed that never
  // asks for the property leaves every such finding unplaced
  if (splitCategories(adapters[scanner]).length && !/\{\{PROPERTIES\}\}/.test(body)) throw new Error(`adapters/${scanner}.yaml splits ${splitCategories(adapters[scanner]).map((c) => c.category).join(', ')} by property, and its lane never asks for one ({{PROPERTIES}})`);
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`${lane.file}: unknown placeholder ${k}`); if (vars[k] === null) throw new Error(`the ${scanner} lane reads its method at a pinned commit, and adapters/${scanner}.yaml verified_against names none ({ release, commit })`); return vars[k]; });
  vars.ARTIFACT = fill(metaFor(meta, 'artifact', mode) || '');
  return { lane: meta.lane || scanner, scanner, mode, title: fill(metaFor(meta, 'session_title', mode) || ''), artifact: vars.ARTIFACT, outputs, inputs, passes: words(metaFor(meta, 'passes', mode)), prompt: fill(body).replace(/ +\n/g, '\n').trim() + '\n' };
}

// every lane, unfilled: { scanner, lane, outputs, inputs, passes, modes } (`assay lane --list`); the
// outputs and passes are the full mode's
function laneList(adapters = loadAdapters()) {
  return lanes(adapters).map(({ scanner, file }) => {
    const { meta } = readLane(file);
    return { scanner, lane: meta.lane || scanner, outputs: words(meta.outputs), inputs: words(meta.inputs), passes: words(meta.passes), modes: modesOf(meta) };
  });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
  if (args[0] === '--list') {
    const list = laneList();
    if (args.includes('--json')) process.stdout.write(JSON.stringify({ lanes: list }, null, 2) + '\n');
    else for (const l of list) console.log(`${l.scanner.padEnd(18)} outputs ${l.outputs.length}, inputs ${l.inputs.join(' ') || 'none'}${l.passes.length ? `, passes ${l.passes.join(' ')}` : ''}`);
    process.exit(0);
  }
  try {
    const seed = laneSeed(args[0], { name: opt('--name'), head: opt('--head'), focus: opt('--focus'), assay: opt('--assay'), date: opt('--date'), inputsDir: opt('--inputs-dir'), mode: opt('--mode') || 'full' });
    process.stdout.write(JSON.stringify(seed, null, 2) + '\n');
  } catch (e) {
    console.error(`✗ lane: ${e.message}`);
    console.error('usage: node assay.mjs lane <scanner> --name <Name> [--head <sha|branch>] [--focus <text>] [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>] [--mode <mode>]');
    process.exit(2);
  }
}
