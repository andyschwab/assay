#!/usr/bin/env node
// assay.mjs — the one CLI. Dispatches to the moved scripts with the same
// arguments they always took, so every existing invocation keeps its meaning
// under a stable name: `node assay.mjs <command> [args]`.
//
// One map (map/), drawn once; one yardstick (yardstick/) it is measured
// against; three views (views/) written from that measurement. Zero
// dependencies: this file is a thin process dispatcher over node itself.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// command → script, grouped for `help` in the same order they are listed.
const GROUPS = [
  ['Map — drawing the map', {
    'validate': 'map/validate.mjs',
    'ingest': 'map/ingest.mjs',
    'enumerate': 'map/enumerate.mjs',
    'fresh-clone': 'map/fresh-clone.mjs',
    'dependency-scan': 'map/dependency-scan.mjs',
    'repo-census': 'map/repo-census.mjs',
    'variance': 'map/variance.mjs',
    'score': 'map/score.mjs',
    'backlog': 'map/backlog.mjs',
    'chains': 'map/chains.mjs',
    'decisions': 'map/decisions.mjs',
    'supervision': 'map/supervision.mjs',
    'capabilities': 'map/capabilities.mjs',
  }],
  ['Yardstick — measuring the map against the requirements', {
    'measure': 'yardstick/measure.mjs',
  }],
  ['Views — Intake, Maintain, Improve', {
    'maturity': 'views/improve/maturity.mjs',
    'compile': 'views/compile.mjs',
  }],
];

const COMMANDS = Object.fromEntries(GROUPS.flatMap(([, cmds]) => Object.entries(cmds)));

function help() {
  console.log('assay — a map, a yardstick, three views.\n');
  console.log('Usage: node assay.mjs <command> [args]\n');
  for (const [label, cmds] of GROUPS) {
    console.log(label + ':');
    for (const name of Object.keys(cmds)) console.log(`  ${name}`);
    console.log('');
  }
}

const [, , cmd, ...args] = process.argv;
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { help(); process.exit(cmd ? 0 : 0); }

const script = COMMANDS[cmd];
if (!script) {
  console.error(`assay: unknown command "${cmd}"\n`);
  help();
  process.exit(2);
}

const r = spawnSync(process.execPath, [join(HERE, script), ...args], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
