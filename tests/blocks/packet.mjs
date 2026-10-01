// ── packet: validate-packet (owner/PACKET.md) — strict, fail-closed ───────────
// A public invented packet fixture must validate clean; each negative fixture
// must be refused, FOR ITS OWN REASON (never merely "red") — the class of check
// that class of fixture exists to pin. The CLI is exercised directly (exit code
// + message), the way NEGATIVE above pins map/validate.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { loadYardstick } from '../../yardstick/measure.mjs';
import { validatePacket, loadPacket, secretShape, emailShape, badGitRef, unwrapChatReply, looksLikePersonName } from '../../yardstick/packet.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'packet';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('packet: ' + m);
  const reg = loadYardstick();
  const ids = reg.requirements.map((d) => d.id);

  const { doc: validDoc } = loadPacket(join(HERE, 'fixtures', 'packet-valid'));
  if (validatePacket(validDoc, { requirementIds: ids }).length) fail('the public packet-valid fixture must validate clean');

  const PACKET_NEGATIVE = [
    ['packet-secret-shaped', /looks like a secret value/],
    ['packet-email', /looks like an email address/],
    ['packet-unknown-claim', /is not a requirement in yardstick\/requirements\.yaml/],
    ['packet-claim-no-by', /state satisfied requires by/],
    ['packet-unknown-top-key', /unknown top-level key/],
    ['packet-pointer-unknown-key', /pointers\.deploy_docs: unknown pointer/],
    ['packet-pointer-bad-path', /pointers\.runbook: must be relative to the repo root, not absolute/],
    ['packet-pointer-bad-branch', /pointers\.default_branch: not a plausible git ref name/],
    ['packet-pointer-wrong-type', /pointers\.apps: must be a path \(a string\) or a list of paths/],
  ];
  for (const [dir, msgRe] of PACKET_NEGATIVE) {
    let stderr = '', code = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'packet.mjs'), join(HERE, 'negative', dir)], { stdio: 'pipe' }); }
    catch (e) { code = e.status; stderr = String(e.stderr || ''); }
    if (code !== 1) fail(`negative/${dir} must exit 1 (fail-closed) — got ${code}`);
    else if (!msgRe.test(stderr)) fail(`negative/${dir} must be refused for its own reason (expected ${msgRe}, got: ${stderr.trim().split('\n').slice(-1)[0]})`);
  }
  // bad YAML: one error, never a stack trace (the packet is data, parsed defensively)
  {
    let stderr = '', code = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'packet.mjs'), join(HERE, 'negative', 'packet-bad-yaml')], { stdio: 'pipe' }); }
    catch (e) { code = e.status; stderr = String(e.stderr || ''); }
    if (code !== 1) fail(`negative/packet-bad-yaml must exit 1 (got ${code})`);
    else if (!/not valid YAML/.test(stderr)) fail('negative/packet-bad-yaml must report one plain YAML error, never a raw stack trace');
    else if (/\bat\s+\S+\.mjs:\d+/.test(stderr)) fail('negative/packet-bad-yaml leaked a stack trace — a YAML the parser cannot read must be one error, not a trace');
  }

  // a reply still wrapped for chat: prose before and after, the actual YAML
  // fenced in a ```yaml code block. loadPacket must parse only the fence's
  // content, discarding the chatter — never executing or trusting it.
  if (unwrapChatReply('no fence here at all') !== 'no fence here at all') fail('unwrapChatReply with no fence must return the text unchanged');
  if (unwrapChatReply('prose\n```yaml\npacket: 1\n```\nmore prose').trim() !== 'packet: 1') fail('unwrapChatReply must take the first fenced block\'s content, discarding the chatter around it');
  {
    const tmp = join(HERE, 'tmp-packet-chat'); rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const raw = readFileSync(join(HERE, 'fixtures', 'packet-valid', 'manifest.yaml'), 'utf8');
    writeFileSync(join(tmp, 'manifest.yaml'), `Sure! Here is the completed packet:\n\n\`\`\`yaml\n${raw}\`\`\`\n\nLet me know if you need anything else.\n`);
    let chatDoc = null;
    try { ({ doc: chatDoc } = loadPacket(tmp)); } catch (e) { fail(`loadPacket must accept a reply still wrapped for chat (${e.message})`); }
    if (chatDoc && validatePacket(chatDoc, { requirementIds: ids }).length) fail('a chat-wrapped reply, once unwrapped, must validate exactly like the raw packet');
    if (chatDoc && chatDoc.repository !== 'example/notesbox') fail("the unwrapped packet must carry the fenced content's own fields, not the chatter");
    rmSync(tmp, { recursive: true, force: true });
  }

  // answered.by must be a role, never a person's name (owner/PACKET.md) — a role
  // PHRASE is fine (one of its words IS a role word); a bare name, or a name
  // followed by a parenthetical role, is refused with one plain line.
  {
    const roleBase = { packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' } };
    const wantsRole = (by) => validatePacket({ ...roleBase, answered: { ...roleBase.answered, by } }, { requirementIds: ids }).some((e) => e === 'answered.by: write a role (for example founder), not a name');
    if (!wantsRole('Dana Reyes')) fail('a bare two-word Title Case name ("Dana Reyes") must be refused as not a role');
    if (!wantsRole('Dana Reyes (founder)')) fail('a name followed by a parenthesized role ("Dana Reyes (founder)") must be refused as not a role');
    if (wantsRole('Lead Engineer')) fail('a role PHRASE containing a role word ("Lead Engineer") must still validate clean');
    if (wantsRole('founder')) fail('a plain role must still validate clean');
    if (wantsRole('co-founder')) fail('a role word with a hyphen must still validate clean');

    if (!looksLikePersonName('Dana Reyes') || !looksLikePersonName('Dana Reyes (founder)')) fail('looksLikePersonName must flag both name shapes directly');
    if (looksLikePersonName('Product Manager') || looksLikePersonName('founder') || looksLikePersonName('Jane')) fail('looksLikePersonName must not flag a role phrase, a plain role, or a single capitalized word');
  }

  // secret/email shape unit checks — the false-positive guards this class of
  // check depends on: a commit sha, a UUID, and a kebab-case id must all pass
  // clean, or every packet with one in it would be unusable.
  if (secretShape('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')) fail('a 40-char commit sha must not read as a secret (hex-only exemption)');
  if (secretShape('550e8400-e29b-41d4-a716-446655440000')) fail('a UUID must not read as a secret (hex-plus-dash exemption)');
  if (secretShape('d-this-requirement-does-not-exist-and-is-long')) fail('a long kebab-case id must not read as a secret (class-diversity gate)');
  if (!secretShape('sk-ThisLooksLikeARealSecretKeyValue123456')) fail('an sk-… value must read as a secret');
  if (secretShape('apps/web-app/docs/SHARED_LEADS_CONTRACT.md')) fail('a file path must not read as a secret (path-like exemption)');
  if (secretShape('see packages/Billing/src/InvoiceRenderer for the contract')) fail('a path inside prose must not read as a secret');
  if (secretShape('src/write-back/pipNotificationPublisher.spec.ts')) fail('a lowerCamelCase file name in a path must not read as a secret');
  if (!secretShape('Xk9aB2Qw/Lm7Pz3Rt8Vn1Yc5Hd2Jf6Gs4Kb9Wm')) fail('a base64-shaped secret containing a slash must still read as a secret');
  if (!secretShape('AKIAABCDEFGHIJKLMNOP')) fail('an AKIA… value must read as a secret');
  if (!secretShape('https://user:hunter2@example.com/db')) fail('a URL with an embedded password must read as a secret');
  if (!emailShape('alice@example.com')) fail('an email address must be flagged as one');
  if (emailShape('platform-eng')) fail('a role/handle with no @ must not be flagged as an email address');

  // structural unit checks not covered by a fixture: unknown decide.kind never
  // reachable here, but claim-id cross-check, state enum and not-applicable/reason
  // are exercised directly (fixtures cover the CLI path; these pin the library fn).
  if (!validatePacket({ packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' }, claims: [{ id: ids[0], state: 'not-applicable' }] }, { requirementIds: ids }).some((e) => /not-applicable requires reason/.test(e)))
    fail('a not-applicable claim with no reason must be refused');
  if (validatePacket({ packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' } }, { requirementIds: ids }).length)
    fail('a minimal packet with no claims/custody must still validate clean (every field beyond answered/packet/yardstick is optional)');
  if (!validatePacket({}, { requirementIds: ids }).some((e) => /answered: required/.test(e))) fail('a packet with no answered block must be refused');
  // a flow list on the line below its key is standard YAML an owner's AI writes; the parser reads it
  { const doc = parseYaml('people:\n  restore:\n    []\n  build: [founder]\n');
    if (!Array.isArray(doc.people.restore) || doc.people.restore.length !== 0 || doc.people.build[0] !== 'founder') fail('a flow list on the line below its key must parse'); }
  // a placeholder in a role list would count as a person who does not exist (bus factor)
  const withPlaceholder = { packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' }, custody: { people: { build: ['founder'], deploy: ['founder'], restore: ['unknown'] } } };
  if (!validatePacket(withPlaceholder, { requirementIds: ids }).some((e) => /custody\.people\.restore: holds "unknown", which is not a role/.test(e))) fail('a placeholder in a role list must be refused');
  if (validatePacket({ ...withPlaceholder, custody: { people: { build: ['founder'], deploy: ['founder'], restore: [] } } }, { requirementIds: ids }).length) fail('an empty role list ([] when nobody can) must validate');

  // pointers (owner/PACKET.md "Pointers"): optional, and every field optional
  const base = { packet: 1, yardstick: 0, answered: { date: '2026-09-01', by: 'founder', via: 'owner-prompt' } };
  if (validatePacket({ ...base, pointers: {} }, { requirementIds: ids }).length) fail('an empty pointers: map must validate clean');
  if (validatePacket({ ...base }, { requirementIds: ids }).length) fail('no pointers: at all must validate clean (the whole section is optional)');
  const fullPointers = {
    default_branch: 'main', apps: ['apps/web', 'services/worker'],
    architecture: ['docs/architecture.md', 'apps/web/docs/architecture.md', 'services/worker/docs/architecture.md'],
    agent_contract: 'CLAUDE.md', runbook: 'ops/RUNBOOK.md', evidence: 'ops/evidence',
    workflows: '.github/workflows', install: 'npm ci', build: 'npm run build', test: 'npm test', canon: 'packet/canon.yaml',
  };
  if (validatePacket({ ...base, pointers: fullPointers }, { requirementIds: ids }).length) fail('every documented pointer key, filled with a plausible value, must validate clean');
  if (!validatePacket({ ...base, pointers: { runbook: '../RUNBOOK.md' } }, { requirementIds: ids }).some((e) => /pointers\.runbook: must not contain "\.\."/.test(e))) fail('a pointer path containing ".." must be refused');
  if (!validatePacket({ ...base, pointers: { runbook: 'https://example.com/RUNBOOK.md' } }, { requirementIds: ids }).some((e) => /must be a path in the repository, not a URL/.test(e))) fail('a pointer path with a URL scheme must be refused');
  if (!validatePacket({ ...base, pointers: { architecture: [1, 2] } }, { requirementIds: ids }).some((e) => /pointers\.architecture\[0\]: must be a string/.test(e))) fail('a non-string entry in an architecture list must be refused');
  if (!validatePacket({ ...base, pointers: { install: 42 } }, { requirementIds: ids }).some((e) => /pointers\.install: must be a string/.test(e))) fail('a non-string command pointer must be refused');
  // commands are words, never path-checked (an npm command is not a repo-relative path)
  if (validatePacket({ ...base, pointers: { install: 'npm ci && npm run prepare' } }, { requirementIds: ids }).length) fail('a command pointer must never be path-checked');
  if (badGitRef('main')) fail('"main" must be a plausible git ref');
  if (badGitRef('release/2026-09')) fail('a slashed branch name must be a plausible git ref');
  if (!badGitRef('refs/../weird branch')) fail('a ref containing ".." and a space must not be a plausible git ref');
  if (!badGitRef('')) fail('an empty default_branch must not be a plausible git ref');
}
