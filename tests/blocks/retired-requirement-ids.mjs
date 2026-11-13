// ── a stored run naming a retired requirement still loads, validates and compares (#311) ──
// #311 retired d-errors-reach-a-person, d-monitoring-with-alert and d-cost-alerts
// (yardstick/requirements.yaml retired:). A run measured before that names them in its
// yardstick.yaml, and not their successors. Pinned by writing the public notesbox run's
// measurement back into that shape:
//   (a) validate passes it, naming each retired id's successor, never as drift;
//   (b) compare reads each as retired, with its successor, never as yardstick-only;
//   (c) Since over it as the previous run lists each under retired, with successor and why;
//   (d) a baseline that held d-cost-alerts met is reported retired, never failed or dropped;
//   (e) a packet claim on a retired id is refused, naming its successor;
//   (f) the register's retired: list is whole: a live id, a successor that is no live row and
//       an entry with no why are each refused (validateRetired, run on load).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { validatePacket, requirementIdsOnDisk } from '../../yardstick/packet.mjs';
import { loadYardstick, validateRetired } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'retired-requirement-ids';

const RETIRED = { 'd-errors-reach-a-person': 'd-health-reported', 'd-monitoring-with-alert': 'd-expectations-declared', 'd-cost-alerts': 'd-routing-proportionate' };
const SUCCESSORS = ['d-expectations-declared', 'd-health-reported', 'd-routing-proportionate'];

export async function run() {
  const fail = (m) => negFailures.push('retired-requirement-ids: ' + m);
  const tmp = join(HERE, 'tmp-retired-requirement-ids'); rmSync(tmp, { recursive: true, force: true });
  const old = join(tmp, 'old'), cur = join(tmp, 'cur');
  const fx = join(HERE, 'fixtures', 'notesbox');
  cpSync(fx, old, { recursive: true }); cpSync(fx, cur, { recursive: true });
  const cli = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
  try {
    for (const d of [old, cur]) { const m = cli('yardstick/measure.mjs', [d, '--write']); if (m.status !== 0) fail(`setup: measure --write (${m.stderr})`); }
    // the stored measurement as the yardstick before #311 wrote it: the three retired rows in
    // place of their successors
    const y = join(old, 'yardstick.yaml');
    const text = readFileSync(y, 'utf8');
    const rowRe = (id) => new RegExp(`  - id: ${id}\\n(    .*\\n)+?(?=  - id: |contradictions:)`);
    let stored = text;
    for (const id of SUCCESSORS) { if (!rowRe(id).test(stored)) fail(`setup: the measurement carries ${id}`); stored = stored.replace(rowRe(id), ''); }
    const oldRows = Object.keys(RETIRED).map((id) => `  - id: ${id}\n    status: ${id === 'd-cost-alerts' ? 'met' : 'unmet'}\n    how: instrument\n    basis: run\n    findings: []\n    note: "measured before #311"\n`).join('');
    stored = stored.replace(/\ncontradictions:/, `\n${oldRows}contradictions:`);
    writeFileSync(y, stored);
    if (!Object.keys(RETIRED).every((id) => parseYaml(stored).requirements.some((r) => r.id === id))) fail('setup: the stored measurement names the three retired ids');

    // (a)
    const v = cli('map/validate.mjs', [old]);
    const said = v.stdout + v.stderr;
    if (v.status !== 0) fail(`(a) validate passes a stored run that names retired ids (got ${v.status}: ${said.split('\n').filter((l) => /retired|d-cost|d-errors|d-monitoring|carries/.test(l)).slice(0, 4).join(' | ')})`);
    for (const [id, succ] of Object.entries(RETIRED)) if (!new RegExp(`${id}: retired: ${succ} measures in its place`).test(said)) fail(`(a) validate names ${id} retired, pointing to ${succ}`);

    // (b)
    const c = cli('yardstick/compare.mjs', [y, join(cur, 'yardstick.yaml'), '--json']);
    let cmp = null; try { cmp = JSON.parse(c.stdout); } catch { fail(`(b) compare --json prints the comparison (got ${c.status}: ${c.stderr})`); }
    for (const [id, succ] of Object.entries(RETIRED)) {
      const r = cmp?.rows.find((x) => x.id === id);
      if (r?.classification !== 'retired' || r.successor !== succ) fail(`(b) compare reads ${id} retired → ${succ} (got ${r?.classification} → ${r?.successor})`);
    }

    // (c)
    const s = cli('views/since.mjs', [cur, '--previous', old]);
    if (s.status !== 0) fail(`(c) Since over the stored run exits 0 (got ${s.status}: ${s.stderr.split('\n')[0]})`);
    else {
      const since = parseYaml(readFileSync(join(cur, 'views', 'since.yaml'), 'utf8'));
      for (const [id, succ] of Object.entries(RETIRED)) {
        const r = (since.retired || []).find((x) => x.id === id);
        if (!r || r.successor !== succ || !r.why) fail(`(c) since.yaml lists ${id} retired, with successor ${succ} and why (got ${JSON.stringify(r)})`);
        if ((since.yardstick_only || []).some((x) => x.id === id)) fail(`(c) ${id} is retired, never yardstick-only`);
      }
      if (since.counts?.retired !== 3) fail(`(c) since.yaml counts 3 retired (got ${since.counts?.retired})`);
      const page = readFileSync(join(cur, 'SINCE.md'), 'utf8');
      if (!/## Retired requirements/.test(page) || !/d-cost-alerts\*\* — retired; read \*\*d-routing-proportionate\*\*/.test(page)) fail('(c) SINCE.md lists the retired requirements with their successors');
    }

    // (d)
    const base = join(tmp, 'baseline.yaml');
    const curDoc = parseYaml(readFileSync(join(cur, 'yardstick.yaml'), 'utf8'));
    writeFileSync(base, ['baseline: 1', 'yardstick: 0', 'accepted:', '  date: 2026-11-01', '  by: steward', 'commit: ""', 'requirements:',
      ...curDoc.requirements.filter((r) => !SUCCESSORS.includes(r.id)).flatMap((r) => [`  - id: ${r.id}`, `    status: ${r.status}`, `    basis: ${r.basis || 'run'}`]),
      '  - id: d-cost-alerts', '    status: met', '    basis: run'].join('\n') + '\n');
    const rt = cli('yardstick/ratchet.mjs', [cur, '--baseline', base]);
    if (rt.status !== 0) fail(`(d) a baseline that held a retired row does not fail the ratchet (got ${rt.status}: ${(rt.stderr || '').split('\n').slice(0, 3).join(' | ')})`);
    if (!/d-cost-alerts — .*met → retired → d-routing-proportionate/.test(rt.stdout)) fail(`(d) the ratchet reports d-cost-alerts retired, naming its successor (got ${rt.stdout.split('\n').slice(0, 4).join(' | ')})`);

    // (e)
    const errs = validatePacket({ version: 1, claims: [{ id: 'd-cost-alerts', state: 'satisfied', evidence: ['ops/evidence/d-cost-alerts.md'] }] }, { requirementIds: requirementIdsOnDisk() });
    if (!errs.some((e) => /"d-cost-alerts" is retired; d-routing-proportionate measures in its place/.test(e))) fail(`(e) a packet claim on a retired id is refused, naming its successor (got ${errs.join(' | ')})`);

    // (f)
    const reg = loadYardstick();
    if (validateRetired(reg).length) fail(`(f) the register's own retired: list validates (got ${validateRetired(reg).join(' | ')})`);
    const bad = (entry, re, what) => { const e = validateRetired({ ...reg, retired: [entry] }); if (!e.some((x) => re.test(x))) fail(`(f) ${what} is refused (got ${e.join(' | ') || 'nothing'})`); };
    bad({ id: 'd-runbook', successor: 'd-health-reported', why: 'x' }, /is a live requirement/, 'a retired id that is still a row');
    bad({ id: 'd-gone', successor: 'd-cost-alerts', why: 'x' }, /successor "d-cost-alerts" is not a live requirement/, 'a successor that is no live row');
    bad({ id: 'd-gone', successor: 'd-health-reported' }, /why required/, 'an entry with no why');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
