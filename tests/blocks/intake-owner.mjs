// ── Intake: "What the owner told us" — facts from a repository's own packet,
// never a verdict (owner/PACKET.md, views/README.md) ─────────────────────────
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { buildOwnerBlock, ownerYaml, renderOwnerSection } from '../../views/intake.mjs';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'intake-owner';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('intake-owner: ' + m);

  // no packet at all: owner: null, and the plain "no packet yet" message.
  if (buildOwnerBlock(null) !== null) fail('buildOwnerBlock(null) must read null');
  const noneMd = renderOwnerSection(null).join('\n');
  if (!/No owner's packet yet: the owner prompt \(`assay\.mjs ask-owner`\) collects these\./.test(noneMd)) fail(`renderOwnerSection(null) must print the exact no-packet message (got: ${noneMd})`);

  // the public packet-valid fixture, end to end through the CLI.
  const tmp = join(HERE, 'tmp-intake-owner'); rmSync(tmp, { recursive: true, force: true });
  copyFixtureFindings('notesbox', tmp);
  copyFixtureScanners('notesbox', tmp);
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), tmp, '--packet', join(HERE, 'fixtures', 'packet-valid'), '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --packet must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }
  try { execFileSync(process.execPath, [join(ROOT, 'views', 'intake.mjs'), tmp], { stdio: 'pipe' }); }
  catch (e) { fail(`views/intake.mjs must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); }

  const intakeYaml = existsSync(join(tmp, 'views', 'intake.yaml')) ? parseYaml(readFileSync(join(tmp, 'views', 'intake.yaml'), 'utf8')) : null;
  const owner = intakeYaml && intakeYaml.owner;
  if (!owner) fail('views/intake.yaml must carry an owner: block when the run carries a packet');
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

  const intakePage = existsSync(join(tmp, 'INTAKE.md')) ? readFileSync(join(tmp, 'INTAKE.md'), 'utf8') : '';
  if (!/## What the owner told us/.test(intakePage)) fail('INTAKE.md must carry a "What the owner told us" section');
  if (!/Source repository \(GitHub\)/.test(intakePage) || !/Hosting \(Fly\.io\)/.test(intakePage)) fail('INTAKE.md must name each account, one line each');
  if (!/founder, contractor/.test(intakePage)) fail('INTAKE.md must name who can build/deploy');
  if (!/Restore ever done: no/.test(intakePage)) fail('INTAKE.md must say whether restore was ever done');
  if (!/user email addresses, for account login/.test(intakePage)) fail('INTAKE.md must name the personal data the packet described');
  if (!/Fly\.io: ~\$25\/month/.test(intakePage) || !/GitHub: \$0/.test(intakePage)) fail('INTAKE.md must name money per provider');
  if (!/Handover.*repo access, hosting account transfer/.test(intakePage)) fail('INTAKE.md must name the handover (custody.handover, not dropped)');
  if (!/Answered 2026-09-01 by founder, via owner-prompt/.test(intakePage)) fail('INTAKE.md must name the answered date/by/via');

  // d-credentials-enumerated: the owner's count informs the NOTE only, never the status.
  const credRow = intakeYaml && [...(intakeYaml.open || []), ...(intakeYaml.met || []), ...(intakeYaml.to_run || [])].find((r) => r.id === 'd-credentials-enumerated');
  if (!credRow) fail('d-credentials-enumerated must appear in the intake measurement');
  else if (!/\(the owner listed 1 credential\)$/.test(credRow.note)) fail(`d-credentials-enumerated's note must name the owner's own count, as a trailing note (got: ${credRow.note})`);

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

  // the written owner: YAML block must itself parse back cleanly (yaml-min).
  let reparsed = null;
  try { reparsed = parseYaml(ownerYaml(owner)); } catch (e) { fail(`ownerYaml() output must be valid yaml-min YAML (${e.message})`); }
  if (reparsed && (!reparsed.owner || !reparsed.owner.credentials || reparsed.owner.credentials.count !== 1)) fail('the owner: YAML block must round-trip through the parser');

  rmSync(tmp, { recursive: true, force: true });
}
