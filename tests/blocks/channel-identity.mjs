// ── a channel is its triaged candidate, not the lane's spelling (#298) ──
// Lanes that see one effect spell its slug differently (`tool-install`, `tools-install`), and
// variance keyed a channel by the slug, so each spelling read as its own channel and real agreement
// hid. Where a run's map/effect-triage.yaml maps a candidate to an effect finding, every cross-run
// comparison of channels keys that finding by the candidate member; several candidates key it by the
// sorted set; a finding no candidate maps to keeps its slug.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, negFailures } from '../harness.mjs';

export const label = 'channel-identity';

export async function run() {
  const fail = (m) => negFailures.push('channel-identity: ' + m);
  const V = await import('../../map/variance.mjs');
  const T = await import('../../map/effect-triage.mjs');
  const eff = (id, channel, o) => ({ id, dimension: 'delegation', subject_type: 'effect',
    polarity: 'fact', observation: 'x', evidence: ['map/tools.mjs:1'], confidence: 'confirmed',
    effect: { channel, reversibility: 'reversible', external: true, gate_type: 'scope-bound',
              fail_mode: 'closed', telemetry: 'structured-event', blast_scope: 'user', ...o } });

  // the key: one candidate, several (sorted), none
  if (typeof T.candidateKeysOf !== 'function') { fail('map/effect-triage.mjs must export candidateKeysOf'); return; }
  const k = T.candidateKeysOf([
    { candidate: 'process spawn (js) @ map/tools.mjs', finding: 'F-1' },
    { candidate: 'z: second', finding: 'F-2' }, { candidate: 'a: first', finding: 'F-2' },
    { candidate: 'route: GET /x', out_of_scope: 'a fixture' },
  ]);
  if (k.get('F-1') !== 'candidate: process spawn (js) @ map/tools.mjs') fail(`a finding one candidate maps to is keyed by that candidate (got ${k.get('F-1')})`);
  if (k.get('F-2') !== 'candidate: a: first | z: second') fail(`a finding several candidates map to is keyed by the sorted set (got ${k.get('F-2')})`);
  if (k.size !== 2) fail(`an out-of-scope entry keys no finding (got ${k.size} keys)`);

  // two spellings of one triaged candidate read one channel (the pure measure)
  const keys = [new Map([['F-1', 'candidate: x']]), new Map([['F-7', 'candidate: x']])];
  const one = V.descriptorAgreement([[eff('F-1', 'tool-install')], [eff('F-7', 'tools-install')]], keys);
  if (one.channels.total !== 1 || one.channels.shared !== 1) fail(`two spellings of one triaged candidate must read one shared channel (got ${one.channels.total} channels, ${one.channels.shared} shared)`);
  // an untriaged finding keeps its slug: two spellings stay two
  const two = V.descriptorAgreement([[eff('F-1', 'tool-install')], [eff('F-7', 'tools-install')]], [new Map(), new Map()]);
  if (two.channels.total !== 2) fail(`an effect no candidate maps to keeps its slug (got ${two.channels.total} channels)`);
  // fact presence reads the same identity
  const fp = V.varianceFromSweeps([[{ ...eff('F-1', 'tool-install'), evidence: ['a.mjs:1'] }], [{ ...eff('F-7', 'tools-install'), evidence: ['b.mjs:1'] }]], ['a', 'b'], null, keys);
  if (fp.union !== 1 || fp.core !== 1) fail(`fact presence must join two spellings of one triaged candidate (got union ${fp.union}, core ${fp.core})`);

  // end to end: two runs, each with its own triage, read through the run-dir wrapper
  const tmp = join(HERE, 'tmp-channel-identity'); rmSync(tmp, { recursive: true, force: true });
  const runOf = (name, id, slug) => {
    const d = join(tmp, name);
    mkdirSync(join(d, 'map', 'findings'), { recursive: true });
    mkdirSync(join(d, 'map', 'raw'), { recursive: true });
    writeFileSync(join(d, 'map', 'raw', 'enumerate.json'), JSON.stringify({ schema: 'enumerate', version: 1, target: 't', files: 1,
      populations: { channelCandidates: [], routeHandlers: [], effectSites: [{ member: 'process spawn (js) @ map/tools.mjs', note: '', gateable: false, evidence: ['map/tools.mjs:1'] }] } }));
    writeFileSync(join(d, 'map', 'effect-triage.yaml'), `schema: effect-triage\nversion: 1\ntriage:\n  - candidate: "process spawn (js) @ map/tools.mjs"\n    finding: ${id}\n`);
    writeFileSync(join(d, 'map', 'findings', 'practice-review-delegation.yaml'),
      `- id: ${id}\n  dimension: delegation\n  subject_type: effect\n  polarity: fact\n  observation: installs a tool\n  evidence: ["map/tools.mjs:1"]\n  confidence: confirmed\n  effect:\n    channel: ${slug}\n    reversibility: reversible\n    external: true\n    gate_type: scope-bound\n    fail_mode: closed\n    telemetry: structured-event\n    blast_scope: user\n`);
    return d;
  };
  try {
    const d = V.computeDescriptorAgreement([runOf('a', 'F-500', 'tool-install'), runOf('b', 'F-503', 'tools-install')]);
    if (d.channels.total !== 1 || d.allFields.agree !== 1) fail(`two runs that triage one candidate to differently spelled findings must read one agreeing channel (got ${d.channels.total} channels, ${d.allFields.agree} identical)`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
