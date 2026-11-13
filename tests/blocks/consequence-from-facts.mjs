// ── every fix-sequence item records its consequence, from the facts of what the code can do (#319, slice 2) ──
// A severity label states a conclusion without its facts. On four real runs labels overstated
// consequence (one instrument's template-expansion "High", seventeen times) and made the order hang
// on which tool spoke. Every item now records its CONSEQUENCE on a closed, ordered scale (severe ·
// significant · contained · cosmetic): the consequence policy, held as data (yardstick/consequence.yaml,
// or the operator's file the run record names), applied to facts from closed lists, the effect a gap
// is or touches, whether it is an unheld halt, the live chain that carries it, and the tier, tags and
// floor of the row it bears on, by map/consequence.mjs. A label is read by no rule; a contested fact
// reads its riskier value; a lane's judgment may raise, never lower. Pinned over slice 1's fixture
// (confidence-on-every-item) plus:
//   F-060  an unheld halt: irreversible, external, no gate, reaching the fleet          practice review
//   F-991  a scanner's "High" template expansion in a workflow, explained by           instrument row
//   F-061  the effect it touches: internal, reversible, run by a maintainer (insider)   practice review
//   F-992  the same expansion reported "Low", touching the same effect                  instrument row
//   F-062, F-063  one channel recorded user in one finding and tenant in the other     practice review
//   F-053  carries a lane's judgment below its facts (cosmetic); F-054 one above (severe)
// Held:
//   (a) every item in sequence.json carries a consequence of the scale, its rule one of the policy's
//       (or the engine's lane-judgment) firing at that value, read off one of its findings, with every
//       fact of the closed list; an item with none fails this block's own check;
//   (b) the unheld halt reaching the fleet reads severe, by unheld-halt;
//   (c) the "High" template expansion is not severe: its facts are internal, reversible and
//       maintainer-triggered, and its label decided nothing; the "Low" twin reads the same, and
//       swapping or dropping every label in the run moves no consequence;
//   (d) the lane's judgment below the facts is refused and recorded; the one above is applied, by
//       lane-judgment, citing the policy rule the facts gave;
//   (e) the contested blast_scope reads tenant on both findings and says so; a sweep set that parts
//       on a channel raises it the same way, naming the set;
//   (f) a legibility-tier gap with no effect is valued by legibility-row;
//   (g) a policy naming a fact outside the closed list refuses to load, and a run whose record
//       names it halts its handoff and fails validate;
//   (h) a policy that values no rule for some gap halts the sequence: no item gets a consequence
//       without its rule;
//   (i) compile --consequence-policy records the operator's file and digest in the run record, the
//       values move to its rules, sequence.json names it, and a file changed since is refused;
//   (j) renaming every scanner, with its adapter and run-record row, moves no consequence;
//   (k) START-HERE renders each item's consequence in one phrase beside its confidence, and
//       REMEDIATION its rule, facts, contest and judgment;
//   (l) the order is #318's: the slice-1 fixture's items sit in the order consequence did not touch;
//   (m) lib/run-data.mjs restates the scale, the facts and the engine's rules as map/consequence.mjs
//       states them, and checkSequence refuses a consequence that does not hold its shape.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { writeConfidenceFixture } from './confidence-on-every-item.mjs';
import { buildSequence } from '../../views/improve/sequence.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { CONSEQUENCE, FACT_NAMES, ENGINE_RULES, consequenceIndex, consequenceOf, loadPolicy, loadConsequenceContext, checkPolicy, DEFAULT_POLICY, sha256 } from '../../map/consequence.mjs';
import { setConsequencePolicy } from '../../map/record.mjs';
import { checkSequence, SEQUENCE_CONSEQUENCE, SEQUENCE_CONSEQUENCE_FACTS, SEQUENCE_CONSEQUENCE_ENGINE_RULES } from '../../lib/run-data.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'consequence-from-facts';

const effect = (o) => Object.entries(o).map(([k, v]) => `    ${k}: ${v}`).join('\n');
const pr = (id, extra) => `- id: ${id}\n  dimension: delegation\n${extra}\n`;
const ZIZMOR = (id, severity) => `- id: ${id}\n  source: zizmor\n  native_id: "template-injection@.github/workflows/ci.yml:12"\n  native_category: template-injection\n  polarity: gap\n  severity: ${severity}\n  observation: >\n    The release workflow expands the dispatch input's version into a run: script.\n  evidence: [".github/workflows/ci.yml:12"]\n  fix: >\n    Pass the input through an env: variable and quote it in the script.\n`;

// the fixture: slice 1's run, plus the patterns above
export function writeConsequenceFixture(dir) {
  writeConfidenceFixture(dir);
  const del = join(dir, 'map', 'findings', 'practice-review-delegation.yaml');
  let text = readFileSync(del, 'utf8')
    .replace('- id: F-053\n', '- id: F-053\n  judged_consequence:\n    value: cosmetic\n    because: "the backup service is the team\'s own account"\n')
    .replace('- id: F-054\n', '- id: F-054\n  judged_consequence:\n    value: severe\n    because: "every note write in the product goes through this path"\n');
  text += [
    pr('F-060', `  polarity: gap\n  subject_type: effect\n  confidence: confirmed\n  observation: "A release job publishes the package every consumer installs, with no approval step."\n  evidence: [".github/workflows/release.yml:20"]\n  preconditions: [stolen-credential]\n  effect:\n${effect({ channel: 'package-publish', reversibility: 'irreversible', external: true, gate_type: 'none', telemetry: 'structured-event', blast_scope: 'fleet' })}`),
    pr('F-061', `  polarity: fact\n  subject_type: effect\n  confidence: confirmed\n  observation: "A maintainer's dispatch runs the release script against the team's own staging checkout."\n  evidence: [".github/workflows/ci.yml:12"]\n  preconditions: [insider]\n  explained_by: [F-991, F-992]\n  effect:\n${effect({ channel: 'ci-dispatch', reversibility: 'reversible', external: false, gate_type: 'initiated-by-person', fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'tenant' })}`),
    pr('F-062', `  polarity: gap\n  subject_type: effect\n  confidence: confirmed\n  severity: Low\n  observation: "Exporting notes writes a file and logs nothing."\n  evidence: ["lib/export.mjs:4"]\n  fix: "Record each export as a structured event."\n  effect:\n${effect({ channel: 'note-export', reversibility: 'reversible', external: false, gate_type: 'none', telemetry: 'none', blast_scope: 'user' })}`),
    pr('F-063', `  polarity: gap\n  subject_type: effect\n  confidence: confirmed\n  severity: Low\n  observation: "The workspace export writes every member's notes and logs nothing."\n  evidence: ["lib/export.mjs:30"]\n  fix: "Record each workspace export as a structured event."\n  effect:\n${effect({ channel: 'note-export', reversibility: 'reversible', external: false, gate_type: 'none', telemetry: 'none', blast_scope: 'tenant' })}`),
  ].join('');
  writeFileSync(del, text);
  writeFileSync(join(dir, 'map', 'findings', 'zizmor.yaml'), ZIZMOR('F-991', 'High') + ZIZMOR('F-992', 'Low').replace('ci.yml:12"\n  native_category', 'ci.yml:14"\n  native_category'));
  const rec = join(dir, 'map', 'scanners.yaml');
  writeFileSync(rec, readFileSync(rec, 'utf8').replace(/  zizmor:\n    status: skipped\n    reason: "[^"]*"\n/, '  zizmor:\n    status: ran\n'));
}

const handoff = (dir, extra = []) => spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), dir, ...extra], { encoding: 'utf8' });
const itemOf = (doc, id) => doc.sequence.find((s) => s.findings.includes(id));
// the block's own check of (a): every item carries a consequence of the scale, by a rule of the policy
// it names firing at that value (or the engine's judgment rule), read off one of its findings
export function itemsWithoutRule(doc, policy) {
  return doc.sequence.filter((s) => {
    const c = s.consequence;
    if (!c || !CONSEQUENCE.includes(c.value) || !s.findings.includes(c.finding)) return true;
    if (!c.facts || JSON.stringify(Object.keys(c.facts)) !== JSON.stringify(FACT_NAMES)) return true;
    if (c.rule === 'lane-judgment') return !(c.judgment && c.judgment.applied && CONSEQUENCE.indexOf(c.judgment.value) < CONSEQUENCE.indexOf(c.judgment.facts_value));
    const r = policy.rules.find((x) => x.name === c.rule);
    return !r || r.at_least !== c.value;
  });
}

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-consequence-from-facts');
  try {
    writeConsequenceFixture(tmp);
    const h = handoff(tmp);
    if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); return; }
    const doc = JSON.parse(readFileSync(join(tmp, 'handoff', 'sequence.json'), 'utf8'));
    const start = readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8');
    const rem = readFileSync(join(tmp, 'handoff', 'REMEDIATION.md'), 'utf8');
    const yardstick = loadYardstick();
    const policy = loadPolicy(DEFAULT_POLICY, yardstick);

    // (a) every item: a value of the scale, by a named rule firing at it; an item with none fails
    for (const s of itemsWithoutRule(doc, policy)) fail(`item ${s.n} (${s.findings.join('+')}) must carry a consequence from a rule of the policy firing at its value (got ${JSON.stringify(s.consequence)})`);
    const stripped = { ...doc, sequence: doc.sequence.map((s, i) => (i === 0 ? { ...s, consequence: undefined } : s)) };
    if (itemsWithoutRule(stripped, policy).length !== 1) fail('an item with no consequence must fail the every-item check');
    if (doc.policy?.file !== 'yardstick/consequence.yaml' || doc.policy?.sha256 !== policy.sha256) fail(`sequence.json names the default policy it read, with its digest (got ${JSON.stringify(doc.policy)})`);

    // the engine, gap by gap
    const adapters = loadAdapters();
    const { projected } = projectMulti(loadFindings(tmp), adapters);
    const decided = decideProjected(projected, loadDecisions(tmp), '');
    const measurement = projectRun(tmp, yardstick);
    const ctx = loadConsequenceContext(tmp, { yardstick });
    const idx = consequenceIndex({ decided, measurement, yardstick, context: ctx });
    const pOf = (id) => decided.find((p) => p.f.id === id);
    const cOf = (id, i = idx) => consequenceOf(pOf(id), i);

    // (b) the unheld halt reaching the fleet: the top value, by the halt rule
    const halt = cOf('F-060');
    if (halt.value !== CONSEQUENCE[0] || halt.rule !== 'unheld-halt' || halt.facts.halt !== true || halt.facts.blast_scope !== 'fleet') fail(`an unheld halt on an irreversible external effect reaching the fleet reads ${CONSEQUENCE[0]} by unheld-halt (got ${JSON.stringify(halt)})`);
    if (itemOf(doc, 'F-060')?.consequence?.value !== CONSEQUENCE[0]) fail(`the item holding the fleet halt reads ${CONSEQUENCE[0]} (got ${JSON.stringify(itemOf(doc, 'F-060')?.consequence)})`);

    // (c) the label decides nothing
    const high = cOf('F-991');
    const low = cOf('F-992');
    if (high.value === CONSEQUENCE[0]) fail(`a "High" template expansion whose facts are internal, reversible and maintainer-triggered is not ${CONSEQUENCE[0]} (got ${JSON.stringify(high)})`);
    if (high.effect !== 'F-061' || high.facts.external !== false || high.facts.reversibility !== 'reversible' || high.facts.trigger !== 'high') fail(`the expansion reads the facts of the effect it touches, F-061: internal, reversible, an insider's to trigger (got ${JSON.stringify(high)})`);
    if (low.value !== high.value || low.rule !== high.rule || JSON.stringify(low.facts) !== JSON.stringify(high.facts)) fail(`the same facts reported "Low" read what the "High" reads (High ${JSON.stringify(high)}, Low ${JSON.stringify(low)})`);
    const VALUES = (ps, i) => ps.filter((p) => p.f.polarity === 'gap').map((p) => `${p.f.id}=${consequenceOf(p, i).value}/${consequenceOf(p, i).rule}`).join(' ');
    const before = VALUES(decided, idx);
    for (const [why, relabel] of [['every label swapped', (s) => ({ High: 'Low', Low: 'High', Medium: 'Critical', Nit: 'Blocker' }[s] || 'High')], ['every label dropped', () => undefined]]) {
      const dec = decided.map((p) => ({ ...p, f: { ...p.f, severity: relabel(p.f.severity) } }));
      const after = VALUES(dec, consequenceIndex({ decided: dec, measurement, yardstick, context: ctx }));
      if (after !== before) fail(`with ${why}, no consequence moves (was ${before}; now ${after})`);
    }

    // (d) a lane's judgment: refused below the facts, applied above them, citing the rule
    const down = cOf('F-053');
    if (down.value !== CONSEQUENCE[0] || down.rule !== 'unheld-halt' || down.judgment?.applied !== false || down.judgment?.value !== 'cosmetic' || !/never lower/.test(down.judgment?.refused || '')) fail(`a judgment below the facts is refused and recorded (got ${JSON.stringify(down)})`);
    const up = cOf('F-054');
    if (up.value !== 'severe' || up.rule !== 'lane-judgment' || up.judgment?.applied !== true || up.judgment?.facts_rule !== 'working-tier-row' || up.judgment?.facts_value !== 'contained') fail(`a judgment above the facts is applied by lane-judgment, citing the rule the facts gave (got ${JSON.stringify(up)})`);
    if (itemOf(doc, 'F-054')?.consequence?.rule !== 'lane-judgment') fail(`the item holding the raised gap carries the judgment (got ${JSON.stringify(itemOf(doc, 'F-054')?.consequence)})`);

    // (e) a contested blast_scope reads the riskier value, and says so
    for (const id of ['F-062', 'F-063']) {
      const c = cOf(id);
      const x = (c.contested || []).find((y) => y.fact === 'blast_scope');
      if (c.facts.blast_scope !== 'tenant' || !x || x.read !== 'tenant' || JSON.stringify(x.values) !== JSON.stringify(['tenant', 'user']) || !x.where.includes('run')) fail(`${id}: a blast_scope the run records user and tenant reads tenant, marked contested (got ${JSON.stringify(c)})`);
    }
    if ((cOf('F-060').contested || []).length) fail('an effect no one contests carries no contest');
    const swept = consequenceIndex({ decided, measurement, yardstick, context: { ...ctx, sweepContest: [{ set: 'a-set', byKey: new Map([['package-publish', { blast_scope: new Set(['cross-tenant']) }]]) }] } });
    const sc = cOf('F-060', swept);
    const sx = (sc.contested || []).find((y) => y.fact === 'blast_scope');
    if (sc.facts.blast_scope !== 'cross-tenant' || !sx || !sx.where.includes('sweep set a-set') || sx.values[0] !== 'cross-tenant') fail(`a blast_scope a named sweep set parts on reads its riskier value, naming the set (got ${JSON.stringify(sc)})`);

    // (f) a legibility-tier gap with no effect, by its tier rule
    const readme = yardstick.requirements.find((d) => d.tier === 'legibility' && !(d.tags || []).includes('floor'));
    const leg = { f: { id: 'F-993', polarity: 'gap', subject_type: 'artifact', observation: 'The README names a command the tree does not have.', evidence: ['README.md:3'] }, source: 'practice-review', state: 'open' };
    const legIdx = consequenceIndex({ decided: [...decided, leg], measurement: [...measurement, { id: readme.id, status: 'unmet', findings: ['F-993'] }], yardstick, context: ctx });
    const lc = consequenceOf(leg, legIdx);
    if (lc.rule !== 'legibility-row' || lc.value !== 'cosmetic' || lc.facts.tier !== 'legibility' || lc.facts.reversibility !== null) fail(`a legibility-tier gap with no effect is valued by legibility-row (got ${JSON.stringify(lc)})`);

    // (g) a policy rule naming a fact outside the closed list refuses to load
    const off = { schema: 'assay.consequence-policy', version: 1, rules: [{ name: 'by-label', says: 'reads a severity label', when: { severity: 'High' }, at_least: 'severe' }, { name: 'any', says: 'any gap', when: {}, at_least: 'cosmetic' }] };
    if (!checkPolicy(off, yardstick).some((p) => /"severity", which is not a fact/.test(p))) fail(`a rule naming a fact outside the closed list is refused (got ${JSON.stringify(checkPolicy(off, yardstick))})`);
    for (const bad of [{ when: { blast_scope: 'planet' } }, { at_least: 'critical' }, { name: 'lane-judgment' }]) {
      const doc2 = { ...off, rules: [{ ...off.rules[1], ...bad }] };
      if (!checkPolicy(doc2, yardstick).length) fail(`the policy rule ${JSON.stringify(doc2.rules[0])} is refused`);
    }
    const opDir = join(tmp, 'operator');
    mkdirSync(opDir, { recursive: true });
    const offFile = join(opDir, 'by-label.yaml');
    writeFileSync(offFile, 'schema: assay.consequence-policy\nversion: 1\nrules:\n  - name: by-label\n    says: reads a severity label\n    when: { severity: High }\n    at_least: severe\n');
    let threw = '';
    try { loadPolicy(offFile, yardstick); } catch (e) { threw = e.message; }
    if (!/severity/.test(threw)) fail(`loading a policy that names a fact outside the closed list throws, naming it (got ${JSON.stringify(threw)})`);
    const recPath = join(tmp, 'map', 'scanners.yaml');
    const recText = readFileSync(recPath, 'utf8');
    writeFileSync(recPath, setConsequencePolicy(recText, { file: offFile, sha256: sha256(readFileSync(offFile, 'utf8')) }));
    const hOff = handoff(tmp);
    if (hOff.status === 0 || !/CONSEQUENCE POLICY REFUSED[\s\S]*severity/.test(hOff.stderr)) fail(`a run whose record names that policy halts its handoff (exit ${hOff.status}: ${hOff.stderr.slice(0, 300)})`);
    const vOff = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    if (!/consequence_policy[\s\S]*severity/.test(vOff.stdout + vOff.stderr)) fail(`validate refuses a run record naming that policy (got ${(vOff.stdout + vOff.stderr).slice(-400)})`);
    writeFileSync(recPath, recText);

    // (h) no rule, no value: a policy that values no rule for some gap halts the sequence
    const partial = { ...policy, rules: policy.rules.filter((r) => r.name !== 'any-open-gap') };
    threw = '';
    try { buildSequence({ decided, adapters, roadmap: [], measurement, yardstick, context: { consequence: { ...ctx, policy: partial } } }); } catch (e) { threw = e.message; }
    if (!/no consequence rule applies/.test(threw)) fail(`a gap no rule values halts the sequence (got ${JSON.stringify(threw)})`);
    const partialFile = join(opDir, 'partial.yaml');
    writeFileSync(partialFile, readFileSync(DEFAULT_POLICY, 'utf8').replace(/  - name: any-open-gap\n[\s\S]*$/, ''));
    writeFileSync(recPath, setConsequencePolicy(recText, { file: partialFile, sha256: sha256(readFileSync(partialFile, 'utf8')) }));
    const hPartial = handoff(tmp);
    if (hPartial.status === 0 || !/no consequence rule applies/.test(hPartial.stderr)) fail(`the handoff halts on a gap its policy does not value (exit ${hPartial.status}: ${hPartial.stderr.slice(0, 300)})`);
    writeFileSync(recPath, recText);

    // (i) the operator's policy, named for the run with compile, recorded in the run record
    const run2 = join(tmp, 'notesbox');
    cpSync(join(ROOT, 'tests', 'fixtures', 'notesbox'), run2, { recursive: true });
    const opFile = join(opDir, 'everything-contained.yaml');
    writeFileSync(opFile, 'schema: assay.consequence-policy\nversion: 1\nrules:\n  - name: everything-contained\n    says: this operator reads every open gap as contained\n    when: {}\n    at_least: contained\n');
    const c1 = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', run2], { encoding: 'utf8' });
    const defDoc = c1.status === 0 ? JSON.parse(readFileSync(join(run2, 'handoff', 'sequence.json'), 'utf8')) : null;
    const c2 = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', run2, '--consequence-policy', opFile], { encoding: 'utf8' });
    if (!defDoc || c2.status !== 0) fail(`compile with and without --consequence-policy must succeed (exit ${c1.status}, ${c2.status}: ${(c1.stderr + c2.stderr).slice(-400)})`);
    else {
      const opDoc = JSON.parse(readFileSync(join(run2, 'handoff', 'sequence.json'), 'utf8'));
      const record = parseYaml(readFileSync(join(run2, 'map', 'scanners.yaml'), 'utf8'));
      if (record.consequence_policy?.file !== opFile || record.consequence_policy?.sha256 !== sha256(readFileSync(opFile, 'utf8'))) fail(`the run record names the operator's policy and its digest (got ${JSON.stringify(record.consequence_policy)})`);
      if (opDoc.policy?.file !== opFile) fail(`sequence.json names the operator's policy (got ${JSON.stringify(opDoc.policy)})`);
      if (!opDoc.sequence.every((s) => s.consequence.value === 'contained' && s.consequence.rule === 'everything-contained')) fail('every value moves to the operator\'s rule');
      if (JSON.stringify(defDoc.sequence.map((s) => s.consequence.value)) === JSON.stringify(opDoc.sequence.map((s) => s.consequence.value))) fail('swapping in the operator\'s policy changes the values');
      if (JSON.stringify(defDoc.sequence.map((s) => s.findings)) !== JSON.stringify(opDoc.sequence.map((s) => s.findings))) fail('the operator\'s policy moves no item: the order does not read consequence in this slice');
      const c3 = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', run2], { encoding: 'utf8' });
      const again = c3.status === 0 ? JSON.parse(readFileSync(join(run2, 'handoff', 'sequence.json'), 'utf8')) : null;
      if (again?.policy?.file !== opFile) fail(`a later compile of the run reads the policy its record names (got ${JSON.stringify(again && again.policy)})`);
      if ((readFileSync(join(run2, 'map', 'scanners.yaml'), 'utf8').match(/^consequence_policy:/gm) || []).length !== 1) fail('naming the policy again replaces the record, never adds a second');
      writeFileSync(opFile, readFileSync(opFile, 'utf8').replace('contained\n    says', 'contained\n    says').replace('at_least: contained', 'at_least: severe'));
      const c4 = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), run2], { encoding: 'utf8' });
      if (c4.status === 0 || !/changed since the run record named it/.test(c4.stderr)) fail(`a policy file changed since the record named it is refused (exit ${c4.status}: ${c4.stderr.slice(0, 300)})`);
    }

    // (j) renaming every scanner moves no consequence
    const rename = (name) => {
      const ads = Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k) }]));
      const dec = decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } }));
      return buildSequence({ decided: dec, adapters: ads, roadmap: [], measurement, yardstick, context: { consequence: ctx } }).seq.map((s) => `${s.ps.map((p) => p.f.id).sort().join('+')}=${s.consequence.value}/${s.consequence.rule}`).join(' ');
    };
    const asIs = rename((s) => s);
    for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`])
      if (rename(name) !== asIs) fail(`renaming the scanners must not move any consequence (was ${asIs}, renamed ${rename(name)})`);

    // (k) START-HERE and REMEDIATION render it
    const lines = (start.split('## Sequence')[1] || '').split('\n').filter((l) => /^\d+\. /.test(l));
    if (lines.length !== doc.sequence.length) fail(`START-HERE lists every item (got ${lines.length} of ${doc.sequence.length})`);
    lines.forEach((l, i) => {
      const c = doc.sequence[i]?.consequence;
      if (!c || !l.includes(`; consequence ${c.value} (`)) fail(`START-HERE item ${i + 1} renders its consequence beside its confidence (got ${l.slice(0, 220)})`);
    });
    if (!/consequence significant \([a-z-]+; blast_scope contested\)/.test(start) && !/consequence [a-z]+ \([a-z-]+; blast_scope contested\)/.test(start)) fail('START-HERE says a fact was contested');
    if (!/consequence severe \(lane judgment over working-tier-row\)/.test(start)) fail('START-HERE names the rule a lane\'s judgment raised over');
    const consLines = rem.match(/^_Consequence: .*$/gm) || [];
    if (consLines.length !== doc.sequence.length) fail(`REMEDIATION renders a consequence line under every item (got ${consLines.length} of ${doc.sequence.length})`);
    if (!/blast_scope contested \(tenant vs user, by run\), read as tenant/.test(rem)) fail('REMEDIATION states the contest');
    if (!/a lane's judgment of cosmetic was refused/.test(rem)) fail('REMEDIATION states the refused judgment');

    // (l) the order is the key's: consequence moves no item
    const ordered = buildSequence({ decided, adapters, roadmap: [], measurement, yardstick, context: { consequence: { ...ctx, policy: { ...policy, rules: [{ name: 'flat', says: 'flat', when: {}, at_least: 'cosmetic' }] } } } }).seq;
    const asSeq = buildSequence({ decided, adapters, roadmap: [], measurement, yardstick, context: { consequence: ctx } }).seq;
    if (ordered.map((s) => s.ps[0].f.id).join(' ') !== asSeq.map((s) => s.ps[0].f.id).join(' ')) fail('the order does not read consequence in this slice: a flat policy and the default give one order');

    // (m) the restatement, and the schema refusing a malformed consequence
    if (JSON.stringify(SEQUENCE_CONSEQUENCE) !== JSON.stringify(CONSEQUENCE)) fail(`lib/run-data.mjs SEQUENCE_CONSEQUENCE must be map/consequence.mjs's scale (got ${SEQUENCE_CONSEQUENCE.join(', ')})`);
    if (JSON.stringify(SEQUENCE_CONSEQUENCE_FACTS) !== JSON.stringify(FACT_NAMES)) fail('lib/run-data.mjs SEQUENCE_CONSEQUENCE_FACTS must be map/consequence.mjs FACTS');
    if (JSON.stringify(SEQUENCE_CONSEQUENCE_ENGINE_RULES) !== JSON.stringify(ENGINE_RULES.map((r) => r.name))) fail('lib/run-data.mjs SEQUENCE_CONSEQUENCE_ENGINE_RULES must be map/consequence.mjs ENGINE_RULES');
    if (checkSequence(doc).length) fail(`checkSequence must admit the written sequence (got ${checkSequence(doc).join('; ')})`);
    const one = itemOf(doc, 'F-060');
    const docWith = (c) => ({ ...doc, sequence: doc.sequence.map((s) => (s === one ? { ...s, consequence: c } : s)) });
    for (const bad of [{ ...one.consequence, value: 'critical' }, { ...one.consequence, rule: 'a-rule-no-policy-has' }, { ...one.consequence, finding: 'F-1' },
      { ...one.consequence, facts: { halt: true } }, { ...one.consequence, contested: [{ fact: 'blast_scope', values: ['tenant', 'user'], read: 'user', where: ['run'] }] }, { ...one.consequence, contested: [{ fact: 'tier', values: ['safety', 'custody'], read: 'safety', where: ['run'] }] },
      { ...one.consequence, rule: 'lane-judgment' }, { ...one.consequence, judgment: { value: 'cosmetic', because: 'x', applied: true, facts_value: 'severe', facts_rule: 'unheld-halt' } }])
      if (!checkSequence(docWith(bad)).length) fail(`checkSequence must refuse the consequence ${JSON.stringify(bad).slice(0, 160)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
