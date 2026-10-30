// ── a capability whose outward leg only reads is not a full trifecta (#172) ──
// `external_effect` was a boolean, so a surface that only fetches from the outside world (a scheduled job
// that pulls a feed and summarises it) recorded the same `true` as one that sends, and the trifecta row
// counted it among the full trifectas while the chain report held it. The facet now reads none | read |
// write, and a boolean a map wrote before reads as before (true is write, false none). Pinned:
//   (a) effectLeg reads each value, the two booleans included, and nothing else;
//   (b) the trifecta row: a read-only ingester reaching no unheld halt reads met, and its note says it
//       reads only; the same capability as write is a full trifecta (mixed), and so is the boolean true;
//   (c) the chains: a read-only entry with nothing reached is contained, "reads the outside world, acts
//       on nothing"; none is contained as before; write with nothing traced stays unresolved;
//   (d) validate admits read and write and the booleans, and refuses any other value.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectLeg } from '../../map/doctrine.mjs';
import { buildChains } from '../../map/chains.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'capability-read-leg';

export async function run() {
  const fail = (m) => negFailures.push('capability-read-leg: ' + m);

  // (a)
  const legs = [true, false, 'none', 'read', 'write', 'sometimes', undefined].map((v) => effectLeg({ external_effect: v }));
  if (JSON.stringify(legs) !== JSON.stringify(['write', 'none', 'none', 'read', 'write', null, null])) fail(`(a) effectLeg reads true as write, false as none, the three names as themselves, anything else null (got ${JSON.stringify(legs)})`);

  // (b)
  const reg = loadYardstick();
  const tri = reg.requirements.find((d) => d.decide.kind === 'facet' && d.decide.rule === 'trifecta');
  if (!tri) { fail('(b) the register has a trifecta row'); return; }
  const cap = (leg) => ({ id: 'F-1', dimension: 'delegation', polarity: 'fact', subject_type: 'capability', observation: 'a scheduled job summarises a fetched feed', evidence: ['jobs/feed.py:1'], confidence: 'confirmed', capabilities: { untrusted_input: true, private_data: true, external_effect: leg } });
  const measure = (leg) => measureRun({ findings: [cap(leg)], manifest: [{ scanner: 'practice-review', status: 'ran' }], inputs: {}, coverage: {} }, { ...reg, requirements: [tri] })[0];
  const reader = measure('read');
  if (reader.status !== 'met' || !/0 hold the full trifecta; 1 read the outside world only/.test(reader.note)) fail(`(b) a read-only ingester reaching no unheld halt reads met, saying it reads only (got ${reader.status}: ${reader.note})`);
  const writer = measure('write');
  if (writer.status !== 'mixed' || !/1 hold the full trifecta/.test(writer.note)) fail(`(b) the same surface as write is a full trifecta (got ${writer.status}: ${writer.note})`);
  const legacy = measure(true);
  if (legacy.status !== writer.status || legacy.note !== writer.note) fail(`(b) the boolean true measures exactly as write (got ${legacy.status}: ${legacy.note})`);

  // (c)
  const chainsOf = (leg) => buildChains([cap(leg)]);
  const cr = chainsOf('read');
  if (cr.contained.length !== 1 || cr.contained[0].why !== 'reads the outside world, acts on nothing' || cr.unresolved.length) fail(`(c) a read-only entry with nothing reached is contained, reading only (got ${JSON.stringify(cr)})`);
  const cn = chainsOf('none');
  if (cn.contained.length !== 1 || cn.contained[0].why !== 'holds no power to act') fail(`(c) none is contained, holding no power to act (got ${JSON.stringify(cn)})`);
  const cw = chainsOf('write');
  if (cw.contained.length || cw.unresolved.length !== 1 || cw.unresolved[0].kind !== 'untraced-leg') fail(`(c) write with nothing traced stays unresolved (got ${JSON.stringify(cw)})`);

  // (d)
  const scanners = join(HERE, 'negative', 'effect-no-fail-mode', 'map', 'scanners.yaml');
  const validate = (leg) => {
    const dir = mkdtempSync(join(tmpdir(), 'assay-read-leg-'));
    try {
      mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
      copyFileSync(scanners, join(dir, 'map', 'scanners.yaml'));
      writeFileSync(join(dir, 'map', 'findings', 'practice-review-delegation.yaml'), ['- id: F-001', '  dimension: delegation', '  polarity: fact', '  subject_type: capability',
        '  observation: x', '  evidence: [a.py:1]', '  confidence: confirmed', '  capabilities:', '    untrusted_input: true', '    private_data: true', `    external_effect: ${leg}`, ''].join('\n'));
      try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), dir], { stdio: 'pipe' }); return []; }
      catch (x) { return (String(x.stdout || '') + String(x.stderr || '')).split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4)); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  for (const ok of ['read', 'write', 'none', 'true', 'false']) { const v = validate(ok); if (v.length) fail(`(d) external_effect: ${ok} validates (got ${v.join(' | ')})`); }
  if (!validate('sometimes').some((l) => /external_effect must be none, read or write/.test(l))) fail('(d) any other external_effect is refused');
}
