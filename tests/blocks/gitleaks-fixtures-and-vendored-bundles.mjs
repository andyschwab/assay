// ── gitleaks: a fixture's stub at any depth, and a vendored build artifact, are no secret (#316) ──
// Two false positives survived #306's allowlists on real runs: a "generic API key" in a test
// fixture under `<package>/test/fixtures/…` whose value is a base64 stub, and eighteen hits of a
// provider-token rule inside a vendored, minified design-system bundle. Pinned, over a scratch
// target assembled at runtime outside this repository (CLAUDE.md rule 6), every planted value
// inert and built from pieces so no file here carries one:
//   (a) the fixture-path rule reads test/, tests/, __tests__/ and fixtures/ at any depth, and a
//       stub whose decoded text holds a placeholder word anywhere, not only at its start, is
//       allowed there (the second regex in allow.toml, derived from its `# placeholders:` words);
//   (b) a bare provider token in a vendored build artifact (a minified or bundled file under a
//       vendored or design-system directory) is allowed by the adapter's ingest.allow rule, and
//       recorded as a secret-allowed fact naming the rule, never dropped;
//   (c) the true-positive twins still fire: a realistic key in a test file, the same token in the
//       repository's own source and in its own minified build (not vendored), a credential-named
//       key in a vendored bundle (a credential context), and the token in a vendored file that is
//       not a build output;
//   (d) no row and no archived report carries a matched value, and the archive records which
//       rule allowed a hit, so a re-ingest of it decides the same.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runAdapterInstrument } from '../../map/start.mjs';
import { loadAdapters } from '../../map/project.mjs';
import { convert } from '../../map/ingest.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'gitleaks-fixtures-and-vendored-bundles';

// for each placeholder word (lower, Capitalised, UPPER) and each of the three byte alignments,
// the base64 characters the word's bytes alone decide: unanchored, they find the word anywhere
// in the decoded text
export function placeholderAnywhereRegex(words) {
  const variants = [...new Set(words.flatMap((w) => [w, w[0].toUpperCase() + w.slice(1), w.toUpperCase()]))];
  const needles = new Set();
  for (const w of variants) {
    const n = Buffer.byteLength(w);
    for (let k = 0; k < 3; k++) {
      const enc = Buffer.concat([Buffer.alloc(k), Buffer.from(w), Buffer.alloc(2)]).toString('base64');
      let out = '';
      for (let j = 0; j * 6 + 6 <= 8 * (k + n); j++) if (j * 6 >= 8 * k) out += enc[j];
      needles.add(out);
    }
  }
  return [...needles].sort().join('|');
}

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ` + m);
  const adapter = loadAdapters().gitleaks;
  const toml = readFileSync(join(ROOT, 'map', 'scanners', 'adapters', 'gitleaks', 'allow.toml'), 'utf8');
  const words = ((toml.match(/^#\s*placeholders:\s*(.+)$/m) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || !toml.includes(`'''${placeholderAnywhereRegex(words)}'''`)) fail('(a) allow.toml must carry the unanchored placeholder regex derived from its `# placeholders:` words (re-derive it with placeholderAnywhereRegex in this block)');
  const pathRe = (toml.match(/^paths = \[\n\s*'''(.+)''',/m) || [])[1];
  if (!pathRe) fail('(a) allow.toml\'s fixture rule must name its paths');
  else for (const p of ['test/x.ts', 'pkg/test/fixtures/x.json', 'a/b/tests/x.ts', 'web/__tests__/x.ts', 'pkg/src/fixtures/x.ts'])
    if (!new RegExp(pathRe.replace(/^\(\?i\)/, ''), 'i').test(p)) fail(`(a) the fixture-path rule must read ${p}`);
  const allow = (adapter?.ingest?.allow || []).find((a) => a.id === 'vendored-build-artifact');
  if (!allow) fail('(b) the gitleaks adapter must declare the vendored-build-artifact allow rule (ingest.allow)');

  if (spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status !== 0) return;   // the black-box half needs the binary (CI installs it)

  const b64 = (s) => Buffer.from(s).toString('base64');
  const token = ['xo', 'xb-', '7302948165', '20', '-', '5918', '2736', '40819', '-', 'Qm7Lx2Kp9Vr4', 'Tz8Nw3Hc6Yd1'].join('');
  const realB64 = ['q8ZtLw3R', 'vN2pXk7J', 'm4YbHc9T', 'sQ1eWd6F', 'u0Ga'].join('');
  const minified = (body) => `!function(e){${'var a=1;'.repeat(40)}${body}}();\n`;
  const files = {
    // (a) false positives: a stub in a fixture at each depth and spelling, the word not at the start
    'pkg/test/fixtures/sig.ts': `export const token = "${b64('{"sig":"stub"}')}";\n`,
    'packages/web/__tests__/hook.ts': `export const token = "${b64('stub-' + 'signature')}";\n`,
    'svc/src/fixtures/webhook.ts': `export const token = "${b64('x-fake-' + 'sig')}";\n`,
    'tests/unit/auth.ts': `export const token = "${b64('test-' + 'token')}";\n`,
    // (b) false positive: bare tokens embedded in a vendored, minified design-system bundle
    'public/vendor/design-system/ds.min.js': minified(`n.icons={a:"${token}"};n.k=["${token}"];`),
    // (c) true positives
    'pkg/test/fixtures/real.ts': `export const token = "${realB64}";\n`,
    'src/config.ts': `export const slack = "${token}";\n`,
    'vendor/design-system/app.bundle.js': minified(`var apiKey = "${realB64}";`),
    'vendor/lib/util.js': `module.exports = "${token}";\n`,
    'public/app.min.js': minified(`n.k={a:"${token}"};`),
  };
  const scratch = mkdtempSync(join(tmpdir(), 'assay-gitleaks-bundles-'));
  try {
    const target = join(scratch, 'target');
    for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(target, f)), { recursive: true }); writeFileSync(join(target, f), body); }
    if (spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).status === 0) { fail(`test setup: the temp directory ${tmpdir()} is inside a git repository`); return; }
    const out = join(scratch, 'run');
    const r = runAdapterInstrument('gitleaks', adapter, target, out, () => {});
    if (r.status !== 'ran') { fail(`gitleaks must run over the scratch target (got ${JSON.stringify(r)})`); return; }
    const text = readFileSync(join(out, 'map', 'findings', 'gitleaks.yaml'), 'utf8');
    const blocks = text.split(/\n(?=- id: )/).filter((b) => /^- id: /.test(b.trim()) || /\n- id: /.test('\n' + b));
    const rowsAt = (file) => blocks.filter((b) => b.includes(`"${file}:`) || b.includes(`${file}:`));
    const gapAt = (file) => rowsAt(file).some((b) => /polarity: gap/.test(b) && /native_category: "secret"/.test(b));
    const allowedAt = (file) => rowsAt(file).some((b) => /polarity: fact/.test(b) && /native_category: "secret-allowed"/.test(b) && /vendored-build-artifact/.test(b));

    for (const f of ['pkg/test/fixtures/sig.ts', 'packages/web/__tests__/hook.ts', 'svc/src/fixtures/webhook.ts', 'tests/unit/auth.ts'])
      if (gapAt(f) || rowsAt(f).length) fail(`(a) ${f} holds a placeholder in a test or fixture path and must not read as a secret`);
    if (gapAt('public/vendor/design-system/ds.min.js')) fail('(b) a bare token in a vendored, minified bundle must not read as a secret');
    if (!allowedAt('public/vendor/design-system/ds.min.js')) fail('(b) the allowed bundle hits must be recorded as secret-allowed facts naming the rule');
    for (const f of ['pkg/test/fixtures/real.ts', 'src/config.ts', 'vendor/design-system/app.bundle.js', 'vendor/lib/util.js', 'public/app.min.js'])
      if (!gapAt(f)) fail(`(c) ${f} must still read as a secret (a realistic key in a test file, the repository's own source, a credential context in a bundle, a vendored file that is no build output, or the repository's own minified build)`);

    // (d) never the value; the archive names the rule, and re-ingesting it decides the same
    const raw = readFileSync(join(out, 'map', 'raw', 'gitleaks.json'), 'utf8');
    if ([text, raw].some((t) => t.includes(token) || t.includes(realB64))) fail('(d) no row and no archived report may carry a matched value');
    if (!raw.includes('vendored-build-artifact')) fail('(d) the archived report records the rule that allowed a hit (Allowed)');
    const env = JSON.parse(raw);
    const again = convert('gitleaks', raw, Number(env.exit ?? 1), null);
    const allowedAgain = again.filter((x) => x.native_category === 'secret-allowed').length;
    const allowedFirst = blocks.filter((b) => /native_category: "secret-allowed"/.test(b)).length;
    if (!allowedFirst || allowedAgain !== allowedFirst) fail(`(d) a re-ingest of the archive must allow the same hits (first ${allowedFirst}, again ${allowedAgain})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
