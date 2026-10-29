// ── peer-scanner machine report: strict verdict rows (deep-code-review 1.609+, #174) ──
// A gap row may carry `verdict`. Only a confirmed row carries a severity; a
// needs_validation row is a question (blockers, validation_plan, no severity), in
// findings or in the top-level needs_validation list the skill's merge step writes;
// a rejected row (reject_reason, no severity) is the reviewer's own withdrawal. Pinned:
//   (a) such a report converts: the confirmed row keeps its severity, each question
//       becomes an unverified gap with no severity, its blockers in the observation and
//       its plan as resolves_with, and no question is dropped from either place;
//   (b) a rejected row is never a gap, and the sidecar names it with its reason;
//   (c) the upstream field rules halt: a question or a withdrawal with a severity, a
//       question with no blockers or no plan, a withdrawal with no reason, a verdict
//       outside the three, and a non-question in the needs_validation list;
//   (d) the ingested run validates green and the question projects onto its axis.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { projectMulti } from '../../map/project.mjs';
import { HERE, ROOT, negFailures, convert, adaptersOnce, copyFixtureFindings } from '../harness.mjs';

export const label = 'dcr-verdict-rows';

const VERDICT_ROWS = `  - id: F5
    title: "Webhook signature compared with ==="
    area: B
    verdict: confirmed
    severity: High
    demonstrated_impact: High
    root_cause: "a string comparison that returns early on the first differing byte"
    hunter: unit-2
    verifier: lead
    rechecked_by: fresh-verifier
    polarity: gap
    confidence: CONFIRMED
    confidence_score: 90
    observation: >
      The webhook handler compares the computed and supplied signatures with ===, which leaks timing.
    evidence:
      - api/webhook.ts:18
    fix: >
      Compare with crypto.timingSafeEqual over equal-length buffers.
  - id: F6
    title: "Session cookie may lack SameSite"
    area: N
    verdict: needs_validation
    blockers:
      - "the cookie is set by a framework default the tree does not pin"
    validation_plan: "read the deployed Set-Cookie header on /login"
    polarity: gap
    confidence: PLAUSIBLE
    observation: >
      The session cookie is set without an explicit SameSite attribute.
    evidence:
      - src/session.ts:12
  - id: F7
    title: "Admin route lacks an auth check"
    area: B
    verdict: rejected
    reject_reason: "the router-level middleware at api/mw/auth.ts:9 covers it"
    polarity: gap
    observation: >
      The admin route handler has no auth check of its own.
    evidence:
      - api/admin.ts:4
`;
const ASKED = `needs_validation:
  - id: F8
    title: "Retry storm on upstream 503"
    area: F
    verdict: needs_validation
    blockers:
      - "the upstream's retry-after behaviour is not in the tree"
      - "no load test exercises it"
    validation_plan: "replay a 503 burst against staging and count the retries"
    polarity: gap
    observation: >
      The client retries every 503 immediately with no backoff.
    evidence:
      - src/client.ts:51
`;

export async function run() {
  const fail = (m) => negFailures.push('dcr-verdict-rows: ' + m);
  const mustThrow = (what, text, re) => {
    try { convert('deep-code-review', text, null); fail(`${what} must halt`); }
    catch (e) { if (re && !re.test(e.message)) fail(`${what} must halt for its own reason (got: ${e.message})`); }
  };
  const base = readFileSync(join(HERE, 'instruments', 'deep-code-review-sample.yaml'), 'utf8').replace(/skill_version: "[^"]*"/, 'skill_version: "1.609.0"');
  const report = base.replace('prior_not_rechecked: [F7]\n', VERDICT_ROWS + 'prior_not_rechecked: []\n' + ASKED);

  // (a) and (b)
  let rows = [];
  try { rows = convert('deep-code-review', report, null); }
  catch (e) { fail(`a 1.609 report with verdict rows must convert (${e.message})`); return; }
  const by = Object.fromEntries(rows.map((r) => [r.native_id, r]));
  if (rows.length !== 7) fail(`the sample's 4 rows plus confirmed F5 and questions F6 and F8 make 7 rows; rejected F7 makes none (got ${rows.length}: ${rows.map((r) => r.native_id).join(', ')})`);
  if (by.F5?.severity !== 'High' || by.F5?.native_verdict !== 'confirmed' || by.F5?.confidence !== 'confirmed') fail('a confirmed row keeps its severity and carries native_verdict confirmed');
  for (const id of ['F6', 'F8']) {
    const r = by[id];
    if (!r) { fail(`question ${id} must become a row (${id === 'F8' ? 'from the top-level needs_validation list' : 'from findings'})`); continue; }
    if (r.polarity !== 'gap' || r.severity !== undefined || r.native_verdict !== 'needs_validation') fail(`${id}: a question is a gap with no severity and native_verdict needs_validation`);
    if (r.confidence !== 'unverified') fail(`${id}: a question reads unverified whatever its tier (got ${r.confidence})`);
    if (!r.resolves_with || !r.fix || !/Validate before changing anything/.test(r.fix)) fail(`${id}: a question is settled by its validation_plan (resolves_with, and the fix's first act)`);
    if (!/Open before it can be ranked: /.test(r.observation)) fail(`${id}: the blockers must be stated in the observation`);
  }
  if (by.F8 && !/retry-after.*; no load test/.test(by.F8.observation)) fail('every blocker is stated, in order');
  if (by.F7) fail('a rejected row is never filed as a gap');
  if ((rows.coverage?.rejected || []).map((r) => `${r.id}:${r.reason}`).join() !== 'F7:the router-level middleware at api/mw/auth.ts:9 covers it') fail('the sidecar names each rejected row with its reason');

  // (c)
  mustThrow('a question with a severity', report.replace('    verdict: needs_validation\n    blockers:\n      - "the cookie', '    verdict: needs_validation\n    severity: Medium\n    blockers:\n      - "the cookie'), /carries no severity/);
  mustThrow('a withdrawal with a severity', report.replace('    verdict: rejected\n', '    verdict: rejected\n    severity: Low\n'), /carries no severity/);
  mustThrow('a question with no blockers', report.replace('    blockers:\n      - "the cookie is set by a framework default the tree does not pin"\n', ''), /needs blockers/);
  mustThrow('a question with no plan', report.replace('    validation_plan: "read the deployed Set-Cookie header on /login"\n', ''), /needs validation_plan/);
  mustThrow('a withdrawal with no reason', report.replace(/    reject_reason: [^\n]*\n/, ''), /needs reject_reason/);
  mustThrow('a verdict outside the three', report.replace('    verdict: confirmed\n', '    verdict: probable\n'), /bad verdict/);
  mustThrow('a confirmed row with no severity', report.replace('    verdict: confirmed\n    severity: High\n', '    verdict: confirmed\n'), /needs a severity/);
  mustThrow('a ranked row in the needs_validation list', report.replace('    verdict: needs_validation\n    blockers:\n      - "the upstream', '    verdict: confirmed\n    blockers:\n      - "the upstream'), /in the needs_validation list/);
  mustThrow('a needs_validation that is not a list', report.replace(/needs_validation:\n  - id: F8[\s\S]*$/, 'needs_validation: F8\n'), /must be a list/);
  // a question tiered unverified is settled by its plan; it needs no resolves_with of its own
  try { if (convert('deep-code-review', report.replace('    confidence: PLAUSIBLE\n    observation: >\n      The session cookie', '    confidence: unverified\n    observation: >\n      The session cookie'), null).find((r) => r.native_id === 'F6')?.resolves_with !== 'read the deployed Set-Cookie header on /login') fail('an unverified question takes its plan as resolves_with'); }
  catch (e) { fail(`an unverified question needs no resolves_with of its own (${e.message})`); }
  // a verdict on a strength row is upstream's to ignore, and so ours
  try { convert('deep-code-review', report.replace('    area: T\n    polarity: strength\n', '    area: T\n    verdict: rejected\n    polarity: strength\n'), null); }
  catch (e) { fail(`a verdict on a strength row is not read (${e.message})`); }

  // (d) end to end: ingest, validate, project
  const tmp = join(HERE, 'tmp-dcr-verdict'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  writeFileSync(join(tmp, 'map', 'scanners.yaml'), 'engine: fixture\nscanners:\n  repo-eval:\n    status: ran\n  deep-code-review:\n    status: ran\n  gitleaks:\n    status: ran\n  fresh-clone:\n    status: ran\n  dependency-scan:\n    status: ran\n  repo-census:\n    status: skipped\n    reason: "fixture: not executed"\n  structure-scan:\n    status: skipped\n    reason: "fixture: not executed"\n');
  const raw = join(tmp, 'machine-report.yaml'); writeFileSync(raw, report);
  try {
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'deep-code-review', '--raw', raw], { stdio: 'pipe' });
    const side = parseYaml(readFileSync(join(tmp, 'map', 'coverage', 'deep-code-review.yaml'), 'utf8'));
    if (!Array.isArray(side.rejected) || side.rejected[0]?.id !== 'F7' || !side.rejected[0]?.reason) fail('the written sidecar must carry the rejected list, loadable');
    const filed = readFileSync(join(tmp, 'map', 'findings', 'deep-code-review.yaml'), 'utf8');
    if ((filed.match(/native_verdict: needs_validation/g) || []).length !== 2) fail('the written rows must carry native_verdict on both questions');
    execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' });
  } catch (e) { fail(`a 1.609 report must ingest and validate green (${String(e.stderr || e.stdout || e.message).split('\n').filter(Boolean).slice(-3).join(' | ')})`); }
  rmSync(tmp, { recursive: true, force: true });
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`every verdict row must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.native_id === 'F8')?.axis !== 'code-correctness') fail('question F8 (domain F) must project onto code-correctness');
}
