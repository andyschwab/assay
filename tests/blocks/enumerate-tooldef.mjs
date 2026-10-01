// ── enumerate agent tool-def detector: it must surface an in-code tool table
// (name + input_schema) and a remote MCP toolset as channel candidates, and must
// NOT surface a tool defined only in a test file. Shells out to the real CLI
// against the same self-contained fixture target.
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
  if (out.includes('fixture_only_tool')) fail('enumerate surfaced a tool defined only in a test file — the test-file skip regressed');
}
