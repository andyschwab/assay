// ── gitleaks-not-a-secret: a declared digest or a fixture's placeholder is no secret (#306) ──
// A run read three hits as committed secrets and turned d-secrets-out-of-history met → unmet:
// sha256 file digests in a manifest keyed by file paths, and a test fixture's stub
// signature ("stub-signature" in base64). Neither is a credential. The adapter's rule set
// (map/scanners/adapters/gitleaks/allow.toml, named by --config) extends the tool's defaults with an
// allowlist for each property: a value that is a declared digest of a file, and a value in
// a test fixture path that decodes to a placeholder. A real key still fires, in a fixture
// or beside a digest: the true positives below are realistic planted values, assembled at
// runtime in a scratch directory outside this repository so no file here carries one
// (CLAUDE.md rule 6).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { runAdapterInstrument } from '../../map/start.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'gitleaks-not-a-secret';

// the placeholder regex is derived from the word list the rule set's comment names, never
// typed: the fixed base64 prefix of each word (lower, Capitalised, UPPER) and the set the
// character after it can take for any printable next byte or the end
export function placeholderRegex(words) {
  const variants = [...new Set(words.flatMap((w) => [w, w[0].toUpperCase() + w.slice(1), w.toUpperCase()]))];
  const alts = variants.map((w) => {
    const n = Buffer.byteLength(w), fixed = Math.floor((n * 8) / 6);
    const pre = Buffer.from(w).toString('base64').slice(0, fixed);
    if (n % 3 === 0) return pre;
    const set = new Set([Buffer.from(w).toString('base64')[fixed]]);
    for (let b = 0x20; b <= 0x7e; b++) set.add(Buffer.from(w + String.fromCharCode(b)).toString('base64')[fixed]);
    return `${pre}[${[...set].sort().join('')}]`;
  });
  return `^(?:${alts.join('|')})`;
}

export async function run() {
  const fail = (m) => negFailures.push('gitleaks-not-a-secret: ' + m);
  const adapter = loadAdapters().gitleaks;
  const args = (adapter?.run?.args || []).map(String);
  const cfg = args[args.indexOf('--config') + 1];
  const rulesFile = cfg && cfg.startsWith('{adapters}/') ? join(ROOT, 'map', 'scanners', 'adapters', cfg.slice('{adapters}/'.length)) : null;
  if (!rulesFile || !existsSync(rulesFile)) { fail(`the gitleaks adapter must run the config it vendors (--config {adapters}/<file>) and the file must be there (got ${JSON.stringify(args)})`); return; }
  const toml = readFileSync(rulesFile, 'utf8');
  const words = ((toml.match(/^#\s*placeholders:\s*(.+)$/m) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) fail('the rule set must name its placeholder words on a `# placeholders:` line');
  else if (!toml.includes(`'''${placeholderRegex(words)}'''`)) fail('the rule set\'s placeholder regex must be the one derived from its `# placeholders:` words (re-derive it with placeholderRegex in this block)');
  if (!/^\s*useDefault\s*=\s*true/m.test(toml)) fail('the rule set must extend the tool\'s default rules (useDefault = true), never replace them');

  if (spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status !== 0) return;   // the black-box half needs the binary (CI installs it)

  // values assembled at runtime: digests of public strings, a placeholder, and two realistic planted keys
  const hex = (s, alg = 'sha256') => createHash(alg).update(s).digest('hex');
  const stub = Buffer.from('stub-' + 'signature').toString('base64');
  const plantedB64 = ['q8ZtLw3R', 'vN2pXk7J', 'm4YbHc9T', 'sQ1eWd6F', 'u0Ga'].join('');   // random-shaped, decodes to no placeholder
  const plantedAws = 'AKIA' + 'Q3VZ7XKP2MNB4RT6';
  const scratch = mkdtempSync(join(tmpdir(), 'assay-gitleaks-not-a-secret-'));
  const files = {
    // false positives: a manifest of file digests, a hash-named digest, a fixture's stub signature
    'kit/manifest.json': `{\n  "src/auth/secret.ts": "${hex('a')}",\n  "lib/api_key.py": "${hex('b')}"\n}\n`,
    'kit/sums.yaml': `files:\n  src/auth/token.ts: ${hex('c')}\nsecret_sha1: ${hex('d', 'sha1')}\n`,
    'tests/fixtures/webhook.ts': `export const token = "${stub}";\n`,
    // true positives: a realistic key in a fixture path, an AWS-shaped key in a fixture, a hex
    // credential under a key that names neither a file nor a hash, the placeholder outside a fixture
    'tests/fixtures/real.ts': `export const token = "${plantedB64}";\n`,
    'tests/fixtures/aws.ts': `export const id = "${plantedAws}";\n`,
    'config/app.yaml': `token: ${hex('e')}\n`,
    'src/webhook.ts': `export const token = "${stub}";\n`,
  };
  const leaks = { must: ['tests/fixtures/real.ts:1', 'tests/fixtures/aws.ts:1', 'config/app.yaml:1', 'src/webhook.ts:1'], mustNot: ['kit/manifest.json:2', 'kit/manifest.json:3', 'kit/sums.yaml:2', 'kit/sums.yaml:3', 'tests/fixtures/webhook.ts:1'] };
  try {
    const target = join(scratch, 'target');
    for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(target, f)), { recursive: true }); writeFileSync(join(target, f), body); }
    if (spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).status === 0) { fail(`test setup: the temp directory ${tmpdir()} is inside a git repository`); return; }
    const out = join(scratch, 'run');
    const r = runAdapterInstrument('gitleaks', adapter, target, out, () => {});
    const findings = join(out, 'map', 'findings', 'gitleaks.yaml');
    const rows = existsSync(findings) ? readFileSync(findings, 'utf8') : '';
    if (r.status !== 'ran') { fail(`gitleaks must run over the scratch target (got ${JSON.stringify(r)})`); return; }
    const cited = (ev) => new RegExp(`"?${ev.replace(/[.]/g, '\\.')}"?`).test(rows);
    for (const ev of leaks.mustNot) if (cited(ev)) fail(`${ev} is a declared digest or a fixture's placeholder, and must not read as a secret`);
    for (const ev of leaks.must) if (!cited(ev)) fail(`${ev} holds neither property (a realistic key, or a placeholder outside a fixture path) and must still read as a secret`);
    if (rows.includes(plantedB64) || rows.includes(plantedAws)) fail('a secret row must never carry the matched value');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
