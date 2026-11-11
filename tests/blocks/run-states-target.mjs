// ── a run states its target: its repository and the path within it, never a local path (#265) ──
// `assay start` writes the target's identity into the run record (map/scanners.yaml
// `identity: { repository, path }`, map/SCHEMA.md §5a) and the day it drew the run (`drawn:`),
// so the cross-run tally counts runs of one target once without guessing from a directory name.
// Pinned:
//  1. identityOfCheckout reads the origin remote with its userinfo stripped, and the path
//     within the repository (`.` at its top level); a checkout with no origin, or whose origin
//     is a local path, has none;
//  2. start over a subtree of a checkout writes identity: and drawn:, and the run validates;
//  3. validate refuses an identity that is a local path, carries userinfo, or has an absolute
//     or `..` path, and a drawn: that is not a day; a run without either still validates;
//  4. one repository over https and ssh, with or without .git, is one key; two paths are two.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { identityOfCheckout, identityKey } from '../../map/target-identity.mjs';
import { scannersPath } from '../../lib/run-layout.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'run-states-target';

export async function run() {
  const fail = (m) => negFailures.push('run-states-target: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-run-states-target-'));
  const node = (...a) => spawnSync(process.execPath, a, { encoding: 'utf8' });
  try {
    // (1) the identity a checkout states
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'services', 'beta'), { recursive: true });
    writeFileSync(join(repo, 'services', 'beta', 'README.md'), '# beta\n');
    const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
    git(repo, 'init', '-q');
    const none = identityOfCheckout(repo);
    if (none) fail(`a checkout with no origin states no identity (got ${JSON.stringify(none)})`);
    git(repo, 'remote', 'add', 'origin', 'https://someone:planted-not-a-token@example.org/fixtures/mono.git');
    const top = identityOfCheckout(repo);
    if (!top || top.repository !== 'https://example.org/fixtures/mono.git' || top.path !== '.') fail(`the top level states its origin, userinfo stripped, at path . (got ${JSON.stringify(top)})`);
    const sub = identityOfCheckout(join(repo, 'services', 'beta'));
    if (!sub || sub.path !== 'services/beta') fail(`a subtree states its path within the repository (got ${JSON.stringify(sub)})`);
    git(repo, 'remote', 'set-url', 'origin', '/srv/mirrors/mono.git');
    if (identityOfCheckout(repo)) fail('an origin that is a local path describes the machine: no identity');
    git(repo, 'remote', 'set-url', 'origin', 'https://example.org/fixtures/mono.git');

    // (2) start over the subtree writes identity: and drawn:
    const out = join(tmp, 'run');
    const s = node(join(ROOT, 'assay.mjs'), 'start', '--out', out, join(repo, 'services', 'beta'));
    if (s.status !== 0) fail(`start over a subtree must succeed (exit ${s.status}): ${(s.stdout + s.stderr).trim().split('\n').slice(-3).join(' | ')}`);
    else {
      const m = parseYaml(readFileSync(scannersPath(out), 'utf8'));
      if (!m.identity || m.identity.repository !== 'https://example.org/fixtures/mono.git' || m.identity.path !== 'services/beta') fail(`start writes the target's identity: { repository, path } (got ${JSON.stringify(m.identity)})`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.drawn))) fail(`start writes drawn:, the day it drew the run (got ${JSON.stringify(m.drawn)})`);
      if (JSON.stringify(m.identity || {}).includes(tmp)) fail('identity: is never a local path');
    }

    // (3) validate: the shape of what a run states
    const base = join(tmp, 'base');
    cpSync(join(HERE, 'candidates-runs', 'alpha-1'), base, { recursive: true });
    const text = readFileSync(scannersPath(base), 'utf8');
    const validate = () => node(join(ROOT, 'assay.mjs'), 'validate', base);
    const withRecord = (identity, drawn = '"2026-01-10"') => writeFileSync(scannersPath(base), text.replace(/identity:\n {2}repository: .*\n {2}path: .*\n/, identity).replace(/drawn: .*\n/, drawn === null ? '' : `drawn: ${drawn}\n`));
    if (validate().status !== 0) fail('a run stating a well-formed identity and day validates');
    const bad = [
      ['a local path', 'identity:\n  repository: "/home/someone/src/alpha"\n  path: "."\n', /local path/],
      ['userinfo', 'identity:\n  repository: "https://someone:planted@example.org/fixtures/alpha"\n  path: "."\n', /userinfo/],
      ['an absolute path', 'identity:\n  repository: "https://example.org/fixtures/alpha"\n  path: "/services/beta"\n', /relative/],
      ['a .. path', 'identity:\n  repository: "https://example.org/fixtures/alpha"\n  path: "services/../beta"\n', /relative/],
    ];
    for (const [what, id, re] of bad) {
      withRecord(id);
      const v = validate();
      if (v.status === 0 || !re.test(v.stdout + v.stderr)) fail(`validate refuses an identity with ${what} (exit ${v.status})`);
    }
    withRecord('identity:\n  repository: "https://example.org/fixtures/alpha"\n  path: "."\n', '"January"');
    if (validate().status === 0) fail('validate refuses a drawn: that is not YYYY-MM-DD');
    withRecord('', null);
    if (validate().status !== 0) fail('a run that states neither identity: nor drawn: (drawn before the fields) still validates');

    // (4) one repository, however its remote is spelled, is one key; two paths are two
    const k = (repository, path = '.') => identityKey({ repository, path });
    const one = [k('https://example.org/fixtures/alpha.git'), k('git@example.org:fixtures/alpha'), k('https://Example.org/fixtures/alpha/'), k('ssh://example.org/fixtures/alpha.git')];
    if (new Set(one).size !== 1) fail(`one repository over https and ssh is one key (got ${[...new Set(one)].join(' | ')})`);
    if (k('https://example.org/fixtures/mono', 'services/beta') === k('https://example.org/fixtures/mono', 'services/gamma')) fail('two paths within one repository are two targets');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
