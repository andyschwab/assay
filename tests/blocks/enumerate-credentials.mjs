// ── credentials in any case, and secret-named constants set apart (#292) ──
// enumerate's secrets population read only UPPER_SNAKE names, so a known-answer web app's two
// hardcoded credentials (a camelCase key in a settings object, a token table) went unlisted and the
// credential row could not close over them; and a credential-suffixed array of key names
// (TRIAGE_KEYS) was listed as a secret every lane had to triage out. Over
// tests/enumerate-fixture/credentials:
//  1. recall: a camelCase, lowerCamel or snake_case credential name assigned a literal, a table
//     headed by a credential word (tokenTable), and an object holding a value of secret shape are
//     listed as secrets, each with the line that names it;
//  2. precision: a credential-suffixed name assigned an array of identifier strings (spreads of
//     other such lists included) is a secret-named constant, not a secret, with its constAt; a
//     template interpolation of it is no environment read, and a test artifact naming it declares
//     nothing;
//  3. no credential: a name that only ends in a credential word's letters (monkey), a bare plural
//     list (tokens), a bare credential word holding an object (secret), an empty password, a name
//     read from the environment (apiKey), a name in a comment or a string, and an object whose
//     secret-shaped value is already a named credential (relay, whose relayPassword is listed).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-credentials';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-credentials: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'credentials');
  const pops = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--json'], { encoding: 'utf8' })).populations;
  const secrets = new Map(pops.secrets.map((m) => [m.member, m]));
  const consts = new Map(pops.secretConstants.map((m) => [m.member, m]));
  const names = (m) => [...m.keys()].join(', ') || 'none';

  // (1) recall, each with the line that names it
  const want = {
    backupApiKey: 'config/settings.mjs:4',
    tokenTable: 'lib/db.mjs:2',
    clientSecret: 'lib/client.mjs:2',
    authToken: 'lib/client.mjs:3',
    db_password: 'app/store.py:2',
    upstreams: 'lib/upstreams.mjs:3',
    relayPassword: 'lib/upstreams.mjs:8',
  };
  for (const [name, at] of Object.entries(want)) {
    const m = secrets.get(name);
    if (!m) fail(`${name} is a hardcoded credential: enumerate must list it as a secret (secrets: ${names(secrets)})`);
    else if (!m.evidence.includes(at)) fail(`${name} must cite the line that names it, ${at} (got ${m.evidence.join(', ')})`);
  }

  // (2) precision: identifier lists are constants, never secrets
  const constAt = { FIELD_KEYS: 'lib/keys.mjs:2', ALL_KEYS: 'lib/keys.mjs:3', cacheKeys: 'lib/keys.mjs:4' };
  for (const [name, at] of Object.entries(constAt)) {
    if (secrets.has(name)) fail(`${name} holds a list of identifier strings, not a credential: it must not be a secret`);
    const m = consts.get(name);
    if (!m) fail(`${name} must be listed under secretConstants, not dropped (secretConstants: ${names(consts)})`);
    else if (!m.note.includes(`at ${at},`)) fail(`${name}'s note must name where it is assigned the list, ${at} (got ${m.note})`);
  }

  // (3) no credential
  for (const name of ['monkey', 'tokens', 'password', 'apiKey', 'passwordHint', 'sessionToken', 'signingKey', 'clientKey', 'secret', 'settings', 'relay']) {
    if (secrets.has(name) || consts.has(name)) fail(`${name} is no credential here: enumerate must not list it (secrets: ${names(secrets)}; secretConstants: ${names(consts)})`);
  }
  const cs = secrets.get('clientSecret');
  if (cs && cs.evidence.some((e) => e === 'lib/client.mjs:11')) fail('a credential name in a comment is not an assignment: clientSecret must not cite lib/client.mjs:11');
}
