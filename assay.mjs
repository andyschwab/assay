#!/usr/bin/env node
// assay.mjs — the command line: `node assay.mjs <command> [args]` runs one
// engine script with its arguments.
//
// One map (map/), drawn once; one yardstick (yardstick/) it is measured
// against; four views (views/) written from that measurement, plus Since
// when there is a previous run to compare against. Zero
// dependencies: this file is a thin process dispatcher over node itself.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// command → [script, what it does], grouped for `help` in the order listed. Only a
// script with a command-line body is a command: map/chains, capabilities,
// supervision and decisions are libraries the views compute from, not commands.
const GROUPS = [
  ['Map: drawing the map', {
    'start': ['map/start.mjs', 'make a run, draw it with every offline instrument, and record the rest (fresh-clone, and structure-scan\'s knip step, only with --allow-exec; fresh-clone needs a git repository: over a plain tree it is recorded skipped)'],
    'validate': ['map/validate.mjs', 'check a run: schema, ids, citations, the run record; fails closed'],
    'ingest': ['map/ingest.mjs', "turn a scanner's output into findings in a run"],
    'record': ['map/record.mjs', "set one scanner's disposition in the run record"],
    'enumerate': ['map/enumerate.mjs', 'list the populations a run must cover, and gate on coverage'],
    'fresh-clone': ['map/fresh-clone.mjs', "EXECUTES THE TARGET'S CODE: install, build, lint, typecheck, test, migrate from a clean checkout"],
    'dependency-scan': ['map/dependency-scan.mjs', "RUNS THE TARGET'S PACKAGE MANAGER: npm, pnpm and yarn audit over every lockfile, from scratch copies"],
    'structure-scan': ['map/structure-scan.mjs', 'duplication (jscpd), unused code (knip, which loads the target\'s own tool configs: --no-exec skips it), stale artifacts and churn; installs both tools from the npm registry into scratch'],
    'repo-census': ['map/repo-census.mjs', 'architecture page, agent contract, runbook, CI gate, owner evidence'],
    'variance': ['map/variance.mjs', 'repeatability across runs of one target'],
    'score': ['map/score.mjs', "grade a run against a fixture's known answers"],
    'backlog': ['map/backlog.mjs', "the determinism and coverage gaps a run exposed in the method"],
    'roster': ['map/roster.mjs', 'per scanner: what it alone decides, what would read not measured if retired, and over runs its unique recoveries, corroborations and cost'],
  }],
  ['Yardstick: measuring the map against the requirements', {
    'measure': ['yardstick/measure.mjs', 'per requirement: met, unmet, mixed or not measured'],
    'ratchet': ['yardstick/ratchet.mjs', 'fail when a baseline requirement regresses or drops off the scale'],
    'validate-packet': ['yardstick/packet.mjs', "validate a repository's own packet (owner/PACKET.md); fails closed"],
    'ask-owner': ['owner/ask-owner.mjs', 'print the owner prompt, prefilled with what a run already shows'],
  }],
  ['Views: Intake, Maintain, Improve, Owner, Since', {
    'compile': ['views/compile.mjs', 'measure, then write every view and the index'],
    'intake': ['views/intake.mjs', 'the Intake view alone, from an existing measurement'],
    'maintain': ['views/maintain.mjs', 'the Maintain view alone, from an existing measurement'],
    'owner': ['views/owner.mjs', "the Owner view alone: what is true of it, in the owner's own register"],
    'since': ['views/since.mjs', 'what changed since a previous run — regressions, improvements, new/gone findings'],
    'maturity': ['views/improve/maturity.mjs', "Improve's maturity coverage per dimension"],
  }],
];

const COMMANDS = Object.fromEntries(GROUPS.flatMap(([, cmds]) => Object.entries(cmds).map(([k, v]) => [k, v[0]])));

function help() {
  console.log('assay: a map, a yardstick, four views (plus Since).\n');
  console.log('Usage: node assay.mjs <command> [args]\n');
  console.log("fresh-clone, dependency-scan and structure-scan execute the target's code (install, scripts, its package manager, knip's load of its tool config)");
  console.log('with an allow-listed environment only; run them in a disposable container or VM.\n');
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
