// ── a model call site includes a local stand-in (#293, part of #257) ──
// A model call site is any place the application obtains model output: a provider's SDK or API
// call, or a stub or wrapper the application calls in place of one. enumerate lists a stand-in at
// its definition when the definition says so itself, its name a call-model verb or the comment
// directly above it naming a stand-in for a model call (map/enumerate.mjs §10). Pinned on
// tests/enumerate-fixture/stand-ins:
//   (a) callModel, call_llm and a function under a "stand-in for the model call" comment are each
//       listed once, the definition line their evidence;
//   (b) a file that only calls the stand-in, a function for a database model and a test file's
//       stub list nothing;
//   (c) d-model-call-telemetry's population says a stand-in is a member, and that one enumerate
//       misses is a member outside the list.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';

export const label = 'model-call-stand-in';

const WANT = { 'model call: app/model.py': ['app/model.py:1'], 'model call: lib/agent.mjs': ['lib/agent.mjs:7'], 'model call: lib/complete.mjs': ['lib/complete.mjs:5'] };

export async function run() {
  const fail = (m) => negFailures.push('model-call-stand-in: ' + m);
  const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'enumerate', join(HERE, 'enumerate-fixture', 'stand-ins'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let pops = null;
  try { pops = JSON.parse(r.stdout).populations; } catch { fail(`enumerate --json over the stand-ins fixture must print the populations (exit ${r.status}): ${String(r.stderr).slice(0, 200)}`); }
  if (pops) {
    const got = Object.fromEntries((pops.modelCalls || []).map((x) => [x.member, x.evidence]));
    const keys = Object.keys(got).sort();
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(WANT).sort())) fail(`modelCalls over the stand-ins fixture must list each stand-in's file once, and no caller, database model or test file (want ${Object.keys(WANT).join(' | ')}; got ${keys.join(' | ') || 'none'})`);
    for (const [k, ev] of Object.entries(WANT)) if (got[k] && JSON.stringify(got[k]) !== JSON.stringify(ev)) fail(`${k}: its evidence is the stand-in's definition line (want ${ev}; got ${got[k]})`);
  }
  const row = loadYardstick().requirements.find((d) => d.id === 'd-model-call-telemetry');
  const check = String(row?.check ?? '');
  if (!/a local stand-in/.test(check) || !/in place of one/.test(check)) fail('d-model-call-telemetry\'s population names a local stand-in, a stub or wrapper the application calls in place of a provider call');
  if (!/stand-in enumerate does not list is a member outside the list/.test(check)) fail('d-model-call-telemetry\'s check says a stand-in enumerate does not list is a member outside the list');
}
