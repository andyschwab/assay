// ── a review reads the instruments' rows, and every tool a run executes is an instrument's (#232) ──
// Static analysis is an instrument (the opengrep-instrument block); the code reviewer's lane reads its
// rows like any other run output. Pinned:
//   (a) the reviewer's adapter pins no tool, so a run's tools are its instruments' alone;
//   (b) the reviewer's lane reads the static-analysis instrument's output in the run, the way it
//       reads fresh-clone's, and gives its rows to the review as leads;
//   (c) the scanner roster says what is true of the static-analysis rows, with no reviewer-only note
//       on the engine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinnedTools, runTools } from '../../map/tools.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures, adaptersOnce } from '../harness.mjs';

export const label = 'review-reads-instruments';

export async function run() {
  const fail = (m) => negFailures.push('review-reads-instruments: ' + m);
  const adapters = adaptersOnce();

  // (a)
  const dcr = adapters['deep-code-review'];
  if (!dcr || 'tools' in dcr) fail('(a) the reviewer\'s adapter pins no tool: the review executes nothing, and what it reads ran as an instrument');
  const run = runTools(pinnedTools(adapters));
  if (run.some((t) => adapters[t.scanner]?.role !== 'instrument')) fail(`(a) a run's tools are its instruments' alone (got ${run.filter((t) => adapters[t.scanner]?.role !== 'instrument').map((t) => `${t.scanner}/${t.bin}`).join(', ')})`);

  // (b)
  const sast = Object.entries(adapters).find(([, a]) => a.role === 'instrument' && a.adopted !== false && a.run?.rules)?.[0];
  if (!sast) fail('(b) a static-analysis instrument is adopted (an adapter whose run: carries rules)');
  const seed = laneSeed('deep-code-review', { name: 'Demo', inputsDir: '/inputs' }, adapters);
  for (const p of [`map/raw/${sast}.json`, 'map/raw/fresh-clone.json']) if (!seed.inputs.includes(p)) fail(`(b) the reviewer's lane reads ${p} (got ${seed.inputs.join(' ')})`);
  if (!/\bleads?\b/.test(seed.prompt) || !seed.prompt.includes(`map/raw/${sast}.json`)) fail('(b) the reviewer\'s lane gives the static-analysis rows to the review as leads');

  // (c)
  const roster = readFileSync(join(ROOT, 'map', 'scanners', 'CANDIDATES.md'), 'utf8');
  const engineRow = roster.split('\n').find((l) => /^\| Semgrep CE \|/.test(l)) || '';
  if (!engineRow || /\| reviewer-only \|/.test(engineRow)) fail('(c) the scanner roster\'s Semgrep CE row says what is true now, not reviewer-only');
  if (sast && !/\*\*adopted\*\* \(#232\)/.test(roster)) fail(`(c) the scanner roster names ${sast} adopted (#232)`);
}
