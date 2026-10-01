// ── ask-owner: the {{WHAT_WE_FOUND}} marker, with and without a run ───────────
// owner/ask-owner.mjs's pre-fill: plain words, never a local filesystem path, and a
// steward's --found file can replace the whole block.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildWhatWeFound, render, MARKER, NOTHING_YET, creditSentence, buildFoundOverride, stripLeadingFrontmatter } from '../../owner/ask-owner.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'ask-owner';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('ask-owner: ' + m);
  if (buildWhatWeFound(null) !== NOTHING_YET) fail('with no run, the block must read "Nothing yet: ask everything."');
  if (buildWhatWeFound(join(HERE, 'fixtures', 'ask-owner-run')) === NOTHING_YET) fail('the public ask-owner-run fixture carries real signal — the block must not fall back to "ask everything"');
  const found = buildWhatWeFound(join(HERE, 'fixtures', 'ask-owner-run'));
  if (!/example\/notesbox/.test(found) || !/a1b2c3d4/.test(found)) fail('the block must name the repository and commit from the run\'s own packet');
  if (!/the code uses 4 credentials/.test(found) || !/traced where 3 of them are held/.test(found) || !/confirm the other 1, and where each one lives/.test(found)) fail(`the credential line must be a plain, singular/plural-correct sentence (got: ${found})`);
  if (!/email send/.test(found) || /email-send/.test(found) || /internal-write/.test(found) || /internal write/.test(found)) fail('the block must turn an external channel slug into words (hyphens to spaces), name only external channels, and never an internal one');
  if (!/sends, writes or publishes to 1 place outside itself/.test(found)) fail(`the external-systems line must count the places in plain words, singular said right (got: ${found})`);
  if (!/personal data/i.test(found) || /\d+ of \d+/.test(found.split('\n').find((l) => /personal data/i.test(l)) || '')) fail('the block must name a census-declared personal-data store in plain words, never a "met of N" census count');

  const withRun = render(join(HERE, 'fixtures', 'ask-owner-run'));
  if (withRun.includes(MARKER)) fail('render() must replace the marker, never leave it in place');
  if (!/example\/notesbox/.test(withRun)) fail('render() with a run must fold buildWhatWeFound into the template');
  const withoutRun = render(null);
  if (withoutRun.includes(MARKER) || !withoutRun.includes(NOTHING_YET)) fail('render() with no run must replace the marker with "Nothing yet: ask everything."');

  // credentials: met === of reads as "all traced", asking only about an unlisted one;
  // a single credential reads singular
  {
    const allTraced = creditSentence(4, 4);
    if (!/the code uses 4 credentials/.test(allTraced) || !/all 4 of them are held/.test(allTraced) || !/confirm whether any credential is in use that the code does not show/.test(allTraced)) fail(`met === of must read as fully traced, asking only about an unlisted credential (got: ${allTraced})`);
    const singular = creditSentence(1, 1);
    if (!/the code uses 1 credential;/.test(singular)) fail(`a single credential must read singular, not "1 credentials" (got: ${singular})`);
  }

  // repository: never target.path (a local filesystem path), the remote when present,
  // and just the commit when only that is known
  const remoteRunDir = join(HERE, 'fixtures', 'ask-owner-run-remote');
  const foundRemote = buildWhatWeFound(remoteRunDir);
  if (/very-local-checkout-path-should-never-print/.test(foundRemote)) fail('target.path must never be printed, even when repo-census.json carries it');
  if (!/https:\/\/github\.com\/example\/notesbox\.git/.test(foundRemote)) fail(`target.remote must be used (with userinfo stripped) when present (got: ${foundRemote})`);
  if (/x-access-token|not-a-real-token/.test(foundRemote)) fail('a remote URL\'s embedded userinfo must be stripped before it is shown to an owner');

  const commitOnlyRunDir = join(HERE, 'fixtures', 'ask-owner-run-commit-only');
  const foundCommitOnly = buildWhatWeFound(commitOnlyRunDir);
  if (/another-local-checkout-path-should-never-print/.test(foundCommitOnly)) fail('target.path must never be printed for the commit-only case either');
  if (!/^- The commit we read: c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff\.$/m.test(foundCommitOnly)) fail(`with only a commit known, the line must read exactly "The commit we read: <sha>." (got: ${foundCommitOnly})`);

  // --found <file>: replaces the block wholesale, strips a leading frontmatter
  // block, and is swept for the same shapes validate-packet refuses
  if (stripLeadingFrontmatter('no frontmatter here\nsecond line') !== 'no frontmatter here\nsecond line') fail('text with no leading frontmatter block must be returned unchanged');
  const good = buildFoundOverride(join(HERE, 'fixtures', 'found-steward', 'found-good.md'));
  if (/^---/.test(good) || /author: steward/.test(good)) fail('a leading YAML frontmatter block on a --found file must be stripped before insertion');
  if (!/^- Repository: example\/notesbox/.test(good)) fail('a --found file\'s body (after stripping frontmatter and trimming blank edges) must be inserted verbatim, unindented');
  const renderedFound = render(join(HERE, 'fixtures', 'ask-owner-run'), good);
  if (!/from the steward's own read/.test(renderedFound) || /Nothing yet: ask everything/.test(renderedFound)) fail('render() with a --found override must use it in place of the auto block entirely');

  let threw = null;
  try { buildFoundOverride(join(HERE, 'fixtures', 'found-steward', 'found-secret.md')); } catch (e) { threw = e; }
  if (!threw || !/looks like a secret value/.test(threw.message)) fail(`--found must refuse a secret-shaped string, reusing the packet sweep (got: ${threw && threw.message})`);
  threw = null;
  try { buildFoundOverride(join(HERE, 'fixtures', 'found-steward', 'found-braces.md')); } catch (e) { threw = e; }
  if (!threw || !/contains "\{\{"/.test(threw.message)) fail(`--found must refuse a file containing "{{" (no nested markers) (got: ${threw && threw.message})`);

  // the CLI end to end: --found on the command line
  const cliOut = execFileSync(process.execPath, [join(ROOT, 'owner', 'ask-owner.mjs'), '--found', join(HERE, 'fixtures', 'found-steward', 'found-good.md')], { encoding: 'utf8' });
  if (!/from the steward's own read/.test(cliOut)) fail('the ask-owner CLI must honor --found end to end');
  let cliCode = 0, cliErr = '';
  try { execFileSync(process.execPath, [join(ROOT, 'owner', 'ask-owner.mjs'), '--found', join(HERE, 'fixtures', 'found-steward', 'found-secret.md')], { stdio: 'pipe' }); }
  catch (e) { cliCode = e.status; cliErr = String(e.stderr || ''); }
  if (cliCode !== 1 || !/looks like a secret value/.test(cliErr)) fail(`the ask-owner CLI must refuse a secret-shaped --found file, exit 1, one plain line (got ${cliCode}/${cliErr})`);
}
