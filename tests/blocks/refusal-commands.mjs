// ── the commands a refused run prints select exactly what the gate checks (#203) ──
// A run refused for want of its tools prints how to fix it. Followed verbatim, that fix must install and verify
// the gate's set: not a review session's own tools (more than the run needs), and not less (a verify that
// passes while start still refuses). Pinned:
//   (a) the refusal prints an install and a verify command, each with --run;
//   (b) each printed command, its arguments read as the CLI reads them, selects exactly the gate's tools, also
//       beside a planted tool only a review session runs (every pinned tool is in the run's set today);
//   (c) the CLI selects through the same function, so --run composes with the other filters:
//       `tools verify --run --role instrument` names exactly the run's instruments.
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolsNotReady, selectTools, runTools, pinnedTools, INSTALL_FOR_RUN, VERIFY_FOR_RUN } from '../../map/tools.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'refusal-commands';

export async function run() {
  const fail = (m) => negFailures.push('refusal-commands: ' + m);
  const gate = runTools().map((t) => `${t.scanner}/${t.bin}`).sort();
  if (!gate.length) { fail('the gate checks at least one tool'); return; }

  // (a)
  const refusal = toolsNotReady([{ scanner: 'x', bin: 'x', version: '1', status: 'absent', detail: 'x is not on PATH' }]) || '';
  const printed = [...refusal.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const install = printed.find((c) => /\btools install\b/.test(c)), verify = printed.find((c) => /\btools verify\b/.test(c));
  if (!install || !verify) { fail(`(a) the refusal prints an install and a verify command (got ${JSON.stringify(printed)})`); return; }
  for (const c of [install, verify]) if (!/(^|\s)--run(\s|$)/.test(c)) fail(`(a) the printed command selects the gate's set with --run (got ${c})`);
  if (install !== INSTALL_FOR_RUN || verify !== VERIFY_FOR_RUN) fail('(a) the refusal prints the commands the engine names for a run');

  // (b)
  const sessionOnly = { scanner: 'planted-review', bin: 'planted-tool', version: '1', role: 'judgment' };
  for (const c of [install, verify]) {
    const args = c.split(/\s+/).slice(c.split(/\s+/).indexOf('tools') + 2);
    const chosen = selectTools(args, [...pinnedTools(), sessionOnly]).map((t) => `${t.scanner}/${t.bin}`).sort();
    if (JSON.stringify(chosen) !== JSON.stringify(gate)) fail(`(b) "${c}" selects exactly the gate's tools (selects ${chosen.join(', ')}; the gate checks ${gate.join(', ')})`);
  }

  // (c)
  const instruments = runTools().filter((t) => t.role === 'instrument').map((t) => `${t.scanner}/${t.bin}`).sort();
  if (!instruments.length || instruments.length === gate.length) { fail('test setup: the run\'s set holds instruments and a tool that is not one'); return; }
  const out = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'tools', 'verify', '--run', '--role', 'instrument'], { encoding: 'utf8' });
  const named = [...String(out.stdout + out.stderr).matchAll(/^\s*[✓✗] (\S+) \((\S+)\)/gm)].map((m) => `${m[1]}/${m[2]}`).sort();
  if (JSON.stringify(named) !== JSON.stringify(instruments)) fail(`(c) \`tools verify --run --role instrument\` names exactly the run's instruments (named ${named.join(', ') || 'none'}; want ${instruments.join(', ')})`);
}
