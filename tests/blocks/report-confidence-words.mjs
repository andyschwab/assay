// ── report-confidence-words: every report.json entry naming a finding carries its confidence and word (#242) ──
// A consumer's Improve-report renderer printed a hedge on an "also reaches" sink and on a
// held path's hold ("inferred, not confirmed", "not verified") from its own copy of the
// engine's confidence-to-word table; report.json carried the pair only on a tentative
// chain's `weakest` step. Pinned, on notesbox with a plausible "also reaches" sink planted
// (F-051 also reaches F-053, made plausible), a cut (F-050 reaches F-052) and a held path with an unverified hold (F-054,
// an untrusted-input capability, reaches F-055, a halted effect, unverified): report.json
// carries the table as labels.confidence, and every object in it naming a finding by `id`
// carries that finding's `confidence` and `word` (the table's phrase, null when confirmed);
// checkImproveReport refuses an entry without either, and a word the table does not give;
// views/README.md states the rule; validate reads the run back and fails closed.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'report-confidence-words';

// every object under v that names a finding by id, with the JSON path it sits at
const named = (v, at = '', out = []) => {
  if (Array.isArray(v)) v.forEach((x, i) => named(x, `${at}[${i}]`, out));
  else if (v && typeof v === 'object') {
    if (typeof v.id === 'string') out.push({ at, x: v });
    for (const [k, x] of Object.entries(v)) named(x, at ? `${at}.${k}` : k, out);
  }
  return out;
};

export async function run() {
  const fail = (m) => negFailures.push('report-confidence-words: ' + m);
  const L = await import('../../lib/run-layout.mjs');
  const D = await import('../../lib/run-data.mjs');
  const { loadFindings } = await import('../../map/project.mjs');
  const { buildChains } = await import('../../map/chains.mjs');
  const readme = readFileSync(join(ROOT, 'views', 'README.md'), 'utf8');
  const row = readme.split('\n').find((l) => l.startsWith('| `views/improve/report.json`')) || '';
  if (!/labels: \{[^}]*\bconfidence\b/.test(row)) fail('views/README.md\'s report.json format must list labels.confidence');
  if (!/every (?:object|entry)[^.|]*nam(?:es|ing) a finding[^.|]*`confidence`[^.|]*`word`/.test(row)) fail('views/README.md\'s report.json format must state that every entry naming a finding carries its `confidence` and `word`');
  const tmp = join(HERE, 'tmp-report-confidence-words');
  rmSync(tmp, { recursive: true, force: true });
  try {
    copyFixtureFindings('notesbox', tmp); copyFixtureScanners('notesbox', tmp);
    const dp = join(tmp, 'map', 'findings', 'practice-review-delegation.yaml');
    let y = readFileSync(dp, 'utf8');
    const plant = (from, to) => { if (!y.includes(from)) throw new Error(`notesbox no longer carries ${JSON.stringify(from)}; replant`); y = y.replace(from, to); };
    plant('  confidence: confirmed\n  preconditions: [network-position]\n', '  confidence: confirmed\n  preconditions: [network-position]\n  reaches: [F-052]\n');
    plant('  preconditions: [prompt-injection]\n  reaches: [F-052]\n', '  preconditions: [prompt-injection]\n  reaches: [F-052, F-053]\n');
    plant('  evidence: [lib/sync.mjs:8]\n  confidence: confirmed\n', '  evidence: [lib/sync.mjs:8]\n  confidence: plausible\n');
    y += [
      '',
      '- id: F-054',
      '  dimension: delegation',
      '  polarity: gap',
      '  subject_type: capability',
      '  observation: >',
      '    The assistant reads untrusted note content into a second prompt (planted by the test).',
      '  evidence: [lib/agent.mjs:19]',
      '  confidence: confirmed',
      '  capabilities:',
      '    untrusted_input: true',
      '    private_data: false',
      '    external_effect: true',
      '  preconditions: [prompt-injection]',
      '  reaches: [F-055]',
      '',
      '- id: F-055',
      '  dimension: delegation',
      '  polarity: gap',
      '  subject_type: effect',
      '  observation: >',
      '    An outbound email behind a hard stop, not verified (planted by the test).',
      '  evidence: [lib/agent.mjs:39]',
      '  confidence: unverified',
      '  effect:',
      '    channel: held-email',
      '    reversibility: irreversible',
      '    external: true',
      '    gate_type: deterministic-halt',
      '    telemetry: unstructured',
      '    blast_scope: tenant',
      '  preconditions: [prompt-injection]',
      '',
    ].join('\n');
    writeFileSync(dp, y);
    mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
    writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
      'target: "notesbox"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
      'roadmap:', '  - slug: close-admin-default', '    title: "Fail authentication closed"', '    body: "x"', '    findings: [F-050, F-052, F-053]', '',
    ].join('\n'));
    writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');
    const rp = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
    if (rp.status !== 0) { fail(`report.mjs must compile the planted notesbox (stderr: ${rp.stderr})`); return; }
    const findings = loadFindings(tmp);
    const byId = new Map(findings.map((f) => [f.id, f]));
    const built = buildChains(findings, {});
    const chain = built.live.find((c) => c.entry.id === 'F-051');
    if (!chain || chain.headline.id !== 'F-052' || !chain.sinks.some((s) => s.id === 'F-053')) { fail('the plant must give F-051 a live chain headed by F-052 that also reaches F-053; replant'); return; }
    if (!built.held.some((h) => h.entry.id === 'F-054' && h.holds.some((x) => x.id === 'F-055'))) { fail('the plant must give F-054 a held path holding at F-055; replant'); return; }
    const p = L.improveReportDataPath(tmp);
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    const table = doc.labels?.confidence;
    if (!table || typeof table !== 'object') { fail('report.json must carry labels.confidence, the confidence → word table'); return; }
    if (table.plausible !== 'inferred, not confirmed' || table.unverified !== 'not verified') fail(`labels.confidence must be the engine's own table (got ${JSON.stringify(table)})`);
    const { labels, ...rest } = doc;
    const entries = named(rest);
    if (!entries.length) fail('report.json must carry entries naming findings');
    for (const { at, x } of entries) {
      const f = byId.get(x.id);
      if (!f) continue;
      if (x.confidence !== f.confidence) fail(`${at}: must carry ${x.id}'s confidence ${f.confidence} (got ${JSON.stringify(x.confidence)})`);
      const want = table[f.confidence] ?? null;
      if (!('word' in x) || x.word !== want) fail(`${at}: must carry the word ${JSON.stringify(want)} for ${x.id} (got ${JSON.stringify(x.word)})`);
    }
    const live = (doc.chains?.live || []).find((c) => c.entry?.id === 'F-051') || {};
    const also = (live.sinks || []).find((s) => s.id === 'F-053') || {};
    if (also.word !== 'inferred, not confirmed') fail(`the plausible "also reaches" sink F-053 must read "inferred, not confirmed" in report.json (got ${JSON.stringify(also.word)})`);
    const held = (doc.chains?.held || []).find((h) => h.entry?.id === 'F-054') || {};
    const hold = (held.holds || []).find((h) => h.id === 'F-055') || {};
    if (hold.word !== 'not verified') fail(`the unverified hold F-055 must read "not verified" in report.json (got ${JSON.stringify(hold.word)})`);
    const ids = new Set(findings.map((f) => f.id));
    const refuse = (what, mut) => {
      const d = JSON.parse(JSON.stringify(doc));
      try { mut(d); } catch { fail(`could not build the case ${what}; replant`); return; }
      if (!D.checkImproveReport(d, ids).length) fail(`checkImproveReport must refuse ${what}`);
    };
    const liveOf = (d) => d.chains.live.find((c) => c.entry.id === 'F-051');
    refuse('a report with no labels.confidence', (d) => { delete d.labels.confidence; });
    refuse('a sink with no confidence', (d) => { delete liveOf(d).sinks.find((s) => s.id === 'F-053').confidence; });
    refuse('a sink with no word', (d) => { delete liveOf(d).sinks.find((s) => s.id === 'F-053').word; });
    refuse('a hold with no confidence', (d) => { delete d.chains.held.find((h) => h.entry.id === 'F-054').holds[0].confidence; });
    refuse('a cut with no confidence', (d) => { const c = d.chains.live.find((x) => x.cuts.length); delete c.cuts[0].confidence; });
    refuse('a chain entry with no confidence', (d) => { delete liveOf(d).entry.confidence; });
    refuse('a word the table does not give', (d) => { liveOf(d).sinks.find((s) => s.id === 'F-053').word = 'probably fine'; });
    refuse('a confirmed entry with a word', (d) => { liveOf(d).headline.word = 'not verified'; });
    const val = () => spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { encoding: 'utf8' });
    const v0 = val();
    if (v0.status !== 0) fail(`validate must pass over the planted run (stderr: ${String(v0.stderr).split('\n').slice(0, 4).join(' | ')})`);
    const d1 = JSON.parse(JSON.stringify(doc)); delete d1.chains.held[0].holds[0].confidence;
    writeFileSync(p, JSON.stringify(d1));
    const v1 = val();
    if (v1.status === 0 || !/report\.json/.test(v1.stderr)) fail(`validate must fail closed on a report.json hold with no confidence, naming the file (got ${v1.status})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
