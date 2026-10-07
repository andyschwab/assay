// ── the eight places SCHEMA left the map lane guessing (#34) ──
// A map-only lane must be able to write a canon and a base from SCHEMA alone: the canon
// example parses in block style, the drift check runs without a view file, the census
// names and a polarity rule for gated effects are listed, `external` is defined for an
// org-owned store on third-party infrastructure, every census population states its
// membership rule, the base holds facts about the target only, and the generated
// Improve title and §5 carry no em-dash.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';

export const label = 'schema-map-lane';

export async function run() {
  const fail = (m) => negFailures.push('schema-map-lane: ' + m);
  const schema = readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8');
  const s7 = (schema.match(/\n## 7\.[\s\S]*?(?=\n## 8\.)/) || [''])[0];
  const s8 = (schema.match(/\n## 8\.[\s\S]*$/) || [''])[0];

  // 1. the canon example parses with the engine's own reader, in block style, and says so
  const example = (s8.match(/```yaml\n([\s\S]*?)```/) || [])[1];
  let canonExample = null;
  if (!example) fail('SCHEMA §8 must carry the canon example as a yaml block');
  else {
    try { canonExample = parseYaml(example); } catch (e) { fail(`SCHEMA §8's canon example must parse with lib/yaml-min (got: ${e.message})`); }
  }
  if (!/block style/.test(s8)) fail('SCHEMA §8 must state that a canon is written in block style');

  // the mini run the validator checks below: one held effect, no view file
  const tmp = mkdtempSync(join(tmpdir(), 'assay-map-lane-'));
  const runDir = join(tmp, 'entry', 'runs', 'r');
  mkdirSync(join(runDir, 'map', 'findings'), { recursive: true });
  copyFileSync(join(HERE, 'negative', 'bad-standing-watch', 'map', 'scanners.yaml'), join(runDir, 'map', 'scanners.yaml'));
  const finding = (evidence) => writeFileSync(join(runDir, 'map', 'findings', 'repo-eval-delegation.yaml'), [
    '- id: F-001', '  dimension: delegation', '  polarity: strength', '  subject_type: effect',
    '  observation: A held, reversible send.', `  evidence: [${evidence}]`, '  confidence: confirmed',
    '  effect:', '    channel: mail-send', '    reversibility: reversible', '    external: false',
    '    gate_type: deterministic-halt', '    fail_mode: closed', '    telemetry: audited', '    blast_scope: user', ''].join('\n'));
  finding('a.py:1');
  const validate = (...flags) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), runDir, '--json', ...flags], { encoding: 'utf8' });
    try { return { exit: r.status, ...JSON.parse(r.stdout) }; } catch { return { exit: r.status, errors: [`unparseable: ${r.stdout}${r.stderr}`], warnings: [] }; }
  };
  const canonDir = join(tmp, 'entry', 'canon');
  const writeCanon = (name, text) => { mkdirSync(canonDir, { recursive: true }); writeFileSync(join(canonDir, `${name}.yaml`), text); };

  // 2. the drift check runs from `validate --canon <name>`, with no views/improve/prose.yaml
  const missing = validate('--canon', 'c1');
  if (missing.exit !== 1 || !missing.errors.some((e) => /canon: "c1" names canon\/c1\.yaml, which exists neither/.test(e)))
    fail(`validate --canon c1 with no canon must fail closed on the missing file (got exit ${missing.exit}: ${missing.errors.join(' | ')})`);
  writeCanon('c1', 'effect_channels:\n  - slug: ledger-write\n');
  const drift = validate('--canon', 'c1');
  if (drift.exit !== 0) fail(`validate --canon c1 drift must stay advisory (got exit ${drift.exit}: ${drift.errors.join(' | ')})`);
  if (!drift.warnings.some((w) => /run effect channel "mail-send" is not in the canon/.test(w))) fail('validate --canon must surface a run channel the canon lacks, with no view file');
  if (!drift.warnings.some((w) => /canon channel "ledger-write" has no effect finding/.test(w))) fail('validate --canon must surface a canon channel the run does not assess, with no view file');
  if (!/validate <run>[^\n]*--canon <name>/.test(s7 + s8)) fail('SCHEMA must name `validate <run> --canon <name>` as the way a map-only lane runs the drift check');

  // 3. SCHEMA lists the census names, and the list is the yardstick's, exactly
  const reqs = parseYaml(readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8'));
  const want = new Map();
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') { if (o.decide && o.decide.kind === 'census') want.set(o.id, [...o.decide.measures].sort()); for (const k in o) walk(o[k]); }
  };
  walk(reqs);
  const listed = new Map([...s8.matchAll(/^\| `(d-[a-z0-9-]+)` \| ([^\n]*) \|$/gm)].map((m) => [m[1], [...m[2].matchAll(/`([a-z0-9-]+)`/g)].map((x) => x[1]).sort()]));
  if (!want.size) fail('requirements.yaml must declare census requirements for this check to mean anything');
  for (const [id, names] of want) if (JSON.stringify(listed.get(id)) !== JSON.stringify(names)) fail(`SCHEMA §8 must list ${id}'s census names exactly as requirements.yaml does (want ${names.join(', ')}; got ${(listed.get(id) || ['none']).join(', ')})`);
  for (const id of listed.keys()) if (!want.has(id)) fail(`SCHEMA §8 lists census names for ${id}, which requirements.yaml does not decide by census`);

  // 4. a polarity rule for an effect, by its facet: an open halt is a gap, and every other
  //    effect, gated or not, is a fact (map/doctrine.mjs isHaltClass, gateHolds)
  const rule = (s8.match(/\*\*Polarity of an effect\.\*\*[\s\S]*?\n\n(\|[\s\S]*?)\n\n/) || [])[1] || '';
  for (const [facet, pol] of [['irreversible or external, and no gate that holds', 'gap'], ['irreversible or external, and a gate that holds', 'fact'], ['reversible and internal, gated or not', 'fact']])
    if (!rule.includes(`| ${facet} | \`${pol}\` |`)) fail(`SCHEMA §8's polarity rule must map "${facet}" to ${pol}`);

  // 5. `external` defined for an org-owned store on third-party infrastructure
  if (!/\*\*`external` for an org-owned store\.\*\*[^\n]*\n(?:[^\n]+\n)*?[^\n]*`external: false`/.test(s8)) fail('SCHEMA §8 must define `external` for an org-owned store on third-party infrastructure (external: false)');

  // 7. every census population carries a membership rule; validate refuses one that doesn't
  const pops = canonExample && canonExample.census_populations;
  if (!pops || typeof pops !== 'object' || !Object.keys(pops).length) fail('SCHEMA §8\'s canon example must declare census_populations');
  else for (const [name, p] of Object.entries(pops)) if (!p || typeof p !== 'object' || !p.subject_type || !p.rule) fail(`the canon example's census population "${name}" must carry subject_type and rule`);
  if (example) {
    writeCanon('example', example);
    const ok = validate('--canon', 'example');
    if (ok.errors.some((e) => /^canon\//.test(e))) fail(`SCHEMA §8's own canon example must pass the canon check (got: ${ok.errors.join(' | ')})`);
  }
  writeCanon('norule', 'census_populations:\n  module:\n    subject_type: artifact\n');
  const norule = validate('--canon', 'norule');
  if (norule.exit !== 1 || !norule.errors.some((e) => /census population "module" states no membership rule/.test(e)))
    fail(`a census population with no rule must fail validate (got exit ${norule.exit}: ${norule.errors.join(' | ')})`);
  writeCanon('badtype', 'census_populations:\n  module:\n    subject_type: widget\n    rule: every package under packages/\n');
  const badtype = validate('--canon', 'badtype');
  if (badtype.exit !== 1 || !badtype.errors.some((e) => /census population "module" has subject_type "widget"/.test(e)))
    fail(`a census population with an unknown subject_type must fail validate (got exit ${badtype.exit}: ${badtype.errors.join(' | ')})`);

  // 8. the base holds facts about the target only; a run-relative citation fails --target
  if (!/facts about the target only/.test(s7) || !/`map\/scanners\.yaml`/.test(s7)) fail('SCHEMA §7 must state that the base holds facts about the target only, and where a fact about the run goes instead (map/scanners.yaml)');
  const target = join(tmp, 'target'); mkdirSync(target); writeFileSync(join(target, 'a.py'), 'x = 1\n');
  finding('map/scanners.yaml:1');
  const runRel = validate('--target', target);
  if (runRel.exit !== 1 || !runRel.errors.some((e) => /map\/scanners\.yaml/.test(e))) fail(`a finding citing a run-relative path must fail validate --target (got exit ${runRel.exit}: ${runRel.errors.join(' | ')})`);
  rmSync(tmp, { recursive: true, force: true });

  // 6. the generated Improve page: no em-dash in its title or in §5
  const out = mkdtempSync(join(tmpdir(), 'assay-map-lane-improve-'));
  copyFixtureFindings('notesbox', out); copyFixtureScanners('notesbox', out);
  mkdirSync(join(out, 'views', 'improve'), { recursive: true });
  writeFileSync(join(out, 'views', 'improve', 'prose.yaml'), 'target: "notesbox"\nmaintainer: "the test maintainers"\nexec_summary: "test"\n');
  writeFileSync(join(out, 'views', 'improve', 'security-gate.yaml'), [
    'exposures:',
    '  - name: assistant-email', '    title: Injected notes send email', '    findings: [F-051, F-052]',
    '    who: authorized-real-user', '    what: outbound email to an attacker', '    likelihood: moderate',
    '    fix: Draft, never send.',
    '  - name: admin-watch', '    title: Admin fallback', '    findings: [F-050]', '    standing_watch: true',
    '    what: the fallback role', '    fix: Refuse unknown tokens.', '',
  ].join('\n'));
  const r = spawnSync(process.execPath, [join(ROOT, 'views', 'improve', 'report.mjs'), out], { encoding: 'utf8' });
  const md = r.status === 0 && existsSync(join(out, 'IMPROVE.md')) ? readFileSync(join(out, 'IMPROVE.md'), 'utf8') : '';
  if (!md) fail(`report.mjs must compile the notesbox fixture (stderr: ${r.stderr})`);
  else {
    const fmTitle = (md.match(/^title: ([^\n]*)$/m) || [])[1] || '';
    const h1 = (md.match(/^# [^\n]*$/m) || [])[0] || '';
    const s5 = (md.match(/\n## 5\.[\s\S]*?(?=\n## 6\.)/) || [''])[0];
    if (!h1 || !s5) fail('IMPROVE.md must carry a title and a §5');
    for (const [where, text] of [['frontmatter title', fmTitle], ['title', h1], ['§5', s5]])
      if (text.includes('—')) fail(`IMPROVE.md's ${where} must carry no em-dash (got: ${text.split('\n').find((l) => l.includes('—'))})`);
  }
  rmSync(out, { recursive: true, force: true });
}
