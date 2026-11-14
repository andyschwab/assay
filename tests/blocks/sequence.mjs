// ── the shared handoff/report SEQUENCE (views/improve/sequence.mjs) ────────────
// The reviewer's roadmap items, one TRIAGE item per scanner whose adapter declares
// `handoff.triage: true` (gitleaks) covering every gap the roadmap did not absorb, and
// every remaining scanner-fix remedy grouped per its adapter's declared `handoff.unit`
// (dependency-scan: one remedy per lockfile), all placed by one key read off their worst
// finding (halt, severity class, absent evidence, the requirement's tier, severity; #306,
// #316) — and the report's §6 names the SAME item numbers. Here: the Critical lockfile is item
// 1, the lint roadmap item (Medium, verification) item 2, and the gitleaks triage (safety tier,
// unrated) item 5. Re-pinned by #316: severity now bounds tier, so the unrated triage ranks in
// the Low/Nit/unrated class, after the two Medium remedies, where it was item 2 by its tier.
// Re-pinned by #319 (slice 3): the order is now the default lens, risk-first, over the quadrants,
// with the key above as its tie-break inside one. The Critical lockfile (confirmed, significant) and
// the gitleaks triage (confirmed, significant by its safety floor row) are both act now, so the
// triage is item 2; the lint roadmap item (confirmed, contained) is hygiene, item 3; the two Medium
// advisories no rule values are not valued, last. The roadmap item is still placed by its finding,
// never by being authored, and §6 still names the handoff's numbers.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'sequence';

export async function run() {
  const fail = (m) => negFailures.push('sequence: ' + m);
  const tmp = join(HERE, 'tmp-sequence'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmp);   // F-900 (lint, not-declared), F-901 (typecheck, not-declared)
  copyFixtureScanners('cleanlib', tmp);

  // a gitleaks base big enough that folding it into one item (never one per hit,
  // never dropped into an "unrated" bucket) actually matters: 8 hits, 3 files.
  writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), Array.from({ length: 8 }, (_, i) => {
    const file = `config/secrets-${i % 3}.env`;
    return `- id: F-${800 + i}\n  source: gitleaks\n  native_id: "generic-api-key@${file}:${3 + i}"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    Committed secret detected at ${file}:${3 + i}.\n  evidence: [${file}:${3 + i}]\n  fix: >\n    Rotate the credential now, then purge it from history; suppress via .gitleaksignore only after verifying it is a false positive, with the reason recorded.\n`;
  }).join(''));

  // two lockfiles: one single Critical advisory the roadmap will NOT cover, one
  // with two Medium advisories — two remedies, not three, not one per advisory.
  writeFileSync(join(tmp, 'map', 'findings', 'dependency-scan.yaml'), [
    `- id: F-1000\n  source: dependency-scan\n  native_id: "GHSA-aaaa@lodash@apps/api/package-lock.json"\n  native_category: "critical"\n  polarity: gap\n  observation: >\n    lodash in apps/api/package-lock.json is vulnerable to GHSA-aaaa (Critical).\n  evidence: [apps/api/package-lock.json:1]\n  fix: >\n    Upgrade lodash and regenerate apps/api/package-lock.json; re-run dependency-scan and confirm the advisory is gone.\n`,
    `- id: F-1001\n  source: dependency-scan\n  native_id: "GHSA-bbbb@axios@apps/web/package-lock.json"\n  native_category: "moderate"\n  polarity: gap\n  observation: >\n    axios in apps/web/package-lock.json is vulnerable to GHSA-bbbb (Medium).\n  evidence: [apps/web/package-lock.json:1]\n  fix: >\n    Upgrade axios and regenerate apps/web/package-lock.json; re-run dependency-scan and confirm the advisory is gone.\n`,
    `- id: F-1002\n  source: dependency-scan\n  native_id: "GHSA-cccc@qs@apps/web/package-lock.json"\n  native_category: "moderate"\n  polarity: gap\n  observation: >\n    qs in apps/web/package-lock.json is vulnerable to GHSA-cccc (Medium).\n  evidence: [apps/web/package-lock.json:1]\n  fix: >\n    Upgrade qs and regenerate apps/web/package-lock.json; re-run dependency-scan and confirm the advisory is gone.\n`,
  ].join(''));

  // the authored roadmap absorbs F-900 (lint) only — F-901 (typecheck), both
  // gitleaks and both lockfile groups stay uncovered.
  mkdirSync(join(tmp, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
    'target: "sequence test target"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
    'roadmap:', '  - slug: declare-lint', '    title: "Declare the missing lint gate"',
    '    body: "Lint is not declared; add it."', '    findings: [F-900]',
    '    done_when:', '      - "package.json declares a lint script"', '',
  ].join('\n'));
  writeFileSync(join(tmp, 'views', 'improve', 'security-gate.yaml'), 'exposures: []\n');

  const hRun = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
  if (hRun.status !== 0) fail(`handoff.mjs must succeed over this base (stderr: ${hRun.stderr})`);
  const start = existsSync(join(tmp, 'handoff', 'START-HERE.md')) ? readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8') : '';
  const seqSection = start.split('## Sequence')[1] || '';

  // 1. the roadmap item takes the number its finding gives it (a Medium, after the Critical),
  // never number 1 for being authored
  if (!/^3\. \*\*Declare the missing lint gate\*\*/m.test(seqSection)) fail(`the roadmap item must be sequence item 3, in hygiene after the two act-now items (got:\n${seqSection})`);

  // 2. one triage item follows, covering every uncovered gitleaks gap in ONE remedy with ONE plan
  const triageLine = seqSection.split('\n').find((l) => /Triage gitleaks/.test(l));
  if (!triageLine || !/^2\./.test(triageLine.trim())) fail(`the gitleaks triage item must be sequence item 2, one item for all 8 hits (got: ${triageLine})`);
  if (!/8 hits? \(3 files?\)/.test(triageLine || '')) fail(`the triage item must name all 8 uncovered gitleaks hits across 3 files in one remedy (got: ${triageLine})`);
  if (!existsSync(join(tmp, 'handoff', 'plan', '02-triage-gitleaks.md'))) fail('the triage item must get exactly one session prompt (plan/02-triage-gitleaks.md)');

  // 3. dependency advisories in ONE lockfile become ONE remedy; two lockfiles become two
  const lockLines = seqSection.split('\n').filter((l) => /package-lock\.json/.test(l));
  if (lockLines.length !== 2) fail(`two lockfiles must yield two grouped remedies, never one per advisory (got ${lockLines.length}: ${lockLines.join(' | ')})`);
  if (!lockLines.some((l) => /apps\/api\/package-lock\.json.*1 finding.*worst Critical/.test(l))) fail(`the single-advisory lockfile must read "1 finding, worst Critical" (got: ${lockLines.find((l) => /api/.test(l))})`);
  if (!lockLines.some((l) => /apps\/web\/package-lock\.json.*2 findings.*worst Medium/.test(l))) fail(`the two-advisory lockfile must read "2 findings, worst Medium" (got: ${lockLines.find((l) => /web/.test(l))})`);

  // 4. every plan prompt carries both proofs and the standing guard
  const planDir = join(tmp, 'handoff', 'plan');
  const plans = existsSync(planDir) ? readdirSync(planDir) : [];
  if (plans.length < 3) fail(`expected at least 3 session prompts (roadmap + triage + the Critical lockfile) (got ${plans.length}: ${plans.join(', ')})`);
  for (const p of plans) {
    const body = readFileSync(join(planDir, p), 'utf8');
    if (!body.includes('**Your proof**')) fail(`${p} must carry a "Your proof" line`);
    if (!body.includes('**Our re-check**')) fail(`${p} must carry an "Our re-check" line`);
    if (!body.includes('do not deploy, publish, send, or run anything that reaches')) fail(`${p} must carry the standing guard against reaching outside the checkout`);
  }
  // dependency-scan's declared client_proof must be filled in (never left as a
  // literal {paths}/{dirs} template)
  const lockPlan = plans.find((p) => /security-F-1000/.test(p));
  const lockBody = lockPlan ? readFileSync(join(planDir, lockPlan), 'utf8') : '';
  if (!/npm audit --package-lock-only/.test(lockBody)) fail(`the lockfile plan must carry dependency-scan's declared client_proof (got:\n${lockBody.slice(0, 400)})`);
  if (/\{paths\}|\{dirs\}/.test(lockBody)) fail(`dependency-scan's client_proof {paths}/{dirs} placeholders must be filled, never left literal (got:\n${lockBody.slice(0, 400)})`);
  // a scanner-fix prompt carries no owner question: confirm, fix as a diff, the review is the gate
  if (!lockBody.includes('## Step 1 — Confirm\n') || !lockBody.includes('make the smallest fix and leave it as a diff for review')) fail(`a scanner-fix prompt must confirm, then fix as a diff for review (got:\n${lockBody.slice(0, 600)})`);
  if (/ask me any context|and let me\s+choose|do not change code until I have answered/.test(lockBody)) fail('a scanner-fix prompt must not wait on the owner');

  // 4b. irreversible acts stay a person's: the triage prompt prepares rotation and proposes a
  // purge, never performs either; a roadmap item's authored done_when is its whole proof (the
  // adapters' generic client proof never dilutes it)
  const triageBody = existsSync(join(planDir, '02-triage-gitleaks.md')) ? readFileSync(join(planDir, '02-triage-gitleaks.md'), 'utf8') : '';
  if (/rotate the credential now|purge it from history/i.test(triageBody)) fail('the triage prompt must never have the agent rotate a credential or rewrite history itself');
  if (!/a person performs it/.test(triageBody) || !/propose; do not\s+rewrite/.test(triageBody)) fail(`the triage prompt must hand rotation to a person and only propose a purge (got:\n${triageBody.slice(0, 600)})`);
  const roadPlan = plans.find((p) => /^\d\d-declare-lint\.md$/.test(p));
  const roadBody = roadPlan ? readFileSync(join(planDir, roadPlan), 'utf8') : '';
  const roadYours = (roadBody.split('**Your proof**')[1] || '').split('**Our re-check**')[0];
  if (!/package\.json declares a lint script/.test(roadYours) || /From a fresh clone|A test in the repository/.test(roadYours)) fail(`a roadmap item's Your proof must be its done_when alone (got: ${roadYours})`);

  // 5. the stderr note fires for the uncovered Critical (and the uncovered triage item)
  if (!/does not cover/.test(hRun.stderr) || !/F-1000/.test(hRun.stderr)) fail(`handoff.mjs must print a stderr note naming the uncovered Critical F-1000 (got: ${hRun.stderr})`);
  if (!/gitleaks triage item/.test(hRun.stderr)) fail(`handoff.mjs's note must also name the uncovered gitleaks triage item (got: ${hRun.stderr})`);

  // 6. the report's §6 paragraph names the SAME item numbers the handoff uses
  const rRun = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), tmp], { encoding: 'utf8' });
  if (rRun.status !== 0) fail(`report.mjs must succeed over this base (stderr: ${rRun.stderr})`);
  const improveMd = existsSync(join(tmp, 'IMPROVE.md')) ? readFileSync(join(tmp, 'IMPROVE.md'), 'utf8') : '';
  const sixSection = improveMd.split('## 6. Prioritized roadmap')[1]?.split('## 7.')[0] || '';
  if (!/item 2, 8 hits/.test(sixSection)) fail(`report §6 must name the triage item's number and hit count matching the handoff (got: ${sixSection})`);
  if (!/F-1000 — at item 1\b/.test(sixSection)) fail(`report §6 must name the uncovered Critical F-1000 at item 1, matching the handoff (got: ${sixSection})`);
  if (!/\*\*Item 3\. Declare the missing lint gate\.\*\*/.test(sixSection)) fail(`report §6 must give the roadmap item the handoff's number, 3 (got: ${sixSection})`);

  // 6b. a roadmap item that takes in a bundling scanner's findings renders them the way that
  // scanner's own remedy does (a per-file summary for triage), never one claim block per hit,
  // and the triage item it absorbs leaves the sequence
  writeFileSync(join(tmp, 'views', 'improve', 'prose.yaml'), [
    'target: "sequence test target"', 'maintainer: "the test maintainers"', 'exec_summary: "test"',
    'roadmap:', '  - slug: rotate-at-handover', '    title: "Rotate every credential at handover"',
    '    body: "Rotate, then settle the hits."', `    findings: [${Array.from({ length: 8 }, (_, i) => `F-${800 + i}`).join(', ')}]`,
    '    done_when:', '      - "every credential rotated"', '',
  ].join('\n'));
  const hRun2 = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmp], { encoding: 'utf8' });
  const start2 = existsSync(join(tmp, 'handoff', 'START-HERE.md')) ? readFileSync(join(tmp, 'handoff', 'START-HERE.md'), 'utf8') : '';
  const plan01 = existsSync(join(tmp, 'handoff', 'plan')) ? readdirSync(join(tmp, 'handoff', 'plan')).find((f) => /^\d\d-rotate-at-handover\.md$/.test(f)) : null;
  const body01 = plan01 ? readFileSync(join(tmp, 'handoff', 'plan', plan01), 'utf8') : '';
  if (hRun2.status !== 0) fail(`handoff.mjs must succeed with a roadmap that absorbs the triage (stderr: ${hRun2.stderr})`);
  if (/Triage gitleaks/.test(start2)) fail('a roadmap item citing every secret hit absorbs the triage item; it must leave the sequence');
  if (!/8 findings from gitleaks\*\*, summarized per file/.test(body01) || (body01.match(/<<<OBSERVATION/g) || []).length > 0) fail(`an authored item must summarize a triage scanner's hits per file, never one claim block each (got:\n${body01.slice(0, 900)})`);

  // 7. the degenerate gate still fails closed: an open gap, no fix, no roadmap → no sequence
  const tmpDeg = join(HERE, 'tmp-sequence-degenerate'); rmSync(tmpDeg, { recursive: true, force: true });
  mkdirSync(join(tmpDeg, 'map', 'findings'), { recursive: true });
  writeFileSync(join(tmpDeg, 'map', 'findings', 'x.yaml'), '- id: F-1\n  source: practice-review\n  dimension: artifact-legibility\n  polarity: gap\n  observation: "an open gap with no fix and no roadmap"\n  evidence: [a:1]\n');
  let degStatus = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmpDeg], { stdio: 'pipe' }); }
  catch (e) { degStatus = e.status ?? 1; }
  if (degStatus !== 1) fail(`the degenerate gate must still fail closed (exit 1) over an open gap with no fix and no roadmap (got ${degStatus})`);
  rmSync(tmpDeg, { recursive: true, force: true });

  // 8. roadmap/base drift still fails closed: a roadmap citing an unknown finding id
  const tmpDrift = join(HERE, 'tmp-sequence-drift'); rmSync(tmpDrift, { recursive: true, force: true });
  copyFixtureFindings('cleanlib', tmpDrift);
  mkdirSync(join(tmpDrift, 'views', 'improve'), { recursive: true });
  writeFileSync(join(tmpDrift, 'views', 'improve', 'prose.yaml'), 'roadmap:\n  - slug: x\n    title: "x"\n    findings: [F-does-not-exist]\n');
  let driftStatus = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'improve', 'handoff.mjs'), tmpDrift], { stdio: 'pipe' }); }
  catch (e) { driftStatus = e.status ?? 1; }
  if (driftStatus !== 1) fail(`roadmap/base drift must still fail closed (exit 1) over a roadmap citing an unknown finding id (got ${driftStatus})`);
  rmSync(tmpDrift, { recursive: true, force: true });

  rmSync(tmp, { recursive: true, force: true });
}
