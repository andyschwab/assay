// ── a committed answered sweep, cut to its checklist subset, measures as the full sweep does (#338) ──
// The checklist mode writes exactly what the effect rows read. The proof is the committed answered
// sweeps themselves: each sweep cut down to the terrain, its input list, the triage and the
// delegation pass's effect findings (tests/checklist-cut.mjs), nothing re-judged. Pinned:
//   (a) the cut validates as a checklist run: collected, its record saying `mode: checklist`, and as
//       the lane's own scratch run, `validate --lane practice-review --mode checklist --target`
//       against the tree the set read (where the clone holds that commit);
//   (b) its d-effect-facts-legible row reads exactly as the full sweep's, and so does every row the
//       checklist decides (map/passes.yaml checklist:);
//   (c) every other row the lane decides reads not measured, its note saying the lane ran in
//       checklist mode, never met, never unmet; every row no lane decides reads as the full sweep's;
//   (d) the views say so: Owner's "What was not looked at" names the lane as partial with the rows
//       it left not measured, and the INDEX's yardstick glance names them too.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cutToChecklist } from '../checklist-cut.mjs';
import { projectRun } from '../../yardstick/measure.mjs';
import { loadChecklist } from '../../map/passes.mjs';
import { loadSweepSet } from '../../map/variance.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'checklist-run-measures';

const ROW = 'd-effect-facts-legible';
// the committed sets whose sweeps answer the checklist (a version 2 triage)
export const answeredSets = () => readdirSync(join(ROOT, 'tests', 'sweeps'), { withFileTypes: true }).filter((e) => e.isDirectory())
  .map((e) => join(ROOT, 'tests', 'sweeps', e.name))
  .filter((d) => { try { return /^version: 2$/m.test(readFileSync(join(loadSweepSet(d).runDirs[0], 'map', 'effect-triage.yaml'), 'utf8')); } catch { return false; } });

export async function run() {
  const fail = (m) => negFailures.push('checklist-run-measures: ' + m);
  const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
  const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ');
  const decides = new Set(loadChecklist()?.decides || []);
  const sets = answeredSets();
  if (sets.length < 2) fail(`the proof reads the committed answered sets, at least two (found ${sets.length})`);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-checklist-run-'));
  try {
    let scratchChecked = 0;
    for (const set of sets) {
      const { meta, runDirs } = loadSweepSet(set);
      const name = set.split('/').pop();
      for (const sweep of runDirs) {
        const at = `${name}/${sweep.split('/').pop()}`;
        const { dest } = cutToChecklist(sweep, join(scratch, name, sweep.split('/').pop()));
        // (a) collected
        const v = assay(['validate', dest]);
        if (v.status !== 0) fail(`(a) ${at}, cut to its checklist subset, validates as a checklist run (got ${v.status}: ${bullets(v)})`);
        // (a) the lane's own check, against the tree the set read, where this clone holds that commit
        const has = spawnSync('git', ['cat-file', '-e', `${meta.target_commit}^{commit}`], { cwd: ROOT }).status === 0;
        if (has && sweep === runDirs[0]) {
          const tree = join(scratch, `${name}-tree`); mkdirSync(tree, { recursive: true });
          execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${meta.target_commit} | tar -x -C "${tree}"`]);
          const lane = join(scratch, `${name}-lane`);
          cutToChecklist(sweep, lane, { record: false });
          const own = assay(['validate', lane, '--lane', 'practice-review', '--mode', 'checklist', '--target', tree]);
          if (own.status !== 0 || !/the run record was not checked/.test(own.stdout)) fail(`(a) ${at}'s cut, as the lane's own scratch run, passes validate --lane practice-review --mode checklist against ${meta.target_commit.slice(0, 7)} (got ${own.status}: ${bullets(own)})`);
          else scratchChecked += 1;
        }
        const full = projectRun(sweep, undefined, null), cut = projectRun(dest, undefined, null);
        const byId = new Map(full.map((r) => [r.id, r]));
        const same = (a, b) => a && b && a.status === b.status && a.note === b.note && a.met === b.met && a.of === b.of && JSON.stringify(a.findings) === JSON.stringify(b.findings) && JSON.stringify(a.gaps || null) === JSON.stringify(b.gaps || null);
        for (const r of cut) {
          const f = byId.get(r.id);
          // (b)
          if (decides.has(r.id)) { if (!same(f, r)) fail(`(b) ${at}: ${r.id}, a row the checklist decides, reads as the full sweep's (full ${f && f.status}: ${f && f.note}; checklist ${r.status}: ${r.note})`); continue; }
          // (c)
          if (r.kind === 'facet' || r.kind === 'census') {
            if (r.status !== 'not-measured' || !/the practice-review lane ran in checklist mode/.test(r.note)) fail(`(c) ${at}: ${r.id} reads not measured, saying the lane ran in checklist mode (got ${r.status}: ${r.note})`);
          } else if (!same(f, r)) fail(`(c) ${at}: ${r.id}, a row no lane decides, reads as the full sweep's (full ${f && f.status}; checklist ${r.status})`);
        }
        if (!cut.some((r) => r.id === ROW)) fail(`(b) ${at}: the measurement has a ${ROW} row`);
      }
    }
    if (!scratchChecked) fail('(a) at least one answered set is checked as the lane\'s own run against the tree it read (no set\'s target commit is in this clone)');

    // (d) the views, over one cut
    const one = join(scratch, 'compiled');
    const src = loadSweepSet(sets[0]).runDirs[0];
    cutToChecklist(src, one);
    const c = assay(['compile', one]);
    if (c.status !== 0) fail(`(d) a checklist run compiles (got ${c.status}: ${(c.stderr || c.stdout).trim().split('\n').slice(-2).join(' | ')})`);
    else {
      const left = projectRun(one, undefined, null).filter((r) => r.status === 'not-measured' && /ran in checklist mode/.test(r.note)).map((r) => r.id);
      const owner = readFileSync(join(one, 'OWNER.md'), 'utf8');
      const notLooked = owner.slice(owner.indexOf('## What was not looked at'));
      const line = notLooked.split('\n').find((l) => l.startsWith('- **practice-review** — partial: ran in checklist mode'));
      if (!line) fail('(d) OWNER.md\'s "What was not looked at" names the practice-review lane as partial, run in checklist mode');
      else for (const id of left) if (!line.includes(id)) fail(`(d) OWNER.md's "What was not looked at" names ${id}, a row the mode left not measured`);
      const index = readFileSync(join(one, 'INDEX.md'), 'utf8');
      if (!new RegExp(`The practice-review lane ran in checklist mode: it answered only the effect checklist, so ${left.length} requirement\\(s\\) it decides in full read not measured`).test(index)) fail(`(d) INDEX.md's yardstick glance says the lane ran in checklist mode and the ${left.length} rows it left not measured`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
