// ── a routing policy that notifies on every signal is a gap, not a strength (#311) ──
// The owner's direction: delivery is earned in stages. Every signal starts at record and is
// promoted to digest or notify only after it was seen quiet and accurate; a policy that sends
// everything immediately is the flood its readers mute. Over the public target
// tests/instruments/signals-target with every route moved to notify (each still naming a
// destination role and a budget, so nothing else is wrong), d-routing-proportionate reads
// unmet, its gap saying every route is at notify. One route left at record reads it met again:
// the census reads proportionality only at that deterministic edge.
import { readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { run as census } from '../../map/repo-census.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'operability-routing-flood';

const ID = 'd-routing-proportionate';

export async function run() {
  const fail = (m) => negFailures.push('operability-routing-flood: ' + m);
  const tmp = join(HERE, 'tmp-operability-routing-flood'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const reg = loadYardstick();
  const read = (dir) => {
    const doc = census({ target: dir, asOf: '2026-11-13' });
    const rows = convert('repo-census', JSON.stringify(doc), doc.exit);
    return { row: rows.find((x) => x.native_category === 'routing-policy'), r: measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg).find((x) => x.id === ID) };
  };
  try {
    cpSync(join(HERE, 'instruments', 'signals-target'), tmp, { recursive: true });
    const p = join(tmp, 'ops', 'routing.yaml');
    const policy = readFileSync(p, 'utf8');
    writeFileSync(p, policy.replace(/class: record/g, 'class: notify'));
    const flood = read(tmp);
    if (flood.r?.status !== 'unmet') fail(`a policy that notifies on every signal reads ${ID} unmet (got ${flood.r?.status}: ${flood.r?.note})`);
    if (flood.row?.polarity !== 'gap' || !/every one of its 4 route\(s\) is at notify/.test(flood.row?.observation || '')) fail(`the census's gap says every route is at notify (got ${flood.row?.polarity}: ${flood.row?.observation})`);

    let once = false;
    writeFileSync(p, policy.replace(/class: record/g, () => { if (!once) { once = true; return 'class: record'; } return 'class: notify'; }));
    const held = read(tmp);
    if (held.r?.status !== 'met') fail(`one signal held at record, the rest at notify, reads ${ID} met: the census reads only the all-notify edge (got ${held.r?.status}: ${held.r?.note})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
