// ── owner-packet: "What the owner told us" on the Owner view — facts from a
// repository's own packet, never a verdict (owner/PACKET.md, views/README.md) ──
// Moved from the Intake view's block when Intake left the engine (#339): the packet's
// facts were shown on INTAKE.md and intake.yaml's owner: alone, so the Owner view now
// carries them, as OWNER.md's "What the owner told us" and owner.yaml's packet:. Every
// assertion the Intake block held on the block's facts holds here, against the Owner
// view. The Intake row note naming the owner's credential count (on
// d-credentials-enumerated) went with Intake's page: the count is the packet block's
// credentials.count, shown on the same page.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { buildOwnerBlock, ownerYaml, renderOwnerSection } from '../../views/owner.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'owner-packet';

export async function run() {
  const fail = (m) => negFailures.push('owner-packet: ' + m);

  // no packet at all: owner: null, and the plain "no packet yet" message.
  if (buildOwnerBlock(null) !== null) fail('buildOwnerBlock(null) must read null');
  const noneMd = renderOwnerSection(null).join('\n');
  if (!/No owner's packet yet: the owner prompt \(`assay\.mjs ask-owner`\) collects these\./.test(noneMd)) fail(`renderOwnerSection(null) must print the exact no-packet message (got: ${noneMd})`);

  // the public packet-valid fixture, end to end through the CLI.
  const tmp = join(HERE, 'tmp-owner-packet'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--packet', join(HERE, 'fixtures', 'packet-valid'), '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --packet must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'owner.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/owner.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }

  const ownerViewYaml = existsSync(join(tmp, 'views', 'owner.yaml')) ? parseYaml(readFileSync(join(tmp, 'views', 'owner.yaml'), 'utf8')) : null;
  const owner = ownerViewYaml && ownerViewYaml.packet;
  if (!owner) fail('views/owner.yaml must carry a packet: block when the run carries a packet');
  else {
    if (owner.answered?.date !== '2026-09-01' || owner.answered?.by !== 'founder' || owner.answered?.via !== 'owner-prompt') fail(`owner.answered must come from the packet (got ${JSON.stringify(owner.answered)})`);
    if (owner.accounts?.count !== 2 || owner.accounts?.personal !== 1 || owner.accounts?.organisational !== 1) fail(`owner.accounts counts must reflect the packet (got ${JSON.stringify(owner.accounts)})`);
    if (owner.accounts?.transferable?.yes !== 2) fail(`both packet-valid accounts are transferable: yes (got ${JSON.stringify(owner.accounts?.transferable)})`);
    if ((owner.accounts?.rows || []).length !== 2) fail('owner.accounts.rows must carry one row per account');
    if (owner.credentials?.count !== 1 || owner.credentials?.never_rotated !== 1) fail(`owner.credentials must reflect the packet's one never-rotated credential (got ${JSON.stringify(owner.credentials)})`);
    if (JSON.stringify(owner.people?.build) !== JSON.stringify(['founder', 'contractor'])) fail(`owner.people.build must come from the packet (got ${JSON.stringify(owner.people?.build)})`);
    if (owner.people?.restore_done !== 'no') fail(`owner.people.restore_done must come from the packet (got ${owner.people?.restore_done})`);
    if (owner.data?.personal !== 'user email addresses, for account login') fail('owner.data.personal must come from the packet');
    if ((owner.money?.monthly || []).length !== 2) fail('owner.money.monthly must carry one row per provider');
    if (owner.handover !== 'repo access, hosting account transfer, and the credential list above') fail(`owner.handover must come from custody.handover, not the top level (got ${JSON.stringify(owner.handover)})`);
    if (owner.notes !== 'First packet filled at intake; bus factor and the backlog-is-issues claim are open follow-ups.') fail('owner.notes must come from the packet');
  }

  const ownerPage = existsSync(join(tmp, 'OWNER.md')) ? readFileSync(join(tmp, 'OWNER.md'), 'utf8') : '';
  if (!/## What the owner told us/.test(ownerPage)) fail('OWNER.md must carry a "What the owner told us" section');
  if (!/Source repository \(GitHub\)/.test(ownerPage) || !/Hosting \(Fly\.io\)/.test(ownerPage)) fail('OWNER.md must name each account, one line each');
  if (!/founder, contractor/.test(ownerPage)) fail('OWNER.md must name who can build/deploy');
  if (!/Restore ever done: no/.test(ownerPage)) fail('OWNER.md must say whether restore was ever done');
  if (!/user email addresses, for account login/.test(ownerPage)) fail('OWNER.md must name the personal data the packet described');
  if (!/Fly\.io: ~\$25\/month/.test(ownerPage) || !/GitHub: \$0/.test(ownerPage)) fail('OWNER.md must name money per provider');
  if (!/Handover.*repo access, hosting account transfer/.test(ownerPage)) fail('OWNER.md must name the handover (custody.handover, not dropped)');
  if (!/Answered 2026-09-01 by founder, via owner-prompt/.test(ownerPage)) fail('OWNER.md must name the answered date/by/via');
  if (!/\*\*Credentials\*\* — 1 total\. Never rotated: 1/.test(ownerPage)) fail('OWNER.md must name the owner\'s own credential count and how many were never rotated');

  // unknowns render as "unknown", never dropped — a packet silent on custody.people
  // still produces a full owner block, roles reading "unknown", not omitted.
  const bare = buildOwnerBlock({ packet: 1, yardstick: 0, answered: { date: '2026-01-01', by: 'founder', via: 'owner-prompt' } });
  if (bare.people.build !== null || bare.people.restore_done !== 'unknown') fail(`a packet silent on custody.people must read build: null (unknown) and restore_done: unknown (got ${JSON.stringify(bare.people)})`);
  if (bare.data.personal !== 'unknown') fail(`a packet silent on custody.data must read personal: unknown (got ${bare.data.personal})`);
  const bareSection = renderOwnerSection(bare).join('\n');
  if (!/restore: unknown/.test(bareSection) || !/Restore ever done: unknown/.test(bareSection)) fail(`renderOwnerSection must render unknowns as the word "unknown", never drop them (got:\n${bareSection})`);
  // an owner who explicitly names nobody ([]): rendered "nobody", distinct from "unknown".
  const nobody = buildOwnerBlock({ packet: 1, yardstick: 0, answered: { date: '2026-01-01', by: 'founder', via: 'owner-prompt' }, custody: { people: { build: ['founder'], deploy: ['founder'], restore: [] } } });
  if (nobody.people.restore.length !== 0) fail('an explicit [] must stay [], distinct from an absent field (null)');
  const nobodySection = renderOwnerSection(nobody).join('\n');
  if (!/restore: nobody/.test(nobodySection)) fail(`an explicit empty role list must render "nobody" (got:\n${nobodySection})`);

  // the written packet: YAML block must itself parse back cleanly (yaml-min), under the key it is given
  let reparsed = null;
  try { reparsed = parseYaml(ownerYaml(owner)); } catch (e) { fail(`ownerYaml() output must be valid yaml-min YAML (${e.message})`); }
  if (reparsed && (!reparsed.owner || !reparsed.owner.credentials || reparsed.owner.credentials.count !== 1)) fail('the owner: YAML block must round-trip through the parser');
  if (parseYaml(ownerYaml(null, 'packet')).packet !== null) fail('a run with no packet writes packet: null');

  // a run with no packet: owner.yaml reads packet: null and OWNER.md says no packet yet
  const bareRun = join(HERE, 'tmp-owner-packet-none'); rmSync(bareRun, { recursive: true, force: true });
  copyFixtureFindings('notesbox', bareRun); copyFixtureScanners('notesbox', bareRun);
  try {
    execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), bareRun, '--write'], { stdio: 'pipe' });
    execFileSync(process.execPath, [join(ROOT, 'views', 'owner.mjs'), bareRun], { stdio: 'pipe' });
    const doc = parseYaml(readFileSync(join(bareRun, 'views', 'owner.yaml'), 'utf8'));
    if (!('packet' in doc) || doc.packet !== null) fail(`owner.yaml with no packet must read packet: null (got ${JSON.stringify(doc.packet)})`);
    if (!/## What the owner told us[\s\S]*No owner's packet yet/.test(readFileSync(join(bareRun, 'OWNER.md'), 'utf8'))) fail('OWNER.md with no packet must say no packet yet under "What the owner told us"');
  } catch (e) { fail(`measure and owner must succeed with no packet (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  rmSync(bareRun, { recursive: true, force: true });

  rmSync(tmp, { recursive: true, force: true });
}
