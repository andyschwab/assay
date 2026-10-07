// ── gate vocabulary: a person's own act, an unterminated check, the identity verified under (#38) ──
// Three closed-vocabulary additions decided together, so they are pinned together:
//  1. gate_type `initiated-by-person` holds when one authenticated person's explicit act
//     causes the effect AND the act is recorded (telemetry not none), so a deliberate act
//     and an unattended job never read the same on d-effects-gated;
//  2. fail_mode `unterminated` (a gate check that never finishes with a verdict) is its own
//     case: the gate does not hold, and d-gates-fail-closed counts it apart from fail-open;
//  3. `effect.verified_as` records the principal a gate check ran as; a check run with
//     more privilege than the gate binds proves nothing about it, so `confirmed` is refused.
// The doctrine (gateHolds/isHalt), the decider and the validator must agree on all three.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateHolds, isHalt } from '../../map/doctrine.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'gate-vocabulary';

export async function run() {
  const fail = (m) => negFailures.push('gate-vocabulary: ' + m);
  const e = (o) => ({ channel: 'crm-write', reversibility: 'irreversible', external: true, gate_type: 'none',
    telemetry: 'structured-event', blast_scope: 'tenant', ...o });

  // (1) doctrine: a recorded act of one person holds; an unrecorded one does not
  if (!gateHolds(e({ gate_type: 'initiated-by-person', fail_mode: 'closed' }))) fail('initiated-by-person with a recorded act (telemetry structured-event) must hold');
  if (gateHolds(e({ gate_type: 'initiated-by-person', fail_mode: 'closed', telemetry: 'none' }))) fail('initiated-by-person whose act leaves no record (telemetry none) must not hold');
  if (gateHolds(e({ gate_type: 'initiated-by-person', fail_mode: 'open' }))) fail('initiated-by-person that fails open must not hold');
  // (2) doctrine: an unterminated check is no verdict, so no stop
  if (gateHolds(e({ gate_type: 'deterministic-halt', fail_mode: 'unterminated' }))) fail('a gate whose check never terminates must not hold');
  if (!isHalt(e({ gate_type: 'deterministic-halt', fail_mode: 'unterminated' }))) fail('an irreversible effect behind an unterminated gate must flag as an unheld halt');

  // the deciders read the same doctrine
  const reg = loadYardstick();
  const fnd = (id, o) => ({ id, dimension: 'delegation', polarity: 'fact', subject_type: 'effect', observation: 'x', evidence: ['a:1'], confidence: 'confirmed', effect: e({ channel: 'ch-' + id, ...o }) });
  const by = (base) => Object.fromEntries(measureRun({ findings: base, manifest: [{ scanner: 'repo-eval', status: 'ran' }], inputs: {}, coverage: {} }, reg).map((r) => [r.id, r]));
  const person = by([fnd('F-1', { gate_type: 'initiated-by-person', fail_mode: 'closed' })]);
  if (person['d-effects-gated']?.status !== 'met') fail(`a recorded person's own act must read d-effects-gated met (got ${person['d-effects-gated']?.status})`);
  const mixed = by([fnd('F-1', { gate_type: 'initiated-by-person', fail_mode: 'closed' }), fnd('F-2', {})]);
  const g = mixed['d-effects-gated'];
  if (g?.status !== 'unmet' || g.findings.join(',') !== 'F-2') fail(`an unattended effect beside a person's act must be the only one d-effects-gated cites (got ${g?.status} ${g?.findings})`);
  const unt = by([fnd('F-1', { gate_type: 'deterministic-halt', fail_mode: 'unterminated' }), fnd('F-2', { gate_type: 'scope-bound', fail_mode: 'open' }), fnd('F-3', { gate_type: 'scope-bound', fail_mode: 'closed' })]);
  const fc = unt['d-gates-fail-closed'];
  if (fc?.status !== 'unmet' || fc.findings.join(',') !== 'F-1,F-2') fail(`d-gates-fail-closed must cite the open and the unterminated gate (got ${fc?.status} ${fc?.findings})`);
  if (fc && (fc.open !== 1 || fc.unterminated !== 1)) fail(`d-gates-fail-closed must count unterminated as its own case (got open ${fc.open}, unterminated ${fc.unterminated})`);
  if (fc && !/never terminates/.test(fc.note)) fail(`d-gates-fail-closed's note must name the unterminated case apart (got "${fc.note}")`);

  // (3) validate: the new values are admitted; verified_as is checked when present
  const scanners = join(HERE, 'negative', 'effect-no-fail-mode', 'map', 'scanners.yaml');
  const yamlOf = (o) => ['- id: F-001', '  dimension: delegation', '  polarity: strength', '  subject_type: effect',
    '  observation: x', '  evidence: [a.py:1]', `  confidence: ${o.confidence || 'confirmed'}`, '  effect:',
    '    channel: crm-write', '    reversibility: irreversible', '    external: true', `    gate_type: ${o.gate_type}`,
    ...(o.fail_mode ? [`    fail_mode: ${o.fail_mode}`] : []), '    telemetry: structured-event', '    blast_scope: tenant',
    ...(o.verified_as ? ['    verified_as:', ...Object.entries(o.verified_as).map(([k, v]) => `      ${k}: ${v}`)] : []),
    ...(o.preconditions ? [`  preconditions: [${o.preconditions}]`] : []), ''].join('\n');
  const validate = (o) => {
    const dir = mkdtempSync(join(tmpdir(), 'assay-gate-vocab-'));
    try {
      mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
      copyFileSync(scanners, join(dir, 'map', 'scanners.yaml'));
      writeFileSync(join(dir, 'map', 'findings', 'repo-eval-delegation.yaml'), yamlOf(o));
      try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir], { stdio: 'pipe' }); return []; }
      catch (x) { return (String(x.stdout || '') + String(x.stderr || '')).split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4)); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const green = (o, what) => { const v = validate(o); if (v.length) fail(`${what} must validate green (got ${v.join(' | ')})`); };
  const red = (o, re, what) => { const v = validate(o); if (!v.some((l) => re.test(l))) fail(`${what} must validate red with ${re} (got ${v.length ? v.join(' | ') : 'green'})`); };
  green({ gate_type: 'initiated-by-person', fail_mode: 'closed' }, 'gate_type initiated-by-person');
  green({ gate_type: 'deterministic-halt', fail_mode: 'unterminated', preconditions: 'insider' }, 'fail_mode unterminated');
  green({ gate_type: 'deterministic-halt', fail_mode: 'closed', verified_as: { principal: 'app-user', privilege: 'bound', triggered_by: 'ci' } }, 'a gate verified as the principal it binds');
  green({ gate_type: 'deterministic-halt', fail_mode: 'closed', confidence: 'plausible', verified_as: { principal: 'db-superuser', privilege: 'elevated' } }, 'an elevated verification recorded as plausible');
  red({ gate_type: 'deterministic-halt', fail_mode: 'closed', verified_as: { principal: 'db-superuser', privilege: 'elevated' } }, /verified_as\.privilege elevated .* confidence plausible/, 'a confirmed gate verified with more privilege than it binds');
  red({ gate_type: 'deterministic-halt', fail_mode: 'closed', verified_as: { principal: 'x', privilege: 'root' } }, /bad effect\.verified_as\.privilege "root"/, 'a privilege outside the closed vocabulary');
  red({ gate_type: 'deterministic-halt', fail_mode: 'closed', verified_as: { privilege: 'bound' } }, /effect\.verified_as\.principal missing/, 'verified_as with no principal');
  red({ gate_type: 'none', verified_as: { principal: 'x', privilege: 'bound' }, preconditions: 'insider' }, /verified_as on an effect whose gate_type is none/, 'verified_as on an ungated effect');

  // every gate_type and fail_mode value the validator admits is defined in the glossary and
  // stated in SCHEMA §2 and METHOD, so the vocabularies stay one list
  const src = readFileSync(join(ROOT, 'map', 'validate.mjs'), 'utf8');
  const vocab = (name) => [...(src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const gloss = parseYaml(readFileSync(join(ROOT, 'views', 'improve', 'templates', 'glossary.yaml'), 'utf8'));
  const schema = readFileSync(join(ROOT, 'map', 'SCHEMA.md'), 'utf8');
  const method = readFileSync(join(ROOT, 'map', 'METHOD.md'), 'utf8');
  for (const [name, key, gkey] of [['GATE_TYPE', 'gate_type', 'gate_type'], ['FAIL_MODE', 'fail_mode', 'fail_mode'], ['VERIFIED_PRIVILEGE', 'verified_as.privilege', 'verified_as']]) {
    const vals = vocab(name);
    if (!vals.length) { fail(`map/validate.mjs has no ${name} set`); continue; }
    const row = (doc) => doc.split('\n').find((l) => l.startsWith(`| \`${key}\``) || l.startsWith(`| ${key} `)) || '';
    for (const v of vals) {
      if (!gloss[gkey]?.[v]) fail(`glossary.yaml defines no ${gkey} "${v}"`);
      if (!row(schema).includes(v)) fail(`SCHEMA.md §2 does not list ${key} "${v}"`);
      if (!row(method).includes(v)) fail(`METHOD.md's vocabulary table does not list ${key} "${v}"`);
    }
  }
}
