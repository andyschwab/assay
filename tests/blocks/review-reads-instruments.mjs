// ── a review reads the instruments' rows, and no tool runs only for it (#232) ──
// Static analysis ran apart from the instruments, for the code reviewer alone, and wrote a report
// in the reviewer's own input format; it decided nothing. It is an instrument now (the
// opengrep-instrument block), and the path that ran it for the review is retired whole. Pinned:
//   (a) nothing in the tree names the retired path: its field, its runner and its path helper,
//       the run folder it wrote, or the directories its rules and control were vendored in;
//   (b) no adapter carries the retired field, and a tool block that does is a problem of the
//       block; the reviewer's adapter pins no tool, so a run's tools are its instruments' alone;
//   (c) the reviewer's lane reads the static-analysis instrument's output in the run, the way it
//       reads fresh-clone's, and gives its rows to the review as leads;
//   (d) the scanner roster says what is true now of the static-analysis rows, with no
//       reviewer-only note on the engine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinnedTools, runTools, toolBlockProblems } from '../../map/tools.mjs';
import * as start from '../../map/start.mjs';
import { laneSeed } from '../../map/lane.mjs';
import { ROOT, negFailures, repoFiles, adaptersOnce } from '../harness.mjs';

export const label = 'review-reads-instruments';

const SELF = 'tests/blocks/review-reads-instruments.mjs';
// written split so this file does not hold them whole
const RETIRED = [['before', 'review'].join('_'), ['runBefore', 'Review'].join(''), ['beforeReview', 'Path'].join(''), ['raw', 'before-review'].join('/'), ['semgrep', 'taint'].join('-'), ['semgrep', 'control'].join('-')];

export async function run() {
  const fail = (m) => negFailures.push('review-reads-instruments: ' + m);
  const adapters = adaptersOnce();

  // (a)
  for (const f of repoFiles()) {
    if (f === SELF) continue;
    if (RETIRED.some((r) => f.includes(r))) { fail(`(a) ${f}: a path names the retired path`); continue; }
    let t; try { t = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const r of RETIRED) if (t.includes(r)) fail(`(a) ${f} names the retired ${r}`);
  }
  for (const k of [['runBefore', 'Review'].join(''), ['beforeReview', 'Path'].join('')]) if (k in start) fail(`(a) map/start.mjs exports the retired ${k}`);

  // (b)
  const field = ['before', 'review'].join('_');
  for (const [id, a] of Object.entries(adapters)) for (const t of [].concat(a.tool || [], a.tools || [])) if (t && field in t) fail(`(b) adapters/${id}.yaml carries the retired ${field}`);
  if (!toolBlockProblems({ bin: 'x', version: '1', upstream: 'pypi:x', pypi: 'x', [field]: {} }).some((p) => new RegExp(`tool\\.${field} is retired`).test(p))) fail(`(b) a tool block carrying ${field} is a problem of the block`);
  const dcr = adapters['deep-code-review'];
  if (!dcr || 'tools' in dcr) fail('(b) the reviewer\'s adapter pins no tool: the review executes nothing, and what it reads ran as an instrument');
  const run = runTools(pinnedTools(adapters));
  if (run.some((t) => adapters[t.scanner]?.role !== 'instrument')) fail(`(b) a run's tools are its instruments' alone (got ${run.filter((t) => adapters[t.scanner]?.role !== 'instrument').map((t) => `${t.scanner}/${t.bin}`).join(', ')})`);

  // (c)
  const sast = Object.entries(adapters).find(([, a]) => a.role === 'instrument' && a.adopted !== false && a.run?.rules)?.[0];
  if (!sast) fail('(c) a static-analysis instrument is adopted (an adapter whose run: carries rules)');
  const seed = laneSeed('deep-code-review', { name: 'Demo', inputsDir: '/inputs' }, adapters);
  for (const p of [`map/raw/${sast}.json`, 'map/raw/fresh-clone.json']) if (!seed.inputs.includes(p)) fail(`(c) the reviewer's lane reads ${p} (got ${seed.inputs.join(' ')})`);
  if (!/\bleads?\b/.test(seed.prompt) || !seed.prompt.includes(`map/raw/${sast}.json`)) fail('(c) the reviewer\'s lane gives the static-analysis rows to the review as leads');

  // (d)
  const roster = readFileSync(join(ROOT, 'map', 'scanners', 'CANDIDATES.md'), 'utf8');
  const engineRow = roster.split('\n').find((l) => /^\| Semgrep CE \|/.test(l)) || '';
  if (!engineRow || /\| reviewer-only \|/.test(engineRow)) fail('(d) the scanner roster\'s Semgrep CE row says what is true now, not reviewer-only');
  if (sast && !/\*\*adopted\*\* \(#232\)/.test(roster)) fail(`(d) the scanner roster names ${sast} adopted (#232)`);
}
