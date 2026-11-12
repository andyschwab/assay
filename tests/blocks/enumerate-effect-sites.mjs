// ── effect-site members are keyed per file (#272) ──
// The effect triage closes enumerate's effect-site members with one entry each. A member that
// grouped every call of a kind across the tree let one entry close unrelated channels in
// different files, so a member is one kind of call in one file: `http write (js) @ lib/sync.mjs`.
// A file with two kinds of call lists two members, and the same kind in two files lists two.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-effect-sites';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-effect-sites: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'effects');
  const doc = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--json'], { encoding: 'utf8' }));
  const sites = new Map(doc.populations.effectSites.map((m) => [m.member, m]));
  const want = {
    'http write (js) @ lib/sync.mjs': ['lib/sync.mjs:5', 'lib/sync.mjs:7'],
    'git push @ lib/sync.mjs': ['lib/sync.mjs:6'],
    'http write (js) @ lib/backup.mjs': ['lib/backup.mjs:3'],
  };
  for (const [member, evidence] of Object.entries(want)) {
    const m = sites.get(member);
    if (!m) { fail(`enumerate must list the effect-site member "${member}" (got ${[...sites.keys()].join(', ') || 'none'})`); continue; }
    if (JSON.stringify(m.evidence) !== JSON.stringify(evidence)) fail(`"${member}" must carry its own file's call lines only (want ${evidence.join(', ')}; got ${m.evidence.join(', ')})`);
  }
  const sync = [...sites.keys()].filter((k) => k.endsWith(' @ lib/sync.mjs'));
  if (sync.length !== 2) fail(`a file with two effect kinds must list two per-file members (lib/sync.mjs: ${sync.join(', ') || 'none'})`);
  for (const k of sites.keys()) if (!/ @ \S+$/.test(k)) fail(`an effect-site member names its file: "${k}"`);
}
