// target-identity.mjs — the target a run measured, stated by the run itself (#265, D2 of #257).
//
// A run's `identity:` (map/SCHEMA.md §5a) names its target the same way on every machine: the
// repository (its origin remote, any userinfo stripped) and the path within it (`.` at the top
// level, `targets/flawed-webapp` for a subtree). It is never a local path: a local path
// describes the machine the run was drawn on, not the target, and two checkouts of one
// repository must read as one target. `assay start` writes it; the cross-run tally
// (views/improve/tally.mjs) reads it and refuses a run that states none, never guessing one
// from a directory name.
import { spawnSync } from 'node:child_process';
import { stripUserinfo } from './repo-census.mjs';

// a remote that is a local path (or a file:// URL) names the machine, never the target
const LOCAL_RE = /^(\/|\.{1,2}(\/|$)|~|file:|[A-Za-z]:[\\/])/;
const URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+\/./;   // scheme://host/…
const SCP_RE = /^[^\s/:@]+@[^\s/:]+:[^\s]+$/;              // user@host:owner/repo

const git = (dir, args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : null;
};

// The identity of the checkout holding dir, or null when it has none a run can state: not
// inside a git work tree, no origin remote, or an origin that is itself a local path. Git's
// own upward discovery is wanted here (a subtree target names the repository that holds it).
export function identityOfCheckout(dir) {
  if (git(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return null;
  const remote = git(dir, ['remote', 'get-url', 'origin']);
  if (!remote) return null;
  const repository = stripUserinfo(remote);
  if (repositoryProblem(repository)) return null;
  const prefix = (git(dir, ['rev-parse', '--show-prefix']) || '').replace(/\/+$/, '');
  return { repository, path: prefix || '.' };
}

function repositoryProblem(r) {
  if (typeof r !== 'string' || !r.trim()) return 'repository must be the target repository\'s remote (a non-empty string)';
  if (LOCAL_RE.test(r)) return `repository "${r}" is a local path: it describes the machine, not the target; state the repository's remote`;
  if (!URL_RE.test(r) && !SCP_RE.test(r)) return `repository "${r}" is not a repository remote (scheme://host/owner/repo or user@host:owner/repo)`;
  if (stripUserinfo(r) !== r) return `repository "${r}" carries userinfo: a credential never enters the run record`;
  return null;
}
function pathProblem(p) {
  if (typeof p !== 'string' || !p.trim()) return 'path must be the target\'s path within the repository (`.` at the top level)';
  if (p !== '.' && (/^[\\/]/.test(p) || /^[A-Za-z]:/.test(p) || p.split(/[\\/]/).some((s) => s === '..' || s === '.' || s === ''))) return `path "${p}" must be relative to the repository's top level, with no ".", ".." or empty segment (\`.\` alone for the top level)`;
  return null;
}

// The problems with an `identity:` value, [] when it is well formed.
export function identityProblems(id) {
  if (!id || typeof id !== 'object' || Array.isArray(id)) return ['identity: is a map of repository and path'];
  const out = [];
  for (const k of Object.keys(id)) if (k !== 'repository' && k !== 'path') out.push(`identity: unknown key "${k}" (repository, path)`);
  const r = repositoryProblem(id.repository); if (r) out.push(`identity.${r}`);
  const p = pathProblem(id.path); if (p) out.push(`identity.${p}`);
  return out;
}

// "<repository>" for the top level, "<repository>#<path>" for a subtree: how the tally prints
// a target and how `--target <run>=<identity>` states one.
export const identityString = (id) => (id.path === '.' ? id.repository : `${id.repository}#${id.path}`);
export function parseIdentity(s) {
  const str = String(s || '');
  const i = str.lastIndexOf('#');
  return i > -1 ? { repository: str.slice(0, i), path: str.slice(i + 1) } : { repository: str, path: '.' };
}

// The key two runs of one target share: one repository reached over https or ssh, with or
// without `.git`, is one target. Host case-folded; owner/repo kept as written.
export function identityKey(id) {
  let r = String(id.repository).trim();
  const scp = r.match(/^[^\s/:@]+@([^\s/:]+):(.+)$/);
  if (scp) r = `${scp[1]}/${scp[2]}`;
  else r = r.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  r = r.replace(/\/+$/, '').replace(/\.git$/, '');
  const slash = r.indexOf('/');
  r = slash > -1 ? r.slice(0, slash).toLowerCase().replace(/:\d+$/, '') + r.slice(slash) : r.toLowerCase();
  return `${r}#${id.path}`;
}
