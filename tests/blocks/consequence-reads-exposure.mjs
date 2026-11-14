// ── consequence reads what a finding exposes (#330) ──
// Consequence (#322) read every confirmed gap on a safety floor row as significant, whatever the gap
// was: broken access control and a missing Content-Security-Policy source read alike. Each source's
// adapter now maps what its rows already carry (a reviewer's area and tag, an instrument's check id)
// to a closed, property-named fact, `exposure`, by a closed table of markers each with its reason
// (`consequence.exposure`, map/scanners/CONTRACT.md §3); anything the table cannot place reads null.
// The default policy uses it monotonically: only a positive placement as hardening or hygiene lowers
// a safety row's value, by a rule naming it. Pinned over #322's fixture (consequence-from-facts) plus:
//   F-1300  a reviewer B finding tagged "defence in depth · CSP"           d-routes-authorized (safety, floor)
//   F-1301  a reviewer B finding tagged "A01 broken access control"        the same row
//   F-1302  a reviewer B finding tagged "CI cost"                          the same row
//   F-1303  a reviewer B finding tagged "routing", which no entry places   the same row
//   F-1304  a reviewer B finding tagged "defence in depth · A01"           the same row: two values fit
//   F-1310  checkov CKV_AWS_18, access logging                             d-infrastructure-config-secure
//   F-1311  checkov CKV_AWS_20, a public-read ACL                          the same row
//   F-1312  checkov CKV_AWS_21, versioning, which the table leaves out     the same row
// Held:
//   (a) the defence-in-depth finding reads exposure hardening and contained, by safety-row-hardening,
//       in sequence.json and on its REMEDIATION line, and leaves act now (#329) for hygiene;
//   (b) the broken-access-control finding on the same row reads authority, stays significant or above,
//       and stays in act now;
//   (c) the cost finding reads hygiene and cosmetic, by safety-row-hygiene;
//   (d) the logging check reads hardening; the public-access check authority or others-data; the
//       unlisted check null, keeping today's value;
//   (e) monotone: every gap whose exposure is not hardening or hygiene, the unplaced F-1303 among them,
//       reads exactly what today's policy (the default without its exposure rules and unless clauses)
//       gives, so a null never lowers; and a finding two entries place takes the riskier;
//   (f) #322's four-pattern fixture lands as before, item by item: consequence, quadrant and order;
//   (g) renaming every scanner, adapter and run-record row with it, moves no value; with no adapter
//       declaring a table every exposure reads null; a source with no table reads null even on a tag
//       another adapter's table would place;
//   (h) swapping or dropping every severity label moves no value but through halt_at;
//   (i) a policy rule naming an exposure value outside the closed set, in when or unless, refuses to load;
//   (j) an adapter's table that does not hold refuses: a value outside the set, no reason, a selector
//       outside the closed list, a category its map does not carry, a regex that does not compile;
//   (k) lib/run-data.mjs restates the closed fact list with exposure on it, and checkSequence admits the
//       written sequence.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { writeConsequenceFixture } from './consequence-from-facts.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { CONSEQUENCE, EXPOSURE, FACT_NAMES, consequenceIndex, consequenceOf, loadPolicy, loadConsequenceContext, checkPolicy, checkAdapterConsequence, exposureOf, DEFAULT_POLICY } from '../../map/consequence.mjs';
import { checkSequence, SEQUENCE_CONSEQUENCE_FACTS } from '../../lib/run-data.mjs';

export const label = 'consequence-reads-exposure';

const DCR = (id, tag) => `- id: ${id}\n  source: deep-code-review\n  native_id: "R${id.slice(2)}"\n  native_category: B\n  polarity: gap\n  severity: Medium\n  confidence: confirmed\n  title: "A route finding (${id})"\n  native_tag: "${tag}"\n  observation: "A route's handling falls short (${id})."\n  evidence: ["server.mjs:1"]\n  fix: "Change the route (${id})."\n`;
const CKV = (id, check) => `- id: ${id}\n  source: checkov\n  native_id: "${check}@aws_s3_bucket.backups@main.tf"\n  native_category: terraform\n  polarity: gap\n  severity: Medium\n  observation: >\n    ${check}: aws_s3_bucket.backups in main.tf:2 fails it.\n  evidence: ["main.tf:2"]\n  fix: >\n    Change aws_s3_bucket.backups so it passes ${check}.\n`;

// #322's four-pattern fixture as it compiled before this change, in risk-first's order (#329): the
// item's findings, its consequence, the rule that gave it and its quadrant (re-read at main 5cb948d)
const FOUR_PATTERNS = [
  ['F-1001', 'severe', 'halt-at-reached', 'act-now'], ['F-1003', 'significant', 'safety-floor-row', 'act-now'],
  ['F-1005', 'significant', 'safety-floor-row', 'act-now'], ['F-1006', 'significant', 'safety-floor-row', 'act-now'],
  ['F-053+F-060', 'severe', 'unheld-halt', 'verify-first'], ['F-10900', 'contained', 'floor-row', 'verify-first'],
  ['F-055', 'significant', 'safety-floor-row', 'verify-first'], ['F-1007', 'significant', 'safety-floor-row', 'verify-first'],
  ['F-1100', 'significant', 'safety-floor-row', 'verify-first'], ['F-054', 'severe', 'lane-judgment', 'verify-first'],
  ['F-1004', 'contained', 'floor-row', 'hygiene'], ['F-1002', 'contained', 'floor-row', 'hygiene'],
  ['F-990', 'significant', 'safety-floor-row', 'park'], ['F-1101', 'contained', 'floor-row', 'park'],
  ['F-062', 'contained', 'working-tier-row', 'park'], ['F-063', 'contained', 'working-tier-row', 'park'],
  ['F-991+F-992', 'unvalued', null, null],
];

export function writeExposureFixture(dir) {
  writeConsequenceFixture(dir);
  const dcr = join(dir, 'map', 'findings', 'deep-code-review.yaml');
  writeFileSync(dcr, readFileSync(dcr, 'utf8') + DCR('F-1300', 'defence in depth · CSP') + DCR('F-1301', 'A01 broken access control')
    + DCR('F-1302', 'CI cost') + DCR('F-1303', 'routing') + DCR('F-1304', 'defence in depth · A01'));
  const ckv = join(dir, 'map', 'findings', 'checkov.yaml');
  writeFileSync(ckv, readFileSync(ckv, 'utf8') + CKV('F-1310', 'CKV_AWS_18') + CKV('F-1311', 'CKV_AWS_20') + CKV('F-1312', 'CKV_AWS_21'));
}

// today's policy: the default without the rules that read exposure and without their unless clauses
const todays = (policy) => ({ ...policy, rules: policy.rules.filter((r) => !('exposure' in r.when)).map(({ unless, ...r }) => { void unless; return r; }) });

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-consequence-reads-exposure');
  try {
    rmSync(tmp, { recursive: true, force: true });
    // (k) the restatement first: checkSequence (lib/run-data.mjs) holds every item's facts to it
    if (JSON.stringify(SEQUENCE_CONSEQUENCE_FACTS) !== JSON.stringify(FACT_NAMES) || !FACT_NAMES.includes('exposure')) fail(`lib/run-data.mjs restates the closed fact list with exposure on it (got ${SEQUENCE_CONSEQUENCE_FACTS.join(', ')})`);
    writeExposureFixture(join(tmp, 'run'));
    const runDir = join(tmp, 'run');
    const h = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), runDir], { encoding: 'utf8' });
    if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); return; }
    const doc = JSON.parse(readFileSync(join(runDir, 'handoff', 'sequence.json'), 'utf8'));
    const rem = readFileSync(join(runDir, 'handoff', 'REMEDIATION.md'), 'utf8');
    const yardstick = loadYardstick();
    const policy = loadPolicy(DEFAULT_POLICY, yardstick);
    const adapters = loadAdapters();
    const { projected } = projectMulti(loadFindings(runDir), adapters);
    const decided = decideProjected(projected, loadDecisions(runDir), '');
    const measurement = projectRun(runDir, yardstick);
    const ctx = loadConsequenceContext(runDir, { yardstick });
    const idx = consequenceIndex({ decided, measurement, yardstick, context: ctx });
    const pOf = (id) => decided.find((p) => p.f.id === id);
    const cOf = (id, i = idx) => consequenceOf(pOf(id), i);
    const itemOf = (id) => doc.sequence.find((s) => s.findings.includes(id));
    if (!['F-1300', 'F-1301', 'F-1302', 'F-1303', 'F-1304', 'F-1310', 'F-1311', 'F-1312'].every(pOf)) { fail('the fixture must project every added finding'); return; }

    // (a) defence in depth on a safety floor row: hardening, contained, by the rule naming it
    const dd = cOf('F-1300');
    if (dd.facts.tier !== 'safety' || dd.facts.floor !== true) fail(`F-1300 bears on a safety floor row (got ${JSON.stringify(dd.facts)})`);
    if (dd.facts.exposure !== 'hardening' || dd.value !== 'contained' || dd.rule !== 'safety-row-hardening') fail(`a reviewer finding tagged defence in depth on a safety floor row reads contained by safety-row-hardening (got ${JSON.stringify(dd)})`);
    const ddItem = itemOf('F-1300')?.consequence;
    if (ddItem?.value !== 'contained' || ddItem?.rule !== 'safety-row-hardening' || ddItem?.facts?.exposure !== 'hardening') fail(`its item in sequence.json reads contained by safety-row-hardening with exposure hardening (got ${JSON.stringify(ddItem)})`);
    if (!/^_Consequence: contained \(rule `safety-row-hardening`[^\n]*exposure hardening/m.test(rem)) fail('its REMEDIATION line names the rule and shows exposure hardening');
    if (itemOf('F-1300')?.quadrant?.value === 'act-now' || itemOf('F-1300')?.quadrant?.value !== 'hygiene') fail(`a confirmed hardening finding leaves act now for hygiene (got ${JSON.stringify(itemOf('F-1300')?.quadrant)})`);
    if (itemOf('F-1301')?.quadrant?.value !== 'act-now') fail(`a confirmed broken-access-control finding on the same row stays in act now (got ${JSON.stringify(itemOf('F-1301')?.quadrant)})`);

    // (b) broken access control on the same row: authority, significant or above
    const ac = cOf('F-1301');
    if (ac.facts.exposure !== 'authority' || CONSEQUENCE.indexOf(ac.value) < 0 || CONSEQUENCE.indexOf(ac.value) > CONSEQUENCE.indexOf('significant')) fail(`a reviewer broken-access-control finding on the same row reads authority and stays significant or above (got ${JSON.stringify(ac)})`);

    // (c) hygiene on the same row: cosmetic, by the rule naming it
    const hy = cOf('F-1302');
    if (hy.facts.exposure !== 'hygiene' || hy.value !== 'cosmetic' || hy.rule !== 'safety-row-hygiene') fail(`a reviewer finding tagged CI cost on a safety floor row reads cosmetic by safety-row-hygiene (got ${JSON.stringify(hy)})`);

    // (d) the instrument's table: logging hardening, public access direct, unlisted null
    const today = consequenceIndex({ decided, measurement, yardstick, context: { ...ctx, policy: todays(policy) } });
    if (cOf('F-1310').facts.exposure !== 'hardening') fail(`checkov's access-logging check reads hardening (got ${JSON.stringify(cOf('F-1310').facts)})`);
    if (!['authority', 'others-data'].includes(cOf('F-1311').facts.exposure)) fail(`checkov's public-read check reads authority or others-data (got ${JSON.stringify(cOf('F-1311').facts)})`);
    const un = cOf('F-1312');
    const unToday = cOf('F-1312', today);
    if (un.facts.exposure !== null || un.value !== unToday.value || un.rule !== unToday.rule) fail(`checkov's unlisted versioning check reads null and keeps today's value (today ${JSON.stringify(unToday)}, now ${JSON.stringify(un)})`);

    // (e) monotone: a null, or any exposure but hardening and hygiene, reads exactly today's value
    const gaps = decided.filter((p) => p.f.polarity === 'gap');
    if (cOf('F-1303').facts.exposure !== null) fail(`a reviewer tag no entry places reads null (got ${JSON.stringify(cOf('F-1303').facts)})`);
    let nulls = 0;
    for (const p of gaps) {
      const now = consequenceOf(p, idx);
      const was = consequenceOf(p, today);
      if (now.facts.exposure === null) nulls++;
      if (['hardening', 'hygiene'].includes(now.facts.exposure)) { if (CONSEQUENCE.indexOf(now.value) < CONSEQUENCE.indexOf(was.value) && now.value !== 'unvalued') fail(`${p.f.id}: hardening or hygiene never raises (today ${was.value}, now ${now.value})`); continue; }
      if (now.value !== was.value || now.rule !== was.rule) fail(`${p.f.id} (exposure ${now.facts.exposure}) keeps today's value: only hardening or hygiene lowers one (today ${was.value}/${was.rule}, now ${now.value}/${now.rule})`);
    }
    if (nulls < 5) fail(`the monotone check reads the fixture's unplaced gaps (got ${nulls})`);
    if (cOf('F-1303').value !== 'significant' || cOf('F-1303').rule !== 'safety-floor-row') fail(`an unplaced finding on a safety floor row stays significant by safety-floor-row (got ${JSON.stringify(cOf('F-1303'))})`);
    const two = cOf('F-1304');
    if (two.facts.exposure !== 'authority' || two.value !== 'significant') fail(`a finding both defence in depth and A01 takes the riskier, authority, and stays significant (got ${JSON.stringify(two)})`);
    if (JSON.stringify(exposureOf(pOf('F-1304').f, adapters['deep-code-review'])?.entries) !== JSON.stringify(['access-control'])) fail(`the riskier value names the entries that placed it (got ${JSON.stringify(exposureOf(pOf('F-1304').f, adapters['deep-code-review']))})`);

    // (f) the four-pattern fixture lands as before
    const four = join(tmp, 'four');
    writeConsequenceFixture(four);
    const h4 = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), four], { encoding: 'utf8' });
    if (h4.status !== 0) fail(`handoff.mjs must compile the four-pattern fixture (exit ${h4.status}): ${h4.stderr.slice(0, 400)}`);
    else {
      const seq = JSON.parse(readFileSync(join(four, 'handoff', 'sequence.json'), 'utf8')).sequence;
      const got = seq.map((s) => [s.findings.join('+'), s.consequence.value, s.consequence.rule, s.quadrant ? s.quadrant.value : null]);
      if (JSON.stringify(got) !== JSON.stringify(FOUR_PATTERNS)) fail(`the four-pattern fixture lands as before, consequence, quadrant and order alike (want ${JSON.stringify(FOUR_PATTERNS)}, got ${JSON.stringify(got)})`);
    }

    // (g) renaming every scanner moves nothing; no table, no exposure; another adapter's table is never read
    const VALUES = (i, ps) => ps.filter((p) => p.f.polarity === 'gap').map((p) => `${p.f.id}=${consequenceOf(p, i).value}/${consequenceOf(p, i).rule}/${consequenceOf(p, i).facts.exposure}`).join(' ');
    const asIs = VALUES(idx, decided);
    for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`]) {
      const ads = Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k) }]));
      const dec = decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } }));
      const renamed = VALUES(consequenceIndex({ decided: dec, measurement, yardstick, context: { ...ctx, adapters: ads } }), dec);
      if (renamed !== asIs) fail(`renaming every scanner moves no value (was ${asIs}; renamed ${renamed})`);
    }
    const bare = Object.fromEntries(Object.entries(adapters).map(([k, a]) => { const { consequence, ...rest } = a; void consequence; return [k, rest]; }));
    const bareIdx = consequenceIndex({ decided, measurement, yardstick, context: { ...ctx, adapters: bare } });
    const placed = gaps.filter((p) => consequenceOf(p, bareIdx).facts.exposure !== null);
    if (placed.length) fail(`with no adapter declaring a table every exposure reads null (got ${placed.map((p) => p.f.id).join(', ')})`);
    if (consequenceOf({ ...pOf('F-1300'), source: 'zizmor' }, idx).facts.exposure !== null) fail('a finding of a source whose adapter declares no table reads null, whatever another adapter\'s table would place');

    // (h) a label swap moves nothing but through halt_at
    const LABELS = (ps, i) => ps.filter((p) => p.f.polarity === 'gap' && idx.rows.get(String(p.f.id))?.haltAt == null).map((p) => `${p.f.id}=${consequenceOf(p, i).value}/${consequenceOf(p, i).rule}`).join(' ');
    const before = LABELS(decided, idx);
    for (const [why, relabel] of [['every label swapped', (s) => ({ High: 'Low', Low: 'High', Medium: 'Critical', Nit: 'Blocker' }[s] || 'High')], ['every label dropped', () => undefined]]) {
      const dec = decided.map((p) => ({ ...p, f: { ...p.f, severity: relabel(p.f.severity) } }));
      const after = LABELS(dec, consequenceIndex({ decided: dec, measurement, yardstick, context: ctx }));
      if (after !== before) fail(`with ${why}, no value moves but through halt_at (was ${before}; now ${after})`);
    }

    // (i) a policy rule naming an exposure outside the closed set refuses to load
    const rule = (k) => ({ schema: 'assay.consequence-policy', version: 1, rules: [{ name: 'by-exposure', says: 'reads an exposure', when: { tier: 'safety' }, [k]: { exposure: 'critical-data' }, at_least: 'severe' }] });
    for (const k of ['when', 'unless']) {
      const doc2 = rule(k);
      if (k === 'when') doc2.rules[0].when = { exposure: 'critical-data' };
      if (!checkPolicy(doc2, yardstick).some((p) => p.includes(`${k}.exposure: "critical-data" is not one of ${EXPOSURE.join(', ')}`))) fail(`a rule naming an exposure outside the set in ${k} is refused (got ${JSON.stringify(checkPolicy(doc2, yardstick))})`);
    }
    if (checkPolicy({ ...rule('unless'), rules: [{ ...rule('unless').rules[0], unless: {} }] }, yardstick).length === 0) fail('an empty unless is refused');
    mkdirSync(join(tmp, 'operator'), { recursive: true });
    const offFile = join(tmp, 'operator', 'off.yaml');
    writeFileSync(offFile, 'schema: assay.consequence-policy\nversion: 1\nrules:\n  - name: by-exposure\n    says: reads an exposure outside the set\n    when: { exposure: critical-data }\n    at_least: severe\n');
    let threw = '';
    try { loadPolicy(offFile, yardstick); } catch (e) { threw = e.message; }
    if (!/exposure: "critical-data"/.test(threw)) fail(`loading a policy that names an exposure outside the set throws, naming it (got ${JSON.stringify(threw)})`);
    for (const r of policy.rules.filter((x) => JSON.stringify([x.when, x.unless]).includes('exposure'))) if (!/hardening|hygiene/.test(r.says)) fail(`the default rule ${r.name} names the exposure it reads, in words`);

    // (j) an adapter's table that does not hold refuses
    const base = adapters['deep-code-review'];
    const entry = { id: 'x', when: { tag: ['csp'] }, value: 'hardening', reason: 'why' };
    for (const [why, bad, re] of [
      ['a value outside the set', { ...entry, value: 'critical-data' }, /value must be one of/],
      ['no reason', { ...entry, reason: '' }, /reason must say/],
      ['a selector outside the list', { ...entry, when: { title: ['csp'] } }, /when names "title"/],
      ['a category its map lacks', { ...entry, when: { category: ['ZZ'] } }, /category ZZ is not one of/],
      ['a regex that does not compile', { ...entry, when: { native_id: '([' } }, /is not a regex/],
      ['no selector', { ...entry, when: {} }, /at least one of/],
    ]) if (!checkAdapterConsequence({ ...base, consequence: { exposure: [bad] } }).some((p) => re.test(p))) fail(`an adapter table with ${why} is refused (got ${JSON.stringify(checkAdapterConsequence({ ...base, consequence: { exposure: [bad] } }))})`);
    for (const a of Object.values(adapters)) for (const p of checkAdapterConsequence(a)) fail(`adapters/${a.scanner}.yaml: ${p}`);

    // (k) the written sequence admitted
    if (checkSequence(doc).length) fail(`checkSequence admits the written sequence (got ${checkSequence(doc).join('; ')})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
