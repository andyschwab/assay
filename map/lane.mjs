#!/usr/bin/env node
// lane.mjs — a judgment scanner's review lane, filled in for one target (#201).
//
// A judgment scanner's review runs in a session a person started, and that session executes
// nothing: the deterministic phase (assay start, the routine) ran the instruments and each tool
// the review reads (`before_review`), and the consumer validates what the session publishes. The
// lane is the session's seed body, versioned with the engine: the adapter names it (`lane:`, a
// file beside the adapter under map/scanners/adapters/), and its frontmatter carries the session
// and artifact titles, the files the lane publishes (`outputs`) and the files it reads that ran
// before it (`inputs`). The consumer adds what is its own: the model the session runs on, and any
// authorization block its sessions open with. Nothing here names a model or an operator.
//
// Placeholders: {{NAME}} the target's public name · {{DATE}} · {{HEAD_LABEL}} and {{HEAD_STEP}}
// the head to check out · {{FOCUS}} where the budget goes · {{ASSAY_REF}} the engine the method
// is read at (this engine, by default) · {{VERIFIED_AGAINST}} the scanner's verified release ·
// {{INPUTS_STEP}} where the inputs are. A lane with inputs needs --inputs-dir: a review told to
// read results nobody said where to find is refused, never seeded.
//
// Usage: node assay.mjs lane <scanner> --name <Name> [--head <sha|branch>] [--focus <text>]
//          [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>]
// Prints { lane, scanner, title, artifact, outputs, inputs, prompt } as JSON.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './doctrine.mjs';
import { loadAdapters, adoptedAdapters } from './project.mjs';
import { engineCommit } from './start.mjs';

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

// fill one lane for one target → the seed, or throws naming what is missing
export function laneSeed(scanner, { name, head = null, focus = null, assay = null, date = null, inputsDir = null } = /** @type {any} */ ({}), adapters = loadAdapters()) {
  const lane = lanes(adapters).find((l) => l.scanner === scanner);
  if (!lane) throw new Error(`no lane for ${scanner} (lanes: ${lanes(adapters).map((l) => l.scanner).join(', ') || 'none'})`);
  if (!existsSync(lane.file)) throw new Error(`adapters/${scanner}.yaml names lane ${adapters[scanner].lane}, which is not there`);
  if (!name) throw new Error('a lane is seeded for a named target (--name)');
  const { meta, body } = readLane(lane.file);
  const inputs = words(meta.inputs);
  if (inputs.length && !inputsDir) throw new Error(`the ${scanner} lane reads ${inputs.join(', ')}, which ran before it: say where they are (--inputs-dir)`);
  const vars = {
    NAME: name,
    DATE: date || new Date().toISOString().slice(0, 10),
    ASSAY_REF: assay || engineCommit(),
    VERIFIED_AGAINST: String(adapters[scanner].verified_against ?? 'the latest release'),
    HEAD_LABEL: head ? `head ${head}` : 'the default branch',
    HEAD_STEP: head
      ? `Run \`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --depth=3000\` (bounded), then check out ${head} detached (\`git checkout -q ${head}\`, or \`git checkout -q origin/${head}\` for a branch name). If it is not reachable, say so and stop.`
      : 'Use the checkout as cloned (the default branch).',
    FOCUS: focus || 'Cover the whole tree; weight the budget toward the applications that carry the product.',
    INPUTS_STEP: inputs.length ? `They are files under \`${inputsDir}\`, at the run's own paths: ${inputs.map((p) => `\`${p}\``).join(', ')}. A file that is not there is a result you were not given: say so, and review without it.` : '',
  };
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`${lane.file}: unknown placeholder ${k}`); return vars[k]; });
  return { lane: meta.lane || scanner, scanner, title: fill(meta.session_title || ''), artifact: fill(meta.artifact || ''), outputs: words(meta.outputs), inputs, prompt: fill(body).replace(/ +\n/g, '\n').trim() + '\n' };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
  try {
    const seed = laneSeed(args[0], { name: opt('--name'), head: opt('--head'), focus: opt('--focus'), assay: opt('--assay'), date: opt('--date'), inputsDir: opt('--inputs-dir') });
    process.stdout.write(JSON.stringify(seed, null, 2) + '\n');
  } catch (e) {
    console.error(`✗ lane: ${e.message}`);
    console.error('usage: node assay.mjs lane <scanner> --name <Name> [--head <sha|branch>] [--focus <text>] [--assay <ref>] [--date YYYY-MM-DD] [--inputs-dir <path>]');
    process.exit(2);
  }
}
