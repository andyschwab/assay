// ── the signals' markers are data, and no scanner bears on them (#315 slice 3; CLAUDE.md rule 7;
// map/effect-signals.yaml, map/effect-signals.mjs) ──
//  1. every marker is read from map/effect-signals.yaml, each entry with its reason: in a scratch
//     copy of the engine, renaming a marker in the data file (the apply flag, the limiter module, the
//     environment key, the dispatch trigger, the soft-delete column) takes its signal away, and
//     nothing else moves; neither module that reads a signal writes a marker as a literal;
//  2. renaming every scanner (each adapter's id and file) changes no signal;
//  3. a data file with an entry that gives no reason halts enumerate, never reads as no markers.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'signals-markers-data';

const FIXTURE = join(HERE, 'enumerate-fixture', 'signals');
// candidate → its signals, one line each: question supports (marker)
function signalsBy(root) {
  const r = spawnSync(process.execPath, [join(root, 'map', 'enumerate.mjs'), FIXTURE, '--json'], { encoding: 'utf8' });
  if (r.status !== 0) return { error: `exit ${r.status}: ${r.stderr.slice(0, 300)}` };
  const doc = JSON.parse(r.stdout);
  const out = {};
  for (const p of ['channelCandidates', 'routeHandlers', 'effectSites']) for (const c of doc.populations[p]) out[c.member] = (c.signals || []).map((s) => `${s.question} ${s.supports} (${s.marker}) ${s.evidence.join(',')}`).sort();
  return out;
}
const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);

export async function run() {
  const fail = (m) => negFailures.push('signals-markers-data: ' + m);
  const base = signalsBy(ROOT);
  if (base.error) { fail(`enumerate over the fixture: ${base.error}`); return; }
  const tmp = mkdtempSync(join(tmpdir(), 'assay-signals-markers-'));
  const copy = (name) => {
    const root = join(tmp, name);
    for (const d of ['map', 'lib', 'yardstick']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
    return root;
  };
  try {
    // (1) each marker, renamed in the data file, takes its own signal and only its own
    const markers = readFileSync(join(ROOT, 'map', 'effect-signals.yaml'), 'utf8');
    const cases = [
      ['flag: "--apply"', 'flag: "--commit-it"', 'http write (js) @ scripts/prune.mjs', 'second_act'],
      ['module: express-rate-limit', 'module: some-other-limiter', 'route: POST /notes', 'rate_limit'],
      ['key: environment', 'key: approval-gate', 'release write (workflow) @ .github/workflows/release.yml', 'refuses_unless'],
      ['trigger: workflow_dispatch', 'trigger: manual_start', 'release write (workflow) @ .github/workflows/release.yml', 'person_act'],
      ['column: deleted_at', 'column: gone_at', 'route: DELETE /notes/:id', 'window'],
    ];
    cases.forEach(([from, to, member, q], i) => {
      if (markers.split(from).length !== 2) { fail(`(1) the data file holds ${from} once`); return; }
      const root = copy(`m${i}`);
      writeFileSync(join(root, 'map', 'effect-signals.yaml'), markers.replace(from, to));
      const got = signalsBy(root);
      if (got.error) { fail(`(1) ${from} → ${to}: ${got.error}`); return; }
      const moved = diff(base, got);
      if (moved.length !== 1 || !moved[0].startsWith(member + ':') || (got[member] || []).some((s) => s.startsWith(q + ' ')) || !(base[member] || []).some((s) => s.startsWith(q + ' ')))
        fail(`(1) renaming ${from} in the data file takes ${member}'s ${q} signal and moves nothing else (moved: ${moved.join('; ') || 'nothing'})`);
    });
    const doc = parseYaml(markers);
    const literals = [
      ...doc.scripts.apply_flags.map((e) => e.flag), ...doc.routes.limiter_modules.map((e) => e.module),
      ...doc.soft_delete.columns.map((e) => e.column), ...doc.workflow.triggers.person.map((e) => e.trigger),
      ...doc.workflow.triggers.automatic.map((e) => e.trigger), ...doc.workflow.job_keys.map((e) => e.key),
      ...doc.scripts.dry_run_words,
    ];
    for (const f of ['map/effect-signals.mjs', 'map/enumerate.mjs']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of literals) if (new RegExp(`['"\`]${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(src)) fail(`(1) ${f} writes the marker ${JSON.stringify(m)} as a literal; markers live in map/effect-signals.yaml`);
    }

    // (2) every scanner renamed: the same signals
    const root = copy('renamed');
    const adir = join(root, 'map', 'scanners', 'adapters');
    let renamed = 0;
    for (const f of readdirSync(adir).filter((x) => x.endsWith('.yaml'))) {
      const t = readFileSync(join(adir, f), 'utf8');
      const id = (t.match(/^scanner:\s*(\S+)/m) || [])[1];
      if (!id) continue;
      writeFileSync(join(adir, f), t.replace(/^scanner:\s*\S+/m, `scanner: renamed-${renamed}`));
      renameSync(join(adir, f), join(adir, `renamed-${renamed}.yaml`));
      renamed++;
    }
    if (renamed < 3) fail(`(2) the copy renames every adapter's scanner (renamed ${renamed})`);
    const got = signalsBy(root);
    if (got.error) fail(`(2) enumerate with every scanner renamed: ${got.error}`);
    else { const moved = diff(base, got); if (moved.length) fail(`(2) renaming every scanner changes no signal (moved: ${moved.join('; ')})`); }

    // (3) an entry with no reason halts enumerate
    const bad = copy('bad');
    writeFileSync(join(bad, 'map', 'effect-signals.yaml'), markers.replace(/(- flag: "--yes"\n)\s+reason: [^\n]*\n/, '$1'));
    const r = spawnSync(process.execPath, [join(bad, 'map', 'enumerate.mjs'), FIXTURE, '--json'], { encoding: 'utf8' });
    if (r.status === 0 || !/scripts\.apply_flags\[1\] \(--yes\): says why \(reason\)/.test(r.stderr)) fail(`(3) a marker with no reason must halt enumerate, naming it (exit ${r.status}): ${r.stderr.slice(0, 300)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
