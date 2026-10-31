#!/usr/bin/env node
// release-notes.mjs — the consumer change rule and the release notes, read off git (#229).
//
// The change record is git (CLAUDE.md), so a release's notes are its commit messages.
// CONSUMERS.md states the contract and, in its ```surface block, the files that carry it.
// A commit that touches one of them carries a `Consumer:` git trailer saying what a
// consumer must change (`Consumer: none, <why>` when nothing), when its own tree already carries
// CONSUMERS.md: a commit cut from a base without the page owes none. The range is the commits
// since the newest v* tag reachable from HEAD, or, before the first tag, every commit
// reachable from HEAD that the commit adding CONSUMERS.md does not already hold. Merge
// commits are left out: what they bring in is read in the commits they merge.
//
// Usage:  node lib/release-notes.mjs [--check] [--since <ref>]
//   (no flag)  print the notes: the Consumer: trailers first, then every commit
//   --check    exit 1 naming each commit in the range that touches the surface with no
//              Consumer: trailer; a shallow history exits 1, never reads as clean
//   --since    start the range at <ref> instead of the newest v* tag
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from '../map/doctrine.mjs';

/** @typedef {{ sha: string, subject: string, files: string[], consumer: string[], contract?: boolean }} Commit */

// The files a consumer's contract rides on: the lines of CONSUMERS.md's ```surface block.
/** @param {string} page */
export function surfaceOf(page) {
  const m = page.match(/^```surface\n([\s\S]*?)^```/m);
  return m ? m[1].split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean) : [];
}

// The commits that touch the surface and carry no Consumer: trailer. A commit owes one only
// when its own tree carries CONSUMERS.md (`contract`): one cut from a base without the page
// could not have known the rule, the way a branch pushed before the page landed cannot (#232).
/** @param {Commit[]} commits @param {string[]} surface */
export function missingTrailers(commits, surface) {
  return commits.filter((c) => c.contract !== false && !c.consumer.length && c.files.some((f) => surface.includes(f)));
}

// A trailer that says nothing must change does not head the notes.
const saysNothing = (/** @type {string} */ v) => /^none\b/i.test(v);

// The notes: what a consumer must change, then every commit, newest first.
/** @param {Commit[]} commits @param {string|null} from */
export function compileNotes(commits, from) {
  const since = from ? `since ${from}` : 'since the consumer contract began';
  const must = commits.flatMap((c) => c.consumer.filter((v) => !saysNothing(v)).map((v) => `- ${v} (${c.sha.slice(0, 7)} ${c.subject})`));
  return [
    '## What a consumer must change', '',
    ...(must.length ? must : [`Nothing: no commit ${since} changes what CONSUMERS.md promises.`]), '',
    `## Commits ${since}`, '',
    ...(commits.length ? commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}`) : ['None.']), '',
  ].join('\n');
}

/** @param {string} cwd */
function gitIn(cwd) {
  return (/** @type {string[]} */ ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The range's commits, and where it starts (a tag, a ref, or null: the contract's start).
// whether a commit's own tree carries CONSUMERS.md
/** @param {string} cwd @param {string} sha */
const carriesPage = (cwd, sha) => spawnSync('git', ['cat-file', '-e', `${sha}:CONSUMERS.md`], { cwd, stdio: 'ignore' }).status === 0;

/** @param {string} cwd @param {string|null} since */
function readRange(cwd, since = null) {
  const git = gitIn(cwd);
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') throw new Error('the history is shallow: the range cannot be read (fetch full history)');
  let from = since;
  if (!from) { try { from = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD').trim(); } catch { from = null; } }
  let not;
  if (from) not = [from];
  else {
    const added = git('log', '--diff-filter=A', '--format=%H', '--', 'CONSUMERS.md').trim().split('\n').filter(Boolean).pop();
    if (!added) throw new Error('no commit adds CONSUMERS.md: there is no contract to read the range from');
    not = git('rev-list', '--parents', '-n', '1', added).trim().split(' ').slice(1);
  }
  const out = git('log', '--no-merges', '--no-renames', '--name-only', '--format=%x1e%H%x1f%s%x1f%(trailers:key=Consumer,valueonly,unfold,separator=%x1d)', 'HEAD', ...(not.length ? ['--not', ...not] : []));
  /** @type {Commit[]} */
  const commits = out.split('\x1e').filter((r) => r.trim()).map((r) => {
    const [head, ...rest] = r.split('\n');
    const [sha, subject, trailers] = head.split('\x1f');
    return { sha, subject, files: rest.map((l) => l.trim()).filter(Boolean), consumer: (trailers || '').split('\x1d').map((v) => v.trim()).filter(Boolean), contract: carriesPage(cwd, sha) };
  });
  return { commits, from };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const si = args.indexOf('--since');
  const since = si > -1 ? args[si + 1] : null;
  const unknown = args.filter((a, i) => !['--check', '--since'].includes(a) && !(si > -1 && i === si + 1));
  if (unknown.length || (si > -1 && !since)) { console.error('usage: node lib/release-notes.mjs [--check] [--since <ref>]'); process.exit(2); }
  let top, range;
  try {
    top = gitIn(process.cwd())('rev-parse', '--show-toplevel').trim();
    range = readRange(top, since);
  } catch (e) { console.error(`✗ release-notes: ${/** @type {Error} */ (e).message.trim()}`); process.exit(1); }
  const page = join(top, 'CONSUMERS.md');
  const surface = existsSync(page) ? surfaceOf(readFileSync(page, 'utf8')) : [];
  if (!surface.length) { console.error('✗ release-notes: CONSUMERS.md has no ```surface block, so the change rule reads nothing'); process.exit(1); }
  if (args.includes('--check')) {
    const missing = missingTrailers(range.commits, surface);
    const where = range.from ? `since ${range.from}` : 'since CONSUMERS.md was added';
    if (missing.length) {
      console.error(`✗ ${missing.length} commit(s) ${where} touch the consumer surface (CONSUMERS.md) with no Consumer: trailer:`);
      for (const c of missing) console.error(`  • ${c.sha.slice(0, 7)} ${c.subject}: ${c.files.filter((f) => surface.includes(f)).join(', ')}`);
      console.error('Add a `Consumer: <what a consumer must change>` trailer (`Consumer: none, <why>` when nothing) to the commit message.');
      process.exit(1);
    }
    const touched = range.commits.filter((c) => c.files.some((f) => surface.includes(f))).length;
    console.log(`✓ ${range.commits.length} commit(s) ${where}; ${touched} touch the consumer surface, each with its Consumer: trailer`);
  } else process.stdout.write(compileNotes(range.commits, range.from));
}
