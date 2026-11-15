// ── a sweep set of checklist sweeps is measured as a full set is, on what it answers (#338) ──
// The checklist mode's triage is the full mode's format, judged by the same rules, so variance reads
// a checklist sweep's answers as it reads a full one's. What a checklist sweep never looked for is
// never counted against it. Pinned, over a committed answered set whose sweeps are cut to their
// checklist subsets (tests/checklist-cut.mjs):
//   (a) per-candidate descriptor agreement, per-answer agreement and gap agreement (which effects are
//       opaque) read exactly as the full set's;
//   (b) fact presence reads not measured, with the reason, never 0; a threshold on it is a breach
//       naming it not measured, and the set declares it under not_measured;
//   (c) requirement agreement is measured, over the rows the checklist decides, and says so;
//   (d) a set may mix modes where every sweep carries answers; a mixed set where one does not is
//       refused (exit 2), naming the sweep.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cutToChecklist } from '../checklist-cut.mjs';
import { loadSweepSet } from '../../map/variance.mjs';
import { loadChecklist } from '../../map/passes.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'checklist-sweep-set';

const SET = join(ROOT, 'tests', 'sweeps', 'flawed-webapp-2026-11-15');

export async function run() {
  const fail = (m) => negFailures.push('checklist-sweep-set: ' + m);
  const variance = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'variance', ...args], { encoding: 'utf8' });
  const json = (r, what) => { try { return JSON.parse(r.stdout); } catch { fail(`${what}: variance --json prints JSON (exit ${r.status}: ${r.stderr.trim().split('\n')[0]})`); return null; } };
  const scratch = mkdtempSync(join(tmpdir(), 'assay-checklist-set-'));
  try {
    const { meta, runDirs } = loadSweepSet(SET);
    const set = join(scratch, 'set');
    for (const d of runDirs) cutToChecklist(d, join(set, d.split('/').pop()));
    const sweep = (thr, nm) => [
      'target: "the committed set, cut to checklist sweeps"', `target_commit: "${meta.target_commit}"`, `method_commit: "${meta.method_commit}"`, `date: "${meta.date}"`, 'blind: true',
      'threshold:', ...Object.entries(thr).map(([k, v]) => `  ${k}: ${v}`),
      ...(Object.keys(nm).length ? ['not_measured:', ...Object.entries(nm).map(([k, v]) => `  ${k}: "${v}"`)] : []),
      `sweeps: [${meta.sweeps.join(', ')}]`, ''].join('\n');
    const thr = { candidate_agreement: meta.threshold.candidate_agreement, descriptor_agreement: meta.threshold.descriptor_agreement, requirement_agreement: 1 };
    writeFileSync(join(set, 'SWEEP.yaml'), sweep(thr, { fact_presence: 'its sweeps ran in checklist mode' }));

    const fullR = variance(['--set', SET, '--json']), checkR = variance(['--set', set, '--json']);
    const full = json(fullR, 'the full set'), check = json(checkR, 'the checklist set');
    if (!full || !check) return;
    if (checkR.status !== 0) fail(`the checklist set holds its threshold (exit ${checkR.status}: ${(check.gate?.breaches || []).join('; ')})`);
    if (JSON.stringify(check.modes) !== JSON.stringify(runDirs.map(() => 'checklist'))) fail(`variance names each sweep's mode (got ${JSON.stringify(check.modes)})`);

    // (a)
    if (!check.candidates.answers?.compared) fail('(a) the checklist set compares candidates on their answers');
    for (const [k, what] of [['pct', 'per-candidate descriptor agreement'], ['answers', 'per-answer agreement'], ['legibility', 'gap agreement (which effects are opaque)'], ['scope', 'scope disagreements']])
      if (JSON.stringify(check.candidates[k]) !== JSON.stringify(full.candidates[k])) fail(`(a) the checklist set's ${what} reads as the full set's (full ${JSON.stringify(full.candidates[k]).slice(0, 120)}; checklist ${JSON.stringify(check.candidates[k]).slice(0, 120)})`);

    // (b)
    if (check.pct !== null || check.fact_presence?.status !== 'not-measured' || !/ran in checklist mode/.test(check.fact_presence?.reason || '')) fail(`(b) fact presence reads not measured, with the reason, never a number (got pct ${check.pct}, ${JSON.stringify(check.fact_presence)})`);
    const text = variance(['--set', set]).stdout;
    if (!/fact presence: not measured — a sweep ran in checklist mode/.test(text) || /caught by all \d+:\s+\d+\s+\(0%/.test(text)) fail('(b) the report prints fact presence not measured, with the reason, never 0%');
    const gated = join(scratch, 'gated'); cpSync(set, gated, { recursive: true });
    writeFileSync(join(gated, 'SWEEP.yaml'), sweep({ ...thr, fact_presence: 50 }, {}));
    const g = variance(['--set', gated, '--json']);
    const gj = json(g, 'a set gating fact presence');
    if (g.status !== 1 || !(gj?.gate?.breaches || []).some((b) => /fact presence not measured \(a sweep ran in checklist mode/.test(b))) fail(`(b) a threshold on fact presence over checklist sweeps is a breach naming it not measured (exit ${g.status})`);

    // (c)
    const decides = loadChecklist()?.decides || [];
    if (!check.requirements.decided || !/rows a checklist lane decides/.test(check.requirements.over || '')) fail(`(c) requirement agreement is measured over the rows the checklist decides, and says so (decided ${check.requirements.decided}, over ${check.requirements.over})`);
    for (const v of check.requirements.divergences) if (!decides.includes(v.id)) fail(`(c) ${v.id} is compared, a row the checklist does not decide`);

    // (d)
    const mixed = variance([runDirs[0], join(set, meta.sweeps[1]), '--json']);
    const mj = json(mixed, 'a mixed set');
    if (mixed.status !== 0 || JSON.stringify(mj?.modes) !== '["full","checklist"]' || mj?.pct !== null) fail(`(d) a set mixing a full and a checklist sweep, both answered, is measured, fact presence not measured (exit ${mixed.status}, modes ${JSON.stringify(mj?.modes)}, pct ${mj?.pct})`);
    const unanswered = join(ROOT, 'tests', 'sweeps', 'fixture-notesbox', 'sweep-1');
    const refused = variance([unanswered, join(set, meta.sweeps[1])]);
    if (refused.status !== 2 || !/mixes checklist and full sweeps, and sweep-1 carries no answers/.test(refused.stderr)) fail(`(d) a mixed set whose full sweep carries no answers is refused, naming it (exit ${refused.status}: ${refused.stderr.trim()})`);
    if (!readFileSync(join(set, meta.sweeps[1], 'map', 'scanners.yaml'), 'utf8').includes('mode: checklist')) fail('the cut sweeps record mode: checklist');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
