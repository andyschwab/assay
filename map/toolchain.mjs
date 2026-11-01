#!/usr/bin/env node
// toolchain.mjs — a checkout's toolchain, read without executing anything (#236).
//
// fresh-clone runs the target's own install and scripts, so a run drawn without
// --allow-exec records it skipped. A consumer that dispatches that measurement to a
// machine of its own still needs to know which toolchain the checkout carries: this
// prints fresh-clone's own detection (detectToolchain, which reads files and runs
// nothing), so the two can never disagree.
//
// Usage: node assay.mjs toolchain <checkout> [--json]
// --json prints { toolchain: { family, manifest, package_manager, lockfile, declared,
// other_families, database_signals, … } } (views/README.md is not its home: the fields
// are fresh-clone's, map/fresh-clone.mjs).
import { statSync } from 'node:fs';
import { isMain } from './doctrine.mjs';
import { detectToolchain } from './fresh-clone.mjs';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  if (!dir) { console.error('usage: node assay.mjs toolchain <checkout> [--json]'); process.exit(2); }
  if (!isDir(dir)) { console.error(`✗ toolchain: ${dir} is not a directory`); process.exit(2); }
  const { toolchain } = detectToolchain(dir);
  if (args.includes('--json')) console.log(JSON.stringify({ toolchain }, null, 2));
  else {
    console.log(`family: ${toolchain.family}${toolchain.package_manager ? ` (${toolchain.package_manager}${toolchain.lockfile ? `, ${toolchain.lockfile}` : ', no lockfile'})` : ''}`);
    for (const o of toolchain.other_families) if (o.family !== toolchain.family) console.log(`also: ${o.family} (${o.files.join(', ')}), ${o.support}`);
    if (toolchain.database_signals.length) console.log(`database signals: ${toolchain.database_signals.join(', ')}`);
  }
}
