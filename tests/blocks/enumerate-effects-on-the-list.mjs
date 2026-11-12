// ── every effect a lane sees is on the list, and no self-match is (#298) ──
// A desk check of v0.10.0's enumeration of assay at 2b247c0 found the list named 2 of the 12 channels
// three sweeps recorded, and 7 of its 15 entries were self-matches. Node `child_process` calls and
// workflow writes were read by no pattern; the enumerator's own pattern table and a scanner adapter's
// rule pack and planted control were read as call sites. This block pins each kind and each exclusion
// on a fixture (tests/enumerate-fixture/effects-on-the-list), and on assay's own tree that the
// enumerator and the adapters' declared rule packs and controls list nothing.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'enumerate-effects-on-the-list';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-effects-on-the-list: ' + m);
  const sites = (target) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), target, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).populations.effectSites;
  const fx = sites(join(HERE, 'enumerate-fixture', 'effects-on-the-list'));
  const members = fx.map((m) => m.member);
  const evidenceOf = (m) => (fx.find((x) => x.member === m) || { evidence: [] }).evidence;
  const need = (m, why) => { if (!members.includes(m)) fail(`${why}: "${m}" missing (got ${members.join(', ') || 'none'})`); };
  const none = (file, why) => { const hits = members.filter((m) => m.endsWith(` @ ${file}`)); if (hits.length) fail(`${why}: listed ${hits.join(', ')}`); };

  // 1. Node subprocesses: one member per file, the destructured call and the module call alike
  need('process spawn (js) @ lib/jobs.mjs', 'a destructured spawnSync/execFile is a Node subprocess');
  need('process spawn (js) @ lib/cp-module.cjs', 'a module cp.execSync is a Node subprocess');
  none('lib/query.mjs', "a regex's .exec( and a database's exec( in a file that names no child_process are not subprocesses");

  // 2. workflow writes: one member per workflow file and kind; a read, a step's name and a comment are none
  const WF = '.github/workflows/release.yml';
  for (const kind of ['release write (workflow)', 'github api write (workflow)', 'issue/pr write (workflow)', 'artifact upload (workflow)', 'deploy/publish (workflow)', 'git push'])
    need(`${kind} @ ${WF}`, `a workflow step that writes outside the runner (${kind})`);
  const api = evidenceOf(`github api write (workflow) @ ${WF}`);
  if (!api.includes(`${WF}:24`)) fail(`a gh api -X DELETE written over two lines is read as one command at its first line (got ${api.join(', ')})`);
  if (!api.includes(`${WF}:26`)) fail(`a gh api with a field (-f) is a POST (got ${api.join(', ')})`);
  for (const line of [10, 13, 15, 17, 18, 22, 29]) for (const m of fx.filter((x) => x.member.endsWith(` @ ${WF}`)))
    if (m.evidence.includes(`${WF}:${line}`)) fail(`${WF}:${line} is a read, a step's name or a comment, not a write: listed under ${m.member}`);
  none('.github/workflows/read-only.yml', 'a workflow that only reads writes nothing');
  need('issue/pr write (workflow) @ ci/template.yml', 'a workflow template outside .github/workflows is read too');

  // 3. self-matches: a pattern line, a comment, and an adapter's declared rule pack and control
  none('lib/patterns.mjs', 'a pattern table, a line that tests a pattern and a comment make no call');
  const ruled = members.filter((m) => /@ map\/scanners\/adapters\/opengrep\/(?:taint|control)\//.test(m));
  if (ruled.length) fail(`an adapter's declared rule pack and planted control are data a scanner reads, not call sites: listed ${ruled.join(', ')}`);
  need('shell exec @ map/scanners/adapters/opengrep/helper.py', 'a file beside a rule pack, under no declared directory, is still read');

  // assay's own tree: the enumerator lists nothing of itself, and no adapter's declared data is listed
  const self = sites(ROOT).map((m) => m.member);
  const enumSelf = self.filter((m) => m.endsWith(' @ map/enumerate.mjs'));
  if (enumSelf.length) fail(`the enumerator's own pattern table is not a call site: listed ${enumSelf.join(', ')}`);
  const adapters = join(ROOT, 'map', 'scanners', 'adapters');
  const declared = readdirSync(adapters).filter((f) => f.endsWith('.yaml')).flatMap((f) => {
    const run = (parseYaml(readFileSync(join(adapters, f), 'utf8')) || {}).run || {};
    return [run.rules && run.rules.dir, run.control && run.control.dir].filter((d) => typeof d === 'string').map((d) => relative(ROOT, join(adapters, d)));
  });
  if (!declared.length) fail('no adapter declares a rule pack or control (run.rules.dir, run.control.dir): the exclusion is pinned on nothing');
  const leaked = self.filter((m) => declared.some((d) => m.includes(` @ ${d}/`)));
  if (leaked.length) fail(`an adapter's declared rule pack or control was listed on assay's own tree: ${leaked.join(', ')}`);
  for (const m of ['process spawn (js) @ map/fresh-clone.mjs', 'github api write (workflow) @ .github/workflows/branch-cleanup.yml', 'release write (workflow) @ .github/workflows/release.yml'])
    if (!self.includes(m)) fail(`assay's own effect "${m}" is missing from its list`);
}
