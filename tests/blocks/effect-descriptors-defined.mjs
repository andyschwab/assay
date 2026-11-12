// ── no closed value without its definition: every effect descriptor value is defined by what its evidence shows (#302) ──
// The effect facet's descriptors are closed vocabularies (map/SCHEMA.md §2), and validate refuses
// any value outside them; a value with only its name leaves each lane to choose between overlapping
// ones by taste, and three blind lanes over one commit parted on gate_type, reversibility,
// blast_scope, external and telemetry for the same candidates (tests/sweeps/README.md, #302).
// So every value validate admits for reversibility, gate_type, telemetry, blast_scope and fail_mode
// has a definition entry in SCHEMA.md §1's subsection "The effect descriptors, defined", and the
// subsection defines no value validate does not admit. The values are read from validate.mjs's
// own sets, the lists the validator enforces, so the two cannot drift. The method's probes and
// the practice-review seed point at the subsection by its title.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'effect-descriptors-defined';

const TITLE = 'The effect descriptors, defined';
// the descriptor vocabularies: the field and the name of the validator's set that holds it
const VOCABS = [['reversibility', 'REVERSIBILITY'], ['gate_type', 'GATE_TYPE'], ['telemetry', 'TELEMETRY'], ['blast_scope', 'BLAST'], ['fail_mode', 'FAIL_MODE']];

// The subsection, from its heading to the next heading of its level or above.
/** @param {string} schema */
function subsection(schema) {
  const lines = schema.split('\n');
  const at = lines.findIndex((l) => l === `### ${TITLE}`);
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && /^#{1,3} /.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end);
}

// The definition entries per field: a group opens on a line starting **`<field>`**, and each
// entry is a list item (`- ` or `<n>. `) that opens with the value in backticks, an em dash, and
// the definition's text. Returns { field: { value: text } }.
/** @param {string[]} lines */
function definitions(lines) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  let field = null;
  for (const l of lines) {
    const g = l.match(/^\*\*`([a-z_]+)`\*\*/);
    if (g) { field = g[1]; out[field] = out[field] || {}; continue; }
    const e = l.match(/^(?:-|\d+\.) `([^`]+)` — (.*)$/);
    if (e && field) out[field][e[1]] = e[2].trim();
  }
  return out;
}

export async function run() {
  const fail = (m) => negFailures.push('effect-descriptors-defined: ' + m);
  const src = readFileSync(join(ROOT, 'map', 'validate.mjs'), 'utf8');
  const vocab = (name) => [...(src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const schema = readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8');
  const sub = subsection(schema);
  if (!sub) { fail(`map/SCHEMA.md has no subsection "### ${TITLE}"`); return; }
  const defs = definitions(sub);

  for (const [field, set] of VOCABS) {
    const values = vocab(set);
    if (!values.length) { fail(`map/validate.mjs has no ${set} set to read ${field}'s values from`); continue; }
    const got = defs[field];
    if (!got) { fail(`"${TITLE}" has no group for ${field} (a line opening **\`${field}\`**)`); continue; }
    for (const v of values) {
      if (!(v in got)) fail(`${field} "${v}" is a closed value with no definition in "${TITLE}"`);
      else if (got[v].length < 20) fail(`${field} "${v}"'s definition says too little to decide by: "${got[v]}"`);
    }
    for (const v of Object.keys(got)) if (!values.includes(v)) fail(`"${TITLE}" defines ${field} "${v}", which validate does not admit`);
  }

  // the method's probes and the practice-review seed send the effect pass there
  const flat = (t) => t.replace(/\s+/g, ' ');
  const method = flat(readFileSync(join(ROOT, 'map', 'METHOD.md'), 'utf8'));
  const probes = method.slice(method.indexOf('### Pass 5'), method.indexOf('### Pass 6'));
  const cites = (probes.match(new RegExp(`SCHEMA\\.md\` §1, "${TITLE}"`, 'g')) || []).length;
  if (cites < 5) fail(`METHOD.md's delegation pass points at "${TITLE}" from its probes and their introduction (5 times), found ${cites}`);
  const seed = flat(laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' }).prompt);
  if (!seed.includes(`SCHEMA.md §1, "${TITLE}", gives at that effect's evidence`)) fail(`the practice-review seed points the delegation pass's effect descriptors at SCHEMA.md §1, "${TITLE}"`);
}
