// ── the reviewer's method is pinned by commit, and read at exactly that commit (#228) ──
// A judgment scanner whose method lives in another repository is the one dependency of a run
// assay would otherwise not pin: two runs at one engine pin could read two methods. Its adapter
// pins it through verified_against (CLAUDE.md rule 7) as a release and the commit that release
// is, so the method is a reviewed change here like a tool's pin. Pinned:
//   (a) the reviewer's adapter names its release and its commit (verified_against: { release,
//       commit }), the commit a full 40-hex sha;
//   (b) `assay lane deep-code-review` fills the seed with that commit and release: the session
//       fetches exactly that commit and checks it out, never clones a default branch, and checks
//       the release it read; a lane that reads its method at a commit is refused a seed when its
//       adapter names none;
//   (c) the run record names the method a row read (method: { release, commit }): `record`
//       writes it and keeps it, refuses a commit that is not a full sha, and `ingest` of the
//       reviewer's machine report records the adapter's pin on the row;
//   (d) validate refuses a run whose archived machine report says another release than the pin,
//       and a run record whose method is not the pin; a run drawn before the pin was recorded
//       (no method: on the row) validates with a warning.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneSeed } from '../../map/lane.mjs';
import { loadAdapters, verifiedPin } from '../../map/project.mjs';
import { setScannerRow } from '../../map/record.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'reviewer-pinned-by-commit';

const ID = 'deep-code-review';
const SHA = /^[0-9a-f]{40}$/;
const BASE = 'engine: block\nscanners:\n  deep-code-review:\n    status: skipped\n    reason: "not yet"\n';

export async function run() {
  const fail = (m) => negFailures.push(`${label}: ${m}`);
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  const adapters = loadAdapters();

  // (a)
  const pin = verifiedPin(adapters[ID]);
  if (!pin.release || !/^\d+\.\d+\.\d+$/.test(pin.release)) fail(`(a) adapters/${ID}.yaml verified_against names a dotted release (got ${JSON.stringify(pin.release)})`);
  if (!pin.commit || !SHA.test(pin.commit)) { fail(`(a) adapters/${ID}.yaml verified_against names the release's commit, a full sha (got ${JSON.stringify(pin.commit)})`); return; }

  // (b)
  let seed = null;
  try { seed = laneSeed(ID, { name: 'Demo', date: '2026-10-31', inputsDir: '/inputs' }, adapters); }
  catch (e) { fail(`(b) the ${ID} lane seeds (${e.message})`); }
  if (seed) {
    const spans = [...seed.prompt.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    if (!spans.some((s) => /^git fetch\b/.test(s) && s.includes('--depth 1') && s.endsWith(` ${pin.commit}`))) fail(`(b) the seed fetches exactly the pinned commit ${pin.commit} (git fetch --depth 1 <repository> <commit>)`);
    if (!spans.some((s) => /^git checkout -q FETCH_HEAD$/.test(s))) fail('(b) the seed checks out the fetched commit (git checkout -q FETCH_HEAD)');
    if (spans.some((s) => /^git clone\b/.test(s) && /deep-code-review/.test(s))) fail('(b) the seed never clones the reviewer at its default branch');
    if (!seed.prompt.includes(pin.release)) fail(`(b) the seed names the pinned release ${pin.release}, the VERSION the session checks it read`);
    if (/or later/.test(seed.prompt)) fail('(b) the seed reads the pinned method, never "or later"');
  }
  const unpinned = { ...adapters, [ID]: { ...adapters[ID], verified_against: pin.release } };
  if (!throws(() => laneSeed(ID, { name: 'Demo', inputsDir: '/inputs' }, unpinned))) fail('(b) a lane that reads its method at a commit is refused a seed when its adapter names no commit');

  // (c)
  const method = { release: pin.release, commit: pin.commit };
  let once = '';
  try { once = setScannerRow(BASE, ID, 'ran', { method }).text; } catch (e) { fail(`(c) record writes the method a row read (${e.message})`); }
  const row = (t) => { try { return parseYaml(t).scanners[ID]; } catch { return null; } };
  if (JSON.stringify(row(once)?.method) !== JSON.stringify(method)) fail(`(c) record writes method: { release, commit } on the row (got ${JSON.stringify(row(once))})`);
  let again = '';
  try { again = setScannerRow(once, ID, 'ran', { model: 'a-model' }).text; } catch { /* checked below */ }
  if (JSON.stringify(row(again)?.method) !== JSON.stringify(method)) fail('(c) a later record of the row keeps the method it read');
  if (!throws(() => setScannerRow(BASE, ID, 'ran', { method: { release: pin.release, commit: pin.commit.slice(0, 7) } }))) fail('(c) a method commit that is not a full sha is refused');
  if (!throws(() => setScannerRow(BASE, ID, 'skipped', { reason: 'x', method }))) fail('(c) a method is refused on a row that did not run');

  // (c) ingest, (d) validate, over a copy of a stored run that carries the reviewer's report
  const scratch = mkdtempSync(join(tmpdir(), 'assay-reviewer-pin-'));
  try {
    const dir = join(scratch, 'run');
    cpSync(join(HERE, 'fixtures', 'notesbox'), dir, { recursive: true });
    const assay = (args) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), ...args], { encoding: 'utf8' });
    const rawFile = join(dir, 'map', 'raw', `${ID}.yaml`);
    const report = join(scratch, 'report.yaml');
    copyFileSync(rawFile, report);
    const reportText = readFileSync(report, 'utf8');
    const scannersFile = join(dir, 'map', 'scanners.yaml');

    // drawn before the pin was recorded: validates, warning that the row names no method
    const before = assay(['validate', dir]);
    if (before.status !== 0) fail(`(d) a run whose record names no method still validates (got ${before.status}: ${before.stderr.trim().split('\n').slice(0, 3).join(' ')})`);
    else if (!/names no method/.test(before.stdout + before.stderr)) fail('(d) a run whose record names no method warns that it does not');

    const ing = assay(['ingest', dir, '--tool', ID, '--raw', report, '--model', 'a-model']);
    if (ing.status !== 0) fail(`(c) ingest of the reviewer's report succeeds (got ${ing.status}: ${ing.stderr.trim()})`);
    const recorded = row(readFileSync(scannersFile, 'utf8'))?.method;
    if (JSON.stringify(recorded) !== JSON.stringify(method)) fail(`(c) ingest records the adapter's pin on the reviewer's row (got ${JSON.stringify(recorded)})`);
    const pinned = assay(['validate', dir]);
    if (pinned.status !== 0) fail(`(d) a run read at the pin validates (got ${pinned.status}: ${pinned.stderr.trim().split('\n').slice(0, 3).join(' ')})`);

    // the archived report says another release
    writeFileSync(rawFile, reportText.replace(/skill_version: "[^"]*"/, 'skill_version: "9.9.9"'));
    const other = assay(['validate', dir]);
    if (other.status === 0 || !/skill_version 9\.9\.9/.test(other.stdout + other.stderr)) fail(`(d) validate refuses a report whose skill_version is not the pinned release (got ${other.status})`);
    writeFileSync(rawFile, reportText);

    // the run record names another commit
    const recText = readFileSync(scannersFile, 'utf8');
    writeFileSync(scannersFile, recText.replace(pin.commit, 'f'.repeat(40)));
    const drift = assay(['validate', dir]);
    if (drift.status === 0 || !/method/.test(drift.stdout + drift.stderr)) fail(`(d) validate refuses a run record whose method is not the pin (got ${drift.status})`);
    writeFileSync(scannersFile, recText);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
