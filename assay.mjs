#!/usr/bin/env node
// assay.mjs — the command line: `node assay.mjs <command> [args]` runs one
// engine script with its arguments.
//
// One map (map/), drawn once; one yardstick (yardstick/) it is measured
// against; three views (views/) written from that measurement. Zero
// dependencies: this file is a thin process dispatcher over node itself.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// command → [script, what it does], grouped for `help` in the order listed.
const GROUPS = [
  ['Map: drawing the map', {
    'validate': ['map/validate.mjs', 'check a run: schema, ids, citations, the run record; fails closed'],
    'ingest': ['map/ingest.mjs', "turn a scanner's output into findings in a run"],
    'enumerate': ['map/enumerate.mjs', 'list the populations a run must cover, and gate on coverage'],
    'fresh-clone': ['map/fresh-clone.mjs', 'install, build, lint, typecheck, test and migrate from a clean checkout'],
    'dependency-scan': ['map/dependency-scan.mjs', 'npm audit over every lockfile'],
    'repo-census': ['map/repo-census.mjs', 'architecture page, agent contract, runbook, CI gate, owner evidence'],
    'chains': ['map/chains.mjs', 'the attack paths through the map'],
    'capabilities': ['map/capabilities.mjs', 'one row per effect channel'],
    'supervision': ['map/supervision.mjs', 'which irreversible or outward actions a person supervises'],
    'decisions': ['map/decisions.mjs', "the owner's triage of findings, overlaid on a run"],
    'variance': ['map/variance.mjs', 'repeatability across runs of one target'],
    'score': ['map/score.mjs', "grade a run against a fixture's known answers"],
    'backlog': ['map/backlog.mjs', "the determinism and coverage gaps a run exposed in the method"],
  }],
  ['Yardstick: measuring the map against the requirements', {
    'measure': ['yardstick/measure.mjs', 'per requirement: met, unmet, mixed or not measured'],
    'validate-packet': ['yardstick/packet.mjs', "validate a repository's own packet (owner/PACKET.md); fails closed"],
    'ask-owner': ['owner/ask-owner.mjs', 'print the owner prompt, prefilled with what a run already shows'],
  }],
  ['Views: Intake, Maintain, Improve', {
    'compile': ['views/compile.mjs', 'measure, then write all three views and the index'],
    'intake': ['views/intake.mjs', 'the Intake view alone, from an existing measurement'],
    'maintain': ['views/maintain.mjs', 'the Maintain view alone, from an existing measurement'],
    'maturity': ['views/improve/maturity.mjs', "Improve's maturity coverage per dimension"],
  }],
];

const COMMANDS = Object.fromEntries(GROUPS.flatMap(([, cmds]) => Object.entries(cmds).map(([k, v]) => [k, v[0]])));

function help() {
  console.log('assay: a map, a yardstick, three views.\n');
  console.log('Usage: node assay.mjs <command> [args]\n');
  for (const [label, cmds] of GROUPS) {
    console.log(label);
    for (const [name, [, what]] of Object.entries(cmds)) console.log(`  ${name.padEnd(16)} ${what}`);
    console.log('');
  }
}

const [, , cmd, ...args] = process.argv;
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { help(); process.exit(0); }

const script = COMMANDS[cmd];
if (!script) {
  console.error(`assay: unknown command "${cmd}"\n`);
  help();
  process.exit(2);
}

const r = spawnSync(process.execPath, [join(HERE, script), ...args], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
