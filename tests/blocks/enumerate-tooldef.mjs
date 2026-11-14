// ── enumerate agent tool-def detector: it must surface an in-code tool table
// (name + input_schema) and a remote MCP toolset as channel candidates, and must
// NOT offer a tool defined only in a test file. Shells out to the real CLI
// against the same self-contained fixture target.
//
// Re-pinned (#315): a test file's tool was skipped, so the assertion read "never in the output".
// It is now listed under `excluded` with its reason (out of scope by construction, never offered for
// triage), so the assertion reads the populations: never a channel candidate, and excluded.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-tooldef';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-tooldef: ' + m);
  let out = '';
  try { out = execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), join(HERE, 'enumerate-fixture', 'target')], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || '') + String(e.message || ''); }
  for (const need of ['tool: send_thing', 'tool: read_thing', 'mcp-toolset: analytics']) {
    if (!out.includes(need)) fail(`enumerate did not surface "${need}" — the agent tool-def detector regressed`);
  }
  let doc = null;
  try { doc = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), join(HERE, 'enumerate-fixture', 'target'), '--json'], { encoding: 'utf8' })); } catch { /* reported below */ }
  const pops = doc && doc.populations;
  if (!pops) { fail('enumerate --json did not print the populations'); return; }
  if (pops.channelCandidates.some((c) => c.member.includes('fixture_only_tool'))) fail('enumerate offered a tool defined only in a test file as a channel candidate — the test-file rule regressed');
  const x = (pops.excluded || []).find((c) => c.member.includes('fixture_only_tool'));
  if (!x || x.population !== 'channelCandidates' || !/test file/.test(x.reason || '')) fail(`a tool defined only in a test file must be listed under excluded, from channelCandidates, with its reason (got ${JSON.stringify(x)})`);
}
