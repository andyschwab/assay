// ── a finding maps to one requirement, read off the rows' populations (#261, M3 of #257) ──
// tests/mapping/MAPPING.yaml is a known-answer set of public findings, each with the one
// requirement that takes it, or none. yardstick/population.mjs requirementTaking is the one
// reading of "which requirement takes this finding", driven by each facet and census row's
// declared population (its check's "Population: every <term>"), the effect and capability facets,
// and the instruments' bindings. Pinned:
//   (a) every entry reads exactly its requirement, the only candidate, or none with no candidate;
//   (b) the set is drawn from committed public runs, names only requirements the yardstick
//       carries, and covers every facet and census row that can take a finding;
//   (c) the set bites: one row's check blurred ("the module census"), or widened onto another
//       row's term, turns entries red, so the rows' populations are what holds them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadFindings, loadAdapters } from '../../map/project.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { requirementTaking, parseCheck } from '../../yardstick/population.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'finding-maps-to-one-requirement';

// every entry's reading under a yardstick: the entries that do not read their answer
function misread(entries, findingOf, reg, adapters) {
  const bad = [];
  for (const e of entries) {
    const f = findingOf(e);
    let got;
    try { got = requirementTaking(f, { member: e.member ?? null, reg, adapters }); }
    catch (err) { bad.push(`${e.run} ${e.finding}: refused (${err.message})`); continue; }
    const want = e.requirement === 'none' ? [] : [e.requirement];
    if (JSON.stringify(got.candidates) !== JSON.stringify(want)) bad.push(`${e.run} ${e.finding} (${e.member ?? 'its own facets or scanner'}): expected ${e.requirement}, read [${got.candidates.join(', ') || 'none'}]`);
  }
  return bad;
}

export async function run() {
  const fail = (m) => negFailures.push('finding-maps-to-one-requirement: ' + m);
  const set = parseYaml(readFileSync(join(ROOT, 'tests', 'mapping', 'MAPPING.yaml'), 'utf8'));
  const entries = Array.isArray(set?.entries) ? set.entries : [];
  if (entries.length < 30) { fail(`the mapping set must hold its entries (found ${entries.length})`); return; }
  const reg = loadYardstick(), adapters = loadAdapters();
  const ids = new Set(reg.requirements.map((d) => d.id));

  // (b) public runs only, real findings, real requirements, every entry answered once
  const runs = new Map(), seen = new Set();
  const findingOf = (e) => {
    if (!runs.has(e.run)) runs.set(e.run, new Map(loadFindings(join(ROOT, e.run)).map((f) => [f.id, f])));
    return runs.get(e.run).get(e.finding);
  };
  for (const e of entries) {
    const at = `${e.run} ${e.finding}`;
    if (!/^tests\/(sweeps|fixtures)\/[^/]+(\/sweep-\d+)?$/.test(String(e.run))) fail(`${at}: an entry names a committed public run under tests/sweeps/ or tests/fixtures/`);
    else if (!findingOf(e)) fail(`${at}: no such finding in the run`);
    if (e.requirement !== 'none' && !ids.has(e.requirement)) fail(`${at}: names ${e.requirement}, which the yardstick does not carry`);
    if (!e.why) fail(`${at}: every entry says why`);
    if (seen.has(at)) fail(`${at}: answered twice`); seen.add(at);
  }
  const terms = (reg.members || []).map((m) => m.term);
  const taking = reg.requirements.filter((d) => ['facet', 'census'].includes(d.decide.kind) && d.decide.rule !== 'channels-triaged');
  const answered = new Set(entries.map((e) => e.requirement));
  const uncovered = taking.filter((d) => !answered.has(d.id)).map((d) => d.id);
  if (uncovered.length) fail(`the set must place a finding on every facet and census row that takes findings; none on ${uncovered.join(', ')}`);
  if (!entries.some((e) => e.requirement === 'none')) fail('the set must hold findings no requirement takes (the stated boundaries)');

  // (a) each entry reads exactly its requirement
  const live = entries.filter((e) => findingOf(e));
  for (const m of misread(live, findingOf, reg, adapters)) fail(m);

  // (c) the set bites: blur one row's population, and widen one onto another's term
  const withCheck = (id, check) => ({ ...reg, requirements: reg.requirements.map((d) => (d.id === id ? { ...d, check } : d)) });
  const blurred = withCheck('d-modules-standalone', 'the module census');
  const b = misread(live, findingOf, blurred, adapters);
  if (!b.length || !b.every((m) => /expected d-modules-standalone/.test(m))) fail(`blurring d-modules-standalone's check to "the module census" must turn its entries red, and only those (got ${b.length}: ${b.slice(0, 2).join(' | ')})`);
  const rd = reg.requirements.find((d) => d.id === 'd-readme-true');
  const p = parseCheck(rd?.check, terms);
  if (!p) fail('test setup: d-readme-true reads in the form');
  else {
    // d-readme-true's population written over code comments too: a stale header lands on it
    const widened = withCheck('d-readme-true', rd.check.replace(/^Population: every doc claim/, 'Population: every code comment'));
    const w = misread(live, findingOf, widened, adapters);
    if (!w.some((m) => /code comment.*expected none, read \[d-readme-true\]/.test(m))) fail(`moving d-readme-true's population onto code comments must turn the stale-header entries red (got ${w.slice(0, 2).join(' | ')})`);
    // two rows naming one term read both, never one of them
    const doubled = withCheck('d-decisions-reconstruct', `Population: every doc claim${p.population.slice('doc claim'.length)}; excluded: ${p.excluded}. Question: ${p.question}`);
    const dd = misread(live, findingOf, doubled, adapters);
    if (!dd.some((m) => /expected d-readme-true, read \[d-readme-true, d-decisions-reconstruct\]|expected d-readme-true, read \[d-decisions-reconstruct, d-readme-true\]/.test(m))) fail(`two rows whose populations name one term must read both as candidates, never pick one (got ${dd.slice(0, 2).join(' | ')})`);
  }
  // an unknown member, or one the finding's own facets contradict, is refused, never read as none
  const f505 = findingOf({ run: 'tests/sweeps/flawed-webapp-2026-11-11/sweep-1', finding: 'F-505' });
  let threw = 0;
  try { requirementTaking(f505, { member: 'module', reg, adapters }); } catch { threw++; }
  try { requirementTaking({ id: 'F-x', subject_type: 'artifact' }, { member: 'no such term', reg, adapters }); } catch { threw++; }
  try { requirementTaking({ id: 'F-y', subject_type: 'effect', effect: null }, { member: 'module', reg, adapters }); } catch { threw++; }
  if (threw !== 3) fail(`a member the vocabulary lacks, one a finding's facets contradict, and one whose subject types the finding does not fit are each refused (refused ${threw} of 3)`);
}
