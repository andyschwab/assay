// ── repo-census instrument (map/repo-census.mjs → ingest profile repo-census) ──
// The runner over the public fixture (a tiny monorepo, root + apps/one, plus
// ops/evidence/) must record what IS:
// architecture-page passes at the root (an Architecture section naming a
// database) and gaps for apps/one (no docs there at all); agent-contract gaps at the
// root citing the planted `## Status` heading, and gaps for apps/one (absent); runbook
// gaps naming the missing restore procedure; ci-gate gaps citing the planted
// continue-on-error step; and the six owner-evidence transcript checks read one pass
// (d-backup-restore-exercised, a complete fresh transcript) and five gaps, each for a
// different planted defect: an email-shaped `by` plus `result: fail` (d-rollback-
// exercised), a `deployed_sha` that disagrees with `commit` (d-deploy-one-command), a
// date outside the freshness window (d-smoke-on-deployed), a stub body (d-monitoring-
// with-alert), and an absent file (d-cost-alerts). The converter turns every gap into
// a gap row (Medium, except ci-gate fail-open which is High) and every pass into a
// strength row; a runner crash (exit 2) halts it; every category maps; an all-pass run
// reads the ten re-kinded floor rows met, with a skipped manifest reading not-measured
// instead; the real (non-synthetic) run reads d-backup-restore-exercised met and the
// other five evidence rows unmet.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti, contributedBySources } from '../../map/project.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures, viewSev, convert, adaptersOnce, copyFixtureFindings } from '../harness.mjs';

export const label = 'repo-census';

export async function run() {
  const fail = (m) => negFailures.push('repo-census: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  const fx = join(HERE, 'instruments', 'repo-census-target');
  const tmp = join(HERE, 'tmp-repo-census'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'repo-census.json');
  // the fixture is a plain directory (it lives inside assay's OWN checkout, no nested
  // .git of its own); the commit-existence gate (owner/evidence/README.md) needs a
  // REAL git history to check the one transcript that must pass against, so this
  // copies the fixture into a fresh git repo and rewrites that one transcript's
  // commit to the copy's own real HEAD sha before running repo-census over it.
  cpSync(fx, tmp, { recursive: true });
  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  execFileSync('git', ['init', '-q'], { cwd: tmp, env: gitEnv });
  execFileSync('git', ['add', '-A'], { cwd: tmp, env: gitEnv });
  execFileSync('git', ['commit', '-q', '-m', 'fixture commit'], { cwd: tmp, env: gitEnv });
  const realSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();
  const backupRestorePath = join(tmp, 'ops', 'evidence', 'd-backup-restore-exercised.md');
  writeFileSync(backupRestorePath, readFileSync(backupRestorePath, 'utf8').replace(/^commit: [0-9a-f]{7,40}$/m, `commit: ${realSha}`));
  // a fixed --as-of makes the planted staleness (d-smoke-on-deployed, dated 2026-01-01)
  // deterministic regardless of when the harness actually runs
  const AS_OF = '2026-09-24';
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', AS_OF], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the fixture must exit 1 (planted gaps; got ${exit})`);
  const raw = existsSync(out) ? readFileSync(out, 'utf8') : '';
  let doc = null;
  try { doc = JSON.parse(raw); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    if (doc.exit !== 1 || doc.tool !== 'repo-census') fail(`document must carry tool repo-census, exit 1 (got ${doc.tool}/${doc.exit})`);
    if (!doc.monorepo?.detected || doc.monorepo.locations.join() !== 'apps/one') fail(`the fixture must be detected as a monorepo with apps/one (got ${JSON.stringify(doc.monorepo)})`);
    if (doc.evidence?.asOf !== AS_OF) fail(`the document must record the --as-of date (got ${JSON.stringify(doc.evidence)})`);
    const at = (nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc);
    // every cited path must exist in the target: validate refuses evidence the tree does not have,
    // so a pointer to a missing path cites the packet (in the tree here), never the missing path
    for (const c of doc.checks) for (const ev of c.evidence || []) {
      const p = ev.replace(/:\d+$/, '');
      if (!p) fail(`${c.name} (${c.detail?.path}) cites ${ev}, which names no path (the root cites ./)`);
      else if (!existsSync(join(tmp, p))) fail(`${c.name} (${c.detail?.path}) cites ${ev}, which is not in the target`);
    }
    const arch = at('architecture-page', '.');
    if (arch?.status !== 'pass') fail(`architecture-page must pass at root (got ${arch?.status})`);
    const archApp = at('architecture-page', 'apps/one');
    if (archApp?.status !== 'gap') fail(`architecture-page must gap for apps/one (got ${archApp?.status})`);
    const agent = at('agent-contract', '.');
    if (agent?.status !== 'gap' || !agent.evidence[0]?.includes('AGENTS.md')) fail(`agent-contract must gap at root citing AGENTS.md (got ${agent?.status}/${agent?.evidence})`);
    if (!/Status/.test(agent?.observation || '')) fail('agent-contract gap must cite the planted Status heading');
    const agentApp = at('agent-contract', 'apps/one');
    if (agentApp?.status !== 'gap') fail(`agent-contract must gap for apps/one (got ${agentApp?.status})`);
    const rb = doc.checks.find((c) => c.name === 'runbook');
    if (rb?.status !== 'gap' || !/restore/.test(rb.observation)) fail(`runbook must gap naming restore (got ${rb?.status}/${rb?.observation})`);
    const ci = doc.checks.find((c) => c.name === 'ci-gate');
    if (ci?.status !== 'gap' || !/continue-on-error/.test(ci.observation) || !ci.evidence[0]?.includes('ci.yml')) fail(`ci-gate must gap citing the continue-on-error line (got ${ci?.status}/${ci?.observation}/${ci?.evidence})`);
    // the six owner-evidence checks: one pass, five gaps, each for its own planted reason
    const ev = (id) => doc.checks.find((c) => c.name === `evidence-${id}`);
    const backupRestore = ev('d-backup-restore-exercised');
    if (backupRestore?.status !== 'pass' || !/attests, by platform-eng at commit/.test(backupRestore.observation) || !/not that the procedure actually happened/.test(backupRestore.observation))
      fail(`d-backup-restore-exercised must pass, attested by role and commit, with the truth disclaimer (got ${backupRestore?.status}/${backupRestore?.observation})`);
    const rollback = ev('d-rollback-exercised');
    if (rollback?.status !== 'gap' || !/looks like an email address/.test(rollback.observation) || !/result: fail/.test(rollback.observation))
      fail(`d-rollback-exercised must gap citing both the email-shaped by and result: fail (got ${rollback?.status}/${rollback?.observation})`);
    const deploy = ev('d-deploy-one-command');
    if (deploy?.status !== 'gap' || !/deployed_sha .* does not match commit/.test(deploy.observation))
      fail(`d-deploy-one-command must gap citing the deployed_sha/commit mismatch (got ${deploy?.status}/${deploy?.observation})`);
    const smoke = ev('d-smoke-on-deployed');
    if (smoke?.status !== 'gap' || !/stale: dated 2026-01-01/.test(smoke.observation))
      fail(`d-smoke-on-deployed must gap as stale, naming the planted date (got ${smoke?.status}/${smoke?.observation})`);
    const monitoring = ev('d-monitoring-with-alert');
    if (monitoring?.status !== 'gap' || !/stub/.test(monitoring.observation))
      fail(`d-monitoring-with-alert must gap as a stub body (got ${monitoring?.status}/${monitoring?.observation})`);
    const costAlerts = ev('d-cost-alerts');
    if (costAlerts?.status !== 'gap' || !/No evidence transcript found/.test(costAlerts.observation) || costAlerts.evidence?.[0] !== '.:1')
      fail(`d-cost-alerts must gap as absent, evidence .:1 (got ${costAlerts?.status}/${costAlerts?.observation}/${costAlerts?.evidence})`);
    // the document never carries the transcript's body — header fields (counts) only
    const docText = JSON.stringify(doc);
    if (/torn down after verification/.test(docText)) fail('the document must never carry evidence body text, only header fields and line counts');
    if (typeof backupRestore?.detail?.bodyNonEmptyLines !== 'number' || typeof backupRestore?.detail?.bodyHasFencedBlock !== 'boolean') fail('an evidence check detail must carry body line counts, not body text');
    if (doc.checks.length !== 12) fail(`the fixture must yield 12 checks (2 architecture-page + 2 agent-contract + runbook + ci-gate + 6 evidence; got ${doc.checks.length})`);
    // (b) convert: a gap row per gap check, a strength row per pass check
    const rows = convert('repo-census', raw, 1);
    if (rows.length !== 12) fail(`convert must yield 12 rows (got ${rows.length})`);
    const byNc = {}; for (const r of rows) (byNc[r.native_category] ??= []).push(r);
    if ((byNc['architecture-page'] || []).filter((r) => r.polarity === 'strength').length !== 1) fail('exactly one architecture-page strength row (root)');
    if ((byNc['architecture-page'] || []).filter((r) => r.polarity === 'gap').length !== 1) fail('exactly one architecture-page gap row (apps/one)');
    if ((byNc['agent-contract'] || []).filter((r) => r.polarity === 'gap').length !== 2) fail('two agent-contract gap rows (root + apps/one)');
    if ((byNc['runbook'] || []).length !== 1 || byNc['runbook'][0].polarity !== 'gap') fail('one runbook gap row');
    if ((byNc['ci-gate'] || []).length !== 1 || byNc['ci-gate'][0].polarity !== 'gap' || viewSev(byNc['ci-gate'][0]) !== 'High') fail(`ci-gate fail-open must read gap, banded High by the view (got ${byNc['ci-gate']?.[0]?.polarity}/${viewSev(byNc['ci-gate']?.[0] || {})})`);
    // the six evidence categories: native_category is the real, colon-bearing name;
    // one strength row (the pass), five gap rows (the rest)
    const EVIDENCE_IDS = ['d-backup-restore-exercised', 'd-rollback-exercised', 'd-deploy-one-command', 'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts'];
    for (const id of EVIDENCE_IDS) {
      const nc = `evidence-${id}`;
      const want = id === 'd-backup-restore-exercised' ? 'strength' : 'gap';
      const got = byNc[nc];
      if (!got || got.length !== 1 || got[0].polarity !== want) fail(`${nc} must convert to exactly one ${want} row (got ${JSON.stringify(got)})`);
    }
    if (rows.filter((r) => r.polarity === 'gap').some((r) => r.native_category !== 'ci-gate' && viewSev(r) !== 'Medium')) fail('every non-ci-gate gap must read Medium in the view');
    if (rows.some((r) => !Array.isArray(r.evidence) || !r.evidence.length)) fail('every row needs at least one path:line');
    if (rows[0]?.id !== 'F-960') fail(`repo-census ids start at F-960 (got ${rows[0]?.id})`);
    // (c) a runner crash halts; a document that disagrees with the exit code halts; truncation halts
    mustThrow('a runner crash (exit 2)', () => convert('repo-census', raw, 2));
    mustThrow('a document whose exit disagrees with the runner exit', () => convert('repo-census', raw, 0));
    mustThrow('a truncated document (no checks)', () => convert('repo-census', JSON.stringify({ tool: 'repo-census', exit: 1, checks: [] }), 1));
    mustThrow('an unknown check name', () => convert('repo-census', JSON.stringify({ ...doc, checks: doc.checks.map((c) => c.name === 'runbook' ? { ...c, name: 'unknown-check' } : c) }), 1));
    mustThrow('an unknown status', () => convert('repo-census', JSON.stringify({ ...doc, checks: doc.checks.map((c) => c.name === 'runbook' ? { ...c, status: 'ok' } : c) }), 1));
    mustThrow('malformed JSON', () => convert('repo-census', raw.slice(0, 50), 1));
    mustThrow('a foreign report', () => convert('repo-census', '[]', 0));
    // (d) an all-passing synthetic document with exit 0 is a verified-clean-in-the-strength-
    // sense run: one strength row per check, no gap rows
    const cleanDoc = { ...doc, exit: 0, checks: doc.checks.map((c) => ({ ...c, status: 'pass', observation: `${c.name} passes`, evidence: (c.evidence && c.evidence.length) ? c.evidence : ['README.md:1'] })) };
    const cleanRows = convert('repo-census', JSON.stringify(cleanDoc), 0);
    if (cleanRows.length !== 12 || cleanRows.some((r) => r.polarity !== 'strength')) fail('an all-passing document must convert to strength rows only, one per check');
    // (e) projection: every category maps, onto existing axes, and the instrument contributes none
    const proj = projectMulti(rows, adaptersOnce());
    if (proj.unmapped.length) fail(`repo-census rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
    const axisOf = (cat) => proj.projected.find((p) => p.f.native_category === cat)?.axis;
    if (axisOf('architecture-page') !== 'artifact-legibility' || axisOf('runbook') !== 'artifact-legibility') fail('architecture-page / runbook must land on the docs-legibility axis (artifact-legibility)');
    // the agent contract stays on the axis the yardstick homes d-agent-contract on (improvement-loop): the adapter follows the yardstick, never the reverse
    if (axisOf('agent-contract') !== 'improvement-loop') fail('agent-contract must land on improvement-loop, the axis the yardstick homes d-agent-contract on');
    if (axisOf('ci-gate') !== 'deterministic-gates') fail('ci-gate must land on the shared deterministic-gates axis');
    // the six evidence categories land on a fixed axis each (their requirements' topics have no axis)
    const EVIDENCE_AXES = {
      'd-backup-restore-exercised': 'code-security',
      'd-rollback-exercised': 'context-economy',
      'd-deploy-one-command': 'code-security',
      'd-smoke-on-deployed': 'deterministic-gates',
      'd-monitoring-with-alert': 'verification',
      'd-cost-alerts': 'artifact-legibility',
    };
    for (const [id, wantAxis] of Object.entries(EVIDENCE_AXES)) {
      const got = axisOf(`evidence-${id}`);
      if (got !== wantAxis) fail(`evidence-${id} must land on ${wantAxis} (got ${got})`);
    }
    if (contributedBySources(adaptersOnce(), ['repo-census']).size !== 0) fail('repo-census is an instrument and must contribute no axis');
    const rogue = projectMulti([{ ...rows[0], native_category: 'unknown-check' }], adaptersOnce());
    if (!rogue.unmapped.length) fail('an unknown repo-census category must halt at projection (default: FAIL)');
    // (f) the yardstick: the four pre-existing re-kinded floor rows, plus the
    // six evidence rows, read met from an all-pass run with a `ran` manifest, and
    // not-measured (with the reason) when repo-census is recorded skipped instead
    const reg = loadYardstick();
    const RC_DESCRIPTOR_IDS = ['d-architecture-page', 'd-agent-contract', 'd-runbook', 'd-ci-gate-on-default-branch', ...EVIDENCE_IDS];
    const metRows = Object.fromEntries(measureRun({ findings: cleanRows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    for (const id of RC_DESCRIPTOR_IDS) {
      if (metRows[id]?.status !== 'met') fail(`${id} must read met from an all-pass repo-census run (got ${metRows[id]?.status})`);
    }
    const skippedRows = Object.fromEntries(measureRun({ findings: cleanRows, manifest: [{ scanner: 'repo-census', status: 'skipped', reason: 'no filesystem access' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    for (const id of RC_DESCRIPTOR_IDS) {
      if (skippedRows[id]?.status !== 'not-measured' || !/no filesystem access/.test(skippedRows[id].note)) fail(`${id} must read not-measured with the recorded reason when repo-census is skipped (got ${skippedRows[id]?.status}/${skippedRows[id]?.note})`);
    }
    // the REAL (non-synthetic) run: d-backup-restore-exercised is the one evidence row
    // actually met; the other five are actually unmet (planted gaps), same `ran` manifest
    const realRows = Object.fromEntries(measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).map((r) => [r.id, r]));
    if (realRows['d-backup-restore-exercised']?.status !== 'met') fail(`d-backup-restore-exercised must read met from the real fixture run (got ${realRows['d-backup-restore-exercised']?.status})`);
    for (const id of ['d-rollback-exercised', 'd-deploy-one-command', 'd-smoke-on-deployed', 'd-monitoring-with-alert', 'd-cost-alerts']) {
      if (realRows[id]?.status !== 'unmet') fail(`${id} must read unmet from the real fixture run (its planted gap; got ${realRows[id]?.status})`);
    }
    // the CLI end to end: ingest writes the rows file and the raw archive, and the run validates green
    copyFixtureFindings('notesbox', tmp);
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), readFileSync(join(HERE, 'fixtures', 'notesbox', 'map', 'scanners.yaml'), 'utf8').replace(/  repo-census:\n    status: skipped\n    reason: "[^"]*"\n/, '  repo-census:\n    status: ran\n'));
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'repo-census', '--raw', out, '--exit', '1'], { stdio: 'pipe' }); }
    catch (e) { fail(`ingest CLI must accept the fixture document (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
    if (!existsSync(join(tmp, 'map', 'findings', 'repo-census.yaml')) || !existsSync(join(tmp, 'map', 'raw', 'repo-census.json'))) fail('ingest must write map/findings/repo-census.yaml and archive the raw document');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); } catch (e) { fail(`an ingested repo-census run must validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter((l) => l.includes('•')).join(' | ')})`); }
  }
  rmSync(tmp, { recursive: true, force: true });
}
