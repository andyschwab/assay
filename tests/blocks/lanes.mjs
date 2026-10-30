// ── the review lanes are the engine's, and a lane executes nothing (#201) ──
// A judgment scanner's review runs in a session a person started. Its seed body is the engine's,
// versioned with the pin, and the session reads and writes its own findings, nothing more: the
// deterministic phase ran everything that executes. Pinned:
//   (a) every adopted judgment scanner names a lane beside its adapter, and each seeds with every
//       placeholder filled, its title and artifact named;
//   (b) a lane runs nothing but reads: every command it spells out is a git read (clone, fetch,
//       checkout, rev-parse, log), it says the session executes nothing, and it never names a
//       command that runs code (node, npm, a script, assay itself, an install);
//   (c) a lane names no model (the consumer picks it) and carries no `model:` field;
//   (d) the practice-review lane publishes exactly the engine's pass files, the terrain and the
//       censuses;
//   (e) a lane's inputs are files the run produces (a before-review record or an instrument's raw
//       report), and a lane with inputs is refused a seed that does not say where they are.
import { relative } from 'node:path';
import { lanes, readLane, laneSeed } from '../../map/lane.mjs';
import { beforeReviewPath } from '../../map/start.mjs';
import { pinnedTools } from '../../map/tools.mjs';
import { loadAdapters, adoptedAdapters, PRACTICE_REVIEW_PASSES } from '../../map/project.mjs';
import { negFailures } from '../harness.mjs';

export const label = 'lanes';

const READS = /^git (clone|fetch|checkout|-C \S+ checkout|-C \S+ rev-parse|rev-parse|log)\b/;
const COMMAND = /^(git|node|npm|npx|pnpm|yarn|bash|sh|python3?|pip|uv|make|curl|wget|\.\/|assay)\b/;
const RUNS = /\b(node|npm|npx|pnpm|yarn|bash|python3?|pip|install\.sh|assay\.mjs)\b|\.sh\b/;

export async function run() {
  const fail = (m) => negFailures.push('lanes: ' + m);
  const adapters = loadAdapters();
  const judgment = Object.entries(adoptedAdapters(adapters)).filter(([, a]) => a.role !== 'instrument').map(([id]) => id);
  const all = lanes(adapters);

  // (a)
  for (const id of judgment) if (!all.some((l) => l.scanner === id)) fail(`(a) the judgment scanner ${id} names no lane (adapters/${id}.yaml lane:)`);
  for (const l of all) {
    let seed = null;
    try { seed = laneSeed(l.scanner, { name: 'Demo', head: 'abc1234', date: '2026-10-30', inputsDir: '/inputs' }, adapters); }
    catch (e) { fail(`(a) the ${l.scanner} lane seeds (${e.message})`); continue; }
    if (/\{\{\w+\}\}/.test(seed.prompt + seed.title + seed.artifact)) fail(`(a) the ${l.scanner} lane leaves a placeholder unfilled`);
    if (!seed.title.includes('Demo') || !seed.artifact.includes('Demo')) fail(`(a) the ${l.scanner} lane names its session and artifact for the target (got ${seed.title} / ${seed.artifact})`);

    // (b)
    const { meta, body } = readLane(l.file);
    const spans = [...seed.prompt.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    for (const c of spans.filter((s) => COMMAND.test(s))) if (!READS.test(c)) fail(`(b) the ${l.scanner} lane spells out a command that is not a git read: ${c}`);
    for (const c of spans) if (RUNS.test(c)) fail(`(b) the ${l.scanner} lane names a command that runs code: ${c}`);
    if (!/This session executes nothing/.test(body)) fail(`(b) the ${l.scanner} lane says the session executes nothing`);

    // (c)
    if ('model' in meta) fail(`(c) the ${l.scanner} lane carries a model: the consumer picks it`);
    if (/\b(claude|gpt|gemini|sonnet|opus|haiku)-[\w.-]*\d/i.test(body)) fail(`(c) the ${l.scanner} lane names a model`);

    // (e)
    const produced = new Set([
      ...pinnedTools(adapters).filter((t) => t.before_review).map((t) => relative('RUN', beforeReviewPath('RUN', t.scanner, t.bin))),
      ...Object.entries(adoptedAdapters(adapters)).filter(([, a]) => a.role === 'instrument').map(([id]) => `map/raw/${id}.json`),
    ]);
    for (const p of seed.inputs) if (!produced.has(p)) fail(`(e) the ${l.scanner} lane reads ${p}, which no run produces`);
    if (seed.inputs.length) {
      let refused = false;
      try { laneSeed(l.scanner, { name: 'Demo' }, adapters); } catch { refused = true; }
      if (!refused) fail(`(e) the ${l.scanner} lane reads inputs, so a seed that does not say where they are is refused`);
      for (const p of seed.inputs) if (!seed.prompt.includes(`/inputs\``) || !seed.prompt.includes(p)) fail(`(e) the ${l.scanner} seed names where ${p} is`);
    }
  }

  // (d)
  const pr = all.find((l) => l.scanner === 'practice-review');
  const outputs = pr ? laneSeed('practice-review', { name: 'Demo' }, adapters).outputs : [];
  const want = ['map/terrain.md', 'map/censuses.yaml', ...Object.keys(PRACTICE_REVIEW_PASSES).map((p) => `map/findings/practice-review-${p}.yaml`)];
  if (JSON.stringify([...outputs].sort()) !== JSON.stringify([...want].sort())) fail(`(d) the practice-review lane publishes exactly the engine's pass files, the terrain and the censuses (lane: ${outputs.join(' ')}; engine: ${want.join(' ')})`);
}
