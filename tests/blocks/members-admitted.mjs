// ── validate refuses a census or context-list member its term does not admit (#304) ──
// A lane listed a contract finding on a context list whose term admits only artifacts and
// processes. validate passed it, the lane's own check too, and the compile then threw from
// yardstick/population.mjs ("a contract finding is not a "backlog record""). validate now reads
// each member's placement from the same source the compile does (placementError), so:
//   (a) a census member whose subject type its term refuses fails validate, naming the term and
//       the types it admits; the same member with an admitted type passes;
//   (b) a context-list member likewise;
//   (c) both are reported in the lane's own check (`validate --lane practice-review`, a scratch
//       run with no record), so a lane fixes them before it publishes.
// The census, the list and the refused type are read off the yardstick, never named by heart.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { censusTerms, contextTerms } from '../../yardstick/population.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'members-admitted';

// the plain subject types (effect and capability carry facets that place them on their own term)
const PLAIN = ['control', 'artifact', 'contract', 'process'];
const an = (w) => `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;

export async function run() {
  const fail = (m) => negFailures.push('members-admitted: ' + m);
  const reg = loadYardstick();
  const adapters = loadAdapters();
  const vocab = new Map(reg.members.map((m) => [m.term, m]));
  // a list whose term refuses one plain type and admits another
  const pick = (terms) => {
    for (const [name, term] of terms) {
      const admits = term && vocab.get(term).subject_types;
      const refused = admits && PLAIN.find((t) => !admits.includes(t));
      const admitted = admits && PLAIN.find((t) => admits.includes(t));
      if (refused && admitted) return { name, term, admits, refused, admitted };
    }
    return null;
  };
  const census = pick(censusTerms(reg)), context = pick(contextTerms(reg));
  if (!census || !context) { fail(`the yardstick has a census and a context list whose terms refuse a plain subject type (census ${!!census}, context ${!!context})`); return; }

  const scratch = mkdtempSync(join(tmpdir(), 'assay-members-admitted-'));
  const target = join(scratch, 'checkout'); mkdirSync(target);
  writeFileSync(join(target, 'README.md'), '# Demo\n\nWhat it is.\n');
  const outputs = laneSeed('practice-review', { name: 'Demo', inputsDir: 'the-run' }, adapters).outputs;
  const finding = (id, type) => `- id: ${id}\n  dimension: artifact-legibility\n  polarity: strength\n  subject_type: ${type}\n  observation: >\n    The README says what the repository is.\n  evidence: [README.md:1]\n  confidence: confirmed\n`;
  // a lane's files, F-001 a census member and F-002 a context-list member, each of the given type
  const lane = (name, { censusType, contextType, record }) => {
    const dir = join(scratch, name);
    mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
    mkdirSync(join(dir, 'map', 'raw'), { recursive: true });
    writeFileSync(join(dir, 'map', 'raw', 'enumerate.json'), JSON.stringify({ schema: 'enumerate', version: 1, target: 'checkout', files: 1, populations: { channelCandidates: [], routeHandlers: [], effectSites: [] } }));
    const censuses = ['dimensions:', '  - dimension: artifact-legibility', '    sampled:', `      - name: ${census.name}`, '        method: every member listed', '        members: [F-001]', 'context:', `  - name: ${context.name}`, '    members: [F-002]', ''].join('\n');
    for (const o of outputs) {
      const body = o.endsWith('.md') ? '# Terrain\n\nA planted target with one README.\n' : o.endsWith('effect-triage.yaml') ? 'schema: effect-triage\nversion: 1\ntriage: []\n' : o.endsWith('census-triage.yaml') ? 'schema: census-triage\nversion: 1\ncensuses: []\n' : o.endsWith('censuses.yaml') ? censuses : o.endsWith('-legibility.yaml') ? finding('F-001', censusType) + '\n' + finding('F-002', contextType) : '[]\n';
      writeFileSync(join(dir, o), body);
    }
    if (record) {
      const rows = Object.keys(adoptedAdapters(adapters)).map((id) => [`  ${id}:`, ...(id === 'practice-review' ? ['    status: ran', '    model: "a-model"'] : ['    status: skipped', '    reason: "not in this block"'])].join('\n'));
      writeFileSync(join(dir, 'map', 'scanners.yaml'), `engine: block\nscanners:\n${rows.join('\n')}\n`);
    }
    return dir;
  };
  const validate = (dir, extra) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'validate', dir, ...extra], { encoding: 'utf8' });
  const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 4).join(' | ');
  const said = (r, id, x) => r.stderr.includes(`members: ${id}: a ${x.refused} finding is not a "${x.term}" (the term admits ${x.admits.join(', ')})`);

  try {
    for (const [mode, extra, record] of [['plain', [], true], ['lane', ['--lane', 'practice-review', '--target', target], false]]) {
      const ok = validate(lane(`${mode}-ok`, { censusType: census.admitted, contextType: context.admitted, record }), extra);
      if (ok.status !== 0) fail(`(${mode}) members of types their terms admit pass (got ${ok.status}: ${bullets(ok)})`);
      // (a)
      const c = validate(lane(`${mode}-census`, { censusType: census.refused, contextType: context.admitted, record }), extra);
      if (c.status !== 1 || !said(c, 'F-001', census) || !c.stderr.includes(`map/censuses.yaml:artifact-legibility:${census.name}`)) fail(`(a, ${mode}) ${an(census.refused)} member of census ${census.name} fails validate, naming "${census.term}" and the types it admits (got ${c.status}: ${bullets(c)})`);
      // (b)
      const x = validate(lane(`${mode}-context`, { censusType: census.admitted, contextType: context.refused, record }), extra);
      if (x.status !== 1 || !said(x, 'F-002', context) || !x.stderr.includes(`map/censuses.yaml:context:${context.name}`)) fail(`(b, ${mode}) ${an(context.refused)} member of context list ${context.name} fails validate, naming "${context.term}" and the types it admits (got ${x.status}: ${bullets(x)})`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
