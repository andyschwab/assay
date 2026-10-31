#!/usr/bin/env node
// list.mjs — the register's rows, read off yardstick/requirements.yaml (#229).
//
// A consumer reads the floor here instead of naming its rows by heart: the floor moves
// (#161), and a row a consumer hard-coded can leave it. The rows print in file order,
// read through loadYardstick, so a register that does not validate prints nothing and
// fails.
//
// Usage:  node assay.mjs yardstick [--floor] [--json]
//   --floor   only the rows tagged floor (the rows Intake reads)
//   --json    { floor, requirements: [{ id, title, tier, topic, tags, harm }] }
import { isMain } from '../map/doctrine.mjs';
import { loadYardstick } from './measure.mjs';

const FLAGS = ['--floor', '--json'];

// The register's rows, or only its floor rows, as a consumer reads them.
function listRequirements(reg, { floor = false } = {}) {
  return reg.requirements
    .filter((d) => !floor || (d.tags || []).includes('floor'))
    .map((d) => ({ id: d.id, title: d.title, tier: d.tier, topic: d.topic, tags: d.tags || [], harm: d.harm || [] }));
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !FLAGS.includes(a));
  if (unknown.length) { console.error(`usage: node assay.mjs yardstick [--floor] [--json] (unknown: ${unknown.join(' ')})`); process.exit(2); }
  const floor = args.includes('--floor');
  let reg;
  try { reg = loadYardstick(); }
  catch (e) { console.error(`✗ assay yardstick: the register does not validate (nothing listed):\n${e.message}`); process.exit(1); }
  const rows = listRequirements(reg, { floor });
  if (args.includes('--json')) console.log(JSON.stringify({ floor, requirements: rows }, null, 1));
  else {
    for (const r of rows) console.log(`${r.id.padEnd(36)} ${r.tier.padEnd(16)} ${(floor ? r.harm : r.tags).join(',').padEnd(20)} ${r.title}`);
    console.log(`\n${rows.length} ${floor ? 'floor ' : ''}requirement(s) of ${reg.requirements.length}`);
  }
}
