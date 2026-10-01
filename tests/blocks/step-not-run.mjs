// ── a step that did not run reads not measured, never met (issue #30, F-1202, F-1215,
// F-304, F-1217) ──
// When the install fails, every later fresh-clone step is skipped. A skipped step is a
// fact (`<step>-not-run`), and each fresh-clone requirement lists those facts in its
// not_measured_when, so a category reads met only when its step actually ran: a
// repository whose install fails reads d-tests-execute-core and d-lint-typecheck-gate
// not measured, never met. The same pass closes three more ways a run that did not
// look reads clean: an empty or non-numeric --exit (Number('') is 0), a gitleaks exit
// code that disagrees with its report, and an Owner lead that reassured about custody
// rows nothing measured.
import { rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectMulti } from '../../map/project.mjs';
import { measureRun } from '../../yardstick/measure.mjs';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'step-not-run';

export async function run() {
  const fail = (m) => negFailures.push('step-not-run: ' + m);
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  // (a) the runner over the fixture, copied out so its failed install leaves the tree clean
  const scratch = mkdtempSync(join(tmpdir(), 'assay-install-fails-'));
  cpSync(join(HERE, 'instruments', 'fresh-clone-install-fails'), scratch, { recursive: true });
  const doc = runFreshClone({ target: scratch, clone: false, timeout: 120 });
  rmSync(scratch, { recursive: true, force: true });
  const st = Object.fromEntries(doc.steps.map((s) => [s.name, s.status]));
  if (st.install !== 'failed') fail(`the fixture's install must fail (got ${st.install})`);
  for (const s of ['build', 'lint', 'typecheck', 'test', 'migrate']) if (st[s] !== 'skipped') fail(`with the install failed, ${s} must read skipped (got ${st[s]})`);
  // (b) convert: one fact row per skipped step, keyed <step>-not-run, and every row maps
  const rows = convert('fresh-clone', JSON.stringify(doc), 1);
  const facts = rows.filter((r) => r.polarity === 'fact').map((r) => r.native_category).sort();
  if (facts.join(',') !== 'build-not-run,lint-not-run,migrate-not-run,test-not-run,typecheck-not-run') fail(`every skipped step emits one <step>-not-run fact row (got ${facts.join(',') || '(none)'})`);
  const testFact = rows.find((r) => r.native_category === 'test-not-run');
  if (testFact && (testFact.severity || testFact.fix || !/install failed/.test(testFact.observation) || testFact.evidence?.[0] !== 'package.json:1')) fail(`a not-run fact carries the reason and the manifest, never a severity or fix (got ${JSON.stringify(testFact)})`);
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`every not-run fact must map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  // (c) measure: the steps that did not run read not measured; the failed install still unmet
  const ran = [{ scanner: 'fresh-clone', status: 'ran' }];
  const m = Object.fromEntries(measureRun({ findings: rows, manifest: ran, inputs: null, coverage: {} }).map((r) => [r.id, r]));
  for (const id of ['d-tests-execute-core', 'd-lint-typecheck-gate', 'd-schema-versioned']) if (m[id]?.status !== 'not-measured') fail(`${id} must read not-measured when its step never ran (got ${m[id]?.status}: ${m[id]?.note})`);
  if (m['d-tests-execute-core'] && !/not attempted/.test(m['d-tests-execute-core'].note)) fail(`the not-measured note carries the fact's own reason (got ${m['d-tests-execute-core'].note})`);
  if (m['d-fresh-clone-runs']?.status !== 'unmet') fail(`a failed install keeps d-fresh-clone-runs unmet (got ${m['d-fresh-clone-runs']?.status})`);
  // real evidence still governs: a lint gap beside a skipped typecheck is unmet, not unmeasured
  const lintGap = { id: 'F-1', source: 'fresh-clone', native_category: 'lint', polarity: 'gap', observation: 'x', evidence: ['package.json:1'] };
  const mixed = measureRun({ findings: [...rows.filter((r) => r.native_category !== 'lint-not-run'), lintGap], manifest: ran, inputs: null, coverage: {} }).find((r) => r.id === 'd-lint-typecheck-gate');
  if (mixed?.status !== 'unmet') fail(`a lint gap governs over a skipped typecheck (got ${mixed?.status})`);
  // (d) --exit must be the raw digits of an exit code: empty, blank, hex, exponent halt
  for (const bad of ['', ' ', '0x1', '1e0', '1.0', '+1']) mustThrow(`gitleaks --exit ${JSON.stringify(bad)}`, () => convert('gitleaks', '[]', bad));
  if (convert('gitleaks', '[]', '0').length !== 0) fail('a string "0" exit is still the clean exit');
  // (e) gitleaks: the exit code and the leak count agree, or the report is not the run
  const oneLeak = JSON.stringify([{ RuleID: 'r', File: 'a.ts', StartLine: 1 }]);
  mustThrow('a gitleaks exit 1 with an empty report', () => convert('gitleaks', '[]', 1));
  mustThrow('a gitleaks exit 0 with a leak in the report', () => convert('gitleaks', oneLeak, 0));
  if (convert('gitleaks', oneLeak, 1).length !== 1) fail('a gitleaks exit 1 with one leak converts to one row');
  // (f) Owner: no reassurance about custody or the floor while a row there could not be told
  const ownerView = await import('../../views/owner.mjs');
  const r0 = { tier: 'custody', topic: 't', risk: 'r.', fix: 'f.', where: [], findings: [], check: 'c.', reason: 'claim-only' };
  const empty = { open: [], not_measured: [], met: [], not_applicable: [] };
  const packetless = { floor: { ...empty, not_measured: [{ ...r0, id: 'd-a', title: 'A', status: 'not-measured' }, { ...r0, id: 'd-b', title: 'B', status: 'not-measured' }], met: [{ ...r0, id: 'd-c', tier: 'verification', title: 'C', status: 'met' }] }, beyond_floor: empty, not_looked_at: [] };
  const lead = ownerView.renderMd('run', packetless, { name: 'app', date: '2026-10-01' }).split('\n').find((l) => /floor requirement/.test(l)) || '';
  if (/Nothing about who controls this app/.test(lead) || /Nothing on the floor is open/.test(lead)) fail(`a packet-less Owner lead must not reassure about rows it could not tell (got: ${lead})`);
  if (!/who controls this app and its accounts could not be told/i.test(lead)) fail(`a packet-less Owner lead says the custody rows could not be told (got: ${lead})`);
  const decided = { ...packetless, floor: { ...empty, met: packetless.floor.not_measured.map((r) => ({ ...r, status: 'met' })) } };
  const decidedLead = ownerView.renderMd('run', decided, { name: 'app', date: '2026-10-01' }).split('\n').find((l) => /floor requirement/.test(l)) || '';
  if (!/Nothing about who controls this app/.test(decidedLead) || !/Nothing on the floor is open/.test(decidedLead)) fail(`with every custody row decided and none open, the lead still says so (got: ${decidedLead})`);
}
