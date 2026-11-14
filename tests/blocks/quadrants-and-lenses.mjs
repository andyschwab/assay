// ── every sequence item sits in a quadrant by a stated rule, and the order is a named lens (#319, slice 3) ──
// Every fix-sequence item records its confidence (#320) and its consequence (#322). One total order
// over those, by one key, kept putting a contained, not-measured item and unvalued items above
// significant, confirmed ones, and grouping hid a known misfire inside a confirmed item. Now each
// item sits in a QUADRANT, consequence against confidence, by rules stated once
// (views/improve/quadrants.mjs QUADRANT_RULES), or in none when its consequence is unvalued; and the
// order handed on is a named LENS over the quadrants, held as data (views/lenses.yaml), the key of
// #318 its tie-break inside a quadrant. Pinned over the four-patterns fixture (consequence-from-facts)
// plus a reviewer Blocker no requirement takes (F-995), and a variant whose healthcheck misfire is
// grouped with two confirmed container findings sharing one fix. Held:
//   (a) the four real-run patterns land on the facts alone: the release-path High in act now, the
//       fresh-clone refusal in verify first, the platform-inapplicable healthcheck in park, and the
//       template expansion in no quadrant, listed as not valued with its consequence's reason;
//   (b) no item has a quadrant without its rule: each item's quadrant is the first rule's that takes
//       its two recorded values, and an unvalued item has none; an item stripped of its rule fails
//       this block's own check; a value outside its scale has no quadrant (quadrantOf throws);
//   (c) no dimension is combined into a number: the quadrant of every pair of the two scales is the
//       rule table's, a function of the two values alone (any other field of the item moves nothing),
//       and neither quadrants.mjs nor lens.mjs sums, multiplies or weights a scale's position;
//   (d) a grouped item holding a misfire among confirmed gaps keeps its worst gap's value and shows
//       the mix ("2 confirmed, 1 known misfire") in sequence.json, START-HERE and REMEDIATION;
//   (e) the unvalued Blocker is named at the head of the not-valued list in START-HERE and in
//       sequence.json's not_valued_head; swapped to Low it leaves the head, and no item's confidence,
//       consequence or quadrant, and no quadrant's members or order, moves;
//   (f) the default lens, risk-first, gives START-HERE's order: sequence.json is the key's order
//       grouped act now, verify first, hygiene, park, then not valued, START-HERE lists that order
//       and leads with the act-now items; a second lens reorders without changing any item's
//       dimensions or quadrant; hygiene-sprint says what it leaves out, by quadrant;
//   (g) an operator's lens file named with compile --lens-file is recorded in the run record with its
//       digest, sequence.json names it, a later compile reads it, and once the file changes it is
//       refused; a lens naming an unknown quadrant or tie-break refuses to load;
//   (h) renaming every scanner, with its adapter, changes no quadrant;
//   (i) lib/run-data.mjs restates the quadrants and their rules as views/improve/quadrants.mjs states
//       them, and checkSequence refuses a quadrant that is not its rule's, an unvalued item with one,
//       a mix that does not count the item's own value, and a malformed lens.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { writeConsequenceFixture } from './consequence-from-facts.mjs';
import { buildSequence, buildRoadmap, HEAD_LABELS } from '../../views/improve/sequence.mjs';
import { QUADRANTS, QUADRANT_RULES, NOT_VALUED, quadrantOf } from '../../views/improve/quadrants.mjs';
import { loadLens, checkLenses, TIE_BREAKS, sha256 } from '../../views/improve/lens.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { loadConfidenceContext, CONFIDENCE } from '../../map/confidence.mjs';
import { loadConsequenceContext, CONSEQUENCE, UNVALUED } from '../../map/consequence.mjs';
import { setLens } from '../../map/record.mjs';
import { prosePath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { checkSequence, SEQUENCE_QUADRANTS, SEQUENCE_NOT_VALUED, SEQUENCE_QUADRANT_RULES, SEQUENCE_HEAD_LABELS } from '../../lib/run-data.mjs';

export const label = 'quadrants-and-lenses';

// The run's items in the order of #318's key (views/improve/sequence.mjs KEY), read as the handoff
// reads the run: the tie-break inside a quadrant. The order blocks that pin the key read it here.
export function keyOrderOf(dir) {
  const adapters = loadAdapters();
  const { projected } = projectMulti(loadFindings(dir), adapters);
  const decided = decideProjected(projected, loadDecisions(dir), '');
  const yardstick = loadYardstick();
  const measurement = projectRun(dir, yardstick);
  const prose = existsSync(prosePath(dir)) ? parseYaml(readFileSync(prosePath(dir), 'utf8')) || {} : {};
  const { roadmap } = buildRoadmap(prose.roadmap, new Map(decided.map((p) => [p.f.id, p])));
  const context = { ...loadConfidenceContext(dir), consequence: loadConsequenceContext(dir, { yardstick }) };
  return buildSequence({ decided, adapters, roadmap, measurement, yardstick, context }).keyOrder;
}
// `keyIds` (an order of item keys) grouped by the risk-first lens's quadrants in order, the key's
// order kept inside each: the order sequence.json must hold under the default lens. `quadrantOfKey`
// gives an item key's quadrant value (null when not valued).
export function riskFirstOf(keyIds, quadrantOfKey) {
  const lens = loadLens();
  const groups = [...lens.quadrants, ...(lens.not_valued === 'last' ? [null] : [])];
  return groups.flatMap((q) => keyIds.filter((k) => (quadrantOfKey(k) ?? null) === q));
}

const ROW = (id, severity, extra = '') => `- id: ${id}\n  source: deep-code-review\n  native_id: "R${id.slice(2)}"\n  native_category: C\n  polarity: gap\n  severity: ${severity}\n  confidence: confirmed\n  title: "The assistant follows instructions found in a stored note"\n  observation: "The assistant follows instructions found in a stored note."\n  evidence: ["server.mjs:1"]\n  fix: "Treat note text as data in the prompt."\n${extra}`;
// the fixture: the four patterns, plus a reviewer Blocker no requirement takes
export function writeQuadrantFixture(dir, blockerLabel = 'Blocker') {
  writeConsequenceFixture(dir);
  const p = join(dir, 'map', 'findings', 'deep-code-review.yaml');
  writeFileSync(p, readFileSync(p, 'utf8') + ROW('F-995', blockerLabel));
}
const CONTAINER = (id, check) => `- id: ${id}\n  source: checkov\n  native_id: "${check}@Dockerfile.\\/@Dockerfile"\n  native_category: dockerfile\n  polarity: gap\n  severity: Medium\n  observation: >\n    Container check ${check} fails in Dockerfile:1.\n  evidence: ["Dockerfile:1"]\n  fix: >\n    Change the Dockerfile so it passes the container checks.\n`;

const handoff = (dir) => spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), dir], { encoding: 'utf8' });
const compile = (dir, extra = []) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'compile', dir, ...extra], { encoding: 'utf8' });
const readDoc = (dir) => JSON.parse(readFileSync(join(dir, 'handoff', 'sequence.json'), 'utf8'));
const readMd = (dir, f) => readFileSync(join(dir, 'handoff', f), 'utf8');
const itemOf = (doc, id) => doc.sequence.find((s) => s.findings.includes(id));
const keyOf = (s) => s.findings.join('+');
const dims = (s) => JSON.stringify({ confidence: s.confidence.value, confidenceRule: s.confidence.rule, consequence: s.consequence.value, consequenceRule: s.consequence.rule, quadrant: s.quadrant });
// the block's own check of (b): every item's quadrant is the first rule's that takes its two
// recorded values, or none when its consequence is unvalued
export function itemsWithoutQuadrantRule(doc) {
  return doc.sequence.filter((s) => {
    const q = s.quadrant;
    if (!s.consequence || !s.confidence) return true;
    if (s.consequence.value === UNVALUED) return q !== null;
    if (!q) return true;
    const r = QUADRANT_RULES.find((x) => x.confidence.includes(s.confidence.value) && x.consequence.includes(s.consequence.value));
    return !r || r.name !== q.rule || r.quadrant !== q.value;
  });
}
// START-HERE's numbered lines under Sequence, as the item keys they name
const startOrder = (start, doc) => (start.split('## Sequence')[1] || '').split('\n').filter((l) => /^\d+\. /.test(l))
  .map((l) => { const n = Number(l.match(/^(\d+)\./)[1]); const s = doc.sequence.find((x) => x.n === n); return s && s.findings.every((id) => l.includes(id)) ? keyOf(s) : `?${n}`; });

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-quadrants-and-lenses');
  try {
    rmSync(tmp, { recursive: true, force: true });
    const run1 = join(tmp, 'four');
    writeQuadrantFixture(run1);
    // (c) a function of the two values alone, never a number over them
    const TABLE = {
      'known-misfire': { severe: 'park', significant: 'park', contained: 'park', cosmetic: 'park' },
      'not-measured': { severe: 'verify-first', significant: 'verify-first', contained: 'verify-first', cosmetic: 'verify-first' },
      confirmed: { severe: 'act-now', significant: 'act-now', contained: 'hygiene', cosmetic: 'hygiene' },
      judged: { severe: 'verify-first', significant: 'verify-first', contained: 'park', cosmetic: 'park' },
      'absent-evidence': { severe: 'verify-first', significant: 'verify-first', contained: 'park', cosmetic: 'park' },
    };
    for (const c of CONFIDENCE) {
      for (const k of CONSEQUENCE) {
        const got = quadrantOf({ value: c, rule: 'x', finding: 'F-1', reason: 'r', mix: { [c]: 9 } }, { value: k, rule: 'y', facts: { halt: true } });
        const bare = quadrantOf({ value: c }, { value: k });
        if (got?.value !== TABLE[c][k] || JSON.stringify(got) !== JSON.stringify(bare)) fail(`confidence ${c} with consequence ${k} sits in ${TABLE[c][k]}, by the two values alone (got ${JSON.stringify(got)} and ${JSON.stringify(bare)})`);
      }
      if (quadrantOf({ value: c }, { value: UNVALUED }) !== null) fail(`confidence ${c} with an unvalued consequence sits in no quadrant`);
    }
    for (const r of QUADRANT_RULES) if (!r.confidence.every((v) => CONFIDENCE.includes(v)) || !r.consequence.every((v) => CONSEQUENCE.includes(v))) fail(`rule ${r.name} lists values of the two scales, never a threshold or a number`);
    const SCORE = /indexOf\([^)]*\)\s*[-+*/]\s*[A-Za-z_.]*indexOf\(|\b(score|weight)\w*\s*[=:(]|\b(score|weight)s?\b\s*\+=/i;
    for (const f of ['views/improve/quadrants.mjs', 'views/improve/lens.mjs']) {
      const code = readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      if (SCORE.test(code)) fail(`${f} sums, multiplies or weights a position on the scales (${code.match(SCORE)[0]})`);
    }

    // (a), in the engine before any view: the template expansion's item sits in no quadrant
    const inEngine = keyOrderOf(run1).find((s) => s.ps.some((p) => p.f.id === 'F-991'));
    if (!inEngine || inEngine.quadrant !== null || inEngine.consequence.value !== UNVALUED) fail(`the template expansion sits in no quadrant: its consequence is unvalued (the engine gave ${JSON.stringify(inEngine && inEngine.quadrant)})`);
    const h = handoff(run1);
    if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); return; }
    const doc = readDoc(run1);
    const start = readMd(run1, 'START-HERE.md');
    const rem = readMd(run1, 'REMEDIATION.md');

    // (a) the four real-run patterns, on the facts alone
    const refusal = doc.sequence.find((s) => s.confidence.rule === 'adapter-declared-not-measured');
    const want = [
      ['the release-path High', itemOf(doc, 'F-1001'), 'act-now', 'high-stake-confirmed'],
      ['the fresh-clone refusal', refusal, 'verify-first', 'not-measured-verifies-first'],
      ['the platform-inapplicable healthcheck', itemOf(doc, 'F-990'), 'park', 'known-misfire-parks'],
    ];
    for (const [what, s, q, rule] of want) if (!s || s.quadrant?.value !== q || s.quadrant?.rule !== rule) fail(`${what} sits in ${q} by ${rule} (got ${JSON.stringify(s && s.quadrant)})`);
    const tmpl = itemOf(doc, 'F-991');
    if (!tmpl || tmpl.quadrant !== null || tmpl.consequence.value !== UNVALUED) fail(`the template expansion sits in no quadrant: its consequence is unvalued (got ${JSON.stringify(tmpl && { quadrant: tmpl.quadrant, consequence: tmpl.consequence.value })})`);
    const notValuedBlock = (start.split('### Not valued')[1] || '').split('\n### ')[0];
    if (!tmpl || !notValuedBlock.includes('`F-991') || !notValuedBlock.includes(`consequence not valued: ${tmpl.consequence.reason}`)) fail('START-HERE lists the template expansion as not valued, with the reason its consequence carries');

    // (b) no quadrant without its rule; an unvalued item has none
    for (const s of itemsWithoutQuadrantRule(doc)) fail(`item ${s.n} (${keyOf(s)}) must sit in the quadrant its rule gives, or none when unvalued (got ${JSON.stringify(s.quadrant)})`);
    const stripped = { ...doc, sequence: doc.sequence.map((s) => (s.n === 1 ? { ...s, quadrant: { value: s.quadrant.value, rule: null } } : s)) };
    if (itemsWithoutQuadrantRule(stripped).length !== 1) fail('an item whose quadrant names no rule fails the every-item check');
    const placed = { ...doc, sequence: doc.sequence.map((s) => (s === tmpl ? { ...s, quadrant: { value: 'hygiene', rule: 'low-stake-confirmed' } } : s)) };
    if (itemsWithoutQuadrantRule(placed).length !== 1) fail('an unvalued item given a quadrant fails the every-item check');
    for (const [c, k] of [['confirmed', 'critical'], ['certain', 'severe'], [null, 'severe']]) {
      let threw = false;
      try { quadrantOf(c === null ? null : { value: c }, { value: k }); } catch { threw = true; }
      if (!threw) fail(`a value outside its scale has no quadrant (confidence ${c}, consequence ${k})`);
    }

    // (e) the unvalued Blocker, at the head of the not-valued list
    const blocker = doc.not_valued_head.find((x) => x.finding === 'F-995');
    if (!blocker || blocker.label !== 'Blocker' || !blocker.reason || itemOf(doc, 'F-995')?.quadrant !== null) fail(`sequence.json names the unvalued Blocker at the head of the not-valued list, with its reason (got ${JSON.stringify(doc.not_valued_head)})`);
    const headAt = notValuedBlock.indexOf('Labelled Blocker');
    const firstItem = notValuedBlock.search(/^\d+\. /m);
    if (headAt < 0 || (firstItem > -1 && headAt > firstItem) || !/- `F-995` \(Blocker, as its source labels it; item \d+\): not valued, /.test(notValuedBlock)) fail(`START-HERE opens the not-valued list with the Blocker, named, its label shown as the source's (got ${notValuedBlock.slice(0, 500)})`);
    const run2 = join(tmp, 'low');
    writeQuadrantFixture(run2, 'Low');
    const h2 = handoff(run2);
    if (h2.status !== 0) fail(`handoff.mjs must compile the relabelled fixture (exit ${h2.status}): ${h2.stderr.slice(0, 400)}`);
    else {
      const low = readDoc(run2);
      const lowStart = readMd(run2, 'START-HERE.md');
      if (low.not_valued_head.some((x) => x.finding === 'F-995') || /`F-995` \(Blocker/.test(lowStart) || /Labelled/.test(lowStart)) fail(`swapped to Low, F-995 leaves the head of the not-valued list (got ${JSON.stringify(low.not_valued_head)})`);
      const byKey = (d) => new Map(d.sequence.map((s) => [keyOf(s), dims(s)]));
      const a = byKey(doc), b = byKey(low);
      if (a.size !== b.size || [...a].some(([k, v]) => b.get(k) !== v)) fail(`swapping the label moves no item's confidence, consequence or quadrant (${[...a].filter(([k, v]) => b.get(k) !== v).map(([k]) => k).join(', ') || 'item count'})`);
      for (const q of QUADRANTS) {
        const inQ = (d) => d.sequence.filter((s) => s.quadrant?.value === q).map(keyOf).join(' ');
        if (inQ(doc) !== inQ(low)) fail(`swapping the label leaves ${q}'s items and their order (was ${inQ(doc)}, now ${inQ(low)})`);
      }
      const nv = (d) => d.sequence.filter((s) => !s.quadrant).map(keyOf).sort().join(' ');
      if (nv(doc) !== nv(low)) fail('swapping the label leaves the not-valued list\'s members');
    }

    // (f) the default lens gives START-HERE's order
    if (doc.lens?.name !== 'risk-first' || doc.lens?.file !== 'views/lenses.yaml' || doc.lens?.sha256 !== sha256(readFileSync(join(ROOT, 'views', 'lenses.yaml'), 'utf8'))) fail(`sequence.json names the default lens, its file and digest (got ${JSON.stringify(doc.lens)})`);
    const keyIds = keyOrderOf(run1).map((s) => s.ps.map((p) => p.f.id).join('+'));
    const qOf = new Map(doc.sequence.map((s) => [keyOf(s), s.quadrant ? s.quadrant.value : null]));
    const expected = riskFirstOf(keyIds, (k) => qOf.get(k));
    const got = doc.sequence.map(keyOf);
    if (got.join(' ') !== expected.join(' ')) fail(`under risk-first, sequence.json is the key's order grouped act now, verify first, hygiene, park, not valued: ${expected.join(' ')} (got ${got.join(' ')})`);
    if (startOrder(start, doc).join(' ') !== got.join(' ')) fail(`START-HERE lists sequence.json's order (got ${startOrder(start, doc).join(' ')})`);
    const actNow = doc.sequence.filter((s) => s.quadrant?.value === 'act-now');
    const lead = (start.split('\n## Act now')[1] || '').split('\n## ')[0];
    const leadIds = (lead.match(/^- \*\*\d+\. .*$/gm) || []).map((l) => Number(l.match(/^- \*\*(\d+)\./)[1]));
    if (start.indexOf('\n## Act now') < 0 || start.indexOf('\n## Act now') > start.indexOf('\n## What the sequence does NOT include') || leadIds.join(' ') !== actNow.map((s) => s.n).join(' ')) fail(`START-HERE leads with the act-now items as a short list (got ${leadIds.join(' ')}, want ${actNow.map((s) => s.n).join(' ')})`);
    for (const q of [...QUADRANTS, 'not-valued']) {
      const n = doc.sequence.filter((s) => (q === 'not-valued' ? !s.quadrant : s.quadrant?.value === q)).length;
      const word = { 'act-now': 'Act now', 'verify-first': 'Verify first', hygiene: 'Hygiene', park: 'Park', 'not-valued': 'Not valued' }[q];
      if (!start.includes(`### ${word} (${n})`)) fail(`START-HERE's quadrant view shows ${word} with its count, ${n}`);
    }
    // a second lens reorders, and moves no dimension
    for (const [name, quads, nv] of [['verification-plan', ['verify-first', 'act-now'], false], ['hygiene-sprint', ['hygiene'], false]]) {
      const runL = join(tmp, name);
      cpSync(run1, runL, { recursive: true });
      const l = loadLens('views/lenses.yaml', name);
      const rec = join(runL, 'map', 'scanners.yaml');
      writeFileSync(rec, setLens(readFileSync(rec, 'utf8'), { name, file: 'views/lenses.yaml', sha256: l.sha256 }));
      const hl = handoff(runL);
      if (hl.status !== 0) { fail(`the handoff compiles under ${name} (exit ${hl.status}): ${hl.stderr.slice(0, 300)}`); continue; }
      const d = readDoc(runL);
      if (d.lens?.name !== name) fail(`sequence.json names the lens ${name} the run record names (got ${JSON.stringify(d.lens)})`);
      const wantOrder = quads.flatMap((q) => expected.filter((k) => qOf.get(k) === q));
      if (d.sequence.map(keyOf).join(' ') !== wantOrder.join(' ')) fail(`${name} orders ${wantOrder.join(' ')} (got ${d.sequence.map(keyOf).join(' ')})`);
      if (d.sequence.map(keyOf).join(' ') === got.join(' ')) fail(`${name} reorders the sequence`);
      const base = new Map(doc.sequence.map((s) => [keyOf(s), dims(s)]));
      for (const s of d.sequence) if (base.get(keyOf(s)) !== dims(s)) fail(`${name} moves no dimension or quadrant of ${keyOf(s)} (was ${base.get(keyOf(s))}, now ${dims(s)})`);
      const outQ = [...QUADRANTS.filter((q) => !quads.includes(q)), ...(nv ? [] : ['not-valued'])];
      const wantOut = outQ.map((q) => ({ quadrant: q, findings: doc.sequence.filter((s) => (q === 'not-valued' ? !s.quadrant : s.quadrant?.value === q)).flatMap((s) => s.findings) })).filter((x) => x.findings.length);
      if (JSON.stringify(d.left_out) !== JSON.stringify(wantOut)) fail(`${name} says what it leaves out, by quadrant (got ${JSON.stringify(d.left_out)}, want ${JSON.stringify(wantOut)})`);
      const nOut = wantOut.reduce((a, x) => a + doc.sequence.filter((s) => s.findings.some((id) => x.findings.includes(id))).length, 0);
      if (!readMd(runL, 'START-HERE.md').includes(`leaves out ${nOut} item`)) fail(`${name}'s START-HERE counts the ${nOut} items it leaves out`);
      if (!readMd(runL, 'START-HERE.md').includes('`F-995` (Blocker, as its source labels it; left out by this lens)')) fail(`${name} still names the unvalued Blocker where a reader looks first`);
      if (checkSequence(d).length) fail(`checkSequence admits the ${name} sequence (got ${checkSequence(d).join('; ')})`);
    }

    // (d) a misfire grouped among confirmed gaps shows the mix
    const run3 = join(tmp, 'mix');
    writeQuadrantFixture(run3);
    writeFileSync(join(run3, 'map', 'findings', 'checkov.yaml'), CONTAINER('F-990', 'CKV_DOCKER_2') + CONTAINER('F-996', 'CKV_DOCKER_3') + CONTAINER('F-997', 'CKV_DOCKER_7'));
    const h3 = handoff(run3);
    if (h3.status !== 0) fail(`handoff.mjs must compile the grouped fixture (exit ${h3.status}): ${h3.stderr.slice(0, 400)}`);
    else {
      const d = readDoc(run3);
      const g = itemOf(d, 'F-990');
      if (!g || g.findings.length !== 3 || g.confidence.value !== 'confirmed' || JSON.stringify(g.confidence.mix) !== JSON.stringify({ confirmed: 2, 'known-misfire': 1 })) fail(`the grouped item keeps its worst gap's value and carries its mix, 2 confirmed and 1 known misfire (got ${JSON.stringify(g && { findings: g.findings, confidence: g.confidence })})`);
      else {
        if (g.quadrant?.value !== quadrantOf(g.confidence, g.consequence)?.value) fail('the grouped item sits in the quadrant its own values give');
        if (!g.consequence.mix || Object.values(g.consequence.mix).reduce((a, n) => a + n, 0) !== 3) fail(`the grouped item counts its three gaps' consequences (got ${JSON.stringify(g.consequence.mix)})`);
        const line = (readMd(run3, 'START-HERE.md').split('## Sequence')[1] || '').split('\n').find((l) => l.startsWith(`${g.n}. `)) || '';
        if (!line.includes('of its gaps: 2 confirmed, 1 known misfire')) fail(`START-HERE shows the grouped item's mix (got ${line.slice(0, 300)})`);
        const sect = (readMd(run3, 'REMEDIATION.md').split(`\n## ${g.n}. `)[1] || '').split('\n## ')[0];
        if (!sect.includes('of its gaps: 2 confirmed, 1 known misfire')) fail(`REMEDIATION shows the grouped item's mix (got ${sect.slice(0, 400)})`);
        const single = itemOf(d, 'F-1001');
        if (/of its gaps/.test((readMd(run3, 'START-HERE.md').split('\n').find((l) => l.startsWith(`${single.n}. `)) || ''))) fail('an item whose gaps hold one value renders no mix');
      }
    }

    // (g) an operator's lens file, recorded with its digest; a lens naming what is not on the closed lists refuses
    const run4 = join(tmp, 'notesbox');
    cpSync(join(ROOT, 'tests', 'fixtures', 'notesbox'), run4, { recursive: true });
    const opDir = join(tmp, 'op');
    mkdirSync(opDir, { recursive: true });
    const opFile = join(opDir, 'lenses.yaml');
    writeFileSync(opFile, 'schema: assay.lenses\nversion: 1\ndefault: stakes-first\nlenses:\n  - name: stakes-first\n    says: this operator reads hygiene before anything else\n    quadrants: [hygiene, act-now, verify-first, park]\n    not_valued: last\n    tie_break: consequence\n');
    const c1 = compile(run4, ['--lens-file', opFile]);
    if (c1.status !== 0) fail(`compile --lens-file must succeed (exit ${c1.status}): ${(c1.stderr || c1.stdout).slice(-400)}`);
    else {
      const record = parseYaml(readFileSync(join(run4, 'map', 'scanners.yaml'), 'utf8'));
      if (record.lens?.name !== 'stakes-first' || record.lens?.file !== opFile || record.lens?.sha256 !== sha256(readFileSync(opFile, 'utf8'))) fail(`the run record names the operator's lens, its file and digest (got ${JSON.stringify(record.lens)})`);
      const d = readDoc(run4);
      if (d.lens?.name !== 'stakes-first' || d.lens?.file !== opFile || d.lens?.sha256 !== record.lens?.sha256) fail(`sequence.json names the operator's lens (got ${JSON.stringify(d.lens)})`);
      const firstQ = d.sequence[0]?.quadrant?.value;
      if (d.sequence.some((s) => s.quadrant?.value === 'hygiene') && firstQ !== 'hygiene') fail(`the operator's lens orders hygiene first (got ${firstQ})`);
      const c2 = compile(run4);
      if (c2.status !== 0 || readDoc(run4).lens?.name !== 'stakes-first') fail(`a later compile reads the lens the run record names (exit ${c2.status})`);
      writeFileSync(opFile, readFileSync(opFile, 'utf8').replace('tie_break: consequence', 'tie_break: finding-id'));
      const c3 = handoff(run4);
      if (c3.status === 0 || !/changed since the run record named it/.test(c3.stderr)) fail(`a lens file changed since the record named it is refused (exit ${c3.status}: ${c3.stderr.slice(0, 300)})`);
      const c4 = compile(run4, ['--lens', 'risk-first']);
      if (c4.status !== 0 || readDoc(run4).lens?.name !== 'risk-first' || (readFileSync(join(run4, 'map', 'scanners.yaml'), 'utf8').match(/^lens:/gm) || []).length !== 1) fail(`compile --lens names a built-in lens, replacing the record, never adding a second (exit ${c4.status})`);
    }
    for (const [what, text] of [['an unknown quadrant', '[act-now, do-later]'], ['an unknown tie-break', '[act-now]\n    tie_break: severity-label']]) {
      const bad = join(opDir, 'bad.yaml');
      writeFileSync(bad, `schema: assay.lenses\nversion: 1\ndefault: bad\nlenses:\n  - name: bad\n    says: x\n    not_valued: last\n    quadrants: ${text}${text.includes('tie_break') ? '' : '\n    tie_break: sequence-key'}\n`);
      let refused = '';
      try { loadLens(bad); } catch (e) { refused = e.message; }
      if (!/refused/.test(refused)) fail(`a lens naming ${what} refuses to load (got ${refused || 'loaded'})`);
      const cb = compile(run4, ['--lens-file', bad]);
      if (cb.status === 0 || !/lens refused/.test(cb.stderr)) fail(`compile --lens-file refuses a lens naming ${what} (exit ${cb.status})`);
    }
    if (checkLenses(parseYaml(readFileSync(join(ROOT, 'views', 'lenses.yaml'), 'utf8'))).length) fail('the built-in lens file holds its own format');
    for (const n of ['risk-first', 'verification-plan', 'hygiene-sprint']) { try { if (loadLens('views/lenses.yaml', n).tie_break !== 'sequence-key') fail(`${n} breaks ties by #318's key`); } catch (e) { fail(`the built-in lens ${n} loads (${e.message})`); } }
    if (loadLens().name !== 'risk-first' || loadLens().quadrants.join(' ') !== 'act-now verify-first hygiene park' || loadLens().not_valued !== 'last') fail('risk-first is the default: act now, verify first, hygiene, park, then not valued');
    if (JSON.stringify(Object.keys(TIE_BREAKS)) !== JSON.stringify(['sequence-key', 'consequence', 'finding-id'])) fail(`the tie-breaks are a closed list (got ${Object.keys(TIE_BREAKS).join(', ')})`);
    let unknownLens = '';
    try { loadLens('views/lenses.yaml', 'quick-wins'); } catch (e) { unknownLens = e.message; }
    if (!/has no lens "quick-wins"/.test(unknownLens)) fail('a lens the file does not hold is refused, never read as the default');

    // (h) renaming every scanner changes no quadrant
    const adapters = loadAdapters();
    const yardstick = loadYardstick();
    const { projected } = projectMulti(loadFindings(run1), adapters);
    const decided = decideProjected(projected, loadDecisions(run1), '');
    const measurement = projectRun(run1, yardstick);
    const ctx = { ...loadConfidenceContext(run1), consequence: loadConsequenceContext(run1, { yardstick }) };
    const rename = (name) => {
      const ads = Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k) }]));
      const dec = decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } }));
      const man = ctx.manifest && ctx.manifest.scanners ? { ...ctx.manifest, scanners: Object.fromEntries(Object.entries(ctx.manifest.scanners).map(([k, v]) => [name(k), v])) } : ctx.manifest;
      return buildSequence({ decided: dec, adapters: ads, roadmap: [], measurement, yardstick, context: { ...ctx, manifest: man } }).seq
        .map((s) => `${s.ps.map((p) => p.f.id).sort().join('+')}=${s.quadrant ? `${s.quadrant.value}/${s.quadrant.rule}` : NOT_VALUED}`).join(' ');
    };
    const asIs = rename((s) => s);
    for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`])
      if (rename(name) !== asIs) fail(`renaming the scanners changes no quadrant (was ${asIs}, renamed ${rename(name)})`);

    // (i) the restatement, and the schema refusing what does not hold
    if (JSON.stringify(SEQUENCE_QUADRANTS) !== JSON.stringify(QUADRANTS) || SEQUENCE_NOT_VALUED !== NOT_VALUED) fail('lib/run-data.mjs restates the quadrants as views/improve/quadrants.mjs states them');
    const strip = (rs) => JSON.stringify(rs.map((r) => ({ name: r.name, quadrant: r.quadrant, confidence: r.confidence, consequence: r.consequence })));
    if (strip(SEQUENCE_QUADRANT_RULES) !== strip(QUADRANT_RULES)) fail('lib/run-data.mjs restates the quadrant rules as views/improve/quadrants.mjs states them');
    if (JSON.stringify(SEQUENCE_HEAD_LABELS) !== JSON.stringify(HEAD_LABELS)) fail('lib/run-data.mjs restates the head labels as views/improve/sequence.mjs states them');
    if (checkSequence(doc).length) fail(`checkSequence admits the written sequence (got ${checkSequence(doc).join('; ')})`);
    const one = itemOf(doc, 'F-1001');
    const docWith = (patch) => ({ ...doc, sequence: doc.sequence.map((s) => (s === one ? { ...s, ...patch } : s)) });
    for (const [what, bad] of [
      ['a quadrant no rule gives', docWith({ quadrant: { value: 'hygiene', rule: 'high-stake-confirmed' } })],
      ['a quadrant naming another rule', docWith({ quadrant: { value: 'act-now', rule: 'low-stake-confirmed' } })],
      ['no quadrant on a valued item', docWith({ quadrant: null })],
      ['an unvalued item with a quadrant', { ...doc, sequence: doc.sequence.map((s) => (s === tmpl ? { ...s, quadrant: { value: 'park', rule: 'low-stake-unconfirmed' } } : s)) }],
      ['a mix without the item\'s own value', docWith({ confidence: { ...one.confidence, mix: { judged: 1 } } })],
      ['a mix out of the scale\'s order', docWith({ confidence: { ...one.confidence, mix: { 'known-misfire': 1, confirmed: 2 } } })],
      ['a consequence mix with a weight', docWith({ consequence: { ...one.consequence, mix: { severe: 0.5 } } })],
      ['a lens without its digest', { ...doc, lens: { name: 'risk-first', file: 'views/lenses.yaml' } }],
      ['a left-out quadrant that is not one', { ...doc, left_out: [{ quadrant: 'later', findings: ['F-1001'] }] }],
      ['a head label that is not Blocker or Critical', { ...doc, not_valued_head: [{ ...blocker, label: 'High' }] }],
    ]) if (!checkSequence(bad).length) fail(`checkSequence refuses ${what}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
