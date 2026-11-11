// ── a finding a facet rule reads is never a candidate, though no row cites it (#264, review of #277) ──
// A facet row cites only part of the population it reads: an unmet effect row its failing
// effects (yardstick/measure.mjs byEffects), the trifecta rule the capabilities holding all
// three legs. A passing effect that no triage entry covers, and a capability without the full
// trifecta, are cited by no row, yet d-halts-gated, d-effects-provable and the trifecta row read
// them. Pinned: in a run where the effect rows are unmet, such an effect and such a capability
// are never listed in views/improve/candidates.yaml, and yardstick/untaken.mjs says so directly.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { untakenFindings } from '../../yardstick/untaken.mjs';
import { candidatesDataPath, findingsDir, yardstickPath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'candidates-facet-population';

// F-054: a reversible internal effect that leaves an audited record (effects-provable passes it,
// and it is no halt), covered by no triage entry;
// F-055: a capability that reads untrusted input but holds no private data (no full trifecta)
const EXTRA = `
- id: F-054
  dimension: delegation
  polarity: strength
  subject_type: effect
  observation: >
    Renaming a note writes an audit row, and the old title stays in the note's history.
  evidence: [lib/agent.mjs:1]
  confidence: confirmed
  effect:
    channel: note-rename
    reversibility: reversible
    external: false
    gate_type: none
    telemetry: audited
    blast_scope: user

- id: F-055
  dimension: delegation
  polarity: fact
  subject_type: capability
  observation: >
    The summariser reads pasted text and returns a summary, with no access to stored notes.
  evidence: [lib/agent.mjs:1]
  confidence: confirmed
  capabilities:
    untrusted_input: true
    private_data: false
    external_effect: none
`;

export async function run() {
  const fail = (m) => negFailures.push('candidates-facet-population: ' + m);
  const assay = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...a], { encoding: 'utf8' });

  // directly: a facet population member is taken with nothing citing it; a plain finding is not
  const fs = [{ id: 'F-001', subject_type: 'effect', effect: { channel: 'x' } }, { id: 'F-002', subject_type: 'capability', capabilities: {} }, { id: 'F-003', subject_type: 'artifact' }];
  const left = untakenFindings({ findings: fs }).map((f) => f.id).join(',');
  if (left !== 'F-003') fail(`an effect or capability finding is in a facet rule's population and taken; only F-003 is untaken (got ${left})`);

  const tmp = mkdtempSync(join(tmpdir(), 'assay-candidates-facet-'));
  try {
    const run = join(tmp, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), run, { recursive: true });
    rmSync(join(run, 'ANSWERS.yaml'), { force: true });
    appendFileSync(join(findingsDir(run), 'practice-review-delegation.yaml'), EXTRA);
    const c = assay('compile', run);
    if (c.status !== 0) { fail(`compile over notesbox with F-054 and F-055 must succeed (exit ${c.status}): ${(c.stdout + c.stderr).split('\n').filter((l) => /✗|error/i.test(l)).slice(0, 4).join(' | ')}`); return; }
    // the setup holds: an effect row unmet, and neither finding cited by any row
    const y = parseYaml(readFileSync(yardstickPath(run), 'utf8'));
    const cited = new Set((y.requirements || []).flatMap((r) => r.findings || []));
    const unmetEffect = (y.requirements || []).some((r) => r.how === 'facet' && r.status === 'unmet' && (r.findings || []).some((id) => ['F-052', 'F-053'].includes(id)));
    if (!unmetEffect) fail('setup: an effect row must read unmet, citing only its failing effects');
    for (const id of ['F-054', 'F-055']) if (cited.has(id)) fail(`setup: ${id} must be cited by no row (the case this block pins)`);
    const triage = parseYaml(readFileSync(join(run, 'map', 'effect-triage.yaml'), 'utf8'));
    if ((triage.triage || []).some((e) => e.finding === 'F-054')) fail('setup: no triage entry may cover F-054');
    const d = parseYaml(readFileSync(candidatesDataPath(run), 'utf8'));
    const listed = [...(d.properties || []).flatMap((p) => p.findings || []), ...(d.unnamed || [])];
    for (const id of ['F-054', 'F-055']) if (listed.includes(id)) fail(`${id} is in a facet rule's population: it must never appear as a candidate`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
