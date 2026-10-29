// ── a requirement with several deciders, bound through adapters (#177, #155) ──
// A yardstick row names no external scanner (CLAUDE.md rule 7): an adapter's `decides:`
// binds it, and a row may carry several deciders. Pinned:
//   (a) `any_gap: unmet`: a gap beside a strength reads unmet, never mixed (the
//       fixtures-root review's K strength beside five K gaps, #177);
//   (b) several deciders combine: a gap from any decides the row; a decider that reads
//       not-applicable steps aside, and the row is not-applicable only when all do; any
//       other not-measured decider holds it not-measured; met needs every remaining one;
//   (c) a not-measured fact about a file another decider audited is answered by it;
//   (d) one decider reads exactly as before, note and all;
//   (e) an adapter binding to a requirement the yardstick lacks halts the load, and a
//       candidate's binding counts only on a run that records it.
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, measureRun, decidersOf, projectRun } from '../../yardstick/measure.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'yardstick-deciders';

export async function run() {
  const fail = (m) => negFailures.push('yardstick-deciders: ' + m);
  const reg = loadYardstick();
  const adapters = loadAdapters();

  // (a) over the real fixtures-root run
  const root = projectRun(join(HERE, 'fixtures', 'fixtures-root'), reg).find((r) => r.id === 'd-dependencies-pinned');
  if (root?.status !== 'unmet') fail(`(a) d-dependencies-pinned reads unmet at the fixtures root, a K strength beside the gaps notwithstanding (got ${root?.status}: ${root?.note})`);
  if (!reg.requirements.find((d) => d.id === 'd-dependencies-pinned')?.decide.any_gap) fail('(a) d-dependencies-pinned carries any_gap: unmet');

  // (b)–(d) over a two-decider row; repo-census and fresh-clone stand in as deciders
  const base = reg.requirements.find((d) => d.id === 'd-dependencies-pinned');
  const two = { ...base, id: 'd-two', tier: 'reproducibility', decide: { kind: 'instrument', any_gap: undefined, deciders: [
    { scanner: 'repo-census', category: 'p', not_applicable_when: 'p-none', not_measured_when: 'p-unaudited' },
    { scanner: 'fresh-clone', category: 'q', not_applicable_when: 'q-none', audits: 'q-audited' },
  ] } };
  const one = { ...two, id: 'd-one', decide: { kind: 'instrument', scanner: 'repo-census', category: 'p' } };
  const r2 = { ...reg, requirements: [two, one] };
  let n = 0;
  const f = (source, cat, polarity, file = 'x.txt') => ({ id: `F-${++n}`, source, native_id: `${cat}@${file}`, native_category: cat, polarity, observation: `${cat} at ${file}`, evidence: [`${file}:1`], ...(polarity === 'gap' ? { fix: 'x' } : {}) });
  const ran = [{ scanner: 'repo-census', status: 'ran' }, { scanner: 'fresh-clone', status: 'ran' }];
  const read = (findings, manifest = ran, id = 'd-two') => measureRun({ findings, manifest, inputs: null, coverage: {}, adapters }, r2).find((r) => r.id === id);
  const want = (what, got, status) => { if (got?.status !== status) fail(`(b) ${what}: reads ${status} (got ${got?.status}: ${got?.note})`); };
  want('a gap from one decider, the other met', read([f('repo-census', 'p', 'gap')]), 'unmet');
  want('a gap from one, a strength from the other', read([f('repo-census', 'p', 'gap'), f('fresh-clone', 'q', 'strength')]), 'mixed');
  want('both ran with nothing to report', read([]), 'met');
  want('one not-applicable, the other met', read([f('repo-census', 'p-none', 'fact')]), 'met');
  want('both not-applicable', read([f('repo-census', 'p-none', 'fact'), f('fresh-clone', 'q-none', 'fact')]), 'not-applicable');
  want('one ran, the other skipped', read([], [ran[0], { scanner: 'fresh-clone', status: 'skipped', reason: 'not installed' }]), 'not-measured');
  // (c) the answered fact
  want('a not-measured fact nothing else audited', read([f('repo-census', 'p-unaudited', 'fact', 'go.sum')]), 'not-measured');
  want('a not-measured fact about a file the other decider audited', read([f('repo-census', 'p-unaudited', 'fact', 'go.sum'), f('fresh-clone', 'q-audited', 'fact', 'go.sum')]), 'met');
  want('an audit of a different file answers nothing', read([f('repo-census', 'p-unaudited', 'fact', 'go.sum'), f('fresh-clone', 'q-audited', 'fact', 'Cargo.lock')]), 'not-measured');
  // (d) one decider, as before
  const solo = read([f('repo-census', 'p', 'gap'), f('repo-census', 'p', 'strength')], ran, 'd-one');
  if (solo?.status !== 'mixed' || !/^1 gap row\(s\) from repo-census category p, 1 strength$/.test(solo.note || '')) fail(`(d) a one-decider row reads as before (got ${solo?.status}: ${solo?.note})`);

  // (e) bindings
  const bound = decidersOf(reg.requirements.find((d) => d.id === 'd-routes-authorized'), adapters).map((x) => `${x.scanner}:${x.category}`);
  if (bound.join() !== 'deep-code-review:B') fail(`(e) d-routes-authorized is decided through the reviewer's adapter, domain B (got ${bound.join() || 'none'})`);
  const tmp = join(HERE, 'tmp-yardstick-deciders'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const text = readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8');
  const without = text.replace(/\n {2}- id: d-routes-authorized\n[\s\S]*?(?=\n {2}- id: )/, '');
  if (without === text) fail('(e) the test could not cut d-routes-authorized out of a copy of the yardstick');
  writeFileSync(join(tmp, 'requirements.yaml'), without);
  try { loadYardstick(join(tmp, 'requirements.yaml')); fail('(e) an adapter binding to a requirement the yardstick lacks must halt the load'); }
  catch (e) { if (!/deep-code-review\.yaml decides\[0\]: names no requirement/.test(e.message)) fail(`(e) the halt names the adapter and its binding (got ${e.message.split('\n')[0]})`); }
  rmSync(tmp, { recursive: true, force: true });
  const cand = { ...adapters, 'cand-x': { scanner: 'cand-x', adopted: false, role: 'instrument', map: {}, decides: [{ requirement: 'd-routes-authorized', category: 'z' }] } };
  const ids = (disp) => decidersOf(reg.requirements.find((d) => d.id === 'd-routes-authorized'), cand, disp).map((x) => x.scanner).join();
  if (ids(null) !== 'deep-code-review') fail(`(e) a candidate's binding does not count on a run that does not record it (got ${ids(null)})`);
  if (ids({ 'cand-x': { status: 'ran' } }) !== 'deep-code-review,cand-x') fail(`(e) a candidate's binding counts on a run that records it (got ${ids({ 'cand-x': { status: 'ran' } })})`);
}
