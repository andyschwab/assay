// ── every fix-sequence item says how much assay knows about it (#319, slice 1) ──
// One list folded "how much is at stake" and "how much assay knows" into one order, and on four
// real runs the second leaked in as noise: a fresh-clone "test failed" that was the suite refusing
// to start without a database (#256), and a container-healthcheck rule the platform never reads,
// sat beside a confirmed release-path High. Every item now records its confidence on a closed
// scale (confirmed · judged · absent-evidence · not-measured · known-misfire), each value assigned
// by one named rule in map/confidence.mjs off the kind of evidence and assay's own measurements,
// never off a tool's severity. Pinned over a fixture run holding the four real-run patterns and a
// practice-review owner item (the #316 fixture, plus):
//   a fresh-clone test step that failed in 420 ms with no test counted, on a tree whose manifest
//     names a database dependency and no services declaration, ingested from its raw report;
//   a container-image HEALTHCHECK hit on a tree the census reads as deployed by fly.toml;
//   a reviewer finding whose own confidence is plausible.
// Held:
//   (a) every item in sequence.json carries a confidence whose rule is one of RULES and assigns
//       that value, read off one of its findings; an item with none fails this block's own check;
//   (b) each pattern reads its value on the facts alone: the release-path High confirmed, the
//       fresh-clone refusal not measured, the healthcheck hit a known misfire with its adapter's
//       reason, the missing transcript absent evidence, the practice-review owner item judged;
//   (c) a judged item carries its source's measured repeatability only where a named sweep set
//       measured that source (the owner item, from tests/sweeps/fixture-notesbox), and none
//       otherwise (the reviewer's plausible finding);
//   (d) the twins stay confirmed: the healthcheck hit with no platform signal, with a Compose file
//       beside the platform, or with no census read; the test step that ran two minutes, that
//       counted its tests, that carries no database signal, or whose tree declares its services;
//   (e) no value without its rule: an adapter that declares no evidence kind makes the engine
//       halt, and the handoff with it exits non-zero;
//   (f) the absent-evidence clause of the key reads the confidence: rank.absent_evidence is true
//       exactly where confidence is absent-evidence, and an absent transcript from a source the
//       run record says failed is not measured, not absent evidence;
//   (g) a misfire stays visible: the hit is an item of its own and its requirement does not read met;
//   (h) renaming every scanner, with its adapter and its run-record row, leaves every item's
//       confidence; a misfire follows the adapter that declares it, not the name;
//   (i) START-HERE and REMEDIATION render each item's confidence in one phrase;
//   (j) lib/run-data.mjs restates the scale and the rules as map/confidence.mjs states them, and
//       checkSequence refuses a confidence whose rule does not assign its value.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { writeBoundsFixture } from './sequence-severity-bounds-tier.mjs';
import { buildSequence } from '../../views/improve/sequence.mjs';
import { loadFindings, loadAdapters, projectMulti } from '../../map/project.mjs';
import { decideProjected, loadDecisions } from '../../map/decisions.mjs';
import { loadYardstick, projectRun } from '../../yardstick/measure.mjs';
import { convert } from '../../map/ingest.mjs';
import { RULES, CONFIDENCE, confidenceOf, loadConfidenceContext, measureSweepSet, ruleNamed } from '../../map/confidence.mjs';
import { checkSequence, SEQUENCE_CONFIDENCE, SEQUENCE_CONFIDENCE_RULES } from '../../lib/run-data.mjs';

export const label = 'confidence-on-every-item';

const SWEEPS = join(ROOT, 'tests', 'sweeps', 'fixture-notesbox');
const step = (name, status, extra = {}) => ({ name, status, command: status === 'not-declared' ? null : `npm run ${name}`, exit_code: status === 'passed' ? 0 : status === 'failed' ? 1 : null, duration_ms: 900, output_tail: '', ...extra });
// a fresh-clone report: every step passes but test, which failed as `test` says, on a tree whose
// toolchain carries `signals` as its database signals
export function freshCloneReport({ test, signals = ['dep:pg'], services } = {}) {
  const steps = ['install', 'build', 'lint', 'typecheck'].map((n) => step(n, 'passed'));
  steps.push(step('test', 'failed', { duration_ms: 420, tests: 'unparsed', ...test }));
  steps.push(step('migrate', 'passed'));
  return {
    tool: 'fresh-clone', version: '0.7.0', started_at: '2026-11-13T00:00:00.000Z', finished_at: '2026-11-13T00:00:01.000Z',
    target: { path: 'notesbox', head: 'fixture', cloned: false },
    toolchain: { family: 'node', manifest: 'package.json', package_manager: 'npm', lockfile: null, declared: {}, other_families: [], has_dependencies: true, scripts: ['test'], database_signals: signals },
    timeout_seconds: 600, readme: 'README.md', workspaces: [], readme_claims: [], steps, exit: 1, ...(services ? { services } : {}),
  };
}
const CHECKOV_ROW = (id, check) => `- id: ${id}\n  source: checkov\n  native_id: "${check}@Dockerfile.\\/@Dockerfile"\n  native_category: dockerfile\n  polarity: gap\n  severity: Medium\n  observation: >\n    Ensure that HEALTHCHECK instructions have been added to container images (${check}): Dockerfile in Dockerfile:1 fails it.\n  evidence: ["Dockerfile:1"]\n  fix: >\n    Change the Dockerfile so it passes ${check}: add a HEALTHCHECK instruction.\n`;
const census = (signals) => JSON.stringify({ tool: 'repo-census', exit: 1, checks: [], deployment: { signals, walked: 10, truncated: false } }, null, 2);

// the fixture: #316's run, plus a fresh-clone refusal ingested from its raw report, a healthcheck
// hit on a tree deployed by fly.toml, and a reviewer finding whose own confidence is plausible
export function writeConfidenceFixture(dir) {
  writeBoundsFixture(dir);
  const raw = join(dir, 'fc.json');
  writeFileSync(raw, JSON.stringify(freshCloneReport(), null, 2));
  rmSync(join(dir, 'map', 'findings', 'fresh-clone.yaml'));
  const ing = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'ingest', dir, '--tool', 'fresh-clone', '--raw', raw, '--exit', '1'], { encoding: 'utf8' });
  if (ing.status !== 0) throw new Error(`ingest of the fresh-clone report must succeed: ${(ing.stderr || ing.stdout).slice(0, 400)}`);
  rmSync(raw);
  writeFileSync(join(dir, 'map', 'findings', 'checkov.yaml'), CHECKOV_ROW('F-990', 'CKV_DOCKER_2'));
  writeFileSync(join(dir, 'map', 'raw', 'repo-census.json'), census([{ kind: 'container', path: 'Dockerfile', what: 'a container file' }, { kind: 'hosting', path: 'fly.toml', what: 'a hosting config' }]));
  writeFileSync(join(dir, 'map', 'findings', 'deep-code-review.yaml'), readFileSync(join(dir, 'map', 'findings', 'deep-code-review.yaml'), 'utf8') +
    '- id: F-1007\n  source: deep-code-review\n  native_id: "R1007"\n  native_category: B\n  polarity: gap\n  severity: Medium\n  confidence: plausible\n  title: "An export route may skip the tenant check"\n  native_tag: "authz"\n  observation: "An export route may skip the tenant check."\n  evidence: ["server.mjs:1"]\n  fix: "Check the tenant on the export route."\n');
}

const valueOf = (doc, id) => (doc.sequence.find((s) => s.findings.includes(id)) || {}).confidence;
const VALUES = (seq) => seq.map((s) => `${s.ps.map((p) => p.f.id).sort().join('+')}=${s.confidence && s.confidence.value}`).sort().join(' ');
// the block's own check of (a): every item carries a value of the scale, assigned by a named rule
export function itemsWithoutRule(doc) {
  return doc.sequence.filter((s) => !s.confidence || !CONFIDENCE.includes(s.confidence.value) || !ruleNamed(s.confidence.rule) || ruleNamed(s.confidence.rule).value !== s.confidence.value || !s.findings.includes(s.confidence.finding));
}

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const tmp = join(HERE, 'tmp-confidence-on-every-item');
  try {
    writeConfidenceFixture(tmp);
    const h = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp, '--sweep-set', SWEEPS], { encoding: 'utf8' });
    if (h.status !== 0) { fail(`handoff.mjs must compile the fixture (exit ${h.status}): ${h.stderr.slice(0, 600)}`); return; }
    const doc = JSON.parse(readFileSync(join(tmp, 'handoff', 'sequence.json'), 'utf8'));
    const start = readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8');
    const rem = readFileSync(join(tmp, 'handoff', 'REMEDIATION.md'), 'utf8');
    const fc = loadFindings(tmp).find((f) => f.source === 'fresh-clone' && f.native_id === 'test:failed');
    if (!fc) { fail('the ingested fresh-clone report must yield a test:failed row'); return; }

    // (a) every item has a value from a named rule; an item with none fails this check
    for (const s of itemsWithoutRule(doc)) fail(`item ${s.n} (${s.findings.join('+')}) must carry a confidence of the scale assigned by a named rule (got ${JSON.stringify(s.confidence)})`);
    const stripped = { ...doc, sequence: doc.sequence.map((s, i) => (i === 0 ? { ...s, confidence: undefined } : s)) };
    if (itemsWithoutRule(stripped).length !== 1) fail('an item with no confidence must fail the every-item check');

    // (b) each pattern on the facts alone
    const want = [
      ['F-1001', 'confirmed', 'cited-and-confirmed', 'a reviewer release-path High re-resolved at the head'],
      [fc.id, 'not-measured', 'adapter-declared-not-measured', 'a fresh-clone test that refused to start for want of a database'],
      ['F-990', 'known-misfire', 'adapter-declared-misfire', 'a healthcheck rule the deploying platform never reads'],
      ['F-1100', 'absent-evidence', 'evidence-file-absent', 'a missing evidence transcript'],
      ['F-055', 'judged', 'judged-source', 'a practice-review owner item'],
      ['F-1007', 'judged', 'cited-not-confirmed', 'a reviewer finding whose own confidence is plausible'],
      ['F-1003', 'confirmed', 'cited-and-confirmed', 'a reviewer High re-resolved at the head'],
    ];
    for (const [id, value, rule, what] of want) {
      const c = valueOf(doc, id);
      if (!c || c.value !== value || c.rule !== rule) fail(`${what} (${id}) must read ${value} by ${rule} (got ${JSON.stringify(c)})`);
    }
    const adapters = loadAdapters();
    const misfire = adapters.checkov.confidence.misfires.find((m) => m.id === 'healthcheck-ignored-by-platform');
    if (valueOf(doc, 'F-990')?.reason !== misfire.reason || valueOf(doc, 'F-990')?.declared !== misfire.id) fail(`the misfire carries its adapter's reason and id (got ${JSON.stringify(valueOf(doc, 'F-990'))})`);
    const nm = adapters['fresh-clone'].confidence.not_measured[0];
    if (valueOf(doc, fc.id)?.reason !== nm.reason) fail(`the not-measured step carries its adapter's reason (got ${JSON.stringify(valueOf(doc, fc.id))})`);
    if (fc.detail?.status !== 'failed' || fc.detail?.duration_ms !== 420 || fc.detail?.tests !== 'unparsed' || fc.detail?.needs_service !== 'dep:pg') fail(`ingest records the step's facts on its row (got ${JSON.stringify(fc.detail)})`);

    // (c) repeatability only where a named sweep set measured the source
    const measured = measureSweepSet(SWEEPS);
    const owner = valueOf(doc, 'F-055');
    if (JSON.stringify(owner?.repeatability) !== JSON.stringify([{ set: measured.set, sweeps: measured.sweeps, requirement_agreement: measured.requirement_agreement, candidate_agreement: measured.candidate_agreement }]))
      fail(`a judged practice-review item carries the named set's measured figures (want ${JSON.stringify(measured)}, got ${JSON.stringify(owner?.repeatability)})`);
    if (!measured.sources.includes('practice-review') || measured.sources.includes('deep-code-review')) fail(`the set's sources are those every sweep ran (got ${measured.sources.join(', ')})`);
    if (valueOf(doc, 'F-1007')?.repeatability !== undefined) fail('a judged item whose source no named set measured carries no figure');
    for (const s of doc.sequence) if (s.confidence?.repeatability && s.confidence.value !== 'judged') fail(`only a judged item carries repeatability (item ${s.n})`);
    const h2 = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
    const doc2 = h2.status === 0 ? JSON.parse(readFileSync(join(tmp, 'handoff', 'sequence.json'), 'utf8')) : null;
    if (!doc2 || doc2.sequence.some((s) => s.confidence?.repeatability !== undefined)) fail('with no sweep set named, no item carries a repeatability figure');

    // (d) the twins stay confirmed
    const { projected } = projectMulti(loadFindings(tmp), adapters);
    const pOf = (id) => projected.find((p) => p.f.id === id);
    const ctx = loadConfidenceContext(tmp);
    const hit = pOf('F-990');
    const sig = (paths) => paths.map((p) => ({ kind: 'x', path: p }));
    for (const [why, deployment] of [['no platform signal', sig(['Dockerfile'])], ['a Compose file beside the platform', sig(['Dockerfile', 'fly.toml', 'docker-compose.yml'])], ['no census read', null]]) {
      const c = confidenceOf(hit, adapters, { ...ctx, deployment });
      if (c.value !== 'confirmed') fail(`the healthcheck hit with ${why} stays confirmed (got ${JSON.stringify(c)})`);
    }
    for (const [why, k, v] of [['for a k8s chart', 'Chart.yaml', 'known-misfire'], ['for heroku', 'heroku.yml', 'known-misfire']]) {
      const c = confidenceOf(hit, adapters, { ...ctx, deployment: sig(['Dockerfile', `deploy/${k}`]) });
      if (c.value !== v) fail(`the healthcheck hit deployed ${why} reads ${v} (got ${c.value})`);
    }
    const other = { ...hit, f: { ...hit.f, native_id: 'CKV_DOCKER_3@Dockerfile.@Dockerfile' } };
    if (confidenceOf(other, adapters, ctx).value !== 'confirmed') fail('another rule on the same platform stays confirmed: a misfire is a rule-in-context pair');
    const rowOf = (report) => convert('fresh-clone', JSON.stringify(report), 1).find((r) => r.native_id === 'test:failed');
    const twins = [
      ['ran two minutes', freshCloneReport({ test: { duration_ms: 120000 } })],
      ['counted its tests', freshCloneReport({ test: { tests: { passed: 3, skipped: 0, failed: 2, total: 5 } } })],
      ['has no database signal', freshCloneReport({ signals: [] })],
      ['declares its services, provided', freshCloneReport({ services: { declared_in: '.assay/services.yaml', requested: true, provided: true, steps: ['test'], services: [{ name: 'postgres', image: 'postgres:16.4-alpine' }], containers: [], setup: [] } })],
    ];
    for (const [why, report] of twins) {
      const r = rowOf(report);
      const c = r ? confidenceOf({ f: r, source: 'fresh-clone' }, adapters, {}) : null;
      if (!c || c.value !== 'confirmed') fail(`a fresh-clone test that failed and ${why} stays confirmed (got ${JSON.stringify(c)}; detail ${JSON.stringify(r && r.detail)})`);
    }

    // (e) no value without its rule: the engine halts, and so does the handoff
    const bare = { checkov: { ...adapters.checkov, confidence: undefined } };
    let threw = false;
    try { confidenceOf(hit, bare, ctx); } catch { threw = true; }
    if (!threw) fail('a finding whose adapter declares no evidence kind must have no confidence: the engine throws');
    const yardstick = loadYardstick();
    const measurement = projectRun(tmp, yardstick);
    const decided = decideProjected(projected, loadDecisions(tmp), '');
    threw = false;
    try { buildSequence({ decided, adapters: { ...adapters, checkov: { ...adapters.checkov, confidence: undefined } }, roadmap: [], measurement, yardstick, context: ctx }); } catch { threw = true; }
    if (!threw) fail('the sequence must halt on an item no rule decides');

    // (f) the absent clause reads the confidence
    for (const s of doc.sequence) if (s.rank.absent_evidence !== (s.confidence.value === 'absent-evidence')) fail(`item ${s.n}: rank.absent_evidence must be true exactly where confidence is absent-evidence (got ${s.rank.absent_evidence}, ${s.confidence.value})`);
    const failedCtx = { ...ctx, manifest: { ...ctx.manifest, scanners: { ...ctx.manifest.scanners, 'repo-census': { status: 'failed', reason: 'the census crashed' } } } };
    const seqFailed = buildSequence({ decided, adapters, roadmap: [], measurement, yardstick, context: failedCtx }).seq;
    const t = seqFailed.find((s) => s.ps.some((p) => p.f.id === 'F-1100'));
    if (t?.confidence?.value !== 'not-measured' || t?.rank?.absent_evidence !== false) fail(`an absent transcript from a census the run record says failed is not measured, and the key does not read it as absent evidence (got ${JSON.stringify(t?.confidence)}, ${JSON.stringify(t?.rank)})`);

    // (g) a misfire stays visible, and never reads met
    const mItem = doc.sequence.find((s) => s.findings.includes('F-990'));
    if (!mItem || mItem.kind !== 'remedy') fail('the misfiring hit stays in the sequence as an item of its own');
    const row = measurement.find((r) => (r.findings || []).includes('F-990'));
    if (!row || row.status === 'met') fail(`the misfire's requirement never reads met (got ${JSON.stringify(row && { id: row.id, status: row.status })})`);

    // (h) renaming every scanner leaves every confidence; a misfire follows its adapter
    const before = VALUES(buildSequence({ decided, adapters, roadmap: [], measurement, yardstick, context: ctx }).seq);
    const rename = (name, strip = null) => {
      const ads = Object.fromEntries(Object.entries(adapters).map(([k, a]) => [name(k), { ...a, scanner: name(k), ...(k === strip ? { confidence: { ...a.confidence, misfires: [] } } : {}) }]));
      const dec = decided.map((p) => ({ ...p, source: name(p.source), f: { ...p.f, ...(p.f.source ? { source: name(p.f.source) } : {}) } }));
      const man = { ...ctx.manifest, scanners: Object.fromEntries(Object.entries(ctx.manifest.scanners).map(([k, v]) => [name(k), v])) };
      return VALUES(buildSequence({ decided: dec, adapters: ads, roadmap: [], measurement, yardstick, context: { ...ctx, manifest: man } }).seq);
    };
    for (const name of [(s) => `zz-${s.split('').reverse().join('')}`, (s) => `aa-${s.length}-${s}`])
      if (rename(name) !== before) fail(`renaming the scanners must not move any confidence (was ${before}, renamed ${rename(name)})`);
    const unmisfired = rename((s) => `q-${s}`, 'checkov');
    if (!/(^| )F-990=confirmed( |$)/.test(unmisfired) || unmisfired.replace('F-990=confirmed', 'F-990=known-misfire') !== before) fail(`a misfire follows the adapter that declares it: without it the hit is confirmed and nothing else moves (got ${unmisfired})`);

    // (i) every START-HERE and REMEDIATION item renders its confidence in one phrase
    const lines = (start.split('## Sequence')[1] || '').split('\n').filter((l) => /^\d+\. /.test(l));
    if (lines.length !== doc.sequence.length) fail(`START-HERE lists every item (got ${lines.length} of ${doc.sequence.length})`);
    const phrase = { 'confirmed': 'confirmed', 'judged': 'judged', 'absent-evidence': 'absent evidence', 'not-measured': 'not measured', 'known-misfire': 'known misfire' };
    lines.forEach((l, i) => { const v = doc.sequence[i]?.confidence?.value; if (!new RegExp(`_\\([^)]*; ${phrase[v]}`).test(l)) fail(`START-HERE item ${i + 1} must render "${phrase[v]}" (got ${l.slice(0, 200)})`); });
    if (!/judged; its source agreed on \d+ of \d+ requirements across \d+ sweeps \(fixture-notesbox\)/.test(start)) fail('a judged item with a measured figure renders it in START-HERE');
    if (!/known misfire \(healthcheck-ignored-by-platform\)/.test(start) || !/not measured \(test-refused-for-want-of-a-service\)/.test(start)) fail('START-HERE names the declared pair a misfire or a not-measured item read');
    const conf = rem.match(/^_Confidence: .*$/gm) || [];
    if (conf.length !== doc.sequence.length) fail(`REMEDIATION renders a confidence line under every item (got ${conf.length} of ${doc.sequence.length})`);
    if (!rem.includes(misfire.reason)) fail('REMEDIATION carries the misfire\'s reason');

    // (j) the restated scale and rules, and the schema refusing a mismatched rule
    if (JSON.stringify(SEQUENCE_CONFIDENCE) !== JSON.stringify(CONFIDENCE)) fail(`lib/run-data.mjs SEQUENCE_CONFIDENCE must be map/confidence.mjs's scale (got ${SEQUENCE_CONFIDENCE.join(', ')})`);
    if (JSON.stringify(SEQUENCE_CONFIDENCE_RULES) !== JSON.stringify(Object.fromEntries(RULES.map((r) => [r.name, r.value])))) fail('lib/run-data.mjs SEQUENCE_CONFIDENCE_RULES must be map/confidence.mjs RULES, name to value');
    for (const v of CONFIDENCE) if (!RULES.some((r) => r.value === v)) fail(`the value ${v} has no rule`);
    for (const r of RULES) if (!r.says || !CONFIDENCE.includes(r.value)) fail(`rule ${r.name} states its value and what it reads`);
    const one = doc.sequence.find((s) => s.findings.includes('F-1001'));
    const docWith = (c) => ({ ...doc, sequence: doc.sequence.map((s) => (s === one ? { ...s, confidence: c } : s)) });
    if (checkSequence(doc).length) fail(`checkSequence must admit the written sequence (got ${checkSequence(doc).join('; ')})`);
    for (const bad of [{ ...one.confidence, rule: 'judged-source' }, { ...one.confidence, value: 'sure' }, { ...one.confidence, finding: 'F-1' }, { value: 'known-misfire', rule: 'adapter-declared-misfire', finding: 'F-1001' }, { ...one.confidence, repeatability: [] }])
      if (!checkSequence(docWith(bad)).length) fail(`checkSequence must refuse the confidence ${JSON.stringify(bad)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
